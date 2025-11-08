import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  
  const globalMaterialSettings = ref<Record<string, string>>({
    front: 'white_laminate',
    korpusz: 'white_laminate',
    munkalap: 'white_laminate',
    fem_kiegeszitok: 'anthracite_matte',
  })

  // ÚJ: Globális stílus-beállítások tárolása
  const globalStyleSettings = ref<Record<string, string>>({
    front: 'sima', // Alapértelmezett front stílus
    lab: 'standard_lab', // Alapértelmezett láb stílus
    fogantyu: 'standard_fogantyu', // Alapértelmezett fogantyú stílus
  })
  
  // Az "aktív ecset", ami a lehelyezendő bútor ID-jét tárolja
  const activeFurnitureId = ref<string | null>('also_szekreny_60');

  function setGlobalMaterial(settingId: string, materialId: string) {
    if (materialId) {
      globalMaterialSettings.value[settingId] = materialId
    }
  }

  // Akció a globális stílus frissítéséhez
  function setGlobalStyle(settingId: string, styleId: string) {
    if (styleId) {
      console.log(`Pinia settings store: Globális stílus frissítve. Beállítás: '${settingId}', Új stílus: '${styleId}'`)
      globalStyleSettings.value[settingId] = styleId
    }
  }

  // Akció az aktív bútor beállításához
  function setActiveFurniture(furnitureId: string) {
    activeFurnitureId.value = furnitureId;
    console.log(`Aktív bútor beállítva: ${furnitureId}`);
  }
  
  const isSnappingEnabled = ref(true)

  // Alapértelmezetten a frontok láthatóak.
  const areFrontsVisible = ref(true);

  function toggleFrontsVisibility() {
    areFrontsVisible.value = !areFrontsVisible.value;
    console.log('Frontok láthatósága:', areFrontsVisible.value);
  }

  return { 
    globalMaterialSettings, 
    globalStyleSettings, 
    activeFurnitureId, 
    setGlobalMaterial,
    setGlobalStyle, 
    setActiveFurniture,
    isSnappingEnabled,
    areFrontsVisible,
    toggleFrontsVisibility
  }
})