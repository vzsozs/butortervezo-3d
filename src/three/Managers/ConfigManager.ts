// src/three/Managers/ConfigManager.ts

import type { FurnitureConfig, ComponentConfig } from '@/config/furniture';

export default class ConfigManager {
  private furnitureList: FurnitureConfig[] = [];
  private components: Record<string, ComponentConfig> = {};

  constructor() {}

  public async loadData() {
    try {
      const [furnitureResponse, componentsResponse] = await Promise.all([
        fetch('/database/furniture.json'),
        fetch('/database/components.json')
      ]);

      if (!furnitureResponse.ok || !componentsResponse.ok) {
        throw new Error('Hiba az adatbázis fájlok betöltése közben.');
      }

      this.furnitureList = await furnitureResponse.json();
      this.components = await componentsResponse.json();

      console.log('Adatbázis sikeresen betöltve.', {
        furniture: this.furnitureList.length,
        components: Object.keys(this.components).length
      });

    } catch (error) {
      console.error('Nem sikerült betölteni a konfigurációs fájlokat:', error);
    }
  }

  public getFurnitureList(): FurnitureConfig[] {
    return this.furnitureList;
  }

  public getFurnitureById(id: string): FurnitureConfig | undefined {
    return this.furnitureList.find(f => f.id === id);
  }

  public getComponentById(id: string): ComponentConfig | undefined {
    return this.components[id];
  }
}