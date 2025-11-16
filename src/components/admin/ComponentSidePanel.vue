<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ComponentConfig, ComponentDatabase, FurnitureConfig } from '@/config/furniture';
import AdminPreviewCanvas from './AdminPreviewCanvas.vue';
import CollapsibleCategory from './CollapsibleCategory.vue'; 

// PROPS: Megkapja a kiválasztott komponenst ÉS a 3D nézethez generált "ál" bútort
const props = defineProps<{
  componentDatabase: ComponentDatabase; // <-- ÚJ PROP
  selectedComponent: Partial<ComponentConfig> | null;
  previewConfig: Partial<FurnitureConfig> | null;
  updateTrigger: number; // <-- ÚJ PROP
}>();

// EMITS: Változatlan
const emit = defineEmits<{
  (e: 'select-component', value: ComponentConfig): void;
  (e: 'create-new', type: string): void;
  (e: 'save-to-server'): void;
}>();

const componentTypes = computed(() => Object.keys(props.componentDatabase));
const selectedType = ref<string>('');

watch(componentTypes, (newTypes) => {
  if (newTypes[0]) selectedType.value = newTypes[0];
}, { immediate: true });

</script>

<template>
  <div class="admin-panel flex flex-col p-4 max-h-[calc(100vh-4rem)]">
    
    <!-- FELSŐ SZEKCIÓ (nem görgetődik) -->
    <div class="flex-shrink-0">
      <div class="grid grid-cols-2 gap-2">
        <div class="flex items-center justify-start">
          <h2 class="section-header mb-0">Komponens Lista</h2>
        </div>
        <button @click="emit('save-to-server')" class="admin-btn bg-red-600 hover:bg-red-700">Mentés</button>
      </div>
      <div class="mt-4">
        <h2 class="section-header">3D Preview</h2>
        <div class="bg-gray-900 p-1 rounded-lg h-64">
          <AdminPreviewCanvas 
            :key="props.updateTrigger"
            v-if="props.previewConfig"
            :furniture-config="props.previewConfig"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            <p>Válassz ki egy komponenst.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ALSÓ SZEKCIÓ (görgetődik) -->
    <div class="flex-1 min-h-0 flex flex-col mt-4">
      <h2 class="section-header flex-shrink-0">Komponensek</h2>
      <div class="overflow-y-auto space-y-2">
        <CollapsibleCategory 
          v-for="type in componentTypes" 
          :key="type"
          :title="type"
          start-open
        >
          <div class="w-full text-right mb-2">
             <button @click="emit('create-new', type)" class="admin-btn-secondary text-xs py-1 px-2">+ Új {{ type }}</button>
          </div>
          <div v-for="component in props.componentDatabase[type]" :key="component.id"
            @click="emit('select-component', component)"
            class="p-2 rounded cursor-pointer hover:bg-gray-700 border-2"
            :class="[props.selectedComponent?.id === component.id ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 border-transparent']">
            <p class="font-semibold text-sm">{{ component.name }}</p>
            <p class="text-xs text-gray-400">{{ component.id }}</p>
          </div>
        </CollapsibleCategory>
      </div>
    </div>
  </div>
</template>