<template>
  <section ref="stage" class="ink-stage" aria-label="Scroll controlled ink section transition">
    <div class="ink-viewport">
      <canvas ref="canvas" class="ink-canvas" :class="{ 'is-ready': ready }" aria-hidden="true"></canvas>
      <div v-if="loading" class="ink-status">Preparing ink transition</div>
      <div v-else-if="failed" class="ink-status">WebGL transition unavailable</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'

const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const failed = ref(false)
const ready = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let material: THREE.ShaderMaterial | null = null
let geometry: THREE.PlaneGeometry | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let animationFrame = 0
let lightTexture: THREE.CanvasTexture | null = null
let darkTexture: THREE.CanvasTexture | null = null

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uLight;
  uniform sampler2D uDark;
  uniform float uProgress;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = p * 2.07 + vec2(8.13, 4.71);
      amplitude *= 0.5;
    }
    return value;
  }

  float dropletField(vec2 uv, float front) {
    vec2 gridSize = vec2(17.0, 12.0);
    vec2 cell = floor(uv * gridSize);
    float result = 0.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = cell + vec2(float(x), float(y));
        float seed = hash21(neighbor + 19.7);
        vec2 jitter = vec2(hash21(neighbor + 2.4), hash21(neighbor + 8.8));
        vec2 center = (neighbor + 0.15 + jitter * 0.7) / gridSize;
        vec2 delta = uv - center;
        delta.x *= uResolution.x / max(uResolution.y, 1.0);
        float radius = mix(0.004, 0.021, seed * seed);
        float circle = 1.0 - smoothstep(radius * 0.55, radius, length(delta));
        float distanceAhead = front - uv.y;
        float ahead = 1.0 - smoothstep(0.025, 0.23, distanceAhead);
        float detached = smoothstep(0.035, 0.075, distanceAhead);
        result = max(result, circle * ahead * detached * step(0.58, seed));
      }
    }
    return result;
  }

  void main() {
    vec2 uv = vUv;
    vec3 lightScene = texture2D(uLight, uv).rgb;
    vec3 darkScene = texture2D(uDark, uv).rgb;

    float broad = fbm(vec2(uv.x * 3.15, uv.y * 0.82 + 4.0));
    float fingers = fbm(vec2(uv.x * 10.5 + 13.0, uv.y * 2.1));
    float fine = noise(vec2(uv.x * 41.0, uv.y * 7.0));
    float tallFingerNoise = fbm(vec2(uv.x * 7.2 + 9.4, 2.7));
    float narrowFingerNoise = noise(vec2(uv.x * 18.0 + 3.1, 7.6));
    float tallFingers = pow(smoothstep(0.47, 0.78, tallFingerNoise), 1.7) * 0.27;
    float narrowFingers = pow(smoothstep(0.56, 0.84, narrowFingerNoise), 2.4) * 0.16;
    float front = 1.24 - uProgress * 1.48;
    float organicFront = front
      + (broad - 0.5) * 0.31
      + (fingers - 0.5) * 0.13
      + (fine - 0.5) * 0.022
      + tallFingers
      + narrowFingers;

    float ink = smoothstep(organicFront - 0.012, organicFront + 0.012, uv.y);
    ink = max(ink, dropletField(uv, organicFront));
    ink *= smoothstep(0.0, 0.035, uProgress);
    ink = mix(ink, 1.0, smoothstep(0.965, 1.0, uProgress));

    float edgeDistance = abs(uv.y - organicFront);
    float wetEdge = 1.0 - smoothstep(0.0, 0.025, edgeDistance);
    vec3 color = mix(lightScene, darkScene, ink);
    color += wetEdge * ink * vec3(0.018, 0.014, 0.006);

    float grain = hash21(gl_FragCoord.xy + floor(uTime * 9.0)) - 0.5;
    color += grain * 0.008;
    gl_FragColor = vec4(color, 1.0);
  }
`

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function configureTexture(texture: THREE.CanvasTexture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number) {
  let size = startSize
  do {
    context.font = `300 ${size}px Arial, sans-serif`
    size -= 2
  } while (context.measureText(text).width > maxWidth && size > 20)
}

function createLightScene() {
  const surface = document.createElement('canvas')
  surface.width = 1920
  surface.height = 1080
  const context = surface.getContext('2d')!
  context.fillStyle = '#edf5de'
  context.fillRect(0, 0, surface.width, surface.height)
  context.fillStyle = '#536052'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const copy = "EVERY MODE LEAVES A TRACE. THE NEXT ONE BEGINS BELOW."
  fitText(context, copy, 1180, 31)
  context.fillText(copy, surface.width / 2, surface.height / 2)
  return configureTexture(new THREE.CanvasTexture(surface))
}

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = path
  })
}

async function createDarkScene() {
  const subject = await loadImage('/images/fisherman 1.png')
  const surface = document.createElement('canvas')
  surface.width = 1920
  surface.height = 1080
  const context = surface.getContext('2d')!

  const gradient = context.createRadialGradient(960, 490, 80, 960, 540, 1160)
  gradient.addColorStop(0, '#18352c')
  gradient.addColorStop(0.55, '#0a1c17')
  gradient.addColorStop(1, '#030b08')
  context.fillStyle = gradient
  context.fillRect(0, 0, surface.width, surface.height)

  context.globalAlpha = 0.14
  context.strokeStyle = '#9cac8b'
  context.lineWidth = 2
  for (let index = 0; index < 70; index += 1) {
    const x = (index * 277) % 1980 - 30
    const y = (index * 149) % 1120 - 20
    context.beginPath()
    context.moveTo(x, y + 90)
    context.quadraticCurveTo(x + 45, y + 5, x + 96, y + 75)
    context.stroke()
  }
  context.globalAlpha = 1

  context.fillStyle = '#d6a93a'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '400 116px Georgia, serif'
  context.fillText('EXTREME FISHING', 960, 175)
  context.font = '600 15px Arial, sans-serif'
  context.letterSpacing = '5px'
  context.fillText('KEVIN.AI — NEXT PROFESSION', 960, 240)

  const targetHeight = 805
  const targetWidth = subject.width * (targetHeight / subject.height)
  context.drawImage(subject, 960 - targetWidth / 2, 275, targetWidth, targetHeight)
  return configureTexture(new THREE.CanvasTexture(surface))
}

function resize() {
  if (!renderer || !material) return
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  renderer.setSize(width, height, false)
  material.uniforms.uResolution.value.set(width, height)
  updateFromScroll()
}

function updateFromScroll() {
  if (!stage.value || !material) return
  const rect = stage.value.getBoundingClientRect()
  const distance = Math.max(stage.value.offsetHeight - window.innerHeight, 1)
  material.uniforms.uProgress.value = clamp01(-rect.top / distance)
}

function render(time: number) {
  animationFrame = requestAnimationFrame(render)
  if (!renderer || !material || !scene || !camera) return
  material.uniforms.uTime.value = time / 1000
  renderer.render(scene, camera)
}

onMounted(async () => {
  if (!canvas.value) return
  try {
    lightTexture = createLightScene()
    darkTexture = await createDarkScene()
    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value,
      antialias: false,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uLight: { value: lightTexture },
        uDark: { value: darkTexture },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
    })
    geometry = new THREE.PlaneGeometry(2, 2)
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2)
    camera.position.z = 1
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', updateFromScroll, { passive: true })
    document.getElementById('app')?.addEventListener('scroll', updateFromScroll, { passive: true })
    loading.value = false
    ready.value = true
    animationFrame = requestAnimationFrame(render)
  } catch (error) {
    console.error('Ink transition failed:', error)
    loading.value = false
    failed.value = true
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', resize)
  window.removeEventListener('scroll', updateFromScroll)
  document.getElementById('app')?.removeEventListener('scroll', updateFromScroll)
  lightTexture?.dispose()
  darkTexture?.dispose()
  geometry?.dispose()
  material?.dispose()
  scene?.clear()
  renderer?.dispose()
})
</script>

<style scoped>
.ink-stage {
  position: relative;
  width: 100%;
  height: 430vh;
  background: #edf5de;
}

.ink-viewport {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #edf5de;
}

.ink-canvas {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0;
}

.ink-canvas.is-ready {
  opacity: 1;
}

.ink-status {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  color: #536052;
  font: 600 0.65rem/1 Arial, sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .ink-stage {
    height: 500vh;
  }
}
</style>
