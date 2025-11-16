<!-- src/App.vue -->
<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router' // <-- 1. useRoute importálása
import { computed } from 'vue' // <-- 2. computed importálása
import InspectorPanel from './components/InspectorPanel.vue'
import SidePanel from './components/SidePanel.vue' 
import TopMenu from '@/components/TopMenu.vue' 
import ElementListPanel from '@/components/ElementListPanel.vue'

// 3. Hozzunk létre egy reaktív hivatkozást az aktuális útvonalra
const route = useRoute();

// 4. Hozzunk létre egy computed property-t, ami megmondja, hogy a fő tervező UI-t kell-e mutatni
const isDesignerUIVisible = computed(() => {
  // A meta property-t a router beállításainál fogjuk használni, ez a legtisztább megoldás.
  // Ha egy útvonalnak van 'hideDesignerUI' meta flag-je, akkor nem mutatjuk a paneleket.
  return !route.meta.hideDesignerUI;
});
</script>

<template>
  <div class="relative w-full h-screen bg-gray-800">
    <!-- A 3D vászon vagy az admin felület -->
    <RouterView />
    
    <!-- 5. A FELHASZNÁLÓI FELÜLET RÉTEGEI - FELTÉTELES MEGJELENÍTÉSSEL -->
    <template v-if="isDesignerUIVisible">
      <SidePanel />
      <InspectorPanel /> 
      <TopMenu />
      <ElementListPanel />
    </template>
  </div>
</template>