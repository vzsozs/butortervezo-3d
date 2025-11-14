// src/three/Managers/ConfigManager.ts

import { useConfigStore } from '@/stores/config';
import type { FurnitureConfig, ComponentConfig } from '@/config/furniture';

class ConfigManager {
  // Statikus property a példány tárolására
  private static instance: ConfigManager;

  // A konstruktort priváttá tesszük, hogy kívülről ne lehessen példányosítani
  private constructor() {}

  // Statikus metódus a példány elérésére
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public async loadData() {
    // --- HOZZÁADNI ---
    // A store-t közvetlenül a metódusban kérjük el.
    const configStore = useConfigStore();
    try {
      const [furnitureResponse, componentsResponse, globalSettingsResponse] = await Promise.all([
        fetch('/database/furniture.json'),
        fetch('/database/components.json'),
        fetch('/database/globalSettings.json')
      ]);
      if (!furnitureResponse.ok || !componentsResponse.ok || !globalSettingsResponse.ok) {
        throw new Error('Hiba az adatbázis fájlok betöltése közben.');
      }
      const furniture = await furnitureResponse.json();
      const components = await componentsResponse.json();
      const globalSettings = await globalSettingsResponse.json();
      configStore.setConfigs({ furniture, components, globalSettings });
      console.log('Adatbázis sikeresen betöltve a store-ba a központi helyről.');
    } catch (error) {
      console.error('Nem sikerült betölteni a konfigurációs fájlokat:', error);
    }
  }

  // A get metódusok is maradhatnak
  public getFurnitureById(id: string): FurnitureConfig | undefined {
    const configStore = useConfigStore();
    return configStore.furnitureList.find(f => f.id === id);
  }

  public getComponentById(id:string): ComponentConfig | undefined {
    const configStore = useConfigStore();
    return configStore.getComponentById(id);
  }
}

// Exportáljuk a singleton példányt
export default ConfigManager.getInstance();