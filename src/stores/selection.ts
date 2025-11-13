// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed } from 'vue'
import type { FurnitureConfig } from '@/config/furniture'

export const useSelectionStore = defineStore('selection', () => {
  
  const selectedObject = ref<Group | null>(null)
  const objectToDeleteUUID = ref<string | null>(null)
  const objectToDuplicateUUID = ref<string | null>(null)

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

  // --- ÚJ REAKTÍV VÁLTOZÓ ---
  const propertyChangeRequest = ref<{
    targetUUID: string;
    slotId: string;
    propertyId: string;
    newValue: string | boolean | number;
  } | null>(null)
  // --- EDDIG TART AZ ÚJ VÁLTOZÓ ---

  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig;
    }
    return null;
  })

  function selectObject(object: Group | null) {
    selectedObject.value = object
  }

  function clearSelection() {
    selectedObject.value = null
  }

  // ... a delete és duplicate függvények változatlanok ...
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
      objectToDuplicateUUID.value = selectedObject.value.uuid;
    }
  }

  function acknowledgeDuplication() {
    objectToDuplicateUUID.value = null;
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

  function changeStyle(slotId: string, newStyleId: string) {
    if (selectedObject.value) {
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

  // --- ÚJ FÜGGVÉNYEK ---
  function changeProperty(slotId: string, propertyId: string, newValue: string | boolean | number) {
    if (selectedObject.value) {
      propertyChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        propertyId,
        newValue,
      }
    }
  }

  function acknowledgePropertyChange() {
    propertyChangeRequest.value = null
  }
  // --- EDDIG TARTANAK AZ ÚJ FÜGGVÉNYEK ---

  return { 
    selectedObject, 
    selectedObjectConfig,
    objectToDeleteUUID, 
    materialChangeRequest,
    styleChangeRequest,
    objectToDuplicateUUID,
    propertyChangeRequest, // <-- Ezt is add hozzá a return-höz!
    duplicateSelectedObject,
    acknowledgeDuplication,
    selectObject, 
    clearSelection, 
    deleteSelectedObject, 
    acknowledgeDeletion,
    changeMaterial,
    acknowledgeMaterialChange,
    changeStyle,
    acknowledgeStyleChange,
    changeProperty, // <-- Ezt is add hozzá a return-höz!
    acknowledgePropertyChange, // <-- Ezt is add hozzá a return-höz!
  }
})