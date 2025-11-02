import { defineStore } from 'pinia'
import type * as THREE from 'three'
import { ref, computed } from 'vue'
import { furnitureDatabase, type FurnitureConfig } from '@/config/furniture'

export const useSelectionStore = defineStore('selection', () => {
  
  const selectedObject = ref<THREE.Group | null>(null)
  const objectToDeleteUUID = ref<string | null>(null)

  const materialChangeRequest = ref<{
    targetUUID: string;
    slotId: string; 
    materialId: string;
  } | null>(null)

  const styleChangeRequest = ref<{
    targetUUID: string;
    slotId: string;
    newStyleId: string;
  } | null>(null)

  const selectedObjectConfig = computed<FurnitureConfig | undefined>(() => {
    if (!selectedObject.value) return undefined
    const furnitureId = selectedObject.value.name
    return furnitureDatabase.find(f => f.id === furnitureId)
  })

  function selectObject(object: THREE.Group | null) {
    selectedObject.value = object
  }

  function clearSelection() {
    selectedObject.value = null
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

  function changeMaterial(slotId: string, materialId: string) {

    console.log('changeMaterial akció meghívva. A selectedObject:', selectedObject.value);

    if (selectedObject.value) {
      console.log(`Kérelem generálása... Slot: ${slotId}, Anyag: ${materialId}`);

      materialChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        materialId,
      }
    }
    else {
    console.warn('Anyagváltási kísérlet, de nincs kiválasztott objektum!');
  }
  }

  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  function changeStyle(slotId: string, newStyleId: string) {
    if (selectedObject.value) {
      console.log(`Pinia store: Stílusváltási kérelem a(z) '${selectedObject.value.name}' objektum '${slotId}' slotjára, új stílus: '${newStyleId}'`)
      styleChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        newStyleId,
      }
    }
  }

  function acknowledgeStyleChange() {
    styleChangeRequest.value = null
  }

  return { 
    selectedObject, 
    selectedObjectConfig,
    objectToDeleteUUID, 
    materialChangeRequest,
    styleChangeRequest,
    selectObject, 
    clearSelection, 
    deleteSelectedObject, 
    acknowledgeDeletion,
    changeMaterial,
    acknowledgeMaterialChange,
    changeStyle,
    acknowledgeStyleChange,
  }
})