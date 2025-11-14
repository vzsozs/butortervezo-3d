// src/config/furniture.ts

// --- VÉGLEGES, EGYESÍTETT TÍPUSOK ---

/**
 * Egy komponens csatolási pontjait definiálja. Szigorúan csak 'self' VAGY 'multiple' lehet.
 */
export type AttachmentPoints = { self?: string } | { multiple?: string[] };

/**
 * Egy komponens forgatási korrekcióját definiálja.
 */
export interface SlotRotation {
  x: number;
  y: number;
  z: number;
}

/**
 * Egyetlen választható alkatrész (pl. egy fogantyú, egy front) leírása.
 * Ez a 'components.json' egy elemének felel meg.
 */
export interface ComponentConfig {
  id: string;
  name: string;
  model: string;
  price?: number;
  materialTarget?: string;
  height?: number;
  materialSource?: 'corpus';
  attachmentPoints?: AttachmentPoints; // A szigorúbb típus használata
}

/**
 * A teljes components.json adatbázis típusa.
 */
export type ComponentDatabase = Record<string, ComponentConfig[]>;

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
 * Egy bútoron belüli "hely" (slot) leírása, ahova komponens kerülhet.
 */
export interface ComponentSlotConfig {
  slotId: string;
  name: string;
  componentType: string;
  allowedComponents: string[];
  defaultComponent: string;
  attachToSlot?: string;
  isOptional?: boolean;
  attachmentPoints?: AttachmentPoints; // A szigorúbb típus használata
  rotation?: SlotRotation;
  properties?: PropertyConfig[];
}

/**
 * Egy teljes bútor "receptjének" leírása.
 * Ez a 'furniture.json' egy elemének felel meg.
 */
export interface FurnitureConfig {
  id: string;
  name: string;
  category: string;
  componentSlots: ComponentSlotConfig[];
  price?: number; // Ezt a mezőt a te verziódból vettem át
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