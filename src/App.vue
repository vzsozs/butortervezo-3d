<script setup lang="ts">
import { RouterView } from 'vue-router'
import InspectorPanel from './components/InspectorPanel.vue'
import SidePanel from './components/SidePanel.vue' 
import TopMenu from '@/components/TopMenu.vue' 
</script>

<template>
  <div class="relative w-screen h-screen bg-gray-800">
    <!-- A 3D vászon -->
    <RouterView />
    <!-- A FELHASZNÁLÓI FELÜLET RÉTEGEI -->
    <SidePanel /> <!-- ÚJ KOMPONENS -->
    <InspectorPanel /> 
    <TopMenu />
  </div>
</template>