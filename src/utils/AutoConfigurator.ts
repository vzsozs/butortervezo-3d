// src/utils/AutoConfigurator.ts
import type { SlotGroup, Schema, ComponentSlotConfig, ComponentDatabase } from '@/config/furniture'

/**
 * Segít kiválasztani az elérhető komponenseket egy adott slot típushoz.
 * @param type A slot típusa (pl. 'corpuses', 'fronts')
 * @param componentDB A teljes komponens adatbázis (store.components)
 */
export function getSuggestedComponentConfig(type: string, componentDB: ComponentDatabase) {
  // Megkeressük a típushoz tartozó komponenseket
  const availableComponents = componentDB[type] || []

  // Kigyűjtjük az ID-kat
  const allowedIds = availableComponents.map((c) => c.id)

  // Az elsőt beállítjuk alapértelmezettnek (ha van)
  const defaultId = allowedIds.length > 0 ? allowedIds[0] : null

  return {
    allowedComponents: allowedIds,
    defaultComponent: defaultId,
  }
}

export function detectSlotGroups(slots: ComponentSlotConfig[]) {
  const groups: Record<string, string[]> = {}

  // Rekurzív segédfüggvény a slotok összegyűjtéséhez
  function traverse(nodes: ComponentSlotConfig[]) {
    nodes.forEach((slot) => {
      const prefix = slot.slotId.replace(/[_-]?\d+$/, '')
      if (!groups[prefix]) {
        groups[prefix] = []
      }
      groups[prefix].push(slot.slotId)

      if (slot.children) {
        traverse(slot.children)
      }
    })
  }

  traverse(slots)

  return Object.entries(groups)
    .filter(([, slotIds]) => slotIds.length > 0)
    .map(([prefix, slotIds]) => ({
      name: prefix,
      slotIds: slotIds.sort(),
    }))
}

export function generateSmartSchemas(
  groupName: string,
  slotIds: string[],
  defaultComponentId: string | null,
): SlotGroup {
  const schemas: Schema[] = []

  // 1. Opció: Üres
  schemas.push({
    id: `schema_${groupName}_0`,
    name: 'Nincs / Üres',
    apply: slotIds.reduce((acc, id) => ({ ...acc, [id]: null }), {}),
  })

  // 2. Opciók: Progresszív (1 db, 2 db...)
  for (let i = 1; i <= slotIds.length; i++) {
    const activeSlots = slotIds.slice(0, i)
    const inactiveSlots = slotIds.slice(i)

    const applyMap: Record<string, string | null> = {}
    activeSlots.forEach((id) => {
      applyMap[id] = defaultComponentId
    })
    inactiveSlots.forEach((id) => {
      applyMap[id] = null
    })

    schemas.push({
      id: `schema_${groupName}_${i}`,
      name: `${i} db ${groupName}`,
      apply: applyMap,
    })
  }

  const isShelf =
    groupName.toLowerCase().includes('shelf') || groupName.toLowerCase().includes('polc')

  return {
    groupId: `group_${groupName}_auto`,
    name: groupName.charAt(0).toUpperCase() + groupName.slice(1),
    // Ha polc, akkor 'shelf_counter' típust adunk neki, egyébként marad a lista
    controlType: isShelf ? 'shelf_counter' : 'schema_select',
    controlledSlots: slotIds,
    schemas: schemas,
    meta: {
      isShelf: isShelf,
      maxCount: slotIds.length,
    },
  } as any
}
