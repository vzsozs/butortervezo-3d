<script setup lang="ts">
import { RouterView } from 'vue-router'
// ÚJ: Importáljuk a panel komponenst
import InspectorPanel from './components/InspectorPanel.vue'
</script>

<template>
  <div class="relative w-screen h-screen bg-gray-800">
    <!-- A 3D vászon -->
    <RouterView />

    <!-- JAVÍTÁS: A teszt panel helyett most az igazi komponenst használjuk -->
    <InspectorPanel />
  </div>
</template>