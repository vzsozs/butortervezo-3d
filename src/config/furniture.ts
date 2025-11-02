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
        materialTarget: 'MAT_Frontok',
        styleOptions: [
          // JAVÍTÁS: A targetMesh-ek most már a te neveidet használják, a felesleges prefix/suffix nélkül
          { id: 'sima', name: 'Sima Ajtó', targetMesh: 'Ajto_Sima' },
          { id: 'keretes', name: 'Keretes Ajtó', targetMesh: 'Ajto_Keretes' },
          // { id: '3fiokos', name: '3 Fiókos', targetMesh: 'Sima_3fiokos_front' }, // Kikommentezve, amíg nincs ilyen
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
];