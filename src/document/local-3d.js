import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/* ========================================================================== *
 * Local3DManager
 *
 * Local 3D has two deliberately separate surfaces:
 *
 * 1. renderCanvas — permanently detached from the DOM and sampled by the
 *    document rasteriser, so every visible 3D pixel goes through FRAG_CRT;
 * 2. inputProxy — a transparent DOM element used only by OrbitControls while
 *    the model block is interactive.
 *
 * Never move renderCanvas into the document. Doing so makes the same canvas a
 * renderer source and a DOM interaction surface at once, which can produce
 * unstable compositing/feedback while the document scrolls.
 * ========================================================================== */

class Local3DScene {
  constructor(block, onDirty) {
    this.block = block
    this.onDirty = onDirty
    this.canvas = document.createElement('canvas')
    this.canvas.width = 640
    this.canvas.height = 420
    this.canvas.className = 'document-model3d-render-source'
    this.inputProxy = null
    this.ready = false
    this.failed = false
    this.interacting = false
    this.lastTime = performance.now()
    this.initialCameraPosition = new THREE.Vector3(2.4, 1.7, 3.2)
    this.initialTarget = new THREE.Vector3(0, 0, 0)

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
    this.renderer.toneMappingExposure = Number(block.exposure) || 1.08
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(34, this.canvas.width / this.canvas.height, 0.01, 100)
    this.camera.position.copy(this.initialCameraPosition)

    this.detachedInput = document.createElement('div')
    this.controls = new OrbitControls(this.camera, this.detachedInput)
    this.controls.disconnect()
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.enablePan = false
    this.controls.enableZoom = false
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 9
    this.controls.addEventListener('start', () => {
      this.interacting = true
    })
    this.controls.addEventListener('end', () => {
      this.interacting = false
      this.lastTime = performance.now()
      this.render()
      this.onDirty()
    })
    this.controls.addEventListener('change', () => {
      if (!this.inputProxy) return
      this.render()
      this.onDirty()
    })

    const hemi = new THREE.HemisphereLight(0xd8fff0, 0x07130c, 1.45)
    this.scene.add(hemi)

    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.65)
    this.keyLight.position.set(3, 5, 4)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1024, 1024)
    this.keyLight.shadow.bias = -0.0005
    this.scene.add(this.keyLight)

    const fill = new THREE.DirectionalLight(0x8ebdff, 0.78)
    fill.position.set(-3, 1.5, 3)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0x48ff9a, 1.35)
    rim.position.set(-4, 2.5, -3)
    this.scene.add(rim)

    this.root = new THREE.Group()
    this.scene.add(this.root)

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 }),
    )
    this.shadow.rotation.x = -Math.PI * 0.5
    this.shadow.receiveShadow = true
    this.shadow.visible = false
    this.scene.add(this.shadow)

    this.loader = new GLTFLoader()
    this._loadModel(block.src)
  }

  _loadModel(src) {
    const value = String(src || '')
    const isManifest = value.startsWith('data:application/json') || /\.model\.json(?:$|[?#])/i.test(value)

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

  _createManifestMaterial(part) {
    const opacity = Number.isFinite(Number(part.opacity)) ? Number(part.opacity) : 1
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color || '#808080'),
      metalness: Number(part.metalness) || 0,
      roughness: Number.isFinite(Number(part.roughness)) ? Number(part.roughness) : 0.65,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 0.98,
      side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    })
  }

  _applyManifestTransform(mesh, part) {
    mesh.name = String(part.name || '')
    if (!Array.isArray(part.matrix) || part.matrix.length !== 16) return
    mesh.matrix.fromArray(part.matrix.map(Number))
    mesh.matrixAutoUpdate = false
  }

  _acceptManifest(data) {
    if (!Array.isArray(data?.parts) || !['jg1500-model-1', 'jg1500-model-2'].includes(data.format)) {
      this._fail(new Error('Unsupported local 3D manifest'))
      return
    }

    const model = new THREE.Group()
    for (const part of data.parts) {
      let geometry = null

      if (data.format === 'jg1500-model-2') {
        if (!Array.isArray(part.vertices) || part.vertices.length < 9 || !Array.isArray(part.indices)) continue
        geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices.map(Number), 3))
        geometry.setIndex(part.indices.map(Number))
        geometry.computeVertexNormals()
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
      } else {
        if (!Array.isArray(part.size) || part.size.length !== 3) continue
        geometry = new THREE.BoxGeometry(
          Math.max(Number(part.size[0]) || 0.01, 0.001),
          Math.max(Number(part.size[1]) || 0.01, 0.001),
          Math.max(Number(part.size[2]) || 0.01, 0.001),
        )
      }

      const mesh = new THREE.Mesh(geometry, this._createManifestMaterial(part))
      this._applyManifestTransform(mesh, part)
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
    const distance = safeRadius / Math.sin(limitingFov * 0.5) * 1.10

    const direction = new THREE.Vector3(0.92, 0.42, 1.55).normalize()
    this.camera.position.copy(direction.multiplyScalar(distance))
    this.camera.near = Math.max(0.001, distance / 100)
    this.camera.far = Math.max(distance * 12, safeRadius * 20)
    this.camera.updateProjectionMatrix()

    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = Math.max(safeRadius * 1.08, distance * 0.36)
    this.controls.maxDistance = distance * 3.2
    this.controls.update()

    this.initialCameraPosition.copy(this.camera.position)
    this.initialTarget.copy(this.controls.target)
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

    const spin = Number(this.block.autospin ?? 0.10)
    if (!this.interacting && spin) this.root.rotation.y += spin * dt
    if (this.inputProxy) this.controls.update()

    if (!this.interacting && spin) {
      this.render()
      this.onDirty()
      return true
    }
    return false
  }

  render() {
    if (!this.renderer || !this.ready && this.failed) return
    try {
      this.renderer.render(this.scene, this.camera)
    } catch (error) {
      console.warn('Local 3D render failed', error)
    }
  }

  resetCamera() {
    if (!this.ready) return
    this.camera.position.copy(this.initialCameraPosition)
    this.controls.target.copy(this.initialTarget)
    this.controls.update()
    this.render()
    this.onDirty()
  }

  _zoomBy(deltaY) {
    if (!this.ready) return
    const target = this.controls.target
    const offset = this.camera.position.clone().sub(target)
    const distance = offset.length()
    const factor = Math.exp(Number(deltaY || 0) * 0.0015)
    const nextDistance = THREE.MathUtils.clamp(distance * factor, this.controls.minDistance, this.controls.maxDistance)
    offset.setLength(nextDistance)
    this.camera.position.copy(target).add(offset)
    this.camera.updateMatrixWorld()
    this.render()
    this.onDirty()
  }

  mountInput(host, context = {}) {
    this.unmountInput(false)

    const proxy = document.createElement('div')
    proxy.className = 'document-model3d-input-proxy'
    proxy.tabIndex = 0
    proxy.setAttribute('role', 'application')
    proxy.setAttribute('aria-label', this.block.label || this.block.title || 'Interactive 3D model')

    // Normal wheel input always scrolls the surrounding document. Holding Ctrl
    // explicitly opts into model zoom, so zoom remains available without ever
    // trapping ordinary page navigation.
    proxy.addEventListener('wheel', event => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.ctrlKey) {
        this._zoomBy(event.deltaY)
        return
      }
      const reader = context?.rasteriser?.reader
      if (reader) reader.scrollTop += event.deltaY
    }, { passive: false, capture: true })

    proxy.addEventListener('dblclick', event => {
      event.preventDefault()
      event.stopPropagation()
      this.resetCamera()
    })

    host.append(proxy)
    this.inputProxy = proxy
    this.controls.connect(proxy)
    this.controls.enabled = true
    this.render()
  }

  unmountInput(markDirty = false) {
    // Teardown must be side-effect free with respect to the document renderer.
    // In particular, never render or dirty the document from cleanup: doing so
    // can synchronously re-enter integration synchronization while this same
    // instance is being removed.
    const proxy = this.inputProxy
    this.inputProxy = null
    if (proxy) {
      this.controls.disconnect()
      this.controls.enabled = false
      proxy.remove()
    }
    this.interacting = false
    this.lastTime = performance.now()
    if (markDirty) this.onDirty()
  }

  dispose() {
    this.unmountInput(false)
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

  mount(block, host, context) {
    const scene = this.ensure(block)
    if (!scene) return null
    scene.mountInput(host, context)
    let cleaned = false
    return () => {
      if (cleaned) return
      cleaned = true
      scene.unmountInput(false)
    }
  }

  dispose() {
    for (const scene of this.scenes.values()) scene.dispose()
    this.scenes.clear()
  }
}
