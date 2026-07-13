export interface CardData {
  title: string
  client: string       // e.g. "Google", "DIAGEO", "Nando's"
  niche: string        // e.g. "EXPERIENCE", "COMMUNICATION"
  tags: string[]       // e.g. ["WEBSITE", "AR", "3D"]
  date: string         // e.g. "2025"
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
  tileWidth: number    // OGL world units
  tileHeight: number   // OGL world units
  gridGapX: number
  gridGapY: number
  baseCameraZ: number
  enablePostProcessing: boolean
  postProcessParams: PostProcessParams
}

export const defaultOptions: InfiniteGridOptions = {
  gridCols: 7,
  gridRows: 5,
  tileWidth: 1.55,
  tileHeight: 1.72,
  gridGapX: 0.025,
  gridGapY: 0.025,
  baseCameraZ: 8,
  enablePostProcessing: true,
  postProcessParams: {
    distortionIntensity: -0.28,
    vignetteOffset: -0.1,
    vignetteDarkness: 0.72,
  },
}

export interface TileGroupData {
  baseX: number
  baseY: number
  offsetX: number
  offsetY: number
}
