import {
  Renderer, Camera, Transform, Plane, Mesh, Program,
  RenderTarget, Triangle, Vec2, Raycast,
  type OGLRenderingContext, type Texture,
} from 'ogl'
import { gsap } from 'gsap'
import { tileVertex, tileFrag, backgroundFrag, postVertex, postFrag } from './shaders'
import { createForegroundTexture, createBackgroundTexture } from './createTexture'
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

  // Layout
  private TILE: number = 0
  private SPACE: number = 0
  private GRID_W: number = 0
  private GRID_H: number = 0

  // Groups (3×3 for infinite wrap)
  private groupTransforms: Transform[] = []
  private tileGroupData: TileGroupData[] = []

  // Tile mesh maps
  private fgMeshMap = new Map<string, Mesh>()
  private bgMeshMap = new Map<string, Mesh>()

  // Interaction
  private scrollX = 0
  private scrollY = 0
  private isDown = false
  private startX = 0
  private startY = 0
  private prevScrollX = 0
  private prevScrollY = 0
  private velX = 0
  private velY = 0
  private inertiaX = 0
  private inertiaY = 0
  private hasInertia = false
  private currentHoverKey = ''
  private afId = 0

  // Callbacks
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

    this.TILE = this.options.tileSize
    this.SPACE = this.TILE + this.options.gridGap
    this.GRID_W = this.SPACE * this.options.gridCols
    this.GRID_H = this.SPACE * this.options.gridRows

    // Post-processing pipeline
    if (this.options.enablePostProcessing) {
      this.sceneRT = new RenderTarget(this.gl, { width: W, height: H })
      const geo = new Triangle(this.gl)
      const { distortionIntensity, vignetteOffset, vignetteDarkness } = this.options.postProcessParams
      const prog = new Program(this.gl, {
        vertex: postVertex,
        fragment: postFrag,
        uniforms: {
          tMap:             { value: this.sceneRT.texture },
          uDistortion:      { value: distortionIntensity },
          uVignetteOffset:  { value: vignetteOffset },
          uVignetteDarkness:{ value: vignetteDarkness },
          uResolution:      { value: [W, H] },
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
    // Pre-generate one texture set per unique card (reused across groups)
    const fgTextures: Texture[] = []
    const bgTextures: Texture[] = []
    for (const card of this.cardData) {
      fgTextures.push(createForegroundTexture(this.gl, card))
      bgTextures.push(createBackgroundTexture(this.gl, card))
    }

    // 3×3 tile groups for seamless infinite wrap
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

        // Starting position for first tile (top-left of grid)
        const startX = -((this.options.gridCols - 1) / 2) * this.SPACE
        const startY =  ((this.options.gridRows - 1) / 2) * this.SPACE

        for (let r = 0; r < this.options.gridRows; r++) {
          for (let c = 0; c < this.options.gridCols; c++) {
            const x = startX + c * this.SPACE
            const y = startY - r * this.SPACE
            const localIdx = r * this.options.gridCols + c
            const tileKey = `${idx}-${localIdx}`
            const cardIdx = (idx * this.options.gridCols * this.options.gridRows + localIdx) % this.cardData.length

            // Background mesh (blurred image — hidden until hover)
            const bgProg = new Program(this.gl, {
              vertex: tileVertex, fragment: backgroundFrag,
              uniforms: { map: { value: bgTextures[cardIdx] }, uOpacity: { value: 0 } },
              transparent: true,
            })
            const bgGeo = new Plane(this.gl, { width: this.TILE, height: this.TILE })
            const bgMesh = new Mesh(this.gl, { geometry: bgGeo, program: bgProg })
            bgMesh.position.set(x, y, -0.01)
            bgMesh.setParent(group)
            this.bgMeshMap.set(tileKey, bgMesh)

            // Foreground mesh (card UI)
            const fgProg = new Program(this.gl, {
              vertex: tileVertex, fragment: tileFrag,
              uniforms: { map: { value: fgTextures[cardIdx] }, uOpacity: { value: 1 } },
              transparent: true,
            })
            const fgGeo = new Plane(this.gl, { width: this.TILE, height: this.TILE })
            const fgMesh = new Mesh(this.gl, { geometry: fgGeo, program: fgProg })
            fgMesh.position.set(x, y, 0)
            fgMesh.setParent(group)
            ;(fgMesh as any)._tileKey = tileKey
            ;(fgMesh as any)._cardIdx = cardIdx
            this.fgMeshMap.set(tileKey, fgMesh)
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

      // Horizontal wrap
      if (x > halfW * 3)       { gd.offsetX -= this.GRID_W * 3; x -= this.GRID_W * 3 }
      else if (x < -halfW * 3) { gd.offsetX += this.GRID_W * 3; x += this.GRID_W * 3 }
      // Vertical wrap
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

    // Fade out old
    if (this.currentHoverKey) {
      const m = this.bgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uOpacity, { value: 0, duration: 0.35, ease: 'power2.out' })
    }
    // Fade in new
    if (newKey) {
      const m = this.bgMeshMap.get(newKey)
      if (m) gsap.to(m.program.uniforms.uOpacity, { value: 1, duration: 0.35, ease: 'power2.out' })
    }

    this.currentHoverKey = newKey
    this.container.style.cursor = newKey ? 'pointer' : 'grab'
  }

  private attachEvents() {
    const el = this.container

    el.addEventListener('mousedown', e => this.onDown(e.clientX, e.clientY))
    el.addEventListener('mousemove', e => this.onMove(e.clientX, e.clientY))
    el.addEventListener('mouseup',   e => this.onUp(e.clientX, e.clientY))
    el.addEventListener('mouseleave', () => this.onLeave())
    el.addEventListener('click', e => this.onClick(e.clientX, e.clientY))

    el.addEventListener('touchstart',  e => { e.preventDefault(); this.onDown(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchmove',   e => { e.preventDefault(); this.onMove(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchend',    e => { this.onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY) })

    window.addEventListener('resize', () => this.onResize())
  }

  private dragStartScrollX = 0
  private dragStartScrollY = 0
  private dragTotalX = 0
  private dragTotalY = 0

  private onDown(x: number, y: number) {
    this.isDown = true
    this.startX = x; this.startY = y
    this.dragStartScrollX = this.scrollX
    this.dragStartScrollY = this.scrollY
    this.dragTotalX = 0; this.dragTotalY = 0
    this.velX = 0; this.velY = 0
    this.hasInertia = false
    this.updatePointer(x, y)
    gsap.to(this.camera.position, { z: this.options.baseCameraZ * 1.15, duration: 0.4, ease: 'power2.out' })
  }

  private onMove(x: number, y: number) {
    this.updatePointer(x, y)
    const meshes = [...this.fgMeshMap.values()]

    if (!this.isDown) {
      this.doHover(meshes)
      return
    }

    const dx = x - this.startX
    const dy = y - this.startY
    this.dragTotalX = Math.abs(dx); this.dragTotalY = Math.abs(dy)

    const scale = 0.013
    this.velX = (x - (this.startX + (this.scrollX - this.dragStartScrollX) / scale)) * scale * 0.3
    this.velY = (y - (this.startY - (this.scrollY - this.dragStartScrollY) / scale)) * scale * 0.3

    this.scrollX = this.dragStartScrollX + dx * scale
    this.scrollY = this.dragStartScrollY - dy * scale
    this.updateGroupPositions()
  }

  private onUp(x: number, y: number) {
    this.isDown = false
    this.inertiaX = this.velX * 18
    this.inertiaY = this.velY * 18
    this.hasInertia = true
    gsap.to(this.camera.position, { z: this.options.baseCameraZ, duration: 0.4, ease: 'power2.out' })

    if (this.currentHoverKey) {
      const m = this.bgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uOpacity, { value: 0, duration: 0.35, ease: 'power2.out' })
      this.currentHoverKey = ''
    }
  }

  private onLeave() {
    if (this.currentHoverKey) {
      const m = this.bgMeshMap.get(this.currentHoverKey)
      if (m) gsap.to(m.program.uniforms.uOpacity, { value: 0, duration: 0.35, ease: 'power2.out' })
      this.currentHoverKey = ''
    }
    this.container.style.cursor = 'grab'
  }

  private onClick(x: number, y: number) {
    const totalMove = this.dragTotalX + this.dragTotalY
    if (totalMove > 10) return
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
    if (this.postMesh) {
      this.postMesh.program.uniforms.uResolution.value = [W, H]
    }
  }

  private loop() {
    this.afId = requestAnimationFrame(() => this.loop())

    // Inertia
    if (this.hasInertia && !this.isDown) {
      this.scrollX += this.inertiaX
      this.scrollY += this.inertiaY
      this.inertiaX *= 0.91
      this.inertiaY *= 0.91
      this.updateGroupPositions()
      if (Math.abs(this.inertiaX) < 0.0001 && Math.abs(this.inertiaY) < 0.0001) this.hasInertia = false
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
    this.container.removeEventListener('mousedown', () => {})
    this.container.removeEventListener('mousemove', () => {})
    this.container.removeEventListener('mouseup', () => {})
  }
}
