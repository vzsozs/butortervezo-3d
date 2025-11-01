// Definiáljuk a lehetséges opciókat
export interface StyleOption {
  id: string; // Egyedi azonosító
  name: string; // Megjelenő név
  targetMesh: string; // A 3D modellben keresendő név-részlet
  inheritsMaterialFrom?: string; // Melyik slot ID-jétől örököl? (opcionális)
  materialTarget?: string;     // Saját, dedikált anyag-slotja van? (opcionális)
}

// Definiáljuk a konfigurálható részeket (slotokat)
export interface ComponentSlot {
  id: string;
  name: string;
  type: 'style' | 'material' | 'material_and_style';
  styleOptions?: StyleOption[];
  // JAVÍTÁS: Tegyük ezt a tulajdonságot is opcionálissá
  materialTarget?: string; 
}

// Definiáljuk a teljes bútor konfigurációját
export interface FurnitureConfig {
  id: string; // A bútor egyedi azonosítója
  name: string; // Megjelenő név
  modelUrl: string; // A .glb fájl útvonala
  componentSlots: ComponentSlot[];
}

// Az "adatbázisunk": egy lista a bútorainkról
export const furnitureDatabase: FurnitureConfig[] = [
  {
    id: 'also_szekreny_60',
    name: 'Alsó szekrény 60cm',
    modelUrl: '/models/szekreny_alap.glb',
    componentSlots: [
      {
        id: 'front',
        name: 'Front',
        type: 'material_and_style',
        materialTarget: 'MAT_Frontok', // Az ajtó és fiók anyag-slotja
        styleOptions: [
          { id: 'sima', name: 'Sima Ajtó', targetMesh: 'MESH_Ajto_Sima_Balos' },
          { id: 'keretes', name: 'Keretes Ajtó', targetMesh: 'MESH_Ajto_Keretes_Balos' },
          { id: '3fiokos', name: '3 Fiókos', targetMesh: 'MESH_Sima_3fiokos_front' },
        ],
      },
      {
        id: 'korpusz',
        name: 'Korpusz',
        type: 'material', // Csak az anyaga változtatható
        materialTarget: 'MAT_Korpusz',
        // Nincsenek styleOptions, mert a korpusz formája fix
      },
      {
        id: 'lab',
        name: 'Láb',
        type: 'style', // A típust 'style'-ra változtatjuk, mert a színt máshonnan kapja
        styleOptions: [
          { id: 'standard_lab', name: 'Standard Láb', targetMesh: 'MESH_Labazat_Standard', inheritsMaterialFrom: 'korpusz' },
          { id: 'design_lab', name: 'Design Láb', targetMesh: 'MESH_Labazat_Cso', materialTarget: 'MAT_Fem_Kiegeszitok' },
        ],
      },
      {
        id: 'fogantyu',
        name: 'Fogantyú',
        type: 'style', // Csak a stílusa (modellje) változtatható, az anyaga a 'Láb'-bal közös
        materialTarget: 'MAT_Fem_Kiegeszitok',
        styleOptions: [
          { id: 'standard_fogantyu', name: 'Standard Fogantyú', targetMesh: 'MESH_Fogantyu_hosszukas' },
          { id: 'gomb_fogantyu', name: 'Gomb Fogantyú', targetMesh: 'MESH_Fogantyu_cylinder' },
        ],
      },
    ],
  },
  // Ide jöhet a jövőben a többi bútor definíciója...
  // {
  //   id: 'felso_szekreny_80',
  //   name: 'Felső szekrény 80cm',
  //   ...
  // }
];

// Létrehozunk egy dedikált részt a globális anyagoknak is
export const globalMaterials = {
  munkalap: {
    id: 'munkalap',
    name: 'Munkalap',
    type: 'material',
    materialTarget: 'MAT_Munkalap',
  },
  fem_kiegeszitok: {
    id: 'fem_kiegeszitok',
    name: 'Fém Kiegészítők',
    type: 'material',
    materialTarget: 'MAT_Fem_Kiegeszitok',
  }
}