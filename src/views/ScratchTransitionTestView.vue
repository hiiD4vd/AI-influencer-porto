<template>
  <div ref="scrollRoot" class="fx-page">
    <FluidVideoHero />

    <section ref="stage" class="fx-stage">
      <div class="fx-viewport">
        <div ref="canvas2" class="fx-canvas fx-canvas--back" aria-hidden="true"></div>
        <div ref="canvas1" class="fx-canvas fx-canvas--front" aria-hidden="true"></div>

        <div class="text-overlay" aria-live="polite">
          <h1 ref="dynamicText" class="dynamic-text">YOU</h1>
        </div>

        <div v-if="loading" class="fx-status">Preparing original WebGL transition</div>
        <div v-else-if="loadError" class="fx-status">WebGL transition unavailable</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { gsap } from 'gsap'
import FluidVideoHero from '../components/FluidVideoHero.vue'

const stage = ref<HTMLElement | null>(null)
const scrollRoot = ref<HTMLElement | null>(null)
const canvas1 = ref<HTMLElement | null>(null)
const canvas2 = ref<HTMLElement | null>(null)
const dynamicText = ref<HTMLElement | null>(null)
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
let textTimeline: gsap.core.Timeline | null = null
let animationFrame = 0
let scrollSyncFrame = 0
let textState = 'start'

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

    // Keep the original pixel/noise material, but anchor its geometry to the
    // boundary between sections instead of a radial point in the centre.
    // A tighter cell size produces the dense, fine-grained dissolve seen in
    // the reference while preserving the deliberately pixelated silhouette.
    float noiseScale = 3.0;
    vec2 pixelatedUv = floor(vUv * uResolution / noiseScale) * noiseScale / uResolution;
    // Keep the boundary alive even when scroll progress is stationary. The
    // broad wave moves slowly, while quantised columns make individual pixel
    // clusters rise and fall without turning the edge into a smooth sine wave.
    float motionTime = uTime * uIdleMotion;
    float blockNoise = fbm(vec2(pixelatedUv.x * 8.0, 3.4 + motionTime * 0.075)) * 0.13;
    float mediumNoise = fbm(vec2(pixelatedUv.x * 21.0 + 7.0 - motionTime * 0.10, 1.8 + motionTime * 0.045)) * 0.055;
    float fineNoise = noise(vec2(pixelatedUv.x * 57.0, 8.2 + motionTime * 0.16)) * 0.018;
    float gentleWave = (
      sin(pixelatedUv.x * 12.0 + motionTime * 1.05) * 0.0065
      + sin(pixelatedUv.x * 27.0 - motionTime * 0.68) * 0.0035
    ) * uIdleMotion;
    float pixelColumn = sin(
      floor(pixelatedUv.x * 72.0) * 0.41 + motionTime * 1.30
    ) * 0.0025 * uIdleMotion;
    float sectionFront = mix(-0.18, 1.18, uDissolve)
      + (blockNoise - 0.065)
      + (mediumNoise - 0.0275)
      + (fineNoise - 0.009)
      + gentleWave
      + pixelColumn;

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    // The outgoing section remains above the front. The incoming section is
    // exposed below it, so reversing scroll restores the first section.
    float dissolveMask = smoothstep(sectionFront - 0.018, sectionFront + 0.018, vUv.y);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    vec3 baseColor = mix(texColor.rgb, vec3(0.0), uGrayscale);
    vec3 finalColor = baseColor;

    float edgeGlowIntensity = uEdgeIntensity * 2.0;
    float edgeGlow = edge * edgeGlowIntensity * (1.0 + uGrayscale * 3.0);
    finalColor += edgeColor * edgeGlow * uEdgeBrightness;

    float edgeZoneWidth = 0.072 * (1.0 - uDissolve) + 0.022;
    float edgeDistance = abs(vUv.y - sectionFront);
    float edgeZone = 1.0 - smoothstep(edgeZoneWidth * 0.2, edgeZoneWidth, edgeDistance);
    vec2 sparkleCell = floor(vUv * uResolution / 2.0);
    float sparkleSeed = hash(sparkleCell);
    float sparkle = sparkleSeed * edgeZone;

    float edgeBrightness = (1.0 - uDissolve) * uEdgeBrightness * (1.0 + uGrayscale * 2.0);
    finalColor += vec3(sparkle * 2.35 * edgeBrightness);

    // A luminous contour sits exactly on the irregular section boundary.
    // Multiple bands create a crisp white core and a restrained soft halo;
    // per-column variation keeps it granular instead of looking vector-smooth.
    float contourCell = hash(vec2(floor(gl_FragCoord.x / 3.0), 19.0));
    float contourPulse = 0.92 + 0.08 * sin(
      uTime * 1.35 + floor(gl_FragCoord.x / 3.0) * 0.17
    ) * uIdleMotion;
    float contourCoreWidth = mix(0.0035, 0.0065, contourCell);
    float contourCore = 1.0 - smoothstep(contourCoreWidth, contourCoreWidth + 0.0045, edgeDistance);
    float contourHalo = 1.0 - smoothstep(0.004, 0.020, edgeDistance);
    // Layer two offset micro-pixel fields so the illuminated contour is dense
    // without making the band itself any wider.
    float offsetSparkleSeed = hash(floor((vUv * uResolution + vec2(1.0, 3.0)) / 3.0) + 31.7);
    float denseSparkleSeed = max(sparkleSeed, offsetSparkleSeed * 0.94);
    float contourDust = smoothstep(0.20, 0.58, denseSparkleSeed) * (
      1.0 - smoothstep(0.012, 0.040, edgeDistance)
    );
    float contourLight = (
      contourCore * 1.85
      + contourHalo * 0.46
      + contourDust * 0.48
    ) * contourPulse;
    float contourVisibility = 0.78 + 0.22 * uEdgeBrightness;
    finalColor += vec3(contourLight * contourVisibility);

    float alpha = dissolveMask * texColor.a;

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
  uniform float uBrightness;
  uniform float uEdgeIntensity;
  uniform float uDarkness;
  uniform float uGrayscale;
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

    float gray = getLuminance(texColor.rgb);
    vec3 grayscaleColor = vec3(gray);
    texColor.rgb = mix(texColor.rgb, grayscaleColor, uGrayscale);

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    vec3 darkBase = vec3(0.0);
    vec3 baseColor = mix(texColor.rgb, darkBase, uDarkness);

    float edgeGlow = edge * uEdgeIntensity * 2.0;
    baseColor += edgeColor * edgeGlow;

    vec3 finalColor = clamp(baseColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function loadTexture(loader: THREE.TextureLoader, path: string) {
  return loader.loadAsync(path).then(texture => {
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
  })
}

function updateTransition(progress: number) {
  const amount = clamp01(progress)

  if (material1) {
    material1.uniforms.uDissolve.value = amount
    const grayscaleProgress = Math.min(1, amount / 0.4)
    material1.uniforms.uGrayscale.value = grayscaleProgress
    material1.uniforms.uEdgeIntensity.value = amount * 0.5
    material1.uniforms.uEdgeBrightness.value = 1 - amount
  }

  if (material2) {
    const acceleratedProgress = Math.min(1, amount * 1.1)
    material2.uniforms.uEdgeIntensity.value = 0.6 * (1 - acceleratedProgress)
    material2.uniforms.uDarkness.value = 1 - acceleratedProgress
    material2.uniforms.uGrayscale.value = 1 - acceleratedProgress
  }

  if (dynamicText.value) {
    if (amount < 0.5 && textState !== 'start') {
      dynamicText.value.textContent = 'YOU'
      textState = 'start'
    } else if (amount >= 0.5 && textState !== 'end') {
      dynamicText.value.textContent = 'BEAUTIFULL'
      textState = 'end'
    }
  }

  textTimeline?.progress(amount)
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
  if (!stage.value || !scrollRoot.value) return
  const distance = Math.max(stage.value.offsetHeight - scrollRoot.value.clientHeight, 1)
  updateTransition((scrollRoot.value.scrollTop - stage.value.offsetTop) / distance)
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
  const seconds = time * 0.001
  if (material1) material1.uniforms.uTime.value = seconds
  if (material2) material2.uniforms.uTime.value = seconds
  if (renderer1 && scene1 && camera1) renderer1.render(scene1, camera1)
  if (renderer2 && scene2 && camera2) renderer2.render(scene2, camera2)
}

onMounted(async () => {
  if (scrollRoot.value) scrollRoot.value.scrollTop = 0

  if (!canvas1.value || !canvas2.value || !stage.value || !scrollRoot.value) return

  try {
    scene1 = new THREE.Scene()
    scene2 = new THREE.Scene()
    camera1 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera1.position.z = 1
    camera2.position.z = 1

    renderer1 = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer1.setSize(window.innerWidth, window.innerHeight)
    renderer2.setSize(window.innerWidth, window.innerHeight)
    canvas1.value.appendChild(renderer1.domElement)
    canvas2.value.appendChild(renderer2.domElement)

    geometry = new THREE.PlaneGeometry(2, 2)
    const loader = new THREE.TextureLoader()
    ;[texture1, texture2] = await Promise.all([
      loadTexture(loader, '/images/fx-art-1.png'),
      loadTexture(loader, '/images/fx-art-2.jpg'),
    ])

    const image1 = texture1.image as HTMLImageElement
    const image2 = texture2.image as HTMLImageElement

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
        uBrightness: { value: 0 },
        uEdgeIntensity: { value: 0.6 },
        uDarkness: { value: 1 },
        uGrayscale: { value: 1 },
      },
      vertexShader: coverVertexShader,
      fragmentShader: coverFragmentShaderReverse,
      transparent: true,
    })

    scene1.add(new THREE.Mesh(geometry, material1))
    scene2.add(new THREE.Mesh(geometry, material2))

    if (dynamicText.value) {
      textTimeline = gsap.timeline({ paused: true })
      textTimeline
        .to(dynamicText.value, { opacity: 0, filter: 'blur(20px)', ease: 'none' }, 0)
        .to(dynamicText.value, { opacity: 1, filter: 'blur(0px)', ease: 'none' }, 0.6)
    }

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
  textTimeline?.kill()
  texture1?.dispose()
  texture2?.dispose()
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
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background: #000;
}

.fx-stage {
  position: relative;
  width: 100%;
  height: 300vh;
  overflow: clip;
  background: #000;
}

.fx-viewport {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #000;
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

.text-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.dynamic-text {
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: clamp(2rem, 6vw, 5rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.3em;
  text-align: center;
  text-transform: uppercase;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
  opacity: 1;
  filter: blur(0);
  will-change: opacity, filter;
}

.fx-status {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 20;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.7);
  font: 600 0.66rem/1 Inter, sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .dynamic-text {
    max-width: 90vw;
    font-size: clamp(1.35rem, 9vw, 3rem);
    letter-spacing: 0.2em;
  }
}
</style>
