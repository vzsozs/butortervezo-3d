<script setup lang="ts">
import { computed, ref } from 'vue'
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

// --- DEBUG ---
const debugComponentState = computed(() => currentState.value)

// --- MÉRETEK ---
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

// --- LISTÁK ---
const slotGroups = computed(() => furnitureDef.value?.slotGroups ?? [])
const materials = computed(() => configStore.materials)

// --- 🎨 UI CSOPORTOSÍTÁS ---
interface DisplayGroup {
  id: string;
  label: string;
  slots: { slot: ComponentSlotConfig, displayName: string }[];
}

const displayGroups = computed<DisplayGroup[]>(() => {
  if (!currentConfig.value) return [];

  const groups: Record<string, DisplayGroup> = {
    corpuses: { id: 'corpuses', label: 'Korpusz', slots: [] },
    fronts: { id: 'fronts', label: 'Ajtók / Előlapok', slots: [] },
    drawers: { id: 'drawers', label: 'Fiókok', slots: [] },
    handles: { id: 'handles', label: 'Fogantyúk', slots: [] },
    legs: { id: 'legs', label: 'Lábak', slots: [] },
    shelves: { id: 'shelves', label: 'Polcok', slots: [] },
    others: { id: 'others', label: 'Egyéb Elemek', slots: [] }
  };

  currentConfig.value.componentSlots.forEach(slot => {
    const activeComponentId = currentState.value[slot.slotId];
    const isCorpus = slot.componentType === 'corpuses';
    if (!activeComponentId && !isCorpus) return;

    let type = slot.componentType;
    if (!groups[type]) type = 'others';

    let niceName = slot.name;
    if (slot.slotId.includes('attach_')) {
      niceName = generateNiceName(slot.slotId, type);
    }

    groups[type].slots.push({ slot: slot, displayName: niceName });
  });

  return Object.values(groups).filter(g => g.slots.length > 0);
});

function generateNiceName(slotId: string, type: string): string {
  let name = "";
  if (type === 'fronts') name = "Ajtó";
  else if (type === 'handles') name = "Fogantyú";
  else if (type === 'legs') name = "Láb";
  else if (type === 'drawers') name = "Fiók";
  else name = "Elem";

  const lowerId = slotId.toLowerCase();
  if (lowerId.includes('_l') || lowerId.includes('left')) name = "Bal " + name;
  else if (lowerId.includes('_r') || lowerId.includes('right')) name = "Jobb " + name;

  if (lowerId.includes('vertical')) name += " (Függ.)";
  else if (lowerId.includes('horizontal')) name += " (Vízsz.)";

  return name;
}

// --- 🧠 SMART LOGIC: HELPERS ---

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

// --- 🧠 SMART LOGIC: FINDERS ---

// 1. Megkeresi az összes elérhető STÍLUST az adott slotban lévő alkatrészhez
function getAvailableStylesForSlot(slot: ComponentSlotConfig) {
  const currentId = getCurrentComponentId(slot.slotId);
  const currentComp = configStore.getComponentById(currentId);
  if (!currentComp || !currentComp.properties) return [];

  // Alap tulajdonságok a kereséshez
  const w = currentComp.properties.width || 0;
  const h = currentComp.properties.height || 0;
  const orient = getOrientation(currentComp.id);
  const type = currentComp.componentType;

  // Keresünk olyan stílusokat, amiknek van megfelelő méretű/típusú eleme
  const availableStyles = configStore.styles.filter(style => {
    // Van-e ebben a stílusban ilyen méretű/típusú elem?
    return Object.values(configStore.components).some(category => {
      return category.some(candidate => {
        if (candidate.styleId !== style.id) return false;
        if (candidate.componentType !== type) return false;

        // Méret ellenőrzés
        const cW = candidate.properties?.width || 0;
        const cH = candidate.properties?.height || 0;
        if (Math.abs(cW - w) > 2 || Math.abs(cH - h) > 2) return false;

        // Orientáció ellenőrzés
        const cOrient = getOrientation(candidate.id);
        if (orient === 'left' && cOrient === 'right') return false;
        if (orient === 'right' && cOrient === 'left') return false;

        return true; // Találtunk egy passzoló elemet ebben a stílusban!
      });
    });
  });

  return availableStyles;
}

// 2. Megkeresi a konkrét Alkatrész ID-t, amikor stílust váltunk
function findComponentIdByStyle(slotId: string, targetStyleId: string): string | null {
  const currentId = getCurrentComponentId(slotId);
  const currentComp = configStore.getComponentById(currentId);

  if (!currentComp || !currentComp.properties) {
    console.warn("⚠️ A jelenlegi elemnek nincsenek tulajdonságai!");
    return null;
  }

  // JAVÍTÁS: Típus keresése a Slot definícióból is (fallback)
  const slotDef = currentConfig.value?.componentSlots.find(s => s.slotId === slotId);
  const type = currentComp.componentType || slotDef?.componentType;

  if (!type) {
    console.error("❌ KRITIKUS HIBA: Nem sikerült meghatározni a komponens típusát (sem az adatból, sem a slotból).");
    return null;
  }

  const w = Number(currentComp.properties.width || 0);
  const h = Number(currentComp.properties.height || 0);
  const orient = getOrientation(currentComp.id);

  console.groupCollapsed(`🔍 SmartSwap Keresés: ${currentComp.name}`);
  console.log(`Bázis: ${w}x${h}mm, ${orient}, Típus: ${type}`);
  console.log(`Cél Stílus ID: ${targetStyleId}`);

  let bestMatch: string | null = null;

  const candidates = configStore.components[type] || [];
  console.log(`Jelöltek száma a '${type}' kategóriában: ${candidates.length}`);

  for (const candidate of candidates) {
    if (candidate.styleId !== targetStyleId) continue;

    const cW = Number(candidate.properties?.width || 0);
    const cH = Number(candidate.properties?.height || 0);
    const cOrient = getOrientation(candidate.id);

    console.log(`👉 Vizsgálat: ${candidate.name} (${candidate.id})`);
    console.log(`   Adatok: ${cW}x${cH}mm, ${cOrient}`);

    // Méret ellenőrzés
    const diffW = Math.abs(cW - w);
    const diffH = Math.abs(cH - h);

    if (diffW > 2 || diffH > 2) {
      console.log(`   ❌ KIESETT: Méret eltérés (W:${diffW}, H:${diffH})`);
      continue;
    }

    // Orientáció ellenőrzés
    if (orient === 'left' && cOrient === 'right') {
      console.log(`   ❌ KIESETT: Orientáció (Balos helyre Jobbos)`);
      continue;
    }
    if (orient === 'right' && cOrient === 'left') {
      console.log(`   ❌ KIESETT: Orientáció (Jobbos helyre Balos)`);
      continue;
    }

    console.log(`   ✅ TALÁLAT!`);
    bestMatch = candidate.id;
    break;
  }

  console.groupEnd();
  return bestMatch;
}

// --- RÉGI FILTER (Fallback azokhoz, amiknek nincs stílusa) ---
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

// Stílus váltás kezelő
function handleStyleChange(slotId: string, newStyleId: string) {
  console.log(`[SmartSwap] Stílus váltás kérés: ${newStyleId}`);
  const newComponentId = findComponentIdByStyle(slotId, newStyleId);

  if (newComponentId) {
    console.log(`   -> Találat: ${newComponentId}`);
    selectionStore.changeStyle(slotId, newComponentId);
  } else {
    console.warn(`   -> Nincs megfelelő méretű elem ebben a stílusban!`);
    alert("Ehhez a mérethez/pozícióhoz nem található elem a választott stílusban.");
  }
}

// Hagyományos komponens váltás
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
        <div class="space-y-3">
          <div v-for="(group, index) in slotGroups" :key="group.groupId">
            <label class="block text-xs font-medium text-gray-400 mb-1.5">{{ group.name }}</label>
            <div class="relative group">
              <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getCurrentSchemaId(group)">
                <option value="" disabled>Válassz...</option>
                <option v-for="schema in group.schemas" :key="schema.id" :value="schema.id">
                  {{ schema.name }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CSOPORTOSÍTOTT LISTA -->
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
                <!-- Ha nincs stílus, de van név, kiírjuk -->
                <span v-if="!getCurrentStyleId(item.slot.slotId)" class="text-[10px] text-gray-600 italic">
                  {{ getComponentName(getCurrentComponentId(item.slot.slotId)) }}
                </span>
              </div>

              <div class="grid gap-2" :class="(shouldShowMaterialSelector(item.slot)) ? 'grid-cols-2' : 'grid-cols-1'">

                <!-- A) STÍLUS VÁLASZTÓ (HA VAN STÍLUSA) -->
                <div v-if="getCurrentStyleId(item.slot.slotId)">
                  <div class="relative group">
                    <select :value="getCurrentStyleId(item.slot.slotId)"
                      @change="handleStyleChange(item.slot.slotId, ($event.target as HTMLSelectElement).value)"
                      class="w-full bg-[#2a2a2a] border border-blue-500/30 text-blue-100 font-bold text-[11px] rounded py-1.5 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-[#333] transition-colors">
                      <!-- Listázza az összes stílust, amiben van ilyen méretű elem -->
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

                <!-- B) KOMPONENS VÁLASZTÓ (FALLBACK - HA NINCS STÍLUSA) -->
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

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #60a5fa;
}
</style>
