<template>
  <div
    class="vibe-view"
    :class="{ 'is-cabin-scroll-locked': cabinScrollLocked }"
    ref="viewRoot"
  >
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
      <RouterLink to="/cabin-test" class="nav-link" :class="{ active: $route.name === 'cabin-test' }">Cabin</RouterLink>
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
    <div class="scroll-container" ref="scrollContainer"></div>

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
          :poster="FRAME_PATH(TOTAL_FRAMES)"
          loop
          playsinline
          webkit-playsinline
        ></video>
      </div>

      <div class="welcome-subtitle" aria-live="polite">{{ typedSubtitle }}</div>
    </section>

    <!-- Carousel scene — mounts on top of canvas, card starts at EXACT canvas position -->
    <canvas
      v-show="cabinTransitionActive"
      ref="cabinTransitionCanvas"
      class="cabin-transition-canvas"
      aria-hidden="true"
    ></canvas>

    <section v-if="showCabinScene" ref="embeddedCabinScene" class="embedded-cabin-scene">
      <CabinTestView
        embedded
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
const SCROLL_PX_PER_FRAME = 12
const sequenceFolder = window.matchMedia('(max-width: 700px)').matches
  ? 'hero-mobile'
  : 'hero-desktop'
const FRAME_PATH = (i: number) => `/frames/${sequenceFolder}/frame_${String(i).padStart(4, '0')}.webp`
const CABIN_IMAGE_PATH = window.matchMedia('(max-width: 700px)').matches
  ? '/images/cabin-windows-mobile-v2.webp'
  : '/images/cabin-windows-desktop-v2.webp'

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
const cabinTransitionCanvas = ref<HTMLCanvasElement | null>(null)
const cabinTransitionActive = ref(false)
const showCabinScene = ref(false)
const embeddedCabinScene = ref<HTMLElement | null>(null)
const cabinScrollUnlocked = ref(false)
const cabinScrollLocked = ref(false)
const fishermanScrollUnlocked = ref(false)
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
let frozenGymFrame: HTMLCanvasElement | null = null
let frozenCabinFrame: HTMLCanvasElement | null = null
let cabinHandoffTimeout: ReturnType<typeof setTimeout> | null = null
let baseStoryScrollHeight = 0
let heroScrollEnd = 0
let cabinScrollDistance = 0
let fishermanScrollDistance = 0
let fishermanTransitionProgress = 0
let previousWelcomeVideoTime = 0
let gymPlaybackSession = 0
let cabinAudioPrimed = false
let cabinAudioPriming = false

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
const images: Array<HTMLImageElement | undefined> = []
const loadingFrames = new Map<number, Promise<void>>()
const FRAME_CACHE_BEHIND = 8
const FRAME_CACHE_AHEAD = 14
const INITIAL_FRAME_COUNT = 12
let ctx: CanvasRenderingContext2D | null = null
let currentFrame = 0
let targetFrame  = 0
let lenis: Lenis | null = null
let lastFrameWindowCenter = -1

function loadFrame(index: number): Promise<void> {
  const frameIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, index))
  if (images[frameIndex]?.complete) return Promise.resolve()
  const pending = loadingFrames.get(frameIndex)
  if (pending) return pending

  const promise = new Promise<void>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      images[frameIndex] = image
      loadingFrames.delete(frameIndex)
      resolve()
    }
    image.onerror = () => {
      loadingFrames.delete(frameIndex)
      resolve()
    }
    image.src = FRAME_PATH(frameIndex + 1)
  })
  loadingFrames.set(frameIndex, promise)
  return promise
}

function findNearestLoadedFrame(index: number) {
  if (images[index]?.complete) return images[index]
  for (let distance = 1; distance < TOTAL_FRAMES; distance++) {
    const before = images[index - distance]
    if (before?.complete) return before
    const after = images[index + distance]
    if (after?.complete) return after
  }
  return undefined
}

function trimFrameCache(center: number) {
  const minimum = Math.max(0, center - FRAME_CACHE_BEHIND)
  const maximum = Math.min(TOTAL_FRAMES - 1, center + FRAME_CACHE_AHEAD)
  for (let index = 0; index < images.length; index++) {
    if (index < minimum || index > maximum) images[index] = undefined
  }
}

function ensureFrameWindow(center: number) {
  const frameCenter = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(center)))
  if (frameCenter === lastFrameWindowCenter) return
  lastFrameWindowCenter = frameCenter
  trimFrameCache(frameCenter)

  const order = [frameCenter]
  for (let distance = 1; distance <= FRAME_CACHE_AHEAD; distance++) {
    if (frameCenter + distance < TOTAL_FRAMES) order.push(frameCenter + distance)
    if (distance <= FRAME_CACHE_BEHIND && frameCenter - distance >= 0) order.push(frameCenter - distance)
  }
  void Promise.all(order.map(loadFrame)).then(() => {
    trimFrameCache(lastFrameWindowCenter)
    drawFrame(Math.round(currentFrame))
  })
}

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
  const frameIndex = Math.max(0, Math.min(index, TOTAL_FRAMES - 1))
  const img = findNearestLoadedFrame(frameIndex)
  if (!images[frameIndex]) void loadFrame(frameIndex).then(() => drawFrame(frameIndex))
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
  const video = welcomeVideo.value
  if (!video) return
  video.pause()
  video.muted = true
  video.volume = 1
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
    if (
      playbackSession !== gymPlaybackSession ||
      cabinTransitionProgress > 0.0001 ||
      showCabinScene.value
    ) {
      video.pause()
      video.muted = true
      return
    }
    welcomeAudioUnlocked = true
    window.removeEventListener('pointerdown', primeWelcomeAudio)
    window.removeEventListener('touchstart', primeWelcomeAudio)
    window.removeEventListener('wheel', primeWelcomeAudio)
    window.removeEventListener('keydown', primeWelcomeAudio)

    // Keep this exact video element playing almost silently after the genuine
    // scroll/touch gesture. When the Gym becomes visible it can be rewound and
    // raised to full volume without asking for another click.
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
  // Start fetching the next physical scene while the Gym video is playing,
  // so the first transition scroll never waits for the cabin asset.
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
  video.muted = false
  video.volume = 1

  try {
    await video.play()
    if (playbackSession !== gymPlaybackSession || showCabinScene.value) {
      video.pause()
      video.muted = true
      welcomeStarting = false
      return
    }
    welcomeAudioUnlocked = true
    window.removeEventListener('pointerdown', primeWelcomeAudio)
    window.removeEventListener('touchstart', primeWelcomeAudio)
    window.removeEventListener('wheel', primeWelcomeAudio)
    window.removeEventListener('keydown', primeWelcomeAudio)
  } catch {
    if (playbackSession !== gymPlaybackSession) {
      welcomeStarting = false
      return
    }
    video.muted = true
    await video.play().catch(() => undefined)
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
  let loaded = 0
  return Promise.all(
    Array.from({ length: INITIAL_FRAME_COUNT }, (_, index) =>
      loadFrame(index).finally(() => {
        loaded++
        loadProgress.value = (loaded / INITIAL_FRAME_COUNT) * 100
      })
    )
  ).then(() => undefined)
}

// ── Resize ────────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
  drawFrame(Math.round(currentFrame))
  if (cabinTransitionActive.value) {
    if (fishermanTransitionProgress > 0.0001) {
      renderFishermanTransition(fishermanTransitionProgress)
    } else {
      renderCabinTransition(cabinTransitionProgress)
    }
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (start: number, end: number, value: number) => {
  const progress = clamp01((value - start) / Math.max(0.0001, end - start))
  return progress * progress * (3 - 2 * progress)
}

let cabinAssetPromise: Promise<void> | null = null
let fishermanAssetPromise: Promise<void> | null = null

function preloadCabinTransitionAsset() {
  if (cabinTransitionImage) return Promise.resolve()
  if (cabinAssetPromise) return cabinAssetPromise
  cabinAssetPromise = new Promise<void>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => { cabinTransitionImage = image; resolve() }
    image.onerror = () => resolve()
    image.src = CABIN_IMAGE_PATH
  })
  return cabinAssetPromise
}

function preloadFishermanAsset() {
  if (fishermanImage) return Promise.resolve()
  if (fishermanAssetPromise) return fishermanAssetPromise
  fishermanAssetPromise = new Promise<void>(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => { fishermanImage = image; resolve() }
    image.onerror = () => resolve()
    image.src = '/images/fisherman.webp'
  })
  return fishermanAssetPromise
}

function captureWelcomeFrame() {
  const canvas = cabinTransitionCanvas.value
  const video = welcomeVideo.value
  if (!canvas) return false

  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width
  canvas.height = height
  const frame = document.createElement('canvas')
  frame.width = width
  frame.height = height
  const frameContext = frame.getContext('2d')
  if (!frameContext) return false

  if (video && video.readyState >= 2) {
    const videoWidth = video.offsetWidth || width
    const videoHeight = video.offsetHeight || height
    const x = (width - videoWidth) / 2 + povCurrentX * getPovTravel().x
    const y = (height - videoHeight) / 2 + povCurrentY * getPovTravel().y
    frameContext.drawImage(video, x, y, videoWidth, videoHeight)
  } else {
    const fallback = images[TOTAL_FRAMES - 1]
    if (!fallback) return false
    const scale = Math.max(width / fallback.naturalWidth, height / fallback.naturalHeight)
    const drawWidth = fallback.naturalWidth * scale
    const drawHeight = fallback.naturalHeight * scale
    frameContext.drawImage(
      fallback,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    )
  }

  frozenGymFrame = frame
  return true
}

function renderCabinTransition(progress: number) {
  const canvas = cabinTransitionCanvas.value
  const cabin = cabinTransitionImage
  const gym = frozenGymFrame
  if (!canvas || !cabin || !gym) return
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

  // Fit the initial camera fully inside the transparent opening on both wide
  // desktop screens and tall mobile screens, so the first transition frame is
  // indistinguishable from the frozen full-screen Gym image.
  const startWidth = Math.min(
    imageWidth * 0.098,
    imageHeight * 0.285 * viewAspect
  )
  const startHeight = startWidth / viewAspect
  const startX = imageWidth * 0.505 - startWidth / 2
  const startY = imageHeight * 0.5 - startHeight / 2

  const finalZoom = 1.34
  let finalWidth: number
  let finalHeight: number
  if (imageAspect > viewAspect) {
    finalHeight = imageHeight / finalZoom
    finalWidth = finalHeight * viewAspect
  } else {
    finalWidth = imageWidth / finalZoom
    finalHeight = finalWidth / viewAspect
  }
  const finalX = (imageWidth - finalWidth) / 2
  const finalY = (imageHeight - finalHeight) / 2

  const eased = progress * progress * (3 - 2 * progress)
  // Multiplicative interpolation behaves like a camera dolly: every scroll
  // step changes scale proportionally instead of suddenly flattening the wall.
  const cropWidth = startWidth * Math.pow(finalWidth / startWidth, eased)
  const cropHeight = startHeight * Math.pow(finalHeight / startHeight, eased)
  const startCenterX = startX + startWidth / 2
  const startCenterY = startY + startHeight / 2
  const finalCenterX = finalX + finalWidth / 2
  const finalCenterY = finalY + finalHeight / 2
  const cropCenterX = startCenterX + (finalCenterX - startCenterX) * eased
  const cropCenterY = startCenterY + (finalCenterY - startCenterY) * eased
  const cropX = cropCenterX - cropWidth / 2
  const cropY = cropCenterY - cropHeight / 2

  const skyGradient = context.createLinearGradient(0, 0, 0, viewHeight)
  skyGradient.addColorStop(0, '#49B2E7')
  skyGradient.addColorStop(1, '#BDDAEC')
  // The frozen Gym fills the complete background plane. The transparent
  // window opening performs the crop, so rectangular snapshot edges can never
  // appear inside the window.
  context.drawImage(gym, 0, 0, viewWidth, viewHeight)
  context.save()
  context.globalAlpha = smoothstep(0.66, 0.96, progress)
  context.fillStyle = skyGradient
  context.fillRect(0, 0, viewWidth, viewHeight)
  context.restore()

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
  const extraHeight = cabinHeight + fishermanHeight
  scrollContainer.value.style.height = `${window.innerHeight + baseStoryScrollHeight + extraHeight}px`
  requestAnimationFrame(() => lenis?.resize())
}

function unlockCabinScroll() {
  if (cabinScrollUnlocked.value) return
  void preloadCabinTransitionAsset().then(() => {
    if (cabinScrollUnlocked.value || !cabinTransitionImage) return
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
  showCabinScene.value = false
  cabinTransitionActive.value = false
  frozenGymFrame = null
  frozenCabinFrame = null
  typedSubtitle.value = ''
  if (cabinHandoffTimeout) {
    clearTimeout(cabinHandoffTimeout)
    cabinHandoffTimeout = null
  }
  if (!video) return
  video.currentTime = 0
  video.muted = false
  try {
    await video.play()
    if (playbackSession !== gymPlaybackSession || cabinTransitionProgress > 0.0001) {
      video.pause()
      video.muted = true
      return
    }
    welcomeAudioUnlocked = true
  } catch {
    if (playbackSession !== gymPlaybackSession) return
    video.muted = true
    await video.play().catch(() => undefined)
    if (playbackSession !== gymPlaybackSession || cabinTransitionProgress > 0.0001) {
      video.pause()
      video.muted = true
    }
  }
}

function updateCabinFromScroll(progress: number) {
  const nextProgress = clamp01(progress)
  const previousProgress = cabinTransitionProgress
  cabinTransitionProgress = nextProgress

  if (nextProgress <= 0.0001) {
    if (previousProgress > 0.0001 || showCabinScene.value) resumeGymFromBeginning()
    return
  }

  if (!frozenGymFrame) {
    if (!cabinTransitionImage || !captureWelcomeFrame()) return
    removeCabinAudioPrimeListeners()
    stopGymMedia()
    typedSubtitle.value = ''
  }

  if (nextProgress < 0.995) {
    if (cabinHandoffTimeout) {
      clearTimeout(cabinHandoffTimeout)
      cabinHandoffTimeout = null
    }
    showCabinScene.value = false
    cabinTransitionActive.value = true
    renderCabinTransition(nextProgress)
    return
  }

  renderCabinTransition(1)
  cabinTransitionActive.value = true
  if (!showCabinScene.value) {
    showWelcome.value = false
    stopGymMedia()
    lenis?.stop()
    cabinScrollLocked.value = true
    showCabinScene.value = true
  }
}

function handleEmbeddedCabinReady() {
  if (!showCabinScene.value) return
  void preloadFishermanAsset()
  // The transition remains visible until the Cabin canvas has drawn its first
  // real frame, so clouds and camera motion are already running at handoff.
  requestAnimationFrame(() => {
    cabinTransitionActive.value = false
  })
}

function handleCabinScrollUnlocked() {
  if (!showCabinScene.value) return
  void preloadFishermanAsset().then(() => {
    if (!fishermanImage) return
    fishermanScrollUnlocked.value = true
    updateStoryScrollHeight()
    cabinScrollLocked.value = false
    lenis?.start()
  })
}

function updateFishermanFromScroll(progress: number) {
  const previousProgress = fishermanTransitionProgress
  fishermanTransitionProgress = clamp01(progress)
  if (fishermanTransitionProgress <= 0.0001) {
    // The interactive Cabin remains mounted, so reversing the scroll returns
    // to it immediately without replaying its completed announcement.
    cabinTransitionActive.value = false
    if (previousProgress > 0.0001) frozenCabinFrame = null
    return
  }

  if (previousProgress <= 0.0001 && !frozenCabinFrame) captureCabinFrame()
  cabinTransitionActive.value = true
  renderFishermanTransition(fishermanTransitionProgress)
}

// ── Setup scroll ──────────────────────────────────────────────────────────
function setupScroll() {
  if (!scrollContainer.value || !viewRoot.value) return
  const videoScrollHeight = TOTAL_FRAMES * SCROLL_PX_PER_FRAME
  baseStoryScrollHeight = videoScrollHeight
  heroScrollEnd = videoScrollHeight
  cabinScrollDistance = Math.max(2800, window.innerHeight * 3.2)
  fishermanScrollDistance = Math.max(2400, window.innerHeight * 2.8)
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
      heroScrollEnd = Math.max(1, limit || videoScrollHeight)
    }
    const videoProgress = Math.max(0, Math.min(1, scroll / Math.max(1, heroScrollEnd)))
    targetFrame = videoProgress >= 0.995
      ? TOTAL_FRAMES - 1
      : Math.round(videoProgress * (TOTAL_FRAMES - 1))
    ensureFrameWindow(targetFrame)

    const transitionProgress = cabinScrollUnlocked.value
      ? (scroll - heroScrollEnd) / Math.max(1, cabinScrollDistance)
      : 0
    updateCabinFromScroll(transitionProgress)

    const fishermanProgress = fishermanScrollUnlocked.value
      ? (scroll - heroScrollEnd - cabinScrollDistance) / Math.max(1, fishermanScrollDistance)
      : 0
    updateFishermanFromScroll(fishermanProgress)
    
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
  if (cabinHandoffTimeout) clearTimeout(cabinHandoffTimeout)
  frozenGymFrame = null
  frozenCabinFrame = null
  cabinTransitionImage = null
  fishermanImage = null
  cabinAssetPromise = null
  fishermanAssetPromise = null
  images.length = 0
  loadingFrames.clear()
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
  overflow: auto;
  background: #000;
}

.vibe-view.is-cabin-scroll-locked {
  overflow: hidden;
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

.embedded-cabin-scene {
  position: fixed;
  inset: 0;
  z-index: 7;
  overflow: hidden;
}

.scroll-container {
  position: relative;
  z-index: 2;
  width: 100%;
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
