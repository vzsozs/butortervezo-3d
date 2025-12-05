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
  // Ezt hívjuk, ha meglévő kategórián belül nyomjuk a gombot
  (e: 'create-new', category: string): void;
  // Ezt hívjuk, ha lent új kategóriát írunk be (a szülőnek kell létrehoznia egy itemet ezzel a kategóriával)
  (e: 'create-category', categoryName: string): void;
  (e: 'slot-clicked', slotId: string): void;
  (e: 'attachment-clicked', pointId: string): void;
}>();

const searchQuery = ref('');
const newCategoryName = ref('');
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

// --- CSOPORTOSÍTÁS LOGIKA ---
const categorizedFurniture = computed(() => {
  const list = props.furnitureList || [];

  // 1. Szűrés keresőszóra
  const filtered = searchQuery.value
    ? list.filter(f =>
      f.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
    : list;

  // 2. Csoportosítás kategória szerint
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

// Új kategória (valójában új item új kategóriával)
function createCategory() {
  if (newCategoryName.value.trim()) {
    emit('create-category', newCategoryName.value.trim());
    newCategoryName.value = '';
  } else {
    alert('Adj meg egy kategória nevet!');
  }
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
    <div class="flex-shrink-0 mb-4">
      <h2 class="section-header">3D Előnézet</h2>
      <div class="bg-gray-900 p-1 rounded-lg h-96 shadow-inner border border-gray-700">
        <AdminPreviewCanvas v-if="selectedFurniture" ref="previewCanvasRef" :furniture-config="selectedFurniture"
          @slot-clicked="(id) => emit('slot-clicked', id)"
          @attachment-clicked="(id) => emit('attachment-clicked', id)" />
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm">
          <span class="text-2xl mb-2">🧊</span>
          <p>Válassz bútort</p>
        </div>
      </div>
    </div>

    <!-- 2. KÖZÉPSŐ SZEKCIÓ: LISTA -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <h2 class="section-header flex-shrink-0">Bútorok</h2>

      <!-- KERESŐMEZŐ (JAVÍTOTT STÍLUS) -->
      <div class="flex-shrink-0 mb-3 pr-2">
        <div class="relative">
          <input v-model="searchQuery" type="text" placeholder="Keresés név vagy ID alapján..."
            class="admin-input w-full text-sm pl-8 border border-gray-600 rounded bg-gray-800 text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <svg class="w-4 h-4 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-500" fill="none"
            stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
      </div>

      <div ref="scrollContainer" class="overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        <!-- KATEGÓRIÁK LISTÁZÁSA -->
        <CollapsibleCategory v-for="(items, categoryName) in categorizedFurniture" :key="categoryName"
          :title="categoryName.toString().replace(/_/g, ' ')" start-open>

          <!-- ÚJ BÚTOR GOMB A KATEGÓRIÁN BELÜL -->
          <div class="w-full text-right mb-2">
            <button @click="emit('create-new', categoryName.toString())"
              class="text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 py-1 px-2 rounded transition-colors border border-blue-800">
              + Új {{ categoryName.toString().replace(/_/g, ' ') }}
            </button>
          </div>

          <!-- BÚTOROK LISTÁZÁSA -->
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
          {{ searchQuery ? 'Nincs találat.' : 'Nincsenek bútorok.' }}
        </div>
      </div>
    </div>

    <!-- 3. ALSÓ SZEKCIÓ: MŰVELETEK -->
    <div class="flex-shrink-0 mt-4 pt-4 border-t border-gray-700 space-y-4">

      <!-- KATEGÓRIA LÉTREHOZÁS -->
      <div>
        <h3 class="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Kategória Kezelés</h3>
        <form @submit.prevent="createCategory" class="flex gap-2">
          <input type="text" v-model="newCategoryName" placeholder="pl. top cabinets"
            class="admin-input flex-grow text-sm" />
          <button type="submit"
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded text-sm transition-colors whitespace-nowrap">
            Létrehoz
          </button>
        </form>
      </div>

      <!-- HAMAROSAN GOMB -->
      <button disabled
        class="w-full admin-btn flex justify-center items-center gap-2 py-3 opacity-50 cursor-not-allowed bg-gray-700 hover:bg-gray-700 border-gray-600 text-gray-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Hamarosan
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
