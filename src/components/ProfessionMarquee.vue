<template>
  <div class="profession-marquee" aria-label="Kevin AI professions">
    <ProfessionFluidBackground v-if="fluidEnabled" />
    <div class="profession-track">
      <div
        v-for="group in 2"
        :key="group"
        class="profession-group"
        :aria-hidden="group === 2 ? 'true' : undefined"
      >
        <div
          v-for="(profession, index) in loopingProfessions"
          :key="`${group}-${profession.name}-${index}`"
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
import ProfessionFluidBackground from './ProfessionFluidBackground.vue'

withDefaults(defineProps<{ fluidEnabled?: boolean }>(), { fluidEnabled: true })

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
  {
    name: 'astronaut',
    label: 'Kevin in astronaut mode',
    cursorLabel: 'KEVIN.AI / ASTRONAUT',
    rest: '/images/Astronaut 2.png',
    hover: '/images/Astronaut 1.png',
  },
  {
    name: 'deep-sea-diver',
    label: 'Kevin in deep-sea diver mode',
    cursorLabel: 'KEVIN.AI / DEEP-SEA DIVER',
    rest: '/images/Classic Deep-Sea Diver 2.png',
    hover: '/images/Classic Deep-Sea Diver 1.png',
  },
  {
    name: 'doctor',
    label: 'Kevin in doctor mode',
    cursorLabel: 'KEVIN.AI / DOCTOR',
    rest: '/images/Dokter 2.png',
    hover: '/images/Dokter 1.png',
  },
  {
    name: 'firefighter',
    label: 'Kevin in firefighter mode',
    cursorLabel: 'KEVIN.AI / FIREFIGHTER',
    rest: '/images/Firefighter 2.png',
    hover: '/images/Firefighter 1.png',
  },
  {
    name: 'hazmat-specialist',
    label: 'Kevin in hazmat specialist mode',
    cursorLabel: 'KEVIN.AI / HAZMAT SPECIALIST',
    rest: '/images/Hazmat Specialist 2.png',
    hover: '/images/Hazmat Specialist 1.png',
  },
  {
    name: 'mountaineer',
    label: 'Kevin in mountaineer mode',
    cursorLabel: 'KEVIN.AI / MOUNTAINEER',
    rest: '/images/Mountaineer 2.png',
    hover: '/images/Mountaineer 1.png',
  },
  {
    name: 'airline-pilot',
    label: 'Kevin in airline pilot mode',
    cursorLabel: 'KEVIN.AI / AIRLINE PILOT',
    rest: '/images/Pilot maskapai 2.png',
    hover: '/images/Pilot maskapai 1.png',
  },
  {
    name: 'punisher',
    label: 'Kevin in punisher mode',
    cursorLabel: 'KEVIN.AI / PUNISHER',
    rest: '/images/Punisher 2.png',
    hover: '/images/Punisher 1.png',
  },
  {
    name: 'racing-driver',
    label: 'Kevin in racing driver mode',
    cursorLabel: 'KEVIN.AI / RACING DRIVER',
    rest: '/images/Racing Driver 2.png',
    hover: '/images/Racing Driver 1.png',
  },
  {
    name: 'special-forces-soldier',
    label: 'Kevin in special forces mode',
    cursorLabel: 'KEVIN.AI / SPECIAL FORCES',
    rest: '/images/Special-Forces Soldier 2.png',
    hover: '/images/Special-Forces Soldier 1.png',
  },
]

// Thirteen professions already make each half wider than the largest supported
// viewport. The second identical group keeps the -50% loop mathematically seamless.
const loopingProfessions = professions

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
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  background: #fff;
  user-select: none;
}

.profession-track {
  position: relative;
  z-index: 1;
  display: flex;
  width: max-content;
  will-change: transform;
  animation: profession-marquee-left 52s linear infinite;
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
    animation-duration: 42s;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profession-track {
    animation-play-state: paused;
  }
}
</style>
