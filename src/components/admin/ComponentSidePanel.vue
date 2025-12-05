<script setup lang="ts">
import { computed, ref, onBeforeUpdate, onUpdated } from 'vue';
import type { ComponentConfig, ComponentDatabase, FurnitureConfig } from '@/config/furniture';
import AdminPreviewCanvas from './AdminPreviewCanvas.vue';
import CollapsibleCategory from './CollapsibleCategory.vue';

const props = defineProps<{
  componentDatabase: ComponentDatabase;
  selectedComponent: Partial<ComponentConfig> | null;
  previewConfig: Partial<FurnitureConfig> | null;
}>();

const emit = defineEmits<{
  (e: 'select-component', component: ComponentConfig, type: string): void;
  (e: 'create-new', type: string): void;
  (e: 'save-to-server'): void;
  (e: 'create-category', categoryName: string): void;
}>();

// --- KERESÉS LOGIKA (ÚJ) ---
const searchQuery = ref('');

// Computed property a szűréshez.
// Ha van keresőszó, végigmegy az adatbázison és csak azokat a komponenseket/kategóriákat adja vissza, ahol van találat.
const filteredDatabase = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.componentDatabase;
  }

  const query = searchQuery.value.toLowerCase();
  const result: ComponentDatabase = {};

  for (const [type, components] of Object.entries(props.componentDatabase)) {
    const filteredComponents = components.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query)
    );

    if (filteredComponents.length > 0) {
      result[type] = filteredComponents;
    }
  }
  return result;
});

// A kategóriák listája most már a szűrt adatbázisból jön
const componentTypes = computed(() => Object.keys(filteredDatabase.value));

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

// --- LOGIKA ---
function selectComponent(component: ComponentConfig, type: string) {
  if (props.selectedComponent?.id === component.id) return;
  emit('select-component', component, type);
}

function createCategory() {
  if (newCategoryName.value && !props.componentDatabase[newCategoryName.value]) {
    emit('create-category', newCategoryName.value);
    newCategoryName.value = '';
  } else {
    alert('Érvénytelen vagy már létező kategórianév!');
  }
}
</script>

<template>
  <div class="admin-panel flex flex-col border border-gray-700 p-4 max-h-[calc(100vh-4rem)]">


    <!-- 1. FELSŐ SZEKCIÓ: PREVIEW -->
    <div class="flex-shrink-0 mb-4">
      <h2 class="section-header">3D Előnézet</h2>
      <div class="bg-gray-900 p-1 rounded-lg h-72 shadow-inner border border-gray-700">
        <AdminPreviewCanvas v-if="props.previewConfig" :key="props.selectedComponent?.id || 'preview-canvas'"
          :furniture-config="props.previewConfig" />
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm">
          <span class="text-2xl mb-2">🧊</span>
          <p>Válassz komponenst</p>
        </div>
      </div>
    </div>

    <!-- 2. KÖZÉPSŐ SZEKCIÓ: LISTA -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <h2 class="section-header flex-shrink-0">Komponensek</h2>

      <!-- ÚJ KERESŐMEZŐ -->
      <div class="flex-shrink-0 mb-3">
        <div class="relative">
          <input v-model="searchQuery" type="text" placeholder="Keresés név vagy ID alapján..."
            class="admin-input w-full text-sm pl-8 border border-gray-600 rounded bg-gray-800 text-gray-200 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 placeholder-gray-500" />
          <svg class="w-4 h-4 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-500" fill="none"
            stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
      </div>

      <div ref="scrollContainer" class="overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        <CollapsibleCategory v-for="type in componentTypes" :key="type" :title="type" start-open>
          <div class="w-full text-right mb-2">
            <button @click="emit('create-new', type)"
              class="text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 py-1 px-2 rounded transition-colors border border-blue-800">
              + Új {{ type }}
            </button>
          </div>

          <!-- Itt a filteredDatabase-t használjuk a props.componentDatabase helyett -->
          <div v-for="component in filteredDatabase[type]" :key="component.id" @click="selectComponent(component, type)"
            class="p-2 rounded cursor-pointer border-l-4 transition-all mb-1" :class="[
              props.selectedComponent?.id === component.id
                ? 'bg-gray-700 border-blue-500 shadow-md'
                : 'bg-gray-800 border-transparent hover:bg-gray-700 hover:border-gray-600'
            ]">
            <div class="flex justify-between items-center">
              <p class="font-semibold text-sm text-gray-200">{{ component.name }}</p>
              <span class="text-xs text-gray-500 font-mono">{{ component.price }} Ft</span>
            </div>
            <p class="text-xs text-gray-500 truncate">{{ component.id }}</p>
          </div>
        </CollapsibleCategory>

        <div v-if="componentTypes.length === 0" class="text-center text-gray-500 py-4 text-sm">
          {{ searchQuery ? 'Nincs találat a keresésre.' : 'Nincsenek kategóriák. Hozz létre egyet lent!' }}
        </div>
      </div>
    </div>

    <!-- 3. ALSÓ SZEKCIÓ: ADMINISZTRÁCIÓ -->
    <div class="flex-shrink-0 mt-4 pt-4 border-t border-gray-700 space-y-4">
      <div>
        <h3 class="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Kategória Kezelés</h3>
        <form @submit.prevent="createCategory" class="flex gap-2">
          <input type="text" v-model="newCategoryName" placeholder="pl. shelves"
            class="admin-input flex-grow text-sm" />
          <button type="submit"
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded text-sm transition-colors whitespace-nowrap">
            Létrehoz
          </button>
        </form>
      </div>

      <!-- MÓDOSÍTOTT GOMB: DISABLED ÉS ÁTNEVEZVE -->
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
