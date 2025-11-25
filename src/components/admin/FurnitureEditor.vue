<script setup lang="ts">
import { computed, ref, provide, type ComponentPublicInstance, watch } from 'vue';
import { storeToRefs } from 'pinia'; // HOZZÁADVA: storeToRefs
import type { FurnitureConfig, ComponentSlotConfig, Schema } from '@/config/furniture'; // HOZZÁADVA: Schema
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';
import ChevronDown from '@/assets/icons/chevron-down.svg?component';

// --- TÍPUSOK ---
// JAVÍTÁS: Kikapcsoljuk az any ellenőrzést erre a sorra, mert itt szükséges a dinamikus típus

type SimpleSlotUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedSlotUpdate = { slotId: string; update: SimpleSlotUpdate };

const props = defineProps<{
  furniture: FurnitureConfig | null;
  isNew: boolean;
}>();

const emit = defineEmits<{
  (e: 'save', furniture: FurnitureConfig): void;
  (e: 'update:furniture', furniture: FurnitureConfig): void;
  (e: 'delete', id: string): void;
  (e: 'cancel'): void;
  (e: 'toggle-markers', visible: boolean, activePoints: string[]): void;
}>();

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const editableFurniture = ref<FurnitureConfig | null>(null);
provide('editableFurniture', editableFurniture);

// --- TAB KEZELÉS ---
const activeTab = ref<'general' | 'layouts'>('general');
// Track which schema is currently expanded in the UI
const openSchemaId = ref<string | null>(null);

// --- SLOT TEMPLATES ---
const slotTemplates: Record<string, { name: string, type: string, prefix: string }> = {
  corpus: { name: 'Korpusz', type: 'corpuses', prefix: 'corpus' },
  front: { name: 'Ajtó', type: 'fronts', prefix: 'front' },
  handle: { name: 'Fogantyú', type: 'handles', prefix: 'handle' },
  leg: { name: 'Láb', type: 'legs', prefix: 'leg' },
  shelf: { name: 'Polc', type: 'shelves', prefix: 'shelf' },
  drawer: { name: 'Fiók', type: 'drawers', prefix: 'drawer' },
};

const templateOrder = ['corpus', 'front', 'handle', 'leg', 'shelf', 'drawer'];

// --- WATCHERS ---
watch(() => props.furniture, (newVal) => {
  if (newVal) {
    // Csak akkor írjuk felül, ha az ID más, vagy ha még nincs betöltve semmi.
    // Ez megakadályozza a végtelen ciklust, ha a szülő visszaküldi ugyanazt az objektumot.
    if (!editableFurniture.value || editableFurniture.value.id !== newVal.id) {
      editableFurniture.value = JSON.parse(JSON.stringify(newVal));
    }
  } else {
    editableFurniture.value = null;
  }
}, { immediate: true, deep: true });

// Live update a szülő felé (hogy a 3D preview frissüljön)
watch(editableFurniture, (newVal) => {
  if (newVal) {
    emit('update:furniture', newVal);
  }
}, { deep: true });

// --- 1. SLOT HOZZÁADÁS ---

function addSlotFromTemplate(template: { name: string, type: string, prefix: string }) {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.componentSlots) editableFurniture.value.componentSlots = [];

  const count = editableFurniture.value.componentSlots.filter(s => s.slotId.startsWith(template.prefix)).length + 1;
  const newSlot: ComponentSlotConfig = {
    slotId: `${template.prefix}_${count}`,
    name: `${template.name} ${count}`,
    componentType: template.type,
    allowedComponents: [],
    defaultComponent: null, // JAVÍTÁS: Kötelező mező
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    attachToSlot: '', // Gyökér
    useAttachmentPoint: '',
  };

  // AUTO-ATTACH LOGIKA (Okos szülő és pont választás)
  let parentSlot: ComponentSlotConfig | undefined;

  // 1. Szülő kiválasztása típus alapján
  if (newSlot.componentType === 'handles') {
    // Fogantyúk -> Frontokhoz csatlakoznak
    const fronts = editableFurniture.value.componentSlots.filter(s => s.componentType === 'fronts');

    // 1. Kör: Keressünk olyan frontot, aminek VAN komponense ÉS szabad helye
    for (const front of fronts) {
      if (front.defaultComponent) {
        const frontComp = configStore.getComponentById(front.defaultComponent);
        if (frontComp && frontComp.attachmentPoints) {
          const hasFreeHandlePoint = frontComp.attachmentPoints.some(p =>
            p.allowedComponentTypes.includes('handles') &&
            !editableFurniture.value!.componentSlots.some(s => s.attachToSlot === front.slotId && s.useAttachmentPoint === p.id)
          );
          // The user's instruction seems to have mistakenly included a template snippet here.
          // As per the instruction to "incorporate the change in a way so that the resulting file is syntactically correct",
          // and given this is a script block, the HTML snippet cannot be placed here.
          // The instruction "Bind handleAttachmentClick in template" suggests this binding should occur in a Vue template.
          // Since no template section is provided, and to maintain syntactical correctness of the script,
          // the HTML snippet is omitted from this script block.
          // If `handleSlotClick` or `handleAttachmentClick` functions are needed, they should be defined.
          // For now, we assume they are defined elsewhere or will be defined.
          // For the purpose of this change, we will define placeholder functions to avoid errors.
          // If the user intended to add the AdminPreviewCanvas component to a template, that template is not provided.
          // The `break;` statement is also part of the original JS logic and should remain.
          if (hasFreeHandlePoint) {
            parentSlot = front;
            break;
          }
        }
      }
    }

    // 2. Kör: Ha nincs ilyen, keressünk olyan frontot, amihez MÉG NINCS fogantyú csatolva (akkor is ha üres)
    if (!parentSlot) {
      for (const front of fronts) {
        const hasHandle = editableFurniture.value.componentSlots.some(s => s.attachToSlot === front.slotId && s.componentType === 'handles');
        if (!hasHandle) {
          parentSlot = front;
          break;
        }
      }
    }

    // 3. Kör: Ha minden kötél szakad, vegyük az első frontot
    if (!parentSlot && fronts.length > 0) parentSlot = fronts[0];

  } else {
    // Minden más (lábak, polcok, fiókok, frontok) -> Korpuszhoz csatlakozik
    parentSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  }

  // 2. Csatlakozás a kiválasztott szülőhöz
  if (parentSlot) {
    newSlot.attachToSlot = parentSlot.slotId;

    // Ha van default komponense a szülőnek, nézzük meg a pontjait
    if (parentSlot.defaultComponent) {
      const parentComp = configStore.getComponentById(parentSlot.defaultComponent);
      if (parentComp && parentComp.attachmentPoints) {

        // Keressük meg a már használt pontokat ezen a szülőn
        const usedPointsOnParent = editableFurniture.value.componentSlots
          .filter(s => s.attachToSlot === parentSlot!.slotId)
          .map(s => s.useAttachmentPoint);

        // Keressünk szabad pontot, ami illik a típushoz
        // Prioritás:
        // 1. Pontos típus egyezés (pl. "handles") ÉS szabad
        // 2. Név alapú heurisztika (pl. "attach_handle_L")

        let match = parentComp.attachmentPoints.find(p =>
          p.allowedComponentTypes.includes(newSlot.componentType) &&
          !usedPointsOnParent.includes(p.id)
        );

        // Ha nincs szabad, próbáljunk meg bármilyet, ami típushelyes (több elem egy ponton?)
        if (!match) {
          match = parentComp.attachmentPoints.find(p => p.allowedComponentTypes.includes(newSlot.componentType));
        }

        if (match) {
          newSlot.useAttachmentPoint = match.id;
          console.log(`✅ Auto-Attach sikerült: ${newSlot.slotId} -> ${parentSlot.slotId} / ${match.id}`);
        } else {
          console.warn(`⚠️ Auto-Attach sikertelen: Nem találtam megfelelő pontot. Szülő: ${parentSlot.slotId}`);
        }
      }
    }
  }

  editableFurniture.value.componentSlots?.push(newSlot);
}

// --- 2. VIZUÁLIS CSOPORTOSÍTÁS ---
const groupedDisplay = computed(() => {
  if (!editableFurniture.value?.componentSlots) return { groups: {}, orphans: [] };

  const groups: Record<string, { title: string, slots: ComponentSlotConfig[] }> = {};
  const orphans: ComponentSlotConfig[] = [];

  editableFurniture.value.componentSlots.forEach(slot => {
    // Rejtett slotokat hagyjuk ki a listából
    if (slot.isAutoGenerated) return;

    const match = slot.slotId.match(/^([a-z]+)(?:_?\d*)?$/i);

    if (match && match[1] && slotTemplates[match[1]]) {
      const key = match[1];
      if (!groups[key]) {
        groups[key] = {
          title: slotTemplates[key]?.name || key,
          slots: []
        };
      }
      groups[key].slots.push(slot);
    } else {
      orphans.push(slot);
    }
  });

  return { groups, orphans };
});

// --- LAYOUT SCHEMAS LOGIC ---

// 1. Korpusz Csatlakozási Pontok (Dummies)
// 1. Korpusz Csatlakozási Pontok (Dummies)
const corpusAttachmentPoints = computed(() => {
  if (!editableFurniture.value?.componentSlots) return [];
  const corpusSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  if (!corpusSlot || !corpusSlot.defaultComponent) return [];

  const corpusComp = configStore.getComponentById(corpusSlot.defaultComponent);
  return corpusComp?.attachmentPoints || [];
});

// Csoportosított pontok (Primary / Secondary)
const primaryPointTypes = ['fronts', 'shelves', 'drawers', 'handles'];
const showAllPoints = ref<Record<string, boolean>>({}); // Schema ID -> boolean

function getPrimaryPoints(points: any[]) {
  return points.filter(p => p.allowedComponentTypes.some((t: string) => primaryPointTypes.includes(t)));
}

function getSecondaryPoints(points: any[]) {
  return points.filter(p => !p.allowedComponentTypes.some((t: string) => primaryPointTypes.includes(t)));
}

function getChildAttachmentPoints(slotId: string, schema?: Schema) {
  if (!editableFurniture.value?.componentSlots) return [];
  const slot = editableFurniture.value.componentSlots.find(s => s.slotId === slotId);

  if (!slot) {
    // console.log(`getChildAttachmentPoints: Slot ${slotId} not found`);
    return [];
  }

  // 1. Try to get component from Schema (if provided)
  let componentId = slot.defaultComponent;
  if (schema && schema.apply[slotId]) {
    componentId = schema.apply[slotId];
  }

  if (!componentId) {
    // console.log(`getChildAttachmentPoints: Slot ${slotId} has no default component`);
    return [];
  }

  const comp = configStore.getComponentById(componentId);
  if (!comp) {
    // console.warn(`getChildAttachmentPoints: Component ${componentId} not found for slot ${slotId}`);
    return [];
  }

  // console.log(`getChildAttachmentPoints for ${slotId} (${componentId}):`, comp.attachmentPoints);
  return comp.attachmentPoints || [];
}

// Ikonok
const PencilIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;


function updateControlledSlots() {
  if (!editableFurniture.value?.slotGroups) return;
  const layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) return;

  const activeSlotIds = new Set<string>();

  layoutGroup.schemas.forEach(schema => {
    Object.entries(schema.apply).forEach(([slotId, val]) => {
      if (val !== null) activeSlotIds.add(slotId);
    });
  });

  // 1. Frissítsük a csoport controlledSlots listáját
  layoutGroup.controlledSlots = Array.from(activeSlotIds).sort();

  // 2. Győződjünk meg róla, hogy ezek a slotok léteznek a bútorban
  if (!editableFurniture.value.componentSlots) editableFurniture.value.componentSlots = [];

  activeSlotIds.forEach(slotId => {
    const exists = editableFurniture.value!.componentSlots.find(s => s.slotId === slotId);
    if (!exists) {
      let attachPointId = '';
      let explicitParentId = '';

      // Check for Composite ID (parent__point)
      if (slotId.includes('__')) {
        const parts = slotId.split('__');
        explicitParentId = parts[0];
        attachPointId = parts[1];
      } else {
        // Legacy / Standard ID
        if (slotId.startsWith('slot_')) {
          attachPointId = slotId.replace('slot_', 'attach_');
        }
      }

      if (attachPointId) {
        // Find the parent slot that has this attachment point
        let parentSlotId = '';
        let pointDef;

        if (explicitParentId) {
          // If we have an explicit parent, use it!
          parentSlotId = explicitParentId;
          const parentSlot = editableFurniture.value!.componentSlots.find(s => s.slotId === explicitParentId);
          if (parentSlot && parentSlot.defaultComponent) {
            const comp = configStore.getComponentById(parentSlot.defaultComponent);
            pointDef = comp?.attachmentPoints?.find(p => p.id === attachPointId);
          }
        } else {
          // Fallback logic (Corpus or search)
          // 1. Check Corpus
          parentSlotId = editableFurniture.value!.componentSlots.find(s => s.slotId.includes('corpus'))?.slotId || '';
          pointDef = corpusAttachmentPoints.value.find(p => p.id === attachPointId);

          // 2. Check other slots (if not found on corpus)
          if (!pointDef) {
            for (const slot of editableFurniture.value!.componentSlots) {
              if (slot.defaultComponent) {
                const comp = configStore.getComponentById(slot.defaultComponent);
                const match = comp?.attachmentPoints?.find(p => p.id === attachPointId);
                if (match) {
                  pointDef = match;
                  parentSlotId = slot.slotId;
                  break;
                }
              }
            }
          }
        }

        if (!pointDef) {
          console.error(`CRITICAL: Point definition NOT found for ${attachPointId} (derived from ${slotId})`);
          // console.log('Available points:', corpusAttachmentPoints.value.map(p => p.id));
        } else {
          console.log(`Creating new slot: ${slotId} for point ${attachPointId} on parent ${parentSlotId}`);
          const newSlot: ComponentSlotConfig = {
            slotId: slotId,
            name: pointDef ? pointDef.id : slotId,
            componentType: (pointDef && pointDef.allowedComponentTypes.length > 0) ? pointDef.allowedComponentTypes[0]! : 'unknown',
            allowedComponents: [],
            defaultComponent: null,
            attachToSlot: parentSlotId,
            useAttachmentPoint: attachPointId,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          };
          editableFurniture.value!.componentSlots.push(newSlot);
        }
      }
    }
  });
}


function updateMarkers() {
  if (!openSchemaId.value) return;

  const schema = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts')?.schemas.find(s => s.id === openSchemaId.value);
  if (!schema) return;

  const activePoints: string[] = [];
  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    if (componentId) {
      const pointId = slotId.replace('slot_', 'attach_');
      activePoints.push(pointId);
    }
  });

  // Hívjuk meg a szülőt
  emit('toggle-markers', true, activePoints);
}

function handleAttachmentClick(pointId: string) {
  if (!openSchemaId.value) return;

  const schema = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts')?.schemas.find(s => s.id === openSchemaId.value);
  if (!schema) return;

  // Megnézzük, hogy jelenleg aktív-e
  const isActive = getDummyState(schema, pointId);

  // Toggle
  toggleDummyInSchema(schema, pointId, !isActive);
}

// Watcher for openSchemaId to toggle markers
watch(openSchemaId, (newId) => {
  if (newId) {
    setTimeout(() => updateMarkers(), 100);
  } else {
    emit('toggle-markers', false, []);
  }
});

function scrollToSlot(slotId: string) {
  activeTab.value = 'general'; // Váltsunk a general tabra

  // Várjunk egy picit, hogy a DOM frissüljön (ha tabot váltottunk)
  setTimeout(() => {
    const element = slotNodeRefs.value[slotId];
    if (element) {
      // Ha ez egy komponens (SlotNode), akkor az $el-t használjuk
      const domElement = (element as any).$el || element;
      domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight
      highlightedSlotId.value = slotId;
      setTimeout(() => { highlightedSlotId.value = null; }, 2000);
    }
  }, 100);
}

defineExpose({
  handleAttachmentClick,
  scrollToSlot
});

// 4. Séma Szerkesztése (Dummy Toggle)
function toggleDummyInSchema(schema: Schema, pointId: string, isActive: boolean, parentSlotId?: string) {
  // DEBUG: Logoljuk a kattintást
  console.log(`Toggle Dummy: Schema=${schema.name}, Point=${pointId}, Active=${isActive}, Parent=${parentSlotId}`);

  if (isActive) {
    // AKTÍV: Kell egy slot és egy komponens
    let pointDef;

    if (parentSlotId) {
      // Ha van szülő, akkor azon keressük a pontot
      const parentSlot = allSlots.value.find(s => s.slotId === parentSlotId);
      if (parentSlot && parentSlot.defaultComponent) {
        const parentComp = configStore.getComponentById(parentSlot.defaultComponent);
        pointDef = parentComp?.attachmentPoints?.find(p => p.id === pointId);
      }
    } else {
      // Ha nincs, akkor a korpuszon
      pointDef = corpusAttachmentPoints.value.find(p => p.id === pointId);
    }

    if (!pointDef) {
      console.error(`Point definition not found for ${pointId} (Parent: ${parentSlotId})`);
      return;
    }

    const type = pointDef.allowedComponentTypes[0] || '';

    // Keressünk slotot
    const slotId = findBestSlotForPoint(schema, pointId, type, parentSlotId);
    console.log(`Found/Created slot: ${slotId} for point ${pointId} (Parent: ${parentSlotId})`);

    // Keressünk default komponenst
    const comps = (storeComponents.value && storeComponents.value[type]) || [];
    const defaultCompId = comps.length > 0 ? comps[0]!.id : null;

    console.log(`Default component for type '${type}':`, defaultCompId, `(Available: ${comps.length})`);

    schema.apply[slotId] = defaultCompId;

    // AUTO-ACTIVATE CHILDREN
    if (defaultCompId) {
      const comp = configStore.getComponentById(defaultCompId);
      if (comp && comp.attachmentPoints) {
        comp.attachmentPoints.forEach(childPoint => {
          // Check if already active to avoid loops/redundancy
          if (!getDummyState(schema, childPoint.id)) {
            console.log(`Auto-activating child: ${childPoint.id} for parent ${slotId}`);
            // Recursive call to activate child
            // Note: We pass slotId as the parentSlotId for the child
            toggleDummyInSchema(schema, childPoint.id, true, slotId);
          }
        });
      }
    }

  } else {
    // INAKTÍV: Megkeressük ki tölti be, és nullázzuk
    const current = findSlotForSchemaPoint(schema, pointId);
    if (current) {
      schema.apply[current.slotId] = null;
    }
  }

  // Frissítjük a markereket is
  updateMarkers();

  // Frissítjük a controlled slotokat (hogy a slot létrejöjjön)
  updateControlledSlots();

  // Apply changes to the furniture immediately
  activateSchema(schema);
}

// 6. Direct Activation Logic (No Preview)

// 6. Direct Activation Logic (No Preview)

function activateSchema(schema: Schema) {
  if (!editableFurniture.value?.componentSlots) return;

  // 1. Apply schema settings directly
  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    // Use allSlots to find nested slots too
    const targetSlot = allSlots.value.find(s => s.slotId === slotId);

    // Conflict resolution: Find slots using the same attachment point
    const attachPointId = targetSlot?.useAttachmentPoint || slotId.replace('slot_', 'attach_');

    // Find conflicting slots in the entire tree
    const conflictingSlots = allSlots.value.filter(s =>
      s.useAttachmentPoint === attachPointId && s.slotId !== slotId
    );

    // Deactivate conflicting slots
    conflictingSlots.forEach(conflict => {
      conflict.defaultComponent = null;
    });

    // Activate target slot
    if (targetSlot) {
      if (componentId === null) {
        targetSlot.defaultComponent = null;
      } else {
        targetSlot.defaultComponent = componentId || '';
      }
    }
  });

  // 2. Handle "Ghosts" (Controlled slots not in this schema)
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.controlledSlots.forEach(slotId => {
      if (schema.apply[slotId] === undefined) {
        const slot = allSlots.value.find(s => s.slotId === slotId);
        if (slot) {
          slot.defaultComponent = null;
        }
      }
    });
  }

  // Force update markers
  updateMarkers();
}

// Helper to check if a schema is currently fully active
function isSchemaActive(schema: Schema): boolean {
  if (!editableFurniture.value?.componentSlots) return false;

  return Object.entries(schema.apply).every(([slotId, componentId]) => {
    const slot = allSlots.value.find(s => s.slotId === slotId);
    if (!slot) return false;

    if (componentId === null) {
      return slot.defaultComponent === null;
    } else {
      if (componentId === '') return slot.defaultComponent !== null;
      return slot.defaultComponent === componentId;
    }
  });
}


function createNewSchema() {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.slotGroups) editableFurniture.value.slotGroups = [];

  let layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) {
    layoutGroup = {
      groupId: 'layouts',
      name: 'Layouts',
      controlType: 'schema_select',
      schemas: [],
      controlledSlots: []
    };
    editableFurniture.value.slotGroups.push(layoutGroup);
  }

  const newSchema: Schema = {
    id: `schema_${Date.now()}`,
    name: `Új Elrendezés ${layoutGroup.schemas.length + 1}`,
    apply: {}
  };

  layoutGroup.schemas.push(newSchema);
  openSchemaId.value = newSchema.id;
}


function deleteSchema(index: number) {
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.schemas.splice(index, 1);
  }
}


function saveChanges() {
  // Mentés előtt futtassuk le a compilert biztos ami biztos
  updateControlledSlots();

  if (editableFurniture.value) emit('save', editableFurniture.value as FurnitureConfig);
}

// --- HELPEREK & UPDATE ---
const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, ComponentPublicInstance | Element | null>>({});
const setSlotNodeRef = (el: ComponentPublicInstance | Element | null, slotId: string) => { if (el) slotNodeRefs.value[slotId] = el; };
const suggestions = computed(() => ({ componentTypes: storeComponents.value ? Object.keys(storeComponents.value) : [], attachmentPoints: [] }));

const allSlots = computed(() => {
  const slots: ComponentSlotConfig[] = [];
  function traverse(nodes: ComponentSlotConfig[]) {
    for (const node of nodes) {
      slots.push(node);
      if (node.children) traverse(node.children);
    }
  }
  if (editableFurniture.value?.componentSlots && Array.isArray(editableFurniture.value.componentSlots)) {
    traverse(editableFurniture.value.componentSlots);
  }
  return slots;
});



function handleSlotUpdate(payload: SimpleSlotUpdate | NestedSlotUpdate, topLevelSlotId?: string) {
  let targetSlotId: string;
  let updateData: SimpleSlotUpdate;
  if ('slotId' in payload) { targetSlotId = payload.slotId; updateData = payload.update; }
  else { if (!topLevelSlotId) return; targetSlotId = topLevelSlotId; updateData = payload; }

  const slot = allSlots.value.find(s => s.slotId === targetSlotId);
  if (slot) {

    (slot as any)[updateData.key] = updateData.value;
    if (updateData.key === 'allowedComponents' && Array.isArray(updateData.value)) {
      if (!slot.defaultComponent && updateData.value.length > 0) slot.defaultComponent = updateData.value[0] as string;
    }

    // SZINKRONIZÁCIÓ: Ha ez egy "Master" slot (nem auto-generated),
    // akkor frissítsük a hozzá tartozó "Slave" (auto-generated) slotokat is.
    // Csak akkor, ha a defaultComponent változott.
    if (updateData.key === 'defaultComponent' && !slot.isAutoGenerated) {
      const slaveSlots = allSlots.value.filter(s => s.isAutoGenerated && s.componentType === slot.componentType);
      slaveSlots.forEach(slave => {
        // CSAK AKKOR frissítjük a slave-et, ha:
        // 1. A master-t töröljük (null) -> Slave is törlődik
        // 2. A slave MÁR aktív (nem null) -> Stílus szinkronizálás
        // NE kapcsoljuk be a slave-et automatikusan, ha eddig ki volt kapcsolva!
        if (updateData.value === null || slave.defaultComponent) {
          slave.defaultComponent = updateData.value as string | null;
        }
      });
    }

    // AUTO-UPDATE CHILDREN: Ha a komponens megváltozott, ellenőrizzük a gyerekek csatlakozási pontjait
    if (updateData.key === 'defaultComponent' && updateData.value) {
      autoUpdateChildSlots(slot, updateData.value as string);
    }

    // SYNC TO ACTIVE SCHEMA: Keep schema in sync with manual edits
    if (openSchemaId.value && updateData.key === 'defaultComponent') {
      const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
      const schema = layoutGroup?.schemas.find(s => s.id === openSchemaId.value);

      // Only update if this slot is tracked by the schema
      if (schema && schema.apply.hasOwnProperty(targetSlotId)) {
        console.log(`Syncing schema ${schema.name}: ${targetSlotId} -> ${updateData.value}`);
        schema.apply[targetSlotId] = updateData.value as string | null;
      }
    }
  }
}

function autoUpdateChildSlots(parentSlot: ComponentSlotConfig, newComponentId: string) {
  // 1. Keressük meg a gyerek slotokat (amik ehhez a slothoz csatlakoznak)
  const children = allSlots.value.filter(s => s.attachToSlot === parentSlot.slotId);
  if (children.length === 0) return;

  // 2. Keressük meg az új komponens definícióját
  const componentType = parentSlot.componentType;
  const comps = storeComponents.value?.[componentType] || [];
  const newComp = comps.find(c => c.id === newComponentId);

  if (!newComp || !newComp.attachmentPoints) return;

  // 3. Minden gyereknél ellenőrizzük a validitást
  children.forEach(child => {
    const currentPoint = child.useAttachmentPoint;

    // Létezik még ez a pont az új komponensen?
    const pointExists = newComp.attachmentPoints!.some(p => p.id === currentPoint);

    if (!pointExists) {
      // BAJ VAN: A gyerek lóg a levegőben. Keressünk neki új helyet!
      // Heurisztika: Próbáljuk meg a "tükörképét" megtalálni (L <-> R)
      // Támogatjuk a "vertical" és "verticall" elírást is, illetve a sima cserét.
      let newPointId = '';

      if (currentPoint?.includes('_L')) {
        newPointId = currentPoint.replace('_L', '_R');
      } else if (currentPoint?.includes('_R')) {
        newPointId = currentPoint.replace('_R', '_L');
      }

      // Ellenőrizzük, hogy a tippünk létezik-e
      if (newPointId && newComp.attachmentPoints!.some(p => p.id === newPointId)) {
        console.log(`Auto-fixing child slot ${child.slotId}: ${currentPoint} -> ${newPointId}`);
        child.useAttachmentPoint = newPointId;
      } else {
        // Fallback: Ha a pontos névcsere nem működik (pl. elírás miatt: vertical vs verticall),
        // akkor keressünk bármilyen pontot, ami a másik oldalon van.
        const targetSide = currentPoint?.includes('_L') ? '_R' : '_L';
        const sideMatch = newComp.attachmentPoints!.find(p =>
          p.allowedComponentTypes.includes(child.componentType) &&
          p.id.includes(targetSide)
        );

        if (sideMatch) {
          console.log(`Auto-fixing child slot ${child.slotId}: ${currentPoint} -> ${sideMatch.id} (side match)`);
          child.useAttachmentPoint = sideMatch.id;
        } else {
          // Végső fallback: Bármi ami jó típus
          const compatiblePoint = newComp.attachmentPoints!.find(p => p.allowedComponentTypes.includes(child.componentType));
          if (compatiblePoint) {
            console.log(`Auto-fixing child slot ${child.slotId}: ${currentPoint} -> ${compatiblePoint.id} (fallback)`);
            child.useAttachmentPoint = compatiblePoint.id;
          }
        }
      }
    }
  });
}

function findAndRemoveSlot(nodes: ComponentSlotConfig[], slotId: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node && node.slotId === slotId) { nodes.splice(i, 1); return true; }
    if (node && node.children && findAndRemoveSlot(node.children, slotId)) return true;
  }
  return false;
}
function handleSlotRemove(slotId: string) {
  if (editableFurniture.value?.componentSlots) findAndRemoveSlot(editableFurniture.value.componentSlots, slotId);
}

// --- HELPER FUNCTIONS FOR SCHEMAS ---

function getDummyState(schema: Schema, pointId: string, parentSlotId?: string): boolean {
  // Check if the schema has an entry for this point (mapped via slotId)
  const slotEntry = Object.entries(schema.apply).find(([sId]) => {
    // 1. Check for Composite ID (parent__point)
    if (parentSlotId && sId === `${parentSlotId}__${pointId}`) return true;

    // 2. Fallback / Legacy checks (only if no parent specified or standard naming)
    if (!parentSlotId) {
      // A. Name convention check
      if (sId.replace('slot_', 'attach_') === pointId) return true;

      // B. Object property check (if slot exists)
      const slot = allSlots.value.find(s => s.slotId === sId);
      if (slot && slot.useAttachmentPoint === pointId) return true;
    }

    return false;
  });

  if (slotEntry) {
    return slotEntry[1] !== null;
  }
  return false;
}

function findSlotForSchemaPoint(schema: Schema, pointId: string, parentSlotId?: string): ComponentSlotConfig | undefined {
  if (!allSlots.value) return undefined;

  // 1. Check schema for direct mapping
  const slotEntry = Object.entries(schema.apply).find(([sId]) => {
    // 1. Check for Composite ID
    if (parentSlotId && sId === `${parentSlotId}__${pointId}`) return true;

    // 2. Legacy checks
    if (!parentSlotId) {
      if (sId.replace('slot_', 'attach_') === pointId) return true;
      const slot = allSlots.value.find(s => s.slotId === sId);
      if (slot && slot.useAttachmentPoint === pointId) return true;
    }
    return false;
  });

  if (slotEntry) {
    return allSlots.value.find(s => s.slotId === slotEntry[0]);
  }

  // 2. Fallback: Find by attachment point in all slots
  return allSlots.value.find(s => {
    const pointMatch = s.useAttachmentPoint === pointId || s.slotId.replace('slot_', 'attach_') === pointId;
    if (parentSlotId) {
      return pointMatch && s.attachToSlot === parentSlotId;
    }
    return pointMatch;
  });
}

function findBestSlotForPoint(schema: Schema, pointId: string, _type: string, parentSlotId?: string): string {
  // 1. Is there already a slot for this point?
  const existing = findSlotForSchemaPoint(schema, pointId, parentSlotId);
  if (existing) return existing.slotId;

  // 2. Generate new ID
  if (parentSlotId) {
    return `${parentSlotId}__${pointId}`;
  }

  return pointId.replace('attach_', 'slot_');
}

function getSlotTree(slotId: string): ComponentSlotConfig | undefined {
  // Since allSlots is flat, we can just find it there.
  // However, SlotNode expects the node object which might contain children.
  // The objects in allSlots are references to the nodes in the tree, so they should have children if populated.
  return allSlots.value.find(s => s.slotId === slotId);
}




function getSchemasForGroup(groupName: string): Schema[] {
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (!layoutGroup) return [];

  // Szűrjük ki azokat a sémákat, amik ehhez a csoporthoz (pl. "fronts") tartoznak
  return layoutGroup.schemas.filter(schema => {
    // 1. Nézzük meg, milyen pontok aktívak a sémában
    const activePoints = Object.keys(schema.apply).filter(slotId => schema.apply[slotId] !== null);

    // 2. Ha nincs aktív pont, akkor hova tartozik? (Pl. "Üres" séma)
    if (activePoints.length === 0) return false;

    // 3. Ellenőrizzük a pontok típusát
    // A csoport definíciója:
    const groupDef = groupedDisplay.value.groups[groupName];
    if (!groupDef || groupDef.slots.length === 0) return false;

    // A csoport első slotjának típusa (pl. "front")
    const groupType = groupDef.slots[0]?.componentType;
    if (!groupType) return false;

    // Most nézzük meg, hogy a séma tartalmaz-e ilyen típusú elemet.
    return activePoints.some(slotId => {
      const slot = editableFurniture.value?.componentSlots.find(s => s.slotId === slotId);
      if (!slot) return false;

      // 1. Közvetlen egyezés (pl. Fronts)
      if (slot.componentType === groupType) return true;

      // 2. Szülő egyezés (pl. Handles -> Fronts)
      const children = editableFurniture.value?.componentSlots.filter(s => s.attachToSlot === slotId);
      return children?.some(child => child.componentType === groupType);
    });
  });
}

function toggleSchema(schemaId: string) {
  if (openSchemaId.value === schemaId) {
    openSchemaId.value = null;
  } else {
    openSchemaId.value = schemaId;
  }
}

</script>

<template>
  <div class="admin-panel h-full flex flex-col" v-if="editableFurniture">

    <!-- HEADER -->
    <div class="flex justify-between items-start mb-4 border-b border-gray-700 pb-2">
      <div>
        <h3 class="text-xl font-bold text-white">{{ isNew ? 'Új Bútor' : editableFurniture.name }}</h3>
        <p class="text-sm text-gray-400">ID: {{ editableFurniture.id }}</p>
      </div>
      <div class="flex gap-2">
        <button v-if="!isNew" @click="emit('delete', editableFurniture.id)"
          class="admin-btn-danger text-sm mr-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800">Törlés</button>
        <button @click="emit('cancel')" class="admin-btn-secondary text-sm">Mégse</button>
        <button @click="saveChanges" class="admin-btn text-sm">Mentés</button>
      </div>
    </div>

    <!-- TABS -->
    <div class="flex gap-4 mb-4 border-b border-gray-700">
      <button @click="{ activeTab = 'general'; }" class="pb-2 px-2 text-sm font-bold transition-colors border-b-2"
        :class="activeTab === 'general' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-gray-200'">
        Általános & Slotok
      </button>
      <button @click="activeTab = 'layouts'" class="pb-2 px-2 text-sm font-bold transition-colors border-b-2"
        :class="activeTab === 'layouts' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-gray-200'">
        Elrendezések (Layouts)
      </button>
    </div>

    <!-- TAB 1: GENERAL -->
    <div v-show="activeTab === 'general'" class="flex-1 overflow-y-auto space-y-6 pb-10">

      <!-- ALAP ADATOK -->
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="admin-label">Megnevezés</label>
          <input type="text" v-model="editableFurniture.name" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Kategória</label>
          <input type="text" v-model="editableFurniture.category" class="admin-input" />
        </div>
      </div>

      <!-- ÚJ ELEM HOZZÁADÁS -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2 text-gray-300 text-sm">Új Elem Hozzáadása</h4>
        <div class="flex flex-wrap gap-2">
          <button v-for="key in templateOrder" :key="key" @click="addSlotFromTemplate(slotTemplates[key]!)"
            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors border border-gray-600 flex items-center gap-2">
            <span>+ {{ slotTemplates[key]?.name }}</span>
          </button>
        </div>
      </div>

      <!-- CSOPORTOSÍTOTT NÉZET -->
      <div v-for="(groupData, groupKey) in groupedDisplay.groups" :key="groupKey"
        class="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">

        <!-- FEJLÉC (CSOPORT NÉV) -->
        <div class="bg-gray-900 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
          <h4 class="font-bold text-gray-300 text-sm uppercase tracking-wider">{{ groupKey }}</h4>
          <span class="text-xs text-gray-500">{{ groupData.slots.length }} elem</span>
        </div>

        <!-- TARTALOM (SLOTOK VAGY LAYOUT LINK) -->
        <div class="p-4 space-y-4">

          <!-- HA VANNAK SÉMÁK: Egyszerűsített nézet -->
          <div v-if="getSchemasForGroup(groupKey.toString()).length > 0" class="text-center py-6">
            <div class="text-gray-400 text-sm mb-3">
              Ez a csoport ({{ groupKey }}) elrendezés sémákkal van kezelve.
              <br>
              A részletes beállításokat a <strong>Layouts</strong> fülön találod.
            </div>
            <button @click="activeTab = 'layouts'" class="admin-btn-secondary text-sm">
              Szerkesztés a Layouts fülön →
            </button>
          </div>

          <!-- HA NINCS SÉMA: Hagyományos lista -->
          <template v-else>
            <SlotNode v-for="slot in groupData.slots" :key="slot.slotId" :node="slot" :suggestions="suggestions"
              :highlighted-slot-id="highlightedSlotId" :ref="(el) => setSlotNodeRef(el, slot.slotId)"
              @update:slot="handleSlotUpdate($event, slot.slotId)" @remove:slot="handleSlotRemove" />
          </template>

        </div>
      </div>

      <!-- ÁRVÁK -->
      <div v-if="groupedDisplay.orphans.length > 0" class="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
        <h4 class="text-sm font-bold text-gray-400 mb-4 uppercase">Egyéb Elemek</h4>
        <div class="space-y-4">
          <SlotNode v-for="slot in groupedDisplay.orphans" :key="slot.slotId" :node="slot" :suggestions="suggestions"
            :highlighted-slot-id="highlightedSlotId" :ref="(el) => setSlotNodeRef(el, slot.slotId)"
            @update:slot="handleSlotUpdate($event, slot.slotId)" @remove:slot="handleSlotRemove" />
        </div>
      </div>
    </div>

    <!-- TAB 2: LAYOUTS -->
    <div v-show="activeTab === 'layouts'" class="flex-1 overflow-y-auto pb-10">

      <div v-if="corpusAttachmentPoints.length === 0" class="text-center py-10 text-gray-500">
        <p class="text-lg mb-2">⚠️ Nincs Korpusz vagy nincsenek csatlakozási pontok.</p>
        <p class="text-sm">Adj hozzá egy Korpuszt, aminek vannak "attachmentPoints" beállításai.</p>
      </div>

      <div v-else class="space-y-6">

        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold text-white">Elrendezés Sémák</h3>
          <button @click="createNewSchema" class="admin-btn text-sm">+ Új Séma</button>
        </div>

        <div v-if="editableFurniture?.slotGroups?.find(g => g.name === 'Layouts')?.schemas.length === 0"
          class="text-gray-500 italic">
          Még nincsenek sémák létrehozva.
        </div>

        <div v-for="(schema, idx) in editableFurniture?.slotGroups?.find(g => g.name === 'Layouts')?.schemas || []"
          :key="schema.id" class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden transition-all"
          :class="{ 'ring-2 ring-blue-500': isSchemaActive(schema) }">

          <!-- SÉMA FEJLÉC -->
          <div class="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-700">
            <div class="flex items-center gap-2 flex-grow">
              <span class="text-gray-500" v-html="PencilIcon"></span>
              <input type="text" v-model="schema.name"
                class="bg-transparent text-white font-bold focus:outline-none focus:border-b border-blue-500 w-full max-w-xs" />
            </div>

            <div class="flex items-center gap-2">
              <button @click="activateSchema(schema)" class="p-1.5 rounded transition-colors flex items-center gap-1"
                :class="isSchemaActive(schema) ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'">
                <span v-if="isSchemaActive(schema)" class="text-xs font-bold uppercase">Aktív</span>
                <span v-else class="text-xs font-bold uppercase">Előnézet</span>
              </button>
              <button @click="toggleSchema(schema.id)" class="p-1 rounded hover:bg-gray-700 transition-colors">
                <ChevronDown class="w-5 h-5 transform transition-transform duration-200"
                  :class="{ 'rotate-180': openSchemaId === schema.id }" />
              </button>
              <button @click="deleteSchema(idx)"
                class="text-red-400 hover:text-red-300 text-xs bg-red-900/20 hover:bg-red-900/40 px-2 py-1.5 rounded ml-2">Törlés</button>
            </div>
          </div>

          <!-- DUMMY KÁRTYÁK (TABLE HELYETT) -->
          <div v-if="openSchemaId === schema.id" class="p-4 space-y-3">

            <!-- PRIMARY POINTS -->
            <div v-for="point in getPrimaryPoints(corpusAttachmentPoints)" :key="point.id"
              class="bg-gray-900/50 p-3 rounded border border-gray-700/50 flex items-center justify-between group hover:border-gray-600 transition-colors">

              <!-- BAL OLDAL: Címke és ID -->
              <div class="flex-grow">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <button @click="toggleDummyInSchema(schema, point.id, !getDummyState(schema, point.id))"
                      class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                      :class="getDummyState(schema, point.id) ? 'bg-green-900/50 text-green-400 border border-green-800 hover:bg-green-900' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700'">
                      {{ getDummyState(schema, point.id) ? 'ON' : 'OFF' }}
                    </button>
                    <div>
                      <div class="font-mono text-sm font-bold text-gray-300">{{ point.id }}</div>
                      <div class="text-xs text-gray-500">
                        {{ point.allowedComponentTypes.join(', ') }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- HA AKTÍV: SlotNode Editor -->
                <div v-if="getDummyState(schema, point.id)" class="mt-3 pl-11">
                  <div v-if="findSlotForSchemaPoint(schema, point.id)"
                    class="bg-gray-900/50 rounded border border-gray-700/50 p-2">
                    <!-- Itt meg kell keresnünk a teljes slot objektumot a slotId alapján -->
                    <template v-if="findSlotForSchemaPoint(schema, point.id)">
                      <SlotNode v-if="getSlotTree(findSlotForSchemaPoint(schema, point.id)!.slotId)"
                        :node="getSlotTree(findSlotForSchemaPoint(schema, point.id)!.slotId)!"
                        :suggestions="suggestions" :highlighted-slot-id="highlightedSlotId"
                        :ref="(el) => { const s = findSlotForSchemaPoint(schema, point.id); if (s) setSlotNodeRef(el, s.slotId); }"
                        @update:slot="handleSlotUpdate($event, findSlotForSchemaPoint(schema, point.id)!.slotId)"
                        @remove:slot="handleSlotRemove" />

                      <!-- CHILD ATTACHMENT POINTS (pl. Handles on Fronts) -->
                      <div
                        v-if="getChildAttachmentPoints(findSlotForSchemaPoint(schema, point.id)!.slotId, schema).length > 0"
                        class="mt-2 pt-2 border-t border-gray-700">
                        <div class="text-xs font-bold text-gray-500 mb-2 uppercase">További elemek ({{
                          findSlotForSchemaPoint(schema, point.id)!.name }})</div>

                        <div
                          v-for="childPoint in getChildAttachmentPoints(findSlotForSchemaPoint(schema, point.id)!.slotId, schema)"
                          :key="childPoint.id"
                          class="bg-gray-800/50 p-2 rounded border border-gray-700 mb-2 flex flex-col gap-2">

                          <div class="flex items-center gap-3">
                            <button
                              @click="toggleDummyInSchema(schema, childPoint.id, !getDummyState(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId), findSlotForSchemaPoint(schema, point.id)!.slotId)"
                              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors"
                              :class="getDummyState(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId) ? 'bg-green-900/50 text-green-400 border border-green-800 hover:bg-green-900' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700'">
                              {{ getDummyState(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId)
                              ? 'ON' : 'OFF' }}
                            </button>
                            <div>
                              <div class="font-mono text-xs font-bold text-gray-300">{{ childPoint.id }}</div>
                              <div class="text-[10px] text-gray-500">{{ childPoint.allowedComponentTypes.join(', ') }}
                              </div>
                            </div>
                          </div>

                          <!-- Child Slot Editor (if active) -->
                          <div
                            v-if="getDummyState(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId) && findSlotForSchemaPoint(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId)"
                            class="w-full">
                            <SlotNode
                              v-if="getSlotTree(findSlotForSchemaPoint(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId)!.slotId)"
                              :node="getSlotTree(findSlotForSchemaPoint(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId)!.slotId)!"
                              :suggestions="suggestions" :highlighted-slot-id="highlightedSlotId"
                              :ref="(el) => { const s = findSlotForSchemaPoint(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId); if (s) setSlotNodeRef(el, s.slotId); }"
                              @update:slot="handleSlotUpdate($event, findSlotForSchemaPoint(schema, childPoint.id, findSlotForSchemaPoint(schema, point.id)!.slotId)!.slotId)"
                              @remove:slot="handleSlotRemove" />
                          </div>

                        </div>
                      </div>

                    </template>
                  </div>
                  <div v-else class="text-red-500 text-xs">
                    Hiba: Slot nem található.
                  </div>
                </div>
              </div>
            </div>

            <!-- SECONDARY POINTS (COLLAPSIBLE) -->
            <div v-if="getSecondaryPoints(corpusAttachmentPoints).length > 0" class="pt-2">
              <button @click="showAllPoints[schema.id] = !showAllPoints[schema.id]"
                class="w-full py-2 text-xs text-gray-500 hover:text-gray-300 bg-gray-800/30 hover:bg-gray-800/50 rounded border border-dashed border-gray-700 hover:border-gray-600 transition-all flex items-center justify-center gap-2">
                <span>{{ showAllPoints[schema.id] ? 'Kevesebb pont mutatása' : `További
                  ${getSecondaryPoints(corpusAttachmentPoints).length} pont megjelenítése` }}</span>
                <span class="text-[10px] transform transition-transform"
                  :class="showAllPoints[schema.id] ? 'rotate-180' : ''">▼</span>
              </button>

              <div v-if="showAllPoints[schema.id]" class="space-y-2 mt-2 pl-4 border-l-2 border-gray-800">
                <div v-for="point in getSecondaryPoints(corpusAttachmentPoints)" :key="point.id"
                  class="bg-gray-900/30 p-2 rounded border border-gray-800 flex items-center justify-between hover:bg-gray-900/50 transition-colors">

                  <div class="flex-grow">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <button @click="toggleDummyInSchema(schema, point.id, !getDummyState(schema, point.id))"
                          class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors"
                          :class="getDummyState(schema, point.id) ? 'bg-green-900/30 text-green-500 border border-green-900 hover:bg-green-900/50' : 'bg-gray-800 text-gray-600 border border-gray-700 hover:bg-gray-700'">
                          {{ getDummyState(schema, point.id) ? 'ON' : 'OFF' }}
                        </button>
                        <span class="font-mono text-xs text-gray-400">{{ point.id }}</span>
                      </div>
                    </div>

                    <!-- HA AKTÍV: SlotNode Editor -->
                    <div v-if="getDummyState(schema, point.id)" class="mt-2 pl-9">
                      <div v-if="findSlotForSchemaPoint(schema, point.id)"
                        class="bg-gray-900/50 rounded border border-gray-700/50 p-2">
                        <template v-if="findSlotForSchemaPoint(schema, point.id)">
                          <SlotNode v-if="getSlotTree(findSlotForSchemaPoint(schema, point.id)!.slotId)"
                            :node="getSlotTree(findSlotForSchemaPoint(schema, point.id)!.slotId)!"
                            :suggestions="suggestions" :highlighted-slot-id="highlightedSlotId"
                            :ref="(el) => { const s = findSlotForSchemaPoint(schema, point.id); if (s) setSlotNodeRef(el, s.slotId); }"
                            @update:slot="handleSlotUpdate($event, findSlotForSchemaPoint(schema, point.id)!.slotId)"
                            @remove:slot="handleSlotRemove" />
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  </div>
</template>
