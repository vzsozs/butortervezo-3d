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

    // 1. Komponens Config keresése (hogy tudjuk, mi a materialTarget)
    const componentId = targetObject.userData.componentState?.[slotId]
    const componentConfig = this.experience.configManager.getComponentById(componentId)
    const materialConfig = this.experience.configManager.getMaterialById(materialId)

    if (!componentConfig?.materialTarget) {
      console.warn(`[StateManager] No materialTarget found for component: ${componentId}`)
      return
    }
    if (!materialConfig) {
      console.warn(`[StateManager] Material config not found for id: ${materialId}`)
      return
    }

    const materialTargetName = componentConfig.materialTarget
    console.log(`[StateManager] Target Material Name in GLB: ${materialTargetName}`)

    // ÚJ: Anyag létrehozása az AssetManager segítségével
    const newMaterial = await this.experience.assetManager.createMaterial(materialConfig)

    let appliedCount = 0
    targetObject.traverse((child: Object3D) => {
      // Slot ID alapján keresünk (ez a legbiztosabb)
      if (child.userData.slotId === slotId) {
        child.traverse((mesh: Object3D) => {
          if (mesh instanceof Mesh) {
            // JAVÍTÁS: Most már a userData.isMaterialTarget flag-et figyeljük,
            // amit az AssetManager állított be betöltéskor.
            // Így nem számít, hogy mi az aktuális anyag neve.
            if (mesh.userData.isMaterialTarget) {
              mesh.material = newMaterial
              mesh.castShadow = true
              mesh.receiveShadow = true
              appliedCount++
            }
          }
        })
      }
    })
    console.log(`[StateManager] Applied material to ${appliedCount} meshes.`)
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

    // 3. TÖRLÉS
    watch(
      () => selectionStore.objectToDeleteUUID,
      (uuidToDelete) => {
        if (!uuidToDelete) return
        const objectToRemove = experienceStore.getObjectByUUID(uuidToDelete)
        if (objectToRemove) {
          this.experience.removeObject(objectToRemove)
        }
        selectionStore.acknowledgeDeletion()
      },
    )
  }
}
