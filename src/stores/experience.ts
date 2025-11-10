// src/stores/experience.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type Experience from '@/three/Experience';
import type { Group } from 'three';
import { useConfigStore } from './config'; // Importáljuk a config store-t

export const useExperienceStore = defineStore('experience', () => {
  // --- MEGLÉVŐ ÁLLAPOT ---
  const instance = ref<Experience | null>(null);

  // --- ÚJ ÁLLAPOT ---
  // Itt tároljuk a teljes, kiszámolt árat. Kezdetben 0.
  const totalPrice = ref(0);

  // === ÚJ REAKTÍV ÁLLAPOT ===
  const placedObjects = ref<Group[]>([]);

  function setExperience(experienceInstance: Experience | null) {
    instance.value = experienceInstance;
  }

  // === ÚJ AKCIÓ A LISTA FRISSÍTÉSÉRE ===
  function updatePlacedObjects(objects: Group[]) {
    // A .slice() egy sekély másolatot készít, ami garantálja a reaktivitás frissülését
    placedObjects.value = objects.slice();
  }

  // --- ÚJ AKCIÓ ---
  // Ez a függvény végzi a piszkos munkát.
  // Paraméterként megkapja a 3D jelenetben lévő összes bútor listáját.
  function calculateTotalPrice() { // <-- A paramétert kivesszük, mert már a store-ban van a lista
    const configStore = useConfigStore();
    let newTotal = 0;

    // 1. Végigmegyünk az összes lehelyezett bútoron
    for (const furniture of placedObjects.value) {
      if (!furniture.userData.config || !furniture.userData.componentState) continue;

      // 2. Hozzáadjuk a bútor (korpusz) alapárát a furniture.json-ból
      const furnitureConfig = configStore.getFurnitureById(furniture.userData.config.id);
      if (furnitureConfig?.price) {
        newTotal += furnitureConfig.price;
      }

      // 3. Végigmegyünk a bútorhoz kiválasztott komponenseken
      const componentState = furniture.userData.componentState;
      for (const slotId in componentState) {
        const componentId = componentState[slotId];
        if (componentId) {
          const componentConfig = configStore.getComponentById(componentId);
          if (componentConfig?.price) {
            
            // 4. SPECIÁLIS KEZELÉS: Darabszám (pl. lábak)
            // Megnézzük, a slotnak van-e több 'attachmentPoints'-a.
            // Ha igen, az árát annyival szorozzuk. Ha nem, akkor 1-gyel.
            const slotConfig = furnitureConfig?.slots.find(s => s.id === slotId);
            const quantity = slotConfig?.attachmentPoints?.length || 1;

            newTotal += componentConfig.price * quantity;
          }
        }
      }
    }
    
    // 5. Frissítjük a store állapotát az új, kiszámolt értékkel
    totalPrice.value = newTotal;
    console.log(`Ár újraszámolva: ${newTotal} Ft`);
  }

  return { 
    instance, 
    totalPrice,
    placedObjects, // <-- Elérhetővé tesszük
    setExperience, 
    calculateTotalPrice,
    updatePlacedObjects // <-- Elérhetővé tesszük
  };
});