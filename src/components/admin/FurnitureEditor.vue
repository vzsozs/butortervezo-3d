<script setup lang="ts">
import { computed, ref, provide, type ComponentPublicInstance, watch } from 'vue';
import { storeToRefs } from 'pinia'; // HOZZÁADVA: storeToRefs
import type { FurnitureConfig, ComponentSlotConfig, Schema } from '@/config/furniture'; // HOZZÁADVA: Schema
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';

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
}>();

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const editableFurniture = ref<FurnitureConfig | null>(null);
provide('editableFurniture', editableFurniture);

// --- TAB KEZELÉS ---
const activeTab = ref<'general' | 'layouts'>('general');

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

// Ikonok
const PencilIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;
const EyeIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`;
const EyeOffIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>`;

// 2. Új Séma Létrehozása
function createNewSchema() {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.slotGroups) editableFurniture.value.slotGroups = [];

  // Keressük meg (vagy hozzuk létre) a "Layouts" csoportot
  let layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) {
    layoutGroup = {
      groupId: 'group_layouts',
      name: 'Layouts',
      controlType: 'schema_select',
      controlledSlots: [], // Ezt majd dinamikusan töltjük
      schemas: []
    };
    editableFurniture.value.slotGroups.push(layoutGroup);
  }

  const newSchema: Schema = {
    id: `schema_${Date.now()}`,
    name: 'Új Elrendezés',
    apply: {}
  };

  // Alapértelmezésben minden dummy AKTÍV (az első elérhető komponenssel)
  corpusAttachmentPoints.value.forEach(p => {
    // A slotId-t a dummy nevéből generáljuk (pl. attach_door_L -> slot_door_L)
    const slotId = p.id.replace('attach_', 'slot_');

    // Keressünk default komponenst
    const type = p.allowedComponentTypes[0] || '';
    // storeComponents egy ref, de a template-ben simán használjuk. Itt .value kellhet?
    // A storeToRefs miatt ez egy Ref<Record<...>>.
    const comps = (storeComponents.value && storeComponents.value[type]) || [];
    const defaultCompId = comps[0]?.id || '';

    // Ha van komponens, akkor bekapcsoljuk
    if (defaultCompId) {
      newSchema.apply[slotId] = defaultCompId;
    } else {
      // Ha nincs (pl. üres kategória), akkor inaktív marad
      newSchema.apply[slotId] = null;
    }
  });

  layoutGroup.schemas.push(newSchema);
}

// 3. Séma Törlése
function deleteSchema(schemaIdx: number) {
  if (!editableFurniture.value?.slotGroups) return;
  const layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.schemas.splice(schemaIdx, 1);
  }
}

// Helper: Megkeresi, hogy a sémában melyik slot "tölti be" az adott attachment pointot.
function findSlotForSchemaPoint(schema: Schema, pointId: string): { slotId: string, componentId: string } | null {
  if (!editableFurniture.value?.componentSlots) return null;

  for (const [slotId, componentId] of Object.entries(schema.apply)) {
    if (!componentId) continue; // Inaktív

    const slot = editableFurniture.value.componentSlots.find(s => s.slotId === slotId);
    if (!slot) continue;

    // Ellenőrizzük a mappinget
    // 1. Ha van attachmentMapping és a kiválasztott komponenshez tartozik szabály
    if (slot.attachmentMapping && slot.attachmentMapping[componentId]) {
      if (slot.attachmentMapping[componentId]?.includes(pointId)) return { slotId, componentId };
    }
    // 2. Ha nincs mapping, vagy nincs szabály, akkor a slot alapértelmezett pontját nézzük?
    // A schema logika szerint a komponens választás vezérli a pontot.
    // Ha a slot "fix" (nincs mapping), akkor a useAttachmentPoint a mérvadó.
    else if (slot.useAttachmentPoint === pointId) {
      return { slotId, componentId };
    }

    // 3. Fallback: A slot ID-ból következtetünk (régi logika kompatibilitás)
    if (slotId === pointId.replace('attach_', 'slot_')) {
      return { slotId, componentId };
    }
  }
  return null;
}

// Helper: Megkeresi a legjobb szabad slotot egy új attachment point aktiválásához
function findBestSlotForPoint(schema: Schema, pointId: string, componentType: string): string {
  // Ha nincs slot lista, akkor generálunk egyet
  if (!editableFurniture.value?.componentSlots) return generateFriendlySlotId(componentType);

  // 1. Gyűjtsük ki azokat a slotokat, amik már foglaltak ebben a sémában
  const usedSlotIds = new Set<string>();
  for (const [sId, cId] of Object.entries(schema.apply)) {
    if (cId) usedSlotIds.add(sId);
  }

  // 2. Keressünk kompatibilis, szabad slotokat
  const candidates = editableFurniture.value.componentSlots.filter(slot => {
    // Típus egyezés
    if (slot.componentType !== componentType) return false;

    // Már foglalt?
    if (usedSlotIds.has(slot.slotId)) return false;

    // Képes csatlakozni ehhez a ponthoz?
    // Vagy fixen ezen van, vagy van mappingje hozzá (bármelyik komponenssel)
    const isFixedHere = slot.useAttachmentPoint === pointId;
    const canMapHere = slot.attachmentMapping && Object.values(slot.attachmentMapping).some(points => points.includes(pointId));

    return isFixedHere || canMapHere;
  });

  // 3. Válasszuk ki a legjobbat
  if (candidates.length > 0) {
    return candidates[0]!.slotId;
  }

  // 4. Ha nincs szabad, generáljunk újat BARÁTSÁGOS névvel ÉS HOZZUK IS LÉTRE
  const newSlotId = generateFriendlySlotId(componentType);

  // Létrehozás
  const corpusSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  const newSlot: ComponentSlotConfig = {
    slotId: newSlotId,
    name: `${slotTemplates[componentType.replace(/s$/, '')]?.name || componentType} ${newSlotId.split('_')[1]}`, // Pl. Ajtó 2
    componentType: componentType,
    allowedComponents: [],
    defaultComponent: null,
    attachToSlot: corpusSlot?.slotId || '',
    useAttachmentPoint: pointId, // Itt tudjuk a pointId-t!
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    isAutoGenerated: true // Rejtett slot
  };

  editableFurniture.value.componentSlots.push(newSlot);

  return newSlotId;
}

function generateFriendlySlotId(componentType: string): string {
  // Keressük meg a template prefixet
  let prefix = 'slot';
  for (const key in slotTemplates) {
    if (slotTemplates[key]!.type === componentType) {
      prefix = slotTemplates[key]!.prefix;
      break;
    }
  }

  // Keressünk egy szabad számot
  let count = 1;
  while (editableFurniture.value?.componentSlots?.some(s => s.slotId === `${prefix}_${count}`) ?? false) {
    count++;
  }

  return `${prefix}_${count}`;
}

// Helper a UI-hoz: Melyik sémában mi az állapot
function getDummyState(schema: Schema, pointId: string) {
  return findSlotForSchemaPoint(schema, pointId) !== null;
}

function getDummyComponent(schema: Schema, pointId: string) {
  const result = findSlotForSchemaPoint(schema, pointId);
  return result ? result.componentId : '';
}

function setDummyComponent(schema: Schema, pointId: string, componentId: string) {
  // Ha már aktív, akkor a meglévő slotot frissítjük
  const current = findSlotForSchemaPoint(schema, pointId);
  if (current) {
    schema.apply[current.slotId] = componentId;
  } else {
    // Ha nem aktív, akkor aktiváljuk (ez elvileg nem fordulhat elő a UI-n, mert a select csak aktívnál látszik)
    toggleDummyInSchema(schema, pointId, true);
    // Majd beállítjuk a komponenst
    const newCurrent = findSlotForSchemaPoint(schema, pointId);
    if (newCurrent) schema.apply[newCurrent.slotId] = componentId;
  }

  // Auto-preview frissítés
  if (activePreviewSchemaId.value === schema.id) applyPreview(schema);
}

// 4. Séma Szerkesztése (Dummy Toggle)
function toggleDummyInSchema(schema: Schema, pointId: string, isActive: boolean) {
  if (isActive) {
    // AKTÍV: Kell egy slot és egy komponens
    const pointDef = corpusAttachmentPoints.value.find(p => p.id === pointId);
    if (!pointDef) return;

    const type = pointDef.allowedComponentTypes[0] || '';

    // Keressünk slotot
    const slotId = findBestSlotForPoint(schema, pointId, type);

    // Keressünk default komponenst
    const comps = (storeComponents.value && storeComponents.value[type]) || [];
    const defaultCompId = comps[0]?.id || '';

    schema.apply[slotId] = defaultCompId;

  } else {
    // INAKTÍV: Megkeressük ki tölti be, és nullázzuk
    const current = findSlotForSchemaPoint(schema, pointId);
    if (current) {
      schema.apply[current.slotId] = null;
    }
  }

  updateControlledSlots();

  // Auto-preview szerkesztéskor
  if (activePreviewSchemaId.value !== schema.id) {
    togglePreview(schema.id);
  } else {
    applyPreview(schema);
  }
}

// 6. Preview Logika
const activePreviewSchemaId = ref<string | null>(null);
const previewBackup = ref<Record<string, string | null>>({}); // SlotId -> defaultComponent

function togglePreview(schemaId: string) {
  if (activePreviewSchemaId.value === schemaId) {
    // Kikapcsolás
    activePreviewSchemaId.value = null;
    clearPreview();
  } else {
    // Ha már volt aktív más preview, először takarítsunk
    if (activePreviewSchemaId.value) clearPreview();

    // Bekapcsolás
    activePreviewSchemaId.value = schemaId;
    const schema = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts')?.schemas.find(s => s.id === schemaId);
    if (schema) applyPreview(schema);
  }
}

function applyPreview(schema: Schema) {
  if (!editableFurniture.value?.componentSlots) return;

  // Végigmegyünk a séma szabályain
  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    const targetSlot = editableFurniture.value!.componentSlots.find(s => s.slotId === slotId);

    // Visszafejtjük az attachment point ID-t
    const attachPointId = slotId.replace('slot_', 'attach_');

    // KERESSÜNK KONFLIKTUST: Van-e MÁS slot, ami ugyanezt a pontot használja?
    const conflictingSlots = editableFurniture.value!.componentSlots.filter(s =>
      s.useAttachmentPoint === attachPointId && s.slotId !== slotId
    );

    conflictingSlots.forEach(conflict => {
      // Mentjük a konfliktusos slot állapotát
      if (!(conflict.slotId in previewBackup.value)) {
        previewBackup.value[conflict.slotId] = conflict.defaultComponent;
      }

      // Ha a target slot (schema slot) létezik, másoljuk át rá a konfliktusos slot beállításait (rotáció, pozíció)
      // Ez "Smart Import": Ha a user kézzel beállította a rotációt, ne vesszen el.
      if (targetSlot && conflict.defaultComponent) {
        // Csak akkor másolunk, ha a target slot még "szűz" (pl. 0 rotáció) vagy ha mindig szinkronizálni akarunk?
        // Inkább mindig másoljuk át a vizuális beállításokat, ha a konfliktusos slot aktív volt.
        targetSlot.position = { x: conflict.position?.x || 0, y: conflict.position?.y || 0, z: conflict.position?.z || 0 };
        targetSlot.rotation = { x: conflict.rotation?.x || 0, y: conflict.rotation?.y || 0, z: conflict.rotation?.z || 0 };
        targetSlot.scale = { x: conflict.scale?.x || 1, y: conflict.scale?.y || 1, z: conflict.scale?.z || 1 };
      }

      // Kikapcsoljuk a konfliktusos slotot (hogy ne legyen duplázódás)
      conflict.defaultComponent = null;
    });

    if (targetSlot) {
      // Mentjük a target slot eredeti állapotát is
      if (!(slotId in previewBackup.value)) {
        previewBackup.value[slotId] = targetSlot.defaultComponent;
      }

      if (componentId === null) {
        // Inaktív: Nincs komponens
        targetSlot.defaultComponent = null;
      } else {
        // Aktív: Beállítjuk a komponenst
        targetSlot.defaultComponent = componentId || '';
      }
    }
  });

  // "Szellemek" kezelése: Azok a slotok, amik a Layouts csoporthoz tartoznak, de ebben a sémában nincsenek definiálva
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.controlledSlots.forEach(slotId => {
      if (schema.apply[slotId] === undefined) {
        const slot = editableFurniture.value!.componentSlots.find(s => s.slotId === slotId);
        if (slot) {
          if (!(slotId in previewBackup.value)) {
            previewBackup.value[slotId] = slot.defaultComponent;
          }
          slot.defaultComponent = null;
        }
      }
    });
  }
}

function clearPreview() {
  if (!editableFurniture.value?.componentSlots) return;

  // Visszaállítás a backupból
  Object.entries(previewBackup.value).forEach(([slotId, originalComponent]) => {
    const slot = editableFurniture.value!.componentSlots.find(s => s.slotId === slotId);
    if (slot) {
      slot.defaultComponent = originalComponent;
    }
  });

  // Backup törlése
  previewBackup.value = {};
}

// 5. Controlled Slots Frissítése (Compiler)
// Minden olyan slotnak léteznie kell, ami LEGALÁBB EGY sémában aktív.
function updateControlledSlots() {
  if (!editableFurniture.value?.slotGroups) return;
  const layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) return;

  const activeSlotIds = new Set<string>();

  layoutGroup.schemas.forEach(schema => {
    // Ha van aktív preview, és ez NEM az, akkor hagyjuk figyelmen kívül
    // DE: A "controlledSlots" listába mindenképp be kell kerülnie az összes lehetséges slotnak,
    // különben a 3D motor nem tudja hova tenni a dolgokat.
    // A preview logika máshol dől el (a slotok láthatóságánál vagy a default komponenseknél).

    // JAVÍTÁS: A compilernek MINDEN sémát figyelembe kell vennie, hogy a slotok létezzenek.
    // Azt, hogy melyik látszik, a 3D nézetben a "defaultComponent" vagy a "visible" property dönti el?
    // Jelenleg a rendszer úgy működik, hogy a slotok statikusak, és a tartalmuk változik.

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
      // Létre kell hozni a slotot
      // Visszafejtjük a dummy nevet: slot_X -> attach_X
      // VAGY: Ha friendly ID-t használunk (pl. front_2), akkor nem tudjuk egyszerűen visszafejteni.
      // De a `findBestSlotForPoint` már eldöntötte, hogy ehhez a ponthoz ez a slot tartozik.
      // A kérdés: Melyik ponthoz?
      // A `activeSlotIds` csak a slot ID-kat tartalmazza.
      // Meg kell keresnünk, hogy melyik sémában, melyik ponthoz van rendelve ez a slot.

      let attachPointId = '';

      // Keressük meg az első sémát, ahol ez a slot aktív
      const layoutGroup = editableFurniture.value!.slotGroups!.find(g => g.name === 'Layouts');
      if (layoutGroup) {
        for (const schema of layoutGroup.schemas) {
          // Keressük meg a kulcsot (slotId)
          if (schema.apply[slotId]) {
            // De ez a slotId. Nekünk az attachment point kellene.
            // A `schema.apply` kulcsa a SlotID.
            // Hogy tudjuk meg az AttachmentPoint ID-t?
            // A `toggleDummyInSchema` híváskor a `schema.apply[slotId]`-t állítjuk be.
            // De nem tároljuk el, hogy melyik pointId-hez tartozik.
            // BAJ: Ha friendly ID-t használunk, elveszítjük a kapcsolatot a pointId-vel a sémában?
            // A sémában csak SlotID -> ComponentID van.
            // A kapcsolatot a Slot definíciója (useAttachmentPoint) vagy a Mapping adja.
            // Ha a slot még nem létezik, honnan tudjuk, hova kell csatolni?

            // MEGOLDÁS: A `findBestSlotForPoint` visszatérési értéke csak egy string.
            // Amikor a `toggleDummyInSchema` meghívja, és beállítja a `schema.apply`-t,
            // akkor még tudjuk a pointId-t.
            // De itt, a `updateControlledSlots`-ban már nem.

            // VISSZALÉPÉS: A `updateControlledSlots` nem tudja kitalálni a pointId-t, ha a slotId nem tartalmazza.
            // Ezért a slotot LÉTRE KELL HOZNI abban a pillanatban, amikor a `findBestSlotForPoint` generálja?
            // Vagy: A `findBestSlotForPoint` ne csak stringet adjon, hanem hozzon létre slotot ha kell?
            // Igen!
          }
        }
      }

      // Mivel a fenti logika bonyolult, egyszerűsítsünk:
      // A `findBestSlotForPoint` felelőssége legyen a slot létrehozása is, ha újat generál.
      // Így mire ide érünk, a slot már létezik.
      // Tehát itt csak azokat hozzuk létre, amik "véletlenül" hiányoznak?
      // Vagy töröljük ezt a logikát innen?

      // Ha a slot nem létezik, de a sémában benne van, az baj.
      // Próbáljuk meg kitalálni a nevéből, ha "slot_attach_" kezdetű.
      if (slotId.startsWith('slot_attach_')) {
        attachPointId = slotId.replace('slot_', 'attach_');
      } else {
        // Ha friendly name (pl. front_2), és nem létezik...
        // Akkor bajban vagyunk.
        // De ha a `findBestSlotForPoint` létrehozza, akkor ez az ág sosem fut le.
      }

      if (attachPointId) {
        const pointDef = corpusAttachmentPoints.value.find(p => p.id === attachPointId);
        const newSlot: ComponentSlotConfig = {
          slotId: slotId,
          name: pointDef ? pointDef.id : slotId,
          componentType: (pointDef && pointDef.allowedComponentTypes.length > 0) ? pointDef.allowedComponentTypes[0]! : 'unknown',
          allowedComponents: [],
          defaultComponent: null,
          attachToSlot: editableFurniture.value!.componentSlots.find(s => s.slotId.includes('corpus'))?.slotId || '',
          useAttachmentPoint: attachPointId,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        };
        editableFurniture.value!.componentSlots.push(newSlot);
      }
    }
  });

  // 3. (Opcionális) Töröljük azokat a slotokat, amik már SEHOL nem aktívak?
  // Ezt óvatosan, mert lehet, hogy kézzel hozták létre.
  // Egyelőre hagyjuk meg őket, legfeljebb árvák lesznek.
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
function saveChanges() {
  // Mentés előtt futtassuk le a compilert biztos ami biztos
  updateControlledSlots();

  // HA van aktív preview, akkor kapcsoljuk ki, hogy NE a preview állapotot mentsük el!
  if (activePreviewSchemaId.value) {
    clearPreview();
    activePreviewSchemaId.value = null;
  }

  if (editableFurniture.value) emit('save', editableFurniture.value as FurnitureConfig);
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
      <button @click="{ activeTab = 'general'; clearPreview(); activePreviewSchemaId = null; }"
        class="pb-2 px-2 text-sm font-bold transition-colors border-b-2"
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

        <div class="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
          <div class="flex items-center gap-3">
            <h4 class="text-lg font-bold text-white">{{ groupData.title }}</h4>
            <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{{ groupData.slots.length }}
              db</span>
          </div>
        </div>

        <div class="p-4 space-y-4">
          <SlotNode v-for="slot in groupData.slots" :key="slot.slotId" :node="slot" :suggestions="suggestions"
            :highlighted-slot-id="highlightedSlotId" :ref="(el) => setSlotNodeRef(el, slot.slotId)"
            @update:slot="handleSlotUpdate($event, slot.slotId)" @remove:slot="handleSlotRemove" />
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
          :class="{ 'ring-2 ring-blue-500': activePreviewSchemaId === schema.id }">

          <!-- SÉMA FEJLÉC -->
          <div class="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-700">
            <div class="flex items-center gap-2 flex-grow">
              <span class="text-gray-500" v-html="PencilIcon"></span>
              <input type="text" v-model="schema.name"
                class="bg-transparent text-white font-bold focus:outline-none focus:border-b border-blue-500 w-full max-w-xs" />
            </div>

            <div class="flex items-center gap-2">
              <button @click="togglePreview(schema.id)"
                class="p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wide"
                :class="activePreviewSchemaId === schema.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'">
                <span v-html="activePreviewSchemaId === schema.id ? EyeIcon : EyeOffIcon"></span>
                {{ activePreviewSchemaId === schema.id ? 'Preview' : 'Preview' }}
              </button>
              <button @click="deleteSchema(idx)"
                class="text-red-400 hover:text-red-300 text-xs bg-red-900/20 hover:bg-red-900/40 px-2 py-1.5 rounded ml-2">Törlés</button>
            </div>
          </div>

          <!-- DUMMY TÁBLÁZAT -->
          <div class="p-4">
            <table class="w-full text-left text-sm text-gray-300">
              <thead>
                <tr class="border-b border-gray-700 text-gray-500 uppercase text-xs">
                  <th class="py-2 w-1/3">Pozíció</th>
                  <th class="py-2 text-center w-24">Állapot</th>
                  <th class="py-2">Komponens</th>
                </tr>
              </thead>
              <tbody>
                <!-- PRIMARY POINTS -->
                <tr v-for="point in getPrimaryPoints(corpusAttachmentPoints)" :key="point.id"
                  class="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td class="py-2 font-mono text-blue-300 text-xs">{{ point.id }}</td>

                  <!-- ÁLLAPOT (AKTÍV / INAKTÍV) -->
                  <td class="py-2 text-center">
                    <button @click="toggleDummyInSchema(schema, point.id, !getDummyState(schema, point.id))"
                      class="px-2 py-1 rounded text-[10px] font-bold transition-colors w-16 uppercase"
                      :class="getDummyState(schema, point.id) ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'">
                      {{ getDummyState(schema, point.id) ? 'ON' : 'OFF' }}
                    </button>
                  </td>

                  <!-- KOMPONENS VÁLASZTÓ -->
                  <td class="py-2">
                    <div v-if="getDummyState(schema, point.id)">
                      <select :value="getDummyComponent(schema, point.id)"
                        @change="setDummyComponent(schema, point.id, ($event.target as HTMLSelectElement).value)"
                        class="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-blue-500 outline-none">
                        <option value="" disabled>Válassz...</option>
                        <option
                          v-for="comp in (storeComponents && storeComponents[point.allowedComponentTypes[0] || ''] || [])"
                          :key="comp.id" :value="comp.id">
                          {{ comp.name }}
                        </option>
                      </select>
                    </div>
                    <span v-else class="text-gray-600 text-xs">-</span>
                  </td>
                </tr>
              </tbody>

              <!-- SECONDARY POINTS (COLLAPSIBLE) -->
              <tbody v-if="getSecondaryPoints(corpusAttachmentPoints).length > 0">
                <tr>
                  <td colspan="3" class="py-2 text-center">
                    <button @click="showAllPoints[schema.id] = !showAllPoints[schema.id]"
                      class="text-xs text-gray-500 hover:text-gray-300 flex items-center justify-center gap-1 w-full py-1 bg-gray-800/50 hover:bg-gray-800 transition-colors rounded">
                      {{ showAllPoints[schema.id] ? 'Kevesebb mutatása' : `További
                      ${getSecondaryPoints(corpusAttachmentPoints).length} pozíció...` }}
                    </button>
                  </td>
                </tr>
                <template v-if="showAllPoints[schema.id]">
                  <tr v-for="point in getSecondaryPoints(corpusAttachmentPoints)" :key="point.id"
                    class="border-b border-gray-700/50 hover:bg-gray-700/30 bg-gray-900/30">
                    <td class="py-2 font-mono text-gray-400 text-xs pl-2">{{ point.id }}</td>

                    <td class="py-2 text-center">
                      <button @click="toggleDummyInSchema(schema, point.id, !getDummyState(schema, point.id))"
                        class="px-2 py-1 rounded text-[10px] font-bold transition-colors w-16 uppercase"
                        :class="getDummyState(schema, point.id) ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'">
                        {{ getDummyState(schema, point.id) ? 'ON' : 'OFF' }}
                      </button>
                    </td>

                    <td class="py-2">
                      <div v-if="getDummyState(schema, point.id)">
                        <select :value="getDummyComponent(schema, point.id)"
                          @change="setDummyComponent(schema, point.id, ($event.target as HTMLSelectElement).value)"
                          class="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-blue-500 outline-none">
                          <option value="" disabled>Válassz...</option>
                          <option
                            v-for="comp in (storeComponents && storeComponents[point.allowedComponentTypes[0] || ''] || [])"
                            :key="comp.id" :value="comp.id">
                            {{ comp.name }}
                          </option>
                        </select>
                      </div>
                      <span v-else class="text-gray-600 text-xs">-</span>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </div>

  </div>
</template>
