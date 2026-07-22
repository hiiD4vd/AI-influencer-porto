<template>
  <section v-show="active" class="vibe-intro-transition" aria-hidden="true">
    <canvas
      ref="etchedCanvas"
      class="vibe-intro-etched"
      :style="{ clipPath: etchedClipPath, opacity: etchedOpacity }"
    ></canvas>
    <canvas ref="boundaryCanvas" class="vibe-intro-mask"></canvas>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'

const props = defineProps<{ progress: number; active: boolean }>()

const boundaryCanvas = ref<HTMLCanvasElement | null>(null)
const etchedCanvas = ref<HTMLCanvasElement | null>(null)
const etchedClipPath = ref('polygon(0 100%, 100% 100%, 100% 100%, 0 100%)')

const etchedOpacity = computed(() => {
  const amount = Math.max(0, Math.min(1, props.progress))
  if (amount <= 0.58) return '1'
  return String(Math.max(0, 1 - (amount - 0.58) / 0.36))
})

let renderer: THREE.WebGLRenderer | null = null
let material: THREE.ShaderMaterial | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let geometry: THREE.PlaneGeometry | null = null
let sourceImage: HTMLImageElement | null = null
let animationFrame = 0
let resizeTimer = 0
let disposed = false
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const boundaryFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uProgress;
  uniform float uTime;
  uniform float uIdleMotion;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  void main() {
    float pixelSize = 3.0;
    vec2 pixelUv = floor(vUv * uResolution / pixelSize) * pixelSize / uResolution;
    float motionTime = uTime * uIdleMotion;

    float wave = (
      sin(vUv.x * 13.82 + motionTime * 0.80) * 0.035
      + sin(vUv.x * 32.04 - motionTime * 0.45) * 0.014
      + sin(vUv.x * 69.00 + motionTime * 0.30) * 0.006
    );
    float steppedInput = sin(vUv.x * 127.0 + motionTime * 0.90) * 0.0045;
    float columns = floor(steppedInput / 0.003 + 0.5) * 0.003;

    // Keep the animated front slightly ahead of the straight DOM section
    // edge. The extra overlap hides that edge behind the authored wave instead
    // of exposing a flat white seam between sections.
    float baseFront = min(1.12, uProgress + 0.055);
    // Geometry uses exactly the same deterministic waves as the CSS clip.
    // Noise remains available for pixel texture, but never shifts the actual
    // boundary independently and therefore cannot open a white/black seam.
    float sectionFront = baseFront + wave + columns;
    float edgeDistance = abs(vUv.y - sectionFront);

    vec2 sparkleCell = floor(vUv * uResolution / 2.0);
    float sparkleA = hash(sparkleCell);
    float sparkleB = hash(floor((vUv * uResolution + vec2(1.0, 3.0)) / 3.0) + 31.7);
    float denseSparkle = max(sparkleA, sparkleB * 0.94);

    float contourCell = hash(vec2(floor(gl_FragCoord.x / 3.0), 19.0));
    float contourPulse = 0.92 + 0.08 * sin(
      uTime * 1.35 + floor(gl_FragCoord.x / 3.0) * 0.17
    ) * uIdleMotion;
    float coreWidth = mix(0.0035, 0.0065, contourCell);
    float core = 1.0 - smoothstep(coreWidth, coreWidth + 0.0045, edgeDistance);
    float halo = 1.0 - smoothstep(0.004, 0.020, edgeDistance);
    float dust = smoothstep(0.20, 0.58, denseSparkle) * (
      1.0 - smoothstep(0.012, 0.040, edgeDistance)
    );
    float contourAlpha = clamp((core * 0.98 + halo * 0.54 + dust * 0.62) * contourPulse, 0.0, 1.0);

    gl_FragColor = vec4(vec3(1.0), contourAlpha);
  }
`

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstepNumber(start: number, end: number, value: number) {
  const amount = clamp01((value - start) / Math.max(0.0001, end - start))
  return amount * amount * (3 - 2 * amount)
}

function updateEtchedClip(time: number) {
  const amount = clamp01(props.progress)
  // Must match the +0.055 lead in the WebGL boundary above. Both the etched
  // image and its luminous contour move 5.5vh ahead of the DOM edge.
  const baseY = (1 - amount) * 100 - 5.5
  const seconds = reducedMotion ? 0 : time * 0.001
  const points: string[] = []
  const segments = 48

  for (let index = 0; index <= segments; index += 1) {
    const x = index / segments
    const largeWave = Math.sin(x * 13.82 + seconds * 0.80) * 3.5
    const mediumWave = Math.sin(x * 32.04 - seconds * 0.45) * 1.4
    const smallWave = Math.sin(x * 69.0 + seconds * 0.30) * 0.6
    const steppedDetail = Math.round(
      Math.sin(x * 127.0 + seconds * 0.9) * 0.45 / 0.3,
    ) * 0.3
    // A sub-halo overlap hides antialiasing only; both layers otherwise share
    // the exact same wave, so no large black ridge or white gap is necessary.
    const overlap = 0.45
    const y = Math.max(-8, Math.min(108, baseY - largeWave - mediumWave - smallWave - steppedDetail - overlap))
    points.push(`${(x * 100).toFixed(2)}% ${y.toFixed(2)}%`)
  }

  points.push('100% 100%', '0 100%')
  etchedClipPath.value = `polygon(${points.join(', ')})`
}

function drawEtchedFrame() {
  const canvas = etchedCanvas.value
  const image = sourceImage
  if (!canvas || !image || disposed) return

  const width = Math.max(1, Math.round(window.innerWidth))
  const height = Math.max(1, Math.round(window.innerHeight))
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  const drawX = (width - drawWidth) / 2
  const drawY = (height - drawHeight) / 2

  context.clearRect(0, 0, width, height)
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

  const source = context.getImageData(0, 0, width, height)
  const output = context.createImageData(width, height)
  const pixelCount = width * height
  const luminance = new Float32Array(pixelCount)
  const smoothed = new Float32Array(pixelCount)
  const gradientX = new Float32Array(pixelCount)
  const gradientY = new Float32Array(pixelCount)
  const magnitude = new Float32Array(pixelCount)

  for (let index = 0; index < pixelCount; index += 1) {
    const sourceIndex = index * 4
    luminance[index] = (
      source.data[sourceIndex] * 0.299
      + source.data[sourceIndex + 1] * 0.587
      + source.data[sourceIndex + 2] * 0.114
    )

    const structure = Math.round(Math.pow(luminance[index] / 255, 1.08) * 22)
    output.data[sourceIndex] = structure
    output.data[sourceIndex + 1] = structure
    output.data[sourceIndex + 2] = structure
    output.data[sourceIndex + 3] = 255
  }

  // A light 3x3 Gaussian pass suppresses compression grain before edge
  // detection. This prevents the dense maze-like texture seen previously.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      smoothed[index] = (
        luminance[index - width - 1]
        + luminance[index - width] * 2
        + luminance[index - width + 1]
        + luminance[index - 1] * 2
        + luminance[index] * 4
        + luminance[index + 1] * 2
        + luminance[index + width - 1]
        + luminance[index + width] * 2
        + luminance[index + width + 1]
      ) / 16
    }
  }

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const index = y * width + x
      const topLeft = smoothed[index - width - 1]
      const top = smoothed[index - width]
      const topRight = smoothed[index - width + 1]
      const left = smoothed[index - 1]
      const right = smoothed[index + 1]
      const bottomLeft = smoothed[index + width - 1]
      const bottom = smoothed[index + width]
      const bottomRight = smoothed[index + width + 1]

      const gx = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight
      const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
      gradientX[index] = gx
      gradientY[index] = gy
      magnitude[index] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  // Non-maximum suppression keeps one bright core pixel instead of turning
  // every contrast change into a thick white band.
  for (let y = 3; y < height - 3; y += 1) {
    for (let x = 3; x < width - 3; x += 1) {
      const index = y * width + x
      const currentMagnitude = magnitude[index]
      let angle = Math.atan2(gradientY[index], gradientX[index]) * 180 / Math.PI
      if (angle < 0) angle += 180

      let previousMagnitude: number
      let nextMagnitude: number
      if (angle < 22.5 || angle >= 157.5) {
        previousMagnitude = magnitude[index - 1]
        nextMagnitude = magnitude[index + 1]
      } else if (angle < 67.5) {
        previousMagnitude = magnitude[index - width + 1]
        nextMagnitude = magnitude[index + width - 1]
      } else if (angle < 112.5) {
        previousMagnitude = magnitude[index - width]
        nextMagnitude = magnitude[index + width]
      } else {
        previousMagnitude = magnitude[index - width - 1]
        nextMagnitude = magnitude[index + width + 1]
      }

      const isCore = currentMagnitude >= previousMagnitude && currentMagnitude >= nextMagnitude
      const core = isCore ? smoothstepNumber(22, 115, currentMagnitude) : 0
      const halo = smoothstepNumber(10, 82, currentMagnitude) * 0.30
      const structure = Math.pow(luminance[index] / 255, 1.08) * 22
      const value = Math.min(255, Math.round(structure + halo * 72 + core * 205))
      const outputIndex = index * 4

      output.data[outputIndex] = value
      output.data[outputIndex + 1] = value
      output.data[outputIndex + 2] = value
    }
  }

  context.putImageData(output, 0, 0)
}

function scheduleEtchedRedraw() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(drawEtchedFrame, 100)
}

function resize() {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer?.setSize(width, height, false)
  material?.uniforms.uResolution.value.set(width, height)
  if (sourceImage) scheduleEtchedRedraw()
}

function render(time: number) {
  animationFrame = requestAnimationFrame(render)
  if (!props.active || !renderer || !material || !scene || !camera) return
  updateEtchedClip(time)
  material.uniforms.uTime.value = time * 0.001
  renderer.render(scene, camera)
}

function loadSourceImage() {
  const image = new Image()
  image.decoding = 'async'
  image.src = '/frames/hero/frame_0001.jpg'
  image.onload = () => {
    if (disposed) return
    sourceImage = image
    drawEtchedFrame()
  }
  image.onerror = () => {
    console.error('Unable to load the first Vibe image-sequence frame for the outline transition.')
  }
}

watch(() => props.progress, progress => {
  if (material) material.uniforms.uProgress.value = clamp01(progress)
}, { immediate: true, flush: 'sync' })

onMounted(() => {
  if (!boundaryCanvas.value) return
  disposed = false
  renderer = new THREE.WebGLRenderer({
    canvas: boundaryCanvas.value,
    alpha: true,
    antialias: false,
  })
  renderer.setClearColor(0x000000, 0)
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  geometry = new THREE.PlaneGeometry(2, 2)
  material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: boundaryFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new THREE.Vector2() },
      uProgress: { value: clamp01(props.progress) },
      uTime: { value: 0 },
      uIdleMotion: {
        value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1,
      },
    },
  })
  scene.add(new THREE.Mesh(geometry, material))

  resize()
  loadSourceImage()
  window.addEventListener('resize', resize)
  animationFrame = requestAnimationFrame(render)
})

onUnmounted(() => {
  disposed = true
  cancelAnimationFrame(animationFrame)
  window.clearTimeout(resizeTimer)
  window.removeEventListener('resize', resize)
  geometry?.dispose()
  material?.dispose()
  scene?.clear()
  renderer?.dispose()
  sourceImage = null
})
</script>

<style scoped>
.vibe-intro-transition {
  position: fixed;
  inset: 0;
  z-index: 11;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.vibe-intro-etched,
.vibe-intro-mask {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.vibe-intro-etched {
  z-index: 0;
  will-change: clip-path, opacity;
}

.vibe-intro-mask {
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .vibe-intro-mask {
    display: none;
  }
}
</style>
