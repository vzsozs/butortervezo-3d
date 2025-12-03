import { watch } from 'vue'
import { Group, Mesh, Object3D } from 'three'
import Experience from '../Experience'
// import { availableMaterials } from '@/config/materials'; // Már nem használjuk

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers()
  }

  // --- PUBLIKUS METÓDUSOK ---

  public updateFrontsVisibility(isVisible: boolean) {
    this.experience.toggleFrontVisibility(isVisible)
  }

  public async applyMaterialsToObject(targetObject: Group) {
    const componentState = targetObject.userData.componentState
    const materialState = targetObject.userData.materialState
    if (!componentState || !materialState) return

    for (const slotId in componentState) {
      const componentId = componentState[slotId]
      const materialId = materialState[slotId]
      if (componentId && materialId) {
        await this.applyMaterialToSlot(targetObject, slotId, materialId)
      }
    }
  }

  public async applyMaterialToSlot(targetObject: Group, slotId: string, materialId: string) {
    console.log(`[StateManager] applyMaterialToSlot: slotId=${slotId}, materialId=${materialId}`)

    const componentId = targetObject.userData.componentState?.[slotId]
    const componentConfig = this.experience.configManager.getComponentById(componentId)
    const materialConfig = this.experience.configManager.getMaterialById(materialId)

    if (!componentConfig?.materialTarget) return
    if (!materialConfig) return

    // Anyag létrehozása
    const newMaterial = await this.experience.assetManager.createMaterial(materialConfig)

    let appliedCount = 0

    // 1. Megkeressük a slot gyökerét (pl. a Korpusz csoportját)
    targetObject.traverse((child: Object3D) => {
      if (child.userData.slotId === slotId) {
        // 2. Indítjuk a rekurziót, de most átadjuk a targetObject-et is!
        appliedCount += this.applyMaterialRecursive(child, newMaterial, slotId, targetObject)
      }
    })

    console.log(`[StateManager] Applied material to ${appliedCount} meshes.`)
  }

  // 🔥 MÓDOSÍTOTT: Okos bejáró öröklés-támogatással
  private applyMaterialRecursive(
    object: Object3D,
    material: any,
    targetSlotId: string,
    rootObject: Group, // <--- ÚJ PARAMÉTER: A fő bútor, hogy lássuk a configot
  ): number {
    let count = 0

    // HATÁR ELLENŐRZÉS:
    // Ha ennek az objektumnak van slotId-ja, ÉS az nem egyezik azzal, amit épp színezünk...
    if (object.userData.slotId && object.userData.slotId !== targetSlotId) {
      // ...AKKOR megnézzük, hogy ez a gyerek elem örököl-e?
      const childSlotId = object.userData.slotId
      const childComponentId = rootObject.userData.componentState?.[childSlotId]

      if (childComponentId) {
        const childComp = this.experience.configManager.getComponentById(childComponentId)

        // HA ÖRÖKÖL (materialSource === 'corpus'), AKKOR ENGEDJÜK TOVÁBB!
        // (Feltételezzük, hogy most épp a korpuszt színezzük, vagy a forrás megegyezik)
        if (childComp?.materialSource === 'corpus') {
          // Mehet tovább a bejárás (nem returnölünk 0-t)
          // Így a polc is megkapja a színt.
        } else {
          // HA NEM ÖRÖKÖL (pl. Ajtó), AKKOR STOP.
          return 0
        }
      } else {
        return 0
      }
    }

    // Színezés (Mesh esetén)
    if (object instanceof Mesh) {
      if (object.userData.isMaterialTarget) {
        object.material = material
        object.castShadow = true
        object.receiveShadow = true
        count++
      }
    }

    // Tovább a gyerekeken
    for (const child of object.children) {
      count += this.applyMaterialRecursive(child, material, targetSlotId, rootObject)
    }

    return count
  }

  // --- BELSŐ MŰKÖDÉS ---

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore
    const experienceStore = this.experience.experienceStore

    console.log('[StateManager] Watcherek inicializálása...')

    // 1. ANYAG CSERE
    watch(
      () => selectionStore.materialChangeRequest,
      async (request) => {
        if (!request) return
        console.log('[StateManager] Anyagcsere kérés:', request)

        const { targetUUID, slotId, materialId } = request
        const targetObject = experienceStore.getObjectByUUID(targetUUID)

        if (targetObject) {
          const newMaterialState = { ...targetObject.userData.materialState, [slotId]: materialId }
          targetObject.userData.materialState = newMaterialState
          await this.applyMaterialToSlot(targetObject, slotId, materialId)
          this.experience.historyStore.addState()
        }

        selectionStore.acknowledgeMaterialChange()
      },
      { deep: true },
    ) // Deep watch a biztonság kedvéért

    // 2. STÍLUS CSERE (Komponens csere)
    watch(
      () => selectionStore.styleChangeRequest,
      async (request) => {
        if (!request) return
        console.log('[StateManager] Stíluscsere kérés:', request)

        const { targetUUID, slotId, newStyleId } = request
        const targetObject = experienceStore.getObjectByUUID(targetUUID)

        if (targetObject) {
          const newComponentState = {
            ...targetObject.userData.componentState,
            [slotId]: newStyleId,
          }
          // Rebuild
          await this.experience.rebuildObject(targetObject, newComponentState)
          this.experience.historyStore.addState()
        }

        selectionStore.acknowledgeStyleChange()
      },
      { deep: true },
    )

    // 3. TÖRLÉS (Javítva: Sárga doboz eltüntetése)
    watch(
      () => selectionStore.objectToDeleteUUID,
      (uuidToDelete) => {
        if (!uuidToDelete) return

        // Egyszerűen meghívjuk ugyanazt a függvényt, amit a DEL gomb használ
        if (this.experience.interactionManager) {
          console.log('[StateManager] Törlés delegálása az InteractionManager-nek...')
          this.experience.interactionManager.handleDelete()
        }

        // Nyugtázzuk, hogy a kérést feldolgoztuk
        selectionStore.acknowledgeDeletion()
      },
    )

    // 4. DUPLIKÁLÁS (ÚJ FUNKCIÓ)
    watch(
      () => selectionStore.objectToDuplicateUUID,
      async (uuidToDuplicate) => {
        if (!uuidToDuplicate) return

        const originalObject = experienceStore.getObjectByUUID(uuidToDuplicate)
        if (!originalObject) return

        console.log('[StateManager] Duplikálás indítása...')

        try {
          // A) Adatok mélymásolása (hogy ne legyen referencia kapcsolat)
          const config = JSON.parse(JSON.stringify(originalObject.userData.config))
          const componentState = JSON.parse(
            JSON.stringify(originalObject.userData.componentState || {}),
          )
          const materialState = JSON.parse(
            JSON.stringify(originalObject.userData.materialState || {}),
          )

          // B) Új bútor felépítése (ugyanazokkal a beállításokkal)
          const newObject = await this.experience.assetManager.buildFurnitureFromConfig(
            config,
            componentState,
          )

          // C) Anyagok és Config visszaírása
          newObject.userData.config = config
          newObject.userData.materialState = materialState

          // D) Anyagok alkalmazása a 3D hálókra
          await this.applyMaterialsToObject(newObject)

          // E) 🔥 TAPADJON AZ EGÉRRE (Placement Mode)
          // Feltételezzük, hogy az InputManager-nek van startDragging vagy startPlacement metódusa.
          // Ha a te kódodban máshogy hívják (pl. setFloatingObject), írd át arra!
          if (this.experience.interactionManager) {
            this.experience.interactionManager.startDraggingExistingObject(newObject)
          } else {
            // Fallback, ha valamiért mégsem érné el
            newObject.position.copy(originalObject.position).addScalar(0.2)
            this.experience.scene.add(newObject)
            this.experience.experienceStore.addObject(newObject)
            this.experience.selectionStore.selectObject(newObject)
          }

          console.log('[StateManager] Sikeres duplikálás.')
        } catch (error) {
          console.error('[StateManager] Hiba a duplikálásnál:', error)
        }

        selectionStore.acknowledgeDuplication()
      },
    )
  }
}
