// src/config/furniture.ts

// --- ÚJ, TISZTA DEFINÍCIÓ EGY CSATLAKOZÁSI PONTHOZ ---
// Ezt használja a components.json
export interface AttachmentPoint {
  id: string
  allowedComponentTypes: string[]
}

// --- KOMPONENS DEFINÍCIÓ FRISSÍTÉSE ---
export interface ComponentConfig {
  id: string
  name: string
  model: string
  familyId?: string
  materialTarget?: string
  materialSource?: string
  price: number
  height?: number
  materialOptions?: string[]
  attachmentPoints?: AttachmentPoint[]
  allowedMaterialCategories?: string[]
}

export interface PropertyConfig {
  id: string
  label: string
  type: 'select' | 'checkbox' | 'number'
  options?: { label: string; value: string | number }[]
  defaultValue: string | number | boolean
  // És bármi más, ami egy property-hez kellhet
  [key: string]: string | number | boolean | undefined | { label: string; value: string | number }[]
}

export interface ComponentSlotConfig {
  slotId: string
  name: string
  componentType: string
  defaultComponent: string | null
  allowedComponents: string[]
  attachToSlot?: string
  useAttachmentPoint?: string
  attachmentMapping?: Record<string, string[]>
  rotation?: {
    x: number
    y: number
    z: number
  }
  properties?: PropertyConfig[]
  isOptional?: boolean
  children?: ComponentSlotConfig[]
}

export interface Schema {
  id: string
  name: string
  apply: Record<string, string | null>
}

export interface SlotGroup {
  groupId: string
  name: string
  controlType: 'schema_select'
  controlledSlots: string[]
  schemas: Schema[]
}

export interface FurnitureConfig {
  id: string
  name: string
  category: string
  componentSlots: ComponentSlotConfig[]
  slotGroups?: SlotGroup[]
  price?: number
  height?: number
}

export interface ComponentDatabase {
  [key: string]: ComponentConfig[]
}

export interface GlobalSettingConfig {
  id: string
  name: string
  type: string
  targetSlotId: string
  options?: string[]
  allowedMaterialCategories?: string[]
}

export interface MaterialConfig {
  id: string
  name: string
  category: string | string[]
  type: 'color' | 'texture'
  value: string
  properties?: {
    roughness?: number
    metalness?: number
    [key: string]: any
  }
}
