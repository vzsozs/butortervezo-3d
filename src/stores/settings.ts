import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  
  // --- ÁLLAPOTOK (STATE) ---

  // Az "aktív ecset", ami a lehelyezendő bútor ID-jét tárolja
  const activeFurnitureId = ref<string | null>('also_szekreny_60');
  
  // A globális anyag-beállítások, alapértelmezett értékekkel
  const globalMaterialSettings = ref<Record<string, string>>({
    front: 'white_laminate',
    corpus: 'white_laminate',
    leg: 'anthracite_matte',
    handle: 'anthracite_matte'
  });

  // A globális stílus-beállítások, alapértelmezett értékekkel
  const globalStyleSettings = ref<Record<string, string>>({
    front: 'sima_front_60',
    leg: 'standard_leg',
    handle: 'standard_handle',
  });
  
  const isSnappingEnabled = ref(true);
  const areFrontsVisible = ref(true);

  // --- AKCIÓK (ACTIONS) ---

  function setGlobalMaterial(targetSlotId: string, materialId: string) {
    if (materialId) {
      globalMaterialSettings.value[targetSlotId] = materialId;
    }
  }

  function setGlobalStyle(targetSlotId: string, styleId: string) {
    if (styleId) {
      console.log(`Pinia settings store: Globális stílus frissítve. Cél slot: '${targetSlotId}', Új stílus: '${styleId}'`);
      globalStyleSettings.value[targetSlotId] = styleId;
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

  return { 
    // Állapotok
    activeFurnitureId, 
    globalMaterialSettings,
    globalStyleSettings, 
    isSnappingEnabled,
    areFrontsVisible,
    
    // Akciók
    setActiveFurnitureId,
    setGlobalMaterial,
    setGlobalStyle, 
    toggleFrontsVisibility,
  }
})