export interface CardData {
  title: string
  badge: string
  description?: string
  tags: string[]
  date: string
  image?: string
}

export interface PostProcessParams {
  distortionIntensity: number
  vignetteOffset: number
  vignetteDarkness: number
}

export interface InfiniteGridOptions {
  gridCols: number
  gridRows: number
  gridGap: number
  tileSize: number
  baseCameraZ: number
  enablePostProcessing: boolean
  postProcessParams: PostProcessParams
}

export const defaultOptions: InfiniteGridOptions = {
  gridCols: 4,
  gridRows: 4,
  gridGap: 0.06,
  tileSize: 2.4,
  baseCameraZ: 10,
  enablePostProcessing: true,
  postProcessParams: {
    distortionIntensity: -0.18,
    vignetteOffset: 0.0,
    vignetteDarkness: 0.55,
  },
}

export interface TileGroupData {
  baseX: number
  baseY: number
  offsetX: number
  offsetY: number
}

export interface TileKey {
  groupIndex: number
  tileIndex: number
  key: string
}
