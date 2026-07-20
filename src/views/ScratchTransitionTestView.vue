<template>
  <div class="transition-page">
    <main ref="scrollStage" class="shader-test">
      <div class="shader-viewport">
        <img class="shader-fallback" src="/frames/hero/frame_0259.jpg" alt="" aria-hidden="true" />
        <canvas
          ref="canvas"
          class="shader-canvas"
          :class="{ 'is-ready': shaderReady }"
          aria-hidden="true"
        ></canvas>

        <div class="shader-label" :style="{ opacity: labelOpacity }" aria-hidden="true">
          {{ activeLabel }}
        </div>

        <div v-if="loading" class="shader-status">Preparing WebGL transition</div>
        <div v-else-if="loadError" class="shader-status">WebGL transition unavailable</div>
      </div>
    </main>
    <InkSectionTransition />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import InkSectionTransition from '../components/InkSectionTransition.vue'

const canvas = ref<HTMLCanvasElement | null>(null)
const scrollStage = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const shaderReady = ref(false)
const activeLabel = ref('YOU')
const labelOpacity = ref(0)

let renderer: THREE.WebGLRenderer | null = null
let material: THREE.ShaderMaterial | null = null
let geometry: THREE.PlaneGeometry | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let mesh: THREE.Mesh | null = null
let textureA: THREE.Texture | null = null
let textureB: THREE.Texture | null = null
let animationFrame = 0
let scrollProgress = 0
let pageStyles: Array<[HTMLElement, string, string]> = []
let appScroller: HTMLElement | null = null

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;
  uniform vec2 uResolution;
  uniform vec2 uTextureASize;
  uniform vec2 uTextureBSize;
  uniform float uRadius;
  uniform float uSketch;
  uniform float uEdge;
  uniform float uTime;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
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
      value += valueNoise(p) * amplitude;
      p = p * 2.03 + vec2(11.7, 7.9);
      amplitude *= 0.5;
    }
    return value;
  }

  vec2 coverUv(vec2 uv, vec2 textureSize) {
    float viewportAspect = uResolution.x / uResolution.y;
    float textureAspect = textureSize.x / textureSize.y;
    vec2 scale = vec2(1.0);
    if (textureAspect > viewportAspect) {
      scale.x = viewportAspect / textureAspect;
    } else {
      scale.y = textureAspect / viewportAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  float colorLuma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  vec3 charcoalVersion(vec2 uv, vec3 source) {
    vec2 texel = 1.65 / uTextureBSize;
    float l = colorLuma(texture2D(uTextureB, uv - vec2(texel.x, 0.0)).rgb);
    float r = colorLuma(texture2D(uTextureB, uv + vec2(texel.x, 0.0)).rgb);
    float t = colorLuma(texture2D(uTextureB, uv - vec2(0.0, texel.y)).rgb);
    float b = colorLuma(texture2D(uTextureB, uv + vec2(0.0, texel.y)).rgb);
    float edge = length(vec2(r - l, b - t));
    float broadEdge = smoothstep(0.025, 0.19, edge);
    float sourceLum = colorLuma(source);
    float paper = fbm(vUv * vec2(6.0, 9.0));
    vec3 charcoal = vec3(0.018 + sourceLum * 0.055 + paper * 0.015);
    charcoal += broadEdge * vec3(0.76, 0.79, 0.76);
    return charcoal;
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 centered = vUv - 0.5;
    centered.x *= aspect;
    float distanceFromCenter = length(centered);
    float angle = atan(centered.y, centered.x);

    float angularNoise = fbm(vec2(angle * 3.15 + 8.0, distanceFromCenter * 12.0 + uTime * 0.07));
    float paperNoise = fbm(vUv * vec2(13.0, 19.0) + vec2(uTime * 0.025, -uTime * 0.018));
    float hairNoise = valueNoise(vec2(angle * 26.0, floor(distanceFromCenter * 85.0) - uTime * 0.8));
    float edgeDisplacement = (angularNoise - 0.5) * 0.102 + (paperNoise - 0.5) * 0.048;
    float signedDistance = distanceFromCenter - (uRadius + edgeDisplacement);

    vec2 direction = distanceFromCenter > 0.0001 ? centered / distanceFromCenter : vec2(0.0);
    vec2 warp = vec2(direction.x / aspect, direction.y) * (paperNoise - 0.5) * 0.018 * uEdge;
    vec2 uvA = coverUv(vUv + warp, uTextureASize);
    vec2 uvB = coverUv(vUv - warp * 0.32, uTextureBSize);
    vec3 imageA = texture2D(uTextureA, uvA).rgb;
    vec3 imageB = texture2D(uTextureB, uvB).rgb;

    vec3 sketchB = charcoalVersion(uvB, imageB);
    vec3 backdrop = mix(imageB, sketchB, uSketch);

    float portal = 1.0 - smoothstep(-0.018, 0.019, signedDistance);
    vec3 color = mix(backdrop, imageA, portal);

    float dustBand = 1.0 - smoothstep(0.014, 0.086, abs(signedDistance));
    float chalkBand = 1.0 - smoothstep(0.005, 0.034, abs(signedDistance));
    vec2 particleCell = floor(gl_FragCoord.xy / 1.65);
    float particleSeed = hash21(particleCell + floor(uTime * 11.0));
    float brokenInk = smoothstep(0.38, 0.78, paperNoise * 0.72 + hairNoise * 0.52);
    float particles = dustBand * step(0.61, particleSeed) * brokenInk;
    float chalk = chalkBand * (0.35 + 0.65 * brokenInk);
    float whiteEdge = clamp((particles * 0.78 + chalk * 0.58) * uEdge, 0.0, 0.9);
    color = mix(color, vec3(0.96, 0.955, 0.89), whiteEdge);

    float lineScratch = smoothstep(0.79, 0.98, valueNoise(vec2(vUv.y * 170.0, vUv.x * 3.0 + uTime * 0.2)));
    color += dustBand * lineScratch * uEdge * vec3(0.12);

    float grain = hash21(gl_FragCoord.xy + floor(uTime * 17.0)) - 0.5;
    color += grain * (0.012 + dustBand * 0.026 * uEdge);
    gl_FragColor = vec4(color, 1.0);
  }
`

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (value: number) => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}
const smootherstep = (value: number) => {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function loadTexture(loader: THREE.TextureLoader, path: string) {
  return loader.loadAsync(path).then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
  })
}

function resizeRenderer() {
  if (!renderer || !material) return
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
  renderer.setSize(width, height, false)
  material.uniforms.uResolution.value.set(width, height)
}

function updateTimeline(progress: number) {
  if (!material) return

  const viewportAspect = window.innerWidth / Math.max(window.innerHeight, 1)
  const fullRadius = Math.sqrt(viewportAspect * viewportAspect * 0.25 + 0.25) + 0.18
  let radius = fullRadius
  let sketch = 1
  let edge = 0
  let label = 'YOU'
  let opacity = 0

  if (progress < 0.235) {
    const local = smootherstep(progress / 0.235)
    radius = fullRadius * (1 - local)
    sketch = local
    edge = Math.sin(local * Math.PI)
  } else if (progress < 0.46) {
    radius = -0.08
    sketch = 0
    label = 'YOU'
    opacity = smoothstep((progress - 0.255) / 0.055) * (1 - smoothstep((progress - 0.405) / 0.045))
  } else if (progress < 0.79) {
    const local = smootherstep((progress - 0.46) / 0.33)
    radius = -0.08 + (fullRadius + 0.08) * local
    sketch = local
    edge = Math.sin(local * Math.PI)
  } else {
    radius = fullRadius
    sketch = 1
    label = 'BEAUTIFULL'
    opacity = smoothstep((progress - 0.81) / 0.055) * (1 - smoothstep((progress - 0.965) / 0.03))
  }

  material.uniforms.uRadius.value = radius
  material.uniforms.uSketch.value = sketch
  material.uniforms.uEdge.value = edge
  activeLabel.value = label
  labelOpacity.value = opacity
}

function updateFromScroll() {
  if (!scrollStage.value) return
  const rect = scrollStage.value.getBoundingClientRect()
  const scrollableDistance = Math.max(scrollStage.value.offsetHeight - window.innerHeight, 1)
  scrollProgress = clamp01(-rect.top / scrollableDistance)
  updateTimeline(scrollProgress)
}

function render(time: number) {
  animationFrame = requestAnimationFrame(render)
  if (!renderer || !material || !scene || !camera) return
  material.uniforms.uTime.value = time / 1000
  renderer.render(scene, camera)
}

onMounted(async () => {
  const app = document.getElementById('app')
  appScroller = app
  const pageElements = [document.documentElement, document.body, app].filter(Boolean) as HTMLElement[]
  pageStyles = pageElements.map(element => [element, element.style.overflowY, element.style.overflowX])
  pageElements.forEach(element => {
    element.style.overflowY = 'auto'
    element.style.overflowX = 'hidden'
  })
  window.scrollTo(0, 0)
  if (appScroller) appScroller.scrollTop = 0

  if (!canvas.value) return
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    let shaderFailed = false
    renderer.debug.checkShaderErrors = true
    renderer.debug.onShaderError = (gl, program, vertexShaderObject, fragmentShaderObject) => {
      shaderFailed = true
      console.error(
        'Transition shader link error',
        `program=${gl.getProgramInfoLog(program) || ''}`,
        `vertex=${gl.getShaderInfoLog(vertexShaderObject) || ''}`,
        `fragment=${gl.getShaderInfoLog(fragmentShaderObject) || ''}`,
      )
    }

    const loader = new THREE.TextureLoader()
    ;[textureA, textureB] = await Promise.all([
      loadTexture(loader, '/frames/hero/frame_0259.jpg'),
      loadTexture(loader, '/images/fisherman.png'),
    ])

    const imageA = textureA.image as HTMLImageElement
    const imageB = textureB.image as HTMLImageElement
    material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTextureA: { value: textureA },
        uTextureB: { value: textureB },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTextureASize: { value: new THREE.Vector2(imageA.naturalWidth || imageA.width, imageA.naturalHeight || imageA.height) },
        uTextureBSize: { value: new THREE.Vector2(imageB.naturalWidth || imageB.width, imageB.naturalHeight || imageB.height) },
        uRadius: { value: 2 },
        uSketch: { value: 1 },
        uEdge: { value: 0 },
        uTime: { value: 0 },
      },
    })

    geometry = new THREE.PlaneGeometry(2, 2)
    mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2)
    camera.position.z = 1
    scene.add(mesh)

    resizeRenderer()
    updateTimeline(0)
    renderer.compile(scene, camera)
    renderer.render(scene, camera)
    if (shaderFailed) throw new Error('WebGL shader compilation failed')

    window.addEventListener('resize', resizeRenderer)
    window.addEventListener('resize', updateFromScroll)
    window.addEventListener('scroll', updateFromScroll, { passive: true })
    appScroller?.addEventListener('scroll', updateFromScroll, { passive: true })
    loading.value = false
    shaderReady.value = true
    updateFromScroll()
    animationFrame = requestAnimationFrame(render)
  } catch (error) {
    console.error('Transition shader failed:', error)
    loading.value = false
    loadError.value = true
    shaderReady.value = false
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', resizeRenderer)
  window.removeEventListener('resize', updateFromScroll)
  window.removeEventListener('scroll', updateFromScroll)
  appScroller?.removeEventListener('scroll', updateFromScroll)
  pageStyles.forEach(([element, overflowY, overflowX]) => {
    element.style.overflowY = overflowY
    element.style.overflowX = overflowX
  })
  appScroller = null
  textureA?.dispose()
  textureB?.dispose()
  geometry?.dispose()
  material?.dispose()
  scene?.clear()
  renderer?.dispose()
  renderer = null
  material = null
  mesh = null
  scene = null
  camera = null
})
</script>

<style scoped>
.shader-test {
  position: relative;
  width: 100%;
  height: 560vh;
  background: #060706;
}

.shader-viewport {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #060706;
}

.shader-canvas,
.shader-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.shader-canvas {
  opacity: 0;
}

.shader-canvas.is-ready {
  opacity: 1;
}

.shader-fallback {
  object-fit: cover;
}

.shader-label {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -50%);
  color: #fff;
  font-family: Inter, sans-serif;
  font-size: clamp(0.72rem, 1.25vw, 1rem);
  font-weight: 700;
  letter-spacing: 0.44em;
  line-height: 1;
  text-align: center;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.48);
  transition: opacity 50ms linear;
  pointer-events: none;
}

.shader-status {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.66);
  font-family: Inter, sans-serif;
  font-size: 0.64rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .shader-test {
    height: 650vh;
  }
}
</style>
