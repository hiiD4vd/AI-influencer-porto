import { Texture as OGLTexture } from 'ogl'
import type { OGLRenderingContext } from 'ogl'
import type { CardData } from './types'

const FONT_BASE = `'Inter', -apple-system, sans-serif`

export interface TextureResult {
  uiTexture: OGLTexture
  mediaTexture: OGLTexture
  /** The proxy canvas that gets video frames drawn into it each frame */
  videoCanvas?: HTMLCanvasElement
  videoCtx?: CanvasRenderingContext2D
  videoElement?: HTMLVideoElement
  dominantColor: [number, number, number]
  _colorUniforms?: Array<{value: [number,number,number]}>
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else                h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1; if (t > 1) t -= 1
  if (t < 1/6) return p + (q - p) * 6 * t
  if (t < 1/2) return q
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)]
}

function extractDominantColor(cvs: HTMLCanvasElement): [number, number, number] {
  try {
    const ctx = cvs.getContext('2d')!
    const d = ctx.getImageData(0, 0, cvs.width, cvs.height).data
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
    }
    const [h, s] = rgbToHsl(r / n / 255, g / n / 255, b / n / 255)
    if (s < 0.08) return [0.10, 0.10, 0.10]
    return hslToRgb(h, 0.55, 0.18)
  } catch {
    return [0.1, 0.1, 0.1]
  }
}

export function createForegroundTexture(
  gl: OGLRenderingContext,
  card: CardData,
  w = 512,
  h = 910,
): TextureResult {
  // ── UI Canvas (Text overlay, semi-transparent) ────────────────────────────
  const scale = 2
  const uiCvs = document.createElement('canvas')
  uiCvs.width = w * scale
  uiCvs.height = h * scale
  const ctx = uiCvs.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.clearRect(0, 0, w, h)

  const PAD = 16
  const MARGIN_TOP = 52
  const MARGIN_BOTTOM = 52

  // Gradient overlays so text is readable over any video
  const topGrad = ctx.createLinearGradient(0, 0, 0, MARGIN_TOP + 40)
  topGrad.addColorStop(0, 'rgba(0,0,0,0.75)')
  topGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, w, MARGIN_TOP + 40)

  const botGrad = ctx.createLinearGradient(0, h - MARGIN_BOTTOM - 40, 0, h)
  botGrad.addColorStop(0, 'rgba(0,0,0,0)')
  botGrad.addColorStop(1, 'rgba(0,0,0,0.75)')
  ctx.fillStyle = botGrad
  ctx.fillRect(0, h - MARGIN_BOTTOM - 40, w, MARGIN_BOTTOM + 40)

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  ctx.font = `600 22px ${FONT_BASE}`
  ctx.fillStyle = 'rgba(255,255,255,1)'
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '1px'

  ctx.textAlign = 'left';  ctx.textBaseline = 'middle'
  ctx.fillText(card.title.toUpperCase(), PAD + 8, MARGIN_TOP / 2)
  ctx.textAlign = 'right'
  ctx.fillText(card.badge.toUpperCase(), w - PAD - 8, MARGIN_TOP / 2)
  ctx.textAlign = 'left'
  ctx.fillText(card.tags.join('  ·  ').toUpperCase(), PAD + 8, h - MARGIN_BOTTOM / 2)
  ctx.textAlign = 'right'
  ctx.fillText(card.date, w - PAD - 8, h - MARGIN_BOTTOM / 2)

  const uiTexture = new OGLTexture(gl, {
    image: uiCvs,
    generateMipmaps: true,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    magFilter: gl.LINEAR,
  })

  // ── Media Proxy Canvas ────────────────────────────────────────────────────
  // Instead of assigning an HTMLVideoElement directly to OGL (unreliable),
  // we use a plain canvas as the GPU texture source.
  // Each frame the render loop calls videoCtx.drawImage(videoElement) → this
  // canvas → then sets needsUpdate = true. Canvas → WebGL always works.
  const mediaCvs = document.createElement('canvas')
  mediaCvs.width = w
  mediaCvs.height = h
  const mediaCvsCtx = mediaCvs.getContext('2d')!
  mediaCvsCtx.fillStyle = '#0a0a0a'
  mediaCvsCtx.fillRect(0, 0, w, h)

  const mediaTexture = new OGLTexture(gl, {
    image: mediaCvs,
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE,
  })

  const result: TextureResult = {
    uiTexture,
    mediaTexture,
    videoCanvas: mediaCvs,
    videoCtx: mediaCvsCtx,
    dominantColor: [0.1, 0.1, 0.1],
  }

  if (card.video) {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.src = card.video
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'

    result.videoElement = video

    video.addEventListener('canplay', () => {
      video.play().catch(() => {})
    }, { once: true })

    video.load()

  } else if (card.image) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      mediaCvsCtx.drawImage(img, 0, 0, w, h)
      mediaTexture.needsUpdate = true
      result.dominantColor = extractDominantColor(mediaCvs)
      result._colorUniforms?.forEach(u => { u.value = result.dominantColor })
    }
    img.src = card.image
  }

  return result
}
