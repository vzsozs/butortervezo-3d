// --- INTERFACE DEFINÍCIÓK (VÁLTOZATLANOK) ---
export interface StyleOption {
  id: string;
  name: string;
  targetMesh: string;
  inheritsMaterialFrom?: string;
  materialTarget?: string;
}

export interface ComponentSlot {
  id: string;
  name: string;
  type: 'style' | 'material' | 'material_and_style';
  styleOptions?: StyleOption[];
  materialTarget?: string; 
}

export interface FurnitureConfig {
  id: string;
  name: string;
  modelUrl: string;
  componentSlots: ComponentSlot[];
}

export interface FurnitureCategory {
  id: string;
  name: string;
  items: FurnitureConfig[];
}

// --- ADATBÁZIS (JAVÍTOTT TÍPUSSAL ÉS STRUKTÚRÁVAL) ---
export const furnitureDatabase: FurnitureCategory[] = [
  {
    id: 'also_szekrenyek',
    name: 'Alsó szekrények',
    items: [
      {
        id: 'also_szekreny_60',
        name: 'Alsó szekrény 60cm',
        modelUrl: '/models/szekreny_alap.glb',
        componentSlots: [
          {
            id: 'front',
            name: 'Front',
            type: 'material_and_style',
            materialTarget: 'MAT_Frontok',
            styleOptions: [
              { id: 'sima', name: 'Sima Ajtó', targetMesh: 'Ajto_Sima' },
              { id: 'keretes', name: 'Keretes Ajtó', targetMesh: 'Ajto_Keretes' },
            ],
          },
          {
            id: 'korpusz',
            name: 'Korpusz',
            type: 'material',
            materialTarget: 'MAT_Korpusz',
          },
          {
            id: 'lab',
            name: 'Láb',
            type: 'style',
            styleOptions: [
              { id: 'standard_lab', name: 'Bútorlap Láb', targetMesh: 'Labazat_Standard', inheritsMaterialFrom: 'korpusz' },
              { id: 'design_lab', name: 'Fém Láb', targetMesh: 'Labazat_Cso', materialTarget: 'MAT_Fem_Kiegeszitok' },
            ],
          },
          {
            id: 'fogantyu',
            name: 'Fogantyú',
            type: 'style',
            materialTarget: 'MAT_Fem_Kiegeszitok',
            styleOptions: [
              { id: 'standard_fogantyu', name: 'Hosszúkás', targetMesh: 'Fogantyu_hosszukas' },
              { id: 'gomb_fogantyu', name: 'Cylinder', targetMesh: 'Fogantyu_cylinder' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'felso_szekrenyek',
    name: 'Felső szekrények',
    items: [
      {
        id: 'felso_szekreny_15',
        name: 'Felső szekrény 15cm',
        modelUrl: '/models/15x60-full_alsokonyha.glb',
        componentSlots: [
          {
            id: 'front',
            name: 'Front',
            type: 'material_and_style',
            materialTarget: 'MAT_Frontok',
            styleOptions: [
              { id: 'sima', name: 'Sima Ajtó', targetMesh: 'Ajto_Sima' },
              { id: 'ajtonelkul', name: 'Ajtó Nélküli', targetMesh: 'Ajto_Sima' }, // Figyelem: ez a targetMesh lehet, hogy nem jó
            ],
          },
          {
            id: 'korpusz',
            name: 'Korpusz',
            type: 'material',
            materialTarget: 'MAT_Korpusz',
          },
          {
            id: 'lab',
            name: 'Láb',
            type: 'style',
            styleOptions: [
              { id: 'standard_lab', name: 'Bútorlap Láb', targetMesh: 'Labazat_Standard', inheritsMaterialFrom: 'korpusz' },
              { id: 'design_lab', name: 'Fém Láb', targetMesh: 'Labazat_Cso', materialTarget: 'MAT_Fem_Kiegeszitok' },
            ],
          },
          {
            id: 'fogantyu',
            name: 'Fogantyú',
            type: 'style',
            materialTarget: 'MAT_Fem_Kiegeszitok',
            styleOptions: [
              { id: 'standard_fogantyu', name: 'Hosszúkás', targetMesh: 'Fogantyu_hosszukas' },
              { id: 'gomb_fogantyu', name: 'Cylinder', targetMesh: 'Fogantyu_cylinder' },
            ],
          },
        ],
      },
    ],
  },
];

// --- GLOBÁLIS ANYAGOK (VÁLTOZATLAN) ---
export const globalMaterials = {
  front: {
    id: 'front',
    name: 'Frontok',
    type: 'material',
    materialTarget: 'MAT_Frontok',
  },
  korpusz: {
    id: 'korpusz',
    name: 'Korpuszok',
    type: 'material',
    materialTarget: 'MAT_Korpusz',
  },
  munkalap: {
    id: 'munkalap',
    name: 'Munkalap',
    type: 'material',
    materialTarget: 'MAT_Munkapult',
  },
  fem_kiegeszitok: {
    id: 'fem_kiegeszitok',
    name: 'Fém Kiegészítők',
    type: 'material',
    materialTarget: 'MAT_Fem_Kiegeszitok',
  }
};