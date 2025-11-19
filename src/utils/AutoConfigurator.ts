// src/utils/AutoConfigurator.ts
import type { SlotGroup, Schema, ComponentSlotConfig } from '@/config/furniture';

export function detectSlotGroups(slots: ComponentSlotConfig[]) {
  const groups: Record<string, string[]> = {};

  // Rekurzív segédfüggvény a slotok összegyűjtéséhez
  function traverse(nodes: ComponentSlotConfig[]) {
    nodes.forEach(slot => {
      const prefix = slot.slotId.replace(/[_-]?\d+$/, '');
      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(slot.slotId);
      
      if (slot.children) {
        traverse(slot.children);
      }
    });
  }

  traverse(slots);

  return Object.entries(groups)
    .filter(([, slotIds]) => slotIds.length > 0) // Minden csoportot visszaadunk, amiben van valami
    .map(([prefix, slotIds]) => ({
      name: prefix,
      slotIds: slotIds.sort()
    }));
}

export function generateSmartSchemas(groupName: string, slotIds: string[], defaultComponentId: string | null): SlotGroup {
  const schemas: Schema[] = [];

  // 1. Opció: Üres
  schemas.push({
    id: `schema_${groupName}_none`,
    name: 'Nincs / Üres',
    apply: slotIds.reduce((acc, id) => ({ ...acc, [id]: null }), {})
  });

  // 2. Opciók: Progresszív (1 db, 2 db...)
  for (let i = 1; i <= slotIds.length; i++) {
    const activeSlots = slotIds.slice(0, i);
    const inactiveSlots = slotIds.slice(i);

    const applyMap: Record<string, string | null> = {};
    activeSlots.forEach(id => { applyMap[id] = defaultComponentId; });
    inactiveSlots.forEach(id => { applyMap[id] = null; });

    schemas.push({
      id: `schema_${groupName}_${i}`,
      name: `${i} db ${groupName}`,
      apply: applyMap
    });
  }

  return {
    groupId: `group_${groupName}_auto`,
    name: groupName.charAt(0).toUpperCase() + groupName.slice(1),
    controlType: 'schema_select',
    controlledSlots: slotIds,
    schemas: schemas
  };
}