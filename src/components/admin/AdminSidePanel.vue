<!-- src/components/admin/AdminSidePanel.vue -->

<script setup lang="ts">
import { computed, ref, watch } from 'vue'; // onMounted már nem kell
import type { FurnitureConfig } from '@/config/furniture';
import AdminPreviewCanvas from './AdminPreviewCanvas.vue';
import CollapsibleCategory from './CollapsibleCategory.vue';

const props = defineProps<{
  furnitureList: FurnitureConfig[];
  selectedFurniture: Partial<FurnitureConfig> | null;
  // updateTrigger már nem szükséges a reaktív működéshez, de a prop definíció maradhat, ha máshol kell
}>();

const emit = defineEmits<{
  (e: 'update:selectedFurniture', value: FurnitureConfig | null): void;
  (e: 'createNew'): void;
  (e: 'slot-clicked', slotId: string): void;
}>();

const searchQuery = ref('');

// --- ÚJ DETEKTÍV A PROP-RA ---
watch(() => props.selectedFurniture, (newValue) => {
    console.log('➡️ LOG C: [AdminSidePanel] A "selectedFurniture" PROP megváltozott, ezt adom tovább a canvasnak:', JSON.parse(JSON.stringify(newValue)));
}, { deep: true });
// --- ÚJ DETEKTÍV VÉGE ---


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
  // --- DIAGNOSZTIKAI LOG HOZZÁADVA ---
  console.log('➡️ LOG 1: [AdminSidePanel] Bútorra kattintás történt, ezt küldöm fel:', JSON.parse(JSON.stringify(furniture)));
  emit('update:selectedFurniture', furniture);
}
</script>

<template>
  <div class="admin-panel flex flex-col p-4 max-h-[calc(100vh-4rem)]">
    
    <!-- FELSŐ SZEKCIÓ (nem görgetődik) -->
    <div class="flex-shrink-0">
      <div class="mt-4">
        <h2 class="section-header">3D Preview</h2>
        <div class="bg-gray-900 p-1 rounded-lg h-64">
          <!-- JAVÍTÁS: A ref és a key már nem szükséges a reaktív prop miatt -->
          <AdminPreviewCanvas 
            :furniture-config="props.selectedFurniture"
            @slot-clicked="$emit('slot-clicked', $event)"
          />
        </div>
      </div>
    </div>

    <!-- ALSÓ SZEKCIÓ (görgetődik) -->
    <div class="flex-1 min-h-0 flex flex-col mt-4">
      <h2 class="section-header flex-shrink-0">Bútorok</h2>
      <input 
        type="text" 
        v-model="searchQuery" 
        placeholder="Keresés..." 
        class="admin-input w-full mb-2 flex-shrink-0"
      />
      <div class="my-4">
        <button @click="$emit('createNew')" class="admin-btn w-full">Új Bútor</button>
      </div>
      <div class="overflow-y-auto space-y-2">
        <CollapsibleCategory 
          v-for="(items, categoryName) in categorizedFurniture" 
          :key="categoryName"
          :title="categoryName.toString().replace(/_/g, ' ')"
          start-open
        >
          <div v-for="furniture in items" :key="furniture.id"
            @click="selectFurniture(furniture)"
            class="p-2 rounded cursor-pointer hover:bg-gray-700 border-2"
            :class="[props.selectedFurniture?.id === furniture.id ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 border-transparent']">
            <p class="font-semibold text-sm">{{ furniture.name }}</p>
            <p class="text-xs text-gray-400">{{ furniture.id }}</p>
          </div>
        </CollapsibleCategory>
      </div>
    </div>
  </div>
</template>
