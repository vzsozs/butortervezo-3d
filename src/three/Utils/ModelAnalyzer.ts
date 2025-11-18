import { Box3, Group, Material, Object3D } from 'three';
import { GLTFLoader } from 'three-stdlib';

export interface ModelAnalysisResult {
  object: Group;
  height: number;
  materialNames: string[];
  attachmentPointNames: string[];
}

const loader = new GLTFLoader();

export async function analyzeModel(file: File): Promise<ModelAnalysisResult> {
  const localUrl = URL.createObjectURL(file);

  try {
    const gltf = await loader.loadAsync(localUrl);
    const object = gltf.scene;

    // 1. Magasság kiszámítása
    const box = new Box3().setFromObject(object);
    const height = parseFloat((box.max.y - box.min.y).toFixed(4));

    // 2. Anyagnevek kinyerése
    const materialNames = new Set<string>();
    object.traverse((child: Object3D) => {
      if ('material' in child && child.material instanceof Material) {
        materialNames.add(child.material.name);
      }
    });

    // 3. Csatlakozási pontok kinyerése
    const attachmentPointNames = new Set<string>();
    object.traverse((child: Object3D) => {
      // Dummy objektumokat keresünk, amiknek a neve 'attach_' prefixszel kezdődik
      if (child.name.startsWith('attach_')) {
        attachmentPointNames.add(child.name);
      }
    });

    return {
      object,
      height,
      materialNames: Array.from(materialNames).filter(name => name), // Üres neveket kiszűrjük
      attachmentPointNames: Array.from(attachmentPointNames),
    };
  } finally {
    // Fontos: A memóriaszivárgás elkerülése érdekében a helyi URL-t mindig fel kell szabadítani
    URL.revokeObjectURL(localUrl);
  }
}