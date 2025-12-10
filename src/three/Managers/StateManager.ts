import { watch } from 'vue'
import { Group, Mesh, Object3D, MeshPhysicalMaterial } from 'three'
import Experience from '../Experience'
import type { ComponentConfig } from '@/config/furniture' // Típus importálása

export default class StateManager {
  private materialCache: Map<string, MeshPhysicalMaterial> = new Map()

  constructor(private experience: Experience) {
    this.setupWatchers()
  }

  public updateFrontsVisibility(isVisible: boolean) {
    this.experience.toggleFrontVisibility(isVisible)
  }

  public async applyMaterialsToObject(targetObject: Group) {
    const componentState = targetObject.userData.componentState
    const localMaterialState = targetObject.userData.materialState || {}

    if (!componentState) return

    for (const slotId in componentState) {
      const componentId = componentState[slotId]
      if (componentId) {
        await this.applyMaterialToSlot(targetObject, slotId, componentId, localMaterialState)
      }
    }
  }

  public async applyMaterialToSlot(
    targetObject: Group,
    slotId: string,
    componentId: string,
    localOverrides: Record<string, string> = {},
  ) {
    const componentConfig = this.experience.configManager.getComponentById(componentId)
    if (!componentConfig) return

    let slotRoot: Object3D | null = null
    targetObject.traverse((child) => {
      if (child.userData.slotId === slotId) {
        slotRoot = child
      }
    })

    if (!slotRoot) return

    const globalSettings = this.experience.settingsStore.globalMaterialSettings

    const getMaterial = async (materialId: string) => {
      if (this.materialCache.has(materialId)) return this.materialCache.get(materialId)!
      const matConfig = this.experience.configManager.getMaterialById(materialId)
      if (!matConfig) return null
      const mat = await this.experience.assetManager.createMaterial(matConfig)
      this.materialCache.set(materialId, mat)
      return mat
    }

    const applyRecursive = async (object: Object3D) => {
      if (object instanceof Mesh) {
        if (object.userData.isMaterialTarget) {
          const slotKey = object.userData.materialSlotKey || 'base'
          const compType = componentConfig.componentType || componentConfig.category || 'front'

          let materialIdToUse: string | null = null

          // A) LOKÁLIS
          const localSpecificKey = `${slotId}_${slotKey}`
          const localBaseKey = slotId

          if (slotKey !== 'base' && localOverrides[localSpecificKey]) {
            materialIdToUse = localOverrides[localSpecificKey]
          } else if (localOverrides[localBaseKey] && slotKey === 'base') {
            materialIdToUse = localOverrides[localBaseKey]
          }

          // B) GLOBÁLIS
          if (!materialIdToUse) {
            const globalSpecificKey = `${compType}_${slotKey}`
            const globalBaseKey = compType

            if (slotKey !== 'base' && globalSettings[globalSpecificKey]) {
              materialIdToUse = globalSettings[globalSpecificKey]
            } else if (globalSettings[globalBaseKey] && slotKey === 'base') {
              materialIdToUse = globalSettings[globalBaseKey]
            }

            if (!materialIdToUse && slotKey === 'base') {
              const cat = componentConfig.category
              if (cat && globalSettings[cat]) {
                materialIdToUse = globalSettings[cat]
              }
            }
          }

          // C) ALKALMAZÁS
          if (materialIdToUse) {
            const material = await getMaterial(materialIdToUse)
            if (material) {
              object.material = material
              object.castShadow = true
              object.receiveShadow = true
            }
          }
        }
      }

      for (const child of object.children) {
        if (child.userData.slotId && child.userData.slotId !== slotId) continue
        await applyRecursive(child)
      }
    }

    await applyRecursive(slotRoot as Object3D)
  }

  private findCompatibleComponent(
    originalComponentId: string,
    targetStyleId: string,
  ): string | null {
    const originalComp = this.experience.configManager.getComponentById(originalComponentId)
    if (!originalComp) return null

    if (originalComp.styleId === targetStyleId) return originalComponentId

    // JAVÍTÁS: Típus kényszerítése (ComponentConfig[]), hogy a TS tudja, mik a mezők
    const storeComponents = this.experience.configStore.components
    const candidates = Object.values(storeComponents).flat() as ComponentConfig[]

    const target = candidates.find(
      (c) =>
        c.componentType === originalComp.componentType &&
        c.styleId === targetStyleId &&
        c.properties?.width === originalComp.properties?.width &&
        c.properties?.height === originalComp.properties?.height &&
        this.getOrientation(c.id) === this.getOrientation(originalComp.id),
    )

    return target ? target.id : null
  }

  private getOrientation(id: string): string {
    if (id.includes('_l') || id.includes('left')) return 'left'
    if (id.includes('_r') || id.includes('right')) return 'right'
    return 'neutral'
  }

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore
    const experienceStore = this.experience.experienceStore

    console.log('[StateManager] Watcherek inicializálása...')

    // 1. GLOBÁLIS ANYAG
    watch(
      () => this.experience.settingsStore.globalMaterialSettings,
      async (newSettings) => {
        console.log('[StateManager] Globális anyagok változtak...', newSettings)
        this.materialCache.clear()
        for (const obj of experienceStore.placedObjects) {
          await this.applyMaterialsToObject(obj)
        }
      },
      { deep: true },
    )

    // 2. GLOBÁLIS STÍLUS
    watch(
      () => this.experience.settingsStore.globalComponentSettings,
      async (newSettings) => {
        console.log('[StateManager] Globális stílus változott...', newSettings)

        for (const obj of experienceStore.placedObjects) {
          let needsRebuild = false
          const newState = { ...obj.userData.componentState }

          for (const [slotId, compId] of Object.entries(newState)) {
            const comp = this.experience.configManager.getComponentById(compId)
            if (!comp) continue

            const catKey = comp.category || ''
            const typeKey = comp.componentType || ''

            // JAVÍTÁS: Ellenőrizzük, hogy string-e az érték
            const rawStyleId = newSettings[catKey] || newSettings[typeKey]
            const targetStyleId = typeof rawStyleId === 'string' ? rawStyleId : undefined

            if (targetStyleId && comp.styleId !== targetStyleId) {
              const newCompId = this.findCompatibleComponent(compId, targetStyleId)
              if (newCompId) {
                newState[slotId] = newCompId
                needsRebuild = true
              }
            }
          }

          if (needsRebuild) {
            console.log(
              `[StateManager] Bútor (${obj.userData.config?.name}) frissítése új stílusra...`,
            )
            await this.experience.rebuildObject(obj, newState)
          }
        }
      },
      { deep: true },
    )

    // 3. LOKÁLIS ANYAG
    watch(
      () => selectionStore.materialChangeRequest,
      async (request) => {
        if (!request) return
        const { targetUUID, slotId, materialId } = request
        const targetObject = experienceStore.getObjectByUUID(targetUUID)

        if (targetObject) {
          const newMaterialState = { ...targetObject.userData.materialState, [slotId]: materialId }
          targetObject.userData.materialState = newMaterialState
          await this.applyMaterialsToObject(targetObject)
          this.experience.historyStore.addState()
        }
        selectionStore.acknowledgeMaterialChange()
      },
      { deep: true },
    )

    // 4. STÍLUS CSERE
    watch(
      () => selectionStore.styleChangeRequest,
      async (request) => {
        if (!request) return
        const { targetUUID, slotId, newStyleId } = request
        const targetObject = experienceStore.getObjectByUUID(targetUUID)

        if (targetObject) {
          const newComponentState = {
            ...targetObject.userData.componentState,
            [slotId]: newStyleId,
          }
          await this.experience.rebuildObject(targetObject, newComponentState)
          this.experience.historyStore.addState()
        }
        selectionStore.acknowledgeStyleChange()
      },
      { deep: true },
    )

    // 5. TÖRLÉS
    watch(
      () => selectionStore.objectToDeleteUUID,
      (uuidToDelete) => {
        if (!uuidToDelete) return
        if (this.experience.interactionManager) {
          this.experience.interactionManager.handleDelete()
        }
        selectionStore.acknowledgeDeletion()
      },
    )

    // 6. DUPLIKÁLÁS
    watch(
      () => selectionStore.objectToDuplicateUUID,
      async (uuidToDuplicate) => {
        if (!uuidToDuplicate) return
        const originalObject = experienceStore.getObjectByUUID(uuidToDuplicate)
        if (!originalObject) return

        try {
          const config = JSON.parse(JSON.stringify(originalObject.userData.config))
          const componentState = JSON.parse(
            JSON.stringify(originalObject.userData.componentState || {}),
          )
          const materialState = JSON.parse(
            JSON.stringify(originalObject.userData.materialState || {}),
          )

          const newObject = await this.experience.assetManager.buildFurnitureFromConfig(
            config,
            componentState,
          )

          newObject.userData.config = config
          newObject.userData.materialState = materialState

          await this.applyMaterialsToObject(newObject)

          if (this.experience.interactionManager) {
            this.experience.interactionManager.startDraggingDuplicatedObject(newObject)
          } else {
            newObject.position.copy(originalObject.position).addScalar(0.2)
            this.experience.scene.add(newObject)
            this.experience.experienceStore.addObject(newObject)
            this.experience.selectionStore.selectObject(newObject)
          }
        } catch (error) {
          console.error('[StateManager] Hiba a duplikálásnál:', error)
        }
        selectionStore.acknowledgeDuplication()
      },
    )
  }
}
