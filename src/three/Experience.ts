// --- ALAP THREE.JS A 'three' CSOMAGBÓL ---
import {
  Scene, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, BoxHelper, Object3D,
  MeshStandardMaterial, Color, PlaneGeometry, Mesh, DoubleSide, GridHelper,
  AmbientLight, DirectionalLight, TextureLoader, Texture, Group, Box3, Vector3,
  Clock, SRGBColorSpace, RepeatWrapping
} from 'three';

// --- KIEGÉSZÍTŐK A 'three-stdlib' CSOMAGBÓL ---
import { OrbitControls } from 'three-stdlib';
import { TransformControls } from 'three-stdlib';
import { GLTFLoader } from 'three-stdlib';

// --- A TE SAJÁT IMPORTJAID ---
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { availableMaterials } from '@/config/materials'
import { furnitureDatabase, globalMaterials } from '@/config/furniture'
import { watch } from 'vue'

const SNAP_INCREMENT = 0.2
const SNAP_DISTANCE = 0.2

export default class Experience {
  private canvas: HTMLDivElement
  private scene!: Scene
  private camera!: PerspectiveCamera
  private renderer!: WebGLRenderer
  private controls!: OrbitControls
  private raycaster!: Raycaster
  private transformControls!: TransformControls
  private clock!: Clock 
  
  private textureLoader!: TextureLoader
  private textureCache: Map<string, Texture> = new Map()
  private modelCache: Map<string, Group> = new Map()
  
  private placedObjects: Group[] = []
  private intersectableObjects: Object3D[] = []
  private mouse = new Vector2()
  private draggedObject: Group | null = null
  private selectionBoxHelper!: BoxHelper
  
  private materials: { [key: string]: MeshStandardMaterial } = {}
  
  private selectionStore = useSelectionStore()
  private settingsStore = useSettingsStore()

  constructor(canvas: HTMLDivElement) {
    this.canvas = canvas
    this.createAppMaterials()
    this.initScene()
    this.loadModels()
    this.setupStoreWatchers()
    this.addEventListeners()
    this.animate()
  }

  public destroy() {
    this.transformControls.dispose()
    this.removeEventListeners()
  }

  private initScene() {
    this.scene = new Scene()
    this.clock = new Clock() 
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.canvas.appendChild(this.renderer.domElement)

    this.raycaster = new Raycaster()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement)
    
    // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
    this.transformControls.translationSnap = SNAP_INCREMENT;
    // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
    this.transformControls.rotationSnap = (5 * Math.PI) / 180;
    
    this.scene.add(this.transformControls)
    this.textureLoader = new TextureLoader()

    this.controls.enableDamping = true
    
    // 1. Esemény: A sárga doboz frissítése MOZGATÁS KÖZBEN.
    // @ts-expect-error - A TransformControls eseményei nincsenek helyesen definiálva.
    this.transformControls.addEventListener('objectChange', () => {
      if (this.selectionStore.selectedObject) {
        this.selectionBoxHelper.setFromObject(this.selectionStore.selectedObject);
      }
    });

    // 2. Esemény: A kamera vezérlésének ki/be kapcsolása a mozgatás alatt.
    // @ts-expect-error - A TransformControls eseményei nincsenek helyesen definiálva.
    this.transformControls.addEventListener('dragging-changed', (event) => {
      // @ts-expect-error - Az esemény objektumának van 'value' tulajdonsága.
      this.controls.enabled = !event.value;
    });

    const backgroundColor = new Color(0x252525)
    this.scene.background = backgroundColor
    this.camera.position.set(0, 2, 3)

    const floorColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
    const floor = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshStandardMaterial({ color: floorColor, side: DoubleSide })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    this.intersectableObjects.push(floor)

    const gridMainColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
    const gridCenterColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)
    const gridHelper = new GridHelper(20, 20, gridCenterColor, gridMainColor)
    this.scene.add(gridHelper)

    const ambientLight = new AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)
    const directionalLight = new DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    this.scene.add(directionalLight)

    this.selectionBoxHelper = new BoxHelper(new Object3D(), 0xffff00);
    this.selectionBoxHelper.visible = false;
    this.scene.add(this.selectionBoxHelper);
  }

  private createAppMaterials() {
    this.materials['MAT_Frontok'] = new MeshStandardMaterial({ name: 'MAT_Frontok', color: 0xffffff });
    this.materials['MAT_Korpusz'] = new MeshStandardMaterial({ name: 'MAT_Korpusz', color: 0x808080 });
    this.materials['MAT_Munkapult'] = new MeshStandardMaterial({ name: 'MAT_Munkapult', color: 0x404040 });
    this.materials['MAT_Fem_Kiegeszitok'] = new MeshStandardMaterial({ name: 'MAT_Fem_Kiegeszitok', color: 0xc0c0c0, metalness: 1.0, roughness: 0.2 });
  }

  private loadModels() {
    const loader = new GLTFLoader()
    for (const category of furnitureDatabase) {
      for (const furniture of category.items) {
        if (!furniture || this.modelCache.has(furniture.modelUrl)) continue;

        loader.load(furniture.modelUrl, (gltf) => {
          const model = gltf.scene;
          model.traverse((child) => {
            if (child instanceof Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.name.toLowerCase().includes('ajto') || child.name.toLowerCase().includes('fiokos')) {
                child.material = this.materials['MAT_Frontok']!.clone();
              } else if (child.name.toLowerCase().includes('korpusz')) {
                child.material = this.materials['MAT_Korpusz']!.clone();
              } else if (child.name.toLowerCase().includes('munkapult')) {
                child.material = this.materials['MAT_Munkapult']!.clone();
              } else if (child.name.toLowerCase().includes('fogantyu') || child.name.toLowerCase().includes('labazat_cso')) {
                child.material = this.materials['MAT_Fem_Kiegeszitok']!.clone();
              } else if (child.name.toLowerCase().includes('labazat_standard')) {
                child.material = this.materials['MAT_Korpusz']!.clone();
              } else {
                child.material = new MeshStandardMaterial({ color: 0xff00ff });
              }
            }
          });
          
          for (const slot of furniture.componentSlots) {
            if (slot.type.includes('style') && slot.styleOptions && slot.styleOptions.length > 0) {
              slot.styleOptions.forEach((styleOption, index) => {
                model.traverse((child) => {
                  if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
                    child.visible = (index === 0);
                  }
                });
              });
            }
          }
          
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
        this.transformControls.detach()
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
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
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
                texture.colorSpace = SRGBColorSpace;
                texture.wrapS = RepeatWrapping;
                texture.wrapT = RepeatWrapping;
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
        if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
          const isSelected = styleOption.id === request.newStyleId
          child.visible = isSelected
          if (isSelected) {
            if (newStyleOption.inheritsMaterialFrom) {
              const parentSlot = furnitureConfig.componentSlots.find(s => s.id === newStyleOption.inheritsMaterialFrom)
              if (parentSlot && parentSlot.materialTarget) {
                targetObject.traverse(parentMesh => {
                  if (parentMesh instanceof Mesh && parentMesh.material.name === parentSlot.materialTarget) {
                    child.material = parentMesh.material
                  }
                })
              }
            } else if (newStyleOption.materialTarget) {
              targetObject.traverse(sourceMesh => {
                if (sourceMesh instanceof Mesh && sourceMesh.material.name === newStyleOption.materialTarget) {
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
          if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
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
                    texture.colorSpace = SRGBColorSpace;
                    texture.wrapS = RepeatWrapping;
                    texture.wrapT = RepeatWrapping;
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
              if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
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
    // @ts-expect-error - A 'dragging' tulajdonság privátként van jelölve.
    if (this.transformControls.dragging) return;

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
        if (objectToSelect instanceof Group) {
          if (this.selectionStore.selectedObject?.uuid === objectToSelect.uuid) {
            return;
          }
          this.selectionStore.selectObject(objectToSelect);
          this.selectionBoxHelper.setFromObject(objectToSelect);
          this.selectionBoxHelper.visible = true;
          this.transformControls.attach(objectToSelect);
        }
      } else {
        // @ts-expect-error - Az 'axis' tulajdonság privátként van jelölve.
        if (!this.transformControls.axis) {
          this.selectionStore.clearSelection();
          this.selectionBoxHelper.visible = false;
          this.transformControls.detach();
        }
      }
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.draggedObject) return;
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.intersectableObjects);
    if (intersects.length > 0) {
      const point = intersects[0]!.point;
      const finalPosition = this.calculatePlacementSnapPosition(this.draggedObject, point);
      this.draggedObject.position.copy(finalPosition);
    }
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (this.draggedObject) {
      this.draggedObject.traverse((child) => {
        if (child instanceof Mesh) {
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

  private onKeyDown = (event: KeyboardEvent) => {
    switch (event.key.toLowerCase()) {
      case 'w': // W = Translate (mozgatás)
        this.transformControls.setMode('translate');
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showX = true;
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showY = false;
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showZ = true;
        break;
      case 'e': // E = Rotate (forgatás)
        this.transformControls.setMode('rotate');
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showX = false;
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showY = true;
        // @ts-expect-error - A tulajdonságok tévesen privátnak vannak jelölve.
        this.transformControls.showZ = false;
        break;
    }
  }

  private addEventListeners() {
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('resize', this.onWindowResize)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private removeEventListeners() {
    if (this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown)
    }
    window.removeEventListener('resize', this.onWindowResize)
    window.removeEventListener('keydown', this.onKeyDown)
    this.endDrag()
  }

  private animate = () => {
    const delta = this.clock.getDelta();
    requestAnimationFrame(this.animate)

    if (this.controls.enabled) {
      // @ts-expect-error - A típusdefiníció hibás, a delta paraméter szükséges
      this.controls.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private calculatePlacementSnapPosition(movingObject: Group, proposedPosition: Vector3): Vector3 {
    const snappedPosition = new Vector3(
      this.snapToGrid(proposedPosition.x),
      0,
      this.snapToGrid(proposedPosition.z)
    );
    const movingBox = new Box3().setFromObject(movingObject);
    const movingSize = new Vector3();
    movingBox.getSize(movingSize);
    const objectsToCompare = this.placedObjects.filter(obj => obj !== movingObject);
    let closestDistance = Infinity;
    let snapAction: (() => void) | null = null;
    for (const staticObject of objectsToCompare) {
      const staticBox = new Box3().setFromObject(staticObject);
      const staticSize = new Vector3();
      staticBox.getSize(staticSize);
      const distZ = Math.abs(proposedPosition.z - staticObject.position.z) - (movingSize.z / 2 + staticSize.z / 2);
      const distX = Math.abs(proposedPosition.x - staticObject.position.x) - (movingSize.x / 2 + staticSize.x / 2);
      if (distZ < SNAP_DISTANCE && distZ < closestDistance) {
        closestDistance = distZ;
        snapAction = () => {
          if (proposedPosition.z > staticObject.position.z) {
            snappedPosition.z = staticObject.position.z + staticSize.z / 2 + movingSize.z / 2;
          } else {
            snappedPosition.z = staticObject.position.z - staticSize.z / 2 - movingSize.z / 2;
          }
        };
      }
      if (distX < SNAP_DISTANCE && distX < closestDistance) {
        closestDistance = distX;
        snapAction = () => {
          if (proposedPosition.x > staticObject.position.x) {
            snappedPosition.x = staticObject.position.x + staticSize.x / 2 + movingSize.x / 2;
          } else {
            snappedPosition.x = staticObject.position.x - staticSize.x / 2 - movingSize.x / 2;
          }
        };
      }
    }
    if (snapAction) {
      snapAction();
    }
    return snappedPosition;
  }

  private createDraggableObject(point: Vector3): Group | null {
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
      console.error(`A(z) '${furnitureConfig.modelUrl}' modell nincs a cache-ben!`);
      return null;
    }
    const newObject = modelTemplate.clone();
    newObject.name = furnitureConfig.id;
    newObject.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material.transparent = true;
        child.material.opacity = 0.5;
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