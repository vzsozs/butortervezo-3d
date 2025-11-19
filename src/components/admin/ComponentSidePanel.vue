<script setup lang="ts">
import { computed, ref } from 'vue'; // Watch nem kell
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
  (e: 'save-to-server'): void; // Ez eddig nem volt bekötve!
  (e: 'create-category', categoryName: string): void;
}>();

const componentTypes = computed(() => Object.keys(props.componentDatabase));
const newCategoryName = ref('');

// --- LOGIKA ---
function selectComponent(component: ComponentConfig, type: string) {
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
  <div class="admin-panel flex flex-col p-4 max-h-[calc(100vh-4rem)]">
    
    <!-- 1. FELSŐ SZEKCIÓ: PREVIEW (Fix) -->
    <div class="flex-shrink-0 mb-4">
      <h2 class="section-header">3D Előnézet</h2>
      <div class="bg-gray-900 p-1 rounded-lg h-48 shadow-inner border border-gray-700">
        <AdminPreviewCanvas 
          v-if="props.previewConfig"
          :key="props.selectedComponent?.id || 'preview-canvas'"
          :furniture-config="props.previewConfig"
        />
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm">
          <span class="text-2xl mb-2">🧊</span>
          <p>Válassz komponenst</p>
        </div>
      </div>
    </div>

    <!-- 2. KÖZÉPSŐ SZEKCIÓ: LISTA (Görgethető) -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <h2 class="section-header flex-shrink-0">Adatbázis</h2>
      
      <div class="overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        <CollapsibleCategory 
          v-for="type in componentTypes" 
          :key="type"
          :title="type"
          start-open
        >
          <!-- Kategória fejléc gomb -->
          <div class="w-full text-right mb-2">
             <button @click="emit('create-new', type)" class="text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 py-1 px-2 rounded transition-colors border border-blue-800">
               + Új {{ type }}
             </button>
          </div>
          
          <!-- Elemek listája -->
          <div v-for="component in props.componentDatabase[type]" :key="component.id"
            @click="selectComponent(component, type)"
            class="p-2 rounded cursor-pointer border-l-4 transition-all mb-1"
            :class="[
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

        <!-- Üres állapot -->
        <div v-if="componentTypes.length === 0" class="text-center text-gray-500 py-4 text-sm">
          Nincsenek kategóriák. Hozz létre egyet lent!
        </div>
      </div>
    </div>

    <!-- 3. ALSÓ SZEKCIÓ: ADMINISZTRÁCIÓ (Fix) -->
    <div class="flex-shrink-0 mt-4 pt-4 border-t border-gray-700 space-y-4">
      
      <!-- Új kategória -->
      <div>
        <h3 class="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Kategória Kezelés</h3>
        <form @submit.prevent="createCategory" class="flex gap-2">
          <input 
            type="text" 
            v-model="newCategoryName"
            placeholder="pl. shelves"
            class="admin-input flex-grow text-sm"
          />
          <button type="submit" class="admin-btn-secondary text-sm whitespace-nowrap">Létrehoz</button>
        </form>
      </div>

      <!-- Mentés gomb (EZ HIÁNYZOTT!) -->
      <button @click="emit('save-to-server')" class="w-full admin-btn flex justify-center items-center gap-2 py-3">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
        Adatbázis Mentése (JSON)
      </button>

    </div>
  </div>
</template>

<style scoped>
/* Opcionális: vékonyabb görgetősáv */
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