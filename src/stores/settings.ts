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

  function setGlobalMaterial(settingId: string, materialId: string) {
    if (materialId) {
      globalMaterialSettings.value[settingId] = materialId
    }
  }

  // ÚJ: Akció a globális stílus frissítéséhez
  function setGlobalStyle(settingId: string, styleId: string) {
    if (styleId) {
      console.log(`Pinia settings store: Globális stílus frissítve. Beállítás: '${settingId}', Új stílus: '${styleId}'`)
      globalStyleSettings.value[settingId] = styleId
    }
  }

  return { 
    globalMaterialSettings, 
    globalStyleSettings, // Visszaadjuk az új állapotot
    setGlobalMaterial,
    setGlobalStyle, // Visszaadjuk az új akciót
  }
})