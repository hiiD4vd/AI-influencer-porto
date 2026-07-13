import type { OGLRenderingContext, Texture } from 'ogl'
import { Texture as OGLTexture } from 'ogl'
import type { CardData } from './types'

const FONT = `600 24px 'Inter', -apple-system, sans-serif`
const FONT_SM = `500 16px 'Inter', -apple-system, sans-serif`

export interface TexturePair {
  foreground: Texture
  background: Texture
}

// ─── Foreground: 4-corner metadata + centered fullbleed image ────────────────
export function createForegroundTexture(
  gl: OGLRenderingContext,
  card: CardData,
  cw = 512,   // canvas width
  ch = 672,   // canvas height (taller to match new 1.6 x 2.1 aspect ratio)
): Texture {
  const scale = 2
  const cvs = document.createElement('canvas')
  cvs.width = cw * scale; cvs.height = ch * scale
  const ctx = cvs.getContext('2d')!
  ctx.scale(scale, scale)

  const STRIP = Math.round(ch * 0.12)
  const IMG_Y = STRIP
  const IMG_H = ch - STRIP * 2

  ctx.clearRect(0, 0, cw, ch)

  const tex = new OGLTexture(gl, {
    image: cvs,
    generateMipmaps: false,
    minFilter: (gl as WebGLRenderingContext).LINEAR,
    magFilter: (gl as WebGLRenderingContext).LINEAR,
  })

  function paint(img?: HTMLImageElement) {
    ctx.clearRect(0, 0, cw, ch)

    if (img) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, IMG_Y, cw, IMG_H)
      ctx.clip()
      const ar = img.width / img.height
      const tar = cw / IMG_H
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else           { sh = img.width / tar;  sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, 0, IMG_Y, cw, IMG_H)
      
      // Dim the image slightly so corner text stands out if we ever move it over image, 
      // or just to look moody.
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(0, IMG_Y, cw, IMG_H)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fillRect(0, IMG_Y, cw, IMG_H)
    }

    const ty = STRIP / 2
    ctx.textBaseline = 'middle'

    // Top-left: niche
    ctx.font = FONT_SM
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.textAlign = 'left'
    ctx.fillText(card.niche.toUpperCase(), 24, ty)

    // Top-right: year
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillText(card.date, cw - 24, ty)

    const by = ch - STRIP / 2

    // Bottom-left: client
    ctx.font = FONT
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.textAlign = 'left'
    ctx.fillText(card.client, 24, by)

    // Bottom-right: tags
    ctx.font = FONT_SM
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textAlign = 'right'
    ctx.fillText(card.tags.join(' · '), cw - 24, by)

    // Hairline borders
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, STRIP); ctx.lineTo(cw, STRIP)
    ctx.moveTo(0, ch - STRIP); ctx.lineTo(cw, ch - STRIP)
    ctx.stroke()

    tex.image = cvs
    tex.needsUpdate = true
  }

  paint()

  if (card.image) {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = card.image
    img.onload = () => paint(img)
  }

  return tex
}

// ─── Background: blurred version of image, revealed on hover ─────────────────
export function createBackgroundTexture(
  gl: OGLRenderingContext,
  card: CardData,
  cw = 512,
  ch = 672,
): Texture {
  const cvs = document.createElement('canvas')
  cvs.width = cw; cvs.height = ch
  const ctx = cvs.getContext('2d')!
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, cw, ch)

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
      // Draw heavily blurred version of the image filling the full card
      const ar = img.width / img.height
      const tar = cw / ch
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else           { sh = img.width / tar;  sy = (img.height - sh) / 2 }

      ctx.filter = 'blur(28px) saturate(1.3) brightness(0.55)'
      ctx.drawImage(img, sx, sy, sw, sh, -40, -40, cw + 80, ch + 80)
      ctx.filter = 'none'

      // Dark overlay so it stays moody, not washed out
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, 0, cw, ch)

      tex.image = cvs
      tex.needsUpdate = true
    }
  }

  return tex
}
