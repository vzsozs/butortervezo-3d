<script setup lang="ts">
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useHistoryStore } from '@/stores/history';
import { usePersistenceStore } from '@/stores/persistence';
import { useModalStore } from '@/stores/modal';
import { PDFExportManager } from '@/three/PDFExportManager';

// Ikonok
import IconFrontHide from '@/assets/icons/front-hide.svg?component';
import IconFrontShow from '@/assets/icons/front-show.svg?component';
import IconList from '@/assets/icons/list.svg?component';
import IconLoad from '@/assets/icons/load.svg?component';
import IconMove from '@/assets/icons/move.svg?component';
import IconNew from '@/assets/icons/new.svg?component';
import IconPDF from '@/assets/icons/pdf_export.svg?component';
import IconRotate from '@/assets/icons/rotate.svg?component';
import IconRuler from '@/assets/icons/ruler.svg?component';
import IconSave from '@/assets/icons/save.svg?component';
import IconUndo from '@/assets/icons/undo.svg?component';
import IconTrash from '@/assets/icons/trash.svg?component';
import IconShow from '@/assets/icons/show.svg?component';
import IconHide from '@/assets/icons/hide.svg?component';
import { ref } from 'vue';

const experienceStore = useExperienceStore();
const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const persistenceStore = usePersistenceStore();
const modalStore = useModalStore();
const experience = computed(() => experienceStore.instance);

// Közös stílus osztály a gomboknak
const btnClass = "p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all duration-200 flex items-center justify-center";

function setMode(mode: 'translate' | 'rotate') {
  experience.value?.interactionManager.setTransformMode(mode);
}

const formattedPrice = computed(() => {
  const price = experienceStore.totalPrice;
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(price);
});

async function openNewSceneModal() {
  const result = await modalStore.open(
    'Új jelenet',
    'Biztosan új, üres jelenetet szeretnél kezdeni? Minden nem mentett változtatás elveszik.',
    [
      {
        label: 'Szoba megtartása, bútorok törlése',
        value: 'keep',
        class: 'bg-blue-600 hover:bg-blue-500 text-white'
      },
      {
        label: 'Teljes törlés (Szoba és beállítások is)',
        value: 'reset',
        class: 'bg-gray-700 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 border border-transparent text-gray-300'
      },
      {
        label: 'Mégse',
        value: 'cancel',
        isCancel: true,
        class: 'text-gray-500 hover:text-white'
      }
    ]
  );

  if (result === 'keep') {
    experience.value?.newScene(true);
  } else if (result === 'reset') {
    experience.value?.newScene(false);
  }
}


function toggleFrontsVisibility() {
  settingsStore.toggleFrontsVisibility();
  experience.value?.toggleFrontVisibility(settingsStore.areFrontsVisible);
}

function toggleElementList() { settingsStore.toggleElementListVisibility(); }
function toggleRuler() { settingsStore.toggleRulerMode(); }
function undoLastAction() { historyStore.undo(); }
function saveToFile() { persistenceStore.saveStateToFile(); }
function loadFromFile() { persistenceStore.loadStateFromFile(); }
function exportToPDF() {
  const exporter = new PDFExportManager();
  exporter.generateOfferPDF();
  exporter.generateOfferPDF();
}

// Ruler Controls
const isRulerVisible = ref(true);

function toggleRulerVisibilityLocal() {
  if (experience.value) {
    experience.value.interactionManager.toggleRulerVisibility();
    isRulerVisible.value = experience.value.interactionManager.isRulerVisible;
  }
}

async function clearRulers() {
  if (await modalStore.confirm('Biztosan törölni szeretnéd az összes mérést?')) {
    experience.value?.interactionManager.clearRulers();
  }
}
// Watcher to sync visibility state if changed externally? (Optional)
// But typically it only changes via UI.

</script>

<template>
  <!-- JAVÍTÁS: fixed top-6 right-6 (Jobb felső sarok) -->
  <div
    class="fixed top-6 right-6 bg-[#1e1e1e]/90 backdrop-blur-md border border-gray-700/50 rounded-full shadow-2xl px-6 py-3 flex items-center gap-4 text-gray-200 z-50 transition-all hover:bg-[#1e1e1e]">

    <!-- Fájl műveletek -->
    <div class="flex items-center gap-2">
      <button @click="openNewSceneModal" :class="btnClass" title="Új jelenet">
        <IconNew class="w-5 h-5" />
      </button>
      <button @click="saveToFile" :class="btnClass" title="Mentés">
        <IconSave class="w-5 h-5" />
      </button>
      <button @click="loadFromFile" :class="btnClass" title="Betöltés">
        <IconLoad class="w-5 h-5" />
      </button>
    </div>

    <div class="w-px h-8 bg-gray-700/50"></div>

    <!-- Szerkesztés -->
    <div class="flex items-center gap-2">
      <button @click="undoLastAction" :class="[btnClass, !historyStore.canUndo ? 'opacity-30 cursor-not-allowed' : '']"
        :disabled="!historyStore.canUndo" title="Visszavonás">
        <IconUndo class="w-5 h-5" />
      </button>
      <button @click="setMode('translate')" :class="btnClass" title="Mozgatás">
        <IconMove class="w-5 h-5" />
      </button>
      <button @click="setMode('rotate')" :class="btnClass" title="Forgatás">
        <IconRotate class="w-5 h-5" />
      </button>
    </div>

    <div class="w-px h-8 bg-gray-700/50"></div>

    <!-- Eszközök -->
    <div class="flex items-center gap-2">
      <button @click="toggleRuler"
        :class="[btnClass, settingsStore.isRulerModeActive ? 'bg-blue-600 text-white hover:bg-blue-500' : '']"
        title="Vonalzó">
        <IconRuler class="w-5 h-5" />
      </button>

      <button @click="toggleFrontsVisibility"
        :class="[btnClass, !settingsStore.areFrontsVisible ? 'bg-blue-600 text-white hover:bg-blue-500' : '']"
        title="Frontok">
        <IconFrontShow v-if="settingsStore.areFrontsVisible" class="w-5 h-5" />
        <IconFrontHide v-else class="w-5 h-5" />
      </button>

      <button @click="toggleElementList"
        :class="[btnClass, settingsStore.isElementListVisible ? 'bg-blue-600 text-white hover:bg-blue-500' : '']"
        title="Lista">
        <IconList class="w-5 h-5" />
      </button>

      <button @click="exportToPDF" :class="btnClass" class="text-red-400 hover:text-red-300 hover:bg-red-900/30"
        title="PDF Export">
        <IconPDF class="w-5 h-5" />
      </button>
    </div>

    <div class="w-px h-8 bg-gray-700/50"></div>

    <!-- Ár és Rendelés -->
    <div class="flex items-center gap-4 pl-2">
      <div class="flex flex-col items-end leading-tight">
        <span class="text-[10px] text-gray-400 uppercase tracking-wider">Összesen</span>
        <span class="text-lg font-bold text-blue-400 font-mono">{{ formattedPrice }}</span>
      </div>
      <button
        class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-full shadow-lg shadow-blue-900/20 transition-transform active:scale-95">
        Megrendelés
      </button>
    </div>
  </div>

  <!-- Ruler Controls Sub-menu (Csak akkor látszik, ha aktív a vonalzó mód) -->
  <div v-if="settingsStore.isRulerModeActive"
    class="fixed top-24 right-6 bg-[#1e1e1e]/90 backdrop-blur-md border border-gray-700/50 rounded-full shadow-2xl px-4 py-2 flex items-center gap-2 text-gray-200 z-40 transition-all hover:bg-[#1e1e1e]">
    <button @click="toggleRulerVisibilityLocal" :class="[btnClass, !isRulerVisible ? 'text-blue-400' : '']"
      :title="isRulerVisible ? 'Mérések elrejtése' : 'Mérések megjelenítése'">
      <IconShow v-if="isRulerVisible" class="w-5 h-5" />
      <IconHide v-else class="w-5 h-5" />
    </button>

    <div class="w-px h-6 bg-gray-700/50"></div>

    <button @click="clearRulers" :class="btnClass" class="text-red-400 hover:text-red-300 hover:bg-red-900/30"
      title="Összes mérés törlése">
      <IconTrash class="w-5 h-5" />
    </button>
  </div>


</template>
