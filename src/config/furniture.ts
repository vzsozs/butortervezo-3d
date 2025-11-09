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
  materialTarget?: string;
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
  price?: number; 
  materialTarget?: string;
  inheritsMaterialFrom?: string;
  attachmentPoint?: string; // JAVÍTÁS: Ez a sor hiányzott!
}

// A 'furniture.json' fájlban lévő slotok leírása
export interface FurnitureSlotConfig {
  id: string;
  name: string;
  attachmentPoint?: string;
  attachmentPoints?: string[];
  defaultOption?: string; // JAVÍTÁS: A '?' jel jelzi, hogy ez a mező nem kötelező
  options?: string[]; // Ezt is opcionálissá tesszük, mert a korpusznak nincs
  materialTarget?: string;
  meshTarget?: string; // Ezt is tegyük be a biztonság kedvéért
}

// A 'furniture.json' fájlban lévő fő objektumok leírása
export interface FurnitureConfig {
  id: string;
  name: string;
  category: string;
  baseModelUrl: string;
  price?: number;
  slots: FurnitureSlotConfig[];
}

export interface FurnitureCategory {
  id: string;
  name: string;
  items: FurnitureConfig[];
}

// ÚJ: A globalSettings.json egy elemének leírása
export interface GlobalSettingConfig {
  id: string;
  name: string;
  type: 'material' | 'style';
  targetSlotId: string;
  options?: string[];
}

// --- GLOBÁLIS ANYAGOK ---
export const globalMaterials = {
  front: { id: 'front', name: 'Frontok', type: 'material', materialTarget: 'MAT_Frontok' },
  korpusz: { id: 'korpusz', name: 'Korpuszok', type: 'material', materialTarget: 'MAT_Korpusz' },
  munkalap: { id: 'munkalap', name: 'Munkalap', type: 'material', materialTarget: 'MAT_Munkapult' },
  fem_kiegeszitok: { id: 'fem_kiegeszitok', name: 'Fém Kiegészítők', type: 'material', materialTarget: 'MAT_Fem_Kiegeszitok' }
};