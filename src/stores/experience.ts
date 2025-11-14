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

  // 1. Végigmegyünk az összes lehelyezett bútoron
  for (const furniture of placedObjects.value) {
    if (!furniture.userData.componentState) continue;

    const componentState = furniture.userData.componentState;
    // 2. Végigmegyünk a bútorhoz kiválasztott komponenseken
    for (const slotId in componentState) {
      const componentId = componentState[slotId];
      if (componentId) {
        const componentConfig = configStore.getComponentById(componentId);
        if (componentConfig?.price) {
          // 3. Meghatározzuk a darabszámot
          // A mennyiséget a komponens configjából vesszük!
          const quantity = componentConfig.attachmentPoints?.multiple?.length || 1;
          newTotal += componentConfig.price * quantity;
        }
      }
    }
  }
  
  totalPrice.value = newTotal;
  console.log(`Ár újraszámolva: ${newTotal} Ft`);
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