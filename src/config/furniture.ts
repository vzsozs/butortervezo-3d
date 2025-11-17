// src/config/furniture.ts

// --- ÚJ, TISZTA DEFINÍCIÓ EGY CSATLAKOZÁSI PONTHOZ ---
// Ezt használja a components.json
export interface AttachmentPoint {
  id: string;
  allowedComponentTypes: string[];
}

// --- KOMPONENS DEFINÍCIÓ FRISSÍTÉSE ---
export interface ComponentConfig {
  id: string;
  name: string;
  model: string;
  materialTarget?: string;
  materialSource?: string;
  price: number;
  height?: number;
  // A RÉGI TÍPUS HELYETT EZ KELL: egy tömb, ami AttachmentPoint objektumokat tartalmaz
  attachmentPoints?: AttachmentPoint[];
}

export interface PropertyConfig {
  id: string;
  label: string;
  type: 'select' | 'checkbox' | 'number';
  options?: { label: string; value: string | number }[];
  defaultValue: string | number | boolean;
  // És bármi más, ami egy property-hez kellhet
  [key: string]: string | number | boolean | undefined | { label: string; value: string | number }[];
}


export interface ComponentSlotConfig {
  slotId: string;
  name: string;
  componentType: string;
  defaultComponent: string;
  allowedComponents: string[];
  attachToSlot?: string;
  useAttachmentPoint?: string;
  attachmentMapping?: Record<string, string[]>;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  // JAVÍTÁS: Az 'any' helyett egy konkrétabb típust használunk
  properties?: PropertyConfig[];
  isOptional?: boolean;
}

// --- A TÖBBI DEFINÍCIÓ VALÓSZÍNŰLEG VÁLTOZATLAN ---
export interface FurnitureConfig {
  id: string;
  name: string;
  category: string;
  componentSlots: ComponentSlotConfig[];
  price?: number;
}

export interface ComponentDatabase {
  [key: string]: ComponentConfig[];
}

export interface GlobalSettingConfig {
  id: string;
  name: string;
  type: string;
  targetSlotId: string;
  options?: string[];
}