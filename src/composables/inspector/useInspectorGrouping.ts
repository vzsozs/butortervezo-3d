import { computed, type Ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useSelectionStore } from '@/stores/selection'
import { useProceduralStore } from '@/stores/procedural'
import {
  ComponentType,
  type ComponentSlotConfig,
  type ComponentConfig,
  type FurnitureConfig,
  type FurnitureStyle,
} from '@/config/furniture'

export interface InspectorControl {
  id: string
  label: string
  slots: ComponentSlotConfig[]
  referenceSlot: ComponentSlotConfig
  currentValue: string
  isGrouped: boolean

  // --- ÚJ: Multi-Material Slotok ---
  materialSlots?: {
    key: string // pl. "glass"
    label: string // pl. "Üveg"
    currentMaterialId: string
  }[]
}

export interface DisplayGroup {
  id: string
  label: string
  controls: InspectorControl[]
}

export interface GroupItem {
  slot: ComponentSlotConfig
  displayName: string
}

export function useInspectorGrouping(
  currentConfig: Ref<FurnitureConfig | null>,
  currentState: Ref<Record<string, string>>,
) {
  const configStore = useConfigStore()
  const selectionStore = useSelectionStore()
  const proceduralStore = useProceduralStore()

  function normalizeType(type: string | undefined): string {
    if (!type) return ComponentType.OTHER
    const t = type.toLowerCase()

    const map: Record<string, string> = {
      front: ComponentType.FRONT,
      fronts: ComponentType.FRONT,
      door: ComponentType.FRONT,
      doors: ComponentType.FRONT,
      drawer: ComponentType.DRAWER,
      drawers: ComponentType.DRAWER,
      leg: ComponentType.LEG,
      legs: ComponentType.LEG,
      handle: ComponentType.HANDLE,
      handles: ComponentType.HANDLE,
      shelf: ComponentType.SHELF,
      shelves: ComponentType.SHELF,
      corpus: ComponentType.CORPUS,
      corpuses: ComponentType.CORPUS,
    }
    return map[t] || ComponentType.OTHER
  }

  function generateNiceName(slotId: string, type: string): string {
    const cleanId = slotId.replace(/^(root__)?(attach_)?/, '').toLowerCase()
    let name = 'Elem'

    const typeNames: Record<string, string> = {
      [ComponentType.FRONT]: 'Ajtó',
      [ComponentType.HANDLE]: 'Fogantyú',
      [ComponentType.LEG]: 'Láb',
      [ComponentType.DRAWER]: 'Fiók',
      [ComponentType.SHELF]: 'Polc',
      [ComponentType.CORPUS]: 'Korpusz',
    }
    if (typeNames[type]) name = typeNames[type]

    const prefixes: string[] = []
    if (cleanId.includes('_l') || cleanId.includes('left') || cleanId.includes('bal'))
      prefixes.push('Bal')
    else if (cleanId.includes('_r') || cleanId.includes('right') || cleanId.includes('jobb'))
      prefixes.push('Jobb')

    if (cleanId.includes('vertical')) name += ' (Függ.)'
    else if (cleanId.includes('horizontal')) name += ' (Vízsz.)'

    const numberMatch = cleanId.match(/_(\d+)$/)
    if (numberMatch) prefixes.unshift(`${numberMatch[1]}.`)

    if (type === 'drawers' && cleanId.includes('front')) name = 'Fiókelőlap'

    return prefixes.length > 0 ? `${prefixes.join(' ')} ${name}` : name
  }

  function resolveGroupKey(slot: ComponentSlotConfig, activeComponentId: string): string {
    if (activeComponentId) {
      const comp = configStore.getComponentById(activeComponentId)
      if (comp?.componentType) {
        const group = normalizeType(comp.componentType)
        if (group !== ComponentType.OTHER) return group
      }
    }

    if (slot.componentType) {
      const group = normalizeType(slot.componentType)
      if (group !== ComponentType.OTHER) return group
    }

    const fullId = slot.slotId.toLowerCase()
    const localId = fullId.split('__').pop() || fullId

    if (localId.includes('handle') || localId.includes('fogantyu')) return ComponentType.HANDLE
    if (localId.includes('leg') || localId.includes('lab')) return ComponentType.LEG
    if (localId.includes('drawer') || localId.includes('fiok')) return ComponentType.DRAWER
    if (localId.includes('door') || localId.includes('front') || localId.includes('ajto'))
      return ComponentType.FRONT
    if (localId.includes('shelf') || localId.includes('polc')) return ComponentType.SHELF
    if (localId.includes('corpus') || localId.includes('korpusz')) return ComponentType.CORPUS

    return ComponentType.OTHER
  }

  const displayGroups = computed<DisplayGroup[]>(() => {
    const slots = currentConfig.value?.componentSlots ?? []
    const state = currentState.value || {}
    if (slots.length === 0) return []

    const rawGroups: Record<string, GroupItem[]> = {
      [ComponentType.CORPUS]: [],
      [ComponentType.FRONT]: [],
      [ComponentType.DRAWER]: [],
      [ComponentType.HANDLE]: [],
      [ComponentType.LEG]: [],
      [ComponentType.SHELF]: [],
      [ComponentType.OTHER]: [],
    }

    const groupLabels: Record<string, string> = {
      [ComponentType.CORPUS]: 'Korpusz',
      [ComponentType.FRONT]: 'Ajtók / Frontok',
      [ComponentType.DRAWER]: 'Fiókok',
      [ComponentType.HANDLE]: 'Fogantyúk',
      [ComponentType.LEG]: 'Lábak',
      [ComponentType.SHELF]: 'Polcok',
      [ComponentType.OTHER]: 'Egyéb Elemek',
    }

    slots.forEach((slot: ComponentSlotConfig) => {
      const activeComponentId = state[slot.slotId] || ''
      const isCorpus = slot.componentType === ComponentType.CORPUS

      if (!activeComponentId && !isCorpus) return

      let groupKey = resolveGroupKey(slot, activeComponentId)
      if (!rawGroups[groupKey]) groupKey = ComponentType.OTHER

      rawGroups[groupKey]?.push({
        slot: slot,
        displayName: generateNiceName(slot.slotId, groupKey),
      })
    })

    return Object.entries(rawGroups)
      .filter(([_, items]) => items.length > 0)
      .map(([key, items]) => {
        const controls: InspectorControl[] = []
        const shouldGroup = (
          [
            ComponentType.FRONT,
            ComponentType.HANDLE,
            ComponentType.SHELF,
            ComponentType.LEG,
            ComponentType.DRAWER,
          ] as ComponentType[]
        ).includes(key as ComponentType)

        if (shouldGroup && items.length > 1) {
          // --- CSOPORTOSÍTOTT VEZÉRLŐ ---
          const allSlots = items.map((i) => i.slot)
          const firstSlot = allSlots[0]

          if (firstSlot) {
            const currentVal = state[firstSlot.slotId] || ''

            // 🔥 ÚJ: Multi-Material Slotok kinyerése a komponensből
            const activeCompId = state[firstSlot.slotId]
            const activeComp = activeCompId ? configStore.getComponentById(activeCompId) : null

            let matSlots: InspectorControl['materialSlots'] = undefined

            if (activeComp?.materialSlots && activeComp.materialSlots.length > 0) {
              matSlots = activeComp.materialSlots.map((s) => ({
                key: s.key,
                label: s.name,
                currentMaterialId: 'TODO', // Ezt majd a useMaterialSelection-ben oldjuk meg
              }))
            }

            controls.push({
              id: `group_${key}_unified`,
              label: 'Közös stílus',
              slots: allSlots,
              referenceSlot: firstSlot,
              currentValue: currentVal,
              isGrouped: true,
              materialSlots: matSlots, // Átadjuk a slotokat
            })
          }
        } else {
          // --- EGYEDI VEZÉRLŐK ---
          items.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { numeric: true }),
          )
          items.forEach((item) => {
            const currentVal = state[item.slot.slotId] || ''

            // 🔥 ÚJ: Multi-Material Slotok kinyerése
            const activeCompId = state[item.slot.slotId]
            const activeComp = activeCompId ? configStore.getComponentById(activeCompId) : null

            let matSlots: InspectorControl['materialSlots'] = undefined

            if (activeComp?.materialSlots && activeComp.materialSlots.length > 0) {
              matSlots = activeComp.materialSlots.map((s) => ({
                key: s.key,
                label: s.name,
                currentMaterialId: 'TODO',
              }))
            }

            controls.push({
              id: item.slot.slotId,
              label: item.displayName,
              slots: [item.slot],
              referenceSlot: item.slot,
              currentValue: currentVal,
              isGrouped: false,
              materialSlots: matSlots,
            })
          })
        }

        return {
          id: key,
          label: groupLabels[key] || 'Egyéb',
          controls: controls,
        }
      })
  })

  // --- SMART LOGIC ---
  function getOrientation(id: string): 'left' | 'right' | 'neutral' {
    if (!id) return 'neutral'
    const lowerId = id.toLowerCase()
    if (lowerId.endsWith('_l') || lowerId.includes('_left')) return 'left'
    if (lowerId.endsWith('_r') || lowerId.includes('_right')) return 'right'
    return 'neutral'
  }

  function findComponentIdByStyle(slotId: string, targetStyleId: string): string | null {
    const currentId = currentState.value[slotId]
    const currentComp = configStore.getComponentById(currentId || '')

    if (!currentComp?.properties) return null

    const typeKey = normalizeType(currentComp.componentType)
    const candidates = configStore.components[typeKey] || []
    const { width: w, height: h } = currentComp.properties
    const orient = getOrientation(currentComp.id)

    for (const candidate of candidates) {
      if (candidate.styleId !== targetStyleId) continue

      const cW = Number(candidate.properties?.width || 0)
      const cH = Number(candidate.properties?.height || 0)
      const cOrient = getOrientation(candidate.id)

      if (Math.abs(cW - (Number(w) || 0)) > 2) continue
      if (Math.abs(cH - (Number(h) || 0)) > 2) continue

      if (orient === 'left' && cOrient === 'right') continue
      if (orient === 'right' && cOrient === 'left') continue

      return candidate.id
    }
    return null
  }

  function getFilteredComponentsFallback(slot: ComponentSlotConfig) {
    let candidates = slot.allowedComponents
      .map((id) => configStore.getComponentById(id))
      .filter((c): c is ComponentConfig => c !== undefined)

    if (candidates.length <= 1 && slot.componentType) {
      const categoryComponents = configStore.components[slot.componentType]
      if (categoryComponents && categoryComponents.length > 0) {
        candidates = categoryComponents
      }
    }
    return candidates
  }

  function getOptionsForControl(control: InspectorControl) {
    const activeId = currentState.value[control.referenceSlot.slotId]
    const activeComp = configStore.getComponentById(activeId || '')
    const rawType = activeComp?.componentType || control.referenceSlot.componentType
    const type = normalizeType(rawType)

    if (type === ComponentType.FRONT) {
      return configStore.styles.map((style: FurnitureStyle) => ({
        label: style.name,
        value: style.id,
      }))
    }

    const candidates = getFilteredComponentsFallback(control.referenceSlot)
    const uniqueItems = new Map()
    candidates.forEach((comp) => {
      if (!uniqueItems.has(comp.id)) {
        uniqueItems.set(comp.id, {
          label: comp.name,
          value: comp.id,
        })
      }
    })

    return Array.from(uniqueItems.values())
  }

  function getCurrentControlValue(control: InspectorControl): string {
    const firstSlot = control.slots[0]
    if (!firstSlot) return ''

    const currentCompId = currentState.value[firstSlot.slotId]
    if (!currentCompId) return ''

    const comp = configStore.getComponentById(currentCompId)
    const type = normalizeType(comp?.componentType || control.referenceSlot.componentType)

    if (type === ComponentType.FRONT) {
      return comp?.styleId || ''
    }
    return currentCompId
  }

  function handleUnifiedChange(control: InspectorControl, newValue: string) {
    if (!newValue) return

    const firstSlot = control.slots[0]
    if (!firstSlot) return

    const currentId = currentState.value[firstSlot.slotId]
    const comp = configStore.getComponentById(currentId || '')
    const type = normalizeType(comp?.componentType || control.referenceSlot.componentType)
    const isStyleChange = type === ComponentType.FRONT

    const updates: Record<string, string> = {}

    control.slots.forEach((slot) => {
      if (isStyleChange) {
        const compatibleId = findComponentIdByStyle(slot.slotId, newValue)
        if (compatibleId) {
          updates[slot.slotId] = compatibleId
        } else {
          console.warn(`Nem található elem ehhez: ${slot.slotId}, Stílus: ${newValue}`)
        }
      } else {
        updates[slot.slotId] = newValue
      }
    })

    if (Object.keys(updates).length > 0) {
      selectionStore.changeStyles(updates)
      setTimeout(() => {
        proceduralStore.triggerUpdate()
      }, 50)
    }
  }

  return {
    displayGroups,
    getOptionsForControl,
    getCurrentControlValue,
    handleUnifiedChange,
    normalizeType,
  }
}
