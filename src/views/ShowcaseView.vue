<template>
  <div class="showcase-view">
    <!-- Side labels -->
    <div class="side-label left"><span>Drag to explore</span></div>
    <div class="side-label right"><span>{{ CARD_DATA.length }} Projects</span></div>

    <!-- Project detail panel -->
    <Transition name="panel">
      <div v-if="activeTile" class="detail-panel">
        <button class="close-btn" @click="closeTile">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="panel-badge">{{ activeTile.badge }}</div>
        <div class="panel-date">{{ activeTile.date }}</div>
        <h2 class="panel-title">{{ activeTile.title }}</h2>
        <p class="panel-desc">{{ activeTile.description }}</p>
        <div class="panel-tags">
          <span v-for="tag in activeTile.tags" :key="tag" class="panel-tag">{{ tag }}</span>
        </div>
        <button class="panel-cta">View Project →</button>
      </div>
    </Transition>
    <Transition name="overlay">
      <div v-if="activeTile" class="overlay" @click="closeTile" />
    </Transition>

    <!-- Infinite Grid -->
    <InfiniteGrid
      :card-data="CARD_DATA"
      :options="GRID_OPTIONS"
      @tile-clicked="onTileClicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import InfiniteGrid from '../components/InfiniteGrid/InfiniteGrid.vue'
import type { CardData, InfiniteGridOptions } from '../components/InfiniteGrid/types'

const activeTile = ref<CardData | null>(null)

const VIDEOS = [
  '/videos/opt_fishing_kepin_fi-009b_20260714.mp4',
  '/videos/opt_fish_kepin_dune-can_20260704.mp4',
  '/videos/opt_fish_kepin_fi-extreme-002_20260707.mp4',
  '/videos/opt_fish_kepin_fi-extreme-004_20260707.mp4',
  '/videos/opt_fish_kepin_manhole-snacks_20260704.mp4',
  '/videos/opt_rb_kepin-alt-dolomites-basejump_20260704.mp4',
  '/videos/opt_rb_kepin_balloon-rig-sunrise_20260629.mp4',
  '/videos/opt_rb_kepin_reef-barhang_20260704.mp4',
  '/videos/opt_rb_kepin_skydive-reef_20260626.mp4',
  '/videos/opt_ATLAS STONE.mp4',
  '/videos/opt_fish_kepin-sub-gt-001_20260702.mp4',
  '/videos/opt_rb_kepin_freesolo-halfdome_20260625.mp4',
  '/videos/opt_rb_kepin_snowboard-sunset_20260626.mp4',
  '/videos/opt_TRUCK TIRE.mp4'
]

// Data pools for randomizing 29 unique cards
const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE SHORTS', 'X / TWITTER', 'BEHANCE']
const USERNAMES = ['@kevin_xtreme', '@ai_influencer', '@digital_nomad', '@synth_athlete', '@future_creator']
const ROLES = ['EXTREME BASEJUMPER', 'PROFESSIONAL ANGLER', 'WINTER ATHLETE', 'HEAVY LIFTER', 'SKY DIVER', 'DEEP SEA EXPLORER', 'URBAN ACROBAT', 'MOUNTAINEER']
const LOCATIONS = ['DOLOMITES, ALPS', 'MALDIVES REEF', 'SAHARA DUNES', 'NEO-TOKYO', 'GRAND CANYON', 'MT. EVEREST', 'PACIFIC OCEAN', 'DUBAI SKYSCRAPER']

// Generate 29 unique cards to outnumber the 5x5 (25) grid cluster, avoiding visible duplicates!
const CARD_DATA: CardData[] = Array.from({ length: 29 }).map((_, i) => ({
  title: PLATFORMS[i % PLATFORMS.length], // Top Left
  badge: USERNAMES[(i + 3) % USERNAMES.length], // Top Right
  tags: [ROLES[(i + 2) % ROLES.length]], // Bottom Left (rendered with joins if multiple)
  date: LOCATIONS[(i + 5) % LOCATIONS.length], // Bottom Right
  video: VIDEOS[i % VIDEOS.length], 
  description: 'A versatile AI-generated digital identity seamlessly adapting to extreme environments and roles.'
}))

const GRID_OPTIONS: Partial<InfiniteGridOptions> = {
  gridCols: 5,
  gridRows: 5,
  tileSize: 2.6, // Made tiles slightly larger for better presence
  gridGap: 0.08, // Increased gap slightly
  baseCameraZ: 9.5, // Zoomed in significantly (from 13.5) to see fewer cards
  enablePostProcessing: true,
  postProcessParams: {
    distortionIntensity: -0.18, // Slightly stronger curve to wrap the fewer items nicely
    vignetteOffset: 0.0,
    vignetteDarkness: 0.55,
  },
}

function onTileClicked({ card }: { card: CardData }) {
  activeTile.value = card
}
function closeTile() {
  activeTile.value = null
}
</script>

<style scoped>
.showcase-view {
  position: fixed;
  inset: 0;
  background: #080808;
  overflow: hidden;
}

.side-label {
  position: fixed;
  top: 50%;
  transform: translateY(-50%) rotate(-90deg);
  z-index: 90;
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.2);
  white-space: nowrap;
  pointer-events: none;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
}
.side-label.left  { left: -28px; }
.side-label.right { right: -40px; }

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 200;
}
.overlay-enter-active, .overlay-leave-active { transition: opacity 0.3s ease; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }

.detail-panel {
  position: fixed;
  right: 32px;
  top: 50%;
  transform: translateY(-50%);
  width: 360px;
  max-height: 85vh;
  background: rgba(14, 14, 14, 0.95);
  backdrop-filter: blur(40px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 32px;
  z-index: 300;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-enter-active, .panel-leave-active {
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(calc(-50% + 24px));
}

.close-btn {
  position: absolute;
  top: 20px; right: 20px;
  width: 32px; height: 32px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.close-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

.panel-badge {
  display: inline-flex; align-items: center;
  padding: 4px 12px; border-radius: 100px;
  background: rgba(255,255,255,0.08);
  font-size: 0.68rem; letter-spacing: 0.12em;
  text-transform: uppercase; color: rgba(255,255,255,0.6);
  font-weight: 600; width: fit-content;
}
.panel-date { font-size: 0.72rem; color: rgba(255,255,255,0.28); }
.panel-title {
  font-family: 'Syne', sans-serif;
  font-size: 1.6rem; font-weight: 800;
  line-height: 1.15; color: #fff;
}
.panel-desc { font-size: 0.88rem; line-height: 1.7; color: rgba(255,255,255,0.5); }
.panel-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.panel-tag {
  padding: 5px 12px; border-radius: 100px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 0.72rem; color: rgba(255,255,255,0.4);
}
.panel-cta {
  margin-top: 8px; padding: 14px 24px;
  border-radius: 100px; background: #fff; color: #000;
  font-size: 0.82rem; font-weight: 700;
  border: none; cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
}
.panel-cta:hover { opacity: 0.85; transform: scale(0.98); }
</style>
