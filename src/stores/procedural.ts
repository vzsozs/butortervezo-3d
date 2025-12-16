import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useProceduralStore = defineStore('procedural', () => {
  // --- STATE ---

  // Munkapult beállítások
  const worktop = ref({
    thickness: 0.03, // Vastagság (m)
    elevation: 0.87, // Alap magasság (ha nincs bútor)
    defaultDepth: 0.6, // Mélység
    sideOverhang: 0.015, // Oldalsó túllógás
    frontOverhang: 0.0, // Elülső túllógás (opcionális, most 0)
    gapThreshold: 0.2, // Híd generálási küszöb
    materialId: 'default_worktop_grey', // Ide jön majd a kiválasztott anyag ID-ja
  })

  // Lábazat beállítások
  const plinth = ref({
    height: 0.1, // Magasság
    depthOffset: 0.05, // Mennyivel van beljebb
    defaultMaterialId: 'plinth_dark_grey', // Fallback anyag
  })

  // 🔥 EZ A KULCS A POLCOKHOZ!
  // Ezt figyeli a ProceduralManager, és ezt növeli az Inspector csúszka.
  const updateTrigger = ref(0)

  // --- ACTIONS ---

  function triggerUpdate() {
    updateTrigger.value++
  }

  // --- BETÖLTŐ FÜGGVÉNY ---
  async function loadSettings() {
    try {
      const response = await fetch('/database/procedural.json')

      if (!response.ok) {
        console.warn('Nem található procedural.json, alapértelmezett beállítások maradnak.')
        return
      }

      const data = await response.json()

      // Értékek felülírása (Object.assign, hogy a reaktivitás megmaradjon)
      if (data.worktop) Object.assign(worktop.value, data.worktop)
      if (data.plinth) Object.assign(plinth.value, data.plinth)

      console.log('✅ Procedurális beállítások betöltve!')
    } catch (error) {
      console.error('Hiba a procedural.json betöltésekor:', error)
    }
  }

  // Beállítások frissítése (pl. Admin felületről)
  function updateWorktopSetting(key: keyof typeof worktop.value, value: any) {
    ;(worktop.value as any)[key] = value
  }

  function updatePlinthSetting(key: keyof typeof plinth.value, value: any) {
    ;(plinth.value as any)[key] = value
  }

  return {
    worktop,
    plinth,
    updateTrigger, // Exportálva
    triggerUpdate, // Exportálva
    updateWorktopSetting,
    updatePlinthSetting,
    loadSettings,
  }
})
