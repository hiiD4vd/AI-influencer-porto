<template>
  <section
    class="wingsuit-flight"
    :class="{ 'is-interactive': interactionEnabled }"
    :style="{ opacity: compositeOpacity }"
    :aria-hidden="!sectionVisible"
    aria-label="Interactive wingsuit flight over the mountains"
    @pointermove="handlePointerMove"
    @pointerleave="returnToCenter"
    @pointercancel="returnToCenter"
  >
    <div class="wingsuit-media" aria-hidden="true">
      <video
        ref="videoA"
        class="wingsuit-background"
        src="/videos/background terjun.mp4"
        muted
        playsinline
        preload="auto"
        @loadedmetadata="prepareVideoFrame"
      ></video>
      <video
        ref="videoB"
        class="wingsuit-background is-secondary"
        src="/videos/background terjun.mp4"
        muted
        playsinline
        preload="auto"
        @loadedmetadata="prepareVideoFrame"
      ></video>

      <img
        ref="flyerLayer"
        class="wingsuit-flyer"
        src="/images/kepin terjun transparan.png"
        alt=""
        draggable="false"
      />
      <div class="wingsuit-vignette"></div>
    </div>

    <div
      class="wingsuit-hint"
      :class="{ 'is-visible': interactionEnabled && !hasInteracted }"
      aria-hidden="true"
    >
      MOVE TO FLY
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  progress: number
}>()

const videoA = ref<HTMLVideoElement | null>(null)
const videoB = ref<HTMLVideoElement | null>(null)
const flyerLayer = ref<HTMLImageElement | null>(null)
const hasInteracted = ref(false)

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const clamp01 = (value: number) => clamp(value, 0, 1)
const smoothstep = (start: number, end: number, value: number) => {
  const x = clamp01((value - start) / Math.max(0.0001, end - start))
  return x * x * (3 - 2 * x)
}

const normalizedProgress = computed(() => clamp01(props.progress))
const sectionVisible = computed(() => normalizedProgress.value > 0.001)
const interactionEnabled = computed(() => normalizedProgress.value >= 0.25)
const compositeOpacity = computed(() => String(smoothstep(0.02, 0.25, normalizedProgress.value)))

let animationFrame = 0
let lastFrameTime = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0
let velocityX = 0
let velocityY = 0
let activeVideoIndex: 0 | 1 = 0
let loopCrossfading = false
let nextVideoStarting = false
let playbackRequested = false
let playbackRetryNeeded = false
let lastVideoAOpacity = -1
let lastVideoBOpacity = -1
let idleStartTime = 0
let coarsePointerQuery: MediaQueryList | null = null
let reducedMotionQuery: MediaQueryList | null = null

function getVideos(): [HTMLVideoElement | null, HTMLVideoElement | null] {
  return [videoA.value, videoB.value]
}

function setVideoOpacity(index: 0 | 1, opacity: number) {
  const videos = getVideos()
  const video = videos[index]
  if (!video) return
  const nextOpacity = clamp01(opacity)
  if (index === 0) {
    if (Math.abs(lastVideoAOpacity - nextOpacity) < 0.002) return
    lastVideoAOpacity = nextOpacity
  } else {
    if (Math.abs(lastVideoBOpacity - nextOpacity) < 0.002) return
    lastVideoBOpacity = nextOpacity
  }
  video.style.opacity = String(nextOpacity)
}

function prepareVideoFrame(event: Event) {
  const video = event.currentTarget
  if (!(video instanceof HTMLVideoElement)) return
  video.muted = true
  if (video.currentTime !== 0) video.currentTime = 0
}

function resetMovement(immediate = false) {
  targetX = 0
  targetY = 0
  if (!immediate) return
  currentX = 0
  currentY = 0
  velocityX = 0
  velocityY = 0
  if (flyerLayer.value) {
    flyerLayer.value.style.transform = 'translate3d(0, 0, 0) rotateX(0deg) rotateZ(0deg) scale(1)'
  }
}

function pauseAndResetVideos() {
  playbackRequested = false
  playbackRetryNeeded = false
  loopCrossfading = false
  nextVideoStarting = false
  activeVideoIndex = 0

  for (const video of getVideos()) {
    if (!video) continue
    video.pause()
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) video.currentTime = 0
  }
  setVideoOpacity(0, 1)
  setVideoOpacity(1, 0)
}

async function startPlayback() {
  if (normalizedProgress.value < 0.2 || document.hidden) return
  const activeVideo = getVideos()[activeVideoIndex]
  if (!activeVideo) return

  playbackRequested = true
  activeVideo.muted = true
  try {
    await activeVideo.play()
    playbackRetryNeeded = false
  } catch {
    playbackRetryNeeded = true
  }
}

async function beginLoopCrossfade() {
  if (loopCrossfading || nextVideoStarting || normalizedProgress.value < 0.2) return
  const nextIndex = (activeVideoIndex === 0 ? 1 : 0) as 0 | 1
  const nextVideo = getVideos()[nextIndex]
  if (!nextVideo) return

  nextVideoStarting = true
  nextVideo.muted = true
  if (nextVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
    nextVideoStarting = false
    return
  }
  nextVideo.currentTime = 0
  setVideoOpacity(nextIndex, 0)
  try {
    await nextVideo.play()
    loopCrossfading = true
    playbackRetryNeeded = false
  } catch {
    playbackRetryNeeded = true
  } finally {
    nextVideoStarting = false
  }
}

function updateSeamlessVideoLoop() {
  if (!playbackRequested || normalizedProgress.value < 0.2) return
  const videos = getVideos()
  const activeVideo = videos[activeVideoIndex]
  if (!activeVideo || !Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) return

  const nextIndex = (activeVideoIndex === 0 ? 1 : 0) as 0 | 1
  const nextVideo = videos[nextIndex]
  const overlap = Math.min(1.15, Math.max(0.65, activeVideo.duration * 0.16))
  const remaining = activeVideo.duration - activeVideo.currentTime

  if (!loopCrossfading && remaining <= overlap) void beginLoopCrossfade()
  if (!loopCrossfading || !nextVideo) return

  const mix = smoothstep(0, overlap, nextVideo.currentTime)
  // Keep the outgoing video fully opaque while the incoming video fades over
  // it. Crossfading both layers to 50% would make their combined alpha only
  // 75%, revealing the final Red Bull canvas (and its second KEPIN) beneath.
  setVideoOpacity(activeVideoIndex, 1)
  setVideoOpacity(nextIndex, mix)

  if (mix < 0.999 && !activeVideo.ended) return
  activeVideo.pause()
  activeVideo.currentTime = 0
  setVideoOpacity(activeVideoIndex, 0)
  setVideoOpacity(nextIndex, 1)
  activeVideoIndex = nextIndex
  loopCrossfading = false
}

function handlePointerMove(event: PointerEvent) {
  if (!interactionEnabled.value) return
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  targetX = clamp((event.clientX / width) * 2 - 1, -1, 1)
  targetY = clamp((event.clientY / height) * 2 - 1, -1, 1)
  hasInteracted.value = true
  if (playbackRetryNeeded) void startPlayback()
}

function returnToCenter() {
  resetMovement(false)
}

function retryPlaybackAfterInteraction() {
  if (sectionVisible.value && playbackRetryNeeded) void startPlayback()
}

function handleVisibilityChange() {
  if (document.hidden) {
    for (const video of getVideos()) video?.pause()
    return
  }
  if (normalizedProgress.value < 0.2) return
  void startPlayback()
  if (loopCrossfading) {
    const nextIndex = (activeVideoIndex === 0 ? 1 : 0) as 0 | 1
    void getVideos()[nextIndex]?.play().catch(() => {
      playbackRetryNeeded = true
    })
  }
}

function animate(time: number) {
  animationFrame = requestAnimationFrame(animate)
  const delta = lastFrameTime ? clamp((time - lastFrameTime) / 16.667, 0.25, 2.5) : 1
  lastFrameTime = time

  const reducedMotion = reducedMotionQuery?.matches ?? false
  const canDrift = interactionEnabled.value && !hasInteracted.value && !reducedMotion
  const idleElapsed = Math.max(0, time - idleStartTime)
  const idleEnvelope = canDrift ? smoothstep(650, 1600, idleElapsed) : 0
  const idleX = canDrift
    ? clamp(
        Math.sin(idleElapsed * 0.00038) * 0.31
          + Math.sin(idleElapsed * 0.00083 + 0.9) * 0.11,
        -0.42,
        0.42,
      ) * idleEnvelope
    : 0
  const idleY = canDrift
    ? clamp(
        Math.sin(idleElapsed * 0.00047 + 1.25) * 0.17
          + Math.cos(idleElapsed * 0.00076) * 0.07,
        -0.24,
        0.24,
      ) * idleEnvelope
    : 0
  const resolvedTargetX = canDrift ? idleX : targetX
  const resolvedTargetY = canDrift ? idleY : targetY

  const stiffness = reducedMotion ? 0.085 : 0.052
  const damping = reducedMotion ? 0.72 : 0.82
  velocityX += (resolvedTargetX - currentX) * stiffness * delta
  velocityY += (resolvedTargetY - currentY) * stiffness * delta
  velocityX *= Math.pow(damping, delta)
  velocityY *= Math.pow(damping, delta)
  currentX += velocityX * delta
  currentY += velocityY * delta

  const isTouch = coarsePointerQuery?.matches ?? false
  const travelScale = reducedMotion ? 0.58 : 1
  const travelX = window.innerWidth * (isTouch ? 0.21 : 0.29) * travelScale
  const travelY = window.innerHeight * (isTouch ? 0.155 : 0.2) * travelScale
  const tiltScale = reducedMotion ? 0.32 : 1
  const translateX = clamp(currentX, -1, 1) * travelX
  const translateY = clamp(currentY, -1, 1) * travelY
  const rotateZ = clamp(currentX * 13 + velocityX * 32, -14, 14) * tiltScale
  const rotateX = clamp(-currentY * 4.5 - velocityY * 10, -5, 5) * tiltScale
  const scale = clamp(1 + currentY * 0.055, 0.95, 1.06)

  if (flyerLayer.value) {
    flyerLayer.value.style.transform = `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) rotateX(${rotateX.toFixed(2)}deg) rotateZ(${rotateZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`
  }

  updateSeamlessVideoLoop()
}

watch(normalizedProgress, (progress, previousProgress) => {
  const previous = previousProgress ?? 0
  if (progress <= 0.001) {
    pauseAndResetVideos()
    resetMovement(true)
    hasInteracted.value = false
    idleStartTime = 0
    return
  }

  if (progress >= 0.25 && previous < 0.25) idleStartTime = performance.now()
  if (progress >= 0.2 && previous < 0.2) void startPlayback()
  if (progress < 0.18 && previous >= 0.18) pauseAndResetVideos()
}, { immediate: true })

onMounted(() => {
  coarsePointerQuery = window.matchMedia('(pointer: coarse)')
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  setVideoOpacity(0, 1)
  setVideoOpacity(1, 0)
  resetMovement(true)
  animationFrame = requestAnimationFrame(animate)
  window.addEventListener('pointerdown', retryPlaybackAfterInteraction, { passive: true })
  window.addEventListener('touchstart', retryPlaybackAfterInteraction, { passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('pointerdown', retryPlaybackAfterInteraction)
  window.removeEventListener('touchstart', retryPlaybackAfterInteraction)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  pauseAndResetVideos()
  for (const video of getVideos()) {
    if (!video) continue
    video.removeAttribute('src')
    video.load()
  }
})
</script>

<style scoped>
.wingsuit-flight {
  position: fixed;
  inset: 0;
  z-index: 9;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
  touch-action: pan-y;
  will-change: opacity;
}

.wingsuit-flight.is-interactive {
  pointer-events: auto;
}

.wingsuit-media,
.wingsuit-background,
.wingsuit-flyer,
.wingsuit-vignette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.wingsuit-media {
  overflow: hidden;
  perspective: 1200px;
  background: transparent;
}

.wingsuit-background,
.wingsuit-flyer {
  display: block;
  object-fit: cover;
  object-position: 50% 50%;
  user-select: none;
}

.wingsuit-background {
  background: transparent;
  pointer-events: none;
  will-change: opacity;
}

.wingsuit-background.is-secondary {
  opacity: 0;
}

.wingsuit-flyer {
  z-index: 2;
  transform: translate3d(0, 0, 0) rotateX(0deg) rotateZ(0deg) scale(1);
  transform-origin: 50% 50%;
  filter: drop-shadow(0 12px 18px rgba(5, 17, 30, 0.18));
  pointer-events: none;
  will-change: transform;
}

.wingsuit-vignette {
  z-index: 3;
  background: radial-gradient(circle at 50% 48%, transparent 56%, rgba(3, 11, 20, 0.16) 100%);
  pointer-events: none;
}

.wingsuit-hint {
  position: absolute;
  left: 50%;
  bottom: max(20px, calc(env(safe-area-inset-bottom) + 12px));
  z-index: 4;
  padding: 8px 14px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(6, 17, 28, 0.42);
  backdrop-filter: blur(10px) saturate(130%);
  font: 600 0.66rem/1 system-ui, sans-serif;
  letter-spacing: 0.12em;
  opacity: 0;
  transform: translate3d(-50%, 8px, 0);
  transition: opacity 240ms ease-out, transform 240ms ease-out;
  pointer-events: none;
}

.wingsuit-hint.is-visible {
  opacity: 1;
  transform: translate3d(-50%, 0, 0);
}

@media (max-width: 700px) {
  .wingsuit-hint {
    bottom: max(14px, calc(env(safe-area-inset-bottom) + 8px));
    font-size: 0.61rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wingsuit-flyer {
    filter: drop-shadow(0 8px 12px rgba(5, 17, 30, 0.14));
  }

  .wingsuit-hint {
    transition-duration: 120ms;
  }
}
</style>
