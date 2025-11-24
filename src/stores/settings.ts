import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useExperienceStore } from './experience'

export const useSettingsStore = defineStore('settings', () => {
  const experienceStore = useExperienceStore()

  // --- ALAPÉRTELMEZETT ÉRTÉKEK ---
  // Alapértelmezett anyagok (üresen hagyjuk, vagy null-t használunk, ha a rendszer engedi)
  const defaultGlobalMaterials = {
    fronts: '',
    corpuses: '',
    legs: '',
    handles: '',
  }
  // --- ÁLLAPOT (STATE) ---
  const globalMaterialSettings = ref<Record<string, string>>({ ...defaultGlobalMaterials })
  const activeFurnitureId = ref<string | null>('also_szekreny_60')
  const areFrontsVisible = ref(true)
  const isSnappingEnabled = ref(true)
  const isElementListVisible = ref(false)
  const isRulerModeActive = ref(false)

  // --- AKCIÓK (ACTIONS) ---

  /**
   * A legördülő menü hívja meg. Csak akkor fut le, ha az érték változik.
   */
  async function setGlobalMaterial(targetSlotId: string, newMaterialId: string) {
    if (!newMaterialId || globalMaterialSettings.value[targetSlotId] === newMaterialId) {
      return
    }
    globalMaterialSettings.value[targetSlotId] = newMaterialId
    await forceGlobalMaterial(targetSlotId)
  }

  /**
   * A "Frissítés" gomb hívja meg. Feltétel nélkül rákényszeríti az aktuális globális anyagot minden bútorra.
   */
  async function forceGlobalMaterial(_targetSlotId: string) {
    const experience = experienceStore.instance
    if (!experience) return

    // NUKLEÁRIS MEGOLDÁS:
    // Ahelyett, hogy egyesével próbálnánk frissíteni (ami hibás volt a slot ID mapping miatt),
    // meghívjuk a központi updateGlobalMaterials metódust, ami helyesen kezeli a mappinget.
    await experience.updateGlobalMaterials()
  }

  // --- EGYÉB AKCIÓK ---

  function resetToDefaults() {
    globalMaterialSettings.value = { ...defaultGlobalMaterials }
    areFrontsVisible.value = true
    isElementListVisible.value = false
    isRulerModeActive.value = false
  }

  function setActiveFurnitureId(id: string | null) {
    activeFurnitureId.value = id
  }

  function toggleFrontsVisibility() {
    areFrontsVisible.value = !areFrontsVisible.value
    console.log(`[Settings Store] Az areFrontsVisible új értéke: ${areFrontsVisible.value}`)

    const experience = experienceStore.instance
    if (experience) {
      experience.stateManager.updateFrontsVisibility(areFrontsVisible.value)
    }
  }

  function toggleElementListVisibility() {
    isElementListVisible.value = !isElementListVisible.value
  }

  function toggleRulerMode() {
    isRulerModeActive.value = !isRulerModeActive.value
  }

  return {
    // State
    globalMaterialSettings,
    activeFurnitureId,
    areFrontsVisible,
    isSnappingEnabled,
    isElementListVisible,
    isRulerModeActive,
    // Actions
    setGlobalMaterial,
    forceGlobalMaterial,
    setActiveFurnitureId,
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode,
    resetToDefaults,
  }
})
