<script setup lang="ts">
import { type SlotGroup, ComponentType } from '@/config/furniture'
import {
  useLayoutLogic,
  useInspectorData
} from '@/composables/inspector/useInspectorLogic'
import { computed, ref, watch, triggerRef } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useProceduralStore } from '@/stores/procedural'
import MaterialSelectorOverlay from './MaterialSelectorOverlay.vue'

const props = defineProps<{
  group: SlotGroup
  index: number
  areDoorsVisible: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleDoors'): void
  (e: 'forceHideDoors'): void
}>()

const configStore = useConfigStore()
const proceduralStore = useProceduralStore()
const { selectedObject, currentConfig } = useInspectorData()
const { getLayoutDropdownValue, handleGroupChange, hasLayoutSchema } = useLayoutLogic(selectedObject)

// --- MAX POLC SZÁM ---
const maxShelves = computed(() => {
  if (!currentConfig.value || !selectedObject.value) return 0;
  const state = selectedObject.value.userData.componentState || {};

  for (const slot of currentConfig.value.componentSlots) {
    const componentId = state[slot.slotId] || slot.defaultComponent;
    if (!componentId) continue;
    const comp = configStore.getComponentById(componentId);
    if (comp?.properties?.maxShelves && comp.properties.maxShelves > 0) {
      return comp.properties.maxShelves;
    }
  }
  return 0;
});

// --- LÁTHATÓSÁG ---
const showShelfControl = computed(() => {
  if (maxShelves.value <= 0) return false;
  const groupName = props.group.name.toLowerCase();

  if (hasLayoutSchema(props.group)) return true;

  if (groupName.includes('handle') || groupName.includes('fogantyú') ||
    groupName.includes('leg') || groupName.includes('láb') ||
    groupName.includes('front') || groupName.includes('ajtó') ||
    groupName.includes('szín') || groupName.includes('color')) {
    return false;
  }

  const allowedKeywords = ['polc', 'shelf', 'layout', 'elrendezés', 'structure', 'szerkezet', 'corpus', 'korpusz', 'body', 'test', 'root', 'alap', 'general', 'általános', 'méretek', 'dimensions'];
  if (allowedKeywords.some(k => groupName.includes(k))) return true;

  if (props.group.schemas) {
    const hasRootOrCorpus = props.group.schemas.some(schema => {
      if (schema.apply) {
        return Object.keys(schema.apply).some(key => key.toLowerCase().includes('root') || key.toLowerCase().includes('corpus'));
      }
      return false;
    });
    if (hasRootOrCorpus) return true;
  }

  if (props.index === 0) return true;
  return false;
});

// --- REAKTIVITÁS ---
const updateTick = ref(0);
watch(selectedObject, () => { updateTick.value++; });

// --- ADATOK ---
const currentShelfCount = computed({
  get: () => { const _ = updateTick.value; return selectedObject.value?.userData?.shelfCount ?? 0; },
  set: (val) => {
    if (selectedObject.value) {
      selectedObject.value.userData.shelfCount = val;
      proceduralStore.triggerUpdate();
      updateTick.value++;
      triggerRef(selectedObject);
    }
  }
});

const currentShelfType = computed({
  get: () => { const _ = updateTick.value; return selectedObject.value?.userData?.shelfType ?? 'wood'; },
  set: (val) => {
    if (selectedObject.value) {
      selectedObject.value.userData.shelfType = val;
      proceduralStore.triggerUpdate();
      updateTick.value++;
      triggerRef(selectedObject);
    }
  }
});

// --- ANYAG KEZELÉS ---
const corpusMaterial = computed(() => {
  if (!currentConfig.value || !selectedObject.value) return null;
  const corpusSlot = currentConfig.value.componentSlots.find(s => s.componentType === ComponentType.CORPUS);
  if (!corpusSlot) return null;
  const state = selectedObject.value.userData.componentState || {};
  const corpusId = state[corpusSlot.slotId] || corpusSlot.defaultComponent;
  if (!corpusId) return null;
  const matState = selectedObject.value.userData.materialState || {};
  const assignedMatId = matState[corpusSlot.slotId];
  if (assignedMatId) return configStore.getMaterialById(assignedMatId);
  const corpusComp = configStore.getComponentById(corpusId);
  if (corpusComp && corpusComp.materialOptions && corpusComp.materialOptions.length > 0) {
    const defaultMatId = corpusComp.materialOptions[0];
    if (defaultMatId) return configStore.getMaterialById(defaultMatId);
  }
  return null;
});

const currentGlassMaterialId = computed({
  get: () => selectedObject.value?.userData?.shelfMaterialId,
  set: (val) => {
    if (selectedObject.value) {
      selectedObject.value.userData.shelfMaterialId = val;
      proceduralStore.triggerUpdate();
      updateTick.value++;
      triggerRef(selectedObject);
    }
  }
});

const currentGlassMaterial = computed(() => {
  if (currentGlassMaterialId.value) return configStore.getMaterialById(currentGlassMaterialId.value);
  return configStore.materials.find(m => (Array.isArray(m.category) ? m.category.includes('glass') : m.category === 'glass') || m.id.includes('glass'));
});

const displayMaterial = computed(() => {
  return currentShelfType.value === 'wood' ? corpusMaterial.value : currentGlassMaterial.value;
});

// --- POPUP KEZELÉS ---
const isSelectorOpen = ref(false);

const availableGlassMaterials = computed(() => {
  return configStore.materials.filter(m => {
    const cats = Array.isArray(m.category) ? m.category : [m.category];
    return cats.some(c => c.toLowerCase().includes('glass') || c.toLowerCase().includes('üveg'));
  });
});

const openSelector = () => {
  if (currentShelfType.value === 'glass') {
    isSelectorOpen.value = true;
  }
};

const selectMaterial = (id: string) => {
  currentGlassMaterialId.value = id;
  isSelectorOpen.value = false;
};

// --- AJTÓ AUTOMATIKA ---
const wasDoorsVisible = ref(false);
const onSliderStart = () => {
  wasDoorsVisible.value = props.areDoorsVisible;
  if (props.areDoorsVisible) emit('toggleDoors');
};
const onSliderEnd = () => {
  if (wasDoorsVisible.value && !props.areDoorsVisible) emit('toggleDoors');
};

// --- BIZTONSÁGOS MOCK OBJEKTUM (EZ HIÁNYZOTT!) ---
const fakeControl = {
  id: 'shelf_glass',
  label: 'Polc Üveg Típusa',
  type: 'material',
  referenceSlot: { slotId: 'shelf_glass_dummy' }
};
</script>

<template>
  <div class="mb-4 relative">

    <label v-if="hasLayoutSchema(group) || showShelfControl" class="block text-xs font-medium text-gray-400 mb-1.5">{{
      group.name }}</label>

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

      <!-- 1. SOR: CSÚSZKA -->
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-gray-400 uppercase font-bold w-12">Polcok:</span>
        <div class="flex-1 h-6 flex items-center group relative">
          <div class="relative w-[90%] h-full mx-auto">
            <div class="absolute w-full h-1 bg-gray-700 rounded-lg top-1/2 -translate-y-1/2"></div>
            <div v-for="n in (maxShelves + 1)" :key="n"
              class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-gray-500 rounded-full pointer-events-none"
              :style="{ left: `${((n - 1) / maxShelves) * 100}%` }"></div>
            <div
              class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-500 rounded-full shadow-md pointer-events-none z-10 transition-all duration-75 ease-out"
              :style="{ left: `${(currentShelfCount / maxShelves) * 100}%` }"></div>
            <input type="range" min="0" :max="maxShelves" step="1" v-model.number="currentShelfCount"
              @mousedown="onSliderStart" @mouseup="onSliderEnd" @touchstart="onSliderStart" @touchend="onSliderEnd"
              class="absolute w-full h-full top-0 left-0 opacity-0 z-20 cursor-pointer m-0 p-0 appearance-none" />
            <div
              class="absolute -top-6 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30"
              :style="{ left: `${(currentShelfCount / maxShelves) * 100}%` }">{{ currentShelfCount }}</div>
          </div>
        </div>
        <button @click="$emit('toggleDoors')"
          class="w-6 h-6 flex items-center justify-center rounded transition-colors focus:outline-none"
          :class="areDoorsVisible ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'">
          <svg v-if="areDoorsVisible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
      </div>

      <!-- 2. SOR: ANYAG VÁLASZTÓ -->
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1">Polc Anyaga</label>
        <div class="grid grid-cols-3 gap-2 h-8">

          <div class="col-span-2 relative h-full">
            <select v-model="currentShelfType"
              class="w-full h-full bg-[#2a2a2a] text-gray-200 text-xs rounded-md pl-2 pr-6 appearance-none border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors cursor-pointer hover:bg-[#333]">
              <option value="wood">Bútorlap</option>
              <option value="glass">Üveg</option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>

          <button @click="openSelector"
            class="col-span-1 h-full rounded-md border border-gray-700 relative overflow-hidden transition-all group"
            :class="currentShelfType === 'wood' ? 'opacity-50 cursor-not-allowed bg-gray-800' : 'hover:border-gray-500 cursor-pointer bg-[#2a2a2a]'"
            :title="currentShelfType === 'wood' ? 'A polc örökli a korpusz színét' : 'Üveg típusának módosítása'">
            <div class="w-full h-full flex items-center justify-center bg-gray-800">
              <template v-if="displayMaterial">
                <div v-if="displayMaterial.type === 'color'" class="w-full h-full"
                  :style="{ backgroundColor: displayMaterial.value }"></div>
                <img v-else :src="(displayMaterial as any).thumbnail || displayMaterial.value"
                  class="w-full h-full object-cover" />
              </template>
              <div v-else class="text-[9px] text-gray-500">N/A</div>
            </div>
            <div v-if="currentShelfType === 'wood'" class="absolute inset-0 z-10 pointer-events-none">
              <svg class="w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="100%" x2="100%" y2="0" stroke="#ef4444" stroke-width="1.5" stroke-opacity="0.8" />
              </svg>
            </div>
          </button>

        </div>
      </div>

    </div>

    <!-- ANYAG VÁLASZTÓ POPUP -->
    <!-- JAVÍTÁS: v-if a Teleporton, hogy ne keressen ID-t amíg nem kell -->
    <Teleport to="#inspector-root" v-if="isSelectorOpen">
      <MaterialSelectorOverlay :active-control="fakeControl as any" :available-materials="availableGlassMaterials"
        @close="isSelectorOpen = false" @select="selectMaterial" />
    </Teleport>

  </div>
</template>
