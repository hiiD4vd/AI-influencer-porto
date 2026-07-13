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
  tileWidth: 1.6,
  tileHeight: 2.1,
  gridGapX: 0.1,
  gridGapY: 0.1,
  baseCameraZ: 7,
  enablePostProcessing: false, // Turned off! We use 3D vertex displacement for curvature now.
  postProcessParams: {
    distortionIntensity: 0,
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
