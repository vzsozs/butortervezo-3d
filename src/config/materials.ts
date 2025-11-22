// Definiáljuk, hogy milyen tulajdonságai lehetnek egy anyagnak
export interface MaterialConfig {
  id: string // Egyedi azonosító
  name: string // Megjelenítendő név
  type?: 'color' | 'texture'
  value?: string
  color?: string // HEX színkód, ha nincs textúra (legacy)
  textureUrl?: string // Opcionális textúra útvonala (legacy)
  category?: string | string[]
  properties?: {
    roughness?: number
    metalness?: number
  }
  roughness?: number // Legacy
  metalness?: number // Legacy
}

// Létrehozzuk az elérhető anyagok listáját
// Ezt a fájlt már nem használjuk, helyette a public/database/materials.json-t töltjük be.
// Meghagyjuk referenciának, amíg teljesen át nem állunk.
export const availableMaterials: MaterialConfig[] = []
