import type { OGLRenderingContext, Texture } from 'ogl'
import { Texture as OGLTexture } from 'ogl'
import type { CardData } from './types'

const FONT_BASE = `'Inter', -apple-system, sans-serif`
const FONT_DISPLAY = `'Syne', 'Inter', sans-serif`

/**
 * Generates the foreground (UI card) canvas texture.
 * Paints badge, date, title, tags, and async image.
 */
export function createForegroundTexture(gl: OGLRenderingContext, card: CardData, w = 512, h = 512): Texture {
  const scale = 2
  const cvs = document.createElement('canvas')
  cvs.width = w * scale
  cvs.height = h * scale
  const ctx = cvs.getContext('2d')!
  ctx.scale(scale, scale)

  // Dark base
  ctx.fillStyle = '#101010'
  ctx.fillRect(0, 0, w, h)

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const tex = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: false,
    minFilter: (gl as WebGLRenderingContext).LINEAR,
    magFilter: (gl as WebGLRenderingContext).LINEAR,
  })

  function paint(withImage = false, img?: HTMLImageElement) {
    ctx.clearRect(0, 0, w, h)

    // Base card
    ctx.fillStyle = '#101010'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    const PAD = 20
    const imageH = Math.round(h * 0.52)
    const imageY = 54

    // Image area
    if (withImage && img) {
      ctx.save()
      ctx.beginPath()
      roundRect(ctx, PAD, imageY, w - PAD * 2, imageH, 6)
      ctx.clip()
      const ar = img.width / img.height
      const tar = (w - PAD * 2) / imageH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else { sh = img.width / tar; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, PAD, imageY, w - PAD * 2, imageH)
      ctx.restore()
    } else {
      // Placeholder shimmer
      const grad = ctx.createLinearGradient(PAD, imageY, w - PAD, imageY + imageH)
      grad.addColorStop(0, 'rgba(255,255,255,0.04)')
      grad.addColorStop(1, 'rgba(255,255,255,0.01)')
      ctx.fillStyle = grad
      ctx.save()
      ctx.beginPath()
      roundRect(ctx, PAD, imageY, w - PAD * 2, imageH, 6)
      ctx.clip()
      ctx.fillRect(PAD, imageY, w - PAD * 2, imageH)
      ctx.restore()
    }

    // Badge pill
    ctx.font = `600 10px ${FONT_BASE}`
    const bText = card.badge
    const bW = ctx.measureText(bText).width + 24
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.save()
    ctx.beginPath()
    roundRect(ctx, PAD, PAD, bW, 26, 13)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(bText, PAD + bW / 2, PAD + 13)

    // Date
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.font = `400 10px ${FONT_BASE}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.date, w - PAD, PAD + 13)

    // Title — bottom left
    const titleY = h - (card.tags.length > 0 ? 52 : 28)
    ctx.fillStyle = '#fff'
    ctx.font = `700 22px ${FONT_DISPLAY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const words = card.title.split(' ')
    let line = ''
    const lines: string[] = []
    for (const word of words) {
      const test = line + word + ' '
      if (ctx.measureText(test).width > w - PAD * 2 - 4 && line) {
        lines.push(line.trim()); line = word + ' '
      } else { line = test }
    }
    lines.push(line.trim())
    lines.slice(-2).reverse().forEach((l, i) => {
      ctx.fillText(l, PAD, titleY - i * 28)
    })

    // Tags
    if (card.tags.length > 0) {
      ctx.font = `500 9px ${FONT_BASE}`
      let tx = PAD
      card.tags.forEach(tag => {
        const tw = ctx.measureText(tag).width + 18
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.save(); ctx.beginPath()
        roundRect(ctx, tx, h - 30, tw, 19, 9.5)
        ctx.fill(); ctx.restore()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(tag, tx + tw / 2, h - 20)
        tx += tw + 5
      })
    }

    tex.image = cvs
    tex.needsUpdate = true
  }

  paint(false)

  if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => paint(true, img)
  }

  return tex
}

/**
 * Generates the blurred background (hover reveal) canvas texture.
 */
export function createBackgroundTexture(gl: OGLRenderingContext, card: CardData, w = 512, h = 512): Texture {
  const cvs = document.createElement('canvas')
  cvs.width = w; cvs.height = h
  const ctx = cvs.getContext('2d')!
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, w, h)

  const tex = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: false,
    minFilter: (gl as WebGLRenderingContext).LINEAR,
    magFilter: (gl as WebGLRenderingContext).LINEAR,
  })

  if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => {
      const ar = img.width / img.height; const tar = w / h
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else { sh = img.width / tar; sy = (img.height - sh) / 2 }
      ctx.filter = 'blur(22px)'
      ctx.drawImage(img, sx, sy, sw, sh, -40, -40, w + 80, h + 80)
      ctx.filter = 'none'
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, w, h)
      tex.image = cvs
      tex.needsUpdate = true
    }
  }

  return tex
}

// Polyfill roundRect for older browsers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
