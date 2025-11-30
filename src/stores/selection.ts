// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed, shallowRef } from 'vue'
import type { FurnitureConfig } from '@/config/furniture'
import { useExperienceStore } from './experience'
import Experience from '@/three/Experience'

export const useSelectionStore = defineStore('selection', () => {
  const experienceStore = useExperienceStore()

  // ShallowRef fontos a Three.js objektumoknál a teljesítmény miatt
  const selectedObject = shallowRef<Group | null>(null)

  const objectToDeleteUUID = ref<string | null>(null)
  const objectToDuplicateUUID = ref<string | null>(null)

  const materialChangeRequest = ref<{
    targetUUID: string
    slotId: string
    materialId: string
  } | null>(null)

  const styleChangeRequest = ref<{
    targetUUID: string
    slotId: string
    newStyleId: string
  } | null>(null)

  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig
    }
    return null
  })

  function selectObject(object: Group | null) {
    selectedObject.value = object

    // JAVÍTÁS: A transformControls a Camera osztályban van!
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
      materialChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        materialId,
      }
    }
  }

  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  // --- JAVÍTOTT CHANGE STYLE (Komponens csere) ---
  async function changeStyle(slotId: string, newComponentId: string) {
    if (!selectedObject.value) return

    console.log(`[SelectionStore] Stílus csere: ${slotId} -> ${newComponentId}`)

    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )
    currentComponentState[slotId] = newComponentId

    await rebuildObjectWithNewState(currentComponentState)
  }

  // --- JAVÍTOTT APPLY SCHEMA (Layout váltás) ---
  async function applySchema(groupIndex: number, schemaId: string) {
    if (!selectedObject.value || !selectedObjectConfig.value) return

    const group = selectedObjectConfig.value.slotGroups?.[groupIndex]
    if (!group) return

    // JAVÍTÁS: Eslint disable törölve
    const schema = group.schemas.find((s: any) => s.id === schemaId)
    if (!schema) return

    console.log(`[SelectionStore] Séma alkalmazása: ${schema.name}`)

    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )

    Object.entries(schema.apply).forEach(([slotId, componentId]) => {
      if (componentId) {
        currentComponentState[slotId] = componentId
      } else {
        delete currentComponentState[slotId]
      }
    })

    await rebuildObjectWithNewState(currentComponentState)
  }

  // --- SEGÉDFÜGGVÉNY: AZ ÚJRAÉPÍTÉS LOGIKÁJA ---
  async function rebuildObjectWithNewState(newComponentState: any) {
    if (!selectedObject.value) return

    const experience = Experience.getInstance()
    const originalObject = selectedObject.value
    const parent = originalObject.parent

    if (!parent) {
      console.error('[SelectionStore] Az objektumnak nincs szülője, nem cserélhető!')
      return
    }

    // JAVÍTÁS: Itt is a Camera-n érjük el a controls-t
    experience.camera.transformControls.detach()

    const config = originalObject.userData.config
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
      await experience.stateManager.applyMaterialsToObject(newObject)

      newObject.position.copy(position)
      newObject.rotation.copy(rotation)

      parent.remove(originalObject)
      parent.add(newObject)

      experience.experienceStore.replaceObject(uuidToReplace, newObject)

      selectObject(newObject)

      console.log('[SelectionStore] Objektum sikeresen cserélve és regisztrálva.')
    } catch (error) {
      console.error('[SelectionStore] Hiba az objektum cseréjénél:', error)
      // JAVÍTÁS: Hiba esetén visszacsatolás a régire
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
