<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config'
import type { ComponentSlotConfig, SlotGroup, FurnitureConfig, ComponentConfig } from '@/config/furniture'

const selectionStore = useSelectionStore()
const configStore = useConfigStore()

// --- LOGGER HELPER ---
// Alulvonással (_) kezdjük a változókat, hogy az ESLint ne szóljon, ha nincsenek használva
function log(_msg: string, _data?: any) {
  // Jelenleg kikapcsolva
  // if (_data) console.log(`[Inspector] ${_msg}`, _data);
  // else console.log(`[Inspector] ${_msg}`);
}

// --- DRAGGABLE SETUP ---
const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)
const initialX = window.innerWidth - 340
const initialY = 100
const { style } = useDraggable(panelRef, {
  initialValue: { x: initialX > 0 ? initialX : 100, y: initialY },
  handle: dragHandleRef,
  preventDefault: false,
})

// --- ALAP ADATOK ---
const selectedObject = computed(() => selectionStore.selectedObject)
const currentConfig = computed(() => selectionStore.selectedObjectConfig)
const furnitureDef = computed<FurnitureConfig | undefined>(() => {
  if (!currentConfig.value) return undefined
  return configStore.getFurnitureById(currentConfig.value.id) || currentConfig.value;
})

const currentState = computed(() => selectedObject.value?.userData.componentState || {})

// --- ANYAGVÁLASZTÓ STATE ---
const activeMaterialControl = ref<InspectorControl | null>(null);

// --- HELPER A TEXTÚRÁKHOZ ---
function getCurrentMaterial(slotId: string): any {
  const matId = getCurrentMaterialId(slotId);

  const found = materials.value.find(m => m.id === matId);
  const systemDefault = materials.value.find(m => m.id === 'default_material');

  // Biztosan visszaadunk valamit, aminek van 'type' és 'value' mezője
  return found || systemDefault || { type: 'color', value: '#cccccc', name: 'Loading...', thumbnail: '' };
}


// --- ÚJ SEGÉDFÜGGVÉNYEK A TEMPLATE-HEZ (Hogy ne legyen TS hiba) ---

function getMatType(slotId: string): string {
  // Mivel a getCurrentMaterial most már 'any', nem dob hibát a .type elérésre
  return getCurrentMaterial(slotId)?.type || 'color';
}

function getMatValue(slotId: string): string {
  return getCurrentMaterial(slotId)?.value || '#cccccc';
}

function getMatThumbnail(slotId: string): string {
  const mat = getCurrentMaterial(slotId);
  return mat?.thumbnail || mat?.value || '';
}

// --- AJTÓ LÁTHATÓSÁG & LOGIKA ---
const areDoorsVisible = ref(true);
const lastConfigId = ref<string | null>(null);
const lastKnownObject = ref<any>(null);

onUnmounted(() => {
  if (lastKnownObject.value) {
    // Kényszerített visszaállítás az utolsó ismert objektumon
    forceRestoreVisibility(lastKnownObject.value);
  }
});

watch(() => selectedObject.value, async (newObj, oldObj) => {
  // 1. KILÉPÉS (Deselection)
  if (!newObj) {
    if (oldObj) {
      forceRestoreVisibility(oldObj);
    }
    lastConfigId.value = null;
    lastKnownObject.value = null;
    return;
  }

  // Frissítjük az utolsó ismert objektumot
  lastKnownObject.value = newObj;

  //const newUuid = newObj.uuid;
  const currentId = currentConfig.value?.id;

  // 2. ÚJ BÚTOR KIJELÖLÉSE
  // Akkor tekintjük újnak, ha a config ID változott, VAGY ha eddig nem volt semmi kijelölve
  const isNewFurniture = currentId !== lastConfigId.value;

  if (isNewFurniture) {
    log(`New furniture selected. Resetting view.`);
    areDoorsVisible.value = true;
    lastConfigId.value = currentId || null;

    await nextTick();

    // 🔥 JAVÍTÁS: await használata
    await checkDefaults();
  } else {
    // 3. UGYANAZ A BÚTOR (pl. polc állítás miatti újragenerálás)
    // Ilyenkor NEM bántjuk az areDoorsVisible értékét, marad, ami volt (pl. false)
    log(`Same furniture updated. Keeping view state: ${areDoorsVisible.value}`);
  }

  // Alkalmazzuk a jelenlegi állapotot az új objektumra
  applyDoorVisibility();
}, { immediate: true }); // Fontos: azonnal fusson le betöltéskor is


// Segédfüggvény a biztos visszaállításhoz (kilépéskor)
function forceRestoreVisibility(object: any) {
  object.traverse((child: any) => {
    if (!child.isMesh) return;

    // Minden releváns elem visszaállítása
    const name = child.name.toLowerCase();
    const slotId = (child.userData.slotId || '').toLowerCase();
    const isFront = name.includes('front') || slotId.includes('front') || name.includes('door') || slotId.includes('door');
    const isHandle = name.includes('handle') || slotId.includes('handle');

    if (isFront || isHandle) {
      child.castShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat: any) => {
        if (mat.userData.originalOpacity !== undefined) {
          mat.opacity = mat.userData.originalOpacity;
          mat.transparent = mat.userData.originalTransparent;
          mat.depthWrite = mat.userData.originalDepthWrite;
          // Clean up
          delete mat.userData.originalOpacity;
          delete mat.userData.originalTransparent;
          delete mat.userData.originalDepthWrite;
        } else {
          // Fallback
          mat.opacity = 1.0;
          mat.transparent = false;
          mat.depthWrite = true;
        }
        mat.needsUpdate = true;
      });
    }
  });
}

// Számított lista: Csak azokat az anyagokat mutatjuk, amik passzolnak az elemhez
const availableMaterialsForActiveControl = computed(() => {
  if (!activeMaterialControl.value) return [];

  const slot = activeMaterialControl.value.referenceSlot;

  // 1. Megnézzük, mi van most a slotban (hogy tudjuk a kategóriát)
  const currentId = selectedObject.value?.userData.componentState?.[slot.slotId];
  const comp = configStore.getComponentById(currentId || '');

  // 2. Mik az engedélyezett kategóriák? (pl. ["Bútorlap", "Fa"])
  // Ha a komponensen nincs definiálva, akkor mindent engedünk (vagy semmit, döntés kérdése)
  const allowedCats = comp?.allowedMaterialCategories || [];

  if (allowedCats.length === 0) return configStore.materials; // Ha nincs szűrés, minden mehet

  // 3. Szűrés
  return configStore.materials.filter(mat => {
    const matCats = Array.isArray(mat.category) ? mat.category : [mat.category];
    // Van-e közös metszet?
    return matCats.some(c => allowedCats.includes(c));
  });
});

function openMaterialSelector(control: InspectorControl) {
  activeMaterialControl.value = control;
}

function closeMaterialSelector() {
  activeMaterialControl.value = null;
}

function selectMaterial(materialId: string) {
  if (!activeMaterialControl.value) return;

  // Összegyűjtjük az összes érintett slotot (csoportosítás miatt)
  const updates = activeMaterialControl.value.slots.map(slot => ({
    slotId: slot.slotId,
    materialId: materialId
  }));

  // Küldés a store-nak
  selectionStore.changeMaterials(updates);

  closeMaterialSelector();
}


async function checkDefaults() {
  const def = furnitureDef.value;
  // Ha nincs slotGroups, vagy üres, akkor ez egy egyszerű bútor -> KÉSZ, nem kell csinálni semmit.
  if (!def?.slotGroups || def.slotGroups.length === 0) return;

  // 🔥 JAVÍTÁS: Ha már inicializálva van a bútor, ne írjuk felül a layoutot!
  if (selectedObject.value?.userData?.initialized) {
    return;
  }

  for (const [index, group] of def.slotGroups.entries()) {
    if (!group.defaultSchemaId) continue;

    const defaultSchema = group.schemas.find((s: any) => s.id === group.defaultSchemaId);
    if (!defaultSchema) continue;

    const state = currentState.value;
    let needsUpdate = false;

    // 1. Layout ellenőrzés (Apply lista alapján)
    if (defaultSchema.apply && Object.keys(defaultSchema.apply).length > 0) {
      for (const requiredSlot of Object.keys(defaultSchema.apply)) {
        // Ha a state-ből hiányzik egy olyan slot, amit a séma megkövetel (pl. root__...),
        // akkor biztosan frissíteni kell.
        if (!state[requiredSlot]) {
          needsUpdate = true;
          break;
        }
      }
    }

    // 2. Polc ellenőrzés
    if (defaultSchema.type === 'shelf' && (defaultSchema as any).shelfConfig?.count > 0) {
      const hasShelves = Object.keys(state).some(k => k.startsWith('shelf_'));
      if (!hasShelves) needsUpdate = true;
    }

    // Csak akkor alkalmazzuk, ha tényleg indokolt!
    if (needsUpdate) {
      console.log(`[Inspector] 🛠️ Kezdeti állapot konvertálása: ${defaultSchema.name}`);
      await selectionStore.applySchema(index, group.defaultSchemaId);
    }
  }

  // 🔥 JAVÍTÁS: Megjelöljük, hogy inicializálva van
  if (selectedObject.value) {
    selectedObject.value.userData.initialized = true;
  }
}

function toggleDoors() {
  areDoorsVisible.value = !areDoorsVisible.value;
  applyDoorVisibility();
}

function applyDoorVisibility() {
  setTimeout(() => {
    if (!selectedObject.value) return;

    const isGhostMode = !areDoorsVisible.value;

    selectedObject.value.traverse((child: any) => {
      if (!child.isMesh) return;

      const name = child.name.toLowerCase();
      const slotId = (child.userData.slotId || '').toLowerCase();

      const isFront = name.includes('front') || slotId.includes('front') || name.includes('door') || slotId.includes('door');
      const isHandle = name.includes('handle') || slotId.includes('handle') || name.includes('fogantyu');
      const isDrawerFront = name.includes('drawer') && name.includes('front');

      if (isFront || isHandle || isDrawerFront) {
        child.castShadow = !isGhostMode;

        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((mat: any) => {
          if (isGhostMode) {
            // --- GHOST MÓD ---
            if (mat.userData.originalOpacity === undefined) {
              mat.userData.originalOpacity = mat.opacity;
              mat.userData.originalTransparent = mat.transparent;
              mat.userData.originalDepthWrite = mat.depthWrite;
            }

            mat.transparent = true;
            mat.opacity = 0.2;
            mat.depthWrite = false;

          } else {
            // --- NORMÁL MÓD ---
            if (mat.userData.originalOpacity !== undefined) {
              mat.opacity = mat.userData.originalOpacity;
              mat.transparent = mat.userData.originalTransparent;
              mat.depthWrite = mat.userData.originalDepthWrite;

              delete mat.userData.originalOpacity;
              delete mat.userData.originalTransparent;
              delete mat.userData.originalDepthWrite;
            } else {
              mat.opacity = 1.0;
              mat.transparent = false;
              mat.depthWrite = true;
            }
          }
          mat.needsUpdate = true;
        });
      }
    });
  }, 50);
}

// --- POLC LOGIKA ---

function hasShelfSchema(group: SlotGroup): boolean {
  return group.schemas.some((s: any) => s.type === 'shelf' || (s.shelfConfig !== undefined));
}

function hasLayoutSchema(group: SlotGroup): boolean {
  return group.schemas.some((s: any) => s.type !== 'shelf');
}

function getMaxShelves(group: SlotGroup): number {
  if (!currentConfig.value) return 5;

  const corpusSlotDef = currentConfig.value.componentSlots.find(s => s.componentType === 'corpuses');

  if (corpusSlotDef) {
    const activeCorpusId = currentState.value[corpusSlotDef.slotId];
    if (activeCorpusId) {
      const corpusComp = configStore.getComponentById(activeCorpusId);
      if (corpusComp?.properties?.maxShelves !== undefined) {
        return corpusComp.properties.maxShelves;
      }
    }
  }
  return group.controlledSlots.length > 0 ? group.controlledSlots.length : 5;
}

function getShelfCount(group: SlotGroup): number {
  // 1. Megnézzük a valós 3D állapotot
  const state = currentState.value;

  // Van-e olyan slot a jelenlegi állapotban, ami 'shelf_'-el kezdődik?
  const hasPhysicalShelves = Object.keys(state).some(key => key.startsWith('shelf_'));

  // 2. Ha a 3D-ben nincsenek polcok, akkor az input legyen 0.
  // Ez felülírja a JSON-ban lévő "count: 2" alapértéket induláskor.
  if (!hasPhysicalShelves) {
    return 0;
  }

  // 3. Ha VAN polc a 3D-ben, akkor a configból olvassuk ki az értéket
  // (Így szinkronban maradunk a beállított értékkel)
  if (currentConfig.value && currentConfig.value.slotGroups) {
    const dynamicGroup = currentConfig.value.slotGroups.find(g => g.groupId === group.groupId);
    if (dynamicGroup) {
      const shelfSchema = dynamicGroup.schemas.find((s: any) => s.type === 'shelf');
      if (shelfSchema && (shelfSchema as any).shelfConfig) {
        return (shelfSchema as any).shelfConfig.count ?? 0;
      }
    }
  }

  return 0;
}

function setShelfCount(groupIndex: number, group: SlotGroup, count: number) {
  const config = currentConfig.value;
  if (!config) return;

  const max = getMaxShelves(group);
  const safeCount = Math.max(0, Math.min(count, max));

  if (areDoorsVisible.value) {
    areDoorsVisible.value = false;
    applyDoorVisibility();
  }

  const storeGroup = config.slotGroups?.find(g => g.groupId === group.groupId);
  const shelfSchema = storeGroup?.schemas.find((s: any) => s.type === 'shelf');

  if (shelfSchema && (shelfSchema as any).shelfConfig) {
    (shelfSchema as any).shelfConfig.count = safeCount;
    selectionStore.applySchema(groupIndex, shelfSchema.id);
  }
}

// --- EGYÉB LOGIKA ---

const dimensions = computed(() => {
  if (!selectedObject.value || !currentConfig.value) return null;
  const corpusSlot = currentConfig.value.componentSlots.find(s => s.componentType === 'corpuses' || s.slotId.includes('corpus'));

  if (corpusSlot) {
    const corpusId = currentState.value[corpusSlot.slotId];
    const corpusComp = configStore.getComponentById(corpusId);
    if (corpusComp?.properties) {
      return {
        width: corpusComp.properties.width ?? '-',
        height: corpusComp.properties.height ?? '-',
        depth: corpusComp.properties.depth ?? '-'
      }
    }
  }
  return { width: '-', height: currentConfig.value.height ?? '-', depth: '-' }
})

const slotGroups = computed(() => furnitureDef.value?.slotGroups ?? [])
const materials = computed(() => configStore.materials)

// --- UI CSOPORTOSÍTÁS DEFINÍCIÓK ---

// Egy "Vezérlő" a felületen. Ez lehet egyetlen slot, vagy több slot összevonva.
interface InspectorControl {
  id: string;           // Egyedi azonosító a v-for-hoz
  label: string;        // A felirat (pl. "Bal Ajtó" vagy "Közös beállítás")
  slots: ComponentSlotConfig[]; // Az érintett slotok listája (lehet 1 vagy több)
  referenceSlot: ComponentSlotConfig; // Referencia a dropdown tartalmához (allowedComponents)
  currentValue: string; // A jelenleg kiválasztott érték (az első slot alapján)
  isGrouped: boolean;   // Jelzi, ha ez egy összevont vezérlő
}


// --- UI CSOPORTOSÍTÁS ---
interface DisplayGroup {
  id: string;
  label: string;
  controls: InspectorControl[];
}

function resolveGroupKey(slot: ComponentSlotConfig, activeComponentId: string): string {
  // 1. Ha van aktív komponens, annak a típusa a döntő (ez a legbiztosabb)
  if (activeComponentId) {
    const comp = configStore.getComponentById(activeComponentId);
    if (comp?.componentType) {
      const group = normalizeType(comp.componentType);
      if (group !== 'others') return group;
    }
  }

  // 2. Ha a slot definícióban van típus
  if (slot.componentType) {
    const group = normalizeType(slot.componentType);
    if (group !== 'others') return group;
  }

  // 3. ID alapú detektálás (Hierarchia kezeléssel!)
  // A teljes 'root__attach_front__attach_handle' helyett csak az utolsó tagot nézzük: 'attach_handle'
  const fullId = slot.slotId.toLowerCase();
  const localId = fullId.split('__').pop() || fullId;

  // Fontos: A sorrend számít, de a localId miatt már biztonságosabb
  if (localId.includes('handle') || localId.includes('fogantyu')) return 'handles';
  if (localId.includes('leg') || localId.includes('lab')) return 'legs';
  if (localId.includes('drawer') || localId.includes('fiok')) return 'drawers';

  // A 'front' vizsgálatnál kizárjuk, ha csak a szülő nevében szerepelt (bár a split már megoldotta)
  if (localId.includes('door') || localId.includes('front') || localId.includes('ajto')) return 'fronts';

  if (localId.includes('shelf') || localId.includes('polc')) return 'shelves';
  if (localId.includes('corpus') || localId.includes('korpusz')) return 'corpuses';

  return 'others';
}

function normalizeType(type: string | undefined): string {
  if (!type) return 'others';
  const t = type.toLowerCase();

  const map: Record<string, string> = {
    'front': 'fronts', 'fronts': 'fronts', 'door': 'fronts', 'doors': 'fronts',
    'drawer': 'drawers', 'drawers': 'drawers',
    'leg': 'legs', 'legs': 'legs',
    'handle': 'handles', 'handles': 'handles',
    'shelf': 'shelves', 'shelves': 'shelves',
    'corpus': 'corpuses', 'corpuses': 'corpuses'
  };
  return map[t] || 'others';
}

const displayGroups = computed<DisplayGroup[]>(() => {
  const slots = currentConfig.value?.componentSlots ?? [];
  const state = currentState.value || {};
  if (slots.length === 0) return [];

  // 1. Gyűjtés
  // JAVÍTÁS: Explicit típusdefiníció a rawGroups-hoz, hogy ne legyen 'undefined' hiba
  const rawGroups: Record<string, { slot: ComponentSlotConfig, displayName: string }[]> = {
    corpuses: [], fronts: [], drawers: [], handles: [], legs: [], shelves: [], others: []
  };

  const groupLabels: Record<string, string> = {
    corpuses: 'Korpusz', fronts: 'Ajtók / Frontok', drawers: 'Fiókok',
    handles: 'Fogantyúk', legs: 'Lábak', shelves: 'Polcok', others: 'Egyéb Elemek'
  };

  slots.forEach(slot => {
    const activeComponentId = state[slot.slotId] || '';
    const isCorpus = slot.componentType === 'corpuses';

    if (!activeComponentId && !isCorpus) return;

    let groupKey = resolveGroupKey(slot, activeComponentId);

    // Biztonsági ellenőrzés: ha a kulcs nincs a listában, menjen az others-be
    if (!rawGroups[groupKey]) groupKey = 'others';

    rawGroups[groupKey]?.push({
      slot: slot,
      displayName: generateNiceName(slot.slotId, groupKey)
    });
  });

  // 2. Összevonás
  return Object.entries(rawGroups)
    .filter(([_, items]) => items.length > 0)
    .map(([key, items]) => {
      const controls: InspectorControl[] = [];
      const shouldGroup = ['fronts', 'handles', 'shelves', 'legs', 'drawers'].includes(key);

      if (shouldGroup && items.length > 1) {
        // --- ÖSSZEVONT NÉZET ---
        const allSlots = items.map(i => i.slot);
        const firstSlot = allSlots[0];

        // JAVÍTÁS: TypeScript ellenőrzés. Ha van items, akkor van firstSlot is.
        if (firstSlot) {
          const currentVal = state[firstSlot.slotId] || '';
          controls.push({
            id: `group_${key}_unified`,
            label: 'Közös stílus',
            slots: allSlots,
            referenceSlot: firstSlot, // Itt már biztosan nem undefined
            currentValue: currentVal,
            isGrouped: true
          });
        }

      } else {
        // --- EGYEDI NÉZET ---
        items.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));

        items.forEach(item => {
          controls.push({
            id: item.slot.slotId,
            label: item.displayName,
            slots: [item.slot],
            referenceSlot: item.slot,
            currentValue: state[item.slot.slotId] || '',
            isGrouped: false
          });
        });
      }

      return {
        id: key,
        label: groupLabels[key] || 'Egyéb',
        controls: controls // Ez most már passzol az interface-hez
      };
    });
});

// --- ÚJ ACTION: TÖMEGES VÁLTÁS ---
function handleUnifiedChange(control: InspectorControl, newValue: string) {
  if (!newValue) return;

  const firstSlot = control.slots[0];
  if (!firstSlot) return;

  // Típus meghatározása
  const currentId = selectedObject.value?.userData.componentState?.[firstSlot.slotId];
  const comp = configStore.getComponentById(currentId || '');
  const type = normalizeType(comp?.componentType || control.referenceSlot.componentType);

  const isStyleChange = type === 'fronts';

  // 📦 VÁLTOZÁSOK GYŰJTÉSE
  const updates: Record<string, string> = {};

  control.slots.forEach(slot => {
    if (isStyleChange) {
      // --- STÍLUS VÁLTÁS ---
      const compatibleId = findComponentIdByStyle(slot.slotId, newValue);

      if (compatibleId) {
        updates[slot.slotId] = compatibleId; // Gyűjtjük
      } else {
        console.warn(`Nem található elem ehhez: ${slot.slotId}, Stílus: ${newValue}`);
      }

    } else {
      // --- DIREKT VÁLTÁS ---
      updates[slot.slotId] = newValue; // Gyűjtjük
    }
  });

  // 🔥 EGYETLEN HÍVÁS A STORE FELÉ
  if (Object.keys(updates).length > 0) {
    selectionStore.changeStyles(updates);
  }
}

// --- OPTION HELPERS ---

// Ez dönti el, hogy mit látunk a legördülőben
function getOptionsForControl(control: InspectorControl) {
  // 1. Megnézzük az aktív elemet
  const activeId = selectedObject.value?.userData.componentState?.[control.referenceSlot.slotId];
  const activeComp = configStore.getComponentById(activeId || '');

  // 2. A típus most már biztosan ott van az elemen (vagy a sloton)
  // A normalizeType kezeli, ha esetleg "front" lenne írva "fronts" helyett
  const rawType = activeComp?.componentType || control.referenceSlot.componentType;
  const type = normalizeType(rawType);

  // A) AJTÓK -> STÍLUSOK LISTÁZÁSA
  if (type === 'fronts') {
    return configStore.styles.map(style => ({
      label: style.name,
      value: style.id
    }));
  }

  // B) EGYEBEK -> KOMPONENSEK LISTÁZÁSA
  const candidates = getFilteredComponentsFallback(control.referenceSlot);

  const uniqueItems = new Map();
  candidates.forEach(comp => {
    if (!uniqueItems.has(comp.id)) {
      uniqueItems.set(comp.id, {
        label: comp.name,
        value: comp.id
      });
    }
  });

  return Array.from(uniqueItems.values());
}

// Ez mondja meg, mi az aktuálisan kiválasztott érték
function getCurrentControlValue(control: InspectorControl): string {
  const firstSlot = control.slots[0];
  if (!firstSlot) return '';

  const currentCompId = selectedObject.value?.userData.componentState?.[firstSlot.slotId];
  if (!currentCompId) return '';

  const comp = configStore.getComponentById(currentCompId);
  const type = normalizeType(comp?.componentType || control.referenceSlot.componentType);

  // Ha Ajtó, akkor a STÍLUS ID kell a legördülőnek
  if (type === 'fronts') {
    return comp?.styleId || '';
  }

  // Minden másnál a KOMPONENS ID
  return currentCompId;
}

function generateNiceName(slotId: string, type: string): string {
  const cleanId = slotId.replace(/^(root__)?(attach_)?/, '').toLowerCase();
  let name = "Elem";

  const typeNames: Record<string, string> = {
    fronts: "Ajtó", handles: "Fogantyú", legs: "Láb",
    drawers: "Fiók", shelves: "Polc", corpuses: "Korpusz"
  };
  if (typeNames[type]) name = typeNames[type];

  const prefixes: string[] = [];
  if (cleanId.includes('_l') || cleanId.includes('left') || cleanId.includes('bal')) prefixes.push("Bal");
  else if (cleanId.includes('_r') || cleanId.includes('right') || cleanId.includes('jobb')) prefixes.push("Jobb");

  if (cleanId.includes('vertical')) name += " (Függ.)";
  else if (cleanId.includes('horizontal')) name += " (Vízsz.)";

  const numberMatch = cleanId.match(/_(\d+)$/);
  if (numberMatch) prefixes.unshift(`${numberMatch[1]}.`);

  if (type === 'drawers' && cleanId.includes('front')) name = "Fiókelőlap";

  return prefixes.length > 0 ? `${prefixes.join(' ')} ${name}` : name;
}

// --- SMART LOGIC: HELPERS ---
function getOrientation(id: string): 'left' | 'right' | 'neutral' {
  if (!id) return 'neutral';
  const lowerId = id.toLowerCase();
  if (lowerId.endsWith('_l') || lowerId.includes('_left')) return 'left';
  if (lowerId.endsWith('_r') || lowerId.includes('_right')) return 'right';
  return 'neutral';
}

function findComponentIdByStyle(slotId: string, targetStyleId: string): string | null {
  const currentId = selectedObject.value?.userData.componentState?.[slotId];
  const currentComp = configStore.getComponentById(currentId || '');

  if (!currentComp?.properties) return null;

  // Most már egyszerűen olvassuk a típust, nem kell nyomozni
  const typeKey = normalizeType(currentComp.componentType);

  const candidates = configStore.components[typeKey] || [];
  const { width: w, height: h } = currentComp.properties;
  const orient = getOrientation(currentComp.id);

  for (const candidate of candidates) {
    if (candidate.styleId !== targetStyleId) continue;

    const cW = Number(candidate.properties?.width || 0);
    const cH = Number(candidate.properties?.height || 0);
    const cOrient = getOrientation(candidate.id);

    if (Math.abs(cW - (Number(w) || 0)) > 2) continue;
    if (Math.abs(cH - (Number(h) || 0)) > 2) continue;

    if (orient === 'left' && cOrient === 'right') continue;
    if (orient === 'right' && cOrient === 'left') continue;

    return candidate.id;
  }
  return null;
}

function getFilteredComponentsFallback(slot: ComponentSlotConfig) {
  let candidates = slot.allowedComponents
    .map(id => configStore.getComponentById(id))
    .filter((c): c is ComponentConfig => c !== undefined);

  if (candidates.length <= 1 && slot.componentType) {
    const categoryComponents = configStore.components[slot.componentType];
    if (categoryComponents && categoryComponents.length > 0) {
      candidates = categoryComponents;
    }
  }
  return candidates;
}

// --- ACTIONS ---
function handleGroupChange(groupIndex: number, schemaId: string) {
  selectionStore.applySchema(groupIndex, schemaId)
}

function handleDuplicate() { selectionStore.duplicateSelectedObject() }
function handleDelete() { selectionStore.deleteSelectedObject() }

// --- HELPER ---
// 1. Ez dönt a LÁTHATÓSÁGRÓL (Most már mindig true, ha van ott elem)
function shouldShowMaterialSelector(slot: ComponentSlotConfig): boolean {
  if (materials.value.length === 0 || !slot) return false;
  const currentId = selectedObject.value?.userData.componentState?.[slot.slotId];
  return !!currentId; // Csak akkor mutatjuk, ha van benne valami
}

// 2. Ez dönt a TILTÁSRÓL (Ha örököl, akkor true)
function isMaterialInherited(slot: ComponentSlotConfig): boolean {
  const currentId = selectedObject.value?.userData.componentState?.[slot.slotId];
  if (!currentId) return false;

  const comp = configStore.getComponentById(currentId);
  // Ha van materialSource, akkor örököl -> TILTVA
  return !!comp?.materialSource;
}

function getCurrentMaterialId(slotId: string): string {
  // 1. State ellenőrzés (Amit a felhasználó beállított)
  const stateVal = selectedObject.value?.userData.materialState?.[slotId];
  if (stateVal) return stateVal;

  // 2. Komponens alapértelmezés (Amit a JSON-ban a komponenshez írtál)
  const compId = selectedObject.value?.userData.componentState?.[slotId];
  if (compId) {
    const comp = configStore.getComponentById(compId);
    if (comp?.materialOptions && comp.materialOptions.length > 0) {
      return comp.materialOptions[0] || '';
    }
  }

  // 3. VÉGSŐ MENEDÉK: A fix 'default_material' ID
  return 'default_material';
}

// ÚJ FÜGGVÉNY: Ez kezeli, hogy mit mutasson a legördülő lista
function getLayoutDropdownValue(group: SlotGroup): string {
  const currentState = selectedObject.value?.userData.componentState || {}

  // 1. Keressünk olyan sémát, ami illeszkedik a jelenlegi állapothoz ÉS NEM polc típusú
  const layoutSchema = group.schemas.find(schema => {
    if ((schema as any).type === 'shelf') return false; // Polcokat kihagyjuk

    // Üres apply objektum nem illeszkedik (kivéve ha speciális logika van rá, de layoutnál általában kell apply)
    if (Object.keys(schema.apply).length === 0) return false;

    for (const [slotId, compId] of Object.entries(schema.apply)) {
      if (currentState[slotId] !== compId) return false;
    }
    return true;
  });

  if (layoutSchema) return layoutSchema.id;

  // 2. Ha nincs illeszkedő layout, akkor jöhet a default
  if (group.defaultSchemaId) {
    return group.defaultSchemaId;
  }

  // 3. Végső fallback: az első nem-polc séma a listából
  const firstLayout = group.schemas.find(s => (s as any).type !== 'shelf');
  return firstLayout ? firstLayout.id : '';
}

const debugComponentState = computed(() => currentState.value)
</script>

<template>
  <div v-if="selectedObject && furnitureDef" ref="panelRef" :style="style"
    class="fixed w-80 bg-[#1e1e1e] border border-gray-700 shadow-2xl rounded-lg flex flex-col z-50 overflow-hidden transition-opacity duration-200"
    :class="{ 'opacity-80 pointer-events-none select-none': selectionStore.isBusy }" style="max-height: 90vh;">

    <!-- 🔥 BUSY STATE OVERLAY -->
    <div v-if="selectionStore.isBusy"
      class="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
      <span class="text-xs text-blue-200 font-mono animate-pulse">Frissítés...</span>
    </div>

    <!-- 🔥 ANYAGVÁLASZTÓ OVERLAY (ÚJ DESIGN) -->
    <div v-if="activeMaterialControl"
      class="absolute inset-0 z-[70] bg-[#1e1e1e] flex flex-col transition-all duration-300">

      <!-- Fejléc -->
      <div class="p-3 border-b border-gray-700 flex items-center gap-3 bg-gray-800 shadow-md">
        <button @click="closeMaterialSelector"
          class="text-gray-400 hover:text-white p-1.5 hover:bg-gray-700 rounded-full transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>
        <div>
          <h3 class="text-xs font-bold text-gray-200 uppercase tracking-wide">Anyag választása</h3>
          <p class="text-[10px] text-gray-500 truncate w-48">{{ activeMaterialControl.label }}</p>
        </div>
      </div>

      <!-- Lista -->
      <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">

        <div v-if="availableMaterialsForActiveControl.length === 0" class="text-center text-gray-500 text-xs mt-10">
          Nincs elérhető anyag ehhez az elemhez.
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button v-for="mat in availableMaterialsForActiveControl" :key="mat.id" @click="selectMaterial(mat.id)"
            class="group flex flex-col text-left bg-[#252525] hover:bg-[#333] rounded-lg p-2 transition-all">
            <!-- Téglalap alakú előnézet (Keskenyebb: h-14) -->
            <div
              class="w-full h-14 rounded-md shadow-sm border border-gray-600 group-hover:border-gray-400 relative overflow-hidden mb-2">
              <div v-if="mat.type === 'color'" class="w-full h-full" :style="{ backgroundColor: mat.value }"></div>

              <img v-else :src="(mat as any).thumbnail || mat.value"
                class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
            </div>

            <!-- Infó szekció (Megcserélve) -->
            <div class="w-full px-1">

              <!-- 1. Név (Fent, hangsúlyosabb) -->
              <span class="block text-xs font-bold text-gray-300 group-hover:text-white leading-tight mb-0.5">
                {{ mat.name }}
              </span>

              <!-- 2. Kategória (Lent, kicsi szürke - mint régen a név) -->
              <span class="block text-[9px] text-gray-500 group-hover:text-gray-400">
                {{ Array.isArray(mat.category) ? mat.category.join(', ') : mat.category }}
              </span>

            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- HEADER (Fő panel) -->
    <div ref="dragHandleRef"
      class="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent cursor-move select-none hover:bg-gray-800/30 transition-colors">
      <div class="flex justify-between items-start">
        <h2 class="font-bold text-white text-md leading-tight">{{ furnitureDef.name }}</h2>
        <button @mousedown.stop @click="selectionStore.clearSelection()"
          class="text-gray-500 hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div v-if="dimensions" class="mt-2 text-[11px] text-blue-400 font-mono flex flex-wrap gap-x-3">
        <span>Szél.: <span class="text-gray-300">{{ dimensions.width }}mm</span></span>
        <span>Mag.: <span class="text-gray-300">{{ dimensions.height }}mm</span></span>
        <span>Mély.: <span class="text-gray-300">{{ dimensions.depth }}mm</span></span>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar" @mousedown.stop>

      <!-- Layouts -->
      <div v-if="slotGroups.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Elrendezés</h3>
        <div class="space-y-4">
          <div v-for="(group, index) in slotGroups" :key="group.groupId">
            <label class="block text-xs font-medium text-gray-400 mb-1.5">{{ group.name }}</label>

            <!-- Layout Dropdown -->
            <div v-if="hasLayoutSchema(group)" class="relative group mb-2">
              <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getLayoutDropdownValue(group)">
                <template v-for="schema in group.schemas" :key="schema.id">
                  <option v-if="(schema as any).type !== 'shelf'" :value="schema.id">{{ schema.name }}</option>
                </template>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>

            <!-- Polc Input -->
            <div v-if="hasShelfSchema(group)"
              class="flex items-center gap-2 bg-[#252525] p-2 rounded-md border border-gray-800 mt-2">
              <span class="text-[11px] text-gray-400 uppercase font-bold">Polcok:</span>
              <div class="relative flex-1">
                <input type="number" min="0" :max="getMaxShelves(group)" :value="getShelfCount(group)"
                  @input="setShelfCount(index, group, parseInt(($event.target as HTMLInputElement).value))"
                  class="w-full bg-[#333] border border-gray-600 text-white text-sm font-bold rounded py-1 pl-2 pr-8 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none" />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">db</span>
              </div>
              <button @click="toggleDoors" title="Ajtók megjelenítése/elrejtése"
                class="flex items-center justify-center w-7 h-7 rounded transition-all border border-transparent"
                :class="areDoorsVisible ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
              <span class="text-[10px] text-gray-500 w-10 text-right">Max: {{ getMaxShelves(group) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- DYNAMIC GROUPS (ÚJ DESIGN) -->
      <div v-for="group in displayGroups" :key="group.id" class="mb-6">

        <!-- CÍMSOR + ÖSSZESÍTŐ CÍMKE -->
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
          {{ group.label }}
          <!-- Ha csak 1 vezérlő van és az csoportosított, akkor kiírjuk ide, hogy Összes -->
          <span v-if="group.controls.length === 1 && group.controls[0]?.isGrouped"
            class="text-[10px] text-blue-400 normal-case bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-800/50">
            Összes
          </span>
        </h3>

        <div class="space-y-3">
          <div v-for="control in group.controls" :key="control.id">

            <!-- ALCÍM (Csak akkor, ha több elem van a csoportban) -->
            <label v-if="group.controls.length > 1" class="block text-xs font-medium text-gray-400 mb-1">
              {{ control.label }}
              <span v-if="control.isGrouped" class="text-blue-400 ml-1 text-[10px]">(Összes)</span>
            </label>

            <!-- GRID LAYOUT: 2/3 Dropdown, 1/3 Material -->
            <div class="grid grid-cols-3 gap-2 h-8">

              <!-- 1. Dropdown (col-span-2) -->
              <div class="col-span-2 relative">
                <select :value="getCurrentControlValue(control)"
                  @change="e => handleUnifiedChange(control, (e.target as HTMLSelectElement).value)"
                  class="w-full h-full bg-[#2a2a2a] text-gray-200 text-xs rounded-md pl-2 pr-6 appearance-none border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors cursor-pointer hover:bg-[#333]">
                  <option v-for="opt in getOptionsForControl(control)" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>

              <!-- 2. Material Button (col-span-1) -->
              <button v-if="shouldShowMaterialSelector(control.referenceSlot)"
                @click="!isMaterialInherited(control.referenceSlot) && openMaterialSelector(control)"
                class="col-span-1 h-full rounded-md border border-gray-700 relative overflow-hidden transition-all group"
                :class="isMaterialInherited(control.referenceSlot)
                  ? 'opacity-50 cursor-not-allowed bg-gray-800'
                  : 'hover:border-gray-500 cursor-pointer bg-[#2a2a2a]'"
                :title="isMaterialInherited(control.referenceSlot) ? 'Ez az elem a korpusz színét örökli' : 'Anyag módosítása'">

                <!-- Anyag Előnézet (Szín vagy Kép) -->
                <div class="w-full h-full flex items-center justify-center bg-gray-800">

                  <!-- SZÍN -->
                  <div v-if="getMatType(control.referenceSlot.slotId) === 'color'" class="w-full h-full"
                    :style="{ backgroundColor: getMatValue(control.referenceSlot.slotId) }">
                  </div>

                  <!-- TEXTÚRA / KÉP -->
                  <img v-else :src="getMatThumbnail(control.referenceSlot.slotId)" class="w-full h-full object-cover" />
                </div>

                <!-- Áthúzás (SVG - Saroktól sarokig) -->
                <div v-if="isMaterialInherited(control.referenceSlot)"
                  class="absolute inset-0 z-10 pointer-events-none">
                  <svg class="w-full h-full" preserveAspectRatio="none">
                    <line x1="0" y1="100%" x2="100%" y2="0" stroke="#ef4444" stroke-width="1.5" stroke-opacity="0.8" />
                  </svg>
                </div>
              </button>

              <!-- Placeholder -->
              <div v-else class="col-span-1"></div>

            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- FOOTER -->
    <div class="p-3 bg-[#1a1a1a] border-t border-gray-800 grid grid-cols-2 gap-3" @mousedown.stop>
      <button @click="handleDuplicate"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-blue-400 hover:bg-[#333] hover:border-blue-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z">
          </path>
        </svg>
        Duplikálás
      </button>
      <button @click="handleDelete"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-red-400 hover:bg-[#333] hover:border-red-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
          </path>
        </svg>
        Törlés
      </button>
    </div>

    <!-- DEBUG PANEL -->
    <div
      class="p-3 bg-black/80 text-[10px] font-mono text-gray-400 border-t border-gray-800 overflow-x-auto max-h-40 custom-scrollbar"
      @mousedown.stop>
      <div class="font-bold mb-2 text-white flex justify-between">
        <span>📦 BÚTOR SZERKEZET</span>
        <span class="text-gray-500">{{ Object.keys(debugComponentState).length }} slot</span>
      </div>
      <div v-for="(val, key) in debugComponentState" :key="key"
        class="flex justify-between items-center hover:bg-white/10 py-0.5 px-1 rounded border-b border-white/5 last:border-0">
        <span class="text-blue-400 truncate w-1/2 pr-2" :title="String(key)">{{ key }}</span>
        <span class="text-green-400 truncate w-1/2 text-right" :title="String(val)">{{ val }}</span>
      </div>
    </div>

  </div>
</template>
