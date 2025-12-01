<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config'
import type { ComponentSlotConfig, SlotGroup, FurnitureConfig, ComponentConfig } from '@/config/furniture'

const selectionStore = useSelectionStore()
const configStore = useConfigStore()

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

// --- AJTÓ LÁTHATÓSÁG KEZELÉS ---
const areDoorsVisible = ref(true);

// Bútor váltás figyelése
watch(() => selectedObject.value?.uuid, async (newId) => {
  // 1. UI állapot visszaállítása
  areDoorsVisible.value = true;

  if (!newId) return;

  // 2. Várunk a Vue és a Three.js frissítésre
  await nextTick();

  // 3. Biztonsági késleltetés (200ms), hogy a modell biztosan betöltődjön
  setTimeout(() => {
    if (selectionStore.selectedObject) {
      updateDoorVisibility(true);
    }
  }, 200);
});

function toggleDoors() {
  areDoorsVisible.value = !areDoorsVisible.value;
  updateDoorVisibility(areDoorsVisible.value);
}

function updateDoorVisibility(visible: boolean) {
  if (!selectedObject.value) return;

  selectedObject.value.traverse((child) => {
    const name = child.name.toLowerCase();
    const slotId = child.userData.slotId || '';

    const isDoorOrFront =
      name.includes('front') || name.includes('door') || name.includes('ajtó') ||
      slotId.includes('front') || slotId.includes('door');

    const isHandle =
      name.includes('handle') || name.includes('fogantyú') ||
      slotId.includes('handle');

    if (isDoorOrFront || isHandle) {
      child.visible = visible;
    }
  });
}

// --- POLC LOGIKA ---

function hasShelfSchema(group: SlotGroup): boolean {
  return group.schemas.some((s: any) => s.type === 'shelf' || (s.shelfConfig !== undefined));
}

function hasLayoutSchema(group: SlotGroup): boolean {
  return group.schemas.some((s: any) => s.type !== 'shelf');
}

function getShelfCount(group: SlotGroup): number {
  const currentSchemaId = getCurrentSchemaId(group);
  let schema = group.schemas.find(s => s.id === currentSchemaId);

  // Ha a jelenlegi nem polc, keressük meg az első polc sémát
  if (!schema || (schema as any).type !== 'shelf') {
    schema = group.schemas.find((s: any) => s.type === 'shelf');
  }

  if (schema && (schema as any).shelfConfig) {
    return (schema as any).shelfConfig.count ?? 0;
  }
  return 0;
}

function setShelfCount(groupIndex: number, group: SlotGroup, count: number) {
  // 1. AJTÓK ELREJTÉSE (hogy lássuk a polcokat)
  if (areDoorsVisible.value) {
    areDoorsVisible.value = false;
    updateDoorVisibility(false);
  }

  // 2. SÉMA KERESÉSE
  const shelfSchema = group.schemas.find((s: any) => s.type === 'shelf');
  if (!shelfSchema || !(shelfSchema as any).shelfConfig) return;

  const config = (shelfSchema as any).shelfConfig;
  const isAutoMode = config.mode === 'auto';

  // 3. LIMIT KEZELÉS
  // Auto módban a maxShelves (vagy 10), Custom módban a fizikai slotok száma a limit
  const maxSlots = (isAutoMode || group.controlledSlots.length === 0)
    ? 10
    : group.controlledSlots.length;

  const safeCount = Math.max(0, Math.min(count, maxSlots));

  // 4. CONFIG FRISSÍTÉSE
  config.count = safeCount;

  // 5. APPLY MAP KEZELÉSE
  if (isAutoMode) {
    // A) AUTO MÓD:
    // Nem nyúlunk az 'apply'-hoz, mert a rendszer a 'shelfConfig.count' alapján generál.
    // Esetleg törölhetjük a manuális bejegyzéseket, hogy ne zavarjanak be.
  } else {
    // B) CUSTOM MÓD (Fizikai slotok):
    const componentId = config.componentId;
    const newApply: Record<string, string | null> = { ...shelfSchema.apply };

    if (group.controlledSlots.length > 0) {
      group.controlledSlots.forEach((slotId, index) => {
        newApply[slotId] = index < safeCount ? componentId : null;
      });
    } else {
      // Fallback: Ha Custom mód, de nincsenek slotok (ritka hibaeset)
      const baseName = group.name.toLowerCase().includes('polc') ? 'polc' : 'shelf';
      for (let i = 1; i <= 10; i++) {
        const generatedSlotId = `${baseName}_${i}`;
        newApply[generatedSlotId] = i <= safeCount ? componentId : null;
      }
    }
    shelfSchema.apply = newApply;
  }

  // 6. ALKALMAZÁS (Ez triggereli a 3D frissítést)
  selectionStore.applySchema(groupIndex, shelfSchema.id);
}

// --- DEBUG & EGYÉB ---
const debugComponentState = computed(() => currentState.value)

const dimensions = computed(() => {
  if (!selectedObject.value || !currentConfig.value) return null;
  const corpusSlot = currentConfig.value.componentSlots.find(s => s.slotId.includes('corpus'));

  if (corpusSlot) {
    const corpusId = currentState.value[corpusSlot.slotId];
    const corpusComp = configStore.getComponentById(corpusId);
    if (corpusComp && corpusComp.properties) {
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
  if (type === 'front') return 'fronts';
  if (type === 'drawer') return 'drawers';
  if (type === 'leg') return 'legs';
  if (type === 'handle') return 'handles';
  if (type === 'shelf') return 'shelves';
  return type;
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

  slots.forEach(slot => {
    const activeComponentId = state[slot.slotId] || '';
    const isCorpus = slot.componentType === 'corpuses';

    if (!activeComponentId && !isCorpus) return;

    let groupKey = resolveGroupKey(slot, activeComponentId);
    if (!groups[groupKey]) groupKey = 'others';

    const targetGroup = groups[groupKey];
    if (targetGroup) {
      const niceName = generateNiceName(slot.slotId, groupKey);
      targetGroup.slots.push({ slot: slot, displayName: niceName });
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
  if (type === 'fronts') name = "Ajtó";
  else if (type === 'handles') name = "Fogantyú";
  else if (type === 'legs') name = "Láb";
  else if (type === 'drawers') name = "Fiók";
  else if (type === 'shelves') name = "Polc";
  else if (type === 'corpuses') name = "Korpusz";

  const prefixes: string[] = [];
  if (cleanId.includes('_l') || cleanId.includes('left') || cleanId.includes('bal')) prefixes.push("Bal");
  else if (cleanId.includes('_r') || cleanId.includes('right') || cleanId.includes('jobb')) prefixes.push("Jobb");
  if (cleanId.includes('vertical')) name += " (Függ.)";
  else if (cleanId.includes('horizontal')) name += " (Vízsz.)";

  const numberMatch = cleanId.match(/_(\d+)$/);
  if (numberMatch) {
    prefixes.unshift(`${numberMatch[1]}.`);
  }

  if (type === 'drawers' && cleanId.includes('front')) {
    name = "Fiókelőlap";
  }

  return prefixes.length > 0 ? `${prefixes.join(' ')} ${name}` : name;
}

// --- SMART LOGIC: HELPERS & FINDERS ---
function getOrientation(id: string): 'left' | 'right' | 'neutral' {
  if (!id) return 'neutral';
  const lowerId = id.toLowerCase();
  if (lowerId.endsWith('_l') || lowerId.includes('_left') || lowerId.includes('_bal')) return 'left';
  if (lowerId.endsWith('_r') || lowerId.includes('_right') || lowerId.includes('_jobb')) return 'right';
  return 'neutral';
}

function getComponentName(id: string): string {
  const comp = configStore.getComponentById(id)
  return comp?.name || id
}

function getCurrentComponentId(slotId: string): string {
  return selectedObject.value?.userData.componentState?.[slotId] || ''
}

function getCurrentStyleId(slotId: string): string | undefined {
  const compId = getCurrentComponentId(slotId);
  const comp = configStore.getComponentById(compId);
  return comp?.styleId;
}

function getAvailableStylesForSlot(slot: ComponentSlotConfig) {
  const currentId = getCurrentComponentId(slot.slotId);
  const currentComp = configStore.getComponentById(currentId);
  if (!currentComp || !currentComp.properties) return [];

  const w = currentComp.properties.width || 0;
  const h = currentComp.properties.height || 0;
  const orient = getOrientation(currentComp.id);
  const type = currentComp.componentType;

  return configStore.styles.filter(style => {
    return Object.values(configStore.components).some(category => {
      return category.some(candidate => {
        if (candidate.styleId !== style.id) return false;
        if (candidate.componentType !== type) return false;

        const cW = candidate.properties?.width || 0;
        const cH = candidate.properties?.height || 0;
        if (Math.abs(cW - w) > 2 || Math.abs(cH - h) > 2) return false;

        const cOrient = getOrientation(candidate.id);
        if (orient === 'left' && cOrient === 'right') return false;
        if (orient === 'right' && cOrient === 'left') return false;

        return true;
      });
    });
  });
}

function findComponentIdByStyle(slotId: string, targetStyleId: string): string | null {
  const currentId = getCurrentComponentId(slotId);
  const currentComp = configStore.getComponentById(currentId);
  if (!currentComp || !currentComp.properties) return null;

  const slotDef = currentConfig.value?.componentSlots.find(s => s.slotId === slotId);
  const type = currentComp.componentType || slotDef?.componentType;
  if (!type) return null;

  const w = Number(currentComp.properties.width || 0);
  const h = Number(currentComp.properties.height || 0);
  const orient = getOrientation(currentComp.id);

  let bestMatch: string | null = null;
  const candidates = configStore.components[type] || [];

  for (const candidate of candidates) {
    if (candidate.styleId !== targetStyleId) continue;
    const cW = Number(candidate.properties?.width || 0);
    const cH = Number(candidate.properties?.height || 0);
    const cOrient = getOrientation(candidate.id);

    if (Math.abs(cW - w) > 2 || Math.abs(cH - h) > 2) continue;
    if (orient === 'left' && cOrient === 'right') continue;
    if (orient === 'right' && cOrient === 'left') continue;

    bestMatch = candidate.id;
    break;
  }
  return bestMatch;
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
    for (const [slotId, compId] of Object.entries(schema.apply)) {
      if (currentState[slotId] !== compId) { match = false; break }
    }
    if (match) return schema.id
  }
  const layoutSchema = group.schemas.find((s: any) => s.type !== 'shelf');
  if (layoutSchema) return layoutSchema.id;

  return ''
}
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

            <!-- 1. LEGÖRDÜLŐ LISTA (Layouts) - Csak ha van NEM polc séma -->
            <div v-if="hasLayoutSchema(group)" class="relative group mb-2">
              <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getCurrentSchemaId(group)">
                <option value="" disabled>Válassz...</option>
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

            <!-- 2. POLC INPUT MEZŐ - Csak ha van polc séma -->
            <div v-if="hasShelfSchema(group)"
              class="flex items-center gap-2 bg-[#252525] p-2 rounded-md border border-gray-800 mt-2">
              <span class="text-[11px] text-gray-400 uppercase font-bold">Polcok:</span>

              <div class="relative flex-1">
                <input type="number" min="0" :max="group.controlledSlots.length > 0 ? group.controlledSlots.length : 10"
                  :value="getShelfCount(group)"
                  @input="setShelfCount(index, group, parseInt(($event.target as HTMLInputElement).value))"
                  class="w-full bg-[#333] border border-gray-600 text-white text-sm font-bold rounded py-1 pl-2 pr-8 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none" />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">db</span>
              </div>

              <!-- SZEM IKON -->
              <button @click="toggleDoors" title="Ajtók megjelenítése/elrejtése"
                class="flex items-center justify-center w-7 h-7 rounded transition-all"
                :class="areDoorsVisible ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>

              <span class="text-[10px] text-gray-500 w-10 text-right">Max: {{ group.controlledSlots.length > 0 ?
                group.controlledSlots.length : 10 }}</span>
            </div>

          </div>
        </div>
      </div>

      <!-- CSOPORTOSÍTOTT LISTA (Részletek) - VÁLTOZATLAN -->
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

    <!-- FOOTER (Változatlan) -->
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

    <!-- DEBUG PANEL (Változatlan) -->
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
