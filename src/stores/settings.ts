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
  const defaultGlobalStyles = {
    fronts: 'front_bottom_sima_60',
    legs: 'leg_standard',
    handles: 'handle_standard',
  }

  // --- ÁLLAPOT (STATE) ---
  const globalMaterialSettings = ref<Record<string, string>>({ ...defaultGlobalMaterials })
  const globalStyleSettings = ref<Record<string, string>>({ ...defaultGlobalStyles })
  const activeFurnitureId = ref<string | null>('also_szekreny_60')
  const areFrontsVisible = ref(true)
  const isSnappingEnabled = ref(true)
  const isElementListVisible = ref(false)
  const isRulerModeActive = ref(false)

  // --- AKCIÓK (ACTIONS) ---

  /**
   * A legördülő menü hívja meg. Csak akkor fut le, ha az érték változik.
   */
  async function setGlobalStyle(targetSlotId: string, newStyleId: string) {
    if (!newStyleId || globalStyleSettings.value[targetSlotId] === newStyleId) {
      return // Ne csináljunk semmit, ha nincs változás
    }
    // Frissítjük a globális állapotot
    globalStyleSettings.value[targetSlotId] = newStyleId
    // Meghívjuk a "force" logikát, ami elvégzi a piszkos munkát
    await forceGlobalStyle(targetSlotId)
  }

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
   * A "Frissítés" gomb hívja meg. Feltétel nélkül rákényszeríti az aktuális globális stílust minden bútorra.
   */
  async function forceGlobalStyle(_targetSlotId: string) {
    const experience = experienceStore.instance
    if (!experience) return

    // NUKLEÁRIS MEGOLDÁS:
    // Ahelyett, hogy egyesével építenénk újra (ami race condition-höz vezethet),
    // meghívjuk a központi, zárolt updateGlobalStyles metódust.
    await experience.updateGlobalStyles()
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
    globalStyleSettings.value = { ...defaultGlobalStyles }
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
    globalStyleSettings,
    activeFurnitureId,
    areFrontsVisible,
    isSnappingEnabled,
    isElementListVisible,
    isRulerModeActive,
    // Actions
    setGlobalMaterial,
    setGlobalStyle,
    forceGlobalMaterial,
    forceGlobalStyle,
    setActiveFurnitureId,
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode,
    resetToDefaults,
  }
})
