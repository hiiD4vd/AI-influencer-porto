import type { OGLRenderingContext, Texture } from 'ogl'
import { Texture as OGLTexture } from 'ogl'
import type { CardData } from './types'

const FONT_BASE = `'Inter', -apple-system, sans-serif`
const FONT_DISPLAY = `'Syne', 'Inter', sans-serif`

/** Result of texture creation — texture + extracted dominant RGB color */
export interface TextureResult {
  texture: Texture
  /** Dominant color [r,g,b] in 0-1 range, extracted from the image */
  dominantColor: [number, number, number]
}

/**
 * Sample the center region of a loaded image and return the average
 * color as a normalized [r,g,b] tuple.
 */
function extractDominantColor(img: HTMLImageElement): [number, number, number] {
  const size = 64
  const cvs = document.createElement('canvas')
  cvs.width = size; cvs.height = size
  const ctx = cvs.getContext('2d')!
  // Draw center crop
  const ar = img.width / img.height
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (ar > 1) { sw = img.height; sx = (img.width - sw) / 2 }
  else         { sh = img.width;  sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)
  const d = ctx.getImageData(0, 0, size, size).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i+1]; b += d[i+2]; n++
  }
  // Boost saturation slightly — make it vibrant like phantom.land
  const rf = r / n / 255
  const gf = g / n / 255
  const bf = b / n / 255
  const max = Math.max(rf, gf, bf)
  const boost = 1.4
  return [
    Math.min(1, rf / max * boost),
    Math.min(1, gf / max * boost),
    Math.min(1, bf / max * boost),
  ]
}

// polyfill roundRect
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Generates the foreground (card UI) canvas texture.
 * Returns the texture AND the extracted dominant color.
 *
 * The card canvas uses **alpha = 0 for the background** so the GLSL shader
 * can replace it with the hover color.  Only image pixels and text have alpha > 0.
 */
export function createForegroundTexture(
  gl: OGLRenderingContext,
  card: CardData,
  w = 512,
  h = 512,
): TextureResult {
  const scale = 2
  const cvs = document.createElement('canvas')
  cvs.width = w * scale
  cvs.height = h * scale
  const ctx = cvs.getContext('2d')!
  ctx.scale(scale, scale)

  // ── Start fully transparent — GLSL shader provides the background color ──
  ctx.clearRect(0, 0, w, h)

  // Hairline border (semi-transparent — visible regardless of bg color)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const tex = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: false,
    minFilter: (gl as WebGLRenderingContext).LINEAR,
    magFilter: (gl as WebGLRenderingContext).LINEAR,
  })

  let dominantColor: [number, number, number] = [0.06, 0.06, 0.06]

  const PAD = 20
  const imageH = Math.round(h * 0.55)
  const imageY = 50

  function paintUI(img?: HTMLImageElement) {
    ctx.clearRect(0, 0, w, h)

    // Border on transparent background
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    if (img) {
      // ── Image ──
      ctx.save()
      ctx.beginPath()
      rr(ctx, PAD, imageY, w - PAD * 2, imageH, 6)
      ctx.clip()
      const ar = img.width / img.height
      const tar = (w - PAD * 2) / imageH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else          { sh = img.width / tar;  sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, PAD, imageY, w - PAD * 2, imageH)
      ctx.restore()
    } else {
      // placeholder shimmer (opaque dark so it's visible)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.save(); ctx.beginPath()
      rr(ctx, PAD, imageY, w - PAD * 2, imageH, 6)
      ctx.fill(); ctx.restore()
    }

    // ── Badge ──
    ctx.font = `600 10px ${FONT_BASE}`
    const bText = card.badge
    const bW = ctx.measureText(bText).width + 24
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.save(); ctx.beginPath()
    rr(ctx, PAD, PAD, bW, 26, 13)
    ctx.fill(); ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(bText, PAD + bW / 2, PAD + 13)

    // ── Date ──
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = `400 10px ${FONT_BASE}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(card.date, w - PAD, PAD + 13)

    // ── Title ──
    const titleY = h - (card.tags.length > 0 ? 50 : 26)
    ctx.fillStyle = '#fff'
    ctx.font = `700 22px ${FONT_DISPLAY}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    const words = card.title.split(' ')
    let line = ''; const lines: string[] = []
    for (const word of words) {
      const test = line + word + ' '
      if (ctx.measureText(test).width > w - PAD * 2 - 4 && line) {
        lines.push(line.trim()); line = word + ' '
      } else { line = test }
    }
    lines.push(line.trim())
    lines.slice(-2).reverse().forEach((l, i) => ctx.fillText(l, PAD, titleY - i * 28))

    // ── Tags ──
    if (card.tags.length > 0) {
      ctx.font = `500 9px ${FONT_BASE}`
      let tx = PAD
      card.tags.forEach(tag => {
        const tw = ctx.measureText(tag).width + 18
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.save(); ctx.beginPath()
        rr(ctx, tx, h - 28, tw, 19, 9.5)
        ctx.fill(); ctx.restore()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(tag, tx + tw / 2, h - 18)
        tx += tw + 5
      })
    }

    tex.image = cvs
    tex.needsUpdate = true
  }

  paintUI()

  if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => {
      dominantColor = extractDominantColor(img)
      paintUI(img)
    }
  }

  // _colorUniforms: list of {value} refs in shader programs that need the live color.
  // InfiniteGridClass populates this after creating the Program.
  const result: TextureResult & { _colorUniforms?: Array<{value: [number,number,number]}> } = {
    texture: tex,
    dominantColor,
  }

  if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => {
      // Extract fresh dominant color from the actual loaded image
      const liveColor = extractDominantColor(img)
      result.dominantColor = liveColor
      // Push to all shader uniforms already registered
      if (result._colorUniforms) {
        result._colorUniforms.forEach(u => { u.value = liveColor })
      }
      paintUI(img)
    }
  }

  return result
}
