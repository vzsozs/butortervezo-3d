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
      if (!furniture.userData.config || !furniture.userData.componentState) continue;

      const furnitureConfig = configStore.getFurnitureById(furniture.userData.config.id);
      
      // JAVÍTÁS: A bútor alapárát a korpusz komponensből vesszük, ha van
      const corpusSlot = furnitureConfig?.componentSlots.find(s => s.slotId === 'corpus');
      if (corpusSlot) {
        const corpusId = furniture.userData.componentState[corpusSlot.slotId];
        const corpusConfig = configStore.getComponentById(corpusId);
        if (corpusConfig?.price) {
          newTotal += corpusConfig.price;
        }
      }

      const componentState = furniture.userData.componentState;
      for (const slotId in componentState) {
        if (slotId === 'corpus') continue; // A korpuszt már számoltuk

        const componentId = componentState[slotId];
        if (componentId) {
          const componentConfig = configStore.getComponentById(componentId);
          if (componentConfig?.price) {
            const slotConfig = furnitureConfig?.componentSlots.find(s => s.slotId === slotId);
            const quantity = slotConfig?.attachmentPoints?.multiple?.length || 1;
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