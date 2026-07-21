<template>
  <canvas
    ref="canvas"
    class="profession-fluid-background"
    :class="{ 'is-visible': fluidVisible }"
    aria-hidden="true"
  ></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import shaders from '../../code (2)/cappen-fluid-simulation/js/shaders.js'

type DoubleTarget = {
  read: THREE.WebGLRenderTarget
  write: THREE.WebGLRenderTarget
  swap: () => void
}

class SolidFluidSimulation {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  private materials: Record<string, THREE.ShaderMaterial>
  private velocity!: DoubleTarget
  private dye!: DoubleTarget
  private divergence!: THREE.WebGLRenderTarget
  private curlTarget!: THREE.WebGLRenderTarget
  private pressure!: DoubleTarget
  private simSize = { w: 256, h: 256 }
  private dyeSize = { w: 1024, h: 1024 }
  private width = 1
  private height = 1
  private dpr = 1
  private frame = 0
  private lastTime = performance.now()
  private active = true
  private destroyed = false
  private hasPointer = false
  private host: HTMLElement
  private pointer = { x: 0, y: 0, velocityX: 0, velocityY: 0, moved: false }
  private readonly config = {
    simResolution: 256,
    dyeResolution: 1024,
    curl: 50,
    pressureIterations: 40,
    velocityDissipation: 0.95,
    dyeDissipation: 0.95,
    splatRadius: 0.3,
    forceStrength: 8.5,
    pressureDecay: 0.75,
    threshold: 1,
    edgeSoftness: 0,
  }

  constructor(host: HTMLElement, canvasElement: HTMLCanvasElement) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.quad)
    this.resize(false)
    this.setupTargets()
    this.materials = this.setupMaterials()
    this.frame = requestAnimationFrame(this.tick)
  }

  private makeMaterial(shader: [string, string], uniforms: Record<string, THREE.IUniform>) {
    return new THREE.ShaderMaterial({ vertexShader: shader[0], fragmentShader: shader[1], uniforms, transparent: shader === shaders.display })
  }

  private setupMaterials() {
    const texture = () => ({ value: null })
    const number = (value = 0) => ({ value })
    const vector = () => ({ value: new THREE.Vector2() })
    return {
      splat: this.makeMaterial(shaders.splat, { uTarget: texture(), aspectRatio: number(), radius: number(), color: { value: new THREE.Vector3() }, point: vector() }),
      advection: this.makeMaterial(shaders.advection, { uVelocity: texture(), uSource: texture(), texelSize: vector(), dt: number(), dissipation: number() }),
      divergence: this.makeMaterial(shaders.divergence, { uVelocity: texture(), texelSize: vector() }),
      curl: this.makeMaterial(shaders.curl, { uVelocity: texture(), texelSize: vector() }),
      vorticity: this.makeMaterial(shaders.vorticity, { uVelocity: texture(), uCurl: texture(), texelSize: vector(), curlStrength: number(), dt: number() }),
      pressure: this.makeMaterial(shaders.pressure, { uPressure: texture(), uDivergence: texture(), texelSize: vector() }),
      gradientSubtract: this.makeMaterial(shaders.gradientSubtract, { uPressure: texture(), uVelocity: texture(), texelSize: vector() }),
      clear: this.makeMaterial(shaders.clear, { uTexture: texture(), value: number() }),
      display: this.makeMaterial(shaders.display, {
        uTexture: texture(),
        threshold: number(this.config.threshold),
        edgeSoftness: number(this.config.edgeSoftness),
        inkColor: { value: new THREE.Color(0x000000) },
      }),
    }
  }

  private createTarget(width: number, height: number) {
    return new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false })
  }

  private createDoubleTarget(width: number, height: number): DoubleTarget {
    return {
      read: this.createTarget(width, height),
      write: this.createTarget(width, height),
      swap() { [this.read, this.write] = [this.write, this.read] },
    }
  }

  private setupTargets() {
    const aspect = this.width / this.height
    this.simSize = { w: this.config.simResolution, h: Math.max(1, Math.round(this.config.simResolution / aspect)) }
    this.dyeSize = { w: this.config.dyeResolution, h: Math.max(1, Math.round(this.config.dyeResolution / aspect)) }
    this.velocity = this.createDoubleTarget(this.simSize.w, this.simSize.h)
    this.dye = this.createDoubleTarget(this.dyeSize.w, this.dyeSize.h)
    this.divergence = this.createTarget(this.simSize.w, this.simSize.h)
    this.curlTarget = this.createTarget(this.simSize.w, this.simSize.h)
    this.pressure = this.createDoubleTarget(this.simSize.w, this.simSize.h)
  }

  move(clientX: number, clientY: number) {
    const rect = this.host.getBoundingClientRect()
    const x = (clientX - rect.left) * this.dpr
    const y = (clientY - rect.top) * this.dpr
    if (x < 0 || y < 0 || x > this.width || y > this.height) return
    this.pointer.velocityX = this.hasPointer ? (x - this.pointer.x) * this.config.forceStrength : 0
    this.pointer.velocityY = this.hasPointer ? (y - this.pointer.y) * this.config.forceStrength : 0
    this.pointer.x = x
    this.pointer.y = y
    this.pointer.moved = true
    this.hasPointer = true
  }

  setActive(active: boolean) {
    this.active = active
    if (active) this.lastTime = performance.now()
  }

  resize(rebuildTargets = true) {
    const rect = this.host.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
    this.width = Math.max(1, rect.width * this.dpr)
    this.height = Math.max(1, rect.height * this.dpr)
    if (rebuildTargets && this.velocity) {
      this.disposeTargets()
      this.setupTargets()
    }
  }

  private set(material: THREE.ShaderMaterial, values: Record<string, unknown>) {
    Object.entries(values).forEach(([key, value]) => { material.uniforms[key].value = value })
    return material
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
  }

  private splat() {
    const material = this.materials.splat
    this.set(material, {
      aspectRatio: this.width / this.height,
      point: new THREE.Vector2(this.pointer.x / this.width, 1 - this.pointer.y / this.height),
      radius: this.config.splatRadius / 100,
      uTarget: this.velocity.read.texture,
      color: new THREE.Vector3(this.pointer.velocityX, -this.pointer.velocityY, 0),
    })
    this.pass(material, this.velocity.write)
    this.velocity.swap()
    this.set(material, { uTarget: this.dye.read.texture, color: new THREE.Vector3(3, 3, 3) })
    this.pass(material, this.dye.write)
    this.dye.swap()
  }

  private simulate(dt: number) {
    const m = this.materials
    const texel = new THREE.Vector2(1 / this.simSize.w, 1 / this.simSize.h)
    this.pass(this.set(m.curl, { uVelocity: this.velocity.read.texture, texelSize: texel }), this.curlTarget)
    this.pass(this.set(m.vorticity, { uVelocity: this.velocity.read.texture, uCurl: this.curlTarget.texture, texelSize: texel, curlStrength: this.config.curl, dt }), this.velocity.write)
    this.velocity.swap()
    this.pass(this.set(m.divergence, { uVelocity: this.velocity.read.texture, texelSize: texel }), this.divergence)
    this.pass(this.set(m.clear, { uTexture: this.pressure.read.texture, value: this.config.pressureDecay }), this.pressure.write)
    this.pressure.swap()
    this.set(m.pressure, { uDivergence: this.divergence.texture, texelSize: texel })
    for (let index = 0; index < this.config.pressureIterations; index += 1) {
      m.pressure.uniforms.uPressure.value = this.pressure.read.texture
      this.pass(m.pressure, this.pressure.write)
      this.pressure.swap()
    }
    this.pass(this.set(m.gradientSubtract, { uPressure: this.pressure.read.texture, uVelocity: this.velocity.read.texture, texelSize: texel }), this.velocity.write)
    this.velocity.swap()
    this.pass(this.set(m.advection, { uVelocity: this.velocity.read.texture, uSource: this.velocity.read.texture, texelSize: texel, dt, dissipation: this.config.velocityDissipation }), this.velocity.write)
    this.velocity.swap()
    this.pass(this.set(m.advection, { uVelocity: this.velocity.read.texture, uSource: this.dye.read.texture, texelSize: new THREE.Vector2(1 / this.dyeSize.w, 1 / this.dyeSize.h), dt, dissipation: this.config.dyeDissipation }), this.dye.write)
    this.dye.swap()
  }

  private tick = (time: number) => {
    if (this.destroyed) return
    this.frame = requestAnimationFrame(this.tick)
    if (!this.active) return
    const dt = Math.min((time - this.lastTime) / 1000, 0.016)
    this.lastTime = time
    if (this.pointer.moved) {
      this.splat()
      this.pointer.moved = false
    }
    this.simulate(dt)
    this.pass(this.set(this.materials.display, { uTexture: this.dye.read.texture }), null)
  }

  private disposeTargets() {
    for (const target of [this.velocity, this.dye, this.pressure]) {
      target.read.dispose()
      target.write.dispose()
    }
    this.divergence.dispose()
    this.curlTarget.dispose()
  }

  dispose() {
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    this.disposeTargets()
    Object.values(this.materials).forEach(material => material.dispose())
    ;(this.quad.geometry as THREE.BufferGeometry).dispose()
    this.scene.clear()
    this.renderer.dispose()
  }
}

const canvas = ref<HTMLCanvasElement | null>(null)
const fluidVisible = ref(false)
let simulation: SolidFluidSimulation | null = null
let observer: IntersectionObserver | null = null

function handlePointerMove(event: PointerEvent) {
  simulation?.move(event.clientX, event.clientY)
}

function handlePointerEnter() {
  fluidVisible.value = true
}

function handlePointerLeave() {
  fluidVisible.value = false
}

function handleResize() {
  simulation?.resize()
}

onMounted(() => {
  const element = canvas.value
  const host = element?.parentElement
  if (!element || !host) return
  simulation = new SolidFluidSimulation(host, element)
  host.addEventListener('pointerenter', handlePointerEnter, { passive: true })
  host.addEventListener('pointermove', handlePointerMove, { passive: true })
  host.addEventListener('pointerleave', handlePointerLeave, { passive: true })
  window.addEventListener('resize', handleResize)
  observer = new IntersectionObserver(entries => simulation?.setActive(entries[0]?.isIntersecting ?? false), { threshold: 0.02 })
  observer.observe(host)
})

onUnmounted(() => {
  canvas.value?.parentElement?.removeEventListener('pointerenter', handlePointerEnter)
  canvas.value?.parentElement?.removeEventListener('pointermove', handlePointerMove)
  canvas.value?.parentElement?.removeEventListener('pointerleave', handlePointerLeave)
  window.removeEventListener('resize', handleResize)
  observer?.disconnect()
  simulation?.dispose()
  observer = null
  simulation = null
})
</script>

<style scoped>
.profession-fluid-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  opacity: 0;
  transition: opacity 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.profession-fluid-background.is-visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .profession-fluid-background {
    transition: none;
  }
}
</style>
