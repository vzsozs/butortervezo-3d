<!-- src/components/TopMenu.vue -->
<script setup lang="ts">
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useHistoryStore } from '@/stores/history';
import { usePersistenceStore } from '@/stores/persistence';
import { PDFExportManager } from '@/three/PDFExportManager';

// Ikon importok
import IconHide from '@/assets/icons/front-hide.svg?component';
import IconShow from '@/assets/icons/front-show.svg?component';
import IconList from '@/assets/icons/list.svg?component';
import IconLoad from '@/assets/icons/load.svg?component';
import IconMove from '@/assets/icons/move.svg?component';
import IconNew from '@/assets/icons/new.svg?component';
import IconPDF from '@/assets/icons/pdf_export.svg?component';
import IconRotate from '@/assets/icons/rotate.svg?component';
import IconRuler from '@/assets/icons/ruler.svg?component';
import IconSave from '@/assets/icons/save.svg?component';
import IconUndo from '@/assets/icons/undo.svg?component';

const experienceStore = useExperienceStore();
const settingsStore = useSettingsStore(); 
const historyStore = useHistoryStore();
const persistenceStore = usePersistenceStore();
const experience = computed(() => experienceStore.instance);

function setMode(mode: 'translate' | 'rotate') {
  experience.value?.interactionManager.setTransformMode(mode);
}

const formattedPrice = computed(() => {
  const price = experienceStore.totalPrice;
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(price);
});

// === ÚJ FUNKCIÓ ===
function newScene() {
  if (confirm('Biztosan új, üres jelenetet szeretnél kezdeni? A nem mentett változások elvesznek.')) {
    experience.value?.newScene();
  }
}

function toggleFrontsVisibility() {
  // =================================================================
  // === DIAGNOSZTIKAI LOG ===========================================
  // =================================================================
  console.log('[TopMenu] toggleFrontsVisibility gomb lenyomva!');
  settingsStore.toggleFrontsVisibility(); 
}

function toggleElementList() { settingsStore.toggleElementListVisibility(); }
function toggleRuler() { settingsStore.toggleRulerMode(); }
function undoLastAction() { historyStore.undo(); }
function saveToFile() { persistenceStore.saveStateToFile(); }
function loadFromFile() { persistenceStore.loadStateFromFile(); }
function exportToPDF() {
  const exporter = new PDFExportManager();
  exporter.generateOfferPDF();
}
</script>

<template>
  <div class="fixed top-4 right-4 bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg p-2 flex items-center gap-2 text-gray-300 z-10">
    
    <button @click="newScene" class="btn-icon" title="Új jelenet">
      <IconNew class="w-6 h-6" />
    </button>
    
    <div class="w-px h-6 bg-gray-600"></div>

    <button @click="saveToFile" class="btn-icon" title="Mentés fájlba">
      <IconSave class="w-6 h-6" />
    </button>

    <button @click="loadFromFile" class="btn-icon" title="Betöltés fájlból">
      <IconLoad class="w-6 h-6" />
    </button>

    <button 
      @click="undoLastAction"
      class="btn-icon"
      :disabled="!historyStore.canUndo"
      :class="{ 'opacity-50 cursor-not-allowed': !historyStore.canUndo }"
      title="Visszavonás (Ctrl+Z)"
    >
      <IconUndo class="w-6 h-6" />
    </button>
    
    <div class="w-px h-6 bg-gray-600"></div>

    <button @click="setMode('translate')" class="btn-icon" title="Mozgatás (W)">
      <IconMove class="w-6 h-6" />
    </button>
    
    <button @click="setMode('rotate')" class="btn-icon" title="Forgatás (E)">
      <IconRotate class="w-6 h-6" />
    </button>

    <button 
      @click="toggleRuler"
      class="btn-icon"
      :class="{ 'btn-icon-active': settingsStore.isRulerModeActive }"
      title="Vonalzó mód"
    >
      <IconRuler class="w-6 h-6" />
    </button>

    <div class="w-px h-6 bg-gray-600"></div>

    <button 
      @click="toggleFrontsVisibility" 
      class="btn-icon" 
      :class="{ 'btn-icon-active': !settingsStore.areFrontsVisible }"
      title="Frontok megjelenítése/elrejtése"
    >
      <IconShow v-if="settingsStore.areFrontsVisible" class="w-6 h-6" />
      <IconHide v-else class="w-6 h-6" />
    </button>

    <button 
      @click="toggleElementList"
      class="btn-icon"
      :class="{ 'btn-icon-active': settingsStore.isElementListVisible }"
      title="Elemlista"
    >
      <IconList class="w-6 h-6" />
    </button>
    
    <div class="w-px h-6 bg-gray-600"></div>

    <button @click="exportToPDF" class="btn-icon" title="PDF Export">
      <IconPDF class="w-6 h-6" />
    </button>

    <div class="text-sm font-semibold px-2">
      Ár: <span class="text-yellow-400">{{ formattedPrice }}</span>
    </div>

    <button class="btn-primary text-sm px-4 py-1.5">
      Megrendelés
    </button>
  </div>
</template>