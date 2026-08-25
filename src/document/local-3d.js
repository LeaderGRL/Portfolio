import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/* ========================================================================== *
 * Local3DManager
 *
 * A local model owns one reusable Three.js canvas. That canvas is normally
 * off-DOM and sampled by the document rasteriser, which means the model passes
 * through the exact same CRT shader as every other source pixel.
 *
 * During interaction the same canvas is mounted as a nearly transparent input
 * proxy above the CRT. OrbitControls receives pointer/wheel events there while
 * the visible model remains the rasterised CRT result underneath.
 * ========================================================================== */

class Local3DScene {
  constructor(block, onDirty) {
    this.block = block
    this.onDirty = onDirty
    this.canvas = document.createElement('canvas')
    this.canvas.width = 640
    this.canvas.height = 420
    this.canvas.className = 'document-model3d-input'
    this.ready = false
    this.failed = false
    this.interacting = false
    this.lastTime = performance.now()

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(this.canvas.width, this.canvas.height, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = Number(block.exposure) || 1.15
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(34, this.canvas.width / this.canvas.height, 0.01, 100)
    this.camera.position.set(2.4, 1.7, 3.2)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.enablePan = false
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 9
    this.controls.addEventListener('change', () => {
      this.render()
      this.onDirty()
    })

    const hemi = new THREE.HemisphereLight(0xd8fff0, 0x102018, 2.2)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight(0xffffff, 3.3)
    key.position.set(3, 5, 4)
    this.scene.add(key)

    const rim = new THREE.DirectionalLight(0x48ff9a, 2.4)
    rim.position.set(-4, 2, -3)
    this.scene.add(rim)

    this.root = new THREE.Group()
    this.scene.add(this.root)

    this.loader = new GLTFLoader()
    this.loader.load(
      block.src,
      gltf => this._accept(gltf.scene),
      undefined,
      error => {
        this.failed = true
        console.warn('Local 3D model failed to load', error)
        this.onDirty()
      },
    )
  }

  _accept(model) {
    this.root.clear()
    this.root.add(model)

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z, 0.001)

    model.position.sub(center)
    this.controls.target.set(0, Math.max(0, size.y * 0.04), 0)
    this.camera.near = Math.max(0.01, radius / 100)
    this.camera.far = radius * 20
    this.camera.position.set(radius * 1.45, radius * 0.9, radius * 1.75)
    this.camera.updateProjectionMatrix()
    this.controls.minDistance = radius * 0.8
    this.controls.maxDistance = radius * 4.5
    this.controls.update()

    this.ready = true
    this.render()
    this.onDirty()
  }

  tick(time = performance.now()) {
    if (!this.ready) return false
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time

    const spin = Number(this.block.autospin ?? 0.14)
    if (!this.interacting && spin) this.root.rotation.y += spin * dt
    this.controls.update()
    if (!this.interacting && spin) {
      this.render()
      this.onDirty()
      return true
    }
    return false
  }

  render() {
    if (!this.renderer) return
    this.renderer.render(this.scene, this.camera)
  }

  mountInput(host) {
    this.interacting = true
    this.canvas.classList.add('document-model3d-input--mounted')
    host.append(this.canvas)
    this.render()
  }

  unmountInput() {
    this.interacting = false
    this.canvas.classList.remove('document-model3d-input--mounted')
    this.canvas.remove()
    this.render()
    this.onDirty()
  }

  dispose() {
    this.unmountInput()
    this.controls.dispose()
    this.scene.traverse(object => {
      object.geometry?.dispose?.()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const value of Object.values(material)) value?.isTexture && value.dispose?.()
        material.dispose?.()
      }
    })
    this.renderer.dispose()
  }
}

export class Local3DManager {
  constructor(onDirty = () => {}) {
    this.onDirty = onDirty
    this.scenes = new Map()
  }

  key(block) {
    return String(block?.src || block?.uid || block?.id || '')
  }

  ensure(block) {
    const key = this.key(block)
    if (!key) return null
    let scene = this.scenes.get(key)
    if (!scene) {
      scene = new Local3DScene(block, this.onDirty)
      this.scenes.set(key, scene)
    }
    return scene
  }

  getCanvas(block) {
    return this.ensure(block)?.canvas || null
  }

  isReady(block) {
    return Boolean(this.ensure(block)?.ready)
  }

  hasFailed(block) {
    return Boolean(this.ensure(block)?.failed)
  }

  tick(time) {
    for (const scene of this.scenes.values()) scene.tick(time)
  }

  mount(block, host) {
    const scene = this.ensure(block)
    if (!scene) return null
    scene.mountInput(host)
    return () => scene.unmountInput()
  }

  dispose() {
    for (const scene of this.scenes.values()) scene.dispose()
    this.scenes.clear()
  }
}
