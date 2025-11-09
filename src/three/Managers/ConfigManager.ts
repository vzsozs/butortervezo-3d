// src/three/Managers/ConfigManager.ts

import { useConfigStore } from '@/stores/config';
import type { FurnitureConfig, ComponentConfig } from '@/config/furniture';

export default class ConfigManager {
  // JAVÍTÁS: A ConfigManager most már a store-t használja, nem tárol adatot
  private configStore = useConfigStore();

  constructor() {}

  public async loadData() {
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

      this.configStore.setConfigs({ furniture, components, globalSettings });
      console.log('Adatbázis sikeresen betöltve a store-ba.');

    } catch (error) {
      console.error('Nem sikerült betölteni a konfigurációs fájlokat:', error);
    }
  }

  // A get metódusok most már a store-ból olvasnak
  public getFurnitureById(id: string): FurnitureConfig | undefined {
    return this.configStore.furnitureList.find(f => f.id === id);
  }

  public getComponentById(id: string): ComponentConfig | undefined {
    return this.configStore.getComponentById(id);
  }
}