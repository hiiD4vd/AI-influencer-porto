<template>
  <div class="showcase-view">
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
    </nav>

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
        <div class="panel-badge">{{ activeTile.niche }}</div>
        <div class="panel-date">{{ activeTile.date }}</div>
        <h2 class="panel-title">{{ activeTile.title }}</h2>
        <p class="panel-desc">{{ activeTile.client }}</p>
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

const CARD_DATA: CardData[] = [
  { title: 'Visitor Experience', client: 'Google', niche: 'EXPERIENCE', tags: ['Machine Learning', 'Web3'], date: '2025', image: 'https://picsum.photos/seed/451/900/700' },
  { title: 'Phantom Experience', client: 'Phantom', niche: 'COMMUNICATION', tags: ['WebGL', 'Immersive'], date: '2025', image: 'https://picsum.photos/seed/452/900/700' },
  { title: 'Global Travel Hacker', client: 'DIAGEO', niche: 'EXPERIENCE', tags: ['Travel', 'UX'], date: '2024', image: 'https://picsum.photos/seed/453/900/700' },
  { title: 'Neural Brand Identity', client: 'Nando\'s', niche: 'COMMUNICATION', tags: ['Design', 'AI'], date: '2024', image: 'https://picsum.photos/seed/454/900/700' },
  { title: 'VR Engine Launch', client: 'Sony', niche: 'EXPERIENCE', tags: ['Three.js', 'WebXR'], date: '2025', image: 'https://picsum.photos/seed/455/900/700' },
  { title: 'Streetwear Campaign', client: 'Nike', niche: 'COMMUNICATION', tags: ['Fashion', 'Social'], date: '2024', image: 'https://picsum.photos/seed/456/900/700' },
  { title: 'Tech Review Network', client: 'Apple', niche: 'EXPERIENCE', tags: ['Review', 'Tech'], date: '2025', image: 'https://picsum.photos/seed/457/900/700' },
  { title: 'Visitor Experience', client: 'Google', niche: 'EXPERIENCE', tags: ['Museum', 'Interactive'], date: '2024', image: 'https://picsum.photos/seed/458/900/700' },
  { title: 'Data Visualization OS', client: 'Meta', niche: 'PRODUCT', tags: ['Analytics', 'Dashboard'], date: '2025', image: 'https://picsum.photos/seed/459/900/700' },
  { title: 'Sonic Brand System', client: 'Spotify', niche: 'COMMUNICATION', tags: ['Branding', 'Sound'], date: '2024', image: 'https://picsum.photos/seed/460/900/700' },
  { title: 'Climate AI Monitor', client: 'UNEP', niche: 'EXPERIENCE', tags: ['Climate', 'Data'], date: '2025', image: 'https://picsum.photos/seed/461/900/700' },
  { title: 'Creator Economy Hub', client: 'Patreon', niche: 'PRODUCT', tags: ['NFT', 'Community'], date: '2024', image: 'https://picsum.photos/seed/462/900/700' },
  { title: 'Spatial Commerce', client: 'IKEA', niche: 'EXPERIENCE', tags: ['Retail', 'AR'], date: '2025', image: 'https://picsum.photos/seed/463/900/700' },
  { title: 'Biotech Viz Platform', client: 'Moderna', niche: 'EXPERIENCE', tags: ['Biology', 'Viz'], date: '2024', image: 'https://picsum.photos/seed/464/900/700' },
  { title: 'Urban Intelligence', client: 'Siemens', niche: 'PRODUCT', tags: ['City', 'IoT'], date: '2025', image: 'https://picsum.photos/seed/465/900/700' },
  { title: 'Generative Fashion', client: 'Gucci', niche: 'COMMUNICATION', tags: ['AI', 'Design'], date: '2024', image: 'https://picsum.photos/seed/466/900/700' },
]

const GRID_OPTIONS: Partial<InfiniteGridOptions> = {
  // Relying on defaults from types.ts
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
