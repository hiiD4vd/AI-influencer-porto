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
  const size = 64
  const cvs = document.createElement('canvas')
  cvs.width = size; cvs.height = size
  const ctx = cvs.getContext('2d')!

  const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.width
  const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.height

  if (!mw || !mh) return [0.1, 0.1, 0.1]

  const ar = mw / mh
  let sx = 0, sy = 0, sw = mw, sh = mh
  if (ar > 1) { sw = mh; sx = (mw - sw) / 2 }
  else        { sh = mw; sy = (mh - sh) / 2 }
  
  ctx.drawImage(media, sx, sy, sw, sh, 0, 0, size, size)

  const d = ctx.getImageData(0, 0, size, size).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
  }

  const [h, s] = rgbToHsl(r / n / 255, g / n / 255, b / n / 255)
  if (s < 0.08) return [0.10, 0.10, 0.10]
  return hslToRgb(h, 0.55, 0.18)
}

export function createForegroundTexture(
  gl: OGLRenderingContext,
  card: CardData,
  w = 512,
  h = 910,
): TextureResult {
  const scale = 2
  const cvs = document.createElement('canvas')
  cvs.width = w * scale
  cvs.height = h * scale
  const ctx = cvs.getContext('2d')!
  ctx.scale(scale, scale)

  ctx.clearRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const PAD = 16
  const MARGIN_TOP = 52
  const MARGIN_BOTTOM = 52

  ctx.font = `600 24px ${FONT_BASE}`
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
  const tagsText = card.tags.join('   ·   ').toUpperCase()
  ctx.fillText(tagsText, PAD + 8, h - MARGIN_BOTTOM / 2)

  ctx.textAlign = 'right'
  ctx.fillText(card.date, w - PAD - 8, h - MARGIN_BOTTOM / 2)

  const uiTexture = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: true,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    magFilter: gl.LINEAR,
  })

  const emptyCvs = document.createElement('canvas')
  emptyCvs.width = 2; emptyCvs.height = 2
  emptyCvs.getContext('2d')!.fillRect(0,0,2,2) // black fallback

  const mediaTexture = new OGLTexture(gl, {
    image: emptyCvs,
    generateMipmaps: false, // DO NOT generate mipmaps for video, it kills performance
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  })

  let dominantColor: [number, number, number] = [0.1, 0.1, 0.1]
  const result: TextureResult = { uiTexture, mediaTexture, dominantColor }

  if (card.video) {
    const videoElement = document.createElement('video')
    videoElement.crossOrigin = 'Anonymous'
    videoElement.src = card.video
    videoElement.muted = true
    videoElement.loop = true
    videoElement.playsInline = true
    videoElement.autoplay = true // play immediately for testing
    videoElement.play().catch(() => {})

    // Make sure we update the texture reference when video has data
    videoElement.addEventListener('loadeddata', () => {
      mediaTexture.image = videoElement
      mediaTexture.needsUpdate = true
      result.dominantColor = extractDominantColor(videoElement)
      if (result._colorUniforms) result._colorUniforms.forEach(u => { u.value = result.dominantColor })
    }, { once: true })

    result.videoElement = videoElement
  } else if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => {
      mediaTexture.image = img
      mediaTexture.needsUpdate = true
      result.dominantColor = extractDominantColor(img)
      if (result._colorUniforms) result._colorUniforms.forEach(u => { u.value = result.dominantColor })
    }
  } else {
    const emptyCvs = document.createElement('canvas')
    emptyCvs.width = 2; emptyCvs.height = 2
    mediaTexture.image = emptyCvs
  }

  return result
}
