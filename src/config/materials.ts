// Definiáljuk, hogy milyen tulajdonságai lehetnek egy anyagnak
export interface MaterialConfig {
  id: string; // Egyedi azonosító
  name: string; // Megjelenítendő név
  color: string; // HEX színkód, ha nincs textúra
  textureUrl?: string; // Opcionális textúra útvonala (a 'public' mappából)
  roughness?: number; // Érdesség (0=tükör, 1=matt)
  metalness?: number; // Fémes jelleg (0=nem fém, 1=fém)
}

// Létrehozzuk az elérhető anyagok listáját
export const availableMaterials: MaterialConfig[] = [
  {
    id: 'white_laminate',
    name: 'Fehér laminált',
    color: '#FFFFFF',
    roughness: 0.8,
    metalness: 0.1,
  },
  {
    id: 'anthracite_matte',
    name: 'Antracit matt',
    color: '#343a40',
    roughness: 0.9,
    metalness: 0.1,
  },
  {
    id: 'oak_natural',
    name: 'Tölgy natúr',
    color: '#FFFFFF', // Alapszín, ha a textúra nem töltődne be
    textureUrl: '/textures/oak_natural_albedo.jpg', // Később ide jön a textúra útvonala
    roughness: 0.7,
  },
  {
    id: 'beech_light',
    name: 'Világos bükk',
    color: '#FFFFFF',
    textureUrl: '/textures/beech_light_albedo.jpg',
    roughness: 0.75,
  },
];