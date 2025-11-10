// src/stores/settings.ts

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  
  // --- ÁLLAPOTOK (STATE) ---

  const activeFurnitureId = ref<string | null>('also_szkreny_60');
  
  const globalMaterialSettings = ref<Record<string, string>>({
    front: 'white_laminate',
    corpus: 'white_laminate',
    leg: 'anthracite_matte',
    handle: 'anthracite_matte'
  });

  const globalStyleSettings = ref<Record<string, string>>({
    front: 'sima_front_60',
    leg: 'standard_leg',
    handle: 'standard_handle',
  });
  
  const isSnappingEnabled = ref(true);
  const areFrontsVisible = ref(true);
  const isElementListVisible = ref(false);

  // =================================================================
  // === ÚJ ÁLLAPOT A VONALZÓHOZ ======================================
  // =================================================================
  const isRulerModeActive = ref(false);
  // =================================================================

  // --- AKCIÓK (ACTIONS) ---

  function setGlobalMaterial(targetSlotId: string, materialId: string) {
    if (materialId) {
      globalMaterialSettings.value = {
        ...globalMaterialSettings.value,
        [targetSlotId]: materialId
      };
    }
  }

  function setGlobalStyle(targetSlotId: string, styleId: string) {
    if (styleId) {
      console.log(`Pinia settings store: Globális stílus frissítve. Cél slot: '${targetSlotId}', Új stílus: '${styleId}'`);
      globalStyleSettings.value = {
        ...globalStyleSettings.value,
        [targetSlotId]: styleId
      };
    }
  }

  function setActiveFurnitureId(id: string) {
    activeFurnitureId.value = id;
    console.log(`Aktív bútor beállítva: ${id}`);
  }
  
  function toggleFrontsVisibility() {
    areFrontsVisible.value = !areFrontsVisible.value;
    console.log('Frontok láthatósága:', areFrontsVisible.value);
  }

  function toggleElementListVisibility() {
    isElementListVisible.value = !isElementListVisible.value;
  }

  function toggleRulerMode() {
    isRulerModeActive.value = !isRulerModeActive.value;
    console.log('Vonalzó mód:', isRulerModeActive.value);
  }

  return { 
    // Állapotok
    activeFurnitureId, 
    globalMaterialSettings,
    globalStyleSettings, 
    isSnappingEnabled,
    areFrontsVisible,
    isElementListVisible,
    isRulerModeActive, // <-- Hozzáadva
    
    // Akciók
    setActiveFurnitureId,
    setGlobalMaterial,
    setGlobalStyle, 
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode, // <-- Hozzáadva
  }
})