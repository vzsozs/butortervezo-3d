import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { availableMaterials } from '@/config/materials'
import { furnitureDatabase, globalMaterials } from '@/config/furniture'
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
  private modelCache: Map<string, THREE.Group> = new Map()
  
  private placedObjects: THREE.Group[] = []
  private intersectableObjects: THREE.Object3D[] = []
  private mouse = new THREE.Vector2()
  private draggedObject: THREE.Group | null = null
  private selectionBoxHelper!: THREE.BoxHelper
  
  private materials: { [key: string]: THREE.MeshStandardMaterial } = {}
  
  private selectionStore = useSelectionStore()
  private settingsStore = useSettingsStore()

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
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.raycaster = new THREE.Raycaster()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.textureLoader = new THREE.TextureLoader()
    this.createAppMaterials()

    const backgroundColor = new THREE.Color(0x252525)
    this.scene.background = backgroundColor
    this.camera.position.set(0, 2, 3)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.canvas.appendChild(this.renderer.domElement)
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

  private createAppMaterials() {
    this.materials['MAT_Frontok'] = new THREE.MeshStandardMaterial({ name: 'MAT_Frontok', color: 0xffffff });
    this.materials['MAT_Korpusz'] = new THREE.MeshStandardMaterial({ name: 'MAT_Korpusz', color: 0x808080 });
    this.materials['MAT_Munkapult'] = new THREE.MeshStandardMaterial({ name: 'MAT_Munkapult', color: 0x404040 });
    this.materials['MAT_Fem_Kiegeszitok'] = new THREE.MeshStandardMaterial({ name: 'MAT_Fem_Kiegeszitok', color: 0xc0c0c0, metalness: 1.0, roughness: 0.2 });
  }

  private loadModels() {
    const loader = new GLTFLoader()
    for (const category of furnitureDatabase) {
    for (const furniture of category.items) {
      // Ellenőrizzük, hogy ne töltsük be ugyanazt a modellt többször
      if (this.modelCache.has(furniture.modelUrl)) continue;

      loader.load(furniture.modelUrl, (gltf) => {
        const model = gltf.scene;
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.name.toLowerCase().includes('ajto') || child.name.toLowerCase().includes('fiokos')) {
                child.material = this.materials['MAT_Frontok'];
              } else if (child.name.toLowerCase().includes('korpusz')) {
                child.material = this.materials['MAT_Korpusz'];
              } else if (child.name.toLowerCase().includes('munkapult')) {
                child.material = this.materials['MAT_Munkapult'];
              } else if (child.name.toLowerCase().includes('fogantyu') || child.name.toLowerCase().includes('labazat_cso')) {
                child.material = this.materials['MAT_Fem_Kiegeszitok'];
              } else if (child.name.toLowerCase().includes('labazat_standard')) {
                child.material = this.materials['MAT_Korpusz'];
              }
            }
          });
          
          for (const slot of furniture.componentSlots) {
          if (slot.type.includes('style') && slot.styleOptions && slot.styleOptions.length > 0) {
            slot.styleOptions.forEach((styleOption, index) => {
              model.traverse((child) => {
                if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
                  child.visible = (index === 0);
                  }
                });
              });
            }
          }
          
          console.log(`Modell előtöltve és cache-elve: ${furniture.id}`)
          this.modelCache.set(furniture.modelUrl, model);
        })
      }
    }
  }

  private setupStoreWatchers() {
  // --- TÖRLÉS FIGYELŐ ---
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

  // --- EGYEDI ANYAGVÁLTÁS FIGYELŐ ---
  watch(() => this.selectionStore.materialChangeRequest, (request) => {
    if (!this.scene || !request) { return; }

    // JAVÍTÁS: Használjuk a flatMap-et itt is!
    const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
    const furnitureConfig = allFurniture.find(f => f.id === this.selectionStore.selectedObject?.name)
    
    if (!furnitureConfig) { this.selectionStore.acknowledgeMaterialChange(); return }
    const slotConfig = furnitureConfig.componentSlots.find(s => s.id === request.slotId)
    if (!slotConfig || !slotConfig.materialTarget) { this.selectionStore.acknowledgeMaterialChange(); return }
    const targetObject = this.placedObjects.find(obj => obj.uuid === request.targetUUID)
    if (!targetObject) { this.selectionStore.acknowledgeMaterialChange(); return }
    const materialConfig = availableMaterials.find(mat => mat.id === request.materialId)
    if (!materialConfig) { this.selectionStore.acknowledgeMaterialChange(); return }

    targetObject.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.name === slotConfig.materialTarget) {
          const material = child.material;
          material.color.set(materialConfig.color);
          material.roughness = materialConfig.roughness ?? 1.0;
          material.metalness = materialConfig.metalness ?? 0.0;
          if (materialConfig.textureUrl) {
            const url = materialConfig.textureUrl;
            if (this.textureCache.has(url)) {
              material.map = this.textureCache.get(url)!;
              material.needsUpdate = true;
            } else {
              this.textureLoader.load(url, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                material.map = texture;
                material.needsUpdate = true;
                this.textureCache.set(url, texture);
              });
            }
          } else {
            material.map = null;
            material.needsUpdate = true;
          }
        }
      }
    });
    this.selectionStore.acknowledgeMaterialChange();
  })

  // --- STÍLUSVÁLTÁS FIGYELŐ ---
  watch(() => this.selectionStore.styleChangeRequest, (request) => {
    if (!this.scene || !request) { return; }
    const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
    const furnitureConfig = allFurniture.find(f => f.id === this.selectionStore.selectedObject?.name)
    if (!furnitureConfig) { this.selectionStore.acknowledgeStyleChange(); return }
    const slotConfig = furnitureConfig.componentSlots.find(s => s.id === request.slotId)
    if (!slotConfig || !slotConfig.styleOptions) { this.selectionStore.acknowledgeStyleChange(); return }
    const targetObject = this.placedObjects.find(obj => obj.uuid === request.targetUUID)
    if (!targetObject) { this.selectionStore.acknowledgeStyleChange(); return }
    const newStyleOption = slotConfig.styleOptions.find(opt => opt.id === request.newStyleId)
    if (!newStyleOption) { this.selectionStore.acknowledgeStyleChange(); return }

    for (const styleOption of slotConfig.styleOptions) {
      targetObject.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
          const isSelected = styleOption.id === request.newStyleId
          child.visible = isSelected
          if (isSelected) {
            if (newStyleOption.inheritsMaterialFrom) {
              const parentSlot = furnitureConfig.componentSlots.find(s => s.id === newStyleOption.inheritsMaterialFrom)
              if (parentSlot && parentSlot.materialTarget) {
                targetObject.traverse(parentMesh => {
                  if (parentMesh instanceof THREE.Mesh && parentMesh.material.name === parentSlot.materialTarget) {
                    child.material = parentMesh.material
                  }
                })
              }
            } else if (newStyleOption.materialTarget) {
              targetObject.traverse(sourceMesh => {
                if (sourceMesh instanceof THREE.Mesh && sourceMesh.material.name === newStyleOption.materialTarget) {
                  child.material = sourceMesh.material
                }
              })
            }
          }
        }
      })
    }
    this.selectionStore.acknowledgeStyleChange()
  })

  // --- GLOBÁLIS ANYAGVÁLTÁS FIGYELŐ ---
  watch(() => this.settingsStore.globalMaterialSettings, (newSettings) => {
      for (const placedObject of this.placedObjects) {
        for (const [settingId, materialId] of Object.entries(newSettings)) {
        const globalMaterialConfig = globalMaterials[settingId as keyof typeof globalMaterials];
        if (!globalMaterialConfig) continue;

        const materialConfig = availableMaterials.find(m => m.id === materialId);
        if (!materialConfig) continue;

        placedObject.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            if (child.material.name === globalMaterialConfig.materialTarget) {
              const material = child.material;
              material.color.set(materialConfig.color);
              material.roughness = materialConfig.roughness ?? 1.0;
              material.metalness = materialConfig.metalness ?? 0.0;

              if (materialConfig.textureUrl) {
                const url = materialConfig.textureUrl;
                if (this.textureCache.has(url)) {
                  material.map = this.textureCache.get(url)!;
                } else {
                  this.textureLoader.load(url, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    material.map = texture;
                    material.needsUpdate = true;
                    this.textureCache.set(url, texture);
                  });
                }
              } else {
                material.map = null;
              }
              material.needsUpdate = true;
            }
          }
        });
      }
    }
  }, { deep: true });

 // Globális stílusváltó
    watch(() => this.settingsStore.globalStyleSettings, (newSettings) => {
      const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
      for (const placedObject of this.placedObjects) {
        const furnitureConfig = allFurniture.find(f => f.id === placedObject.name);
        if (!furnitureConfig) continue;
        for (const [slotId, newStyleId] of Object.entries(newSettings)) {
          const slotConfig = furnitureConfig.componentSlots.find(s => s.id === slotId);
          if (!slotConfig || !slotConfig.styleOptions) continue;
          for (const styleOption of slotConfig.styleOptions) {
            placedObject.traverse((child) => {
              if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
                child.visible = styleOption.id === newStyleId;
              }
            });
          }
        }
      }
    }, { deep: true });

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

           // === ÚJ "KÉM" KÓD ===
            console.log('--- KIVÁLASZTOTT OBJEKTUM ANYAGAINAK VIZSGÁLATA ---');
            objectToSelect.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                console.log(`Mesh neve: "${child.name}", Anyagának neve: "${child.material.name}"`);
              }
            });
            console.log('-------------------------------------------------');
            // === "KÉM" KÓD VÉGE ===

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
    if (this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown)
    }
    window.removeEventListener('resize', this.onWindowResize)
    this.endDrag()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

   private createDraggableObject(point: THREE.Vector3): THREE.Group | null {
  const activeId = this.settingsStore.activeFurnitureId;
  if (!activeId) {
    console.warn("Nincs aktív bútor kiválasztva a lehelyezéshez.");
    return null;
  }

  const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
  const furnitureConfig = allFurniture.find(f => f.id === activeId);
  if (!furnitureConfig) return null;

  const modelTemplate = this.modelCache.get(furnitureConfig.modelUrl);
  if (!modelTemplate) {
    console.error(`A(z) '${furnitureConfig.modelUrl}' modell nincs a cache-ben! Lehet, hogy még nem töltődött be.`);
    return null;
  }

  const newObject = modelTemplate.clone();
  newObject.name = furnitureConfig.id;
  
  newObject.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Fontos, hogy itt is klónozzuk az anyagokat, hogy minden példány egyedi legyen
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