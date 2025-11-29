<script setup lang="ts">
import { computed, ref, onBeforeUpdate, onUpdated } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import AdminPreviewCanvas from './AdminPreviewCanvas.vue';
import CollapsibleCategory from './CollapsibleCategory.vue';

const props = defineProps<{
  furnitureList: FurnitureConfig[];
  selectedFurniture: Partial<FurnitureConfig> | null;
}>();

const emit = defineEmits<{
  (e: 'update:selectedFurniture', value: FurnitureConfig | null): void;
  (e: 'createNew'): void;
  (e: 'slot-clicked', slotId: string): void;
  (e: 'attachment-clicked', pointId: string): void;
}>();

const searchQuery = ref('');
const scrollContainer = ref<HTMLElement | null>(null);

// --- GÖRGETÉS POZÍCIÓ MEGŐRZÉSE ---
let savedScrollTop = 0;

onBeforeUpdate(() => {
  if (scrollContainer.value) {
    savedScrollTop = scrollContainer.value.scrollTop;
  }
});

onUpdated(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = savedScrollTop;
  }
});

const categorizedFurniture = computed(() => {
  const list = props.furnitureList || [];
  const filtered = searchQuery.value
    ? list.filter(f =>
      f.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
    : list;

  const categories: Record<string, FurnitureConfig[]> = {};
  for (const furniture of filtered) {
    const category = furniture.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(furniture);
  }
  return categories;
});

function selectFurniture(furniture: FurnitureConfig) {
  if (props.selectedFurniture?.id === furniture.id) return;
  emit('update:selectedFurniture', furniture);
}

// --- GRAPHICAL SELECTOR BRIDGE ---
const previewCanvasRef = ref<{
  toggleAttachmentMarkers: (visible: boolean, activePoints: string[]) => void;
  setXRayMode: (enabled: boolean) => void;
} | null>(null);

function toggleAttachmentMarkers(visible: boolean, activePoints: string[]) {
  previewCanvasRef.value?.toggleAttachmentMarkers(visible, activePoints);
}

function setXRayMode(enabled: boolean) {
  if (previewCanvasRef.value) {
    previewCanvasRef.value.setXRayMode(enabled);
  }
}

defineExpose({
  toggleAttachmentMarkers,
  setXRayMode
});
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900 rounded-lg shadow-lg overflow-hidden border border-gray-700 p-4">

    <!-- 1. FELSŐ SZEKCIÓ: 3D PREVIEW -->
    <div class="h-96 bg-black relative border border-gray-700 rounded-lg flex-shrink-0 mb-4 overflow-hidden">
      <AdminPreviewCanvas ref="previewCanvasRef" :furniture-config="selectedFurniture"
        @slot-clicked="(id) => emit('slot-clicked', id)" @attachment-clicked="(id) => emit('attachment-clicked', id)" />

      <div class="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
        Preview
      </div>
    </div>

    <!-- 2. KÖZÉPSŐ SZEKCIÓ: LISTA -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <h2 class="section-header flex-shrink-0">Bútorok</h2>

      <div class="mb-2 pr-2">
        <input type="text" v-model="searchQuery" placeholder="Keresés név vagy ID alapján..."
          class="admin-input w-full text-sm" />
      </div>

      <div ref="scrollContainer" class="overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        <CollapsibleCategory v-for="(items, categoryName) in categorizedFurniture" :key="categoryName"
          :title="categoryName.toString().replace(/_/g, ' ')" start-open>
          <div v-for="furniture in items" :key="furniture.id" @click="selectFurniture(furniture)"
            class="p-2 rounded cursor-pointer border-l-4 transition-all mb-1" :class="[
              props.selectedFurniture?.id === furniture.id
                ? 'bg-gray-700 border-blue-500 shadow-md'
                : 'bg-gray-800 border-transparent hover:bg-gray-700 hover:border-gray-600'
            ]">
            <div class="flex justify-between items-center">
              <p class="font-semibold text-sm text-gray-200">{{ furniture.name }}</p>
              <span v-if="furniture.price" class="text-xs text-gray-500 font-mono">{{ furniture.price }} Ft</span>
            </div>
            <p class="text-xs text-gray-500 truncate">{{ furniture.id }}</p>
          </div>
        </CollapsibleCategory>

        <div v-if="Object.keys(categorizedFurniture).length === 0" class="text-center text-gray-500 py-4 text-sm">
          Nincs találat.
        </div>
      </div>
    </div>

    <!-- 3. ALSÓ SZEKCIÓ: MŰVELETEK -->
    <div class="flex-shrink-0 mt-4 pt-4 border-t border-gray-700">
      <button @click="$emit('createNew')" class="w-full admin-btn flex justify-center items-center gap-2 py-3">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
        </svg>
        Új Bútor Létrehozása
      </button>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(31, 41, 55, 0.5);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(75, 85, 99, 0.8);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 114, 128, 1);
}
</style>
