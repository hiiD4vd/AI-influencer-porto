<template>
  <div class="home-view">
    <!-- Navigation -->
    <nav class="shared-nav">
      <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'home' }">Home</RouterLink>
      <RouterLink to="/showcase" class="nav-link" :class="{ active: $route.name === 'showcase' }">Showcase</RouterLink>
      <RouterLink to="/vibe" class="nav-link" :class="{ active: $route.name === 'vibe' }">Vibe</RouterLink>
      <RouterLink to="/cabin-test" class="nav-link" :class="{ active: $route.name === 'cabin-test' }">Cabin</RouterLink>
    </nav>

    <div id="home-loading" class="loading-text">Initializing Chamber...</div>
    <canvas ref="canvasRef" id="webgl-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animFrameId = 0
let renderer: THREE.WebGLRenderer | null = null
const eventCleanups: (() => void)[] = []

onMounted(() => {
  initWebGL()
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  renderer?.dispose()
  eventCleanups.forEach(fn => fn())
})

function initWebGL() {
  const canvas = canvasRef.value!
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x050505, 0.00008)

  const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 1, 50000)
  camera.position.set(0, 0, 0)
  camera.rotation.order = 'YXZ'

  // ── STRICT CYLINDER VERTEX SHADER: only X curves, Y stays flat ──
  const vertexShader = `
    varying vec2 vUv;
    uniform float uRadius;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      float theta = worldPos.x / uRadius;
      float newX = sin(theta) * uRadius;
      float newZ = -cos(theta) * uRadius;
      gl_Position = projectionMatrix * viewMatrix * vec4(newX, worldPos.y, newZ, 1.0);
    }
  `

  const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 uHoverColor;
    uniform float uHoverState;
    void main() {
      vec4 texColor = texture2D(uTexture, vUv);
      vec3 bg = mix(vec3(0.03), uHoverColor, uHoverState * 0.85);
      vec3 finalColor = mix(bg, texColor.rgb, texColor.a);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `

  const INNER_PAD = 20

  function createCardTexture(rawW: number, rawH: number, proj: any) {
    const scale = 2
    const cvs = document.createElement('canvas')
    cvs.width = rawW * scale; cvs.height = rawH * scale
    const ctx = cvs.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.clearRect(0, 0, rawW, rawH)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rawW, 0); ctx.lineTo(rawW, rawH)
    ctx.moveTo(0, rawH); ctx.lineTo(rawW, rawH)
    ctx.stroke()
    if (!proj) {
      const tex = new THREE.CanvasTexture(cvs)
      tex.minFilter = THREE.LinearFilter
      return tex
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `500 ${Math.max(9, rawW * 0.022)}px "Inter", monospace`
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'
    ctx.fillText('EXPERIENCE / AI', INNER_PAD, rawH - INNER_PAD + 4)
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${Math.max(10, rawW * 0.028)}px "Syne", sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(proj.brand.toUpperCase(), rawW - INNER_PAD, rawH - INNER_PAD + 4)

    const tex = new THREE.CanvasTexture(cvs)
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter
    const imgAreaH = rawH - (INNER_PAD * 2) - 32
    const imgAreaW = rawW - (INNER_PAD * 2)
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = proj.imgUrl
    img.onload = () => {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(INNER_PAD, INNER_PAD, imgAreaW, imgAreaH, 3)
      ctx.clip()
      const ar = img.width / img.height
      const tar = imgAreaW / imgAreaH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2 }
      else { sh = img.width / tar; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, INNER_PAD, INNER_PAD, imgAreaW, imgAreaH)
      ctx.restore()
      tex.needsUpdate = true
    }
    return tex
  }

  const NICHES = ['Visitor Exp.', 'AI Compass', 'Travel Hacker', 'Tech Review', 'VR Engine', 'Streetwear', 'Global Scale']
  const BRANDS = ['Google', 'Nike', 'Phantom', 'Balenciaga', 'Sony', 'Apple', 'Meta']
  const COLORS = ['#e6c84c', '#4285F4', '#DB4437', '#0F9D58', '#673AB7', '#FF6D00', '#E91E63', '#00BCD4']
  const PROJECTS = Array.from({ length: 20 }, (_, i) => ({
    imgUrl: `https://picsum.photos/seed/${i + 450}/800/800`,
    niche: NICHES[i % NICHES.length],
    brand: BRANDS[i % BRANDS.length],
    color: COLORS[i % COLORS.length],
  }))

  const textureCache: Record<string, THREE.CanvasTexture> = {}
  function getCachedTexture(rawW: number, rawH: number, proj: any) {
    const key = proj ? `p_${rawW}_${rawH}_${proj.imgUrl}` : `e_${rawW}_${rawH}`
    if (!textureCache[key]) textureCache[key] = createCardTexture(rawW, rawH, proj)
    return textureCache[key]
  }

  const BASE_SCALE = 5
  const GAP = BASE_SCALE * 2
  const COL_WIDTHS_RAW  = [450, 550, 350, 600, 450, 500, 400, 550, 350, 450, 600, 400]
  const ROW_HEIGHTS_RAW = [400, 600, 500, 700, 450, 550]

  const totalRawWidth = COL_WIDTHS_RAW.reduce((a, b) => a + b, 0)
  const totalWidth    = totalRawWidth * BASE_SCALE + GAP * COL_WIDTHS_RAW.length
  const RADIUS        = totalWidth / (2 * Math.PI)

  const cardsData: any[] = []
  let projIdx = 0, cursorX = 0

  for (let c = 0; c < COL_WIDTHS_RAW.length; c++) {
    const rawW = COL_WIDTHS_RAW[c]
    const cardW = rawW * BASE_SCALE
    let cursorY = -20000
    for (let r = 0; r < 55; r++) {
      const rawH = ROW_HEIGHTS_RAW[(c * 7 + r) % ROW_HEIGHTS_RAW.length]
      const cardH = rawH * BASE_SCALE
      const hasPrj = ((c + r) % 3 !== 0)
      cardsData.push({
        cx: cursorX + cardW / 2, cy: cursorY + cardH / 2,
        w: cardW, h: cardH, rawW, rawH,
        proj: hasPrj ? PROJECTS[projIdx++ % PROJECTS.length] : null,
      })
      cursorY += cardH + GAP
    }
    cursorX += cardW + GAP
  }

  const offsetX = totalWidth / 2
  cardsData.forEach(d => { d.cx -= offsetX })

  const cylinderGroup = new THREE.Group()
  scene.add(cylinderGroup)
  const meshList: THREE.Mesh[] = []

  cardsData.forEach(card => {
    const tex = getCachedTexture(card.rawW, card.rawH, card.proj)
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uTexture:    { value: tex },
        uRadius:     { value: RADIUS },
        uHoverColor: { value: new THREE.Color(card.proj ? card.proj.color : '#000000') },
        uHoverState: { value: 0.0 },
      },
      transparent: false,
      side: THREE.DoubleSide,
    })
    const geo = new THREE.PlaneGeometry(card.w, card.h, 32, 1)
    const mesh = new THREE.Mesh(geo, material)
    mesh.frustumCulled = false
    mesh.position.set(card.cx, card.cy, 0)
    cylinderGroup.add(mesh)
    meshList.push(mesh)
  })

  const loadingEl = document.getElementById('home-loading')
  if (loadingEl) loadingEl.style.opacity = '0'

  let panX = 0, targetPanX = 0
  let scrollY = 0, targetScrollY = 0
  let isDrag = false, startX = 0, startY = 0

  const SCROLL_SENSITIVITY = 8
  const PAN_SENSITIVITY    = 0.15

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2(-999, -999)

  const onMouseDown = (e: MouseEvent) => { isDrag = true; startX = e.clientX; startY = e.clientY; document.body.style.cursor = 'grabbing' }
  const onMouseMove = (e: MouseEvent) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    if (!isDrag) return
    targetPanX    += (e.clientX - startX) * PAN_SENSITIVITY
    targetScrollY += (e.clientY - startY) * SCROLL_SENSITIVITY
    startX = e.clientX; startY = e.clientY
  }
  const onMouseUp   = () => { isDrag = false; document.body.style.cursor = 'default' }
  const onTouchStart = (e: TouchEvent) => { isDrag = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY }
  const onTouchMove  = (e: TouchEvent) => {
    if (!isDrag) return
    targetPanX    += (e.touches[0].clientX - startX) * PAN_SENSITIVITY
    targetScrollY += (e.touches[0].clientY - startY) * SCROLL_SENSITIVITY
    startX = e.touches[0].clientX; startY = e.touches[0].clientY
  }
  const onTouchEnd  = () => { isDrag = false }
  const onResize    = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer!.setSize(window.innerWidth, window.innerHeight)
  }

  window.addEventListener('mousedown',  onMouseDown)
  window.addEventListener('mousemove',  onMouseMove)
  window.addEventListener('mouseup',    onMouseUp)
  window.addEventListener('touchstart', onTouchStart)
  window.addEventListener('touchmove',  onTouchMove)
  window.addEventListener('touchend',   onTouchEnd)
  window.addEventListener('resize',     onResize)

  eventCleanups.push(
    () => window.removeEventListener('mousedown',  onMouseDown),
    () => window.removeEventListener('mousemove',  onMouseMove),
    () => window.removeEventListener('mouseup',    onMouseUp),
    () => window.removeEventListener('touchstart', onTouchStart),
    () => window.removeEventListener('touchmove',  onTouchMove),
    () => window.removeEventListener('touchend',   onTouchEnd),
    () => window.removeEventListener('resize',     onResize),
  )

  function animate() {
    animFrameId = requestAnimationFrame(animate)
    if (!isDrag) targetPanX += 0.04

    panX    += (targetPanX    - panX)    * 0.08
    scrollY += (targetScrollY - scrollY) * 0.08

    camera.rotation.y = THREE.MathUtils.degToRad(-panX)
    camera.rotation.x = 0
    camera.rotation.z = 0
    cylinderGroup.position.y = scrollY

    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObjects(meshList)
    const hitMesh = hits.length > 0 ? hits[0].object : null
    meshList.forEach(mesh => {
      const m = mesh as THREE.Mesh<any, THREE.ShaderMaterial>
      const target = mesh === hitMesh ? 1.0 : 0.0
      m.material.uniforms.uHoverState.value += (target - m.material.uniforms.uHoverState.value) * 0.12
    })

    renderer!.render(scene, camera)
  }
  animate()
}
</script>

<style scoped>
.home-view {
  position: fixed;
  inset: 0;
  background: #050505;
  overflow: hidden;
}

#webgl-canvas {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  cursor: grab;
}
#webgl-canvas:active { cursor: grabbing; }

.loading-text {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  font-family: 'Syne', sans-serif;
  font-size: 1.5rem;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  pointer-events: none;
  transition: opacity 0.5s;
}
</style>
