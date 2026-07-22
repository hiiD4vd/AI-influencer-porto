<template>
  <main
    class="cabin-test"
    :class="{ 'is-entered': entered, 'is-dragging': dragging, 'is-embedded': embedded }"
  >
    <nav v-if="!embedded" class="shared-nav">
      <RouterLink to="/" class="nav-link">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link">Vibe</RouterLink>
      <RouterLink to="/cabin-test" class="nav-link active">Cabin</RouterLink>
    </nav>

    <section
      ref="viewport"
      class="pov-viewport"
      role="region"
      aria-label="Airplane cabin point of view. Drag to look around."
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @keydown.left.prevent="nudgeCamera(-0.16)"
      @keydown.right.prevent="nudgeCamera(0.16)"
      @keydown.up.prevent="nudgeCamera(0, -0.14)"
      @keydown.down.prevent="nudgeCamera(0, 0.14)"
    >
      <!-- Both pictures stay static. Canvas only changes the camera crop. -->
      <canvas ref="sceneCanvas" class="scene-canvas" aria-hidden="true"></canvas>

      <div v-if="loadError" class="static-fallback" aria-hidden="true">
        <div class="fallback-sky"></div>
        <img class="fallback-cabin" :src="cabinImagePath" alt="" />
      </div>

      <div class="cabin-subtitle" aria-live="polite">
        {{ typedSubtitle || audioPrompt }}
      </div>

      <div v-show="!announcementPlaying && !showScrollPrompt" class="drag-hint" aria-hidden="true">
        <span></span>
        Drag to look around
        <span></span>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  embedded?: boolean
  paused?: boolean
  active?: boolean
  chimeAudioElement?: HTMLAudioElement | null
  announcementAudioElement?: HTMLAudioElement | null
}>(), {
  embedded: false,
  paused: false,
  active: true,
  chimeAudioElement: null,
  announcementAudioElement: null
})

const { embedded } = props
const cabinImagePath = '/images/cabin-windows.png'

const emit = defineEmits<{
  ready: []
  'scroll-unlocked': []
}>()

const viewport = ref<HTMLElement | null>(null)
const sceneCanvas = ref<HTMLCanvasElement | null>(null)
const entered = ref(false)
const dragging = ref(false)
const loadError = ref(false)
const typedSubtitle = ref('')
const announcementPlaying = ref(false)
const showScrollPrompt = ref(false)
const audioPrompt = ref('')
const CAMERA_ZOOM = 1.34

const SUBTITLE_CUES = [
  { text: 'Welcome aboard Kevin.AI.', start: 0.18, end: 1.9, typingShare: 0.68 },
  {
    text: 'Please sit back, relax, and enjoy the transition from Athlete Mode to Extreme Fishing Mode.',
    start: 3.05,
    end: 9.65,
    typingShare: 0.82
  },
  { text: 'We are now approaching Antarctica.', start: 10.8, end: 13.25, typingShare: 0.75 },
  {
    text: 'We have arrived at your destination. Please continue scrolling to meet Kevin in his next profession.',
    start: 14.15,
    end: 19.55,
    typingShare: 0.88
  }
]
const SCROLL_PROMPT = 'Continue scrolling to meet Kevin in his next profession.'

interface SceneImage {
  source: CanvasImageSource
  width: number
  height: number
}

interface CameraCrop {
  x: number
  y: number
  width: number
  height: number
}

interface FlyingCloud {
  imageIndex: number
  companionImageIndex: number
  x: number
  y: number
  width: number
  heightRatio: number
  speed: number
  opacity: number
  flip: boolean
  delay: number
  clusterCount: number
  companionScale: number
  companionHeightRatio: number
  companionOffsetX: number
  companionOffsetY: number
}

let context: CanvasRenderingContext2D | null = null
let skyLayer: SceneImage | null = null
let cabinLayer: SceneImage | null = null
let cloudImages: SceneImage[] = []
let flyingClouds: FlyingCloud[] = []
let chimeAudio: HTMLAudioElement | null = null
let announcementAudio: HTMLAudioElement | null = null
let audioStarted = false
let audioStarting = false
let audioPrepared = false
let rafId = 0
let subtitleRafId = 0
let pointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0
let targetX = 0
let targetY = 0
let cameraX = 0
let cameraY = 0
let lastInteraction = 0
let previousFrameTime = 0
let destroyed = false
let subtitleClearTimeout: ReturnType<typeof setTimeout> | null = null
let scrollPromptStartedAt = 0
let scrollUnlockEmitted = false

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

function prepareImage(image: HTMLImageElement): SceneImage {
  const maxDimension = 4096
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  if (ratio === 1) {
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  }

  const buffer = document.createElement('canvas')
  buffer.width = Math.round(image.naturalWidth * ratio)
  buffer.height = Math.round(image.naturalHeight * ratio)
  const bufferContext = buffer.getContext('2d')
  if (!bufferContext) throw new Error('Could not prepare scene image')
  bufferContext.imageSmoothingEnabled = true
  bufferContext.imageSmoothingQuality = 'high'
  bufferContext.drawImage(image, 0, 0, buffer.width, buffer.height)
  return { source: buffer, width: buffer.width, height: buffer.height }
}

function buildGradientLayer(cabin: SceneImage): SceneImage {
  const scene = document.createElement('canvas')
  scene.width = cabin.width
  scene.height = cabin.height
  const sceneContext = scene.getContext('2d')
  if (!sceneContext) throw new Error('Could not build sky gradient')

  const gradient = sceneContext.createLinearGradient(0, 0, 0, scene.height)
  gradient.addColorStop(0, '#49B2E7')
  gradient.addColorStop(1, '#BDDAEC')
  sceneContext.fillStyle = gradient
  sceneContext.fillRect(0, 0, scene.width, scene.height)

  return { source: scene, width: scene.width, height: scene.height }
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum)
}

function resetCloud(cloud: FlyingCloud, initial = false) {
  if (!cabinLayer) return
  const worldWidth = cabinLayer.width
  const worldHeight = cabinLayer.height
  cloud.imageIndex = Math.random() > 0.5 ? 1 : 0
  cloud.companionImageIndex = cloud.imageIndex === 0 ? 1 : 0
  cloud.width = worldWidth * randomBetween(0.12, 0.24)
  cloud.heightRatio = randomBetween(0.86, 1.12)
  cloud.x = initial
    ? randomBetween(-cloud.width * 0.4, worldWidth * 0.9)
    : -cloud.width * randomBetween(0.25, 0.95)
  cloud.y = worldHeight * randomBetween(0.2, 0.7)
  cloud.speed = worldWidth * randomBetween(0.032, 0.056)
  cloud.opacity = randomBetween(0.58, 0.94)
  cloud.flip = Math.random() > 0.5
  cloud.delay = initial ? randomBetween(0, 0.45) : randomBetween(0.15, 1.15)
  cloud.clusterCount = Math.random() < 0.68 ? (Math.random() < 0.36 ? 3 : 2) : 1
  cloud.companionScale = randomBetween(0.48, 0.82)
  cloud.companionHeightRatio = randomBetween(0.94, 1.06)
  cloud.companionOffsetX = randomBetween(0.34, 0.7)
  cloud.companionOffsetY = randomBetween(-0.18, 0.22)
}

function createClouds() {
  flyingClouds = Array.from({ length: 5 }, (_, index) => {
    const cloud: FlyingCloud = {
      imageIndex: index,
      companionImageIndex: index % 2,
      x: 0,
      y: 0,
      width: 0,
      heightRatio: 1,
      speed: 0,
      opacity: 1,
      flip: false,
      delay: 0,
      clusterCount: 1,
      companionScale: 0.65,
      companionHeightRatio: 1,
      companionOffsetX: 0.5,
      companionOffsetY: 0
    }
    resetCloud(cloud, true)
    if (cabinLayer) {
      // Spread the first formations across one loop so a window rarely sits
      // empty while waiting for the next cloud group.
      cloud.x = cabinLayer.width * (index / 4) - cloud.width * randomBetween(0.1, 0.8)
      cloud.delay = index === 0 ? 0 : randomBetween(0, 0.35)
    }
    return cloud
  })
}

function setupAudioSequence() {
  if (audioPrepared) {
    void tryStartAudio()
    return
  }

  chimeAudio = props.chimeAudioElement ?? new Audio('/audios/cabin_chime.mp3')
  announcementAudio = props.announcementAudioElement ?? new Audio('/audios/flight-attendant-announcement.mp3')
  if (!props.chimeAudioElement) chimeAudio.src = '/audios/cabin_chime.mp3'
  if (!props.announcementAudioElement) announcementAudio.src = '/audios/flight-attendant-announcement.mp3'
  chimeAudio.currentTime = 0
  announcementAudio.currentTime = 0
  chimeAudio.preload = 'auto'
  announcementAudio.preload = 'auto'

  chimeAudio.addEventListener('ended', playAnnouncement)
  announcementAudio.addEventListener('ended', finishAnnouncement)
  audioPrepared = true
  void tryStartAudio()
}

async function tryStartAudio() {
  if (audioStarted || audioStarting || !chimeAudio || destroyed || !props.active) return
  audioStarting = true
  try {
    await chimeAudio.play()
    audioStarted = true
    audioPrompt.value = ''
    removeAudioUnlockListeners()
  } catch {
    audioPrompt.value = 'Tap or click anywhere to enable audio.'
  } finally {
    audioStarting = false
  }
}

function playAnnouncement() {
  if (!announcementAudio || destroyed || !props.active) return
  announcementAudio.currentTime = 0
  typedSubtitle.value = ''
  showScrollPrompt.value = false
  void announcementAudio.play().then(() => {
    announcementPlaying.value = true
  }).catch(() => {
    audioPrompt.value = 'Tap or click anywhere to continue audio.'
    window.addEventListener('pointerdown', resumeAnnouncement, { once: true })
    window.addEventListener('keydown', resumeAnnouncement, { once: true })
  })
}

function resumeAnnouncement() {
  if (!announcementAudio || destroyed || !props.active) return
  void announcementAudio.play().then(() => {
    announcementPlaying.value = true
    audioPrompt.value = ''
  }).catch(() => undefined)
}

function finishAnnouncement() {
  if (subtitleClearTimeout) clearTimeout(subtitleClearTimeout)
  announcementPlaying.value = false
  subtitleClearTimeout = setTimeout(() => {
    typedSubtitle.value = ''
    showScrollPrompt.value = true
    scrollPromptStartedAt = performance.now()
  }, 450)
}

function updateSubtitle() {
  if (showScrollPrompt.value) {
    const elapsed = Math.max(0, performance.now() - scrollPromptStartedAt)
    const characterCount = Math.min(SCROLL_PROMPT.length, Math.floor(elapsed / 38))
    typedSubtitle.value = SCROLL_PROMPT.slice(0, characterCount)
    if (characterCount >= SCROLL_PROMPT.length && !scrollUnlockEmitted) {
      scrollUnlockEmitted = true
      emit('scroll-unlocked')
    }
    return
  }

  const audio = announcementAudio
  if (!audio || !announcementPlaying.value) return

  for (const cue of SUBTITLE_CUES) {
    if (audio.currentTime < cue.start) {
      typedSubtitle.value = ''
      return
    }

    if (audio.currentTime >= cue.start && audio.currentTime < cue.end) {
      // Finish typing before the spoken phrase ends, then hold the full line.
      const typingDuration = (cue.end - cue.start) * cue.typingShare
      const typingProgress = clamp((audio.currentTime - cue.start) / typingDuration, 0, 1)
      const characterCount = Math.floor(typingProgress * cue.text.length)
      typedSubtitle.value = cue.text.slice(0, characterCount)
      return
    }
  }

  // Keep the last spoken sentence visible until the announcement ends.
  typedSubtitle.value = SUBTITLE_CUES[SUBTITLE_CUES.length - 1].text
}

function animateSubtitle() {
  subtitleRafId = requestAnimationFrame(animateSubtitle)
  updateSubtitle()
}

function addAudioUnlockListeners() {
  window.addEventListener('pointerdown', tryStartAudio)
  window.addEventListener('keydown', tryStartAudio)
}

function removeAudioUnlockListeners() {
  window.removeEventListener('pointerdown', tryStartAudio)
  window.removeEventListener('keydown', tryStartAudio)
}

async function initialiseScene() {
  const canvas = sceneCanvas.value
  if (!canvas) return
  context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas is unavailable')

  const [loadedCabin, loadedCloudOne, loadedCloudTwo] = await Promise.all([
    loadImage(cabinImagePath),
    loadImage('/images/awan (1).png'),
    loadImage('/images/awan (2).png')
  ])
  if (destroyed) return

  const preparedCabin = prepareImage(loadedCabin)
  skyLayer = buildGradientLayer(preparedCabin)
  cabinLayer = preparedCabin
  cloudImages = [prepareImage(loadedCloudOne), prepareImage(loadedCloudTwo)]
  createClouds()
  resizeCanvas()
  lastInteraction = performance.now()
  previousFrameTime = performance.now()
  render(performance.now())
  emit('ready')
  if (props.active) setupAudioSequence()
}

watch(() => props.active, active => {
  if (active) {
    setupAudioSequence()
    return
  }

  chimeAudio?.pause()
  announcementAudio?.pause()
  if (chimeAudio) chimeAudio.currentTime = 0
  if (announcementAudio) announcementAudio.currentTime = 0
  audioStarted = false
  audioStarting = false
  announcementPlaying.value = false
  showScrollPrompt.value = false
  typedSubtitle.value = ''
  audioPrompt.value = ''
  scrollUnlockEmitted = false
  if (subtitleClearTimeout) {
    clearTimeout(subtitleClearTimeout)
    subtitleClearTimeout = null
  }
})

function resizeCanvas() {
  const canvas = sceneCanvas.value
  if (!canvas || !context) return
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  const width = Math.max(1, Math.round(window.innerWidth * pixelRatio))
  const height = Math.max(1, Math.round(window.innerHeight * pixelRatio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function getCameraCrop(image: SceneImage, zoom: number): CameraCrop | null {
  const canvas = sceneCanvas.value
  if (!canvas) return null

  const viewAspect = canvas.width / canvas.height
  const imageAspect = image.width / image.height
  let cropWidth: number
  let cropHeight: number

  if (imageAspect > viewAspect) {
    cropHeight = image.height / zoom
    cropWidth = cropHeight * viewAspect
  } else {
    cropWidth = image.width / zoom
    cropHeight = cropWidth / viewAspect
  }

  const horizontalRoom = Math.max(0, image.width - cropWidth)
  const verticalRoom = Math.max(0, image.height - cropHeight)
  const x = horizontalRoom * (0.5 + cameraX * 0.5)
  const y = verticalRoom * (0.5 + cameraY * 0.5)

  return {
    x: clamp(x, 0, horizontalRoom),
    y: clamp(y, 0, verticalRoom),
    width: cropWidth,
    height: cropHeight
  }
}

function drawWorldLayer(image: SceneImage, crop: CameraCrop) {
  const canvas = sceneCanvas.value
  if (!canvas || !context) return
  context.drawImage(
    image.source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  )
}

function drawClouds(crop: CameraCrop, deltaSeconds: number, moveClouds: boolean) {
  const canvas = sceneCanvas.value
  if (!canvas || !context || !cabinLayer) return

  for (const cloud of flyingClouds) {
    if (moveClouds) {
      if (cloud.delay > 0) cloud.delay -= deltaSeconds
      else cloud.x += cloud.speed * deltaSeconds
      if (cloud.x > cabinLayer.width + cloud.width) resetCloud(cloud)
    }

    if (cloud.delay > 0) continue
    drawCloudSprite(
      cloudImages[cloud.imageIndex],
      cloud.x,
      cloud.y,
      cloud.width,
      cloud.heightRatio,
      cloud.opacity,
      cloud.flip,
      crop
    )

    if (cloud.clusterCount >= 2) {
      drawCloudSprite(
        cloudImages[cloud.companionImageIndex],
        cloud.x + cloud.width * cloud.companionOffsetX,
        cloud.y + cloud.width * cloud.companionOffsetY,
        cloud.width * cloud.companionScale,
        cloud.companionHeightRatio,
        cloud.opacity * 0.9,
        !cloud.flip,
        crop
      )
    }

    if (cloud.clusterCount >= 3) {
      drawCloudSprite(
        cloudImages[cloud.imageIndex],
        cloud.x - cloud.width * 0.24,
        cloud.y + cloud.width * 0.18,
        cloud.width * cloud.companionScale * 0.72,
        0.95,
        cloud.opacity * 0.76,
        cloud.flip,
        crop
      )
    }
  }
}

function drawCloudSprite(
  image: SceneImage | undefined,
  worldX: number,
  worldY: number,
  worldWidth: number,
  heightRatio: number,
  opacity: number,
  flip: boolean,
  crop: CameraCrop
) {
  const canvas = sceneCanvas.value
  if (!canvas || !context || !image) return

  const worldHeight = worldWidth * (image.height / image.width) * heightRatio
  const screenX = (worldX - crop.x) / crop.width * canvas.width
  const screenY = (worldY - crop.y) / crop.height * canvas.height
  const screenWidth = worldWidth / crop.width * canvas.width
  const screenHeight = worldHeight / crop.height * canvas.height
  if (screenX > canvas.width || screenX + screenWidth < 0) return

  context.save()
  context.globalAlpha = opacity
  if (flip) {
    context.translate(screenX + screenWidth, screenY)
    context.scale(-1, 1)
    context.drawImage(image.source, 0, 0, screenWidth, screenHeight)
  } else {
    context.drawImage(image.source, screenX, screenY, screenWidth, screenHeight)
  }
  context.restore()
}

function render(time: number) {
  if (!context || !sceneCanvas.value || !skyLayer || !cabinLayer) return
  rafId = requestAnimationFrame(render)

  if (props.paused) {
    previousFrameTime = time
    return
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const deltaSeconds = Math.min(0.05, Math.max(0, (time - previousFrameTime) / 1000))
  previousFrameTime = time
  if (!dragging.value && time - lastInteraction > 1700 && !reduceMotion) {
    targetX = Math.sin(time * 0.00022) * 0.16
    targetY = Math.sin(time * 0.00029 + 0.8) * 0.12
  }

  cameraX += (targetX - cameraX) * 0.075
  cameraY += (targetY - cameraY) * 0.075

  context.clearRect(0, 0, sceneCanvas.value.width, sceneCanvas.value.height)
  const crop = getCameraCrop(cabinLayer, CAMERA_ZOOM)
  if (!crop) return

  // All three world layers use exactly the same camera crop. The clouds move
  // through the world between the fixed sky and fixed cabin artwork.
  drawWorldLayer(skyLayer, crop)
  drawClouds(crop, deltaSeconds, !reduceMotion)
  drawWorldLayer(cabinLayer, crop)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType !== 'touch') return
  pointerId = event.pointerId
  dragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginX = targetX
  dragOriginY = targetY
  lastInteraction = performance.now()
  viewport.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  const view = viewport.value
  if (!view) return

  if (dragging.value && event.pointerId === pointerId) {
    // Dragging the view left means looking toward the right side of the cabin.
    targetX = clamp(dragOriginX - (event.clientX - dragStartX) / (view.clientWidth * 0.42), -1, 1)
    targetY = clamp(dragOriginY + (event.clientY - dragStartY) / (view.clientHeight * 0.42), -1, 1)
    lastInteraction = performance.now()
    return
  }

  if (event.pointerType !== 'touch') {
    const bounds = view.getBoundingClientRect()
    targetX = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1)
    targetY = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1)
    lastInteraction = performance.now()
  }
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== pointerId) return
  dragging.value = false
  lastInteraction = performance.now()
  if (viewport.value?.hasPointerCapture(event.pointerId)) {
    viewport.value.releasePointerCapture(event.pointerId)
  }
  pointerId = null
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'touch' && !dragging.value) {
    lastInteraction = performance.now() - 1800
  }
}

function nudgeCamera(horizontal = 0, vertical = 0) {
  targetX = clamp(targetX + horizontal, -1, 1)
  targetY = clamp(targetY + vertical, -1, 1)
  lastInteraction = performance.now()
}

function handleResize() {
  resizeCanvas()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  addAudioUnlockListeners()
  subtitleRafId = requestAnimationFrame(animateSubtitle)
  requestAnimationFrame(() => { entered.value = true })
  void initialiseScene().catch((error: unknown) => {
    console.error('Cabin scene could not be rendered:', error)
    loadError.value = true
  })
})

onUnmounted(() => {
  destroyed = true
  cancelAnimationFrame(rafId)
  cancelAnimationFrame(subtitleRafId)
  window.removeEventListener('resize', handleResize)
  removeAudioUnlockListeners()
  window.removeEventListener('pointerdown', resumeAnnouncement)
  window.removeEventListener('keydown', resumeAnnouncement)
  if (chimeAudio) {
    chimeAudio.removeEventListener('ended', playAnnouncement)
    chimeAudio.pause()
    chimeAudio.currentTime = 0
    if (!props.chimeAudioElement) chimeAudio.src = ''
  }
  if (announcementAudio) {
    announcementAudio.removeEventListener('ended', finishAnnouncement)
    announcementAudio.pause()
    announcementAudio.currentTime = 0
    if (!props.announcementAudioElement) announcementAudio.src = ''
  }
  context = null
  skyLayer = null
  cabinLayer = null
  cloudImages = []
  flyingClouds = []
  chimeAudio = null
  announcementAudio = null
  audioPrepared = false
  if (subtitleClearTimeout) clearTimeout(subtitleClearTimeout)
})
</script>

<style scoped>
.cabin-test {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #80c9eb;
  font-family: 'Inter', sans-serif;
}

.pov-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  outline: none;
  opacity: 0;
  transform: scale(1.035);
  transition: opacity .8s ease, transform 1.15s cubic-bezier(.16, 1, .3, 1);
}
.is-entered .pov-viewport { opacity: 1; transform: scale(1); }
.is-embedded .pov-viewport {
  opacity: 1;
  transform: none;
  transition: none;
  touch-action: pan-y;
}
.pov-viewport:active { cursor: grabbing; }
.pov-viewport:focus-visible { box-shadow: inset 0 0 0 2px rgba(255,255,255,.72); }

.scene-canvas,
.static-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.static-fallback { overflow: hidden; }
.fallback-sky,
.fallback-cabin {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fallback-sky { background: linear-gradient(180deg, #49B2E7 0%, #BDDAEC 100%); }
.fallback-cabin { z-index: 2; }

.cabin-subtitle {
  position: absolute;
  left: 50%;
  bottom: max(38px, calc(env(safe-area-inset-bottom) + 18px));
  z-index: 11;
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
  pointer-events: none;
}

.drag-hint {
  position: absolute;
  z-index: 10;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 12px;
  transform: translateX(-50%);
  color: rgba(16,54,73,.58);
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .15em;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}
.drag-hint span { width: 28px; height: 1px; background: currentColor; }

@media (max-width: 700px) {
  .drag-hint { font-size: .56rem; bottom: max(18px, env(safe-area-inset-bottom)); }
}

@media (hover: none), (pointer: coarse) {
  .cabin-subtitle {
    bottom: max(24px, calc(env(safe-area-inset-bottom) + 12px));
    width: calc(100vw - 28px);
    font-size: 0.88rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pov-viewport { transition-duration: .01ms; }
}
</style>
