// src/three/Utils/ModelAnalyzer.ts
import { Box3, Group, Object3D } from 'three'
import { GLTFLoader } from 'three-stdlib'

export interface ModelAnalysisResult {
  object: Group
  width: number // ÚJ
  height: number
  depth: number // ÚJ
  materialNames: string[]
  attachmentPointNames: string[]
}

const loader = new GLTFLoader()

export async function analyzeModel(file: File): Promise<ModelAnalysisResult> {
  const localUrl = URL.createObjectURL(file)

  try {
    const gltf = await loader.loadAsync(localUrl)
    const object = gltf.scene

    // 1. Méretek kiszámítása (Bounding Box)
    const box = new Box3().setFromObject(object)

    // Kiszámoljuk mindhárom dimenziót
    const width = parseFloat((box.max.x - box.min.x).toFixed(4))
    const height = parseFloat((box.max.y - box.min.y).toFixed(4))
    const depth = parseFloat((box.max.z - box.min.z).toFixed(4))

    // 2. Anyagnevek kinyerése
    const materialNames = new Set<string>()
    object.traverse((child: Object3D) => {
      // Ellenőrizzük, hogy van-e material tulajdonsága és az Material típusú-e
      // (TypeScript miatt a 'in' operátoros ellenőrzés biztonságosabb)
      if ('material' in child) {
        const mat = (child as any).material
        if (Array.isArray(mat)) {
          mat.forEach((m) => materialNames.add(m.name))
        } else if (mat && mat.name) {
          materialNames.add(mat.name)
        }
      }
    })

    // 3. Csatlakozási pontok kinyerése
    const attachmentPointNames = new Set<string>()
    object.traverse((child: Object3D) => {
      // Dummy objektumokat keresünk, amiknek a neve 'attach_' prefixszel kezdődik
      if (child.name.startsWith('attach_')) {
        attachmentPointNames.add(child.name)
      }
    })

    return {
      object,
      width, // ÚJ
      height,
      depth, // ÚJ
      materialNames: Array.from(materialNames).filter((name) => name), // Üres neveket kiszűrjük
      attachmentPointNames: Array.from(attachmentPointNames),
    }
  } finally {
    // Fontos: A memóriaszivárgás elkerülése érdekében a helyi URL-t mindig fel kell szabadítani
    URL.revokeObjectURL(localUrl)
  }
}
