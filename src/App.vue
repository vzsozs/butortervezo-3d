<!-- src/App.vue -->
<script setup lang="ts">
import { RouterView } from 'vue-router'
import InspectorPanel from './components/InspectorPanel.vue'
import SidePanel from './components/SidePanel.vue' 
import TopMenu from '@/components/TopMenu.vue' 
import ElementListPanel from '@/components/ElementListPanel.vue' // <-- 1. IMPORT
</script>

<template>
  <div class="relative w-screen h-screen bg-gray-800">
    <!-- A 3D vászon -->
    <RouterView />
    
    <!-- A FELHASZNÁLÓI FELÜLET RÉTEGEI -->
    <SidePanel />
    <InspectorPanel /> 
    <TopMenu />
    <ElementListPanel /> <!-- <-- 2. BEILLESZTÉS -->
  </div>
</template>