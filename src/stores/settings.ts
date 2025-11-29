import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useExperienceStore } from './experience'

export const useSettingsStore = defineStore('settings', () => {
  const experienceStore = useExperienceStore()

  // --- ÁLLAPOT (STATE) ---

  // 1. Globális Anyagok (groupId -> materialId)
  // Pl. { "fronts": "mat_white_gloss", "corpuses": "mat_oak" }
  const globalMaterialSettings = ref<Record<string, string>>({})

  // 2. Globális Stílusok / Komponensek (groupId -> componentId)
  // Pl. { "fronts": "front_keretes", "legs": "leg_modern" }
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

    // Azonnali frissítés a 3D térben
    await forceGlobalUpdate()
  }

  /**
   * Globális STÍLUS (Komponens) beállítása
   */
  async function setGlobalComponentStyle(groupId: string, newComponentId: string) {
    if (!newComponentId || globalComponentSettings.value[groupId] === newComponentId) {
      return
    }
    globalComponentSettings.value[groupId] = newComponentId

    // Itt később majd a 3D modell cserét kell meghívni
    // Egyelőre logoljuk, hogy lássuk működik-e
    console.log(`[SettingsStore] Stílus váltás: ${groupId} -> ${newComponentId}`)

    // TODO: Implementálni a 3D cserét az Experience-ben
    // await experienceStore.instance?.updateGlobalComponents(groupId, newComponentId);
  }

  /**
   * Kényszerített frissítés (Anyagok)
   */
  async function forceGlobalUpdate() {
    const experience = experienceStore.instance
    if (!experience) return
    await experience.updateGlobalMaterials()
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
    // State
    globalMaterialSettings,
    globalComponentSettings, // ÚJ
    activeFurnitureId,
    areFrontsVisible,
    isSnappingEnabled,
    isElementListVisible,
    isRulerModeActive,
    // Actions
    setGlobalMaterial,
    setGlobalComponentStyle, // ÚJ
    forceGlobalUpdate,
    setActiveFurnitureId,
    toggleFrontsVisibility,
    toggleElementListVisibility,
    toggleRulerMode,
    resetToDefaults,
  }
})
