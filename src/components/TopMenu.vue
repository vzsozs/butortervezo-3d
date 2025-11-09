<!-- src/components/TopMenu.vue -->
<script setup lang="ts">
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const experienceStore = useExperienceStore();
const settingsStore = useSettingsStore(); 
const experience = computed(() => experienceStore.instance);

function setMode(mode: 'translate' | 'rotate') {
  // A computed property miatt .value-val érjük el a példányt
  experience.value?.interactionManager.setTransformMode(mode);
}

// Egy computed property a szép formázáshoz
const formattedPrice = computed(() => {
  const price = experienceStore.totalPrice;
  // Magyar formátum: "123 450 Ft"
  return new Intl.NumberFormat('hu-HU').format(price) + ' Ft';
});

// A FRONTOK VÁLTÁSÁHOZ
function toggleFrontsVisibility() {
  settingsStore.toggleFrontsVisibility();
}

</script>

<template>
  <div class="fixed top-4 right-4 bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg p-2 flex items-center gap-2 text-gray-300 z-10">
    
    <!-- Mentés -->
    <button class="btn-icon" title="Mentés">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    </button>

    <!-- Betöltés -->
    <button class="btn-icon" title="Betöltés">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    </button>

    <div class="w-px h-6 bg-gray-600"></div> <!-- Elválasztó -->

    <!-- Mozgatás -->
    <button @click="setMode('translate')" class="btn-icon" title="Mozgatás (W)">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3 12h18" />
      </svg>
    </button>
    
    <!-- Forgatás -->
    <button @click="setMode('rotate')" class="btn-icon" title="Forgatás (E)">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21 8.25Z" />
      </svg>
    </button>

    <!-- ÚJ GOMB: Frontok megjelenítése / elrejtése -->
    <button 
      @click="toggleFrontsVisibility" 
      class="btn-icon" 
      :class="{ 'btn-icon-active': !settingsStore.areFrontsVisible }"
      title="Frontok megjelenítése/elrejtése"
    >
      <!-- Ha a frontok láthatóak, a sima szem ikont mutatjuk -->
      <svg v-if="settingsStore.areFrontsVisible" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
      <!-- Ha a frontok el vannak rejtve, az áthúzott szem ikont mutatjuk -->
      <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L6.228 6.228" />
      </svg>
    </button>
    
    <div class="w-px h-6 bg-gray-600"></div> <!-- Elválasztó -->

    <!-- Ár kijelző -->
    <div class="text-sm font-semibold px-2">
      Ár: <span class="text-yellow-400">{{ formattedPrice }}</span>
    </div>

    <!-- Megrendelés -->
    <button class="btn-primary text-sm px-4 py-1.5">
      Megrendelés
    </button>
  </div>
</template>