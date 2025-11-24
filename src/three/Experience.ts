/* eslint-disable @typescript-eslint/no-this-alias */
// src/three/Experience.ts

import { toRaw, markRaw } from 'vue'
import {
  Scene,
  Clock,
  Raycaster,
  Vector2,
  Object3D,
  Group,
  Mesh,
  PlaneGeometry,
  AmbientLight,
  DirectionalLight,
  GridHelper,
  BoxHelper,
  LineSegments,
} from 'three'

import Sizes from './Utils/Sizes'
import Camera from './Camera'
import Renderer from './Renderer'
import World from './World/World'

import ConfigManager from './Managers/ConfigManager'
import AssetManager from './Managers/AssetManager'
import PlacementManager from './Managers/PlacementManager'
import InteractionManager from './Managers/InteractionManager'
import StateManager from './Managers/StateManager'
import DebugManager from './Managers/DebugManager'
import Debug from './Utils/Debug'

import { useExperienceStore } from '@/stores/experience'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { useHistoryStore, type SceneState } from '@/stores/history'

let instance: Experience | null = null

export default class Experience {
  public canvas!: HTMLDivElement
  public scene!: Scene
  private clock!: Clock

  public sizes!: Sizes
  public camera!: Camera
  public renderer!: Renderer
  public world!: World
  public debug!: Debug

  public raycaster!: Raycaster
  public mouse = new Vector2()
  public intersectableObjects: Object3D[] = []
  public rulerElements!: Group

  public configManager = ConfigManager
  public assetManager = AssetManager.getInstance()
  public placementManager!: PlacementManager
  public interactionManager!: InteractionManager
  public stateManager!: StateManager
  public debugManager = DebugManager.getInstance()

  public experienceStore = useExperienceStore()
  public selectionStore = useSelectionStore()
  public settingsStore = useSettingsStore()
  public historyStore = useHistoryStore()

  private isDestroyed = false

  private constructor(canvas: HTMLDivElement) {
    // --- ZOMBI GYILKOS (Ez szünteti meg a duplázódást HMR alatt) ---
    if ((window as any)._experienceInstance) {
      console.warn('⚠️ Zombi Experience észlelve! Kényszerített leállítás...')
      ;(window as any)._experienceInstance.destroy()
    }
    ;(window as any)._experienceInstance = this
    // -------------------------------------------------------------

    if (instance) return instance
    instance = this

    this.canvas = canvas
    this.scene = new Scene()
    this.clock = new Clock()
    this.raycaster = new Raycaster()

    this.sizes = new Sizes()
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.world = new World(this.scene)
    this.debug = new Debug(this.scene)

    this.placementManager = new PlacementManager(this)
    this.interactionManager = new InteractionManager(this)
    this.stateManager = new StateManager(this)

    this.rulerElements = new Group()
    this.scene.add(this.rulerElements)
    const floor = this.scene.children.find(
      (c) => c instanceof Mesh && c.geometry instanceof PlaneGeometry,
    )
    if (floor) this.intersectableObjects.push(floor)

    this.sizes.addEventListener('resize', this.onResize)
    window.addEventListener('mousemove', this.onPointerMove)
    this.setupTransformControlsListeners()

    this.historyStore.addState()
    this.update()
  }

  public static getInstance(canvas?: HTMLDivElement): Experience {
    if (!instance && canvas) instance = new Experience(canvas)
    else if (instance && canvas && instance.canvas !== canvas) {
      // Ha új canvast kapunk (pl. oldalváltás), eldobjuk a régit
      instance.destroy()
      instance = new Experience(canvas)
    } else if (!instance && !canvas) throw new Error('Experience not initialized.')
    return instance!
  }

  private onResize = () => {
    this.camera.onResize()
    this.renderer.onResize()
  }

  private onPointerMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  private setupTransformControlsListeners() {
    // @ts-expect-error - event typing
    this.camera.transformControls.addEventListener('objectChange', this.onObjectChange)
    // @ts-expect-error - event typing
    this.camera.transformControls.addEventListener('dragging-changed', this.onDraggingChanged)
  }

  private onObjectChange = () => {
    // @ts-expect-error - dragging
    if (!this.camera.transformControls.dragging) return
    const selectedObject = this.selectionStore.selectedObject
    if (!selectedObject) return
    const objectsToCompare = this.experienceStore.placedObjects.filter(
      (obj) => obj.uuid !== selectedObject.uuid,
    )
    const finalPosition = this.placementManager.calculateFinalPosition(
      selectedObject,
      selectedObject.position,
      objectsToCompare,
    )
    selectedObject.position.copy(finalPosition)
    this.debug.selectionBoxHelper.setFromObject(selectedObject)
  }

  private onDraggingChanged = (event: { value: boolean }) => {
    this.camera.controls.enabled = !event.value
    if (event.value) {
      this.interactionManager.handleTransformStart()
    } else {
      this.interactionManager.handleTransformEnd()
      this.debug.hideAll()
    }
  }

  // --- UPDATE LOOP (CRASH VÉDELEMMEL) ---
  private update = () => {
    if (this.isDestroyed) return
    requestAnimationFrame(this.update)

    // Crash Védelem: Ha a TransformControls árva objektumot fog, elengedjük
    // @ts-expect-error - private
    const controlsObj = this.camera.transformControls.object
    if (controlsObj && !controlsObj.parent) {
      this.camera.transformControls.detach()
      this.selectionStore.clearSelection()
    }

    this.camera.update()
    this.renderer.update()
  }

  // --- GLOBÁLIS CSERE (Nukleáris módszer) ---

  public async updateGlobalMaterials() {
    console.log('--- [updateGlobalMaterials] START ---')
    const globalMaterials = this.settingsStore.globalMaterialSettings
    console.log('Global Materials:', JSON.parse(JSON.stringify(globalMaterials)))

    for (const object of this.experienceStore.placedObjects) {
      let needsUpdate = false
      const materialState = object.userData.materialState || {}
      const config = object.userData.config
      if (!config) continue

      const componentState = object.userData.componentState || {}

      for (const slot of config.componentSlots) {
        const slotId = slot.slotId
        for (const [globalTarget, materialId] of Object.entries(globalMaterials)) {
          // JAVÍTÁS: A slotId (pl. "front_1") nem tartalmazza a többesszámú targetet ("fronts").
          // Ezért a componentType-ot is ellenőrizzük, ami viszont egyezik ("fronts").
          const isMatch = slotId.includes(globalTarget) || slot.componentType === globalTarget

          if (isMatch && materialState[slotId] !== materialId) {
            console.log(
              `Match found! Slot: ${slotId}, Type: ${slot.componentType} matches Target: ${globalTarget}`,
            )

            // 1. Ellenőrzés: Megengedett-e ez az anyag ehhez a komponenshez?
            const currentComponentId = componentState[slotId]
            if (currentComponentId) {
              const componentConfig = this.configManager.getComponentById(currentComponentId)
              const materialConfig = this.configManager.getMaterialById(materialId)

              if (
                componentConfig &&
                materialConfig &&
                componentConfig.allowedMaterialCategories &&
                componentConfig.allowedMaterialCategories.length > 0
              ) {
                // Ha van korlátozás, ellenőrizzük
                const matCats = Array.isArray(materialConfig.category)
                  ? materialConfig.category
                  : [materialConfig.category]
                const isAllowed = matCats.some((c) =>
                  componentConfig.allowedMaterialCategories!.includes(c),
                )

                if (!isAllowed) {
                  console.warn(
                    `[updateGlobalMaterials] Material '${materialId}' skipped for '${currentComponentId}' (Category mismatch)`,
                  )
                  continue // Ugrás a következőre, ezt nem alkalmazzuk
                }
              }
            }

            console.log(`Applying material ${materialId} to slot ${slotId}`)
            materialState[slotId] = materialId
            needsUpdate = true
          }
        }
      }
      if (needsUpdate) {
        console.log('Object needs update, calling applyMaterialsToObject')
        object.userData.materialState = materialState
        await this.stateManager.applyMaterialsToObject(object)
      }
    }
    console.log('--- [updateGlobalMaterials] END ---')
  }

  public updateTotalPrice() {
    this.experienceStore.calculateTotalPrice()
  }

  public addObjectToScene(newObject: Group) {
    this.scene.add(newObject)
    this.experienceStore.addObject(markRaw(newObject))
    this.updateTotalPrice()
    this.historyStore.addState()
  }

  public removeObject(objectToRemove: Group) {
    const rawObjectToRemove = toRaw(objectToRemove)
    // @ts-expect-error - object is private
    const attachedObject = this.camera.transformControls.object
    if (attachedObject && toRaw(attachedObject).uuid === rawObjectToRemove.uuid) {
      this.camera.transformControls.detach()
      this.selectionStore.clearSelection()
      this.debug.selectionBoxHelper.visible = false
    }
    this.scene.remove(rawObjectToRemove)

    const allObjects = this.experienceStore.placedObjects.slice()
    const index = allObjects.findIndex((obj) => obj.uuid === rawObjectToRemove.uuid)
    if (index > -1) {
      allObjects.splice(index, 1)
      this.experienceStore.updatePlacedObjects(allObjects)
    }
    this.updateTotalPrice()
    this.historyStore.addState()
  }

  public newScene() {
    // console.log("--- [newScene] MÉLYTAKARÍTÁS ---");
    const transformControlsUUID = this.camera.transformControls.uuid

    // 1. LECSATOLÁS
    this.camera.transformControls.detach()
    this.selectionStore.clearSelection()
    this.debug.selectionBoxHelper.visible = false

    // 2. STORE ALAPÚ TÖRLÉS (Elsődleges)
    this.experienceStore.placedObjects.forEach((obj) => {
      const rawObj = toRaw(obj)
      const objectInScene = this.scene.children.find((c) => c.uuid === rawObj.uuid)
      if (objectInScene) {
        this.scene.remove(objectInScene)
        this.disposeRecursively(objectInScene)
      }
    })

    // 3. SCENE TAKARÍTÁS (Szigorú Allow-List)
    const objectsToKill: Object3D[] = []

    this.scene.children.forEach((child) => {
      const rawChild = toRaw(child)

      // --- ALLOW LIST ---
      if (rawChild === this.rulerElements) return
      if ((rawChild as any).isLight) return
      if ((rawChild as any).isCamera) return
      if (rawChild.uuid === transformControlsUUID) return
      if (rawChild instanceof Mesh && rawChild.geometry instanceof PlaneGeometry) return

      // Helpers (Debug & World)
      if (rawChild instanceof GridHelper) return
      if (rawChild instanceof BoxHelper) return
      if (rawChild instanceof LineSegments) return
      if (
        rawChild instanceof Mesh &&
        !rawChild.userData.config &&
        !rawChild.userData.componentState
      )
        return

      // --- KILL LIST ---
      objectsToKill.push(child)
    })

    objectsToKill.forEach((obj) => {
      this.scene.remove(obj)
      this.disposeRecursively(obj)
    })

    // 4. RULER ELEMENTS TAKARÍTÁS
    while (this.rulerElements.children.length > 0) {
      const child = this.rulerElements.children[0]
      if (!child) break
      this.rulerElements.remove(child)
      this.disposeRecursively(child)
    }

    // 5. Store reset
    this.experienceStore.updatePlacedObjects([])

    // 6. Egyéb
    this.settingsStore.resetToDefaults()
    this.historyStore.clearHistory()
    this.historyStore.addState()
  }

  // Segédfüggvény a memóriatakarításhoz
  private disposeRecursively(object: any) {
    if (!object) return
    object.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m: any) => m.dispose && m.dispose())
      }
    })
  }

  public async loadState(state: SceneState, signal?: AbortSignal) {
    if (signal?.aborted) {
      throw new DOMException('Load state aborted', 'AbortError')
    }

    // BIZTONSÁGI TAKARÍTÁS
    const existingObjects: Object3D[] = []
    this.scene.children.forEach((child) => {
      if (
        ((child as any).isGroup || (child.userData && child.userData.config)) &&
        child !== this.rulerElements
      ) {
        existingObjects.push(child)
      }
    })
    existingObjects.forEach((obj) => this.scene.remove(obj))
    this.experienceStore.updatePlacedObjects([])

    // Újak betöltése
    for (const objState of state) {
      if (signal?.aborted) {
        throw new DOMException('Load state aborted during object processing', 'AbortError')
      }

      const config = this.configManager.getFurnitureById(objState.configId)
      if (config) {
        const newObject = await this.assetManager.buildFurnitureFromConfig(
          config,
          objState.componentState,
          objState.propertyState,
        )
        newObject.position.fromArray(objState.position)
        newObject.rotation.fromArray(objState.rotation as [number, number, number])
        newObject.userData.materialState = objState.materialState
        await this.stateManager.applyMaterialsToObject(newObject)

        this.scene.add(newObject)
        this.experienceStore.addObject(markRaw(newObject))
      }
    }
    this.updateTotalPrice()
  }

  // Ez már csak egyedi esetekre kell
  public async rebuildObject(
    oldObject: Group,
    newComponentState: Record<string, string>,
  ): Promise<Group | null> {
    let objectInScene = this.scene.children.find((c) => c.uuid === oldObject.uuid)
    if (!objectInScene && oldObject.userData?.config) {
      objectInScene = this.scene.children.find(
        (c) =>
          c.userData?.config?.id === oldObject.userData.config.id &&
          c.position.equals(oldObject.position),
      )
    }
    if (!objectInScene) return null

    // @ts-expect-error - private
    const controlsObj = this.camera.transformControls.object
    if (controlsObj && controlsObj.uuid === objectInScene.uuid) {
      this.camera.transformControls.detach()
      this.selectionStore.clearSelection()
    }

    const config = objectInScene.userData.config
    const propertyState = objectInScene.userData.propertyState
    const materialState = objectInScene.userData.materialState

    const newObject = await this.assetManager.buildFurnitureFromConfig(
      config,
      newComponentState,
      propertyState,
    )
    newObject.position.copy(objectInScene.position)
    newObject.rotation.copy(objectInScene.rotation)
    newObject.userData.materialState = JSON.parse(JSON.stringify(materialState || {}))
    await this.stateManager.applyMaterialsToObject(newObject)

    this.scene.remove(objectInScene)
    this.scene.add(newObject)
    this.experienceStore.replaceObject(oldObject.uuid, newObject)
    this.updateTotalPrice()

    return newObject
  }

  public getScreenshotCanvas(): HTMLCanvasElement | undefined {
    try {
      const screenshotScene = new Scene()
      screenshotScene.background = this.scene.background
      this.scene.traverse((child) => {
        const rawChild = toRaw(child)
        if (rawChild instanceof AmbientLight || rawChild instanceof DirectionalLight) {
          screenshotScene.add(rawChild.clone())
        }
      })
      for (const proxyObject of this.experienceStore.placedObjects) {
        const rawObject = toRaw(proxyObject)
        screenshotScene.add(rawObject.clone())
      }
      this.renderer.instance.render(screenshotScene, this.camera.instance)
      return this.renderer.instance.domElement
    } catch (error) {
      console.error('Screenshot error:', error)
      return undefined
    }
  }

  public toggleFrontVisibility(isVisible: boolean) {
    this.experienceStore.placedObjects.forEach((object) => {
      object.traverse((child) => {
        if (child.userData.slotId && child.userData.slotId.includes('front')) {
          child.visible = isVisible
        }
      })
    })
  }

  public destroy() {
    this.isDestroyed = true
    this.sizes.destroy()
    window.removeEventListener('mousemove', this.onPointerMove)
    this.interactionManager.removeEventListeners()
    // @ts-expect-error - a
    this.camera.transformControls.removeEventListener('objectChange', this.onObjectChange)
    // @ts-expect-error - a
    this.camera.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged)

    this.camera.destroy()
    this.renderer.destroy()

    this.scene.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          Object.values(material).forEach((value: unknown) => {
            if (value && typeof (value as { dispose?: () => void }).dispose === 'function') {
              ;(value as { dispose: () => void }).dispose()
            }
          })
        }
      }
    })

    if (this.canvas) {
      this.canvas.innerHTML = ''
      const canvasDom = this.renderer.instance.domElement
      if (canvasDom && canvasDom.parentElement === this.canvas) {
        this.canvas.removeChild(canvasDom)
      }
    }

    ;(window as any)._experienceInstance = null
    instance = null
    console.log('Experience destroyed')
  }
}
