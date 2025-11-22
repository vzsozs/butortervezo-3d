// src/three/Managers/ConfigManager.ts

import { useConfigStore } from '@/stores/config'
import type { FurnitureConfig, ComponentConfig } from '@/config/furniture'

/**
 * A ConfigManager egy "híd" a Three.js világ és a Pinia store között.
 * Singletonként működik, hogy a Three.js kódbázis bármely pontjáról
 * könnyen elérhessük a központi állapotkezelő (Pinia) adatait anélkül,
 * hogy a Vue reaktivitási rendszerét közvetlenül importálnánk.
 *
 * FONTOS: Ez az osztály NEM tárol saját állapotot vagy cache-t.
 * Minden adatlekérdezést azonnal a Pinia store-hoz delegál,
 * így mindig a legfrissebb adatokat adja vissza.
 */
class ConfigManager {
  private static instance: ConfigManager

  private constructor() {
    // A konstruktor üres, mivel nincs mit inicializálni.
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * Lekér egy bútorkonfigurációt ID alapján a Pinia store-ból.
   * @param id A bútor egyedi azonosítója.
   * @returns A megtalált FurnitureConfig vagy undefined.
   */
  public getFurnitureById(id: string): FurnitureConfig | undefined {
    // Közvetlenül a store-ból kérjük le az adatot.
    return useConfigStore().getFurnitureById(id)
  }

  /**
   * Lekér egy komponenst ID alapján a Pinia store-ból.
   * @param id A komponens egyedi azonosítója.
   * @returns A megtalált ComponentConfig vagy undefined.
   */
  public getComponentById(id: string): ComponentConfig | undefined {
    // Közvetlenül a store-ból kérjük le az adatot.
    return useConfigStore().getComponentById(id)
  }

  /**
   * Lekér egy anyagot ID alapján a Pinia store-ból.
   * @param id Az anyag egyedi azonosítója.
   * @returns A megtalált MaterialConfig vagy undefined.
   */
  public getMaterialById(id: string): import('@/config/furniture').MaterialConfig | undefined {
    return useConfigStore().getMaterialById(id)
  }
}

// Exportáljuk a singleton példányt, hogy mindenhol ugyanazt használjuk.
export default ConfigManager.getInstance()
