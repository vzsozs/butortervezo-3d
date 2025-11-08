// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed } from 'vue'
import type { FurnitureConfig } from '@/config/furniture' // Feltételezve, hogy a típus exportálva van

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

  // ######################################################################
  // ###                         JAVÍTOTT RÉSZ                          ###
  // ######################################################################
  // Nincs többé keresgélés! Közvetlenül a 3D objektumból olvassuk ki a configot,
  // amit az AssetManager építéskor beletett.
  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig;
    }
    return null;
  })

  function selectObject(object: Group | null) {
    // A te logikád tökéletes, a proxy-t kapja meg és tárolja el.
    selectedObject.value = object
  }

  function clearSelection() {
    selectedObject.value = null
  }

  // A "kérelem/nyugtázás" logika a többi függvénynél változatlan és jó.
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
    acknowledgeStyleChange,
  }
})