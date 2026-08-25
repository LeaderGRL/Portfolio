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
 * The canonical asset path is GLB/glTF. The lightweight `jg1500-model-1` JSON
 * format is also supported for projects that need a tiny local geometry
 * preview while preserving the exact same Three.js -> raster -> CRT contract.
 * It describes primitive parts and transforms; it contains no project logic.
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
    this.renderer.toneMappingExposure = Number(block.exposure) || 1.12
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

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

    const hemi = new THREE.HemisphereLight(0xd8fff0, 0x07130c, 1.65)
    this.scene.add(hemi)

    this.keyLight = new THREE.DirectionalLight(0xffffff, 3.1)
    this.keyLight.position.set(3, 5, 4)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1024, 1024)
    this.keyLight.shadow.bias = -0.0005
    this.scene.add(this.keyLight)

    const fill = new THREE.DirectionalLight(0x8ebdff, 1.0)
    fill.position.set(-3, 1.5, 3)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0x48ff9a, 2.15)
    rim.position.set(-4, 2.5, -3)
    this.scene.add(rim)

    this.root = new THREE.Group()
    this.scene.add(this.root)

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
    )
    this.shadow.rotation.x = -Math.PI * 0.5
    this.shadow.receiveShadow = true
    this.shadow.visible = false
    this.scene.add(this.shadow)

    this.loader = new GLTFLoader()
    this._loadModel(block.src)
  }

  _loadModel(src) {
    const isManifest = String(src || '').startsWith('data:application/json') || /\.model\.json(?:$|[?#])/i.test(String(src || ''))
    if (isManifest) {
      fetch(src)
        .then(response => {
          if (!response.ok) throw new Error(`Local 3D manifest returned ${response.status}`)
          return response.json()
        })
        .then(data => this._acceptManifest(data))
        .catch(error => this._fail(error))
      return
    }

    this.loader.load(
      src,
      gltf => this._accept(gltf.scene),
      undefined,
      error => this._fail(error),
    )
  }

  _fail(error) {
    this.failed = true
    console.warn('Local 3D model failed to load', error)
    this.onDirty()
  }

  _acceptManifest(data) {
    if (data?.format !== 'jg1500-model-1' || !Array.isArray(data.parts)) {
      this._fail(new Error('Unsupported local 3D manifest'))
      return
    }

    const model = new THREE.Group()
    for (const part of data.parts) {
      if (!Array.isArray(part.size) || part.size.length !== 3) continue
      const opacity = Number.isFinite(Number(part.opacity)) ? Number(part.opacity) : 1
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(part.color || '#808080'),
        metalness: Number(part.metalness) || 0,
        roughness: Number.isFinite(Number(part.roughness)) ? Number(part.roughness) : 0.65,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 0.98,
        side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
      })
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(Number(part.size[0]) || 0.01, 0.001),
          Math.max(Number(part.size[1]) || 0.01, 0.001),
          Math.max(Number(part.size[2]) || 0.01, 0.001),
        ),
        material,
      )
      mesh.name = String(part.name || '')
      if (Array.isArray(part.matrix) && part.matrix.length === 16) {
        mesh.matrix.set(...part.matrix.map(Number))
        mesh.matrixAutoUpdate = false
      }
      model.add(mesh)
    }

    if (!model.children.length) {
      this._fail(new Error('Local 3D manifest contains no renderable parts'))
      return
    }
    this._accept(model)
  }

  _fitCamera(radius) {
    const safeRadius = Math.max(radius, 0.001)
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * this.camera.aspect)
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = safeRadius / Math.sin(limitingFov * 0.5) * 1.14

    const direction = new THREE.Vector3(1.18, 0.72, 1.45).normalize()
    this.camera.position.copy(direction.multiplyScalar(distance))
    this.camera.near = Math.max(0.001, distance / 100)
    this.camera.far = Math.max(distance * 12, safeRadius * 20)
    this.camera.updateProjectionMatrix()

    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = Math.max(safeRadius * 1.15, distance * 0.36)
    this.controls.maxDistance = distance * 3.2
    this.controls.update()
  }

  _configureShadows(box, radius) {
    const size = box.getSize(new THREE.Vector3())
    const floorY = -size.y * 0.5 - Math.max(radius * 0.015, 0.001)
    const planeSize = Math.max(radius * 4.5, size.x * 2.2, size.z * 2.2)

    this.shadow.position.set(0, floorY, 0)
    this.shadow.scale.set(planeSize, planeSize, 1)
    this.shadow.visible = this.block.shadow !== 'off'

    const shadowSpan = Math.max(radius * 2.6, 1)
    this.keyLight.shadow.camera.left = -shadowSpan
    this.keyLight.shadow.camera.right = shadowSpan
    this.keyLight.shadow.camera.top = shadowSpan
    this.keyLight.shadow.camera.bottom = -shadowSpan
    this.keyLight.shadow.camera.near = 0.01
    this.keyLight.shadow.camera.far = Math.max(radius * 10, 10)
    this.keyLight.shadow.camera.updateProjectionMatrix()
  }

  _accept(model) {
    this.root.clear()
    this.root.rotation.set(0, Number(this.block.rotationY) || 0, 0)
    this.root.add(model)

    const initialBox = new THREE.Box3().setFromObject(model)
    const center = initialBox.getCenter(new THREE.Vector3())
    model.position.sub(center)

    model.traverse(object => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
    })

    const centeredBox = new THREE.Box3().setFromObject(model)
    const sphere = centeredBox.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.001)

    this._fitCamera(radius)
    this._configureShadows(centeredBox, radius)

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
