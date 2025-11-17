// src/stores/experience.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue'; // computed importálása
import type Experience from '@/three/Experience';
import type { Group } from 'three';
import { useConfigStore } from './config';

export const useExperienceStore = defineStore('experience', () => {
  const instance = ref<Experience | null>(null);
  const totalPrice = ref(0);
  const placedObjects = ref<Group[]>([]);

  // --- ÚJ GETTER ---
  const getObjectByUUID = computed(() => {
    return (uuid: string) => placedObjects.value.find(obj => obj.uuid === uuid);
  });

  function setExperience(experienceInstance: Experience | null) {
    instance.value = experienceInstance;
  }

  function updatePlacedObjects(objects: Group[]) {
    placedObjects.value = objects.slice();
  }

  // --- ÚJ ACTION-ÖK ---
  function addObject(newObject: Group) {
    placedObjects.value.push(newObject);
  }

  function replaceObject(oldUUID: string, newObject: Group) {
    const index = placedObjects.value.findIndex(obj => obj.uuid === oldUUID);
    if (index !== -1) {
      placedObjects.value[index] = newObject;
      // A reaktivitás biztosításához, ha a tömb elemeit cseréljük
      placedObjects.value = [...placedObjects.value];
    }
  }
  
  function calculateTotalPrice() {
    const configStore = useConfigStore();
    let newTotal = 0;

    for (const furniture of placedObjects.value) {
      if (!furniture.userData.componentState) continue;
      const componentState = furniture.userData.componentState;

      for (const slotId in componentState) {
        const componentId = componentState[slotId];
        if (!componentId) continue;
        
        const componentConfig = configStore.getComponentById(componentId);
        if (!componentConfig?.price) continue;

        let quantity = 1;
        // JAVÍTOTT LOGIKA: Speciális eset a lábakra
        if (slotId === 'leg') {
          const corpusId = componentState['corpus']; // Megkeressük a korpuszt
          if (corpusId) {
            const corpusConfig = configStore.getComponentById(corpusId);
            // Megszámoljuk, hány 'legs' típusú pontot kínál fel a korpusz
            quantity = corpusConfig?.attachmentPoints?.filter(p => p.allowedComponentTypes.includes('legs')).length || 1;
          }
        }
        newTotal += componentConfig.price * quantity;
      }
    }
    totalPrice.value = newTotal; // Feltételezve, hogy a totalPrice egy ref
  }

  return { 
    instance, 
    totalPrice,
    placedObjects,
    getObjectByUUID, // <-- Elérhetővé tesszük
    setExperience, 
    calculateTotalPrice,
    updatePlacedObjects,
    addObject, // <-- Elérhetővé tesszük
    replaceObject, // <-- Elérhetővé tesszük
  };
});