<template>
  <div ref="scrollRoot" class="fx-page" :class="{ 'is-embedded': embedded }">
    <div class="fx-fluid-marquee-frame">
      <FluidVideoHero shared-frame :clip-shared-bottom="false" />

      <section class="fx-profession-strip" aria-label="Explore Kevin AI professions">
        <ProfessionMarquee :fluid-enabled="false" />
      </section>
    </div>
    <div class="fx-transition-breathing-room" aria-hidden="true"></div>

    <section ref="stage" class="fx-stage">
      <div class="fx-viewport">
        <div ref="canvas2" class="fx-canvas fx-canvas--back" aria-hidden="true"></div>
        <div ref="canvas1" class="fx-canvas fx-canvas--front" aria-hidden="true"></div>

        <div v-if="loading" class="fx-status">Preparing Vibe WebGL transition</div>
        <div v-else-if="loadError" class="fx-status">WebGL transition unavailable</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import FluidVideoHero from '../components/FluidVideoHero.vue'
import ProfessionMarquee from '../components/ProfessionMarquee.vue'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false,
})

const embedded = props.embedded
const stage = ref<HTMLElement | null>(null)
const scrollRoot = ref<HTMLElement | null>(null)
const canvas1 = ref<HTMLElement | null>(null)
const canvas2 = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref(false)

let renderer1: THREE.WebGLRenderer | null = null
let renderer2: THREE.WebGLRenderer | null = null
let scene1: THREE.Scene | null = null
let scene2: THREE.Scene | null = null
let camera1: THREE.OrthographicCamera | null = null
let camera2: THREE.OrthographicCamera | null = null
let geometry: THREE.PlaneGeometry | null = null
let material1: THREE.ShaderMaterial | null = null
let material2: THREE.ShaderMaterial | null = null
let texture1: THREE.Texture | null = null
let texture2: THREE.Texture | null = null
let animationFrame = 0
let scrollSyncFrame = 0
let displayedTransitionFrame = 0

const TRANSITION_SEQUENCE_FRAMES = 35
const transitionSequenceImages: HTMLImageElement[] = []

const coverVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const coverFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uIdleMotion;
  uniform float uGrayscale;
  uniform float uEdgeIntensity;
  uniform float uEdgeBrightness;
  varying vec2 vUv;

  mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );

  mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(float(i), float(j)) * texelSize;
        float lum = getLuminance(texture2D(tex, uv + offset).rgb);
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }

    return sqrt(gx * gx + gy * gy);
  }

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
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec4 texColor = texture2D(uTexture, uv);

    float gray = getLuminance(texColor.rgb);
    vec3 grayscaleColor = vec3(gray);
    texColor.rgb = mix(texColor.rgb, grayscaleColor, uGrayscale);

    // Match the broad Vibe boundary profile, but keep it entirely inside this
    // shader so the fill and the illuminated edge can never separate.
    float pixelSize = 1.5;
    vec2 pixelatedUv = floor(vUv * uResolution / pixelSize) * pixelSize / uResolution;
    float motionTime = uTime * uIdleMotion;
    float wave = (
      sin(pixelatedUv.x * 13.82 + motionTime * 0.80) * 0.035
      + sin(pixelatedUv.x * 32.04 - motionTime * 0.45) * 0.014
      + sin(pixelatedUv.x * 69.00 + motionTime * 0.30) * 0.006
    );
    float steppedInput = sin(pixelatedUv.x * 127.0 + motionTime * 0.90) * 0.0045;
    float columns = floor(steppedInput / 0.0015 + 0.5) * 0.0015;
    float sectionFront = mix(-0.13, 1.13, uDissolve) + wave + columns;

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    // The outgoing section remains above the front. The incoming section is
    // exposed below it, so reversing scroll restores the first section.
    // Keep the reveal edge crisp enough for the 1.5px cells to remain visible.
    // The previous 0.018 feather blended dozens of cells into one soft band.
    float dissolveMask = smoothstep(sectionFront - 0.007, sectionFront + 0.007, vUv.y);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    vec3 baseColor = mix(texColor.rgb, vec3(0.0), uGrayscale);
    vec3 finalColor = baseColor;

    float edgeGlowIntensity = uEdgeIntensity * 2.0;
    float edgeGlow = edge * edgeGlowIntensity * (1.0 + uGrayscale * 3.0);
    finalColor += edgeColor * edgeGlow * uEdgeBrightness;

    float edgeZoneWidth = 0.072 * (1.0 - uDissolve) + 0.022;
    float edgeDistance = abs(vUv.y - sectionFront);
    float edgeZone = 1.0 - smoothstep(edgeZoneWidth * 0.2, edgeZoneWidth, edgeDistance);
    vec2 sparkleCell = floor(vUv * uResolution / 1.25);
    float sparkleSeed = hash(sparkleCell);
    float sparkle = sparkleSeed * edgeZone;

    float edgeBrightness = (1.0 - uDissolve) * uEdgeBrightness * (1.0 + uGrayscale * 2.0);
    finalColor += vec3(sparkle * 2.35 * edgeBrightness);

    // A luminous contour sits exactly on the irregular section boundary.
    // Multiple bands create a crisp white core and a restrained soft halo;
    // per-column variation keeps it granular instead of looking vector-smooth.
    float contourCell = hash(vec2(floor(gl_FragCoord.x / 1.5), 19.0));
    float contourPulse = 0.92 + 0.08 * sin(
      uTime * 1.35 + floor(gl_FragCoord.x / 1.5) * 0.17
    ) * uIdleMotion;
    float contourCoreWidth = mix(0.0035, 0.0065, contourCell);
    float contourCore = 1.0 - smoothstep(contourCoreWidth, contourCoreWidth + 0.0045, edgeDistance);
    float contourHalo = 1.0 - smoothstep(0.004, 0.020, edgeDistance);
    // Layer two offset micro-pixel fields so the illuminated contour is dense
    // without making the band itself any wider.
    float offsetSparkleSeed = hash(floor((vUv * uResolution + vec2(1.0, 3.0)) / 1.75) + 31.7);
    float thirdSparkleSeed = hash(floor((vUv * uResolution + vec2(3.0, 1.0)) / 2.25) + 73.1);
    float denseSparkleSeed = max(sparkleSeed, max(offsetSparkleSeed * 0.96, thirdSparkleSeed * 0.92));
    float contourDust = smoothstep(0.16, 0.52, denseSparkleSeed) * (
      1.0 - smoothstep(0.012, 0.040, edgeDistance)
    );
    float contourLight = (
      contourCore * 1.85
      + contourHalo * 0.46
      + contourDust * 0.48
    ) * contourPulse;
    float contourVisibility = 0.78 + 0.22 * uEdgeBrightness;
    float contourAlpha = clamp(contourLight * contourVisibility * 0.72, 0.0, 1.0);
    finalColor = mix(finalColor, vec3(1.0), contourAlpha);

    // The luminous pixels extend over the revealed dark texture, but they use
    // the exact same sectionFront as the fill. This is one shader/mask, not a
    // second CSS clip, so it cannot create the former white seam or split edge.
    float alpha = max(dissolveMask, contourAlpha) * texColor.a;

    gl_FragColor = vec4(finalColor, alpha);
  }
`

const coverFragmentShaderReverse = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uEdgeIntensity;
  uniform float uColorReveal;
  varying vec2 vUv;

  mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );

  mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(float(i), float(j)) * texelSize;
        float lum = getLuminance(texture2D(tex, uv + offset).rgb);
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }

    return sqrt(gx * gx + gy * gy);
  }

  void main() {
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec4 texColor = texture2D(uTexture, uv);

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    // Keep the source colors untouched. The transition now has only two
    // visual states: dense white outline on black, then the original frame.
    vec3 baseColor = mix(vec3(0.0), texColor.rgb, uColorReveal);

    float edgeGlow = edge * uEdgeIntensity * 2.0;
    baseColor += edgeColor * edgeGlow;

    vec3 finalColor = clamp(baseColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothRange = (start: number, end: number, value: number) => {
  const progress = clamp01((value - start) / Math.max(0.0001, end - start))
  return progress * progress * (3 - 2 * progress)
}

function preloadTransitionSequence(firstFrame: HTMLImageElement) {
  transitionSequenceImages[0] = firstFrame
  const pending: Promise<void>[] = []

  for (let index = 1; index < TRANSITION_SEQUENCE_FRAMES; index++) {
    const image = new Image()
    image.decoding = 'async'
    const frameNumber = String(index + 1).padStart(4, '0')
    const loaded = new Promise<void>(resolve => {
      image.onload = image.onerror = () => resolve()
    })
    image.src = `/frames/hero/frame_${frameNumber}.jpg`
    transitionSequenceImages[index] = image
    pending.push(loaded)
  }

  return Promise.all(pending)
}

function updateTransitionSequence(progress: number) {
  if (!texture2 || !material2) return
  const frameIndex = Math.round(clamp01(progress) * (TRANSITION_SEQUENCE_FRAMES - 1))
  if (frameIndex === displayedTransitionFrame) return

  const image = transitionSequenceImages[frameIndex]
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return

  displayedTransitionFrame = frameIndex
  texture2.image = image
  texture2.needsUpdate = true
  material2.uniforms.uImageResolution.value.set(image.naturalWidth, image.naturalHeight)
}

function loadTexture(loader: THREE.TextureLoader, path: string) {
  return loader.loadAsync(path).then(texture => {
    // LinearSRGBColorSpace = no GPU sRGB decode. The custom ShaderMaterial
    // reads raw sRGB bytes and passes them straight to gl_FragColor.
    // Combined with outputColorSpace = LinearSRGBColorSpace on the renderer,
    // no conversion is applied anywhere → colors match the original JPEG exactly.
    texture.colorSpace = THREE.LinearSRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
  })
}

function createWhiteTexture() {
  const surface = document.createElement('canvas')
  surface.width = 16
  surface.height = 16
  const context = surface.getContext('2d')
  if (!context) throw new Error('Unable to create the white transition texture.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, surface.width, surface.height)

  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function updateTransition(progress: number) {
  const amount = clamp01(progress)
  updateTransitionSequence(amount)

  if (material1) {
    material1.uniforms.uDissolve.value = amount
    // The outgoing Vibe spacer is a real white surface. Keep it white while
    // the original FX dissolve removes it; only the irregular boundary moves.
    material1.uniforms.uGrayscale.value = 0
    material1.uniforms.uEdgeIntensity.value = 0
    material1.uniforms.uEdgeBrightness.value = 1
  }

  if (material2) {
    const outlineFade = smoothRange(0.08, 0.72, amount)
    const colorReveal = smoothRange(0.24, 0.9, amount)
    material2.uniforms.uEdgeIntensity.value = 0.72 * (1 - outlineFade)
    material2.uniforms.uColorReveal.value = colorReveal
  }

}

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer1?.setSize(width, height)
  renderer2?.setSize(width, height)
  material1?.uniforms.uResolution.value.set(width, height)
  material2?.uniforms.uResolution.value.set(width, height)
  syncTransitionFromScroll()
}

function syncTransitionFromScroll() {
  if (!stage.value) return
  const viewportHeight = Math.max(window.innerHeight, 1)
  const distance = Math.max(stage.value.offsetHeight - viewportHeight, 1)
  const stageTop = stage.value.getBoundingClientRect().top
  updateTransition(-stageTop / distance)
}

function handlePageScroll() {
  if (scrollSyncFrame) return
  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = 0
    syncTransitionFromScroll()
  })
}

function render(time: number) {
  animationFrame = requestAnimationFrame(render)
  syncTransitionFromScroll()
  const seconds = time * 0.001
  if (material1) material1.uniforms.uTime.value = seconds
  if (material2) material2.uniforms.uTime.value = seconds
  if (renderer1 && scene1 && camera1) renderer1.render(scene1, camera1)
  if (renderer2 && scene2 && camera2) renderer2.render(scene2, camera2)
}

onMounted(async () => {
  if (scrollRoot.value && !embedded) scrollRoot.value.scrollTop = 0

  if (!canvas1.value || !canvas2.value || !stage.value || !scrollRoot.value) return

  try {
    scene1 = new THREE.Scene()
    scene2 = new THREE.Scene()
    camera1 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera1.position.z = 1
    camera2.position.z = 1

    renderer1 = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer2 = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    // No output color space conversion — raw sRGB values from the custom
    // shader pass through unchanged so no double-gamma filter is applied.
    renderer1.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer2.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer1.setSize(window.innerWidth, window.innerHeight)
    renderer2.setSize(window.innerWidth, window.innerHeight)
    canvas1.value.appendChild(renderer1.domElement)
    canvas2.value.appendChild(renderer2.domElement)

    geometry = new THREE.PlaneGeometry(2, 2)
    const loader = new THREE.TextureLoader()
    texture1 = createWhiteTexture()
    texture2 = await loadTexture(loader, '/frames/hero/frame_0001.jpg')

    const image1 = texture1.image as HTMLImageElement
    const image2 = texture2.image as HTMLImageElement
    await preloadTransitionSequence(image2)

    material1 = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture1 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uImageResolution: { value: new THREE.Vector2(image1.width, image1.height) },
        uDissolve: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0 },
        uIdleMotion: {
          value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1,
        },
        uGrayscale: { value: 0 },
        uEdgeIntensity: { value: 0 },
        uEdgeBrightness: { value: 1 },
      },
      vertexShader: coverVertexShader,
      fragmentShader: coverFragmentShader,
      transparent: true,
    })

    material2 = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture2 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uImageResolution: { value: new THREE.Vector2(image2.width, image2.height) },
        uDissolve: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0 },
        uEdgeIntensity: { value: 0.72 },
        uColorReveal: { value: 0 },
      },
      vertexShader: coverVertexShader,
      fragmentShader: coverFragmentShaderReverse,
      transparent: true,
    })

    scene1.add(new THREE.Mesh(geometry, material1))
    scene2.add(new THREE.Mesh(geometry, material2))

    window.addEventListener('resize', resize)
    scrollRoot.value.addEventListener('scroll', handlePageScroll, { passive: true })
    syncTransitionFromScroll()
    loading.value = false
    animationFrame = requestAnimationFrame(render)
  } catch (error) {
    console.error('Original FX transition failed:', error)
    loading.value = false
    loadError.value = true
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  cancelAnimationFrame(scrollSyncFrame)
  window.removeEventListener('resize', resize)
  scrollRoot.value?.removeEventListener('scroll', handlePageScroll)
  texture1?.dispose()
  texture2?.dispose()
  transitionSequenceImages.length = 0
  displayedTransitionFrame = 0
  geometry?.dispose()
  material1?.dispose()
  material2?.dispose()
  scene1?.clear()
  scene2?.clear()
  renderer1?.dispose()
  renderer2?.dispose()
  renderer1?.domElement.remove()
  renderer2?.domElement.remove()
})
</script>

<style scoped>
.fx-page {
  --profession-strip-height: clamp(500px, 72vh, 760px);
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background: #fff;
}

.fx-page.is-embedded {
  position: relative;
  inset: auto;
  width: 100%;
  height: auto;
  overflow: visible;
  overscroll-behavior: auto;
  -webkit-overflow-scrolling: auto;
}

.fx-page.is-embedded.is-handoff-complete {
  visibility: hidden;
  pointer-events: none;
}

.fx-fluid-marquee-frame {
  position: relative;
  isolation: isolate;
  width: 100%;
  background: #fff;
}

.fx-fluid-marquee-frame :deep(.fluid-video-canvas) {
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 84%,
    rgba(0, 0, 0, 0.94) 89%,
    rgba(0, 0, 0, 0.58) 94%,
    rgba(0, 0, 0, 0.22) 97%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 84%,
    rgba(0, 0, 0, 0.94) 89%,
    rgba(0, 0, 0, 0.58) 94%,
    rgba(0, 0, 0, 0.22) 97%,
    transparent 100%
  );
}

.fx-profession-strip {
  position: relative;
  z-index: 3;
  width: 100%;
  height: var(--profession-strip-height);
  overflow: hidden;
  background: transparent;
}

.fx-profession-strip :deep(.profession-marquee) {
  --item-height: min(68vh, 700px);
  --item-gap: clamp(12px, 1.8vw, 30px);
  background: transparent;
}

.fx-transition-breathing-room {
  width: 100%;
  height: clamp(90px, 16vh, 180px);
  background: #fff;
}

.fx-stage {
  position: relative;
  width: 100%;
  height: 300vh;
  overflow: clip;
  background: #fff;
}

.fx-viewport {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #fff;
}

.fx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.fx-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.fx-canvas--front {
  z-index: 2;
}

.fx-canvas--back {
  z-index: 1;
}

.fx-status {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 20;
  transform: translate(-50%, -50%);
  color: rgba(46, 46, 46, 0.72);
  font: 600 0.66rem/1 Inter, sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .fx-page {
    --profession-strip-height: clamp(390px, 62svh, 540px);
  }

  .fx-profession-strip {
    height: var(--profession-strip-height);
  }

  .fx-profession-strip :deep(.profession-marquee) {
    --item-height: min(57svh, 500px);
    --item-gap: 14px;
  }

  .fx-transition-breathing-room {
    height: clamp(72px, 13svh, 120px);
  }
}

</style>
