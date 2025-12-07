import type Experience from '../Experience'
import type { FurnitureConfig, ComponentConfig } from '@/config/furniture'

export default class SmartSwapManager {
  private experience: Experience

  constructor(experience: Experience) {
    this.experience = experience
  }

  /**
   * ÚJ GLOBÁLIS STÍLUS (KOMPONENS) FRISSÍTÉS
   * Végigmegy a bútorokon, és ha talál olyan slotot, ami érintett a szabályban,
   * megpróbálja kicserélni a komponenst egy megfelelő méretű variációra.
   */
  public async updateGlobalComponents(groupId: string, variantId: string) {
    console.log(`--- [updateGlobalComponents] START (${groupId} -> ${variantId}) ---`)

    // 1. Megkeressük a szabályt és a variációt
    const groupConfig = this.experience.configStore.globalGroups.find((g) => g.id === groupId)
    if (!groupConfig || !groupConfig.style.enabled) {
      console.warn('Group not found or style disabled')
      return
    }

    const variant = groupConfig.style.variants.find((v) => v.id === variantId)
    if (!variant) {
      console.warn('Variant not found')
      return
    }

    const candidateComponentIds = variant.componentIds
    console.log('Candidates:', candidateComponentIds)

    // 2. Végigmegyünk minden bútoron
    const furnitureObjects = [...this.experience.experienceStore.placedObjects]

    for (const furnitureGroup of furnitureObjects) {
      const config = furnitureGroup.userData.config as FurnitureConfig
      const componentState = JSON.parse(JSON.stringify(furnitureGroup.userData.componentState))
      let needsRebuild = false

      // 3. Végigmegyünk a slotokon
      for (const slot of config.componentSlots) {
        const currentComponentId = componentState[slot.slotId]
        if (!currentComponentId) continue

        const currentComponent = this.experience.configStore.getComponentById(currentComponentId)
        if (!currentComponent) continue

        // DEBUG LOG
        console.log(
          `Checking Slot: ${slot.slotId} | Targets: ${groupConfig.targets.join(', ')} | SlotType: ${slot.componentType} | CompType: ${currentComponent.componentType}`,
        )

        // JAVÍTÁS: Ellenőrizzük a Slot típusát ÉS a Komponens típusát is!
        const isTarget =
          groupConfig.targets.includes(slot.componentType) ||
          groupConfig.targets.includes(currentComponent.componentType)

        if (isTarget) {
          // --- SMART SWAP LOGIKA ---
          const bestMatchId = this.findBestMatchingComponent(
            currentComponent,
            candidateComponentIds,
          )

          if (bestMatchId) {
            if (bestMatchId !== currentComponentId) {
              console.log(
                `✅ MATCH! Csere: ${currentComponent.name} -> ${bestMatchId} (Slot: ${slot.slotId})`,
              )
              componentState[slot.slotId] = bestMatchId
              needsRebuild = true
            } else {
              console.log(`ℹ️ Már a jó komponens van bent: ${bestMatchId}`)
            }
          } else {
            console.warn(
              `❌ Nem találtam megfelelő méretű párt ehhez: ${currentComponent.name} (${currentComponent.properties?.width}x${currentComponent.properties?.height}) a variációban.`,
            )
          }
        }
      }

      // 4. Ha történt változás, újraépítjük a bútort
      if (needsRebuild) {
        console.log('Rebuilding object...')
        await this.experience.rebuildObject(furnitureGroup, componentState)
        await this.experience.updateGlobalMaterials()
      }
    }
    console.log('--- [updateGlobalComponents] END ---')
  }

  /**
   * Segédfüggvény a megfelelő méretű komponens megtalálásához
   */
  private findBestMatchingComponent(
    original: ComponentConfig,
    candidates: string[],
  ): string | null {
    const origProps = original.properties || {}
    const origWidth = origProps.width || 0
    const origHeight = origProps.height || 0

    // JAVÍTÁS: Biztonsági fallback. Ha nincs componentType, használjuk az ID-t, vagy üres stringet.
    const type = (original.componentType || original.id || '').toLowerCase()
    const origOrient = this.getOrientation(original.id)

    // 1. KÍSÉRLET: PONTOS EGYEZÉS (Szélesség ÉS Magasság + Orientáció)
    // Ez kritikus az Ajtóknak és Fiókoknak
    for (const id of candidates) {
      const candidate = this.experience.configStore.getComponentById(id)
      if (!candidate) continue
      const candProps = candidate.properties || {}
      const candOrient = this.getOrientation(candidate.id)

      const widthMatch = Math.abs((candProps.width || 0) - origWidth) < 2 // 2mm tolerancia
      const heightMatch = Math.abs((candProps.height || 0) - origHeight) < 2

      // Orientáció ellenőrzés (csak ha ellentétes, akkor baj)
      if (origOrient === 'left' && candOrient === 'right') continue
      if (origOrient === 'right' && candOrient === 'left') continue

      if (widthMatch && heightMatch) {
        return id // Megvan a tökéletes pár!
      }
    }

    // 2. KÍSÉRLET: CSAK MAGASSÁG (Lábaknak)
    // A lábaknál a szélesség stílus kérdése, a magasság a lényeg.
    if (type.includes('leg') || type.includes('lab')) {
      for (const id of candidates) {
        const candidate = this.experience.configStore.getComponentById(id)
        if (!candidate) continue
        const candProps = candidate.properties || {}

        // Kicsit nagyobb tolerancia (5mm)
        if (Math.abs((candProps.height || 0) - origHeight) < 5) {
          return id
        }
      }
    }

    // 3. KÍSÉRLET: FALLBACK (Fogantyúk és Lábak)
    // Ha Fogantyúról vagy Lábról van szó, és nem találtunk méret egyezést,
    // akkor feltételezzük, hogy a felhasználó bármi áron cserélni akar.
    if (
      type.includes('handle') ||
      type.includes('fogantyu') ||
      type.includes('leg') ||
      type.includes('lab')
    ) {
      if (candidates.length > 0) {
        console.log(`⚠️ Méret nem egyezik, de fallback alkalmazva (${type}): ${candidates[0]}`)
        return candidates[0] ?? null
      }
    }

    return null
  }

  private getOrientation(id: string): 'left' | 'right' | 'neutral' {
    if (!id) return 'neutral'
    const lowerId = id.toLowerCase()
    if (lowerId.endsWith('_l') || lowerId.includes('_left') || lowerId.includes('bal'))
      return 'left'
    if (lowerId.endsWith('_r') || lowerId.includes('_right') || lowerId.includes('jobb'))
      return 'right'
    return 'neutral'
  }
}
