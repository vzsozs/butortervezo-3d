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

  const newUuid = newObj.uuid;
  const currentId = currentConfig.value?.id;

  // 2. ÚJ BÚTOR KIJELÖLÉSE
  // Akkor tekintjük újnak, ha a config ID változott, VAGY ha eddig nem volt semmi kijelölve
  const isNewFurniture = currentId !== lastConfigId.value;

  if (isNewFurniture) {
    log(`New furniture selected. Resetting view.`);
    areDoorsVisible.value = true; // Alaphelyzet: látható
    lastConfigId.value = currentId || null;

    await nextTick();
    checkDefaults();
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


function checkDefaults() {
  const def = furnitureDef.value;
  // JAVÍTÁS: Biztonságos ellenőrzés (?.)
  if (!def?.slotGroups) return;

  def.slotGroups.forEach((group, index) => {
    const currentSchema = getCurrentSchemaId(group);
    if (!currentSchema && group.defaultSchemaId) {
      selectionStore.applySchema(index, group.defaultSchemaId);
    }
  });
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

// --- UI CSOPORTOSÍTÁS ---
interface DisplayGroup {
  id: string;
  label: string;
  slots: { slot: ComponentSlotConfig, displayName: string }[];
}

function resolveGroupKey(slot: ComponentSlotConfig, activeComponentId: string): string {
  if (activeComponentId) {
    const comp = configStore.getComponentById(activeComponentId);
    if (comp?.componentType) return normalizeType(comp.componentType);
  }
  if (slot.componentType) return normalizeType(slot.componentType);

  const lowerId = slot.slotId.toLowerCase();
  if (lowerId.includes('door') || lowerId.includes('front')) return 'fronts';
  if (lowerId.includes('drawer')) return 'drawers';
  if (lowerId.includes('leg') || lowerId.includes('lab')) return 'legs';
  if (lowerId.includes('handle') || lowerId.includes('fogantyu')) return 'handles';
  if (lowerId.includes('shelf') || lowerId.includes('polc')) return 'shelves';

  return 'others';
}

function normalizeType(type: string): string {
  const map: Record<string, string> = {
    'front': 'fronts', 'drawer': 'drawers', 'leg': 'legs',
    'handle': 'handles', 'shelf': 'shelves', 'corpuses': 'corpuses'
  };
  return map[type] || type;
}

const displayGroups = computed<DisplayGroup[]>(() => {
  const slots = currentConfig.value?.componentSlots ?? [];
  const state = currentState.value || {};
  if (slots.length === 0) return [];

  const groups: Record<string, DisplayGroup> = {
    corpuses: { id: 'corpuses', label: 'Korpusz', slots: [] },
    fronts: { id: 'fronts', label: 'Ajtók / Előlapok', slots: [] },
    drawers: { id: 'drawers', label: 'Fiókok', slots: [] },
    handles: { id: 'handles', label: 'Fogantyúk', slots: [] },
    legs: { id: 'legs', label: 'Lábak', slots: [] },
    shelves: { id: 'shelves', label: 'Polcok', slots: [] },
    others: { id: 'others', label: 'Egyéb Elemek', slots: [] }
  };

  // JAVÍTÁS: A te verziód beépítve
  slots.forEach(slot => {
    const activeComponentId = state[slot.slotId] || '';
    const isCorpus = slot.componentType === 'corpuses';
    if (!activeComponentId && !isCorpus) return;

    let groupKey = resolveGroupKey(slot, activeComponentId);
    let targetGroup = groups[groupKey];

    if (!targetGroup) {
      groupKey = 'others';
      targetGroup = groups['others'];
    }

    if (targetGroup) {
      targetGroup.slots.push({
        slot: slot,
        displayName: generateNiceName(slot.slotId, groupKey)
      });
    }
  });

  return Object.values(groups)
    .filter(g => g.slots.length > 0)
    .map(g => {
      g.slots.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
      return g;
    });
});

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

function getComponentName(id: string): string {
  return configStore.getComponentById(id)?.name || id
}

function getCurrentComponentId(slotId: string): string {
  return selectedObject.value?.userData.componentState?.[slotId] || ''
}

function getCurrentStyleId(slotId: string): string | undefined {
  const comp = configStore.getComponentById(getCurrentComponentId(slotId));
  return comp?.styleId;
}

function getAvailableStylesForSlot(slot: ComponentSlotConfig) {
  const currentComp = configStore.getComponentById(getCurrentComponentId(slot.slotId));
  if (!currentComp?.properties) return [];

  const { width: w, height: h } = currentComp.properties;
  const orient = getOrientation(currentComp.id);
  const type = currentComp.componentType;

  return configStore.styles.filter(style => {
    return Object.values(configStore.components).some(category => {
      return category.some(candidate => {
        if (candidate.styleId !== style.id) return false;
        if (candidate.componentType !== type) return false;

        const cW = candidate.properties?.width || 0;
        const cH = candidate.properties?.height || 0;
        if (Math.abs(cW - (w || 0)) > 2 || Math.abs(cH - (h || 0)) > 2) return false;

        const cOrient = getOrientation(candidate.id);
        if ((orient === 'left' && cOrient === 'right') || (orient === 'right' && cOrient === 'left')) return false;

        return true;
      });
    });
  });
}

function findComponentIdByStyle(slotId: string, targetStyleId: string): string | null {
  const currentComp = configStore.getComponentById(getCurrentComponentId(slotId));
  if (!currentComp?.properties) return null;

  const type = currentComp.componentType;
  if (!type) return null;

  const { width: w, height: h } = currentComp.properties;
  const orient = getOrientation(currentComp.id);

  const candidates = configStore.components[type] || [];

  for (const candidate of candidates) {
    if (candidate.styleId !== targetStyleId) continue;
    const cW = Number(candidate.properties?.width || 0);
    const cH = Number(candidate.properties?.height || 0);
    const cOrient = getOrientation(candidate.id);

    if (Math.abs(cW - (Number(w) || 0)) > 2 || Math.abs(cH - (Number(h) || 0)) > 2) continue;
    if ((orient === 'left' && cOrient === 'right') || (orient === 'right' && cOrient === 'left')) continue;

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

function handleStyleChange(slotId: string, newStyleId: string) {
  const newComponentId = findComponentIdByStyle(slotId, newStyleId);
  if (newComponentId) {
    selectionStore.changeStyle(slotId, newComponentId);
  } else {
    alert("Ehhez a mérethez/pozícióhoz nem található elem a választott stílusban.");
  }
}

function handleComponentChange(slotId: string, componentId: string) {
  if (componentId) selectionStore.changeStyle(slotId, componentId);
}

function handleMaterialChange(slotId: string, materialId: string) {
  if (materialId) selectionStore.changeMaterial(slotId, materialId);
}

function handleDuplicate() { selectionStore.duplicateSelectedObject() }
function handleDelete() { selectionStore.deleteSelectedObject() }

// --- HELPER ---
function shouldShowMaterialSelector(slot: ComponentSlotConfig): boolean {
  return materials.value.length > 0 && !!slot
}
function getCurrentMaterialId(slotId: string): string {
  return selectedObject.value?.userData.materialState?.[slotId] || ''
}
function getMaterialColor(materialId: string): string {
  const mat = materials.value.find(m => m.id === materialId)
  return mat?.type === 'color' ? mat.value : '#999'
}

function getCurrentSchemaId(group: SlotGroup): string {
  const currentState = selectedObject.value?.userData.componentState || {}

  for (const schema of group.schemas) {
    let match = true
    if (Object.keys(schema.apply).length === 0 && schema.type !== 'shelf') {
      match = false;
    } else {
      for (const [slotId, compId] of Object.entries(schema.apply)) {
        if (currentState[slotId] !== compId) { match = false; break }
      }
    }
    if (match) return schema.id
  }

  if (group.defaultSchemaId) return group.defaultSchemaId;

  const shelfSchema = group.schemas.find((s: any) => s.type === 'shelf');
  if (shelfSchema) return shelfSchema.id;

  const layoutSchema = group.schemas.find((s: any) => s.type !== 'shelf');
  if (layoutSchema) return layoutSchema.id;

  return ''
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
    class="fixed w-80 bg-[#1e1e1e] border border-gray-700 shadow-2xl rounded-lg flex flex-col z-50 overflow-hidden"
    style="max-height: 90vh;">

    <!-- HEADER -->
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
        <span>Szélesség: <span class="text-gray-300">{{ dimensions.width }}mm</span></span>
        <span>Magasság: <span class="text-gray-300">{{ dimensions.height }}mm</span></span>
        <span>Mélység: <span class="text-gray-300">{{ dimensions.depth }}mm</span></span>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar" @mousedown.stop>

      <!-- Layouts -->
      <div v-if="slotGroups.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Elrendezés</h3>
        <div class="space-y-4">
          <div v-for="(group, index) in slotGroups" :key="group.groupId">

            <!-- CÍMSOR -->
            <label class="block text-xs font-medium text-gray-400 mb-1.5">
              {{ group.name }}
            </label>

            <!-- 1. LEGÖRDÜLŐ LISTA (Layouts) -->
            <div v-if="hasLayoutSchema(group)" class="relative group mb-2">
              <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getLayoutDropdownValue(group)">

                <!-- TÖRÖLVE: <option value="" disabled>Válassz...</option> -->

                <template v-for="schema in group.schemas" :key="schema.id">
                  <option v-if="(schema as any).type !== 'shelf'" :value="schema.id">
                    {{ schema.name }}
                  </option>
                </template>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>

            <!-- 2. POLC INPUT MEZŐ -->
            <div v-if="hasShelfSchema(group)"
              class="flex items-center gap-2 bg-[#252525] p-2 rounded-md border border-gray-800 mt-2">
              <span class="text-[11px] text-gray-400 uppercase font-bold">Polcok:</span>

              <div class="relative flex-1">
                <input type="number" min="0" :max="getMaxShelves(group)" :value="getShelfCount(group)"
                  @input="setShelfCount(index, group, parseInt(($event.target as HTMLInputElement).value))"
                  class="w-full bg-[#333] border border-gray-600 text-white text-sm font-bold rounded py-1 pl-2 pr-8 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none" />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">db</span>
              </div>

              <!-- SZEM IKON -->
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

      <!-- CSOPORTOSÍTOTT LISTA (Részletek) -->
      <div v-if="displayGroups.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 pt-4 border-t border-gray-800">
          Részletek</h3>

        <div class="space-y-6">
          <div v-for="group in displayGroups" :key="group.id" class="space-y-2">

            <div class="flex items-center gap-2 mb-2">
              <span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              <h4 class="text-xs font-bold text-gray-300 uppercase">{{ group.label }}</h4>
            </div>

            <div v-for="item in group.slots" :key="item.slot.slotId"
              class="pl-3 border-l border-gray-800 ml-0.5 space-y-2 py-1">

              <div class="flex justify-between items-center">
                <span class="text-[11px] text-gray-400">{{ item.displayName }}</span>
                <span v-if="!getCurrentStyleId(item.slot.slotId)" class="text-[10px] text-gray-600 italic">
                  {{ getComponentName(getCurrentComponentId(item.slot.slotId)) }}
                </span>
              </div>

              <div class="grid gap-2" :class="(shouldShowMaterialSelector(item.slot)) ? 'grid-cols-2' : 'grid-cols-1'">

                <!-- STÍLUS VÁLASZTÓ -->
                <div v-if="getCurrentStyleId(item.slot.slotId)">
                  <div class="relative group">
                    <select :value="getCurrentStyleId(item.slot.slotId)"
                      @change="handleStyleChange(item.slot.slotId, ($event.target as HTMLSelectElement).value)"
                      class="w-full bg-[#2a2a2a] border border-blue-500/30 text-blue-100 font-bold text-[11px] rounded py-1.5 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-[#333] transition-colors">
                      <option v-for="style in getAvailableStylesForSlot(item.slot)" :key="style.id" :value="style.id">
                        {{ style.name }}
                      </option>
                    </select>
                    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-blue-400">
                      <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <!-- KOMPONENS VÁLASZTÓ -->
                <div v-else-if="getFilteredComponentsFallback(item.slot).length > 1">
                  <div class="relative group">
                    <select :value="getCurrentComponentId(item.slot.slotId)"
                      @change="handleComponentChange(item.slot.slotId, ($event.target as HTMLSelectElement).value)"
                      class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-[11px] rounded py-1.5 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-[#333]">
                      <option v-for="comp in getFilteredComponentsFallback(item.slot)" :key="comp.id" :value="comp.id">
                        {{ comp.name }}
                      </option>
                    </select>
                    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                      <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <!-- ANYAG VÁLASZTÓ -->
                <div v-if="shouldShowMaterialSelector(item.slot)">
                  <div class="relative group">
                    <select :value="getCurrentMaterialId(item.slot.slotId)"
                      @change="handleMaterialChange(item.slot.slotId, ($event.target as HTMLSelectElement).value)"
                      class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-[11px] rounded py-1.5 pl-6 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-[#333]">
                      <option value="">Alapértelmezett</option>
                      <option v-for="mat in materials" :key="mat.id" :value="mat.id">
                        {{ mat.name }}
                      </option>
                    </select>
                    <div
                      class="absolute left-2 top-1/2 transform -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-gray-600"
                      :style="{ backgroundColor: getMaterialColor(getCurrentMaterialId(item.slot.slotId)) }"></div>
                    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                      <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

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
