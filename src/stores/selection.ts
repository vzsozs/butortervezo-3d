// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { FurnitureConfig, ComponentSlotConfig } from '@/config/furniture'
import Experience from '@/three/Experience'
import { useConfigStore } from '@/stores/config'

export const useSelectionStore = defineStore('selection', () => {
  const selectedObject = shallowRef<Group | null>(null)

  const objectToDeleteUUID = ref<string | null>(null)
  const objectToDuplicateUUID = ref<string | null>(null)

  const materialChangeRequest = ref<{
    targetUUID: string
    slotId: string
    materialId: string
  } | null>(null)
  const styleChangeRequest = ref<{ targetUUID: string; slotId: string; newStyleId: string } | null>(
    null,
  )

  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig
    }
    return null
  })

  function selectObject(object: Group | null) {
    selectedObject.value = object
    triggerRef(selectedObject)
    const experience = Experience.getInstance()
    if (experience.camera && experience.camera.transformControls) {
      if (object) {
        experience.camera.transformControls.attach(object)
      } else {
        experience.camera.transformControls.detach()
      }
    }
  }

  function clearSelection() {
    selectObject(null)
  }
  function deleteSelectedObject() {
    if (selectedObject.value) {
      objectToDeleteUUID.value = selectedObject.value.uuid
      clearSelection()
    }
  }
  function acknowledgeDeletion() {
    objectToDeleteUUID.value = null
  }
  function duplicateSelectedObject() {
    if (selectedObject.value) {
      objectToDuplicateUUID.value = selectedObject.value.uuid
    }
  }
  function acknowledgeDuplication() {
    objectToDuplicateUUID.value = null
  }
  function changeMaterial(slotId: string, materialId: string) {
    if (selectedObject.value) {
      materialChangeRequest.value = { targetUUID: selectedObject.value.uuid, slotId, materialId }
    }
  }
  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  async function changeStyle(slotId: string, newComponentId: string) {
    if (!selectedObject.value) return
    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )
    currentComponentState[slotId] = newComponentId
    await rebuildObjectWithNewState(currentComponentState)
  }

  // --- 🔄 JAVÍTOTT LAYOUT VÁLTÁS (Config Patching) ---
  async function applySchema(groupIndex: number, schemaId: string) {
    if (!selectedObject.value || !selectedObjectConfig.value) return

    const configStore = useConfigStore()
    const group = selectedObjectConfig.value.slotGroups?.[groupIndex]
    if (!group) return

    // JAVÍTÁS: Kivettük a felesleges eslint-disable sort
    const schema = group.schemas.find((s: any) => s.id === schemaId)
    if (!schema) return

    console.group(`[SelectionStore] 🔄 LAYOUT VÁLTÁS: ${schema.name}`)

    // 1. ÁLLAPOT MÁSOLÁSA & TAKARÍTÁS
    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )
    const targetTypes = new Set<string>()

    if (schema.type) {
      if (schema.type === 'front') {
        targetTypes.add('fronts')
        targetTypes.add('handles')
        targetTypes.add('drawers')
      } else if (schema.type === 'drawer') {
        targetTypes.add('drawers')
        targetTypes.add('fronts')
        targetTypes.add('handles')
      } else if (schema.type === 'shelf') {
        targetTypes.add('shelves')
      } else if (schema.type === 'leg') {
        targetTypes.add('legs')
      }
    }

    Object.values(schema.apply).forEach((compId) => {
      if (compId) {
        const comp = configStore.getComponentById(compId as string)
        if (comp && comp.componentType) targetTypes.add(comp.componentType)
      }
    })

    Object.keys(currentComponentState).forEach((slotId) => {
      const currentCompId = currentComponentState[slotId]
      if (currentCompId) {
        const staticSlotDef = selectedObjectConfig.value?.componentSlots.find(
          (s) => s.slotId === slotId,
        )
        const compDef = configStore.getComponentById(currentCompId)

        // JAVÍTÁS: let -> const (prefer-const hiba javítva)
        const slotType = staticSlotDef?.componentType || compDef?.componentType

        if (slotType === 'corpuses') return

        if ((slotType && targetTypes.has(slotType)) || slotId.includes('attach_')) {
          // console.log(`🗑️ Törlés: ${slotId}`);
          delete currentComponentState[slotId]
        }
      }
    })

    // 2. ÚJ ELEMEK BEÍRÁSA
    Object.entries(schema.apply).forEach(([slotId, componentId]) => {
      if (componentId) currentComponentState[slotId] = componentId
    })

    // 3. 🛠️ CONFIG PATCHELÉS
    const newConfig = JSON.parse(JSON.stringify(selectedObjectConfig.value)) as FurnitureConfig
    const corpusSlot = newConfig.componentSlots.find((s) => s.componentType === 'corpuses')
    const corpusSlotId = corpusSlot ? corpusSlot.slotId : 'corpus_1'

    Object.keys(schema.apply).forEach((slotId) => {
      if (newConfig.componentSlots.find((s) => s.slotId === slotId)) return

      const parts = slotId.split('__')
      let attachTo = parts.slice(0, -1).join('__')
      const point = parts[parts.length - 1]

      if (attachTo === 'root') attachTo = corpusSlotId

      const compId = schema.apply[slotId]
      const compDef = configStore.getComponentById(compId as string)

      const newSlotDef: ComponentSlotConfig = {
        slotId: slotId,
        name: slotId,
        componentType: compDef?.componentType || 'unknown',
        allowedComponents: compId ? [compId as string] : [],
        defaultComponent: compId as string,
        attachToSlot: attachTo,
        useAttachmentPoint: point,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        isAutoGenerated: true,
      }

      if (schema.slotProperties && schema.slotProperties[slotId]) {
        Object.assign(newSlotDef, schema.slotProperties[slotId])
      }

      console.log(`✨ Új slot definíció beszúrva: ${slotId} -> ${attachTo} :: ${point}`)
      newConfig.componentSlots.push(newSlotDef)
    })

    console.log('Új állapot:', currentComponentState)
    console.groupEnd()

    // 4. Újraépítés az ÚJ configgal
    await rebuildObjectWithNewState(currentComponentState, newConfig)
  }

  // --- SEGÉDFÜGGVÉNY: ÚJRAÉPÍTÉS ---
  // JAVÍTÁS: Kivettük a felesleges eslint-disable sort
  async function rebuildObjectWithNewState(
    newComponentState: any,
    overrideConfig?: FurnitureConfig,
  ) {
    if (!selectedObject.value) return

    const experience = Experience.getInstance()
    const originalObject = selectedObject.value
    const parent = originalObject.parent

    if (!parent) return

    experience.camera.transformControls.detach()

    const config = overrideConfig || originalObject.userData.config

    const materialState = originalObject.userData.materialState
    const position = originalObject.position.clone()
    const rotation = originalObject.rotation.clone()
    const uuidToReplace = originalObject.uuid

    try {
      const newObject = await experience.assetManager.buildFurnitureFromConfig(
        config,
        newComponentState,
      )

      newObject.userData.materialState = materialState
      newObject.userData.config = config

      await experience.stateManager.applyMaterialsToObject(newObject)

      newObject.position.copy(position)
      newObject.rotation.copy(rotation)

      parent.remove(originalObject)
      parent.add(newObject)

      experience.experienceStore.replaceObject(uuidToReplace, newObject)
      selectObject(newObject)

      console.log('[SelectionStore] ✅ Objektum sikeresen cserélve.')
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba az objektum cseréjénél:', error)
      experience.camera.transformControls.attach(originalObject)
    }
  }

  return {
    selectedObject,
    selectedObjectConfig,
    objectToDeleteUUID,
    materialChangeRequest,
    styleChangeRequest,
    objectToDuplicateUUID,
    duplicateSelectedObject,
    acknowledgeDuplication,
    selectObject,
    clearSelection,
    deleteSelectedObject,
    acknowledgeDeletion,
    changeMaterial,
    acknowledgeMaterialChange,
    changeStyle,
    applySchema,
  }
})
