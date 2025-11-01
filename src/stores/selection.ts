import { defineStore } from 'pinia'
import type * as THREE from 'three'
import { ref } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  
  const selectedObject = ref<THREE.Group | null>(null)
  // JAVÍTÁS: Most már csak az objektum UUID-jét (egy stringet) tároljuk
  const objectToDeleteUUID = ref<string | null>(null)

  function selectObject(object: THREE.Group | null) {
    selectedObject.value = object
    console.log('Pinia store frissítve, új kiválasztott objektum:', selectedObject.value)
  }

  function clearSelection() {
    selectedObject.value = null
    console.log('Pinia store: Kijelölés megszüntetve.')
  }

  function deleteSelectedObject() {
    if (selectedObject.value) {
      console.log('Pinia store: Törlési kérelem érkezett a következő UUID-re:', selectedObject.value.uuid)
      // Az objektum helyett az UUID-jét adjuk át
      objectToDeleteUUID.value = selectedObject.value.uuid
      clearSelection()
    }
  }

  // ÚJ: Egy akció, amivel a HomeView jelezheti, hogy végzett a törléssel
  function acknowledgeDeletion() {
    objectToDeleteUUID.value = null
  }

  return { selectedObject, objectToDeleteUUID, selectObject, clearSelection, deleteSelectedObject, acknowledgeDeletion }
})