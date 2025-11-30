import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useExperienceStore } from './experience'

export const useSettingsStore = defineStore('settings', () => {
  const experienceStore = useExperienceStore()

  // --- ÁLLAPOT (STATE) ---
  const globalMaterialSettings = ref<Record<string, string>>({})
  const globalComponentSettings = ref<Record<string, string>>({})

  const activeFurnitureId = ref<string | null>('also_szekreny_60')
  const areFrontsVisible = ref(true)
  const isSnappingEnabled = ref(true)
  const isElementListVisible = ref(false)
  const isRulerModeActive = ref(false)

  // --- AKCIÓK (ACTIONS) ---

  /**
   * Globális ANYAG beállítása
   */
  async function setGlobalMaterial(groupId: string, newMaterialId: string) {
    if (!newMaterialId || globalMaterialSettings.value[groupId] === newMaterialId) {
      return
    }
    globalMaterialSettings.value[groupId] = newMaterialId

    // JAVÍTÁS: Átadjuk a groupId-t is, hogy tudjuk, mit kell frissíteni
    await forceGlobalUpdate(groupId)
  }

  /**
   * Globális STÍLUS (Komponens) beállítása
   */
  async function setGlobalComponentStyle(groupId: string, variantId: string) {
    if (!variantId || globalComponentSettings.value[groupId] === variantId) {
      return
    }
    globalComponentSettings.value[groupId] = variantId

    // JAVÍTÁS: Meghívjuk a 3D frissítést
    const experience = experienceStore.instance
    if (experience) {
      console.log(`[SettingsStore] Stílus váltás indítása: ${groupId} -> ${variantId}`)
      await experience.updateGlobalComponents(groupId, variantId)
    }
  }

  /**
   * Kényszerített frissítés (Anyagok)
   */
  async function forceGlobalUpdate(groupId?: string) {
    const experience = experienceStore.instance
    if (!experience) return
    // JAVÍTÁS: Átadjuk a groupId-t, ha van
    await experience.updateGlobalMaterials(groupId)
  }

  // --- EGYÉB AKCIÓK ---

  function resetToDefaults() {
    globalMaterialSettings.value = {}
    globalComponentSettings.value = {}
    areFrontsVisible.value = true
    isElementListVisible.value = false
    isRulerModeActive.value = false
  }

  function setActiveFurnitureId(id: string | null) {
    activeFurnitureId.value = id
  }

  function toggleFrontsVisibility() {
    areFrontsVisible.value = !areFrontsVisible.value
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
    globalMaterialSettings,
    globalComponentSettings,
    activeFurnitureId,
    areFrontsVisible,
    isSnappingEnabled,
    isElementListVisible,
    isRulerModeActive,
    setGlobalMaterial,
    setGlobalComponentStyle,
    forceGlobalUpdate,
    setActiveFurnitureId,
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode,
    resetToDefaults,
  }
})
