import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Group,
  Box3,
  Vector3,
  Raycaster,
  Vector2,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  Material,
  WireframeGeometry,
  LineSegments,
  LineBasicMaterial,
  SphereGeometry,
} from 'three'
import { OrbitControls } from 'three-stdlib'
import AssetManager from './Managers/AssetManager'
import type { FurnitureConfig } from '@/config/furniture'

export default class AdminExperience extends EventTarget {
  public container: HTMLDivElement
  public scene: Scene
  public camera: PerspectiveCamera
  public renderer: WebGLRenderer
  public controls: OrbitControls
  private assetManager: AssetManager
  private currentObject: Group | null = null
  private animationFrameId: number = 0
  private raycaster: Raycaster
  private mouse: Vector2
  private highlightMaterial: MeshStandardMaterial
  private highlightedObject: Mesh | null = null
  private originalMaterial: Material | null = null
  private currentObjectId: string | null = null

  private hoverMaterial: MeshStandardMaterial
  private hoveredObject: Mesh | null = null
  private originalHoverMaterial: Material | null = null

  constructor(container: HTMLDivElement) {
    super()
    this.container = container
    this.scene = new Scene()

    const sizes = { width: container.clientWidth, height: container.clientHeight }

    this.camera = new PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 1000)
    this.camera.position.set(1.1, 0.8, 0.5)

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setSize(sizes.width, sizes.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0.35, 0)

    const ambientLight = new AmbientLight(0xffffff, 0.8)
    this.scene.add(ambientLight)

    const directionalLight = new DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 5, 5)
    this.scene.add(directionalLight)

    this.assetManager = AssetManager.getInstance()
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()

    this.renderer.domElement.addEventListener('click', this.onClick)
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove)

    this.highlightMaterial = new MeshStandardMaterial({ color: 0x00aaff, emissive: 0x33bbff })
    this.hoverMaterial = new MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0x442200,
      transparent: true,
      opacity: 0.8,
    })

    this.animate()
  }

  resize() {
    if (!this.camera || !this.renderer || !this.container) return

    const width = this.container.clientWidth
    const height = this.container.clientHeight

    if (width === 0 || height === 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public async updateObject(config: FurnitureConfig, resetCamera: boolean) {
    if (this.currentObject) {
      this.scene.remove(this.currentObject)
    }
    this.clearHighlight()
    this.clearHover()

    const componentState: Record<string, string> = {}
    if (config.componentSlots) {
      config.componentSlots.forEach((slot) => {
        if (slot.defaultComponent) componentState[slot.slotId] = slot.defaultComponent
      })
    }

    const newObject = await this.assetManager.buildFurnitureFromConfig(config, componentState)
    if (!newObject) return

    newObject.traverse((child) => {
      if (child instanceof Mesh) {
        const wireframeGeo = new WireframeGeometry(child.geometry)
        const wireframeMat = new LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.4,
        })
        const wireframe = new LineSegments(wireframeGeo, wireframeMat)
        wireframe.raycast = () => {} // Ignore wireframe in raycasting
        child.add(wireframe)
      }
    })

    this.currentObject = newObject
    this.scene.add(this.currentObject)

    if (resetCamera) {
      console.log('%c[Experience] Új bútor, kamera reset.', 'color: cyan')
      this.frameObject(this.currentObject)
    } else {
      console.log('%c[Experience] Meglévő bútor frissítve, kamera pozíció megmarad.', 'color: cyan')
    }

    this.currentObjectId = config.id
  }

  private frameObject(object: Group) {
    const box = new Box3().setFromObject(object)
    if (box.isEmpty()) return

    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())

    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = this.camera.fov * (Math.PI / 180)
    const distance = Math.abs(maxDim / Math.tan(fov / 2)) * 0.8

    const direction = new Vector3(1.3, 0.8, 0.6).normalize()
    const newPosition = new Vector3().copy(center).add(direction.multiplyScalar(distance))

    this.camera.position.copy(newPosition)
    this.controls.target.copy(center)
    this.controls.update()
  }

  private clearHighlight() {
    if (this.highlightedObject && this.originalMaterial) {
      this.highlightedObject.material = this.originalMaterial
    }
    this.highlightedObject = null
    this.originalMaterial = null
  }

  private clearHover() {
    if (this.hoveredObject && this.originalHoverMaterial) {
      if (this.hoveredObject !== this.highlightedObject) {
        this.hoveredObject.material = this.originalHoverMaterial
      }
    }
    this.hoveredObject = null
    this.originalHoverMaterial = null
  }

  // --- GRAPHICAL SELECTOR LOGIC ---
  private markersGroup: Group | null = null
  private markersVisible: boolean = false

  public toggleAttachmentMarkers(visible: boolean, activePoints: string[] = []) {
    this.markersVisible = visible

    if (this.markersGroup) {
      this.scene.remove(this.markersGroup)
      this.markersGroup = null
    }

    if (!visible || !this.currentObject) return

    this.markersGroup = new Group()
    this.markersGroup.name = 'attachment_markers'

    const corpusSlot = this.currentObject.children.find((c) => c.name.includes('corpus'))
    if (!corpusSlot) return

    const attachmentPoints: Object3D[] = []
    corpusSlot.traverse((child) => {
      if (child.name.startsWith('attach_')) {
        attachmentPoints.push(child)
      }
    })

    const sphereGeo = new SphereGeometry(0.03, 16, 16)
    const activeMat = new MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400 })
    const inactiveMat = new MeshStandardMaterial({ color: 0xff0000, emissive: 0x440000 })

    attachmentPoints.forEach((point) => {
      const isActive = activePoints.includes(point.name)
      const marker = new Mesh(sphereGeo, isActive ? activeMat : inactiveMat)

      const worldPos = new Vector3()
      point.getWorldPosition(worldPos)
      marker.position.copy(worldPos)

      marker.userData = { isMarker: true, pointId: point.name, isActive }
      this.markersGroup!.add(marker)
    })

    this.scene.add(this.markersGroup)
  }

  private getIntersects(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)

    if (!this.currentObject) return []

    return this.raycaster
      .intersectObject(this.currentObject, true)
      .filter((hit) => !(hit.object instanceof LineSegments))
  }

  private findSlotObject(object: Object3D): Object3D | null {
    if (!this.currentObject || !this.currentObject.userData.config) return null

    const config = this.currentObject.userData.config as FurnitureConfig
    if (!config.componentSlots) return null

    const validSlotIds = new Set(config.componentSlots.filter(Boolean).map((slot) => slot.slotId))

    let currentParent: Object3D | null = object
    while (currentParent) {
      if (validSlotIds.has(currentParent.name)) {
        return currentParent
      }
      currentParent = currentParent.parent
    }
    return null
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.markersVisible) return

    const intersects = this.getIntersects(event)

    if (intersects.length > 0) {
      const hitObject = intersects[0]!.object
      const slotObject = this.findSlotObject(hitObject)

      if (slotObject && hitObject instanceof Mesh) {
        if (this.hoveredObject !== hitObject) {
          this.clearHover()

          if (hitObject !== this.highlightedObject) {
            this.hoveredObject = hitObject
            this.originalHoverMaterial = hitObject.material as Material
            hitObject.material = this.hoverMaterial
          }
        }
        return
      }
    }

    this.clearHover()
  }

  private onClick = (event: MouseEvent) => {
    if (this.markersVisible && this.markersGroup) {
      const rect = this.renderer.domElement.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)

      const markerIntersects = this.raycaster.intersectObjects(this.markersGroup.children, false)
      if (markerIntersects.length > 0) {
        const marker = markerIntersects[0]!.object
        if (marker.userData.isMarker) {
          this.dispatchEvent(
            new CustomEvent('attachmentClicked', { detail: { pointId: marker.userData.pointId } }),
          )
          return
        }
      }
      // HA a markerek látszanak, akkor SEMMI MÁST nem engedünk kattintani!
      return
    }

    const intersects = this.getIntersects(event)
    if (intersects.length === 0) return

    const hitObject = intersects[0]!.object
    const slotObject = this.findSlotObject(hitObject)

    if (slotObject) {
      console.log('Clicked slot:', slotObject.name)
      this.dispatchEvent(new CustomEvent('slotClicked', { detail: { slotId: slotObject.name } }))

      this.clearHighlight()
      this.clearHover()

      if (hitObject instanceof Mesh) {
        this.highlightedObject = hitObject
        this.originalMaterial = this.originalHoverMaterial || (hitObject.material as Material)

        if (this.originalMaterial === this.hoverMaterial) {
          // Fallback if something went wrong with material state
          this.originalMaterial = hitObject.material as Material
        }

        hitObject.material = this.highlightMaterial
      }
    }
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  public clearCanvas() {
    if (this.currentObject) {
      this.scene.remove(this.currentObject)
      this.currentObject = null
    }
    if (this.markersGroup) {
      this.scene.remove(this.markersGroup)
      this.markersGroup = null
    }
    this.clearHighlight()
    this.currentObjectId = null
  }

  public destroy() {
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove)
    cancelAnimationFrame(this.animationFrameId)
    this.renderer.dispose()
    this.controls.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
