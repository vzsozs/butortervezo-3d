<!-- src/App.vue -->
<script setup lang="ts">
// --- MEGLÉVŐ IMPORT-OK ---
import { RouterView, useRoute } from 'vue-router'
import { computed, onMounted } from 'vue' // <-- onMounted hozzáadva
import InspectorPanel from './components/InspectorPanel.vue'
import SidePanel from './components/SidePanel.vue'
import TopMenu from '@/components/TopMenu.vue'
import ElementListPanel from '@/components/ElementListPanel.vue'

// --- ÚJ IMPORT ---
import { useConfigStore } from '@/stores/config'; // <-- A Pinia store importálása

// --- MEGLÉVŐ LOGIKA ---
const route = useRoute();

const isDesignerUIVisible = computed(() => {
  return !route.meta.hideDesignerUI;
});

// --- ÚJ LOGIKA ---
// Amikor az alkalmazás betöltődik (a komponens csatolva van),
// elindítjuk az adatok letöltését a központi store-ba.
onMounted(() => {
  const configStore = useConfigStore();
  configStore.loadAllData();
});
</script>

<template>
  <div class="relative w-full h-screen bg-gray-800">
    <!-- A 3D vászon vagy az admin felület -->
    <RouterView />
    
    <!-- FELHASZNÁLÓI FELÜLET RÉTEGEI - FELTÉTELES MEGJELENÍTÉSSEL -->
    <template v-if="isDesignerUIVisible">
      <SidePanel />
      <InspectorPanel /> 
      <TopMenu />
      <ElementListPanel />
    </template>
  </div>
</template>