import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useSelectionStore } from '@/stores/selection'
import { availableMaterials } from '@/config/materials'
import { watch } from 'vue'

const SNAP_INCREMENT = 0.2
const SNAP_DISTANCE = 0.2

export default class Experience {
  private canvas: HTMLDivElement
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private controls!: OrbitControls
  private raycaster!: THREE.Raycaster

  private textureLoader!: THREE.TextureLoader
  private textureCache: Map<string, THREE.Texture> = new Map()
  
  private loadedModelTemplate: THREE.Group | null = null
  private placedObjects: THREE.Group[] = []
  private intersectableObjects: THREE.Object3D[] = []
  
  private mouse = new THREE.Vector2()
  private draggedObject: THREE.Group | null = null
  private selectionBoxHelper!: THREE.BoxHelper
  
  private highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfcba03, name: 'HighlightMaterial' });
  
  private selectionStore = useSelectionStore()

  constructor(canvas: HTMLDivElement) {
    this.canvas = canvas
    
    this.initScene()
    this.loadModels()
    this.setupStoreWatchers()
    this.addEventListeners()
    this.animate()
  }

  public destroy() {
    this.removeEventListeners()
  }

  private initScene() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.renderer = new THREE.WebGLRenderer({ antialias: true }) // Canvas-t már nem itt adjuk át
    this.raycaster = new THREE.Raycaster()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)

    this.textureLoader = new THREE.TextureLoader()

    const backgroundColor = new THREE.Color(0x252525)
    this.scene.background = backgroundColor
    this.camera.position.set(0, 2, 3)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.canvas.appendChild(this.renderer.domElement) // A canvas-t itt adjuk hozzá
    this.controls.enableDamping = true

    const floorColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: floorColor, side: THREE.DoubleSide })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    this.intersectableObjects.push(floor)

    const gridMainColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
    const gridCenterColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)
    const gridHelper = new THREE.GridHelper(20, 20, gridCenterColor, gridMainColor)
    this.scene.add(gridHelper)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    this.scene.add(directionalLight)

    this.selectionBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffff00);
    this.selectionBoxHelper.visible = false;
    this.scene.add(this.selectionBoxHelper);
  }

  private loadModels() {
    const loader = new GLTFLoader()
    loader.load('/models/szekreny_alap.glb', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name.toLowerCase().includes('ajto')) {
              child.material = this.highlightMaterial;
            }
          }
        });
        this.loadedModelTemplate = model;
      }
    )
  }

  private setupStoreWatchers() {
    watch(() => this.selectionStore.objectToDeleteUUID, (uuidToRemove) => {
      if (!this.scene || !uuidToRemove) { return; }
      const objectToRemove = this.placedObjects.find(obj => obj.uuid === uuidToRemove)
      if (objectToRemove) {
        this.scene.remove(objectToRemove)
        const index = this.placedObjects.findIndex(obj => obj.uuid === uuidToRemove)
        if (index > -1) {
          this.placedObjects.splice(index, 1)
        }
        this.selectionBoxHelper.visible = false
        if (this.placedObjects.length === 0) {
          this.controls.target.set(0, 0, 0)
        }
      }
      this.selectionStore.acknowledgeDeletion()
    })

    // Anyagváltó watcher (most már itt a helye)
    watch(() => this.selectionStore.materialChangeRequest, (request) => {
      if (!this.scene || !request) { return; }
      const targetObject = this.placedObjects.find(obj => obj.uuid === request.targetUUID)
      if (!targetObject) { this.selectionStore.acknowledgeMaterialChange(); return }
      const materialConfig = availableMaterials.find(mat => mat.id === request.materialId)
      if (!materialConfig) { this.selectionStore.acknowledgeMaterialChange(); return }

      targetObject.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(request.meshName)) {
          const material = child.material as THREE.MeshStandardMaterial
          
          material.color.set(materialConfig.color)
          material.roughness = materialConfig.roughness ?? 1.0
          material.metalness = materialConfig.metalness ?? 0.0

          if (materialConfig.textureUrl) {
            const url = materialConfig.textureUrl;
            if (this.textureCache.has(url)) {
              material.map = this.textureCache.get(url)!
            } else {
              this.textureLoader.load(url, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                material.map = texture
                material.needsUpdate = true
                this.textureCache.set(url, texture)
              })
            }
          } else {
            material.map = null
          }
          material.needsUpdate = true
        }
      })
      this.selectionStore.acknowledgeMaterialChange()
    })
  }

  private onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    if (event.shiftKey) {
      const intersects = this.raycaster.intersectObjects(this.intersectableObjects)
      if (intersects.length > 0) {
        const newObject = this.createDraggableObject(intersects[0]!.point)
        if (newObject) {
          this.draggedObject = newObject
          this.scene.add(this.draggedObject)
          this.controls.enabled = false
          window.addEventListener('mousemove', this.onMouseMove)
          window.addEventListener('mouseup', this.onMouseUp)
          window.addEventListener('contextmenu', this.onRightClickCancel)
        }
      }
    } else {
      const intersects = this.raycaster.intersectObjects(this.placedObjects, true);
      if (intersects.length > 0) {
        let objectToSelect = intersects[0]!.object;
        while (objectToSelect.parent && objectToSelect.parent !== this.scene) {
          objectToSelect = objectToSelect.parent;
        }
        if (objectToSelect instanceof THREE.Group) {
          this.selectionStore.selectObject(objectToSelect);
          this.selectionBoxHelper.setFromObject(objectToSelect);
          this.selectionBoxHelper.visible = true;
        }
      } else {
        this.selectionStore.clearSelection();
        this.selectionBoxHelper.visible = false;
      }
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.draggedObject) return
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(this.intersectableObjects)
    if (intersects.length > 0) {
      const point = intersects[0]!.point;
      const draggedBox = new THREE.Box3().setFromObject(this.draggedObject);
      const draggedSize = new THREE.Vector3();
      draggedBox.getSize(draggedSize);
      let snappedX = this.snapToGrid(point.x + draggedSize.x / 2) - draggedSize.x / 2;
      let snappedZ = this.snapToGrid(point.z);
      for (const targetObject of this.placedObjects) {
        const targetBox = new THREE.Box3().setFromObject(targetObject);
        const targetSize = new THREE.Vector3();
        targetBox.getSize(targetSize);
        const targetPos = targetObject.position;
        const distZ = Math.abs(point.z - targetPos.z) - (draggedSize.z / 2 + targetSize.z / 2);
        if (distZ < SNAP_DISTANCE) {
          if (point.z > targetPos.z) {
            snappedZ = targetPos.z + targetSize.z / 2 + draggedSize.z / 2;
          } else {
            snappedZ = targetPos.z - targetSize.z / 2 - draggedSize.z / 2;
          }
          snappedX = targetPos.x;
        }
      }
      this.draggedObject.position.set(snappedX, 0, snappedZ);
    }
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (this.draggedObject) {
      this.draggedObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      });
      this.placedObjects.push(this.draggedObject);
      this.controls.target.copy(this.draggedObject.position);
    }
    this.endDrag()
  }

  private onRightClickCancel = (event: MouseEvent) => {
    event.preventDefault()
    if (this.draggedObject) {
      this.scene.remove(this.draggedObject)
    }
    this.endDrag()
  }

  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private endDrag = () => {
    this.controls.enabled = true
    this.draggedObject = null
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('contextmenu', this.onRightClickCancel)
  }

  private addEventListeners() {
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('resize', this.onWindowResize)
  }

  private removeEventListeners() {
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('resize', this.onWindowResize)
    this.endDrag()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private createDraggableObject(point: THREE.Vector3): THREE.Group | null {
    if (!this.loadedModelTemplate) { return null }
    const newObject = this.loadedModelTemplate.clone()
    newObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.3;
      }
    });
    newObject.rotation.y = -Math.PI / 2;
    newObject.position.copy(point)
    newObject.position.y = 0
    return newObject
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }
}