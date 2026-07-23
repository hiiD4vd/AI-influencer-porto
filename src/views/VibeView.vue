<template>
  <div
    class="vibe-view"
    :class="{
      'is-cabin-scroll-locked': cabinScrollLocked,
      'is-fluid-hero-active': fluidHeroActive,
    }"
    ref="viewRoot"
  >
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
      <RouterLink to="/cabin-test" class="nav-link" :class="{ active: $route.name === 'cabin-test' }">Cabin</RouterLink>
      <RouterLink to="/transition-test" class="nav-link" :class="{ active: $route.name === 'transition-test' }">FX</RouterLink>
    </nav>

    <!-- Canvas — always visible until fully replaced -->
    <canvas ref="canvasEl" class="hero-canvas"></canvas>

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loader-bar">
          <div class="loader-fill" :style="{ width: loadProgress + '%' }"></div>
        </div>
        <span class="loader-text">{{ Math.round(loadProgress) }}%</span>
      </div>
    </Transition>

    <!-- Scroll container -->
    <div class="scroll-container" ref="scrollContainer">
      <ScratchTransitionTestView
        embedded
        :class="{ 'is-handoff-complete': !fluidHeroActive }"
      />
      <div ref="introTransitionMarker" class="intro-transition-marker" aria-hidden="true"></div>
    </div>

    <section
      ref="welcomeScene"
      class="welcome-scene"
      :class="{ 'is-active': showWelcome }"
      :aria-hidden="!showWelcome"
    >
      <canvas ref="gymSequenceCanvas" class="gym-sequence-canvas" aria-hidden="true"></canvas>
      <canvas
        ref="gymCabinFluidCanvas"
        class="gym-cabin-fluid-canvas"
        aria-label="Transisi cair dari ruang gym menuju kabin pesawat"
      ></canvas>
    </section>

    <!-- Carousel scene — mounts on top of canvas, card starts at EXACT canvas position -->
    <canvas
      v-show="cabinTransitionActive"
      ref="cabinTransitionCanvas"
      class="cabin-transition-canvas"
      aria-hidden="true"
    ></canvas>

    <canvas
      v-show="cabinFishermanFluidActive"
      ref="cabinFishermanFluidCanvas"
      class="cabin-fisherman-fluid-canvas"
      aria-label="Transisi cair dari kabin pesawat menuju profesi extreme fisherman"
    ></canvas>

    <WingsuitFlightSection :progress="wingsuitSectionProgress" />

    <section
      ref="embeddedCabinScene"
      class="embedded-cabin-scene"
      :class="{ 'is-interactive': cabinSceneActive }"
      :aria-hidden="!showCabinScene"
    >
      <CabinTestView
        embedded
        :active="cabinSceneActive"
        :paused="!showCabinScene || fishermanTransitionProgress > 0"
        :chime-audio-element="preparedCabinChime"
        :announcement-audio-element="preparedCabinAnnouncement"
        @ready="handleEmbeddedCabinReady"
        @scroll-unlocked="handleCabinScrollUnlocked"
      />
    </section>

    <div class="carousel-scene" v-show="showCarousel" ref="carouselScene">
      
      <!-- Independent room layer that can scale beautifully without being constrained by the grey card -->
      <div v-show="false" class="room-layer" :class="{ 'is-zoomed': isZoomed }">
        <div class="parallax-container" ref="parallaxContainer">
          <img :src="CARDS[activeCardIndex].room" class="room-img" draggable="false" />
          
          <!-- Hotspots -->
          <div 
            v-for="spot in HOTSPOTS" 
            :key="spot.id"
            class="hotspot"
            :style="{ left: spot.left, top: spot.top }"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </div>
        </div>
      </div>

      <!-- Navigation Arrows -->
      <button class="nav-arrow prev" v-show="!isZoomed && activeCardIndex > 0" @click.stop="prevCard">
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <button class="nav-arrow next" v-show="!isZoomed && activeCardIndex < CARDS.length - 1" @click.stop="nextCard">
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>

      <!-- Cards track — uses CSS transform to slide siblings in -->
      <div class="cards-track" ref="cardsTrack" :class="{ 'is-zoomed': isZoomed }">
        <div
          v-for="(card, i) in CARDS"
          :key="card.id"
          class="card-slot"
          :ref="el => { if (el) cardEls[i] = el as HTMLElement }"
        >
          <!-- Card frame with transparent hole on top -->
          <img :src="card.frame" class="card-frame" draggable="false" />
          
          <!-- Enter button -->
          <button v-show="false" class="enter-btn" @click.stop="enterCard" :class="{ 'is-zoomed': isZoomed }">
            ENTER
          </button>
        </div>
      </div>
      
      <!-- Exit button (appears when zoomed) -->
      <button v-show="false" class="exit-btn" @click.stop="exitCard" :class="{ 'is-visible': isZoomed }">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        BACK
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import Lenis from 'lenis'
import gsap from 'gsap'
import * as THREE from 'three'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import CabinTestView from './CabinTestView.vue'
import ScratchTransitionTestView from './ScratchTransitionTestView.vue'
import WingsuitFlightSection from '../components/WingsuitFlightSection.vue'

gsap.registerPlugin(ScrollTrigger)

// ── Card data ─────────────────────────────────────────────────────────────
const CARDS = [
  {
    id: 'athlete',
    label: 'THE ATHLETE',
    category: 'Fitness & Performance',
    frame: '/images/idcard-athlete.png',
    room: '/images/idcard-athlete.png'
  }
]

const HOTSPOTS = [
  { id: 'mri', left: '72%', top: '55%' },
  { id: 'brain', left: '16%', top: '33%' },
  { id: 'tablet', left: '54%', top: '48%' },
  { id: 'machine', left: '8%', top: '65%' }
]

// ── Frame sequence config ─────────────────────────────────────────────────
const TOTAL_FRAMES = 259
const TRANSITION_SEQUENCE_LAST_FRAME = 34
const SCROLL_PX_PER_FRAME = 12
const FRAME_PATH = (i: number) => `/frames/hero/frame_${String(i).padStart(4, '0')}.jpg`
const REDBULL_TOTAL_FRAMES = 224
const REDBULL_SCROLL_PX_PER_FRAME = 12
const REDBULL_FRAME_PATH = (i: number) => `/frames/redbull/frame_${String(i).padStart(4, '0')}.webp`
const GYM_TOTAL_FRAMES = 97
const GYM_SCROLL_PX_PER_FRAME = 12
const GYM_SEQUENCE_VERSION = 'new-gym-sequence-20260723'
const GYM_FRAME_PATH = (i: number) => `/frames/gym-sequence/frame_${String(i).padStart(4, '0')}.webp?v=${GYM_SEQUENCE_VERSION}`
const FISHERMAN_TOTAL_FRAMES = 97
const FISHERMAN_SCROLL_PX_PER_FRAME = 12
const FISHERMAN_SEQUENCE_START = 0.58
const FISHERMAN_FRAME_PATH = (i: number) => `/frames/fisherman-sequence/frame_${String(i).padStart(4, '0')}.webp`

const LAST_FRAME_PNG = { w: 1920, h: 1080 }
const CARD_IN_PNG = {
  left:   0.4323,
  top:    0.3000,
  width:  0.1344,
  height: 0.4000,
}

const HOLE = {
  centerX: 0.5078,
  centerY: 0.6750,
  width:   0.8756,
  height:  0.4153,
}

// ── Refs ──────────────────────────────────────────────────────────────────
const viewRoot       = ref<HTMLElement | null>(null)
const canvasEl       = ref<HTMLCanvasElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const cardsTrack     = ref<HTMLElement | null>(null)
const parallaxContainer = ref<HTMLElement | null>(null)
const cardEls        = ref<HTMLElement[]>([])
const isLoading      = ref(true)
const loadProgress   = ref(0)
const welcomeScene   = ref<HTMLElement | null>(null)
const gymSequenceCanvas = ref<HTMLCanvasElement | null>(null)
const gymCabinFluidCanvas = ref<HTMLCanvasElement | null>(null)
const showWelcome    = ref(false)
const cabinTransitionCanvas = ref<HTMLCanvasElement | null>(null)
const cabinTransitionActive = ref(false)
const cabinFishermanFluidCanvas = ref<HTMLCanvasElement | null>(null)
const cabinFishermanFluidActive = ref(false)
const cabinSceneActive = ref(false)
const showCabinScene = ref(false)
const cabinSceneReady = ref(false)
const embeddedCabinScene = ref<HTMLElement | null>(null)
const cabinScrollUnlocked = ref(false)
const cabinScrollLocked = ref(false)
const fishermanScrollUnlocked = ref(false)
const wingsuitSectionProgress = ref(0)
const fluidHeroActive = ref(true)
const introTransitionMarker = ref<HTMLElement | null>(null)
const preparedCabinChime = shallowRef<HTMLAudioElement | null>(null)
const preparedCabinAnnouncement = shallowRef<HTMLAudioElement | null>(null)

// ── Idle Animation State ──────────────────────────────────────────────────
let idleTimeout: any = null
let idleTween: gsap.core.Tween | null = null

function startIdleAnimation() {
  if (!isZoomed.value || !parallaxContainer.value) return
  
  const maxMoveX = window.innerWidth * 0.05
  const maxMoveY = window.innerHeight * 0.05

  idleTween = gsap.to(parallaxContainer.value, {
    x: `random(-${maxMoveX}, ${maxMoveX})`,
    y: `random(-${maxMoveY}, ${maxMoveY})`,
    duration: 8,
    ease: "sine.inOut",
    onComplete: startIdleAnimation
  })
}
const showCarousel   = ref(false)
const isZoomed       = ref(false)
const activeCardIndex = ref(0)
const sliderProxy = { index: 0 }
let currentZoomP     = 0
let rafId            = 0
let cabinTransitionProgress = 0
let cabinTransitionImage: HTMLCanvasElement | null = null
const gymFrames: Array<HTMLImageElement | undefined> = new Array(GYM_TOTAL_FRAMES)
const gymFramePromises = new Map<number, Promise<HTMLImageElement | null>>()
const fishermanFrames: Array<HTMLImageElement | undefined> = new Array(FISHERMAN_TOTAL_FRAMES)
const fishermanFramePromises = new Map<number, Promise<HTMLImageElement | null>>()
const redbullFrames: Array<HTMLImageElement | undefined> = new Array(REDBULL_TOTAL_FRAMES)
const redbullFramePromises = new Map<number, Promise<HTMLImageElement | null>>()
let frozenCabinFrame: HTMLCanvasElement | null = null
let baseStoryScrollHeight = 0
let storyScrollStart = 0
let transitionSequenceStart = 0
let transitionSequenceDistance = 1
let heroScrollEnd = 0
let gymScrollDistance = 0
let gymSequenceProgress = 0
let cabinScrollDistance = 0
let fishermanScrollDistance = 0
let fishermanTransitionProgress = 0
let redbullScrollDistance = 0
let redbullSequenceProgress = 0
let wingsuitScrollDistance = 0
let gymPreloadCancelled = false
let fishermanPreloadCancelled = false
let redbullPreloadCancelled = false
let cabinAudioPrimed = false
let cabinAudioPriming = false
let cabinTransitionAssetPromise: Promise<boolean> | null = null

let gymCabinFluidRenderer: THREE.WebGLRenderer | null = null
let gymCabinFluidScene: THREE.Scene | null = null
let gymCabinFluidCamera: THREE.OrthographicCamera | null = null
let gymCabinFluidGeometry: THREE.PlaneGeometry | null = null
let gymCabinFluidMaterial: THREE.ShaderMaterial | null = null
let gymCabinFluidMesh: THREE.Mesh | null = null
let gymCabinFluidTexture: THREE.Texture | null = null
let gymCabinRenderedMaskProgress = 0
let gymCabinAnimationStartTime = 0

let cabinFishermanFluidRenderer: THREE.WebGLRenderer | null = null
let cabinFishermanFluidScene: THREE.Scene | null = null
let cabinFishermanFluidCamera: THREE.OrthographicCamera | null = null
let cabinFishermanFluidGeometry: THREE.PlaneGeometry | null = null
let cabinFishermanFluidMaterial: THREE.ShaderMaterial | null = null
let cabinFishermanFluidMesh: THREE.Mesh | null = null
let cabinFishermanCabinTexture: THREE.CanvasTexture | null = null
let cabinFishermanSequenceTexture: THREE.CanvasTexture | null = null
let cabinFishermanCabinBuffer: HTMLCanvasElement | null = null
let cabinFishermanSequenceBuffer: HTMLCanvasElement | null = null
let cabinFishermanRenderedFrame = -1
let cabinFishermanRenderedProgress = 0
let cabinFishermanAnimationStartTime = 0

const gymCabinVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const gymCabinFragmentShader = /* glsl */ `
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
    cabinUv.y = 0.5 + (cabinUv.y - 0.5) * 0.9;
    cabinUv.y += uParallaxOffset;
    vec4 cabin = texture2D(uCabinTexture, cabinUv);

    float aspect = uResolution.x / uResolution.y;
    vec2 centeredUv = (vUv - 0.5) * vec2(aspect, 1.0);
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

// The same living-noise vocabulary as Gym -> Cabin, but used as an outgoing
// mask: the lower edge of the cabin erodes upward and reveals Fisherman below.
const cabinFishermanFragmentShader = /* glsl */ `
  uniform sampler2D uCabinTexture;
  uniform sampler2D uFishermanTexture;
  uniform float uProgress;
  uniform float uSpread;
  uniform float uTime;
  uniform vec2 uResolution;
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

  void main() {
    vec4 cabin = texture2D(uCabinTexture, vUv);
    vec4 fisherman = texture2D(uFishermanTexture, vUv);

    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 centeredUv = (vUv - 0.5) * vec2(aspect, 1.0);
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

    // At zero the front is below the viewport. As progress grows it travels
    // upward, leaving irregular living islands of the cabin along its edge.
    float revealFront = -0.34 + uProgress * 1.68;
    float distanceToFront = vUv.y + (noiseValue - 0.5) * uSpread - revealFront;
    float pixelSize = 1.0 / max(uResolution.y, 1.0);
    float cabinAlpha = smoothstep(-pixelSize, pixelSize, distanceToFront);

    gl_FragColor = mix(fisherman, cabin, cabinAlpha);
  }
`

function nextCard() {
  if (activeCardIndex.value < CARDS.length - 1) {
    activeCardIndex.value++
    updateSlider()
  }
}

function prevCard() {
  if (activeCardIndex.value > 0) {
    activeCardIndex.value--
    updateSlider()
  }
}

function updateSlider() {
  gsap.to(sliderProxy, {
    index: activeCardIndex.value,
    duration: 0.8,
    ease: "power3.inOut",
    onUpdate: () => {
      renderCardZoom(currentZoomP)
    }
  })
}

// ── State ─────────────────────────────────────────────────────────────────
const images: HTMLImageElement[] = []
let ctx: CanvasRenderingContext2D | null = null
let currentFrame = 0
let targetFrame  = 0
let lenis: Lenis | null = null

// ── Calculate where the card appears on-screen from the canvas cover-fit ─
function getCardScreenRect() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const { w: iW, h: iH } = LAST_FRAME_PNG
  const scale = Math.max(vw / iW, vh / iH)
  const dW = iW * scale
  const dH = iH * scale
  const dx = (vw - dW) / 2
  const dy = (vh - dH) / 2

  const left   = dx + CARD_IN_PNG.left  * iW * scale
  const top    = dy + CARD_IN_PNG.top   * iH * scale
  const width  = CARD_IN_PNG.width  * iW * scale
  const height = CARD_IN_PNG.height * iH * scale

  return { left, top, width, height }
}

// ── Draw frame to canvas ──────────────────────────────────────────────────
function drawFrame(index: number) {
  const img = images[Math.min(index, TOTAL_FRAMES - 1)]
  if (!img || !ctx || !canvasEl.value) return
  const cvs = canvasEl.value
  const cW = cvs.width, cH = cvs.height
  const iW = img.naturalWidth, iH = img.naturalHeight
  if (!iW || !iH) return
  const scale = Math.max(cW / iW, cH / iH)
  const dW = iW * scale, dH = iH * scale
  const dX = (cW - dW) / 2, dY = (cH - dH) / 2
  ctx.clearRect(0, 0, cW, cH)
  ctx.drawImage(img, dX, dY, dW, dH)
}

// ── Render loop ───────────────────────────────────────────────────────────
function tick(time = performance.now()) {
  rafId = requestAnimationFrame(tick)
  lenis?.raf(time)
  if (targetFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  } else if (currentFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  }
  renderGymCabinFluid(time)
  renderCabinFishermanFluid(time)
}

// ── Zoom logic based on progress ──────────────────────────────────────────
function renderCardZoom(progress: number) {
  currentZoomP = progress
  if (!cardsTrack.value || !cardEls.value[0]) return

  const track = cardsTrack.value

  const rect = getCardScreenRect()
  const holeW = rect.width * HOLE.width
  const holeH = rect.height * HOLE.height

  const maxScale = Math.max(window.innerWidth / holeW, window.innerHeight / holeH) * 1.15
  const finalW = rect.width * maxScale
  const finalH = rect.height * maxScale
  const finalLeft = window.innerWidth / 2 - finalW * HOLE.centerX
  const finalTop  = window.innerHeight / 2 - finalH * HOLE.centerY

  const easeP = gsap.parseEase("power4.inOut")(progress)

  const currW = rect.width + (finalW - rect.width) * easeP
  const currH = rect.height + (finalH - rect.height) * easeP
  const currLeft = rect.left + (finalLeft - rect.left) * easeP
  const currTop = rect.top + (finalTop - rect.top) * easeP

  // The gap between cards is exactly enough to make one card per screen
  const baseGap = window.innerWidth - rect.width
  const trackX = -sliderProxy.index * (currW + baseGap)

  gsap.set(track, {
    position: 'fixed',
    left: currLeft,
    top: currTop,
    width: 'max-content',
    height: currH,
    gap: `${baseGap}px`,
    x: trackX,
    zIndex: 2
  })
  
  cardEls.value.forEach(el => {
    if (el) {
      gsap.set(el, {
        width: currW,
        height: currH,
        flex: 'none'
      })
    }
  })

  const startRoomLeft = rect.left + rect.width * (HOLE.centerX - HOLE.width / 2)
  const startRoomTop = rect.top + rect.height * (HOLE.centerY - HOLE.height / 2)
  const startRoomW = rect.width * HOLE.width
  const startRoomH = rect.height * HOLE.height

  const overScale = 1.10
  const endRoomW = window.innerWidth * overScale
  const endRoomH = window.innerHeight * overScale
  const endRoomLeft = (window.innerWidth - endRoomW) / 2
  const endRoomTop = (window.innerHeight - endRoomH) / 2

  const currRoomLeft = startRoomLeft + (endRoomLeft - startRoomLeft) * easeP
  const currRoomTop = startRoomTop + (endRoomTop - startRoomTop) * easeP
  const currRoomW = startRoomW + (endRoomW - startRoomW) * easeP
  const currRoomH = startRoomH + (endRoomH - startRoomH) * easeP

  const roomLayer = document.querySelector('.room-layer') as HTMLElement
  
  if (roomLayer) {
    gsap.set(roomLayer, {
      position: 'fixed',
      left: currRoomLeft,
      top: currRoomTop,
      width: currRoomW,
      height: currRoomH,
      borderRadius: 10 - (10 * easeP),
      zIndex: 1
    })
  }
  
  if (parallaxContainer.value) {
    const imgScale = 1.05 + (0.15 * (1 - easeP))
    gsap.set(parallaxContainer.value, { scale: imgScale, transformOrigin: 'center center' })
  }

  const canvasOpacity = 1 - Math.min(1, Math.max(0, (easeP - 0.1) / 0.5))
  if (canvasEl.value) canvasEl.value.style.opacity = canvasOpacity.toString()
}

// ── Trigger enter animation ───────────────────────────────────────────────
function enterCard() {
  if (isZoomed.value) return
  isZoomed.value = true
  lenis?.stop()
  
  const dummy = { p: 0 }
  gsap.to(dummy, {
    p: 1,
    duration: 1.8,
    ease: "power4.inOut",
    onUpdate: () => {
      currentZoomP = dummy.p
      renderCardZoom(currentZoomP)
    },
    onComplete: () => {
      lenis?.start()
      window.addEventListener('mousemove', handleMouseMove)
      
      // Start idle timeout if user doesn't move mouse
      if (idleTimeout) clearTimeout(idleTimeout)
      idleTimeout = setTimeout(startIdleAnimation, 2000)
    }
  })
}

// ── Exit animation ────────────────────────────────────────────────────────
function exitCard() {
  if (!isZoomed.value) return
  isZoomed.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  
  if (idleTimeout) clearTimeout(idleTimeout)
  if (idleTween) idleTween.kill()
  
  if (parallaxContainer.value) {
    gsap.to(parallaxContainer.value, { x: 0, y: 0, duration: 0.8, ease: "power3.out" })
  }

  const dummy = { p: currentZoomP }
  gsap.to(dummy, {
    p: 0,
    duration: 1.6,
    ease: "power4.inOut",
    onUpdate: () => {
      currentZoomP = dummy.p
      renderCardZoom(currentZoomP)
    },
    onComplete: () => {
      lenis?.start()
    }
  })
}

// ── Parallax POV (Camera Pan) ─────────────────────────────────────────────
function handleMouseMove(e: MouseEvent) {
  if (!isZoomed.value || !parallaxContainer.value) return
  
  if (idleTimeout) clearTimeout(idleTimeout)
  if (idleTween) {
    idleTween.kill()
    idleTween = null
  }
  
  const nx = (e.clientX / window.innerWidth) - 0.5
  const ny = (e.clientY / window.innerHeight) - 0.5
  
  const maxMoveX = window.innerWidth * 0.05
  const maxMoveY = window.innerHeight * 0.05

  gsap.to(parallaxContainer.value, {
    x: nx * -(maxMoveX * 2),
    y: ny * -(maxMoveY * 2),
    duration: 1.2,
    ease: "power2.out"
  })

  // Restart idle animation if mouse stays still
  idleTimeout = setTimeout(startIdleAnimation, 3000)
}

// ── Preload ───────────────────────────────────────────────────────────────
function prepareCabinAudio() {
  const chime = new Audio('/audios/cabin_chime.mp3')
  const announcement = new Audio('/audios/flight-attendant-announcement.mp3')
  chime.preload = 'auto'
  announcement.preload = 'auto'
  preparedCabinChime.value = chime
  preparedCabinAnnouncement.value = announcement
}

function removeCabinAudioPrimeListeners() {
  window.removeEventListener('pointerdown', primeCabinAudio)
  window.removeEventListener('touchstart', primeCabinAudio)
  window.removeEventListener('keydown', primeCabinAudio)
}

async function primeCabinAudio() {
  if (cabinAudioPrimed || cabinAudioPriming || showCabinScene.value) return
  const chime = preparedCabinChime.value
  const announcement = preparedCabinAnnouncement.value
  if (!chime || !announcement) return

  cabinAudioPriming = true
  const elements = [chime, announcement]
  for (const audio of elements) {
    audio.muted = false
    audio.volume = 0.001
    audio.currentTime = 0
  }

  // Both play() calls are issued synchronously inside the same genuine user
  // gesture. Mobile browsers then keep these exact elements authorised for the
  // later automatic Cabin sequence.
  const results = await Promise.allSettled(elements.map(audio => audio.play()))
  for (const audio of elements) {
    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
  }

  cabinAudioPrimed = results.every(result => result.status === 'fulfilled')
  cabinAudioPriming = false
  if (cabinAudioPrimed) removeCabinAudioPrimeListeners()
}

function preloadFrames(): Promise<void> {
  return new Promise(resolve => {
    let loaded = 0
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image()
      img.src = FRAME_PATH(i)
      img.onload = img.onerror = () => {
        loaded++
        loadProgress.value = (loaded / TOTAL_FRAMES) * 100
        if (loaded === TOTAL_FRAMES) resolve()
      }
      images[i - 1] = img
    }
  })
}

function findNearestLoadedFrame(
  frames: Array<HTMLImageElement | undefined>,
  targetIndex: number,
): HTMLImageElement | undefined {
  const exact = frames[targetIndex]
  if (exact?.complete && exact.naturalWidth) return exact

  for (let offset = 1; offset < frames.length; offset++) {
    const before = frames[targetIndex - offset]
    const after = frames[targetIndex + offset]
    if (before?.complete && before.naturalWidth) return before
    if (after?.complete && after.naturalWidth) return after
  }
  return undefined
}

function loadGymFrame(index: number): Promise<HTMLImageElement | null> {
  const safeIndex = Math.max(0, Math.min(GYM_TOTAL_FRAMES - 1, index))
  const cached = gymFrames[safeIndex]
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached)
  const pending = gymFramePromises.get(safeIndex)
  if (pending) return pending

  const request = new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      gymFrames[safeIndex] = image
      gymFramePromises.delete(safeIndex)
      if (showWelcome.value) renderGymSequence(gymSequenceProgress)
      resolve(image)
    }
    image.onerror = () => {
      gymFramePromises.delete(safeIndex)
      resolve(null)
    }
    image.src = GYM_FRAME_PATH(safeIndex + 1)
  })

  gymFramePromises.set(safeIndex, request)
  return request
}

function loadFishermanFrame(index: number): Promise<HTMLImageElement | null> {
  const safeIndex = Math.max(0, Math.min(FISHERMAN_TOTAL_FRAMES - 1, index))
  const cached = fishermanFrames[safeIndex]
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached)
  const pending = fishermanFramePromises.get(safeIndex)
  if (pending) return pending

  const request = new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      fishermanFrames[safeIndex] = image
      fishermanFramePromises.delete(safeIndex)
      if (fishermanTransitionProgress > 0) {
        renderFishermanTransition(fishermanTransitionProgress)
      }
      resolve(image)
    }
    image.onerror = () => {
      fishermanFramePromises.delete(safeIndex)
      resolve(null)
    }
    image.src = FISHERMAN_FRAME_PATH(safeIndex + 1)
  })

  fishermanFramePromises.set(safeIndex, request)
  return request
}

async function preloadSequenceFrames(
  totalFrames: number,
  loader: (index: number) => Promise<HTMLImageElement | null>,
  isCancelled: () => boolean,
) {
  let nextIndex = 1
  const worker = async () => {
    while (!isCancelled() && nextIndex < totalFrames) {
      await loader(nextIndex++)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

async function preloadGymFrames() {
  gymPreloadCancelled = false
  await loadGymFrame(0)
  await preloadSequenceFrames(GYM_TOTAL_FRAMES, loadGymFrame, () => gymPreloadCancelled)
}

async function preloadFishermanFrames() {
  fishermanPreloadCancelled = false
  await loadFishermanFrame(0)
  await preloadSequenceFrames(
    FISHERMAN_TOTAL_FRAMES,
    loadFishermanFrame,
    () => fishermanPreloadCancelled,
  )
}

function loadRedbullFrame(index: number): Promise<HTMLImageElement | null> {
  const safeIndex = Math.max(0, Math.min(REDBULL_TOTAL_FRAMES - 1, index))
  const cached = redbullFrames[safeIndex]
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached)

  const pending = redbullFramePromises.get(safeIndex)
  if (pending) return pending

  const request = new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      redbullFrames[safeIndex] = image
      redbullFramePromises.delete(safeIndex)
      if (redbullSequenceProgress > 0) renderRedbullSequence(redbullSequenceProgress)
      resolve(image)
    }
    image.onerror = () => {
      redbullFramePromises.delete(safeIndex)
      resolve(null)
    }
    image.src = REDBULL_FRAME_PATH(safeIndex + 1)
  })

  redbullFramePromises.set(safeIndex, request)
  return request
}

async function preloadRedbullFrames() {
  redbullPreloadCancelled = false
  await loadRedbullFrame(0)

  let nextIndex = 1
  const worker = async () => {
    while (!redbullPreloadCancelled && nextIndex < REDBULL_TOTAL_FRAMES) {
      const index = nextIndex++
      await loadRedbullFrame(index)
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker))
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  zoom = 1,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.clearRect(0, 0, width, height)
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
}

function renderGymSequence(progress: number) {
  const canvas = gymSequenceCanvas.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return

  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  const frameIndex = Math.round(clamp01(progress) * (GYM_TOTAL_FRAMES - 1))
  const exactFrame = gymFrames[frameIndex]
  if (!exactFrame?.complete || !exactFrame.naturalWidth) void loadGymFrame(frameIndex)
  const image = findNearestLoadedFrame(gymFrames, frameIndex)
  if (!image) return
  drawImageCover(context, image, canvas.width, canvas.height)
}

async function initGymCabinFluid(): Promise<boolean> {
  const canvas = gymCabinFluidCanvas.value
  if (!canvas) return false

  try {
    gymCabinFluidScene = new THREE.Scene()
    gymCabinFluidCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    gymCabinFluidCamera.position.z = 1
    gymCabinFluidRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    })
    gymCabinFluidRenderer.outputColorSpace = THREE.SRGBColorSpace

    const sourceTexture = await new THREE.TextureLoader().loadAsync('/images/kabin dan jendela.png')
    const sourceImage = sourceTexture.image as HTMLImageElement
    const maxDimension = 4096
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height
    // The lower 3762x1758 region is the windowed cabin. Sampling only the
    // upper region gives the dissolve its plain wall while keeping both
    // scenes sourced from the exact same exported texture.
    const windowSectionAspect = 3762 / 1758
    const windowSectionHeight = Math.min(sourceHeight, sourceWidth / windowSectionAspect)
    const plainSectionHeight = Math.max(1, sourceHeight - windowSectionHeight)
    const sourceScale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    const preparedSource = document.createElement('canvas')
    preparedSource.width = Math.max(1, Math.round(sourceWidth * sourceScale))
    preparedSource.height = Math.max(1, Math.round(plainSectionHeight * sourceScale))
    const preparedContext = preparedSource.getContext('2d')
    if (!preparedContext) throw new Error('Could not prepare cabin transition texture')
    preparedContext.imageSmoothingEnabled = true
    preparedContext.imageSmoothingQuality = 'high'
    preparedContext.drawImage(
      sourceImage,
      0,
      0,
      sourceWidth,
      plainSectionHeight,
      0,
      0,
      preparedSource.width,
      preparedSource.height,
    )
    sourceTexture.dispose()

    // Match CabinTestView's high-quality 4096px Canvas2D preparation before
    // handing the image to WebGL. The dissolve shader itself stays unchanged.
    gymCabinFluidTexture = new THREE.CanvasTexture(preparedSource)
    gymCabinFluidTexture.colorSpace = THREE.SRGBColorSpace
    gymCabinFluidTexture.minFilter = THREE.LinearMipmapLinearFilter
    gymCabinFluidTexture.magFilter = THREE.LinearFilter
    gymCabinFluidTexture.generateMipmaps = true
    gymCabinFluidTexture.anisotropy = gymCabinFluidRenderer.capabilities.getMaxAnisotropy()

    gymCabinFluidGeometry = new THREE.PlaneGeometry(2, 2)
    gymCabinFluidMaterial = new THREE.ShaderMaterial({
      vertexShader: gymCabinVertexShader,
      fragmentShader: gymCabinFragmentShader,
      uniforms: {
        uCabinTexture: { value: gymCabinFluidTexture },
        uProgress: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCabinImageResolution: {
          value: new THREE.Vector2(
            preparedSource.width,
            preparedSource.height,
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
    gymCabinFluidMesh = new THREE.Mesh(gymCabinFluidGeometry, gymCabinFluidMaterial)
    gymCabinFluidScene.add(gymCabinFluidMesh)
    gymCabinAnimationStartTime = performance.now()
    resizeGymCabinFluid()
    return true
  } catch {
    disposeGymCabinFluid()
    return false
  }
}

function resizeGymCabinFluid() {
  if (!gymCabinFluidRenderer || !gymCabinFluidMaterial || !welcomeScene.value) return
  const width = Math.max(welcomeScene.value.clientWidth, 1)
  const height = Math.max(welcomeScene.value.clientHeight, 1)
  gymCabinFluidRenderer.setPixelRatio(getFluidPixelRatio())
  gymCabinFluidRenderer.setSize(width, height, false)
  gymCabinFluidMaterial.uniforms.uResolution.value.set(width, height)
}

function renderGymCabinFluid(time: number) {
  if (
    !showWelcome.value
    || !gymCabinFluidRenderer
    || !gymCabinFluidScene
    || !gymCabinFluidCamera
    || !gymCabinFluidMaterial
  ) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const maskSmoothing = reducedMotion ? 1 : 0.055
  gymCabinRenderedMaskProgress += (
    gymSequenceProgress - gymCabinRenderedMaskProgress
  ) * maskSmoothing
  const transitionProgress = clamp01((gymCabinRenderedMaskProgress - 0.5) / 0.5)
  const easedTransitionProgress = Math.pow(transitionProgress, 1.7)
  gymCabinFluidMaterial.uniforms.uProgress.value = easedTransitionProgress * 1.2
  gymCabinFluidMaterial.uniforms.uParallaxOffset.value = -0.045 * easedTransitionProgress
  gymCabinFluidMaterial.uniforms.uTime.value = reducedMotion
    ? 0
    : (time - gymCabinAnimationStartTime) / 1000
  gymCabinFluidRenderer.render(gymCabinFluidScene, gymCabinFluidCamera)
}

function disposeGymCabinFluid() {
  if (gymCabinFluidMesh && gymCabinFluidScene) {
    gymCabinFluidScene.remove(gymCabinFluidMesh)
  }
  gymCabinFluidTexture?.dispose()
  gymCabinFluidGeometry?.dispose()
  gymCabinFluidMaterial?.dispose()
  gymCabinFluidRenderer?.dispose()
  gymCabinFluidRenderer?.forceContextLoss()
  gymCabinFluidScene?.clear()
  gymCabinFluidRenderer = null
  gymCabinFluidScene = null
  gymCabinFluidCamera = null
  gymCabinFluidGeometry = null
  gymCabinFluidMaterial = null
  gymCabinFluidMesh = null
  gymCabinFluidTexture = null
}

function getFluidPixelRatio() {
  const mobileCap = window.innerWidth < 768 ? 1.25 : 1.5
  return Math.min(window.devicePixelRatio || 1, mobileCap)
}

function createViewportBuffer() {
  const buffer = document.createElement('canvas')
  buffer.width = Math.max(1, window.innerWidth)
  buffer.height = Math.max(1, window.innerHeight)
  return buffer
}

async function initCabinFishermanFluid(): Promise<boolean> {
  const canvas = cabinFishermanFluidCanvas.value
  if (!canvas) return false

  try {
    cabinFishermanFluidScene = new THREE.Scene()
    cabinFishermanFluidCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    cabinFishermanFluidCamera.position.z = 1
    cabinFishermanFluidRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    })
    cabinFishermanFluidRenderer.outputColorSpace = THREE.SRGBColorSpace

    cabinFishermanCabinBuffer = createViewportBuffer()
    cabinFishermanSequenceBuffer = createViewportBuffer()
    const cabinContext = cabinFishermanCabinBuffer.getContext('2d')
    const fishermanContext = cabinFishermanSequenceBuffer.getContext('2d')
    if (!cabinContext || !fishermanContext) throw new Error('Could not create transition buffers')
    cabinContext.fillStyle = '#000'
    cabinContext.fillRect(0, 0, cabinFishermanCabinBuffer.width, cabinFishermanCabinBuffer.height)
    fishermanContext.fillStyle = '#000'
    fishermanContext.fillRect(0, 0, cabinFishermanSequenceBuffer.width, cabinFishermanSequenceBuffer.height)

    cabinFishermanCabinTexture = new THREE.CanvasTexture(cabinFishermanCabinBuffer)
    cabinFishermanSequenceTexture = new THREE.CanvasTexture(cabinFishermanSequenceBuffer)
    for (const texture of [cabinFishermanCabinTexture, cabinFishermanSequenceTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = false
    }

    cabinFishermanFluidGeometry = new THREE.PlaneGeometry(2, 2)
    cabinFishermanFluidMaterial = new THREE.ShaderMaterial({
      vertexShader: gymCabinVertexShader,
      fragmentShader: cabinFishermanFragmentShader,
      uniforms: {
        uCabinTexture: { value: cabinFishermanCabinTexture },
        uFishermanTexture: { value: cabinFishermanSequenceTexture },
        uProgress: { value: 0 },
        uSpread: { value: 0.5 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    })
    cabinFishermanFluidMesh = new THREE.Mesh(
      cabinFishermanFluidGeometry,
      cabinFishermanFluidMaterial,
    )
    cabinFishermanFluidScene.add(cabinFishermanFluidMesh)
    cabinFishermanAnimationStartTime = performance.now()
    resizeCabinFishermanFluid()
    return true
  } catch {
    disposeCabinFishermanFluid()
    return false
  }
}

function resizeCabinFishermanFluid() {
  if (!cabinFishermanFluidRenderer || !cabinFishermanFluidMaterial) return
  const width = Math.max(window.innerWidth, 1)
  const height = Math.max(window.innerHeight, 1)
  cabinFishermanFluidRenderer.setPixelRatio(getFluidPixelRatio())
  cabinFishermanFluidRenderer.setSize(width, height, false)
  cabinFishermanFluidMaterial.uniforms.uResolution.value.set(width, height)

  for (const buffer of [cabinFishermanCabinBuffer, cabinFishermanSequenceBuffer]) {
    if (!buffer || (buffer.width === width && buffer.height === height)) continue
    buffer.width = width
    buffer.height = height
  }
  cabinFishermanRenderedFrame = -1
  if (frozenCabinFrame) updateCabinFishermanCabinTexture()
}

function updateCabinFishermanCabinTexture() {
  if (!frozenCabinFrame || !cabinFishermanCabinBuffer || !cabinFishermanCabinTexture) return
  const context = cabinFishermanCabinBuffer.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, cabinFishermanCabinBuffer.width, cabinFishermanCabinBuffer.height)
  context.drawImage(
    frozenCabinFrame,
    0,
    0,
    cabinFishermanCabinBuffer.width,
    cabinFishermanCabinBuffer.height,
  )
  cabinFishermanCabinTexture.needsUpdate = true
}

function updateCabinFishermanSequenceTexture(frameIndex: number, image: HTMLImageElement) {
  if (
    frameIndex === cabinFishermanRenderedFrame
    || !cabinFishermanSequenceBuffer
    || !cabinFishermanSequenceTexture
  ) return
  const context = cabinFishermanSequenceBuffer.getContext('2d')
  if (!context) return
  drawImageCover(
    context,
    image,
    cabinFishermanSequenceBuffer.width,
    cabinFishermanSequenceBuffer.height,
  )
  cabinFishermanSequenceTexture.needsUpdate = true
  cabinFishermanRenderedFrame = frameIndex
}

function renderCabinFishermanFluid(time: number) {
  if (
    !cabinFishermanFluidActive.value
    || !cabinFishermanFluidRenderer
    || !cabinFishermanFluidScene
    || !cabinFishermanFluidCamera
    || !cabinFishermanFluidMaterial
  ) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const smoothing = reducedMotion ? 1 : 0.075
  cabinFishermanRenderedProgress += (
    fishermanTransitionProgress - cabinFishermanRenderedProgress
  ) * smoothing
  const dissolveProgress = smoothstep(
    0,
    FISHERMAN_SEQUENCE_START,
    cabinFishermanRenderedProgress,
  )
  cabinFishermanFluidMaterial.uniforms.uProgress.value = dissolveProgress
  cabinFishermanFluidMaterial.uniforms.uTime.value = reducedMotion
    ? 0
    : (time - cabinFishermanAnimationStartTime) / 1000
  cabinFishermanFluidRenderer.render(cabinFishermanFluidScene, cabinFishermanFluidCamera)
}

function disposeCabinFishermanFluid() {
  if (cabinFishermanFluidMesh && cabinFishermanFluidScene) {
    cabinFishermanFluidScene.remove(cabinFishermanFluidMesh)
  }
  cabinFishermanCabinTexture?.dispose()
  cabinFishermanSequenceTexture?.dispose()
  cabinFishermanFluidGeometry?.dispose()
  cabinFishermanFluidMaterial?.dispose()
  cabinFishermanFluidRenderer?.dispose()
  cabinFishermanFluidRenderer?.forceContextLoss()
  cabinFishermanFluidScene?.clear()
  cabinFishermanFluidRenderer = null
  cabinFishermanFluidScene = null
  cabinFishermanFluidCamera = null
  cabinFishermanFluidGeometry = null
  cabinFishermanFluidMaterial = null
  cabinFishermanFluidMesh = null
  cabinFishermanCabinTexture = null
  cabinFishermanSequenceTexture = null
  cabinFishermanCabinBuffer = null
  cabinFishermanSequenceBuffer = null
}

// ── Resize ────────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
  drawFrame(Math.round(currentFrame))
  renderGymSequence(gymSequenceProgress)
  resizeGymCabinFluid()
  resizeCabinFishermanFluid()
  if (cabinTransitionActive.value) {
    if (redbullSequenceProgress > 0.0001) {
      renderRedbullSequence(redbullSequenceProgress)
    } else if (fishermanTransitionProgress > 0.0001) {
      renderFishermanTransition(fishermanTransitionProgress)
    }
  }
  if (cabinFishermanFluidActive.value) {
    renderFishermanTransition(fishermanTransitionProgress)
  }

  updateCabinPanels(cabinTransitionProgress)

  if (baseStoryScrollHeight > 0) {
    gymScrollDistance = GYM_TOTAL_FRAMES * GYM_SCROLL_PX_PER_FRAME
    cabinScrollDistance = Math.max(1800, window.innerHeight * 2)
    fishermanScrollDistance = Math.max(
      Math.ceil(
        (FISHERMAN_TOTAL_FRAMES * FISHERMAN_SCROLL_PX_PER_FRAME)
        / (1 - FISHERMAN_SEQUENCE_START),
      ),
      window.innerHeight * 2.8,
    )
    wingsuitScrollDistance = Math.max(1400, window.innerHeight * 1.8)
    updateStoryScrollHeight()
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (start: number, end: number, value: number) => {
  const progress = clamp01((value - start) / Math.max(0.0001, end - start))
  return progress * progress * (3 - 2 * progress)
}

function preloadCabinTransitionAsset(): Promise<boolean> {
  if (cabinTransitionImage) return Promise.resolve(true)
  if (cabinTransitionAssetPromise) return cabinTransitionAssetPromise

  cabinTransitionAssetPromise = new Promise<boolean>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      const sourceWidth = image.naturalWidth
      const sourceHeight = image.naturalHeight
      const windowSectionAspect = 3762 / 1758
      const cropHeight = Math.min(sourceHeight, sourceWidth / windowSectionAspect)
      const cropY = sourceHeight - cropHeight
      const buffer = document.createElement('canvas')
      buffer.width = sourceWidth
      buffer.height = Math.max(1, Math.round(cropHeight))
      const bufferContext = buffer.getContext('2d')
      if (!bufferContext) {
        resolve(false)
        return
      }
      bufferContext.imageSmoothingEnabled = true
      bufferContext.imageSmoothingQuality = 'high'
      bufferContext.drawImage(
        image,
        0,
        cropY,
        sourceWidth,
        cropHeight,
        0,
        0,
        buffer.width,
        buffer.height,
      )
      cabinTransitionImage = buffer
      resolve(true)
    }
    image.onerror = () => resolve(false)
    image.src = '/images/kabin dan jendela.png'
  })

  return cabinTransitionAssetPromise
}

function renderFishermanTransition(progress: number) {
  const sequenceProgress = clamp01(
    (progress - FISHERMAN_SEQUENCE_START) / (1 - FISHERMAN_SEQUENCE_START),
  )
  const fishermanFrameIndex = Math.round(sequenceProgress * (FISHERMAN_TOTAL_FRAMES - 1))
  const exactFishermanFrame = fishermanFrames[fishermanFrameIndex]
  if (!exactFishermanFrame?.complete || !exactFishermanFrame.naturalWidth) {
    void loadFishermanFrame(fishermanFrameIndex)
  }
  const fisherman = findNearestLoadedFrame(fishermanFrames, fishermanFrameIndex)
  if (!fisherman) return
  updateCabinFishermanSequenceTexture(fishermanFrameIndex, fisherman)
  renderCabinFishermanFluid(performance.now())
}

function renderRedbullSequence(progress: number) {
  const canvas = cabinTransitionCanvas.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return

  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  const frameIndex = Math.round(clamp01(progress) * (REDBULL_TOTAL_FRAMES - 1))
  let image = redbullFrames[frameIndex]
  if (!image?.complete || !image.naturalWidth) {
    void loadRedbullFrame(frameIndex)
    for (let offset = 1; offset < REDBULL_TOTAL_FRAMES; offset++) {
      const before = redbullFrames[frameIndex - offset]
      const after = redbullFrames[frameIndex + offset]
      if (before?.complete && before.naturalWidth) {
        image = before
        break
      }
      if (after?.complete && after.naturalWidth) {
        image = after
        break
      }
    }
  }
  if (!image?.complete || !image.naturalWidth) return

  const viewWidth = canvas.width
  const viewHeight = canvas.height
  const scale = Math.max(viewWidth / image.naturalWidth, viewHeight / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.clearRect(0, 0, viewWidth, viewHeight)
  context.drawImage(
    image,
    (viewWidth - drawWidth) / 2,
    (viewHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
}

function captureCabinFrame() {
  const source = embeddedCabinScene.value?.querySelector('canvas')
  if (!(source instanceof HTMLCanvasElement)) return
  const frame = document.createElement('canvas')
  frame.width = window.innerWidth
  frame.height = window.innerHeight
  const frameContext = frame.getContext('2d')
  if (!frameContext) return
  frameContext.drawImage(source, 0, 0, frame.width, frame.height)
  frozenCabinFrame = frame
  updateCabinFishermanCabinTexture()
}

function updateStoryScrollHeight() {
  if (!scrollContainer.value) return
  const cabinHeight = cabinScrollUnlocked.value ? cabinScrollDistance : 0
  const fishermanHeight = fishermanScrollUnlocked.value ? fishermanScrollDistance : 0
  const redbullHeight = fishermanScrollUnlocked.value ? redbullScrollDistance : 0
  const wingsuitHeight = fishermanScrollUnlocked.value ? wingsuitScrollDistance : 0
  const extraHeight = gymScrollDistance + cabinHeight + fishermanHeight + redbullHeight + wingsuitHeight
  scrollContainer.value.style.height = `${window.innerHeight + storyScrollStart + baseStoryScrollHeight + extraHeight}px`
  requestAnimationFrame(() => lenis?.resize())
}

function resetCabinToGym() {
  cabinScrollLocked.value = false
  cabinSceneActive.value = false
  showCabinScene.value = false
  cabinTransitionActive.value = false
  cabinFishermanFluidActive.value = false
  frozenCabinFrame = null
}

function updateGymFromScroll(progress: number) {
  gymSequenceProgress = clamp01(progress)
  if (progress < 0) {
    showWelcome.value = false
    if (canvasEl.value) canvasEl.value.style.visibility = 'visible'
    return
  }

  if (!showCabinScene.value || cabinTransitionProgress < 0.5) {
    showWelcome.value = true
  }
  if (canvasEl.value) canvasEl.value.style.visibility = 'hidden'
  renderGymSequence(gymSequenceProgress)
}

function updateCabinPanels(progress: number) {
  const nextProgress = clamp01(progress)

  if (welcomeScene.value) {
    welcomeScene.value.style.transform = `translate3d(0, ${-nextProgress * window.innerHeight}px, 0)`
  }

  if (embeddedCabinScene.value) {
    embeddedCabinScene.value.style.transform = `translate3d(0, ${(1 - nextProgress) * window.innerHeight}px, 0)`
  }
}

function activateCabinSceneWhenReady() {
  if (!cabinSceneReady.value || cabinTransitionProgress < 0.995) return false
  cabinSceneActive.value = true
  // Seat the incoming panel exactly on the viewport before removing the
  // outgoing layer; otherwise the 0.5% threshold can expose a thin black seam.
  updateCabinPanels(1)
  showWelcome.value = false
  cabinScrollLocked.value = true
  lenis?.stop()
  return true
}

function updateCabinFromScroll(progress: number) {
  const nextProgress = clamp01(progress)
  const previousProgress = cabinTransitionProgress
  cabinTransitionProgress = nextProgress

  if (nextProgress <= 0.0001) {
    if (previousProgress > 0.0001 || showCabinScene.value) resetCabinToGym()
    updateCabinPanels(0)
    return
  }

  cabinTransitionActive.value = false
  if (nextProgress < 0.995 && cabinSceneActive.value) cabinSceneActive.value = false
  showWelcome.value = true
  if (!showCabinScene.value) {
    showCabinScene.value = true
    requestAnimationFrame(() => updateCabinPanels(cabinTransitionProgress))
  }
  updateCabinPanels(nextProgress)

  if (nextProgress >= 0.995 && !cabinSceneActive.value) {
    // Stop at the handoff, but never remove the outgoing canvas until the
    // already-mounted cabin canvas has emitted its first rendered frame.
    cabinScrollLocked.value = true
    lenis?.stop()
    activateCabinSceneWhenReady()
  }
}

function handleEmbeddedCabinReady() {
  cabinSceneReady.value = true
  requestAnimationFrame(() => {
    updateCabinPanels(cabinTransitionProgress)
    activateCabinSceneWhenReady()
  })
}

async function handleCabinScrollUnlocked() {
  if (!showCabinScene.value) return
  if (!cabinFishermanFluidRenderer) {
    await initCabinFishermanFluid()
  }
  fishermanScrollUnlocked.value = true
  updateStoryScrollHeight()
  cabinScrollLocked.value = false
  lenis?.start()
}

function updateFishermanFromScroll(progress: number) {
  const previousProgress = fishermanTransitionProgress
  fishermanTransitionProgress = clamp01(progress)
  if (fishermanTransitionProgress <= 0.0001) {
    if (previousProgress > 0.0001) {
      cabinTransitionActive.value = false
      cabinFishermanFluidActive.value = false
      frozenCabinFrame = null
      cabinFishermanRenderedProgress = 0
      cabinFishermanRenderedFrame = -1
    }
    return
  }

  if (previousProgress <= 0.0001 && !frozenCabinFrame) {
    captureCabinFrame()
    cabinFishermanAnimationStartTime = performance.now()
  }
  cabinTransitionActive.value = false
  cabinFishermanFluidActive.value = true
  renderFishermanTransition(fishermanTransitionProgress)
}

function updateRedbullFromScroll(progress: number) {
  const previousProgress = redbullSequenceProgress
  redbullSequenceProgress = clamp01(progress)

  if (redbullSequenceProgress <= 0.0001) {
    if (previousProgress > 0.0001 && fishermanTransitionProgress >= 0.999) {
      cabinTransitionActive.value = false
      cabinFishermanFluidActive.value = true
      renderFishermanTransition(1)
    }
    return
  }

  cabinFishermanFluidActive.value = false
  cabinTransitionActive.value = true
  renderRedbullSequence(redbullSequenceProgress)
}

// ── Setup scroll ──────────────────────────────────────────────────────────
function setupScroll() {
  if (!scrollContainer.value || !viewRoot.value) return
  const videoScrollHeight = TOTAL_FRAMES * SCROLL_PX_PER_FRAME
  baseStoryScrollHeight = videoScrollHeight
  // The complete FX test owns everything through the first sequence frame.
  // A viewport-height sticky panel stops sticking one viewport before its
  // containing stage ends. Handoff there, before the FX canvas can slide up
  // and expose the sequence canvas as a second layer underneath it.
  const introMarkerTop = introTransitionMarker.value?.offsetTop
    ?? Math.round(window.innerHeight * 5.88)
  storyScrollStart = Math.max(0, introMarkerTop - window.innerHeight)
  const introStage = scrollContainer.value.querySelector<HTMLElement>('.fx-stage')
  transitionSequenceStart = Math.max(
    0,
    introStage?.offsetTop ?? storyScrollStart - window.innerHeight * 2,
  )
  transitionSequenceDistance = Math.max(1, storyScrollStart - transitionSequenceStart)
  heroScrollEnd = storyScrollStart + videoScrollHeight
  gymScrollDistance = GYM_TOTAL_FRAMES * GYM_SCROLL_PX_PER_FRAME
  cabinScrollDistance = Math.max(1800, window.innerHeight * 2)
  fishermanScrollDistance = Math.max(
    Math.ceil(
      (FISHERMAN_TOTAL_FRAMES * FISHERMAN_SCROLL_PX_PER_FRAME)
      / (1 - FISHERMAN_SEQUENCE_START),
    ),
    window.innerHeight * 2.8,
  )
  redbullScrollDistance = REDBULL_TOTAL_FRAMES * REDBULL_SCROLL_PX_PER_FRAME
  wingsuitScrollDistance = Math.max(1400, window.innerHeight * 1.8)
  updateStoryScrollHeight()

  lenis?.destroy()
  lenis = new Lenis({
    wrapper: viewRoot.value,
    content: scrollContainer.value,
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })
  
  lenis.on('scroll', ({ scroll, limit }: { scroll: number; limit: number }) => {
    if (isZoomed.value) return
    void limit
    const nextFluidHeroActive = scroll < storyScrollStart
    const completedIntroHandoff = fluidHeroActive.value && !nextFluidHeroActive
    fluidHeroActive.value = nextFluidHeroActive

    if (nextFluidHeroActive) {
      const introSequenceProgress = Math.max(
        0,
        Math.min(1, (scroll - transitionSequenceStart) / transitionSequenceDistance),
      )
      targetFrame = Math.round(introSequenceProgress * TRANSITION_SEQUENCE_LAST_FRAME)
    } else {
      const videoProgress = Math.max(0, Math.min(1, (scroll - storyScrollStart) / Math.max(1, heroScrollEnd - storyScrollStart)))
      targetFrame = videoProgress >= 0.995
        ? TOTAL_FRAMES - 1
        : TRANSITION_SEQUENCE_LAST_FRAME + Math.round(
            videoProgress * (TOTAL_FRAMES - 1 - TRANSITION_SEQUENCE_LAST_FRAME),
          )

      // The WebGL outline finishes on this exact frame. Snap the hidden base
      // canvas once at handoff so both layers match without a one-frame reset.
      if (completedIntroHandoff) {
        currentFrame = TRANSITION_SEQUENCE_LAST_FRAME
        drawFrame(TRANSITION_SEQUENCE_LAST_FRAME)
      }
    }

    const gymProgress = (scroll - heroScrollEnd) / Math.max(1, gymScrollDistance)
    updateGymFromScroll(gymProgress)

    const cabinScrollStart = heroScrollEnd + gymScrollDistance
    const transitionProgress = cabinScrollUnlocked.value
      ? (scroll - cabinScrollStart) / Math.max(1, cabinScrollDistance)
      : 0
    updateCabinFromScroll(transitionProgress)

    const fishermanProgress = fishermanScrollUnlocked.value
      ? (scroll - cabinScrollStart - cabinScrollDistance) / Math.max(1, fishermanScrollDistance)
      : 0
    updateFishermanFromScroll(fishermanProgress)

    const redbullProgress = fishermanScrollUnlocked.value
      ? (scroll - cabinScrollStart - cabinScrollDistance - fishermanScrollDistance) / Math.max(1, redbullScrollDistance)
      : 0
    updateRedbullFromScroll(redbullProgress)

    const wingsuitProgress = fishermanScrollUnlocked.value
      ? (
          scroll
          - cabinScrollStart
          - cabinScrollDistance
          - fishermanScrollDistance
          - redbullScrollDistance
        ) / Math.max(1, wingsuitScrollDistance)
      : 0
    wingsuitSectionProgress.value = clamp01(wingsuitProgress)

    // The story now stays entirely scroll-driven. The former card carousel
    // must never replace the final canvas frame.
    if (showCarousel.value) {
      showCarousel.value = false
      if (canvasEl.value) canvasEl.value.style.opacity = '1'
    }
  })

}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  resizeCanvas()
  ctx = canvasEl.value!.getContext('2d')
  prepareCabinAudio()
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('pointerdown', primeCabinAudio)
  window.addEventListener('touchstart', primeCabinAudio, { passive: true })
  window.addEventListener('keydown', primeCabinAudio)
  const [, cabinReady] = await Promise.all([
    Promise.all([preloadFrames(), loadGymFrame(0), loadFishermanFrame(0)]),
    preloadCabinTransitionAsset(),
    initGymCabinFluid(),
  ])
  cabinScrollUnlocked.value = cabinReady
  isLoading.value = false
  drawFrame(0)
  renderGymSequence(0)
  setupScroll()
  tick()
  void (async () => {
    await preloadGymFrames()
    await preloadFishermanFrames()
    await preloadRedbullFrames()
  })()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  lenis?.destroy()
  if (idleTimeout) clearTimeout(idleTimeout)
  if (idleTween) idleTween.kill()
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('touchstart', primeCabinAudio)
  removeCabinAudioPrimeListeners()
  frozenCabinFrame = null
  cabinTransitionImage = null
  cabinTransitionAssetPromise = null
  disposeGymCabinFluid()
  disposeCabinFishermanFluid()
  gymPreloadCancelled = true
  fishermanPreloadCancelled = true
  redbullPreloadCancelled = true
  gymFramePromises.clear()
  fishermanFramePromises.clear()
  redbullFramePromises.clear()
  gymFrames.fill(undefined)
  fishermanFrames.fill(undefined)
  redbullFrames.fill(undefined)
  for (const audio of [preparedCabinChime.value, preparedCabinAnnouncement.value]) {
    if (!audio) continue
    audio.pause()
    audio.src = ''
  }
  preparedCabinChime.value = null
  preparedCabinAnnouncement.value = null
})
</script>

<style scoped>
.vibe-view {
  position: fixed;
  inset: 0;
  width: 100vw;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  background: #000;
}

.vibe-view::-webkit-scrollbar {
  display: none;
}

.vibe-view.is-cabin-scroll-locked {
  overflow: hidden;
}

.vibe-view.is-fluid-hero-active .shared-nav {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(46, 46, 46, 0.14);
  box-shadow: 0 8px 28px rgba(46, 46, 46, 0.08);
}

.vibe-view.is-fluid-hero-active .nav-link {
  color: rgba(46, 46, 46, 0.58);
}

.vibe-view.is-fluid-hero-active .nav-link:hover:not(.active) {
  color: #2e2e2e;
  background: rgba(46, 46, 46, 0.08);
}

.vibe-view.is-fluid-hero-active .nav-link.active {
  color: #fff;
  background: #2e2e2e;
}

.hero-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

.cabin-transition-canvas {
  position: fixed;
  inset: 0;
  z-index: 8;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.cabin-fisherman-fluid-canvas {
  position: fixed;
  inset: 0;
  z-index: 8;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  contain: strict;
}

.embedded-cabin-scene {
  position: fixed;
  inset: 0;
  z-index: 7;
  overflow: hidden;
  transform: translate3d(0, 100%, 0);
  pointer-events: none;
  will-change: transform;
}

.embedded-cabin-scene.is-interactive {
  pointer-events: auto;
}

.scroll-container {
  position: relative;
  z-index: 2;
  width: 100vw;
  max-width: none;
}

.intro-transition-marker {
  width: 100%;
  height: 1px;
  pointer-events: none;
}

.welcome-scene {
  position: fixed;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  background: #000;
  visibility: visible;
  opacity: 0;
  pointer-events: none;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .welcome-scene,
  .embedded-cabin-scene {
    will-change: auto;
  }
}

.welcome-scene.is-active {
  opacity: 1;
  pointer-events: none;
}

.gym-sequence-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  will-change: transform;
  pointer-events: none;
}

.gym-cabin-fluid-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.loader-bar {
  width: 220px; height: 1px;
  background: rgba(255,255,255,0.12);
  border-radius: 100px; overflow: hidden;
}
.loader-fill {
  height: 100%;
  background: #fff;
  border-radius: 100px;
  transition: width 0.1s linear;
}
.loader-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.4);
}

.carousel-scene {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.cards-track {
  position: fixed;
  display: flex;
  pointer-events: all;
  transition: pointer-events 0.3s;
}

.cards-track.is-zoomed {
  pointer-events: none; /* Let clicks pass through to the room layer */
}

.card-slot {
  position: relative;
  flex-shrink: 0;
}

.room-layer {
  position: absolute;
  z-index: 1;
  overflow: hidden;
}

.parallax-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.room-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.hotspot {
  position: absolute;
  width: 44px;
  height: 44px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transform: translate(-50%, -50%);
  z-index: 10;
  color: #111;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  /* Use a bouncy spring easing for the transform */
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
}

.hotspot svg {
  width: 20px;
  height: 20px;
  transition: transform 0.3s ease;
}

.hotspot:hover {
  transform: translate(-50%, -50%) scale(1.25);
  background: #111;
  color: white;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.hotspot:hover svg {
  transform: scale(1.1);
}

.room-layer.is-zoomed .hotspot {
  opacity: 1;
  pointer-events: all;
  /* Only delay the opacity fade-in, do not delay hover transforms */
  transition: opacity 0.8s ease 1.2s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
}

.hotspot::before, .hotspot::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: radar 2s infinite linear;
  pointer-events: none;
  transition: border-color 0.3s ease;
}

.hotspot:hover::before, .hotspot:hover::after {
  border: 1px solid rgba(17, 17, 17, 0.5);
}

.hotspot::after {
  animation-delay: 1s;
}

@keyframes radar {
  0% { width: 100%; height: 100%; opacity: 1; }
  100% { width: 250%; height: 250%; opacity: 0; }
}

/* ── Navigation Arrows ────────────────────────── */
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: all;
}

.nav-arrow svg {
  width: 24px;
  height: 24px;
}

.nav-arrow:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-50%) scale(1.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.nav-arrow.prev { left: 40px; }
.nav-arrow.next { right: 40px; }

.card-frame {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  display: block;
  transition: filter 0.2s;
}

/* ── Enter button ─────────────────────────────── */
.enter-btn {
  position: absolute;
  bottom: -60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 10px 24px;
  border-radius: 30px;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.enter-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateX(-50%) scale(1.05);
}
.enter-btn.is-zoomed {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(20px);
}

/* ── Exit button ──────────────────────────────── */
.exit-btn {
  position: fixed;
  bottom: 40px;
  left: 50%;
  z-index: 50;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 10px 24px;
  border-radius: 30px;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  font-weight: 500;
  cursor: pointer;
  pointer-events: none;
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
  transition: all 0.4s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.exit-btn:hover {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateX(-50%) scale(1.05);
}
.exit-btn.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

/* ── Transitions ──────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.8s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
