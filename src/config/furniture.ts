// src/config/furniture.ts

// --- ÚJ, LETISZTULT TÍPUSOK ---

/**
 * Egyetlen választható alkatrész (pl. egy fogantyú, egy front) leírása.
 * Ez a 'components.json' egy elemének felel meg.
 */
export interface ComponentConfig {
  id: string;
  name: string;
  model: string;
  materialTarget?: string; // Melyik material slot-ot célozza a 3D modellben
  materialSource?: 'corpus'; // Speciális szabály: anyagot örököl (pl. bútorlap láb)
  height?: number;
  price?: number;
  attachmentPoints?: Record<string, string | string[]>; 
}

/**
 * Egy bútoron belüli "hely" (slot) leírása, ahova komponens kerülhet.
 * Pl. "front", "handle", "legs".
 */
export interface ComponentSlotConfig {
  slotId: string;
  name:string;
  componentType: string; // Milyen típusú komponenst keresünk a components.json-ben (pl. "fronts")
  allowedComponents: string[]; // Mely konkrét komponens ID-k jöhetnek szóba
  defaultComponent: string;
  isOptional?: boolean; // A felhasználó kikapcsolhatja-e (pl. fogantyú)
  attachmentPoints?: Record<string, string | string[]>;  // Hova csatlakozik a 3D-ben
  properties?: PropertyConfig[]; // Extra, dinamikus beállítások (pl. nyitásirány)
  attachToSlot?: string; 
  rotation?: { x: number; y: number; z: number };
}

/**
 * Egy dinamikus property leírása (pl. egy select opció a panelen).
 */
export interface PropertyConfig {
  id: string;
  name: string;
  type: 'select' | 'checkbox' | 'number';
  options?: { value: string; label: string }[];
  defaultValue: string | boolean | number;
}

/**
 * Egy teljes bútor "receptjének" leírása.
 * Ez a 'furniture.json' egy elemének felel meg.
 */
export interface FurnitureConfig {
  id: string;
  name: string;
  category: string;
  componentSlots: ComponentSlotConfig[]; // A régi 'slots' és 'baseModelUrl' helyett
  price?: number;
}

/**
 * A globalSettings.json egy elemének leírása.
 */
export interface GlobalSettingConfig {
  id: string;
  name: string;
  type: 'material' | 'style';
  targetSlotId: string;
  options?: string[];
}