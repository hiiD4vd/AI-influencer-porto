<template>
  <div class="vibe-view" ref="viewRoot">
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
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
    <div class="scroll-container" ref="scrollContainer" v-show="!showCarousel"></div>

    <!-- Carousel scene — mounts on top of canvas, card starts at EXACT canvas position -->
    <div class="carousel-scene" v-show="showCarousel" ref="carouselScene">

      <!-- Back button -->
      <button class="back-btn" @click="goBack" v-show="showCarousel">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Hint -->
      <p class="hint-text" :style="{ opacity: isZoomed ? 0 : 1 }">Click a card to enter</p>

      <!-- Cards track — uses CSS transform to slide siblings in -->
      <div class="cards-track" ref="cardsTrack">
        <div
          v-for="(card, i) in CARDS"
          :key="card.id"
          class="card-slot"
          :ref="el => { if (el) cardEls[i] = el as HTMLElement }"
          @click="enterCard(i)"
        >
          <!-- Room behind the hole -->
          <div class="room-layer">
            <img :src="card.room" class="room-img" draggable="false" />
          </div>
          <!-- Card frame with transparent hole on top -->
          <img src="/images/idcard polos.png" class="card-frame" draggable="false" />
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Card data ─────────────────────────────────────────────────────────────
const CARDS = [
  { id: 'doctor', label: 'THE DOCTOR', category: 'Healthcare', room: '/images/ruangan dokter.png' },
  // add more cards here later
]

// ── Frame sequence config ─────────────────────────────────────────────────
const TOTAL_FRAMES = 196
const SCROLL_PX_PER_FRAME = 12
const FRAME_PATH = (i: number) => `/frames/hero/frame_${String(i).padStart(4, '0')}.jpg`

// ── Last frame (idcard after video.png) exact pixel bounds within the PNG ─
// PNG size: 4320 × 3072
// Card position accurately measured from pixels
const LAST_FRAME_PNG = { w: 4320, h: 3072 }
const CARD_IN_PNG = {
  left:   0.4111,
  top:    0.2891,
  width:  0.1759,
  height: 0.4193,
}

// Hole position WITHIN the card PNG (idcard polos.png)
// Accurate measurement from alpha channel
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
const carouselScene  = ref<HTMLElement | null>(null)
const cardsTrack     = ref<HTMLElement | null>(null)
const cardEls        = ref<HTMLElement[]>([])
const isLoading      = ref(true)
const loadProgress   = ref(0)
const showCarousel   = ref(false)

// ── State ─────────────────────────────────────────────────────────────────
const images: HTMLImageElement[] = []
let ctx: CanvasRenderingContext2D | null = null
let currentFrame = 0
let targetFrame  = 0
let lenis: Lenis | null = null
let rafId = 0

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
  // Don't render frames if we are fully zoomed in, but keep updating if we are transitioning
  if (targetFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  } else if (currentFrame < TOTAL_FRAMES - 1) {
    currentFrame += (targetFrame - currentFrame) * 0.12
    drawFrame(Math.round(currentFrame))
  }
}

// ── Zoom logic based on scroll ────────────────────────────────────────────
function updateZoom(progress: number) {
  if (!cardsTrack.value || !cardEls.value[0]) return

  if (progress === 0 && targetFrame < TOTAL_FRAMES - 1) {
    showCarousel.value = false
    if (canvasEl.value) canvasEl.value.style.opacity = '1'
    return
  }

  showCarousel.value = true
  const card0 = cardEls.value[0]
  const track = cardsTrack.value

  // Base rect matching canvas EXACTLY
  const rect = getCardScreenRect()

  // Final rect where hole is centered and fills screen
  const holeW = rect.width * HOLE.width
  const holeH = rect.height * HOLE.height
  const maxScale = Math.max(window.innerWidth / holeW, window.innerHeight / holeH) * 1.05

  const finalW = rect.width * maxScale
  const finalH = rect.height * maxScale
  const finalLeft = window.innerWidth / 2 - finalW * HOLE.centerX
  const finalTop  = window.innerHeight / 2 - finalH * HOLE.centerY

  const easeP = gsap.parseEase("power3.inOut")(progress)

  const currW = rect.width + (finalW - rect.width) * easeP
  const currH = rect.height + (finalH - rect.height) * easeP
  const currLeft = rect.left + (finalLeft - rect.left) * easeP
  const currTop = rect.top + (finalTop - rect.top) * easeP

  gsap.set(track, {
    position: 'fixed',
    left: currLeft,
    top: currTop,
    width: currW,
    height: currH,
    gap: 0,
  })
  gsap.set(card0, {
    width: currW,
    height: currH,
    flex: 'none'
  })

  const roomLayer = card0.querySelector('.room-layer') as HTMLElement
  if (roomLayer) {
    gsap.set(roomLayer, {
      left: currW * (HOLE.centerX - HOLE.width / 2),
      top: currH * (HOLE.centerY - HOLE.height / 2),
      width: currW * HOLE.width,
      height: currH * HOLE.height,
      borderRadius: 10 - (10 * easeP)
    })
  }

  // Fade canvas to hide the background as we zoom in (0.1 to 0.6 of the zoom progress)
  const canvasOpacity = 1 - Math.min(1, Math.max(0, (easeP - 0.1) / 0.5))
  if (canvasEl.value) canvasEl.value.style.opacity = canvasOpacity.toString()
}



// ── Preload ───────────────────────────────────────────────────────────────
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

// ── Resize ────────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
  drawFrame(Math.round(currentFrame))
}

// ── Setup scroll ──────────────────────────────────────────────────────────
function setupScroll() {
  if (!scrollContainer.value || !viewRoot.value) return
  
  const videoScrollHeight = TOTAL_FRAMES * SCROLL_PX_PER_FRAME
  const zoomScrollHeight = 1500 // 1500px of scrolling for the zoom effect
  const totalHeight = window.innerHeight + videoScrollHeight + zoomScrollHeight
  scrollContainer.value.style.height = `${totalHeight}px`

  lenis?.destroy()
  lenis = new Lenis({
    wrapper: viewRoot.value,
    content: scrollContainer.value,
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })
  
  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    // Phase 1: Video scrubbing (0 to videoScrollHeight)
    let videoProgress = Math.min(1, scroll / videoScrollHeight)
    targetFrame = Math.floor(videoProgress * (TOTAL_FRAMES - 1))
    
    // Phase 2: Zoom in (videoScrollHeight to total)
    let zoomProgress = Math.max(0, Math.min(1, (scroll - videoScrollHeight) / zoomScrollHeight))
    
    // Update zoom logic
    updateZoom(zoomProgress)
  })

  const run = (t: number) => { lenis?.raf(t); requestAnimationFrame(run) }
  requestAnimationFrame(run)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  resizeCanvas()
  ctx = canvasEl.value!.getContext('2d')
  window.addEventListener('resize', resizeCanvas)

  await preloadFrames()
  isLoading.value = false
  drawFrame(0)
  setupScroll()
  tick()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  lenis?.destroy()
  ScrollTrigger.killAll()
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.vibe-view {
  position: fixed;
  inset: 0;
  overflow: auto;
  background: #000;
}

/* ── Canvas ───────────────────────────────────── */
.hero-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

/* ── Scroll container ─────────────────────────── */
.scroll-container {
  position: relative;
  z-index: 2;
  width: 100%;
}

/* ── Loading ──────────────────────────────────── */
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

/* ── Carousel scene ───────────────────────────── */
.carousel-scene {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.back-btn {
  position: fixed;
  top: 28px;
  left: 28px;
  z-index: 60;
  pointer-events: all;
  width: 42px; height: 42px;
  border-radius: 50%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.back-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

.hint-text {
  position: fixed;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Inter', sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  pointer-events: none;
  transition: opacity 0.4s;
}

/* ── Cards track — position set dynamically by JS ─*/
.cards-track {
  position: fixed;
  display: flex;
  gap: 0;
  pointer-events: all;
}

/* ── Card slot ────────────────────────────────── */
.card-slot {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  /* size & position set dynamically */
}
.card-slot:hover .card-frame { filter: brightness(1.08); }

/* ── Room image layer ─────────────────────────── */
.room-layer {
  position: absolute;
  z-index: 1;
  overflow: hidden;
  /* position set dynamically */
}
.room-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

/* ── Card frame ───────────────────────────────── */
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

/* ── Portal overlay ───────────────────────────── */
.portal-overlay {
  display: none;
  position: fixed;
  overflow: hidden;
  z-index: 10000;
}
.portal-room-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.portal-close {
  position: fixed;
  top: 28px; right: 28px;
  z-index: 10001;
  width: 42px; height: 42px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.portal-close:hover { background: rgba(255,255,255,0.15); }

/* ── Transitions ──────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.8s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
