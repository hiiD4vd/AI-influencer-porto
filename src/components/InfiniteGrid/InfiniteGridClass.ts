import {
  Renderer, Camera, Transform, Plane, Mesh, Program,
  RenderTarget, Triangle, Vec2, Raycast,
  type OGLRenderingContext,
} from 'ogl'
import { gsap } from 'gsap'
import { tileVertex, tileFrag, postVertex, postFrag } from './shaders'
import { createForegroundTexture } from './createTexture'
import { defaultOptions } from './types'
import type { CardData, InfiniteGridOptions, TileGroupData } from './types'

export class InfiniteGridClass {
  private container: HTMLElement
  private cardData: CardData[]
  private options: InfiniteGridOptions
  private renderer!: Renderer
  private gl!: OGLRenderingContext
  private camera!: Camera
  private scene!: Transform
  private postMesh?: Mesh
  private sceneRT?: RenderTarget
  private raycast!: Raycast
  private pointer = new Vec2()

  private TILE_W: number = 0
  private TILE_H: number = 0
  private SPACE_X: number = 0
  private SPACE_Y: number = 0
  private GRID_W: number = 0
  private GRID_H: number = 0

  private groupTransforms: Transform[] = []
  private tileGroupData: TileGroupData[] = []

  // Only foreground meshes needed now — hover color is baked into the shader
  private fgMeshMap = new Map<string, Mesh>()
  // dominant color per tileKey (for hover shader)
  private dominantColors = new Map<string, [number, number, number]>()

  private scrollX = 0
  private scrollY = 0
  private isDown = false
  private startX = 0
  private startY = 0
  private prevX = 0      // previous frame mouse X for per-frame delta
  private prevY = 0      // previous frame mouse Y for per-frame delta
  private velX = 0
  private velY = 0
  private inertiaX = 0
  private inertiaY = 0
  private hasInertia = false
  private currentHoverKey = ''
  private afId = 0
  private dragTotalX = 0
  private dragTotalY = 0
  private dragStartScrollX = 0
  private dragStartScrollY = 0

  public onTileClicked?: (card: CardData, index: number) => void
  public onTileLoaded?: () => void

  constructor(container: HTMLElement, cardData: CardData[], options: Partial<InfiniteGridOptions> = {}) {
    this.container = container
    this.cardData = cardData
    this.options = {
      ...defaultOptions,
      ...options,
      postProcessParams: { ...defaultOptions.postProcessParams, ...options.postProcessParams },
    }
    this.init()
  }

  private init() {
    const { clientWidth: W, clientHeight: H } = this.container

    this.renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: false, antialias: false })
    this.gl = this.renderer.gl
    this.gl.clearColor(0.04, 0.04, 0.04, 1)
    this.container.appendChild(this.gl.canvas)
    this.renderer.setSize(W, H)

    this.camera = new Camera(this.gl, { fov: 38, near: 0.1, far: 200 })
    this.camera.position.z = this.options.baseCameraZ
    this.camera.perspective({ aspect: W / H })

    this.scene = new Transform()
    this.raycast = new Raycast()

    this.TILE_H = this.options.tileSize
    this.TILE_W = this.TILE_H * (16 / 9)
    this.SPACE_X = this.TILE_W + this.options.gridGap
    this.SPACE_Y = this.TILE_H + this.options.gridGap
    this.GRID_W = this.SPACE_X * this.options.gridCols
    this.GRID_H = this.SPACE_Y * this.options.gridRows

    // Post-processing
    if (this.options.enablePostProcessing) {
      this.sceneRT = new RenderTarget(this.gl, { width: W, height: H })
      const geo = new Triangle(this.gl)
      const { distortionIntensity, vignetteOffset, vignetteDarkness } = this.options.postProcessParams
      const prog = new Program(this.gl, {
        vertex: postVertex,
        fragment: postFrag,
        uniforms: {
          tMap:              { value: this.sceneRT.texture },
          uDistortion:       { value: distortionIntensity },
          uVignetteOffset:   { value: vignetteOffset },
          uVignetteDarkness: { value: vignetteDarkness },
          uResolution:       { value: [W, H] },
        },
        depthTest: false, depthWrite: false,
      })
      this.postMesh = new Mesh(this.gl, { geometry: geo, program: prog })
    }

    this.buildGrid()
    this.attachEvents()
    this.loop()
  }

  private buildGrid() {
    // Generate textures per unique card — store dominant color too
    const fgResults = this.cardData.map(card => createForegroundTexture(this.gl, card))
    // Default dominant colors — updated async as images load
    const cardDominant: Array<[number, number, number]> = fgResults.map(r => r.dominantColor)

    let idx = 0
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const bx = this.GRID_W * col
        const by = this.GRID_H * row
        this.tileGroupData.push({ baseX: bx, baseY: by, offsetX: 0, offsetY: 0 })

        const group = new Transform()
        group.position.set(bx, by, 0)
        group.setParent(this.scene)
        this.groupTransforms.push(group)

        const startX = -((this.options.gridCols - 1) / 2) * this.SPACE_X
        const startY =  ((this.options.gridRows - 1) / 2) * this.SPACE_Y

        for (let r = 0; r < this.options.gridRows; r++) {
          for (let c = 0; c < this.options.gridCols; c++) {
            const x = startX + c * this.SPACE_X
            const y = startY - r * this.SPACE_Y
            const localIdx = r * this.options.gridCols + c
            const tileKey = `${idx}-${localIdx}`
            const cardIdx = (idx * this.options.gridCols * this.options.gridRows + localIdx) % this.cardData.length
            const dc = cardDominant[cardIdx]

            const prog = new Program(this.gl, {
              vertex: tileVertex,
              fragment: tileFrag,
              uniforms: {
                map:            { value: fgResults[cardIdx].texture },
                uHoverColor:    { value: [...dc] as [number,number,number] },
                uHoverProgress: { value: 0 },
              },
              transparent: false,
            })

            const geo  = new Plane(this.gl, { width: this.TILE_W, height: this.TILE_H })
            const mesh = new Mesh(this.gl, { geometry: geo, program: prog })
            mesh.position.set(x, y, 0)
            mesh.setParent(group)
            ;(mesh as any)._tileKey  = tileKey
            ;(mesh as any)._cardIdx  = cardIdx
            this.fgMeshMap.set(tileKey, mesh)

            // Register this uniform so createTexture can push live color when image loads
            const result = fgResults[cardIdx] as any
            result._colorUniforms = result._colorUniforms ?? []
            result._colorUniforms.push(prog.uniforms.uHoverColor)

            this.dominantColors.set(tileKey, dc)
          }
        }
        idx++
      }
    }
  }

  private updateGroupPositions() {
    const halfW = this.GRID_W / 2
    const halfH = this.GRID_H / 2

    this.tileGroupData.forEach((gd, i) => {
      const g = this.groupTransforms[i]
      let x = gd.baseX + this.scrollX + gd.offsetX
      let y = gd.baseY + this.scrollY + gd.offsetY

      if (x > halfW * 3)       { gd.offsetX -= this.GRID_W * 3; x -= this.GRID_W * 3 }
      else if (x < -halfW * 3) { gd.offsetX += this.GRID_W * 3; x += this.GRID_W * 3 }
      if (y > halfH * 3)       { gd.offsetY -= this.GRID_H * 3; y -= this.GRID_H * 3 }
      else if (y < -halfH * 3) { gd.offsetY += this.GRID_H * 3; y += this.GRID_H * 3 }

      g.position.set(x, y, 0)
    })
  }

  private updatePointer(clientX: number, clientY: number) {
    const rect = this.container.getBoundingClientRect()
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
  }

  private doHover(meshes: Mesh[]) {
    this.raycast.castMouse(this.camera, this.pointer)
    const hits = this.raycast.intersectBounds(meshes)
    const newKey: string = hits.length > 0 ? (hits[0] as any)._tileKey ?? '' : ''

    if (newKey === this.currentHoverKey) return

    // Fade out old tile
    if (this.currentHoverKey) {
      const m = this.fgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uHoverProgress, {
        value: 0,
        duration: 0.4,
        ease: 'power2.out',
      })
    }
    // Fade in new tile
    if (newKey) {
      const m = this.fgMeshMap.get(newKey)
      if (m) gsap.to(m.program.uniforms.uHoverProgress, {
        value: 1,
        duration: 0.35,
        ease: 'power2.out',
      })
    }

    this.currentHoverKey = newKey
    this.container.style.cursor = newKey ? 'pointer' : 'grab'
  }

  private attachEvents() {
    const el = this.container
    el.addEventListener('mousedown',  e => this.onDown(e.clientX, e.clientY))
    el.addEventListener('mousemove',  e => this.onMove(e.clientX, e.clientY))
    el.addEventListener('mouseup',    e => this.onUp(e.clientX, e.clientY))
    el.addEventListener('mouseleave', () => this.onLeave())
    el.addEventListener('click',      e => this.onClick(e.clientX, e.clientY))

    el.addEventListener('touchstart',  e => { e.preventDefault(); this.onDown(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchmove',   e => { e.preventDefault(); this.onMove(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchend',    e => this.onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY))

    window.addEventListener('resize', () => this.onResize())
  }

  private onDown(x: number, y: number) {
    this.isDown = true
    this.startX = x; this.startY = y
    this.prevX  = x; this.prevY  = y
    this.dragStartScrollX = this.scrollX
    this.dragStartScrollY = this.scrollY
    this.dragTotalX = 0; this.dragTotalY = 0
    this.velX = 0; this.velY = 0
    this.inertiaX = 0; this.inertiaY = 0
    this.hasInertia = false
    this.updatePointer(x, y)
    gsap.to(this.camera.position, { z: this.options.baseCameraZ * 1.08, duration: 0.45, ease: 'power2.out' })
  }

  private onMove(x: number, y: number) {
    this.updatePointer(x, y)
    const meshes = [...this.fgMeshMap.values()]

    if (!this.isDown) {
      this.doHover(meshes)
      return
    }

    // ── Calibrated pixel → OGL world unit conversion ──
    // At FOV=38° and camera Z=10, the visible height ≈ 2 * tan(19°) * 10 ≈ 6.9 OGL units
    // across clientHeight pixels → scale ≈ 6.9 / clientHeight ≈ 0.009 at 720p, 0.006 at 1080p
    // Using a conservative fixed value so it never feels fast on any screen:
    const DRAG_SCALE = 0.004   // OGL units per screen pixel — heavy, precise, 1:1 feel

    const dx = x - this.startX
    const dy = y - this.startY
    this.dragTotalX = Math.abs(dx)
    this.dragTotalY = Math.abs(dy)

    // Per-frame delta for velocity (not cumulative total — that was the bug)
    this.velX = (x - this.prevX) * DRAG_SCALE
    this.velY = (y - this.prevY) * DRAG_SCALE
    this.prevX = x; this.prevY = y

    this.scrollX = this.dragStartScrollX + dx * DRAG_SCALE
    this.scrollY = this.dragStartScrollY - dy * DRAG_SCALE
    this.updateGroupPositions()
  }

  private onUp(_x: number, _y: number) {
    this.isDown = false
    // Inertia = last per-frame velocity, no amplifier — keeps 1:1 feel
    this.inertiaX = this.velX
    this.inertiaY = this.velY
    this.hasInertia = true
    gsap.to(this.camera.position, { z: this.options.baseCameraZ, duration: 0.5, ease: 'power2.out' })

    if (this.currentHoverKey) {
      const m = this.fgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uHoverProgress, { value: 0, duration: 0.4, ease: 'power2.out' })
      this.currentHoverKey = ''
    }
  }

  private onLeave() {
    if (this.currentHoverKey) {
      const m = this.fgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uHoverProgress, { value: 0, duration: 0.4, ease: 'power2.out' })
      this.currentHoverKey = ''
    }
    this.container.style.cursor = 'grab'
  }

  private onClick(x: number, y: number) {
    if (this.dragTotalX + this.dragTotalY > 10) return
    this.updatePointer(x, y)
    this.raycast.castMouse(this.camera, this.pointer)
    const hits = this.raycast.intersectBounds([...this.fgMeshMap.values()])
    if (hits.length > 0) {
      const mesh = hits[0] as any
      const cardIdx: number = mesh._cardIdx ?? 0
      this.onTileClicked?.(this.cardData[cardIdx], cardIdx)
    }
  }

  private onResize() {
    const W = this.container.clientWidth
    const H = this.container.clientHeight
    this.renderer.setSize(W, H)
    this.camera.perspective({ aspect: W / H })
    if (this.sceneRT) this.sceneRT.setSize(W, H)
    if (this.postMesh) this.postMesh.program.uniforms.uResolution.value = [W, H]
  }

  private loop() {
    this.afId = requestAnimationFrame(() => this.loop())

    if (this.hasInertia && !this.isDown) {
      this.scrollX += this.inertiaX
      this.scrollY += this.inertiaY
      // 0.82 friction: grid decelerates over ~10-15 frames and stops cleanly
      this.inertiaX *= 0.82
      this.inertiaY *= 0.82
      this.updateGroupPositions()
      // Stop when velocity is negligible (< 0.0001 OGL units/frame)
      if (Math.abs(this.inertiaX) < 0.0001 && Math.abs(this.inertiaY) < 0.0001) {
        this.inertiaX = 0; this.inertiaY = 0
        this.hasInertia = false
      }
    }

    if (this.options.enablePostProcessing && this.sceneRT && this.postMesh) {
      this.renderer.render({ scene: this.scene, camera: this.camera, target: this.sceneRT })
      this.renderer.render({ scene: this.postMesh, camera: this.camera })
    } else {
      this.renderer.render({ scene: this.scene, camera: this.camera })
    }
  }

  public destroy() {
    cancelAnimationFrame(this.afId)
    this.gl.canvas.remove()
  }
}
