<template>
  <div ref="containerRef" class="infinite-grid-wrap" @click="handleClick">
    <!-- OGL canvas is injected here by InfiniteGridClass -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { InfiniteGridClass } from './InfiniteGridClass'
import type { CardData, InfiniteGridOptions } from './types'

interface Props {
  cardData: CardData[]
  options?: Partial<InfiniteGridOptions>
}

const props = withDefaults(defineProps<Props>(), {
  cardData: () => [],
  options: () => ({}),
})

const emit = defineEmits<{
  tileClicked: [{ card: CardData; index: number }]
  onTileLoaded: []
}>()

const containerRef = ref<HTMLElement | null>(null)
let grid: InfiniteGridClass | null = null

onMounted(() => {
  if (!containerRef.value) return
  grid = new InfiniteGridClass(containerRef.value, props.cardData, props.options)
  grid.onTileClicked = (card, index) => emit('tileClicked', { card, index })
})

onUnmounted(() => {
  grid?.destroy()
  grid = null
})

function handleClick() {
  // Clicks are handled natively by InfiniteGridClass raycasting
}
</script>

<style scoped>
.infinite-grid-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
  background: #080808;
}
.infinite-grid-wrap:active {
  cursor: grabbing;
}
</style>
