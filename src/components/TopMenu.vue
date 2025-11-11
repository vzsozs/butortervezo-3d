<!-- src/components/TopMenu.vue -->
<script setup lang="ts">
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useHistoryStore } from '@/stores/history';
import { usePersistenceStore } from '@/stores/persistence';

const experienceStore = useExperienceStore();
const settingsStore = useSettingsStore(); 
const historyStore = useHistoryStore(); // <-- Új store példány
const experience = computed(() => experienceStore.instance);
const persistenceStore = usePersistenceStore();

function setMode(mode: 'translate' | 'rotate') {
  experience.value?.interactionManager.setTransformMode(mode);
}

const formattedPrice = computed(() => {
  const price = experienceStore.totalPrice;
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(price);
});

function toggleFrontsVisibility() {
  settingsStore.toggleFrontsVisibility();
}

function toggleElementList() {
  settingsStore.toggleElementListVisibility();
}

function toggleRuler() {
  settingsStore.toggleRulerMode();
}

// === UNDO ===
function undoLastAction() {
  historyStore.undo();
}

// === MENTÉS ===
function saveToFile() {
  persistenceStore.saveStateToFile();
}

function loadFromFile() {
  persistenceStore.loadStateFromFile();
}

</script>

<template>
  <div class="fixed top-4 right-4 bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg p-2 flex items-center gap-2 text-gray-300 z-10">
    
    <!-- Mentés FÁJLBA -->
    <button @click="saveToFile" class="btn-icon" title="Mentés fájlba">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    </button>

    <!-- Betöltés FÁJLBÓL -->
    <button @click="loadFromFile" class="btn-icon" title="Betöltés fájlból">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    </button>

    <!-- ================================================================= -->
    <!-- === ÚJ GOMB AZ UNDO-HOZ ========================================= -->
    <!-- ================================================================= -->
    <button 
      @click="undoLastAction"
      class="btn-icon"
      :disabled="!historyStore.canUndo"
      :class="{ 'opacity-50 cursor-not-allowed': !historyStore.canUndo }"
      title="Visszavonás (Ctrl+Z)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
      </svg>
    </button>
    <!-- ================================================================= -->

    <div class="w-px h-6 bg-gray-600"></div>

    <!-- Mozgatás -->
    <button @click="setMode('translate')" class="btn-icon" title="Mozgatás (W)">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3 12h18" /></svg>
    </button>
    
    <!-- Forgatás -->
    <button @click="setMode('rotate')" class="btn-icon" title="Forgatás (E)">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21 8.25Z" /></svg>
    </button>

    <!-- VONALZÓ -->
    <button 
      @click="toggleRuler"
      class="btn-icon"
      :class="{ 'btn-icon-active': settingsStore.isRulerModeActive }"
      title="Vonalzó mód"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>
    </button>

    <div class="w-px h-6 bg-gray-600"></div>

    <!-- Frontok megjelenítése / elrejtése -->
    <button 
      @click="toggleFrontsVisibility" 
      class="btn-icon" 
      :class="{ 'btn-icon-active': !settingsStore.areFrontsVisible }"
      title="Frontok megjelenítése/elrejtése"
    >
      <svg v-if="settingsStore.areFrontsVisible" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
      <!-- JAVÍTÁS: A 'velse' elírást 'v-else'-re cseréljük -->
      <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L6.228 6.228" />
      </svg>
    </button>

    <!-- Elemlista megjelenítése / elrejtése-->
    <button 
      @click="toggleElementList"
      class="btn-icon"
      :class="{ 'btn-icon-active': settingsStore.isElementListVisible }"
      title="Elemlista megjelenítése/elrejtése"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h.375m-.375 0a.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75ZM8.25 15.75h.375m-.375 0a.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75Zm8.25-9h.375m-.375 0a.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75Zm0 9h.375m-.375 0a.375.375 0 1 1 0-.75.375.375 0 0 1 0 .75ZM3.375 6c0-1.036.84-1.875 1.875-1.875h.375a1.875 1.875 0 0 1 0 3.75H5.25A1.875 1.875 0 0 1 3.375 6Zm0 9.75c0-1.036.84-1.875 1.875-1.875h.375a1.875 1.875 0 0 1 0 3.75H5.25A1.875 1.875 0 0 1 3.375 15.75Z" /></svg>
    </button>
    
    <div class="w-px h-6 bg-gray-600"></div>

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