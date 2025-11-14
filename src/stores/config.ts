// src/stores/config.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
// A típus definíciókat is frissíteni kell majd, de a store működni fog
import type { FurnitureConfig, ComponentConfig, GlobalSettingConfig } from '@/config/furniture'

// ÚJ, SPECIFIKUSABB TÍPUS AZ ÚJ JSON STRUKTÚRÁHOZ
export type ComponentDatabase = Record<string, ComponentConfig[]>

export const useConfigStore = defineStore('config', () => {
  const furnitureList = ref<FurnitureConfig[]>([]);
  // JAVÍTÁS: A components típusa és alapértelmezett értéke megváltozott
  const components = ref<ComponentDatabase>({});
  const globalSettings = ref<GlobalSettingConfig[]>([]);

  // A furnitureCategories logikája maradhat, az jó.
  const furnitureCategories = computed(() => {
    // ... (ez a rész nem változik, de a teljesség kedvéért itt hagyom)
    const categories: Record<string, { name: string, items: FurnitureConfig[] }> = {
      'bottom_cabinets': { name: 'Alsó szekrények', items: [] },
      'top_cabinets': { name: 'Felső szekrények', items: [] },
    };
    for (const furniture of furnitureList.value) {
      const category = categories[furniture.category];
      if (category) {
        category.items.push(furniture);
      }
    }
    return Object.values(categories).filter(c => c.items.length > 0);
  });

  function setConfigs(data: {
    furniture: FurnitureConfig[],
    // JAVÍTÁS: A `components` paraméter típusa itt is frissül
    components: ComponentDatabase,
    globalSettings: GlobalSettingConfig[]
  }) {
    furnitureList.value = data.furniture;
    components.value = data.components;
    globalSettings.value = data.globalSettings;
  }

  function fillWithTestData() {
    console.log('[Pinia Action] fillWithTestData meghívva!');
    components.value = {
      "test_corpus": [
        { "id": "test_corpus_1", "name": "Teszt Korpusz 1", model: '' }
      ],
      "test_front": [
        { "id": "test_front_1", "name": "Teszt Front 1", model: '' },
        { "id": "test_front_2", "name": "Teszt Front 2", model: '' }
      ]
    };
    console.log('[Pinia Action] A store state frissítve:', components.value);
  }


  // JAVÍTÁS: A getComponentById logikája teljesen átírva az új struktúrához
  function getComponentById(id: string): ComponentConfig | undefined {
    for (const categoryKey in components.value) {
      const categoryComponents = components.value[categoryKey];
      
      // JAVÍTÁS: Ellenőrizzük, hogy a kategória létezik-e, mielőtt használnánk
      if (categoryComponents) {
        const component = categoryComponents.find(c => c.id === id);
        if (component) {
          return component;
        }
      }
    }
    return undefined;
  }

  function getFurnitureById(id: string): FurnitureConfig | undefined {
    return furnitureList.value.find(f => f.id === id);
  }

  return {
    furnitureList,
    components,
    globalSettings,
    furnitureCategories,
    setConfigs,
    getComponentById,
    getFurnitureById,
    fillWithTestData 
  }
})