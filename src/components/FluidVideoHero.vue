<template>
  <section
    ref="hero"
    class="fluid-video-hero"
    :class="{ 'is-shared-frame': sharedFrame }"
    aria-label="Interactive KEPIN AI video reveal"
  >
    <div class="fluid-video-front" aria-hidden="true">
      <div class="fluid-video-media">
        <svg class="fluid-video-title" viewBox="0 0 854 480" role="img" aria-label="KEPIN AI">
          <text x="76" y="306" textLength="119" lengthAdjust="spacingAndGlyphs">K</text>
          <text x="195" y="306" textLength="100" lengthAdjust="spacingAndGlyphs">E</text>
          <text x="295" y="306" textLength="107" lengthAdjust="spacingAndGlyphs">P</text>
          <text x="402" y="306" textLength="43" lengthAdjust="spacingAndGlyphs">I</text>
          <text x="448" y="306" textLength="117" lengthAdjust="spacingAndGlyphs">N</text>
          <text x="609" y="306" textLength="130" lengthAdjust="spacingAndGlyphs">A</text>
          <text x="739" y="306" textLength="46" lengthAdjust="spacingAndGlyphs">I</text>
        </svg>
      </div>
    </div>
    <video
      ref="video"
      class="fluid-video-source"
      src="/videos/footer-kevin-ai.mp4"
      preload="auto"
      autoplay
      muted
      loop
      playsinline
      webkit-playsinline
      aria-hidden="true"
    ></video>
    <canvas ref="canvas" class="fluid-video-canvas" aria-hidden="true"></canvas>
    <div v-if="showControls" class="fluid-hero-controls">
      <RouterLink class="fluid-corner fluid-corner--top-left" to="/" aria-label="Go to KEPIN AI home">
        KEPIN.AI / VIBE
      </RouterLink>
      <button class="fluid-corner fluid-corner--top-right" type="button" @click="emit('continue')">
        SKIP INTRO <span aria-hidden="true">↓</span>
      </button>
      <p class="fluid-corner fluid-corner--bottom-left">
        MOVE CURSOR / TOUCH TO REVEAL
      </p>
      <button class="fluid-corner fluid-corner--bottom-right" type="button" @click="emit('continue')">
        SCROLL TO BEGIN <span aria-hidden="true">↓</span>
      </button>
    </div>
    <h1 class="sr-only">KEPIN AI</h1>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'

const props = withDefaults(defineProps<{
  showControls?: boolean
  sharedFrame?: boolean
  clipSharedBottom?: boolean
}>(), {
  showControls: false,
  sharedFrame: false,
  clipSharedBottom: true,
})
const emit = defineEmits<{ continue: [] }>()

const hero = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)

const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.); }`
const precision = `precision highp float;`
const samplerPrecision = `precision mediump sampler2D;`

const shaders = {
  splat: `${precision} ${samplerPrecision}
    uniform sampler2D uTarget; uniform float aspectRatio,radius; uniform vec3 color; uniform vec2 point; varying vec2 vUv;
    void main(){ vec2 p=vUv-point; p.x*=aspectRatio; gl_FragColor=vec4(texture2D(uTarget,vUv).xyz+exp(-dot(p,p)/radius)*color,1.); }`,
  advection: `${precision} ${samplerPrecision}
    uniform sampler2D uVelocity,uSource; uniform vec2 texelSize; uniform float dt,dissipation; varying vec2 vUv;
    void main(){ gl_FragColor=vec4(dissipation*texture2D(uSource,vUv-dt*texture2D(uVelocity,vUv).xy*texelSize).rgb,1.); }`,
  divergence: `${precision} ${samplerPrecision}
    uniform sampler2D uVelocity; uniform vec2 texelSize; varying vec2 vUv;
    vec2 vel(vec2 uv){ vec2 e=vec2(1.); if(uv.x<0.){uv.x=0.;e.x=-1.;} if(uv.x>1.){uv.x=1.;e.x=-1.;} if(uv.y<0.){uv.y=0.;e.y=-1.;} if(uv.y>1.){uv.y=1.;e.y=-1.;} return e*texture2D(uVelocity,uv).xy; }
    void main(){ vec2 L=vUv-vec2(texelSize.x,0.),R=vUv+vec2(texelSize.x,0.),T=vUv+vec2(0.,texelSize.y),B=vUv-vec2(0.,texelSize.y); gl_FragColor=vec4(.5*(vel(R).x-vel(L).x+vel(T).y-vel(B).y),0.,0.,1.); }`,
  curl: `${precision} ${samplerPrecision}
    uniform sampler2D uVelocity; uniform vec2 texelSize; varying vec2 vUv;
    void main(){ vec2 L=vUv-vec2(texelSize.x,0.),R=vUv+vec2(texelSize.x,0.),T=vUv+vec2(0.,texelSize.y),B=vUv-vec2(0.,texelSize.y); gl_FragColor=vec4(texture2D(uVelocity,R).y-texture2D(uVelocity,L).y-texture2D(uVelocity,T).x+texture2D(uVelocity,B).x,0.,0.,1.); }`,
  vorticity: `${precision} ${samplerPrecision}
    uniform sampler2D uVelocity,uCurl; uniform vec2 texelSize; uniform float curlStrength,dt; varying vec2 vUv;
    void main(){ vec2 L=vUv-vec2(texelSize.x,0.),R=vUv+vec2(texelSize.x,0.),T=vUv+vec2(0.,texelSize.y),B=vUv-vec2(0.,texelSize.y); vec2 f=normalize(vec2(abs(texture2D(uCurl,T).x)-abs(texture2D(uCurl,B).x),abs(texture2D(uCurl,R).x)-abs(texture2D(uCurl,L).x))+.0001)*curlStrength*texture2D(uCurl,vUv).x; gl_FragColor=vec4(texture2D(uVelocity,vUv).xy+f*dt,0.,1.); }`,
  pressure: `${precision} ${samplerPrecision}
    uniform sampler2D uPressure,uDivergence; uniform vec2 texelSize; varying vec2 vUv;
    void main(){ vec2 L=clamp(vUv-vec2(texelSize.x,0.),0.,1.),R=clamp(vUv+vec2(texelSize.x,0.),0.,1.),T=clamp(vUv+vec2(0.,texelSize.y),0.,1.),B=clamp(vUv-vec2(0.,texelSize.y),0.,1.); gl_FragColor=vec4((texture2D(uPressure,L).x+texture2D(uPressure,R).x+texture2D(uPressure,T).x+texture2D(uPressure,B).x-texture2D(uDivergence,vUv).x)*.25,0.,0.,1.); }`,
  gradientSubtract: `${precision} ${samplerPrecision}
    uniform sampler2D uPressure,uVelocity; uniform vec2 texelSize; varying vec2 vUv;
    void main(){ float pL=texture2D(uPressure,clamp(vUv-vec2(texelSize.x,0.),0.,1.)).x,pR=texture2D(uPressure,clamp(vUv+vec2(texelSize.x,0.),0.,1.)).x,pT=texture2D(uPressure,clamp(vUv+vec2(0.,texelSize.y),0.,1.)).x,pB=texture2D(uPressure,clamp(vUv-vec2(0.,texelSize.y),0.,1.)).x; gl_FragColor=vec4(texture2D(uVelocity,vUv).xy-vec2(pR-pL,pT-pB),0.,1.); }`,
  clear: `${precision} ${samplerPrecision}
    uniform sampler2D uTexture; uniform float value; varying vec2 vUv;
    void main(){ gl_FragColor=value*texture2D(uTexture,vUv); }`,
  display: `${precision} ${samplerPrecision}
    uniform sampler2D uTexture,uVideoTexture;
    uniform float threshold,edgeSoftness,uSharedMode,uHeroBoundary,uSharedBottomBoundary,uClipSharedBottom,uTime;
    uniform vec2 uResolution,uHeroResolution,uMediaResolution;
    varying vec2 vUv;

    vec4 containedMedia(sampler2D textureMap, vec2 uv, vec2 viewportResolution){
      float viewportAspect=viewportResolution.x/viewportResolution.y;
      float mediaAspect=uMediaResolution.x/uMediaResolution.y;
      vec2 mediaScale=vec2(
        min(mediaAspect/viewportAspect,1.),
        min(viewportAspect/mediaAspect,1.)
      );
      vec2 sampleUv=(uv-.5)/mediaScale+.5;
      float inside=step(0.,sampleUv.x)*step(sampleUv.x,1.)
        *step(0.,sampleUv.y)*step(sampleUv.y,1.);
      vec4 media=texture2D(textureMap,clamp(sampleUv,0.,1.));

      // Outside the exact 16:9 media plane remains part of the interactive
      // fluid canvas. It reveals black rather than leaving permanent white
      // side frames, while the video itself stays aligned with the SVG title.
      return mix(vec4(0.,0.,0.,1.),media,inside);
    }

    void main(){
      float d=clamp(length(texture2D(uTexture,vUv).rgb),0.,1.);
      float reveal=edgeSoftness>0.?smoothstep(threshold-edgeSoftness*.5,threshold+edgeSoftness*.5,d):step(threshold,d);
      vec4 moving;
      if(uSharedMode>.5){
        float heroRegion=step(uHeroBoundary,vUv.y);
        vec2 heroUv=vec2(vUv.x,(vUv.y-uHeroBoundary)/max(1.-uHeroBoundary,.0001));
        vec4 heroMedia=containedMedia(uVideoTexture,heroUv,uHeroResolution);
        vec4 lowerInk=vec4(0.,0.,0.,1.);
        moving=mix(lowerInk,heroMedia,heroRegion);
      }else{
        moving=containedMedia(uVideoTexture,vUv,uResolution);
      }
      float sharedWave = uSharedBottomBoundary
        + sin(vUv.x * 13.82 + uTime * 0.80) * 0.022
        + sin(vUv.x * 32.04 - uTime * 0.45) * 0.009
        + sin(vUv.x * 69.0 + uTime * 0.30) * 0.004;
      float sharedBoundaryMask=smoothstep(sharedWave-.008,sharedWave+.006,vUv.y);
      float boundaryMask=mix(1.,sharedBoundaryMask,uSharedMode*uClipSharedBottom);
      float alpha=reveal*moving.a*boundaryMask;
      gl_FragColor=vec4(moving.rgb*alpha,alpha);
    }`,
}

type DoubleTarget = {
  read: THREE.WebGLRenderTarget
  write: THREE.WebGLRenderTarget
  swap: () => void
}

class FluidVideoSimulation {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  private material!: Record<string, THREE.ShaderMaterial>
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
  private destroyed = false
  private active = true
  private mouse = { x: 0, y: 0, velocityX: 0, velocityY: 0, moved: false }
  private hasPointerPosition = false
  private videoTexture: THREE.VideoTexture
  private videoElement: HTMLVideoElement
  private host: HTMLElement
  private heroElement: HTMLElement
  private canvasElement: HTMLCanvasElement
  private sharedFrame: boolean
  private clipSharedBottom: boolean
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

  constructor(
    canvasElement: HTMLCanvasElement,
    host: HTMLElement,
    heroElement: HTMLElement,
    videoElement: HTMLVideoElement,
    sharedFrame: boolean,
    clipSharedBottom: boolean,
  ) {
    this.host = host
    this.videoElement = videoElement
    this.heroElement = heroElement
    this.canvasElement = canvasElement
    this.sharedFrame = sharedFrame
    this.clipSharedBottom = clipSharedBottom
    this.videoTexture = new THREE.VideoTexture(videoElement)
    this.videoTexture.colorSpace = THREE.SRGBColorSpace
    this.videoTexture.minFilter = THREE.LinearFilter
    this.videoTexture.magFilter = THREE.LinearFilter
    this.videoTexture.generateMipmaps = false

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.quad)
    this.resize(false)
    this.setupTargets()
    this.material = this.setupMaterials()
    // Populate shared-frame uniforms now that the display material exists.
    this.resize(false)
    this.frame = requestAnimationFrame(this.tick)
  }

  private makeMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
    return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
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
        uVideoTexture: { value: this.videoTexture },
        threshold: number(this.config.threshold),
        edgeSoftness: number(this.config.edgeSoftness),
        uSharedMode: number(this.sharedFrame ? 1 : 0),
        uHeroBoundary: number(0),
        uSharedBottomBoundary: number(0),
        uClipSharedBottom: number(this.clipSharedBottom ? 1 : 0),
        uTime: number(0),
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
        uHeroResolution: { value: new THREE.Vector2(this.width, this.height) },
        uMediaResolution: {
          value: new THREE.Vector2(
            this.videoElement.videoWidth || 854,
            this.videoElement.videoHeight || 480,
          ),
        },
      }),
    }
  }

  private createTarget(width: number, height: number) {
    return new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false })
  }

  private createDoubleTarget(width: number, height: number): DoubleTarget {
    const target: DoubleTarget = {
      read: this.createTarget(width, height),
      write: this.createTarget(width, height),
      swap() { [this.read, this.write] = [this.write, this.read] },
    }
    return target
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
    if (this.sharedFrame && clientY > rect.bottom) {
      this.hasPointerPosition = false
      this.mouse.moved = false
      return
    }
    const x = (clientX - rect.left) * this.dpr
    const y = (clientY - rect.top) * this.dpr
    this.mouse.velocityX = this.hasPointerPosition ? (x - this.mouse.x) * this.config.forceStrength : 0
    this.mouse.velocityY = this.hasPointerPosition ? (y - this.mouse.y) * this.config.forceStrength : 0
    this.mouse.x = x
    this.mouse.y = y
    this.mouse.moved = true
    this.hasPointerPosition = true
  }

  setActive(active: boolean) {
    this.active = active
    if (active) this.lastTime = performance.now()
  }

  resize(rebuildTargets = true) {
    const rect = this.host.getBoundingClientRect()
    const heroRect = this.heroElement.getBoundingClientRect()
    const overscan = this.sharedFrame
      ? Math.max(96, Math.min(160, window.innerHeight * 0.18))
      : 0
    const renderHeight = rect.height + overscan
    this.dpr = Math.min(window.devicePixelRatio || 1, this.sharedFrame ? 1.5 : 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, renderHeight), false)
    this.canvasElement.style.width = `${Math.max(1, rect.width)}px`
    this.canvasElement.style.height = `${Math.max(1, renderHeight)}px`
    this.width = Math.max(1, rect.width * this.dpr)
    this.height = Math.max(1, renderHeight * this.dpr)
    if (this.material?.display) {
      const boundary = this.sharedFrame
        ? Math.max(0, Math.min(1, (renderHeight - heroRect.height) / Math.max(renderHeight, 1)))
        : 0
      this.material.display.uniforms.uResolution.value.set(this.width, this.height)
      this.material.display.uniforms.uHeroResolution.value.set(
        Math.max(1, heroRect.width * this.dpr),
        Math.max(1, heroRect.height * this.dpr),
      )
      this.material.display.uniforms.uHeroBoundary.value = boundary
      this.material.display.uniforms.uSharedBottomBoundary.value = this.sharedFrame
        ? overscan / Math.max(renderHeight, 1)
        : 0
      this.material.display.uniforms.uMediaResolution.value.set(
        this.videoElement.videoWidth || 854,
        this.videoElement.videoHeight || 480,
      )
    }
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
    const material = this.material.splat
    this.set(material, {
      aspectRatio: this.width / this.height,
      point: new THREE.Vector2(this.mouse.x / this.width, 1 - this.mouse.y / this.height),
      radius: this.config.splatRadius / 100,
    })
    this.set(material, { uTarget: this.velocity.read.texture, color: new THREE.Vector3(this.mouse.velocityX, -this.mouse.velocityY, 0) })
    this.pass(material, this.velocity.write)
    this.velocity.swap()
    this.set(material, { uTarget: this.dye.read.texture, color: new THREE.Vector3(3, 3, 3) })
    this.pass(material, this.dye.write)
    this.dye.swap()
  }

  private simulate(dt: number) {
    const material = this.material
    const texel = new THREE.Vector2(1 / this.simSize.w, 1 / this.simSize.h)
    this.pass(this.set(material.curl, { uVelocity: this.velocity.read.texture, texelSize: texel }), this.curlTarget)
    this.pass(this.set(material.vorticity, { uVelocity: this.velocity.read.texture, uCurl: this.curlTarget.texture, texelSize: texel, curlStrength: this.config.curl, dt }), this.velocity.write)
    this.velocity.swap()
    this.pass(this.set(material.divergence, { uVelocity: this.velocity.read.texture, texelSize: texel }), this.divergence)
    this.pass(this.set(material.clear, { uTexture: this.pressure.read.texture, value: this.config.pressureDecay }), this.pressure.write)
    this.pressure.swap()
    this.set(material.pressure, { uDivergence: this.divergence.texture, texelSize: texel })
    for (let index = 0; index < this.config.pressureIterations; index += 1) {
      material.pressure.uniforms.uPressure.value = this.pressure.read.texture
      this.pass(material.pressure, this.pressure.write)
      this.pressure.swap()
    }
    this.pass(this.set(material.gradientSubtract, { uPressure: this.pressure.read.texture, uVelocity: this.velocity.read.texture, texelSize: texel }), this.velocity.write)
    this.velocity.swap()
    this.set(material.advection, { uVelocity: this.velocity.read.texture, uSource: this.velocity.read.texture, texelSize: texel, dt, dissipation: this.config.velocityDissipation })
    this.pass(material.advection, this.velocity.write)
    this.velocity.swap()
    this.set(material.advection, { uSource: this.dye.read.texture, texelSize: new THREE.Vector2(1 / this.dyeSize.w, 1 / this.dyeSize.h), dissipation: this.config.dyeDissipation })
    this.pass(material.advection, this.dye.write)
    this.dye.swap()
  }

  private render(time: number) {
    this.pass(this.set(this.material.display, {
      uTexture: this.dye.read.texture,
      uTime: time * 0.001,
    }), null)
  }

  private tick = (time: number) => {
    if (this.destroyed) return
    this.frame = requestAnimationFrame(this.tick)
    if (!this.active) return
    if (this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.videoTexture.needsUpdate = true
    }
    const dt = Math.min((time - this.lastTime) / 1000, 0.016)
    this.lastTime = time
    if (this.mouse.moved) {
      this.splat()
      this.mouse.moved = false
    }
    this.simulate(dt)
    this.render(time)
  }

  private disposeTarget(target: THREE.WebGLRenderTarget | DoubleTarget) {
    if ('read' in target) {
      target.read.dispose()
      target.write.dispose()
    } else target.dispose()
  }

  private disposeTargets() {
    this.disposeTarget(this.velocity)
    this.disposeTarget(this.dye)
    this.disposeTarget(this.divergence)
    this.disposeTarget(this.curlTarget)
    this.disposeTarget(this.pressure)
  }

  dispose() {
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    this.disposeTargets()
    Object.values(this.material).forEach(material => material.dispose())
    this.videoTexture.dispose()
    ;(this.quad.geometry as THREE.BufferGeometry).dispose()
    this.scene.clear()
    this.renderer.dispose()
  }
}

let simulation: FluidVideoSimulation | null = null
let observer: IntersectionObserver | null = null

function handlePointerMove(event: PointerEvent) {
  simulation?.move(event.clientX, event.clientY)
}

function handleResize() {
  simulation?.resize()
}

function ensureVideoPlayback() {
  const element = video.value
  if (!element || !element.paused) return
  element.muted = true
  element.play().catch(() => undefined)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') ensureVideoPlayback()
}

onMounted(async () => {
  if (!canvas.value || !video.value || !hero.value) return
  const host = props.sharedFrame ? hero.value.parentElement : hero.value
  if (!host) return
  simulation = new FluidVideoSimulation(
    canvas.value,
    host,
    hero.value,
    video.value,
    props.sharedFrame,
    props.clipSharedBottom,
  )
  host.addEventListener('pointermove', handlePointerMove, { passive: true })
  host.addEventListener('pointerdown', ensureVideoPlayback, { passive: true })
  host.addEventListener('touchstart', ensureVideoPlayback, { passive: true })
  window.addEventListener('resize', handleResize)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  observer = new IntersectionObserver(entries => simulation?.setActive(entries[0]?.isIntersecting ?? false), { threshold: 0.02 })
  observer.observe(host)
  ensureVideoPlayback()
})

onUnmounted(() => {
  const host = props.sharedFrame ? hero.value?.parentElement : hero.value
  host?.removeEventListener('pointermove', handlePointerMove)
  host?.removeEventListener('pointerdown', ensureVideoPlayback)
  host?.removeEventListener('touchstart', ensureVideoPlayback)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  observer?.disconnect()
  observer = null
  video.value?.pause()
  simulation?.dispose()
  simulation = null
})
</script>

<style scoped>
.fluid-video-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #fff;
  touch-action: pan-y;
}

.fluid-video-hero.is-shared-frame {
  overflow: visible;
}

.fluid-video-front {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: #fff;
}

.fluid-video-media {
  container-type: size;
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(100vw, calc(100svh * 1.7791667));
  height: min(100svh, calc(100vw / 1.7791667));
  transform: translate(-50%, -50%);
}

.fluid-video-title {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: #000;
  font-family: 'Arial Black', Arial, sans-serif;
  font-size: 180px;
  font-weight: 900;
}

.fluid-video-source {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.fluid-video-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 2;
  cursor: crosshair;
}

.fluid-hero-controls {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  font-size: clamp(0.62rem, 0.72vw, 0.76rem);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.fluid-corner {
  position: absolute;
  z-index: 1;
  margin: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
}

a.fluid-corner,
button.fluid-corner {
  pointer-events: auto;
  cursor: pointer;
}

button.fluid-corner {
  border: 0;
  background: transparent;
}

a.fluid-corner::after,
button.fluid-corner::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -4px;
  left: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 180ms ease;
}

a.fluid-corner:hover::after,
a.fluid-corner:focus-visible::after,
button.fluid-corner:hover::after,
button.fluid-corner:focus-visible::after {
  transform: scaleX(1);
  transform-origin: left;
}

.fluid-corner--top-left {
  top: max(18px, env(safe-area-inset-top));
  left: max(18px, env(safe-area-inset-left));
}

.fluid-corner--top-right {
  top: max(18px, env(safe-area-inset-top));
  right: max(18px, env(safe-area-inset-right));
}

.fluid-corner--bottom-left {
  bottom: max(18px, env(safe-area-inset-bottom));
  left: max(18px, env(safe-area-inset-left));
}

.fluid-corner--bottom-right {
  right: max(18px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
}

@media (max-width: 700px) {
  .fluid-hero-controls {
    font-size: 0.58rem;
    letter-spacing: 0.055em;
  }

  .fluid-corner--top-left,
  .fluid-corner--top-right {
    top: max(76px, calc(env(safe-area-inset-top) + 62px));
  }

  .fluid-corner--bottom-left {
    max-width: 44vw;
    white-space: normal;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
