<!-- src/views/AdminView.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue'; // <-- ÚJ IMPORT

const activeTab = ref('components');
</script>

<template>
  <div class="bg-gray-800 text-white min-h-screen p-4 sm:p-8 font-sans overflow-x-hidden">
    <div class="w-full max-w-7xl mx-auto">
       <h1 class="text-3xl sm:text-4xl font-bold mb-2">Admin Felület</h1>
      <p class="text-gray-400 mb-8">Itt tudod szerkeszteni a bútorok és komponensek adatbázisát.</p>

      <div class="flex border-b border-gray-700 mb-8">
        <button 
          @click="activeTab = 'components'" 
          :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
        >
          Komponens Szerkesztő
        </button>
        <button 
          @click="activeTab = 'furniture'" 
          :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
        >
          Bútor Szerkesztő
        </button>
      </div>

      <div>
        <div v-if="activeTab === 'components'">
          <ComponentEditor />
        </div>
        <div v-if="activeTab === 'furniture'">
          <FurnitureEditor /> <!-- <-- ÚJ KOMPONENS HASZNÁLATA -->
        </div>
      </div>

    </div>
  </div>
</template>