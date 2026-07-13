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

// ─── HSL ↔ RGB helpers ──────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the dominant hue from an image and re-apply it at a fixed
 * dark, moody luminosity — identical aesthetic to phantom.land.
 *
 * Strategy:
 *   1. Average all pixels to get the scene's mean RGB.
 *   2. Convert to HSL to extract the hue (the "mood" of the image).
 *   3. Re-map to: saturation=0.55, lightness=0.18 → deep, rich, dark color.
 *
 * This prevents washed-out bright colors (e.g. the aurora's harsh cyan)
 * while keeping each tile's hover background feel tonally correct.
 */
function extractDominantColor(img: HTMLImageElement): [number, number, number] {
  const size = 64
  const cvs = document.createElement('canvas')
  cvs.width = size; cvs.height = size
  const ctx = cvs.getContext('2d')!

  // Center crop so the subject matters more than letterbox bars
  const ar = img.width / img.height
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (ar > 1) { sw = img.height; sx = (img.width - sw) / 2 }
  else         { sh = img.width;  sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)

  const d = ctx.getImageData(0, 0, size, size).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
  }

  const rf = r / n / 255
  const gf = g / n / 255
  const bf = b / n / 255

  // Extract hue from the average color
  const [h, s] = rgbToHsl(rf, gf, bf)

  // If the image is nearly grayscale (low saturation), fall back to a
  // near-neutral dark grey so we don't invent a random hue.
  if (s < 0.08) {
    return [0.10, 0.10, 0.10]
  }

  // Re-apply hue at a fixed dark, moody target:
  //   Saturation: 0.55  — rich but not neon
  //   Lightness:  0.18  — dark enough to stay premium/readable
  return hslToRgb(h, 0.55, 0.18)
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

  const PAD = 16
  const TEXT_PAD = 14
  // Maximize image area (leave just enough room for top/bottom text)
  const imageY = PAD + 32
  const imageH = h - (PAD * 2) - 64

  function paintUI(img?: HTMLImageElement) {
    ctx.clearRect(0, 0, w, h)

    // Border on transparent background
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    if (img) {
      // ── Image ──
      ctx.save()
      ctx.beginPath()
      rr(ctx, PAD, imageY, w - PAD * 2, imageH, 4)
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
      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      ctx.save(); ctx.beginPath()
      rr(ctx, PAD, imageY, w - PAD * 2, imageH, 4)
      ctx.fill(); ctx.restore()
    }

    // ── 4-Corner Metadata (Phantom.land style) ──
    ctx.font = `600 10px ${FONT_BASE}`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    
    // Support modern canvas letterSpacing for that premium editorial look
    if ('letterSpacing' in ctx) {
      ;(ctx as any).letterSpacing = '1px'
    }

    // 1. Top-Left: Title
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(card.title.toUpperCase(), PAD + 4, PAD + TEXT_PAD)

    // 2. Top-Right: Brand/Badge
    ctx.textAlign = 'right'
    ctx.fillText(card.badge.toUpperCase(), w - PAD - 4, PAD + TEXT_PAD)

    // 3. Bottom-Left: Tags
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const tagsText = card.tags.join('   ·   ').toUpperCase()
    ctx.fillText(tagsText, PAD + 4, h - PAD - TEXT_PAD)

    // 4. Bottom-Right: Date
    ctx.textAlign = 'right'
    ctx.fillText(card.date, w - PAD - 4, h - PAD - TEXT_PAD)

    // Reset letterSpacing
    if ('letterSpacing' in ctx) {
      ;(ctx as any).letterSpacing = '0px'
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
