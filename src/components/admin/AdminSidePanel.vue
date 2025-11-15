<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import AdminPreviewCanvas from './AdminPreviewCanvas.vue';

// JAVÍTÁS: A prop neve 'selectedFurniture', és a típusa Partial<...>
const props = defineProps<{
  selectedFurniture: Partial<FurnitureConfig> | null;
}>();

// EMITS: Jelzi a szülőnek, ha a user új bútort választ, vagy ha a 3D-ben kattint
const emit = defineEmits<{
  (e: 'update:selectedFurniture', value: FurnitureConfig | null): void;
  (e: 'createNew'): void;
  (e: 'saveToServer'): void;
  (e: 'slot-clicked', slotId: string): void;
}>();

const allFurniture = ref<FurnitureConfig[]>([]);
const searchQuery = ref('');

// A bútorlista most már a kereső alapján szűrődik
const filteredFurniture = computed(() => {
  if (!searchQuery.value) {
    return allFurniture.value;
  }
  return allFurniture.value.filter(f => 
    f.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    f.id.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

onMounted(async () => {
  try {
    const response = await fetch('/database/furniture.json');
    if (!response.ok) throw new Error('A furniture.json betöltése sikertelen.');
    allFurniture.value = await response.json();
  } catch (error) { console.error(error); }
});

// Ha a user egy bútorra kattint, jelezzük a szülőnek az 'emit' segítségével
function selectFurniture(furniture: FurnitureConfig) {
  emit('update:selectedFurniture', furniture);
}

</script>

<template>
  <!-- Az admin-panel egy új, általános stílusosztály lesz -->
  <div class="admin-panel flex flex-col gap-4">
    
    <!-- JAVÍTÁS: Új gomb-elrendezés a tetején -->
    <div class="flex-shrink-0">
      <!-- A grid 2 oszlopra osztja a helyet a gomboknak -->
      <div class="grid grid-cols-2 gap-2">
        <button @click="emit('createNew')" class="admin-btn">Új Bútor</button>
        <button @click="emit('saveToServer')" class="admin-btn bg-red-600 hover:bg-red-700">
          Mentés
        </button>
      </div>
    </div>

    <!-- 3D Előnézet (fix magassággal) -->
    <div class="flex-shrink-0">
      <h2 class="section-header">3D Preview</h2>
      <div class="bg-gray-900 p-1 rounded-lg h-64">
        <AdminPreviewCanvas 
          v-if="props.selectedFurniture"
          :furniture-config="props.selectedFurniture"
          @slot-clicked="emit('slot-clicked', $event)"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-500 text-sm">
          <p>Válassz ki egy bútort.</p>
        </div>
      </div>
    </div>

    <!-- Bútorok Lista (kitölti a maradék helyet és görgethető) -->
    <div class="flex-shrink-0 flex-1 flex flex-col min-h-0">
      <h2 class="section-header">Bútorok</h2>
      <div class="flex flex-col gap-2">
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="Keresés név vagy ID alapján..." 
          class="admin-input w-full mb-2"
        />
      </div>
      
      <div class="space-y-2 overflow-y-auto mt-4">
        <div v-for="furniture in filteredFurniture" :key="furniture.id"
          @click="selectFurniture(furniture)"
          class="p-2 rounded cursor-pointer hover:bg-gray-700 border-2"
          :class="[props.selectedFurniture?.id === furniture.id ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 border-transparent']">
          <p class="font-semibold text-sm">{{ furniture.name }}</p>
          <p class="text-xs text-gray-400">{{ furniture.id }}</p>
        </div>
      </div>
    </div>
  </div>
</template>