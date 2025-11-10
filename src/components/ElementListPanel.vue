<!-- src/components/ElementListPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useExperienceStore } from '@/stores/experience';
import { useSelectionStore } from '@/stores/selection';
import type { Group } from 'three';

const settingsStore = useSettingsStore();
const experienceStore = useExperienceStore();
const selectionStore = useSelectionStore();

// A 3D jelenetből a lehelyezett objektumok listája
const placedObjects = computed(() => experienceStore.placedObjects);

// A kiválasztott objektum UUID-ja a selection store-ból
const selectedObjectUUID = computed(() => selectionStore.selectedObject?.uuid);

// Funkció, ami kiválaszt egy objektumot, ha a listában rákattintunk
function selectObject(object: Group) {
  if (experienceStore.instance) {
    // A meglévő store akciót használjuk a kiválasztásra
    selectionStore.selectObject(object);
    // A TransformControls-t is rácsatoljuk
    experienceStore.instance.transformControls.attach(object);
    // A debug segédvonalakat is frissítjük
    experienceStore.instance.debug.selectionBoxHelper.setFromObject(object);
    experienceStore.instance.debug.selectionBoxHelper.visible = true;
  }
}
</script>

<template>
  <!-- A v-if direktíva a store alapján dönti el, hogy látható-e a panel -->
  <div 
    v-if="settingsStore.isElementListVisible"
    class="fixed bottom-4 right-4 w-72 bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg z-10 text-gray-300"
  >
    <!-- Fejléc -->
    <div class="px-4 py-2 border-b border-gray-700">
      <h3 class="font-semibold text-white">Elemlista</h3>
    </div>

    <!-- Lista konténer görgetősávval -->
    <div class="max-h-80 overflow-y-auto p-2">
      <!-- Ha nincsenek elemek -->
      <div v-if="placedObjects.length === 0" class="text-center text-gray-500 py-4 text-sm">
        Nincsenek lehelyezett bútorok.
      </div>
      
      <!-- Ha vannak elemek, ciklussal jelenítjük meg őket -->
      <ul v-else class="space-y-1">
        <li 
          v-for="obj in placedObjects" 
          :key="obj.uuid"
          @click="selectObject(obj)"
          class="px-3 py-2 rounded-md cursor-pointer transition-colors duration-150"
          :class="{
            'bg-blue-600/50 hover:bg-blue-600/70 text-white': obj.uuid === selectedObjectUUID,
            'hover:bg-gray-700/50': obj.uuid !== selectedObjectUUID
          }"
        >
          <!-- A bútor nevét a userData.config-ból olvassuk ki -->
          <span class="text-sm">{{ obj.userData.config?.name || 'Ismeretlen elem' }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>