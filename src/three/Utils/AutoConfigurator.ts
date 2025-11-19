import type { FurnitureConfig, SlotGroup, Schema, ComponentSlotConfig } from '@/config/furniture';

/**
 * Ez a függvény végignézi a slotokat, és csoportosítja őket név alapján.
 * Pl.: shelf_1, shelf_2 -> "shelf" csoport
 */
export function detectSlotGroups(slots: ComponentSlotConfig[]) {
  const groups: Record<string, string[]> = {};

  slots.forEach(slot => {
    // Levágjuk a számot a végéről (pl. "drawer_01" -> "drawer")
    const prefix = slot.slotId.replace(/[_-]?\d+$/, '');
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(slot.slotId);
  });

  // Csak azokat adjuk vissza, ahol több mint 1 elem van, vagy egyértelműen opcionális
  return Object.entries(groups).map(([prefix, slotIds]) => ({
    name: prefix, // Pl. "drawer"
    slotIds: slotIds.sort() // Sorbarakva: drawer_1, drawer_2...
  }));
}

/**
 * Ez a "Varázsló": Automatikusan generál sémákat a csoportokhoz.
 * Pl.: Ha van 3 polc, generál: "Nincs polc", "1 Polc", "2 Polc", "3 Polc" opciókat.
 */
export function generateSmartSchemas(groupName: string, slotIds: string[], defaultComponentId: string | null): SlotGroup {
  const schemas: Schema[] = [];

  // 1. Opció: Üres (Nincs semmi)
  schemas.push({
    id: `schema_${groupName}_none`,
    name: 'Nincs / Üres',
    apply: slotIds.reduce((acc, id) => ({ ...acc, [id]: null }), {})
  });

  // 2. Opciók: Növekvő sorrend (Progresszív)
  // Pl. 1 fiók, 2 fiók, 3 fiók...
  for (let i = 1; i <= slotIds.length; i++) {
    const activeSlots = slotIds.slice(0, i); // Az első i darab
    const inactiveSlots = slotIds.slice(i);  // A maradék

    const applyMap: Record<string, string | null> = {};
    
    // Bekapcsoljuk az aktívakat az alapértelmezett komponenssel
    activeSlots.forEach(id => { applyMap[id] = defaultComponentId; });
    // Kikapcsoljuk a maradékot
    inactiveSlots.forEach(id => { applyMap[id] = null; });

    schemas.push({
      id: `schema_${groupName}_${i}`,
      name: `${i} db ${groupName}`, // Pl. "2 db drawer"
      apply: applyMap
    });
  }

  return {
    groupId: `group_${groupName}_auto`,
    name: groupName.charAt(0).toUpperCase() + groupName.slice(1), // Nagybetűsítés
    controlType: 'schema_select',
    controlledSlots: slotIds,
    schemas: schemas
  };
}