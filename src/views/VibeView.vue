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
      <div ref="welcomePov" class="welcome-pov">
        <video
          ref="welcomeVideo"
          class="welcome-video"
          src="/videos/video welcome gym.mp4"
          preload="auto"
          poster="/frames/hero/frame_0259.jpg"
          loop
          muted
          playsinline
          webkit-playsinline
        ></video>
      </div>

      <div class="welcome-subtitle" aria-live="polite">
        {{ typedSubtitle }}
        <span v-if="gymAudioPrompt" class="gym-audio-prompt">{{ gymAudioPrompt }}</span>
      </div>
    </section>

    <section
      v-show="cabinBridgeActive"
      ref="cabinBridgeScene"
      class="cabin-bridge-scene"
      aria-label="Airplane cabin wall"
      :aria-hidden="!cabinBridgeActive"
    >
      <img
        class="cabin-bridge-image"
        src="/images/background kabin.png"
        alt="Airplane cabin wall"
        draggable="false"
      />
    </section>

    <!-- Carousel scene — mounts on top of canvas, card starts at EXACT canvas position -->
    <canvas
      v-show="cabinTransitionActive"
      ref="cabinTransitionCanvas"
      class="cabin-transition-canvas"
      aria-hidden="true"
    ></canvas>

    <WingsuitFlightSection :progress="wingsuitSectionProgress" />

    <section v-if="showCabinScene" ref="embeddedCabinScene" class="embedded-cabin-scene">
      <CabinTestView
        embedded
        :active="cabinSceneActive"
        :paused="fishermanTransitionProgress > 0"
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
const welcomeVideo   = ref<HTMLVideoElement | null>(null)
const welcomeScene   = ref<HTMLElement | null>(null)
const welcomePov     = ref<HTMLElement | null>(null)
const showWelcome    = ref(false)
const typedSubtitle  = ref('')
const gymAudioPrompt = ref('')
const cabinTransitionCanvas = ref<HTMLCanvasElement | null>(null)
const cabinTransitionActive = ref(false)
const cabinBridgeScene = ref<HTMLElement | null>(null)
const cabinBridgeActive = ref(false)
const cabinSceneActive = ref(false)
const showCabinScene = ref(false)
const embeddedCabinScene = ref<HTMLElement | null>(null)
const cabinScrollUnlocked = ref(false)
const cabinScrollLocked = ref(false)
const fishermanScrollUnlocked = ref(false)
const wingsuitSectionProgress = ref(0)
const fluidHeroActive = ref(true)
const introTransitionMarker = ref<HTMLElement | null>(null)
const preparedCabinChime = shallowRef<HTMLAudioElement | null>(null)
const preparedCabinAnnouncement = shallowRef<HTMLAudioElement | null>(null)

const WELCOME_SUBTITLE = 'Welcome to Kevin.AI.\nYou’re now in athlete mode.'
const WELCOME_SUBTITLE_START = 0.35
const WELCOME_SUBTITLE_END_PADDING = 0.45

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
let subtitleRafId    = 0
let povRafId         = 0
let welcomeAudioUnlocked = false
let welcomeAudioPriming = false
let welcomeStarting = false
let povTargetX = 0
let povTargetY = 0
let povCurrentX = 0
let povCurrentY = 0
let povLastInteraction = 0
let povDragging = false
let povDragStartX = 0
let povDragStartY = 0
let povDragOriginX = 0
let povDragOriginY = 0
let cabinTransitionProgress = 0
let cabinTransitionImage: HTMLImageElement | null = null
let fishermanImage: HTMLImageElement | null = null
const redbullFrames: Array<HTMLImageElement | undefined> = new Array(REDBULL_TOTAL_FRAMES)
const redbullFramePromises = new Map<number, Promise<HTMLImageElement | null>>()
let frozenCabinFrame: HTMLCanvasElement | null = null
let baseStoryScrollHeight = 0
let storyScrollStart = 0
let transitionSequenceStart = 0
let transitionSequenceDistance = 1
let heroScrollEnd = 0
let cabinScrollDistance = 0
let fishermanScrollDistance = 0
let fishermanTransitionProgress = 0
let redbullScrollDistance = 0
let redbullSequenceProgress = 0
let wingsuitScrollDistance = 0
let redbullPreloadCancelled = false
let previousWelcomeVideoTime = 0
let gymPlaybackSession = 0
let gymUnlockTimer: ReturnType<typeof setTimeout> | null = null
let cabinAudioPrimed = false
let cabinAudioPriming = false
let cabinTransitionAssetPromise: Promise<boolean> | null = null

const clampPov = (value: number) => Math.max(-1, Math.min(1, value))

function getPovTravel() {
  const video = welcomeVideo.value
  if (!video) return { x: 0, y: 0 }
  return {
    x: Math.max(0, (video.offsetWidth - window.innerWidth) / 2),
    y: Math.max(0, (video.offsetHeight - window.innerHeight) / 2)
  }
}

function handleWelcomePovMove(event: PointerEvent) {
  if (!showWelcome.value || cabinTransitionActive.value) return

  const now = performance.now()
  if (povDragging && event.pointerType === 'touch') {
    const travel = getPovTravel()
    povTargetX = clampPov(povDragOriginX + (event.clientX - povDragStartX) / Math.max(1, travel.x))
    povTargetY = clampPov(povDragOriginY + (event.clientY - povDragStartY) / Math.max(1, travel.y))
    povLastInteraction = now
    return
  }

  if (event.pointerType !== 'touch') {
    povTargetX = clampPov(-((event.clientX / window.innerWidth) * 2 - 1))
    povTargetY = clampPov(-((event.clientY / window.innerHeight) * 2 - 1))
    povLastInteraction = now
  }
}

function handleWelcomePovDown(event: PointerEvent) {
  if (!showWelcome.value || cabinTransitionActive.value || event.pointerType !== 'touch') return
  povDragging = true
  povDragStartX = event.clientX
  povDragStartY = event.clientY
  povDragOriginX = povTargetX
  povDragOriginY = povTargetY
  povLastInteraction = performance.now()
  welcomeScene.value?.setPointerCapture?.(event.pointerId)
}

function handleWelcomePovUp(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  povDragging = false
  povLastInteraction = performance.now()
  if (welcomeScene.value?.hasPointerCapture?.(event.pointerId)) {
    welcomeScene.value.releasePointerCapture(event.pointerId)
  }
}

function updateWelcomePov(time: number) {
  povRafId = requestAnimationFrame(updateWelcomePov)
  if (!showWelcome.value || cabinTransitionActive.value || !welcomePov.value) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const idle = !povDragging && time - povLastInteraction > 1800
  if (idle && !reducedMotion) {
    // Layered waves produce an organic path: left, up, right, down, rather
    // than a flat horizontal sweep.
    // Idle motion stays close to center so the athlete never leaves frame.
    // Manual drag and cursor movement still retain the full -1..1 range.
    povTargetX = Math.sin(time * 0.00022) * 0.18
    povTargetY = clampPov(
      Math.sin(time * 0.00031 + 0.8) * 0.34 +
      Math.sin(time * 0.00013 - 0.4) * 0.12
    )
  }

  povCurrentX += (povTargetX - povCurrentX) * 0.055
  povCurrentY += (povTargetY - povCurrentY) * 0.055
  const travel = getPovTravel()
  gsap.set(welcomePov.value, {
    x: povCurrentX * travel.x,
    y: povCurrentY * travel.y
  })
}

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
function tick() {
  rafId = requestAnimationFrame(tick)
  if (targetFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  } else if (currentFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  }

  if (targetFrame >= TOTAL_FRAMES - 1 && currentFrame >= TOTAL_FRAMES - 1.1) {
    if (!showCabinScene.value) void startWelcomeScene()
  } else if (targetFrame < TOTAL_FRAMES - 5) {
    stopWelcomeScene()
  }
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

function stopGymMedia() {
  gymPlaybackSession += 1
  if (gymUnlockTimer) {
    clearTimeout(gymUnlockTimer)
    gymUnlockTimer = null
  }
  const video = welcomeVideo.value
  if (!video) return
  video.pause()
  video.muted = true
  video.volume = 1
}

function scheduleCabinUnlock(video: HTMLVideoElement) {
  if (gymUnlockTimer) clearTimeout(gymUnlockTimer)
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 8.2
  gymUnlockTimer = window.setTimeout(() => {
    gymUnlockTimer = null
    if (showWelcome.value && !showCabinScene.value) unlockCabinScroll()
  }, duration * 1000 + 180)
}

async function primeWelcomeAudio() {
  const video = welcomeVideo.value
  if (
    !video ||
    welcomeAudioUnlocked ||
    welcomeAudioPriming ||
    showCabinScene.value ||
    cabinTransitionProgress > 0.0001
  ) return

  welcomeAudioPriming = true
  const playbackSession = gymPlaybackSession

  video.muted = false
  video.volume = 0.001

  try {
    await video.play()
    if (playbackSession !== gymPlaybackSession) {
      if (
        showWelcome.value &&
        !showCabinScene.value &&
        cabinTransitionProgress <= 0.0001
      ) {
        welcomeAudioUnlocked = true
        gymAudioPrompt.value = ''
        video.volume = 1
        video.muted = false
        window.removeEventListener('pointerdown', primeWelcomeAudio)
        window.removeEventListener('touchstart', primeWelcomeAudio)
        window.removeEventListener('wheel', primeWelcomeAudio)
        window.removeEventListener('keydown', primeWelcomeAudio)
      }
      return
    }
    if (cabinTransitionProgress > 0.0001 || showCabinScene.value) {
      video.pause()
      video.muted = true
      return
    }
    welcomeAudioUnlocked = true
    gymAudioPrompt.value = ''
    window.removeEventListener('pointerdown', primeWelcomeAudio)
    window.removeEventListener('touchstart', primeWelcomeAudio)
    window.removeEventListener('wheel', primeWelcomeAudio)
    window.removeEventListener('keydown', primeWelcomeAudio)

    if (!showWelcome.value) video.volume = 0.001
  } catch {
    if (playbackSession !== gymPlaybackSession) return
    video.muted = true
  } finally {
    if (playbackSession === gymPlaybackSession && showWelcome.value) video.volume = 1
    welcomeAudioPriming = false
  }
}

async function startWelcomeScene() {
  if (showWelcome.value || welcomeStarting || showCabinScene.value) return
  welcomeStarting = true
  const playbackSession = ++gymPlaybackSession

  const video = welcomeVideo.value
  typedSubtitle.value = ''
  void preloadCabinTransitionAsset()
  if (!video) {
    welcomeStarting = false
    return
  }

  // Make the scene visible before calling play. Mobile Safari may reject
  // playback when the video or one of its parents is still hidden.
  povTargetX = 0
  povTargetY = 0
  povCurrentX = 0
  povCurrentY = 0
  povLastInteraction = performance.now()
  showWelcome.value = true
  if (canvasEl.value) canvasEl.value.style.visibility = 'hidden'

  video.currentTime = 0
  previousWelcomeVideoTime = 0
  video.muted = true
  video.volume = 1
  scheduleCabinUnlock(video)

  try {
    await video.play()
    if (playbackSession !== gymPlaybackSession || showCabinScene.value) {
      video.pause()
      video.muted = true
      welcomeStarting = false
      return
    }
    if (welcomeAudioUnlocked) {
      video.muted = false
      gymAudioPrompt.value = ''
      window.removeEventListener('pointerdown', primeWelcomeAudio)
      window.removeEventListener('touchstart', primeWelcomeAudio)
      window.removeEventListener('wheel', primeWelcomeAudio)
      window.removeEventListener('keydown', primeWelcomeAudio)
    }
    scheduleCabinUnlock(video)
  } catch {
    if (playbackSession !== gymPlaybackSession) {
      welcomeStarting = false
      return
    }
    video.muted = true
    await video.play().catch(() => undefined)
    if (!video.paused) scheduleCabinUnlock(video)
    if (playbackSession !== gymPlaybackSession || showCabinScene.value) {
      video.pause()
      video.muted = true
    }
  }

  welcomeStarting = false
}

function stopWelcomeScene() {
  welcomeStarting = false
  if (!showWelcome.value) return

  showWelcome.value = false
  typedSubtitle.value = ''

  const video = welcomeVideo.value
  if (video) {
    stopGymMedia()
    video.currentTime = 0
  }

  if (welcomePov.value) {
    gsap.set(welcomePov.value, { x: 0, y: 0 })
  }
  povTargetX = 0
  povTargetY = 0
  povCurrentX = 0
  povCurrentY = 0
  povDragging = false

  if (canvasEl.value) canvasEl.value.style.visibility = 'visible'
}

function updateWelcomeSubtitle() {
  subtitleRafId = requestAnimationFrame(updateWelcomeSubtitle)
  const video = welcomeVideo.value
  if (!showWelcome.value || !video) return
  if (cabinTransitionProgress > 0.0001) {
    typedSubtitle.value = ''
    return
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 8.04
  const end = Math.max(WELCOME_SUBTITLE_START + 0.5, duration - WELCOME_SUBTITLE_END_PADDING)
  const progress = Math.max(0, Math.min(1, (video.currentTime - WELCOME_SUBTITLE_START) / (end - WELCOME_SUBTITLE_START)))
  const characterCount = Math.floor(progress * WELCOME_SUBTITLE.length)
  typedSubtitle.value = WELCOME_SUBTITLE.slice(0, characterCount)
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

// ── Resize ────────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
  drawFrame(Math.round(currentFrame))
  if (cabinTransitionActive.value) {
    if (redbullSequenceProgress > 0.0001) {
      renderRedbullSequence(redbullSequenceProgress)
    } else if (fishermanTransitionProgress > 0.0001) {
      renderFishermanTransition(fishermanTransitionProgress)
    }
  }

  updateCabinPanels(cabinTransitionProgress)

  if (baseStoryScrollHeight > 0) {
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
      cabinTransitionImage = image
      resolve(true)
    }
    image.onerror = () => resolve(false)
    image.src = '/images/cabin-windows.png'
  })

  if (!fishermanImage) {
    const fisherman = new Image()
    fisherman.decoding = 'async'
    fisherman.onload = () => { fishermanImage = fisherman }
    fisherman.src = '/images/fisherman.png'
  }

  return cabinTransitionAssetPromise
}

function renderFishermanTransition(progress: number) {
  const canvas = cabinTransitionCanvas.value
  const cabin = cabinTransitionImage
  const fisherman = fishermanImage
  if (!canvas || !cabin || !fisherman) return
  const context = canvas.getContext('2d')
  if (!context) return

  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  const viewWidth = canvas.width
  const viewHeight = canvas.height
  const viewAspect = viewWidth / viewHeight
  const imageWidth = cabin.naturalWidth
  const imageHeight = cabin.naturalHeight
  const imageAspect = imageWidth / imageHeight

  const openingWidth = Math.min(
    imageWidth * 0.098,
    imageHeight * 0.285 * viewAspect
  )
  const openingHeight = openingWidth / viewAspect
  const openingX = imageWidth * 0.505 - openingWidth / 2
  const openingY = imageHeight * 0.5 - openingHeight / 2

  const finalZoom = 1.34
  let cabinWidth: number
  let cabinHeight: number
  if (imageAspect > viewAspect) {
    cabinHeight = imageHeight / finalZoom
    cabinWidth = cabinHeight * viewAspect
  } else {
    cabinWidth = imageWidth / finalZoom
    cabinHeight = cabinWidth / viewAspect
  }
  const cabinX = (imageWidth - cabinWidth) / 2
  const cabinY = (imageHeight - cabinHeight) / 2

  const windowProgress = smoothstep(0, 0.61, progress)
  const cropWidth = cabinWidth * Math.pow(openingWidth / cabinWidth, windowProgress)
  const cropHeight = cabinHeight * Math.pow(openingHeight / cabinHeight, windowProgress)
  const cabinCenterX = cabinX + cabinWidth / 2
  const cabinCenterY = cabinY + cabinHeight / 2
  const openingCenterX = openingX + openingWidth / 2
  const openingCenterY = openingY + openingHeight / 2
  const cropCenterX = cabinCenterX + (openingCenterX - cabinCenterX) * windowProgress
  const cropCenterY = cabinCenterY + (openingCenterY - cabinCenterY) * windowProgress
  const cropX = cropCenterX - cropWidth / 2
  const cropY = cropCenterY - cropHeight / 2

  const skyGradient = context.createLinearGradient(0, 0, 0, viewHeight)
  skyGradient.addColorStop(0, '#49B2E7')
  skyGradient.addColorStop(1, '#BDDAEC')
  context.fillStyle = skyGradient
  context.fillRect(0, 0, viewWidth, viewHeight)

  const fishermanReveal = smoothstep(0.58, 0.9, progress)
  if (fishermanReveal > 0) {
    const fishermanZoom = 1 + smoothstep(0.62, 1, progress) * 0.1
    const fishermanAspect = fisherman.naturalWidth / fisherman.naturalHeight
    let sourceWidth: number
    let sourceHeight: number
    if (fishermanAspect > viewAspect) {
      sourceHeight = fisherman.naturalHeight / fishermanZoom
      sourceWidth = sourceHeight * viewAspect
    } else {
      sourceWidth = fisherman.naturalWidth / fishermanZoom
      sourceHeight = sourceWidth / viewAspect
    }
    const sourceX = (fisherman.naturalWidth - sourceWidth) / 2
    const sourceY = (fisherman.naturalHeight - sourceHeight) / 2
    context.save()
    context.globalAlpha = fishermanReveal
    context.drawImage(
      fisherman,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      viewWidth,
      viewHeight
    )
    context.restore()
  }

  context.drawImage(
    cabin,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    viewWidth,
    viewHeight
  )

  if (frozenCabinFrame && progress < 0.12) {
    context.save()
    context.globalAlpha = 1 - smoothstep(0, 0.12, progress)
    context.drawImage(frozenCabinFrame, 0, 0, viewWidth, viewHeight)
    context.restore()
  }
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
}

function updateStoryScrollHeight() {
  if (!scrollContainer.value) return
  const cabinHeight = cabinScrollUnlocked.value ? cabinScrollDistance : 0
  const fishermanHeight = fishermanScrollUnlocked.value ? fishermanScrollDistance : 0
  const redbullHeight = fishermanScrollUnlocked.value ? redbullScrollDistance : 0
  const wingsuitHeight = fishermanScrollUnlocked.value ? wingsuitScrollDistance : 0
  const extraHeight = cabinHeight + fishermanHeight + redbullHeight + wingsuitHeight
  scrollContainer.value.style.height = `${window.innerHeight + storyScrollStart + baseStoryScrollHeight + extraHeight}px`
  requestAnimationFrame(() => lenis?.resize())
}

function unlockCabinScroll() {
  if (cabinScrollUnlocked.value) return
  void preloadCabinTransitionAsset().then(ready => {
    if (!ready || cabinScrollUnlocked.value) return
    cabinScrollUnlocked.value = true
    updateStoryScrollHeight()
  })
}

function handleWelcomeVideoTimeUpdate() {
  const video = welcomeVideo.value
  if (!video || !showWelcome.value || cabinScrollUnlocked.value) return
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const reachedEnd = duration > 0 && video.currentTime >= duration - 0.14
  const looped = duration > 0 && previousWelcomeVideoTime > duration * 0.72 && video.currentTime < 0.35
  previousWelcomeVideoTime = video.currentTime
  if (reachedEnd || looped) unlockCabinScroll()
}

async function resumeGymFromBeginning() {
  const video = welcomeVideo.value
  const playbackSession = ++gymPlaybackSession
  showWelcome.value = true
  cabinScrollLocked.value = false
  cabinBridgeActive.value = false
  cabinSceneActive.value = false
  showCabinScene.value = false
  cabinTransitionActive.value = false
  frozenCabinFrame = null
  typedSubtitle.value = ''
  if (!video) return
  video.currentTime = 0
  video.muted = true
  scheduleCabinUnlock(video)
  try {
    await video.play()
    if (playbackSession !== gymPlaybackSession || cabinTransitionProgress > 0.0001) {
      video.pause()
      video.muted = true
      return
    }
    if (welcomeAudioUnlocked) video.muted = false
    scheduleCabinUnlock(video)
  } catch {
    if (playbackSession !== gymPlaybackSession) return
    video.muted = true
    await video.play().catch(() => undefined)
    if (!video.paused) scheduleCabinUnlock(video)
    if (playbackSession !== gymPlaybackSession || cabinTransitionProgress > 0.0001) {
      video.pause()
      video.muted = true
    }
  }
}

function updateCabinPanels(progress: number) {
  const nextProgress = clamp01(progress)
  const firstSectionProgress = clamp01(nextProgress * 2)
  const secondSectionProgress = clamp01((nextProgress - 0.5) * 2)

  if (welcomeScene.value) {
    welcomeScene.value.style.transform = `translate3d(0, ${-firstSectionProgress * window.innerHeight}px, 0)`
  }

  if (cabinBridgeScene.value) {
    const bridgeY = nextProgress <= 0.5
      ? (1 - firstSectionProgress) * window.innerHeight
      : -secondSectionProgress * window.innerHeight
    cabinBridgeScene.value.style.transform = `translate3d(0, ${bridgeY}px, 0)`
  }

  if (embeddedCabinScene.value) {
    embeddedCabinScene.value.style.transform = `translate3d(0, ${(1 - secondSectionProgress) * window.innerHeight}px, 0)`
  }
}

function updateCabinFromScroll(progress: number) {
  const nextProgress = clamp01(progress)
  const previousProgress = cabinTransitionProgress
  cabinTransitionProgress = nextProgress

  if (nextProgress <= 0.0001) {
    if (previousProgress > 0.0001 || showCabinScene.value) resumeGymFromBeginning()
    updateCabinPanels(0)
    return
  }

  cabinTransitionActive.value = false
  cabinBridgeActive.value = true
  if (nextProgress < 0.995 && cabinSceneActive.value) cabinSceneActive.value = false
  if (nextProgress < 0.5) showWelcome.value = true
  if (nextProgress >= 0.5 && !showCabinScene.value) {
    showCabinScene.value = true
    requestAnimationFrame(() => updateCabinPanels(cabinTransitionProgress))
  }
  if (nextProgress < 0.5 && showCabinScene.value) showCabinScene.value = false
  updateCabinPanels(nextProgress)

  if (nextProgress >= 0.995 && !cabinSceneActive.value) {
    cabinSceneActive.value = true
    showWelcome.value = false
    stopGymMedia()
    lenis?.stop()
    cabinScrollLocked.value = true
  }
}

function handleEmbeddedCabinReady() {
  if (!showCabinScene.value) return
  requestAnimationFrame(() => updateCabinPanels(cabinTransitionProgress))
}

function handleCabinScrollUnlocked() {
  if (!showCabinScene.value) return
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
      frozenCabinFrame = null
    }
    return
  }

  if (previousProgress <= 0.0001 && !frozenCabinFrame) captureCabinFrame()
  cabinTransitionActive.value = true
  renderFishermanTransition(fishermanTransitionProgress)
}

function updateRedbullFromScroll(progress: number) {
  const previousProgress = redbullSequenceProgress
  redbullSequenceProgress = clamp01(progress)

  if (redbullSequenceProgress <= 0.0001) {
    if (previousProgress > 0.0001 && fishermanTransitionProgress >= 0.999) {
      cabinTransitionActive.value = true
      renderFishermanTransition(1)
    }
    return
  }

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
  cabinScrollDistance = Math.max(1800, window.innerHeight * 2)
  fishermanScrollDistance = Math.max(2400, window.innerHeight * 2.8)
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
    // Before the Cabin range exists, Lenis' live limit is the only reliable
    // endpoint on mobile because Safari's address bar changes viewport height.
    if (!cabinScrollUnlocked.value) {
      heroScrollEnd = Math.max(storyScrollStart + 1, limit || storyScrollStart + videoScrollHeight)
    }
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

    const transitionProgress = cabinScrollUnlocked.value
      ? (scroll - heroScrollEnd) / Math.max(1, cabinScrollDistance)
      : 0
    updateCabinFromScroll(transitionProgress)

    const fishermanProgress = fishermanScrollUnlocked.value
      ? (scroll - heroScrollEnd - cabinScrollDistance) / Math.max(1, fishermanScrollDistance)
      : 0
    updateFishermanFromScroll(fishermanProgress)

    const redbullProgress = fishermanScrollUnlocked.value
      ? (scroll - heroScrollEnd - cabinScrollDistance - fishermanScrollDistance) / Math.max(1, redbullScrollDistance)
      : 0
    updateRedbullFromScroll(redbullProgress)

    const wingsuitProgress = fishermanScrollUnlocked.value
      ? (
          scroll
          - heroScrollEnd
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

  const run = (t: number) => { lenis?.raf(t); requestAnimationFrame(run) }
  requestAnimationFrame(run)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  resizeCanvas()
  ctx = canvasEl.value!.getContext('2d')
  preloadCabinTransitionAsset()
  prepareCabinAudio()
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('pointerdown', primeWelcomeAudio)
  window.addEventListener('touchstart', primeWelcomeAudio, { passive: true })
  window.addEventListener('wheel', primeWelcomeAudio, { passive: true })
  window.addEventListener('keydown', primeWelcomeAudio)
  window.addEventListener('pointerdown', primeCabinAudio)
  window.addEventListener('touchstart', primeCabinAudio, { passive: true })
  window.addEventListener('keydown', primeCabinAudio)
  window.addEventListener('pointermove', handleWelcomePovMove, { passive: true })
  welcomeScene.value?.addEventListener('pointerdown', handleWelcomePovDown, { passive: true })
  welcomeVideo.value?.addEventListener('timeupdate', handleWelcomeVideoTimeUpdate)
  window.addEventListener('pointerup', handleWelcomePovUp)
  window.addEventListener('pointercancel', handleWelcomePovUp)
  povRafId = requestAnimationFrame(updateWelcomePov)
  updateWelcomeSubtitle()
  await preloadFrames()
  isLoading.value = false
  drawFrame(0)
  setupScroll()
  tick()
  void preloadRedbullFrames()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  cancelAnimationFrame(subtitleRafId)
  cancelAnimationFrame(povRafId)
  lenis?.destroy()
  if (idleTimeout) clearTimeout(idleTimeout)
  if (idleTween) idleTween.kill()
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('pointerdown', primeWelcomeAudio)
  window.removeEventListener('touchstart', primeWelcomeAudio)
  window.removeEventListener('wheel', primeWelcomeAudio)
  window.removeEventListener('keydown', primeWelcomeAudio)
  window.removeEventListener('touchstart', primeCabinAudio)
  removeCabinAudioPrimeListeners()
  window.removeEventListener('pointermove', handleWelcomePovMove)
  welcomeScene.value?.removeEventListener('pointerdown', handleWelcomePovDown)
  welcomeVideo.value?.removeEventListener('timeupdate', handleWelcomeVideoTimeUpdate)
  window.removeEventListener('pointerup', handleWelcomePovUp)
  window.removeEventListener('pointercancel', handleWelcomePovUp)
  stopGymMedia()
  frozenCabinFrame = null
  cabinTransitionImage = null
  cabinTransitionAssetPromise = null
  fishermanImage = null
  redbullPreloadCancelled = true
  redbullFramePromises.clear()
  redbullFrames.fill(undefined)
  for (const audio of [preparedCabinChime.value, preparedCabinAnnouncement.value]) {
    if (!audio) continue
    audio.pause()
    audio.src = ''
  }
  preparedCabinChime.value = null
  preparedCabinAnnouncement.value = null
  if (welcomePov.value) gsap.killTweensOf(welcomePov.value)
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

.cabin-bridge-scene {
  position: fixed;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  background: #f4f4f3;
  pointer-events: none;
  will-change: transform;
}

.cabin-bridge-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
  user-select: none;
}

.embedded-cabin-scene {
  position: fixed;
  inset: 0;
  z-index: 7;
  overflow: hidden;
  will-change: transform;
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
  .cabin-bridge-scene,
  .embedded-cabin-scene {
    will-change: auto;
  }
}

.welcome-scene.is-active {
  opacity: 1;
  pointer-events: auto;
  touch-action: pan-y;
  cursor: grab;
}

.welcome-scene.is-active:active {
  cursor: grabbing;
}

.welcome-pov {
  position: absolute;
  inset: 0;
  will-change: transform;
  pointer-events: none;
}

.welcome-video {
  position: absolute;
  left: 50%;
  top: 50%;
  width: max(124vw, 222.35vh);
  height: max(124vh, 69.14vw);
  display: block;
  max-width: none;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.welcome-subtitle {
  position: absolute;
  left: 50%;
  bottom: max(38px, calc(env(safe-area-inset-bottom) + 18px));
  z-index: 6;
  width: min(900px, calc(100vw - 32px));
  transform: translateX(-50%);
  color: #fff;
  font-size: clamp(0.9rem, 1.7vw, 1.2rem);
  font-weight: 500;
  line-height: 1.45;
  text-align: center;
  text-wrap: balance;
  white-space: pre-line;
  text-shadow: 0 2px 5px #000, 0 0 12px rgba(0, 0, 0, 0.9);
}

.gym-audio-prompt {
  display: block;
  margin-top: 7px;
  font-size: 0.72em;
  letter-spacing: 0.04em;
  opacity: 0.82;
}

@media (hover: none), (pointer: coarse) {
  .welcome-subtitle {
    bottom: max(24px, calc(env(safe-area-inset-bottom) + 12px));
    width: calc(100vw - 28px);
    font-size: 0.88rem;
  }
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
