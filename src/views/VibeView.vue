<template>
  <div class="vibe-view" ref="viewRoot">
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
    </nav>

    <!-- Fixed canvas for image sequence -->
    <canvas ref="canvasEl" class="hero-canvas" :class="{ hidden: showCarousel }"></canvas>

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loader-bar">
          <div class="loader-fill" :style="{ width: loadProgress + '%' }"></div>
        </div>
        <span class="loader-text">{{ Math.round(loadProgress) }}%</span>
      </div>
    </Transition>

    <!-- Scroll container for image sequence -->
    <div class="scroll-container" ref="scrollContainer" :class="{ hidden: showCarousel }"></div>

    <!-- Portal Carousel — appears after last frame -->
    <Transition name="carousel-appear">
      <div v-if="showCarousel" class="carousel-scene">

        <!-- Back button -->
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Hint text -->
        <p class="hint-text" :class="{ hidden: isZoomed }">Click a card to enter</p>

        <!-- Cards wrapper -->
        <div class="cards-track" ref="cardsTrack">
          <div
            v-for="(card, i) in CARDS"
            :key="card.id"
            class="card-slot"
            :class="{ active: activeCard === i, zooming: activeCard === i && isZoomed }"
            @click="enterCard(i)"
            ref="cardSlots"
          >
            <!-- Room image — positioned behind to show through the hole -->
            <div class="room-layer">
              <img :src="card.room" class="room-img" :alt="card.label" draggable="false" />
            </div>

            <!-- Card frame on top with transparent hole -->
            <img src="/images/idcard polos.png" class="card-frame" draggable="false" />

            <!-- Label below card -->
            <div class="card-label">
              <span class="card-role">{{ card.label }}</span>
              <span class="card-cat">{{ card.category }}</span>
            </div>
          </div>
        </div>

      </div>
    </Transition>

    <!-- Portal zoom overlay — full screen room reveal -->
    <div class="portal-overlay" ref="portalOverlay" v-show="isZoomed">
      <img :src="activeRoomSrc" class="portal-room-img" ref="portalRoom" />
      <button class="portal-close" @click="closePortal">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Card data ─────────────────────────────────────────────────────────────
const CARDS = [
  {
    id: 'doctor',
    label: 'THE DOCTOR',
    category: 'Healthcare',
    room: '/images/ruangan dokter.png',
  },
  // More cards can be added here later
]

// ── Config ───────────────────────────────────────────────────────────────
const TOTAL_FRAMES   = 196
const SCROLL_PX_PER_FRAME = 12
const FRAME_PATH = (i: number) =>
  `/frames/hero/frame_${String(i).padStart(4, '0')}.jpg`

// Hole position within the card PNG (measured from card dimensions)
// Card PNG is 840x1346px (approx 5:8 ratio)
// Hole: left=5.5%, right=94%, top=57%, bottom=90%
// → centerX = 50%, centerY = 73.5%
// → holeW = 88.5% of card, holeH = 33% of card
const HOLE = {
  centerX: 0.500,  // 50% from left of card
  centerY: 0.735,  // 73.5% from top of card
  width:   0.885,  // 88.5% of card width
  height:  0.330,  // 33% of card height
}

// ── Refs ──────────────────────────────────────────────────────────────────
const viewRoot       = ref<HTMLElement | null>(null)
const canvasEl       = ref<HTMLCanvasElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const cardsTrack     = ref<HTMLElement | null>(null)
const cardSlots      = ref<HTMLElement[]>([])
const portalOverlay  = ref<HTMLElement | null>(null)
const portalRoom     = ref<HTMLImageElement | null>(null)

const isLoading      = ref(true)
const loadProgress   = ref(0)
const showCarousel   = ref(false)
const activeCard     = ref(-1)
const isZoomed       = ref(false)
const activeRoomSrc  = ref('')

// ── Canvas state ──────────────────────────────────────────────────────────
const images: HTMLImageElement[] = []
let ctx: CanvasRenderingContext2D | null = null
let currentFrame = 0
let targetFrame  = 0
let lenis: Lenis | null = null
let rafId = 0
let lenisRafId = 0

// ── Draw frame ────────────────────────────────────────────────────────────
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

// ── Render loop ────────────────────────────────────────────────────────────
function tick() {
  rafId = requestAnimationFrame(tick)
  if (showCarousel.value) return
  currentFrame += (targetFrame - currentFrame) * 0.12
  drawFrame(Math.round(currentFrame))

  // Trigger carousel at very end
  if (targetFrame >= TOTAL_FRAMES - 1 && !showCarousel.value) {
    triggerCarousel()
  }
}

// ── Carousel trigger ──────────────────────────────────────────────────────
function triggerCarousel() {
  showCarousel.value = true
  // Destroy lenis and scroll events
  lenis?.destroy()
  ScrollTrigger.killAll()
}

// ── Go back to sequence ────────────────────────────────────────────────────
function goBack() {
  showCarousel.value = false
  targetFrame = TOTAL_FRAMES - 2
  currentFrame = TOTAL_FRAMES - 2
  // Re-init scroll
  setupScroll()
}

// ── Portal zoom ───────────────────────────────────────────────────────────
async function enterCard(index: number) {
  if (isZoomed.value) return
  activeCard.value = index
  activeRoomSrc.value = CARDS[index].room
  
  await nextTick()

  const slot = cardSlots.value[index] as HTMLElement
  if (!slot || !portalOverlay.value || !portalRoom.value) return

  // Get the card's current bounding rect
  const rect = slot.getBoundingClientRect()
  const cardW = rect.width
  const cardH = rect.height

  // Compute hole's screen-space rect
  const holeCX = rect.left + cardW * HOLE.centerX
  const holeCY = rect.top  + cardH * HOLE.centerY
  const holeW  = cardW * HOLE.width
  const holeH  = cardH * HOLE.height

  // Set the portal overlay initial position = hole rect
  const overlay = portalOverlay.value
  gsap.set(overlay, {
    position: 'fixed',
    left: holeCX - holeW / 2,
    top:  holeCY - holeH / 2,
    width: holeW,
    height: holeH,
    borderRadius: 12,
    overflow: 'hidden',
    opacity: 1,
    scale: 1,
    zIndex: 10000,
  })
  gsap.set(portalRoom.value, { opacity: 1 })
  isZoomed.value = true

  // Animate: expand from hole rect to fill entire screen
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Calculate how much we need to scale to fill screen
  const scaleX = vw / holeW
  const scaleY = vh / holeH
  const scaleTarget = Math.max(scaleX, scaleY) * 1.05

  gsap.to(overlay, {
    left:  holeCX - holeCX * scaleTarget,
    top:   holeCY - holeCY * scaleTarget,
    width: holeW * scaleTarget,
    height: holeH * scaleTarget,
    borderRadius: 0,
    duration: 1.2,
    ease: 'power3.inOut',
  })
}

// ── Close portal ──────────────────────────────────────────────────────────
function closePortal() {
  if (!portalOverlay.value) return
  const slot = cardSlots.value[activeCard.value] as HTMLElement
  if (!slot) { isZoomed.value = false; activeCard.value = -1; return }

  const rect = slot.getBoundingClientRect()
  const cardW = rect.width, cardH = rect.height
  const holeCX = rect.left + cardW * HOLE.centerX
  const holeCY = rect.top  + cardH * HOLE.centerY
  const holeW  = cardW * HOLE.width
  const holeH  = cardH * HOLE.height

  gsap.to(portalOverlay.value, {
    left: holeCX - holeW / 2,
    top:  holeCY - holeH / 2,
    width: holeW,
    height: holeH,
    borderRadius: 12,
    duration: 0.9,
    ease: 'power3.inOut',
    onComplete: () => {
      isZoomed.value = false
      activeCard.value = -1
      gsap.set(portalOverlay.value!, { opacity: 0 })
    }
  })
}

// ── Preload frames ────────────────────────────────────────────────────────
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

// ── Resize canvas ─────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
  drawFrame(Math.round(currentFrame))
}

// ── Setup scroll ──────────────────────────────────────────────────────────
function setupScroll() {
  if (!scrollContainer.value || !viewRoot.value) return
  showCarousel.value = false

  const totalHeight = window.innerHeight + TOTAL_FRAMES * SCROLL_PX_PER_FRAME
  scrollContainer.value.style.height = `${totalHeight}px`

  lenis = new Lenis({
    wrapper: viewRoot.value,
    content: scrollContainer.value,
    duration: 1.4,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })

  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    const progress = Math.max(0, Math.min(1, scroll / (TOTAL_FRAMES * SCROLL_PX_PER_FRAME)))
    targetFrame = Math.floor(progress * (TOTAL_FRAMES - 1))
  })

  requestAnimationFrame(lenisLoop)
}

function lenisLoop(time: number) {
  lenis?.raf(time)
  lenisRafId = requestAnimationFrame(lenisLoop)
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
  cancelAnimationFrame(lenisRafId)
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
  transition: opacity 0.6s ease;
}
.hero-canvas.hidden { opacity: 0; pointer-events: none; }

/* ── Scroll container ─────────────────────────── */
.scroll-container {
  position: relative;
  z-index: 2;
  width: 100%;
}
.scroll-container.hidden { display: none; }

/* ── Loading overlay ──────────────────────────── */
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
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
}

.back-btn {
  position: fixed;
  top: 28px;
  left: 28px;
  z-index: 60;
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
.hint-text.hidden { opacity: 0; }

/* ── Cards track ──────────────────────────────── */
.cards-track {
  display: flex;
  gap: 40px;
  align-items: center;
  padding: 60px;
  overflow-x: auto;
  scrollbar-width: none;
}
.cards-track::-webkit-scrollbar { display: none; }

/* ── Card slot ────────────────────────────────── */
.card-slot {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  /* Card displayed at 300px wide, aspect ratio of card PNG ~0.62 */
  width: 280px;
  height: 450px;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}
.card-slot:hover { transform: scale(1.04) translateY(-6px); }
.card-slot.active { z-index: 10; }

/* ── Room image layer (sits in the hole) ──────── */
.room-layer {
  position: absolute;
  z-index: 1;
  /* Hole position: centerX=50%, centerY=73.5%, w=88.5%, h=33% of card */
  /* Convert to absolute px for 280x450 card:
     holeW  = 280 * 0.885 = 247.8px
     holeH  = 450 * 0.330 = 148.5px
     holeLeft = 280 * (0.500 - 0.885/2) = 280 * 0.0575 = 16.1px
     holeTop  = 450 * (0.735 - 0.330/2) = 450 * 0.570 = 256.5px
  */
  left:   16px;
  top:    257px;
  width:  248px;
  height: 149px;
  border-radius: 12px;
  overflow: hidden;
  pointer-events: none;
}

.room-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ── Card frame (transparent hole PNG on top) ── */
.card-frame {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  display: block;
}

/* ── Card label ───────────────────────────────── */
.card-label {
  position: absolute;
  bottom: -48px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}
.card-role {
  font-family: 'Inter', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.85);
  text-transform: uppercase;
}
.card-cat {
  font-family: 'Inter', sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
}

/* ── Portal overlay ───────────────────────────── */
.portal-overlay {
  position: fixed;
  overflow: hidden;
  z-index: 10000;
  cursor: default;
  display: none;
}
.portal-overlay[style*="display: block"],
.portal-overlay:not([style*="display: none"]) {
  display: block;
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
  top: 28px;
  right: 28px;
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
.carousel-appear-enter-active { transition: opacity 0.8s ease 0.2s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s; }
.carousel-appear-leave-active { transition: opacity 0.4s ease; }
.carousel-appear-enter-from { opacity: 0; transform: scale(0.96); }
.carousel-appear-leave-to  { opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.8s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
