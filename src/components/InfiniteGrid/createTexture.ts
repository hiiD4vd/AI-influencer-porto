import { Texture as OGLTexture } from 'ogl'
import type { OGLRenderingContext } from 'ogl'
import type { CardData } from './types'

const FONT_BASE = `'Inter', -apple-system, sans-serif`

export interface TextureResult {
  uiTexture: OGLTexture
  mediaTexture: OGLTexture
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

function extractDominantColor(media: HTMLImageElement | HTMLVideoElement): [number, number, number] {
  try {
    const size = 64
    const cvs = document.createElement('canvas')
    cvs.width = size; cvs.height = size
    const ctx = cvs.getContext('2d')!

    const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.width
    const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.height

    if (!mw || !mh) return [0.1, 0.1, 0.1]

    ctx.drawImage(media, 0, 0, size, size)
    const d = ctx.getImageData(0, 0, size, size).data
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
  // ── UI Canvas (Text overlay) ──────────────────────────────────────────────
  const scale = 2
  const cvs = document.createElement('canvas')
  cvs.width = w * scale
  cvs.height = h * scale
  const ctx = cvs.getContext('2d')!
  ctx.scale(scale, scale)

  ctx.clearRect(0, 0, w, h)

  // Subtle white border
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const PAD = 16
  const MARGIN_TOP = 52
  const MARGIN_BOTTOM = 52

  // Draw a subtle gradient overlay at top and bottom so text is readable
  // Top gradient
  const topGrad = ctx.createLinearGradient(0, 0, 0, MARGIN_TOP + 24)
  topGrad.addColorStop(0, 'rgba(0,0,0,0.7)')
  topGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, w, MARGIN_TOP + 24)

  // Bottom gradient
  const botGrad = ctx.createLinearGradient(0, h - MARGIN_BOTTOM - 24, 0, h)
  botGrad.addColorStop(0, 'rgba(0,0,0,0)')
  botGrad.addColorStop(1, 'rgba(0,0,0,0.7)')
  ctx.fillStyle = botGrad
  ctx.fillRect(0, h - MARGIN_BOTTOM - 24, w, MARGIN_BOTTOM + 24)

  // Text
  ctx.font = `600 22px ${FONT_BASE}`
  ctx.fillStyle = 'rgba(255,255,255,1)'
  if ('letterSpacing' in ctx) {
    ;(ctx as any).letterSpacing = '1px'
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(card.title.toUpperCase(), PAD + 8, MARGIN_TOP / 2)

  ctx.textAlign = 'right'
  ctx.fillText(card.badge.toUpperCase(), w - PAD - 8, MARGIN_TOP / 2)

  ctx.textAlign = 'left'
  const tagsText = card.tags.join('  ·  ').toUpperCase()
  ctx.fillText(tagsText, PAD + 8, h - MARGIN_BOTTOM / 2)

  ctx.textAlign = 'right'
  ctx.fillText(card.date, w - PAD - 8, h - MARGIN_BOTTOM / 2)

  const uiTexture = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: true,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    magFilter: gl.LINEAR,
  })

  // ── Media Texture (Video / Image) ─────────────────────────────────────────
  // We pre-size the texture to the card dimensions so OGL reserves the
  // correct GPU memory slot immediately; we upload real data when ready.
  const mediaCvs = document.createElement('canvas')
  mediaCvs.width = w
  mediaCvs.height = h
  const mctx = mediaCvs.getContext('2d')!
  mctx.fillStyle = '#111'
  mctx.fillRect(0, 0, w, h)

  const mediaTexture = new OGLTexture(gl, {
    image: mediaCvs,
    generateMipmaps: false, // NEVER use mipmaps on a live video texture
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE,
  })

  let dominantColor: [number, number, number] = [0.1, 0.1, 0.1]
  const result: TextureResult = { uiTexture, mediaTexture, dominantColor }

  if (card.video) {
    const videoElement = document.createElement('video')
    // Critical: DO NOT use crossOrigin unless the server actually sends CORS headers
    // Google Storage does, so we keep it.
    videoElement.crossOrigin = 'Anonymous'
    videoElement.src = card.video
    videoElement.muted = true
    videoElement.loop = true
    videoElement.playsInline = true

    const onReady = () => {
      // At this point videoWidth/Height are known and frames are available
      // Set the video element directly as the OGL texture image
      mediaTexture.image = videoElement as any
      mediaTexture.needsUpdate = true
      result.videoElement = videoElement
      try {
        result.dominantColor = extractDominantColor(videoElement)
        if (result._colorUniforms) result._colorUniforms.forEach(u => { u.value = result.dominantColor })
      } catch { /* CORS may block color extraction, just skip */ }
    }

    // 'loadeddata' fires when the first frame is decoded and ready
    videoElement.addEventListener('loadeddata', onReady, { once: true })
    // Fallback: canplaythrough if loadeddata never fires
    videoElement.addEventListener('canplaythrough', onReady, { once: true })

    videoElement.load()
    videoElement.play().catch(() => {
      // Autoplay blocked — will play when user interacts
    })

  } else if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => {
      mediaTexture.image = img as any
      mediaTexture.needsUpdate = true
      result.dominantColor = extractDominantColor(img)
      if (result._colorUniforms) result._colorUniforms.forEach(u => { u.value = result.dominantColor })
    }
  }

  return result
}
