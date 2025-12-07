import { analyzeModel } from '@/three/Utils/ModelAnalyzer'
import type { ComponentConfig } from '@/config/furniture'

export function useComponentImport() {
  /**
   * Feldolgoz egy GLB fájlt és előállítja belőle a ComponentConfig-ot.
   * @param file A feltöltött GLB fájl
   * @param defaultType Alapértelmezett komponenstípus (pl. 'corpuses'), ha nincs megadva, a 'others' lesz.
   * @returns A generált ComponentConfig és a felismert anyagok listája
   */
  async function processGlbFile(
    file: File,
    defaultType: string = 'others',
  ): Promise<{ config: ComponentConfig; materialNames: string[] }> {
    try {
      // 1. Modell elemzése
      const analysis = await analyzeModel(file)

      // 2. Név generálás
      const rawName = file.name.replace(/\.glb$/i, '')
      const stylizedName = rawName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
      const safeFileName = rawName.toLowerCase().replace(/\s+/g, '_')

      // 3. Csatlakozási pontok típusának kitalálása (Heurisztika)
      const attachmentPoints = analysis.attachmentPointNames.map((name) => {
        const allowedTypes: string[] = []
        const lowerName = name.toLowerCase()

        if (lowerName.includes('shelf')) allowedTypes.push('shelves')
        if (lowerName.includes('leg')) allowedTypes.push('legs')
        if (lowerName.includes('front') || lowerName.includes('door')) allowedTypes.push('fronts')
        if (lowerName.includes('drawer')) allowedTypes.push('drawers')
        if (lowerName.includes('handle')) allowedTypes.push('handles')

        return { id: name, allowedComponentTypes: allowedTypes }
      })

      // 4. Config összeállítása
      const config: ComponentConfig = {
        id: '', // Az ID-t később generáljuk vagy a felhasználó adja meg
        name: stylizedName,
        componentType: defaultType,
        model: `/models/${defaultType}/${safeFileName}`, // Feltételezett útvonal
        materialTarget: analysis.materialNames[0] || '',
        materialOptions: analysis.materialNames,
        properties: {
          width: analysis.width ? Math.round(analysis.width * 1000) : 0,
          height: analysis.height ? Math.round(analysis.height * 1000) : 0,
          depth: analysis.depth ? Math.round(analysis.depth * 1000) : 0,
        },
        attachmentPoints: attachmentPoints,
        price: 0, // Alapértelmezett ár
      }

      return { config, materialNames: analysis.materialNames }
    } catch (error) {
      console.error('❌ Hiba a GLB feldolgozása közben:', error)
      throw new Error('Nem sikerült feldolgozni a modellt.')
    }
  }

  return {
    processGlbFile,
  }
}
