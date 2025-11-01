import { defineStore } from 'pinia'
import type * as THREE from 'three'
import { ref } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  
  const selectedObject = ref<THREE.Group | null>(null)
  // JAVÍTÁS: Most már csak az objektum UUID-jét (egy stringet) tároljuk
  const objectToDeleteUUID = ref<string | null>(null)

  // ÚJ: Egy "esemény" jelző az anyagváltáshoz.
  // A ref értéke egy objektum lesz, ami tartalmazza a cél-objektum UUID-jét,
  // a cél-rész nevét (pl. 'ajto'), és az új anyag ID-jét.
  const materialChangeRequest = ref<{
    targetUUID: string;
    meshName: string;
    materialId: string;
  } | null>(null)

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

   // ÚJ: Anyagváltás akció
  function changeMaterial(meshName: string, materialId: string) {
    if (selectedObject.value) {
      console.log(`Pinia store: Anyagváltási kérelem a(z) '${selectedObject.value.name}' objektum '${meshName}' részére, új anyag: '${materialId}'`)
      materialChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        meshName,
        materialId,
      }
    }
  }

  // ÚJ: "Kézfogás" akció az anyagváltás után
  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  return { 
    selectedObject, 
    objectToDeleteUUID, 
    materialChangeRequest, // Ezt is visszaadjuk
    selectObject, 
    clearSelection, 
    deleteSelectedObject, 
    acknowledgeDeletion,
    changeMaterial, // Ezt is
    acknowledgeMaterialChange, // Ezt is
  }
})