// src/stores/settings.ts

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useExperienceStore } from './experience';

export const useSettingsStore = defineStore('settings', () => {
  const experienceStore = useExperienceStore();

  const defaultGlobalMaterials = {
    front: 'white_laminate', corpus: 'white_laminate', leg: 'anthracite_matte', handle: 'anthracite_matte'
  };
  const defaultGlobalStyles = {
    front: 'sima_front_60', leg: 'standard_leg', handle: 'standard_handle'
  };

  // --- ÁLLAPOTOK (STATE) ---
  const activeFurnitureId = ref<string | null>('also_szekreny_60');
  
  const globalMaterialSettings = ref<Record<string, string>>({ ...defaultGlobalMaterials });

  const globalStyleSettings = ref<Record<string, string>>({ ...defaultGlobalStyles });
  
  const isSnappingEnabled = ref(true);
  const areFrontsVisible = ref(true);
  const isElementListVisible = ref(false);
  const isRulerModeActive = ref(false);

  // --- AKCIÓK (ACTIONS) ---

  function setGlobalMaterial(targetSlotId: string, materialId: string) {
    if (!materialId) return;
    const currentValue = globalMaterialSettings.value[targetSlotId];
    console.log(`[Settings Store] setGlobalMaterial hívás. Cél: ${targetSlotId}, Új: ${materialId}, Jelenlegi: ${currentValue}`);

    if (currentValue === materialId) {
      console.log(`[Settings Store] Érték azonos, KÉNYSZERÍTÉS indul...`);
      experienceStore.instance?.stateManager.forceGlobalMaterial(targetSlotId, materialId);
    } else {
      console.log(`[Settings Store] Érték különböző, WATCH-ra bízva...`);
      globalMaterialSettings.value = {
        ...globalMaterialSettings.value,
        [targetSlotId]: materialId
      };
    }
  }

  // === ÚJ AKCIÓ ===
   function resetToDefaults() {
    globalMaterialSettings.value = { ...defaultGlobalMaterials };
    globalStyleSettings.value = { ...defaultGlobalStyles };
    areFrontsVisible.value = true;
    isElementListVisible.value = false;
    isRulerModeActive.value = false;
  }

  function setGlobalStyle(targetSlotId: string, styleId: string) {
    if (!styleId) return;
    const currentValue = globalStyleSettings.value[targetSlotId];
    console.log(`[Settings Store] setGlobalStyle hívás. Cél: ${targetSlotId}, Új: ${styleId}, Jelenlegi: ${currentValue}`);

    if (currentValue === styleId) {
      console.log(`[Settings Store] Érték azonos, KÉNYSZERÍTÉS indul...`);
      experienceStore.instance?.stateManager.forceGlobalStyle(targetSlotId, styleId);
    } else {
      console.log(`[Settings Store] Érték különböző, WATCH-ra bízva...`);
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

  // --- VISSZATÉRÉSI ÉRTÉKEK ---
  return { 
    // Állapotok
    activeFurnitureId, 
    globalMaterialSettings,
    globalStyleSettings, 
    isSnappingEnabled,
    areFrontsVisible,
    isElementListVisible,
    isRulerModeActive,
    
    // Akciók
    setActiveFurnitureId,
    setGlobalMaterial,
    setGlobalStyle, 
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode,
    resetToDefaults,
  }
})