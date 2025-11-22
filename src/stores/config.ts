import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { FurnitureConfig, ComponentConfig, GlobalSettingConfig, ComponentDatabase } from '@/config/furniture'

export const useConfigStore = defineStore('config', () => {
  const furnitureList = ref<FurnitureConfig[]>([]);
  const components = ref<ComponentDatabase>({});
  const globalSettings = ref<GlobalSettingConfig[]>([]);

  // Ez a computed property tökéletes, marad
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

  const availableFamilies = computed(() => {
    const families = new Set<string>();
    
    // Végignézzük az összes kategóriát és komponenst
    for (const categoryKey in components.value) {
      const categoryList = components.value[categoryKey];
      if (Array.isArray(categoryList)) {
        categoryList.forEach(comp => {
          if (comp.familyId) {
            families.add(comp.familyId);
          }
        });
      }
    }
    // Ábécé sorrendbe rendezve adjuk vissza
    return Array.from(families).sort();
  });

  function getFamiliesForType(componentType: string): string[] {
    const families = new Set<string>();
    const comps = components.value[componentType];
    
    if (comps && Array.isArray(comps)) {
      comps.forEach(c => {
        if (c.familyId) {
          families.add(c.familyId);
        }
      });
    }
    return Array.from(families).sort();
  }

  // --- ÚJ ACTIONS: Global Settings Kezelés ---

  function addGlobalSetting(setting: GlobalSettingConfig) {
    globalSettings.value.push(setting);
  }

  function updateGlobalSetting(setting: GlobalSettingConfig) {
    const index = globalSettings.value.findIndex(s => s.id === setting.id);
    if (index !== -1) {
      globalSettings.value[index] = setting;
    }
  }

  function deleteGlobalSetting(settingId: string) {
    const index = globalSettings.value.findIndex(s => s.id === settingId);
    if (index !== -1) {
      globalSettings.value.splice(index, 1);
    }
  }

  // A setConfigs-t átalakítjuk egy központi betöltő függvénnyé
  async function loadAllData() {
    try {
      const [furnitureRes, componentsRes, globalSettingsRes] = await Promise.all([
        fetch('/database/furniture.json'),
        fetch('/database/components.json'),
        fetch('/database/globalSettings.json') // Feltételezve, hogy ez is létezik
      ]);
      furnitureList.value = await furnitureRes.json();
      components.value = await componentsRes.json();
      globalSettings.value = await globalSettingsRes.json();
      console.log('Adatbázis sikeresen betöltve a store-ba a központi helyről.');
    } catch (error) {
      console.error('Hiba a központi adatbázis betöltése közben:', error);
    }
  }

  // A meglévő getterek tökéletesek, maradnak
  function getComponentById(id: string): ComponentConfig | undefined {
    for (const categoryKey in components.value) {
      const categoryComponents = components.value[categoryKey];
      if (categoryComponents) {
        const component = categoryComponents.find(c => c.id === id);
        if (component) return component;
      }
    }
    return undefined;
  }

  function getFurnitureById(id: string): FurnitureConfig | undefined {
    return furnitureList.value.find(f => f.id === id);
  }

  // --- ÚJ ACTION-ÖK AZ ADMIN FELÜLETHEZ ---

  // Komponens hozzáadása
  function addComponent(type: string, component: ComponentConfig) {
    if (!components.value[type]) {
      components.value[type] = [];
    }
    components.value[type].push(component);
  }

  // Komponens frissítése
  function updateComponent(type: string, component: ComponentConfig) {
    const categoryComponents = components.value[type];
    if (!categoryComponents) return;
    const index = categoryComponents.findIndex(c => c.id === component.id);
    if (index !== -1) {
      categoryComponents[index] = component;
    }
  }

  // Komponens törlése
  function deleteComponent(type: string, componentId: string) {
    const categoryComponents = components.value[type];
    if (!categoryComponents) return;
    const index = categoryComponents.findIndex(c => c.id === componentId);
    if (index !== -1) {
      categoryComponents.splice(index, 1);
    }
  }

  // Bútor hozzáadása
  function addFurniture(furniture: FurnitureConfig) {
    furnitureList.value.push(furniture);
  }

  // Bútor frissítése
  function updateFurniture(furniture: FurnitureConfig) {
    const index = furnitureList.value.findIndex(f => f.id === furniture.id);
    if (index !== -1) {
      furnitureList.value[index] = furniture;
    }
  }

  // Bútor törlése
  function deleteFurniture(furnitureId: string) {
    const index = furnitureList.value.findIndex(f => f.id === furnitureId);
    if (index !== -1) {
      furnitureList.value.splice(index, 1);
    }
  }

  return {
    // Állapotok
    furnitureList,
    components,
    globalSettings,
    furnitureCategories,
    availableFamilies,
    // Action-ök
    getFamiliesForType, 
    addGlobalSetting,    
    updateGlobalSetting, 
    deleteGlobalSetting, 
    getComponentById,
    getFurnitureById,
    loadAllData, 
    addComponent,
    updateComponent,
    deleteComponent,
    addFurniture,
    updateFurniture,
    deleteFurniture,
  }
})