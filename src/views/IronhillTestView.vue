<template>
  <div ref="scrollRoot" class="fx-page">
    <section ref="stage" class="fx-stage" aria-label="Transisi ruang gym menuju kabin pesawat">
      <div ref="viewport" class="fx-viewport">
        <canvas
          ref="gymCanvas"
          class="fx-scene fx-scene--gym"
          aria-label="Kevin berolahraga di ruang gym"
        ></canvas>
        <canvas
          ref="canvas"
          class="fx-canvas"
          aria-label="Background kabin pesawat muncul mengikuti scroll"
        ></canvas>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import Lenis from 'lenis'

const scrollRoot = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const gymCanvas = ref<HTMLCanvasElement | null>(null)

let lenis: Lenis | null = null
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let geometry: THREE.PlaneGeometry | null = null
let material: THREE.ShaderMaterial | null = null
let mesh: THREE.Mesh | null = null
let cabinTexture: THREE.Texture | null = null
let animationFrame = 0
let targetProgress = 0
let renderedProgress = 0
let renderedMaskProgress = 0
let currentGymFrame = -1
let animationStartTime = 0

const GYM_FRAME_COUNT = 97
const GYM_SEQUENCE_VERSION = 'new-gym-sequence-20260723'
const gymFrames: HTMLImageElement[] = []

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uCabinTexture;
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform vec2 uCabinImageResolution;
  uniform float uSpread;
  uniform float uParallaxOffset;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 point) {
    vec3 point3 = vec3(point.xy, 1.0);
    return fract(sin(dot(point3, vec3(37.1, 61.7, 12.4))) * 3758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local *= local * (3.0 - 2.0 * local);

    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    value += noise(point) * 0.5;
    value += noise(point * 2.0) * 0.25;
    value += noise(point * 4.0) * 0.125;
    return value;
  }

  vec2 coverUv(vec2 uv, vec2 viewportSize, vec2 imageSize) {
    float viewportAspect = viewportSize.x / viewportSize.y;
    float imageAspect = imageSize.x / imageSize.y;
    vec2 scale = vec2(
      min(viewportAspect / imageAspect, 1.0),
      min(imageAspect / viewportAspect, 1.0)
    );
    return uv * scale + (1.0 - scale) * 0.5;
  }

  void main() {
    vec2 cabinUv = coverUv(vUv, uResolution, uCabinImageResolution);
    // Sisakan overscan vertikal agar parallax tidak pernah menyentuh atau
    // melewati baris pixel paling bawah texture.
    cabinUv.y = 0.5 + (cabinUv.y - 0.5) * 0.9;
    cabinUv.y += uParallaxOffset;
    vec4 cabin = texture2D(uCabinTexture, cabinUv);

    float aspect = uResolution.x / uResolution.y;
    vec2 centeredUv = (vUv - 0.5) * vec2(aspect, 1.0);
    // Pertahankan arah mask asli: kabin terisi dari bawah ke atas sehingga
    // tepi organik/bercak selalu berada di bagian atas layer kabin.
    float dissolveEdge = vUv.y - uProgress * 1.2;
    vec2 noiseUv = centeredUv * 15.0;
    float liquidTime = uTime * 0.105;
    vec2 liquidWarp = vec2(
      noise(noiseUv * 0.23 + vec2(liquidTime, -liquidTime * 0.4)),
      noise(noiseUv * 0.23 + vec2(-liquidTime * 0.35, liquidTime * 0.75))
    ) - 0.5;
    float noiseValue = fbm(
      noiseUv
      + liquidWarp * 1.35
      + vec2(liquidTime * 0.65, -liquidTime * 0.28)
    );
    float distanceToFront = dissolveEdge + noiseValue * uSpread;
    float pixelSize = 1.0 / max(uResolution.y, 1.0);
    float alpha = 1.0 - smoothstep(-pixelSize, pixelSize, distanceToFront);

    gl_FragColor = vec4(cabin.rgb, cabin.a * alpha);
  }
`

function gymFramePath(index: number) {
  return `/frames/gym-sequence/frame_${String(index + 1).padStart(4, '0')}.webp?v=${GYM_SEQUENCE_VERSION}`
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.clearRect(0, 0, width, height)
  context.drawImage(
    image,
    (width - drawWidth) * 0.5,
    (height - drawHeight) * 0.5,
    drawWidth,
    drawHeight,
  )
}

function updateGymFrame(progress: number, force = false) {
  if (!gymCanvas.value) return
  const frameIndex = Math.min(GYM_FRAME_COUNT - 1, Math.round(clamp01(progress) * (GYM_FRAME_COUNT - 1)))
  const image = gymFrames[frameIndex]
  if (!image?.complete || !image.naturalWidth) return
  if (!force && frameIndex === currentGymFrame) return

  currentGymFrame = frameIndex
  drawCover(
    gymCanvas.value.getContext('2d')!,
    image,
    gymCanvas.value.width,
    gymCanvas.value.height,
  )
}

function syncProgress() {
  if (!stage.value || !scrollRoot.value) return
  const maxScroll = Math.max(stage.value.offsetHeight - window.innerHeight, 1)
  const scroll = lenis?.scroll ?? scrollRoot.value.scrollTop
  targetProgress = clamp01(scroll / maxScroll)
}

function resize() {
  if (!renderer || !material || !viewport.value || !gymCanvas.value) return
  const width = Math.max(viewport.value.clientWidth, 1)
  const height = Math.max(viewport.value.clientHeight, 1)
  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)
  material.uniforms.uResolution.value.set(width, height)
  gymCanvas.value.width = Math.round(width * pixelRatio)
  gymCanvas.value.height = Math.round(height * pixelRatio)
  syncProgress()
  updateGymFrame(renderedProgress, true)
}

function render(time: number) {
  if (!renderer || !scene || !camera || !material) return
  syncProgress()
  const sequenceSmoothing = reducedMotion ? 1 : 0.12
  const maskSmoothing = reducedMotion ? 1 : 0.055
  renderedProgress += (targetProgress - renderedProgress) * sequenceSmoothing
  renderedMaskProgress += (targetProgress - renderedMaskProgress) * maskSmoothing
  updateGymFrame(renderedProgress)

  // Sequence berjalan sejak awal. Bercak baru dimulai pada pertengahan
  // sequence. Kurva ease-in menahan kenaikannya agar baru penuh tepat
  // ketika sequence mencapai frame terakhir.
  const transitionProgress = clamp01((renderedMaskProgress - 0.5) / 0.5)
  const easedTransitionProgress = Math.pow(transitionProgress, 1.7)
  material.uniforms.uProgress.value = easedTransitionProgress * 1.2
  material.uniforms.uParallaxOffset.value = -0.045 * easedTransitionProgress
  material.uniforms.uTime.value = reducedMotion ? 0 : (time - animationStartTime) / 1000
  renderer.render(scene, camera)
}

onMounted(async () => {
  if (!scrollRoot.value || !stage.value || !viewport.value || !canvas.value || !gymCanvas.value) return
  scrollRoot.value.scrollTop = 0

  const firstGymFrame = new Image()
  firstGymFrame.src = gymFramePath(0)
  await firstGymFrame.decode()
  gymFrames.push(firstGymFrame)
  for (let index = 1; index < GYM_FRAME_COUNT; index += 1) {
    const image = new Image()
    image.src = gymFramePath(index)
    gymFrames.push(image)
  }

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 1
  renderer = new THREE.WebGLRenderer({
    canvas: canvas.value,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace

  cabinTexture = await new THREE.TextureLoader().loadAsync('/images/background kabin.png')
  cabinTexture.colorSpace = THREE.SRGBColorSpace
  cabinTexture.minFilter = THREE.LinearFilter
  cabinTexture.magFilter = THREE.LinearFilter
  cabinTexture.generateMipmaps = false
  const cabinImage = cabinTexture.image as HTMLImageElement

  geometry = new THREE.PlaneGeometry(2, 2)
  material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uCabinTexture: { value: cabinTexture },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCabinImageResolution: {
        value: new THREE.Vector2(
          cabinImage.naturalWidth || cabinImage.width,
          cabinImage.naturalHeight || cabinImage.height,
        ),
      },
      uSpread: { value: 0.5 },
      uParallaxOffset: { value: 0 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  lenis = new Lenis({
    wrapper: scrollRoot.value,
    content: stage.value,
    duration: reducedMotion ? 0.001 : 1.05,
    smoothWheel: !reducedMotion,
    touchMultiplier: 1,
  })

  const raf = (time: number) => {
    lenis?.raf(time)
    render(time)
    animationFrame = requestAnimationFrame(raf)
  }

  resize()
  animationStartTime = performance.now()
  animationFrame = requestAnimationFrame(raf)
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', resize)
  lenis?.destroy()
  lenis = null
  if (mesh && scene) scene.remove(mesh)
  cabinTexture?.dispose()
  geometry?.dispose()
  material?.dispose()
  renderer?.dispose()
  renderer?.forceContextLoss()
  scene?.clear()
  cabinTexture = null
  gymFrames.length = 0
  renderer = null
  material = null
  geometry = null
  mesh = null
  scene = null
  camera = null
})
</script>

<style scoped>
.fx-page {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  min-width: 320px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #050505;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.55) rgba(0, 0, 0, 0.22);
}

.fx-stage {
  position: relative;
  width: 100%;
  height: 185vh;
  height: 185svh;
  background: #050505;
}

.fx-viewport {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #050505;
}

.fx-scene,
.fx-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.fx-scene--gym {
  z-index: 0;
  object-fit: cover;
  object-position: 50% 50%;
}

.fx-canvas {
  z-index: 1;
  pointer-events: none;
}

@media (max-width: 700px) {
  .fx-stage {
    height: 185vh;
    height: 185svh;
  }

  .fx-scene--gym {
    object-position: 50% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fx-page {
    scroll-behavior: auto;
  }
}
</style>
