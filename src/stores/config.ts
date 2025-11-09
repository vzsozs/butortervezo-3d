// src/stores/config.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { FurnitureConfig, ComponentConfig, GlobalSettingConfig } from '@/config/furniture'

export const useConfigStore = defineStore('config', () => {
  const furnitureList = ref<FurnitureConfig[]>([]);
  const components = ref<Record<string, ComponentConfig>>({});
  const globalSettings = ref<GlobalSettingConfig[]>([]);

  const furnitureCategories = computed(() => {
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
    components: Record<string, ComponentConfig>,
    globalSettings: GlobalSettingConfig[]
  }) {
    furnitureList.value = data.furniture;
    components.value = data.components;
    globalSettings.value = data.globalSettings;
  }

  function getComponentById(id: string): ComponentConfig | undefined {
    return components.value[id];
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
    getFurnitureById 
  }
})