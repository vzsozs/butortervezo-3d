// src/config/furniture.ts

// --- TÍPUSOK ---

// Ezt a típust használja a StateManager és az InspectorPanel
export interface StyleOption {
  id: string;
  name: string;
  targetMesh: string;
  inheritsMaterialFrom?: string;
  materialTarget?: string;
}

// A 'components.json' fájlban lévő slotok leírása
export interface ComponentSlotConfig {
  id: string;
  name: string;
  attachmentPoint?: string;
  attachmentPoints?: string[];
  defaultOption: string;
  options: string[];
}

// A 'components.json' fájlban lévő fő objektumok leírása
export interface ComponentConfig {
  name: string;
  modelUrl?: string;
  modelUrl_L?: string;
  modelUrl_R?: string;
  isSymmetric: boolean;
  slots: ComponentSlotConfig[];
  height?: number;
}

// A 'furniture.json' fájlban lévő slotok leírása
export interface FurnitureSlotConfig {
  id: string;
  name: string;
  attachmentPoint?: string;
  attachmentPoints?: string[];
  defaultOption: string;
  options: string[];
  materialTarget?: string;
  // A styleOptions valójában nem létezik a JSON-ban, az 'options' tömb van helyette.
  // De ha a jövőben használni akarod, itt a helye:
  // styleOptions?: StyleOption[]; 
}

// A 'furniture.json' fájlban lévő fő objektumok leírása
export interface FurnitureConfig {
  id: string;
  name: string;
  category: string;
  baseModelUrl: string;
  slots: FurnitureSlotConfig[];
}

export interface FurnitureCategory {
  id: string;
  name: string;
  items: FurnitureConfig[];
}

// --- GLOBÁLIS ANYAGOK ---
export const globalMaterials = {
  front: { id: 'front', name: 'Frontok', type: 'material', materialTarget: 'MAT_Frontok' },
  korpusz: { id: 'korpusz', name: 'Korpuszok', type: 'material', materialTarget: 'MAT_Korpusz' },
  munkalap: { id: 'munkalap', name: 'Munkalap', type: 'material', materialTarget: 'MAT_Munkapult' },
  fem_kiegeszitok: { id: 'fem_kiegeszitok', name: 'Fém Kiegészítők', type: 'material', materialTarget: 'MAT_Fem_Kiegeszitok' }
};