<script setup lang="ts">
import { type SlotGroup, ComponentType } from '@/config/furniture'
import {
  useLayoutLogic,
  useInspectorData
} from '@/composables/inspector/useInspectorLogic'
import { computed, ref, watch, triggerRef } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useProceduralStore } from '@/stores/procedural'

const props = defineProps<{
  group: SlotGroup
  index: number
  areDoorsVisible: boolean
}>()

defineEmits<{
  (e: 'toggleDoors'): void
  (e: 'forceHideDoors'): void
}>()

const configStore = useConfigStore()
const proceduralStore = useProceduralStore()
const { selectedObject, currentConfig } = useInspectorData()
const { getLayoutDropdownValue, handleGroupChange, hasLayoutSchema } = useLayoutLogic(selectedObject)

// --- MAX POLC SZÁM LEKÉRÉSE ---
const maxShelves = computed(() => {
  if (!currentConfig.value) return 0;
  const corpusSlot = currentConfig.value.componentSlots.find(s => s.componentType === ComponentType.CORPUS);
  if (!corpusSlot) return 0;
  const currentState = selectedObject.value?.userData?.componentState || {};
  const currentCorpusId = currentState[corpusSlot.slotId] || corpusSlot.defaultComponent;
  if (!currentCorpusId) return 0;
  const comp = configStore.getComponentById(currentCorpusId);
  return comp?.properties?.maxShelves || 0;
});

// --- LÁTHATÓSÁG ---
const showShelfControl = computed(() => {
  // 1. Ha a bútornak nem lehet polca, akkor sehol ne mutassuk
  if (maxShelves.value <= 0) return false;

  const name = props.group.name.toLowerCase();

  // 2. Dedikált csoportok (név alapján)
  if (name.includes('polc') || name.includes('shelf')) return true;
  if (name.includes('layout') || name.includes('elrendezés')) return true;

  // 3. JAVÍTOTT: Ha ez a csoport tartalmazza a KORPUSZT (a sémák alapján)
  // Megnézzük, hogy a csoport sémái közül bármelyik érint-e 'corpus' nevű slotot
  if (props.group.schemas) {
    const hasCorpusSchema = props.group.schemas.some(schema =>
      schema.apply && Object.keys(schema.apply).some(key => key.includes('corpus'))
    );
    if (hasCorpusSchema) return true;
  }

  return false;
});

// --- REAKTIVITÁS ---
const updateTick = ref(0);

watch(selectedObject, () => {
  updateTick.value++;
});

// --- POLC SZÁM ---
const currentShelfCount = computed({
  get: () => {
    const _ = updateTick.value;
    return selectedObject.value?.userData?.shelfCount ?? 0;
  },
  set: (val) => {
    if (selectedObject.value) {
      selectedObject.value.userData.shelfCount = val;
      proceduralStore.triggerUpdate();
      updateTick.value++;
      triggerRef(selectedObject);
    }
  }
});

// --- POLC TÍPUS ---
const currentShelfType = computed({
  get: () => {
    const _ = updateTick.value;
    return selectedObject.value?.userData?.shelfType ?? configStore.generalSettings.shelves?.defaultType ?? 'wood';
  },
  set: (val) => {
    if (selectedObject.value) {
      selectedObject.value.userData.shelfType = val;
      proceduralStore.triggerUpdate();
      updateTick.value++;
      triggerRef(selectedObject);
    }
  }
});

const sliderId = `shelf-slider-${props.index}`;
</script>

<template>
  <div class="mb-4">
    <label class="block text-xs font-medium text-gray-400 mb-1.5">{{ group.name }}</label>

    <!-- LAYOUT VÁLTÓ -->
    <div v-if="hasLayoutSchema(group)" class="relative group mb-3">
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

    <!-- POLC VEZÉRLŐ -->
    <div v-if="showShelfControl" class="bg-[#252525] p-3 rounded-md border border-gray-800 space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-gray-400 uppercase font-bold w-12">Polcok:</span>
        <div class="relative flex-1 group">
          <input type="range" min="0" :max="maxShelves" step="1" v-model.number="currentShelfCount" :list="sliderId"
            class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
          <datalist :id="sliderId">
            <option v-for="n in (maxShelves + 1)" :key="n" :value="n - 1" label=""></option>
          </datalist>
          <div
            class="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {{ currentShelfCount }}
          </div>
        </div>
        <span class="text-sm font-bold text-yellow-500 w-6 text-right">{{ currentShelfCount }}</span>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-[11px] text-gray-400 uppercase font-bold w-12">Anyag:</span>
        <div class="flex bg-[#1a1a1a] rounded p-0.5 flex-1 border border-gray-700">
          <button @click="currentShelfType = 'wood'" class="flex-1 text-[10px] font-bold py-1 rounded transition-colors"
            :class="currentShelfType === 'wood' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'">
            Bútorlap
          </button>
          <button @click="currentShelfType = 'glass'"
            class="flex-1 text-[10px] font-bold py-1 rounded transition-colors"
            :class="currentShelfType === 'glass' ? 'bg-cyan-900/50 text-cyan-400 shadow' : 'text-gray-500 hover:text-gray-300'">
            Üveg
          </button>
        </div>
      </div>

      <div class="flex justify-end pt-1 border-t border-gray-700/50">
        <button @click="$emit('toggleDoors')" title="Ajtók megjelenítése/elrejtése"
          class="flex items-center gap-2 px-2 py-1 rounded transition-all text-[10px] font-bold uppercase tracking-wide"
          :class="areDoorsVisible ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
          <span>{{ areDoorsVisible ? 'Ajtók elrejtése' : 'Ajtók mutatása' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
