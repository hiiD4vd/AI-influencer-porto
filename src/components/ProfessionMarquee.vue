<template>
  <div class="profession-marquee" aria-label="Kevin AI professions">
    <div class="profession-track">
      <div
        v-for="group in 2"
        :key="group"
        class="profession-group"
        :aria-hidden="group === 2 ? 'true' : undefined"
      >
        <div
          v-for="profession in professions"
          :key="`${group}-${profession.name}`"
          class="profession-item"
          :tabindex="group === 1 ? 0 : -1"
          :aria-label="group === 1 ? profession.label : undefined"
          @pointerenter="showCursorLabel($event, profession.cursorLabel)"
          @pointermove="moveCursorLabel"
          @pointerleave="hideCursorLabel"
        >
          <img
            class="profession-image profession-image--rest"
            :src="profession.rest"
            alt=""
            draggable="false"
          />
          <img
            class="profession-image profession-image--hover"
            :src="profession.hover"
            alt=""
            draggable="false"
          />
        </div>
      </div>
    </div>

    <div
      v-show="cursorLabelVisible"
      class="cursor-profession-label"
      :style="{ transform: `translate3d(${cursorLabelX}px, ${cursorLabelY}px, 0)` }"
      aria-hidden="true"
    >
      {{ cursorLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const professions = [
  {
    name: 'gym',
    label: 'Kevin in athlete mode',
    cursorLabel: 'KEVIN.AI / ATHLETE',
    rest: '/images/gym 2.png',
    hover: '/images/gym 1.png',
  },
  {
    name: 'redbull',
    label: 'Kevin in extreme sports mode',
    cursorLabel: 'KEVIN.AI / EXTREME ATHLETE',
    rest: '/images/redbull 2.png',
    hover: '/images/redbull 1.png',
  },
  {
    name: 'fisherman',
    label: 'Kevin in extreme fishing mode',
    cursorLabel: 'KEVIN.AI / EXTREME FISHERMAN',
    rest: '/images/fisherman 2.png',
    hover: '/images/fisherman 1.png',
  },
]

const cursorLabel = ref('')
const cursorLabelX = ref(0)
const cursorLabelY = ref(0)
const cursorLabelVisible = ref(false)

function positionCursorLabel(event: PointerEvent) {
  const estimatedWidth = 260
  cursorLabelX.value = Math.max(12, Math.min(event.clientX + 18, window.innerWidth - estimatedWidth))
  cursorLabelY.value = Math.max(12, Math.min(event.clientY + 18, window.innerHeight - 54))
}

function showCursorLabel(event: PointerEvent, label: string) {
  if (event.pointerType === 'touch') return
  cursorLabel.value = label
  cursorLabelVisible.value = true
  positionCursorLabel(event)
}

function moveCursorLabel(event: PointerEvent) {
  if (!cursorLabelVisible.value || event.pointerType === 'touch') return
  positionCursorLabel(event)
}

function hideCursorLabel() {
  cursorLabelVisible.value = false
}
</script>

<style scoped>
.profession-marquee {
  --item-height: min(68vh, 720px);
  --item-width: calc(var(--item-height) * 0.565);
  --item-gap: clamp(24px, 3.2vw, 64px);
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  background: #f7f7f7;
  user-select: none;
}

.profession-track {
  display: flex;
  width: max-content;
  will-change: transform;
  animation: profession-marquee-left 22s linear infinite;
}

.profession-group {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--item-gap);
  padding-right: var(--item-gap);
}

.profession-item {
  position: relative;
  flex: none;
  width: var(--item-width);
  height: var(--item-height);
  outline: none;
}

.profession-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.profession-image--rest {
  opacity: 1;
}

.profession-image--hover {
  opacity: 0;
}

.cursor-profession-label {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  max-width: min(260px, calc(100vw - 24px));
  padding: 10px 17px;
  border-radius: 999px;
  background: #acbdd5;
  color: #121820;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.22em;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 9px 24px rgba(22, 36, 52, 0.18);
  will-change: transform;
}

.profession-item:hover .profession-image--rest,
.profession-item:focus-visible .profession-image--rest,
.profession-item:active .profession-image--rest {
  opacity: 0;
}

.profession-item:hover .profession-image--hover,
.profession-item:focus-visible .profession-image--hover,
.profession-item:active .profession-image--hover {
  opacity: 1;
}

@keyframes profession-marquee-left {
  to {
    transform: translate3d(-50%, 0, 0);
  }
}

@media (max-width: 700px) {
  .profession-marquee {
    --item-height: min(62vh, 560px);
    --item-gap: clamp(18px, 5vw, 34px);
  }

  .profession-track {
    animation-duration: 17s;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profession-track {
    animation-play-state: paused;
  }
}
</style>
