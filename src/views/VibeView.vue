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
    <div class="scroll-container" ref="scrollContainer"></div>

    <!-- Carousel scene — mounts on top of canvas, card starts at EXACT canvas position -->
    <div class="carousel-scene" v-show="showCarousel" ref="carouselScene">
      
      <!-- Independent room layer that can scale beautifully without being constrained by the grey card -->
      <div class="room-layer" :class="{ 'is-zoomed': isZoomed }">
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
          <img src="/images/idcard polos.png" class="card-frame" draggable="false" />
          
          <!-- Enter button -->
          <button class="enter-btn" @click.stop="enterCard" :class="{ 'is-zoomed': isZoomed }">
            ENTER
          </button>
        </div>
      </div>
      
      <!-- Exit button (appears when zoomed) -->
      <button class="exit-btn" @click.stop="exitCard" :class="{ 'is-visible': isZoomed }">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        BACK
      </button>
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
  { id: 'doctor1', label: 'THE DOCTOR', category: 'Healthcare', room: '/images/ruangan dokter.png' },
  { id: 'doctor2', label: 'THE DOCTOR 2', category: 'Healthcare', room: '/images/ruangan dokter.png' },
  { id: 'doctor3', label: 'THE DOCTOR 3', category: 'Healthcare', room: '/images/ruangan dokter.png' }
]

const HOTSPOTS = [
  { id: 'mri', left: '72%', top: '55%' },
  { id: 'brain', left: '16%', top: '33%' },
  { id: 'tablet', left: '54%', top: '48%' },
  { id: 'machine', left: '8%', top: '65%' }
]

// ── Frame sequence config ─────────────────────────────────────────────────
const TOTAL_FRAMES = 196
const SCROLL_PX_PER_FRAME = 12
const FRAME_PATH = (i: number) => `/frames/hero/frame_${String(i).padStart(4, '0')}.jpg`

const LAST_FRAME_PNG = { w: 4320, h: 3072 }
const CARD_IN_PNG = {
  left:   0.4111,
  top:    0.2891,
  width:  0.1759,
  height: 0.4193,
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
}

// ── Zoom logic based on progress ──────────────────────────────────────────
function renderCardZoom(progress: number) {
  currentZoomP = progress
  if (!cardsTrack.value || !cardEls.value[0]) return

  const card0 = cardEls.value[0]
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
  const totalHeight = window.innerHeight + videoScrollHeight
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
    if (isZoomed.value) return
    let videoProgress = Math.max(0, Math.min(1, scroll / videoScrollHeight))
    targetFrame = Math.floor(videoProgress * (TOTAL_FRAMES - 1))
    
    if (targetFrame >= TOTAL_FRAMES - 1) {
      if (!showCarousel.value) {
        showCarousel.value = true
        renderCardZoom(0)
      }
    } else {
      if (showCarousel.value) {
        showCarousel.value = false
        if (canvasEl.value) canvasEl.value.style.opacity = '1'
      }
    }
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
  if (idleTimeout) clearTimeout(idleTimeout)
  if (idleTween) idleTween.kill()
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
.vibe-view {
  position: fixed;
  inset: 0;
  overflow: auto;
  background: #000;
}

.hero-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

.scroll-container {
  position: relative;
  z-index: 2;
  width: 100%;
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
