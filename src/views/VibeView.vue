<template>
  <div class="vibe-view" ref="viewRoot">
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
    </nav>

    <!-- Fixed canvas -->
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

    <!-- Scroll container — height defines total scroll distance -->
    <div class="scroll-container" ref="scrollContainer">

      <!-- Phase 1: Intro text (frames 0–50) -->
      <div class="text-overlay phase-1" ref="phase1">
        <p class="label">AI INFLUENCER</p>
        <h1>One identity.<br>Infinite roles.</h1>
      </div>

      <!-- Phase 2: Mid text (frames 80–130) -->
      <div class="text-overlay phase-2" ref="phase2">
        <p class="label">POWERED BY AI</p>
        <h2>Adapt to any world.<br>Own every scene.</h2>
      </div>

      <!-- Phase 3: Final reveal (last 10 frames) -->
      <div class="text-overlay phase-3" ref="phase3">
        <p class="label">THE IDENTITY</p>
        <h2>This is who I am.</h2>
        <p class="sub">AI-generated. Endlessly versatile.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Config ──────────────────────────────────────────────────────────────
const TOTAL_FRAMES = 196   // 195 video frames + 1 idcard PNG
const SCROLL_PX_PER_FRAME = 12   // px of scroll per frame → total = 196 × 12 = 2352px
const FRAME_PATH = (i: number) =>
  `/frames/hero/frame_${String(i).padStart(4, '0')}.jpg`

// For the final PNG frame we already renamed it to frame_0196.jpg during build
// so the path function works uniformly.

// ── Refs ─────────────────────────────────────────────────────────────────
const viewRoot      = ref<HTMLElement | null>(null)
const canvasEl      = ref<HTMLCanvasElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const phase1        = ref<HTMLElement | null>(null)
const phase2        = ref<HTMLElement | null>(null)
const phase3        = ref<HTMLElement | null>(null)

const isLoading     = ref(true)
const loadProgress  = ref(0)

// ── State ────────────────────────────────────────────────────────────────
const images: HTMLImageElement[] = []
let ctx: CanvasRenderingContext2D | null = null
let currentFrame = 0
let targetFrame  = 0
let lenis: Lenis | null = null
let rafId = 0

// ── Canvas draw ──────────────────────────────────────────────────────────
function drawFrame(index: number) {
  const img = images[index]
  if (!img || !ctx || !canvasEl.value) return
  const cvs = canvasEl.value
  const cW = cvs.width, cH = cvs.height
  const iW = img.naturalWidth, iH = img.naturalHeight
  if (!iW || !iH) return

  // cover-fit
  const scale = Math.max(cW / iW, cH / iH)
  const dW = iW * scale, dH = iH * scale
  const dX = (cW - dW) / 2, dY = (cH - dH) / 2

  ctx.clearRect(0, 0, cW, cH)
  ctx.drawImage(img, dX, dY, dW, dH)
}

// ── Render loop — smooth lerp between frames ─────────────────────────────
function tick() {
  rafId = requestAnimationFrame(tick)
  // lerp current toward target (0.12 factor = silky smooth)
  currentFrame += (targetFrame - currentFrame) * 0.12
  drawFrame(Math.round(currentFrame))
}

// ── Preload all frames ───────────────────────────────────────────────────
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

  // Set total scrollable height
  const totalHeight = window.innerHeight + TOTAL_FRAMES * SCROLL_PX_PER_FRAME
  scrollContainer.value.style.height = `${totalHeight}px`

  // Lenis for buttery smooth scroll inertia
  lenis = new Lenis({
    wrapper: viewRoot.value,
    content: scrollContainer.value,
    duration: 1.4,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.5,
  })

  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    const progress = Math.max(0, Math.min(1, scroll / (TOTAL_FRAMES * SCROLL_PX_PER_FRAME)))
    targetFrame = Math.floor(progress * (TOTAL_FRAMES - 1))
  })

  // Text animations via GSAP ScrollTrigger (tied to Lenis scroll position)
  ScrollTrigger.scrollerProxy(viewRoot.value, {
    scrollTop(value) {
      if (lenis && value !== undefined) lenis.scrollTo(value, { immediate: true })
      return lenis?.scroll ?? 0
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
    },
  })
  lenis.on('scroll', ScrollTrigger.update)

  const totalScrollPx = TOTAL_FRAMES * SCROLL_PX_PER_FRAME

  // Phase 1 text — appears early, fades out
  if (phase1.value) {
    gsap.fromTo(phase1.value,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0, duration: 1,
        scrollTrigger: {
          scroller: viewRoot.value,
          trigger: scrollContainer.value,
          start: 'top top',
          end: `+=${totalScrollPx * 0.18}`,
          scrub: 1.5,
        },
      }
    )
    gsap.to(phase1.value,
      {
        opacity: 0, y: -30,
        scrollTrigger: {
          scroller: viewRoot.value,
          trigger: scrollContainer.value,
          start: `+=${totalScrollPx * 0.2}`,
          end:   `+=${totalScrollPx * 0.32}`,
          scrub: 1.5,
        },
      }
    )
  }

  // Phase 2 text
  if (phase2.value) {
    gsap.fromTo(phase2.value,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0,
        scrollTrigger: {
          scroller: viewRoot.value,
          trigger: scrollContainer.value,
          start: `+=${totalScrollPx * 0.38}`,
          end:   `+=${totalScrollPx * 0.55}`,
          scrub: 1.5,
        },
      }
    )
    gsap.to(phase2.value,
      {
        opacity: 0, y: -30,
        scrollTrigger: {
          scroller: viewRoot.value,
          trigger: scrollContainer.value,
          start: `+=${totalScrollPx * 0.58}`,
          end:   `+=${totalScrollPx * 0.72}`,
          scrub: 1.5,
        },
      }
    )
  }

  // Phase 3 — idcard reveal (last 8% of scroll)
  if (phase3.value) {
    gsap.fromTo(phase3.value,
      { opacity: 0, y: 50 },
      {
        opacity: 1, y: 0,
        scrollTrigger: {
          scroller: viewRoot.value,
          trigger: scrollContainer.value,
          start: `+=${totalScrollPx * 0.88}`,
          end:   `+=${totalScrollPx * 1.0}`,
          scrub: 1.5,
        },
      }
    )
  }

  ScrollTrigger.refresh()
}

// ── Lenis RAF ────────────────────────────────────────────────────────────
let lenisRafId = 0
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

  // Draw first frame immediately
  drawFrame(0)

  setupScroll()
  tick()
  requestAnimationFrame(lenisLoop)
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
  /* height set dynamically via JS */
}

/* ── Text overlays ─────────────────────────────── */
.text-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 0 7vw 10vh;
  pointer-events: none;
  opacity: 0;
}

.text-overlay .label {
  font-family: 'Inter', sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 14px;
}

.text-overlay h1 {
  font-family: 'Syne', sans-serif;
  font-size: clamp(2.8rem, 6vw, 5.5rem);
  font-weight: 800;
  color: #fff;
  line-height: 1.08;
  text-shadow: 0 2px 40px rgba(0,0,0,0.6);
}

.text-overlay h2 {
  font-family: 'Syne', sans-serif;
  font-size: clamp(2.2rem, 4.5vw, 4rem);
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
  text-shadow: 0 2px 40px rgba(0,0,0,0.6);
}

.text-overlay .sub {
  font-family: 'Inter', sans-serif;
  font-size: 1rem;
  color: rgba(255,255,255,0.55);
  margin-top: 16px;
  letter-spacing: 0.04em;
}

.phase-3 {
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 0;
}

/* ── Loading overlay ───────────────────────────── */
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
  width: 220px;
  height: 1px;
  background: rgba(255,255,255,0.12);
  border-radius: 100px;
  overflow: hidden;
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

/* ── Fade transition ───────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.8s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
