// src/stores/settings.ts

import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import { useExperienceStore } from './experience';
import type { Group } from 'three';

export const useSettingsStore = defineStore('settings', () => {
  const experienceStore = useExperienceStore();

  // --- ALAPÉRTELMEZETT ÉRTÉKEK ---
  const defaultGlobalMaterials = {
    front: 'white_laminate', corpus: 'white_laminate', leg: 'anthracite_matte', handle: 'anthracite_matte'
  };
  const defaultGlobalStyles = {
    front: 'front_bottom_sima_60', leg: 'leg_standard', handle: 'handle_standard'
  };

  // --- ÁLLAPOT (STATE) ---
  const globalMaterialSettings = ref<Record<string, string>>({ ...defaultGlobalMaterials });
  const globalStyleSettings = ref<Record<string, string>>({ ...defaultGlobalStyles });
  const activeFurnitureId = ref<string | null>('also_szekreny_60');
  const areFrontsVisible = ref(true);
  const isSnappingEnabled = ref(true);
  const isElementListVisible = ref(false);
  const isRulerModeActive = ref(false);

  // --- AKCIÓK (ACTIONS) ---

  /**
   * A legördülő menü hívja meg. Csak akkor fut le, ha az érték változik.
   */
  async function setGlobalStyle(targetSlotId: string, newStyleId: string) {
    if (!newStyleId || globalStyleSettings.value[targetSlotId] === newStyleId) {
      return; // Ne csináljunk semmit, ha nincs változás
    }
    // Frissítjük a globális állapotot
    globalStyleSettings.value[targetSlotId] = newStyleId;
    // Meghívjuk a "force" logikát, ami elvégzi a piszkos munkát
    await forceGlobalStyle(targetSlotId);
  }

  /**
   * A legördülő menü hívja meg. Csak akkor fut le, ha az érték változik.
   */
  async function setGlobalMaterial(targetSlotId: string, newMaterialId: string) {
    if (!newMaterialId || globalMaterialSettings.value[targetSlotId] === newMaterialId) {
      return;
    }
    globalMaterialSettings.value[targetSlotId] = newMaterialId;
    await forceGlobalMaterial(targetSlotId);
  }

  /**
   * A "Frissítés" gomb hívja meg. Feltétel nélkül rákényszeríti az aktuális globális stílust minden bútorra.
   */
  async function forceGlobalStyle(targetSlotId: string) {
    const experience = experienceStore.instance;
    if (!experience) return;

    const styleToApply = globalStyleSettings.value[targetSlotId];
    if (!styleToApply) return;

    const objectsToProcess = [...toRaw(experienceStore.placedObjects)];
    if (objectsToProcess.length === 0) return;

    const rebuildPromises: Promise<Group | null>[] = [];
    const selectedObjectId = experience.selectionStore.selectedObject?.uuid;

    for (const obj of objectsToProcess) {
      const newComponentState = { ...obj.userData.componentState, [targetSlotId]: styleToApply };
      const originalProxy = experienceStore.getObjectByUUID(obj.uuid);
      if (originalProxy) {
        rebuildPromises.push(experience.rebuildObject(originalProxy, newComponentState));
      }
    }
    
    const newObjects = await Promise.all(rebuildPromises);

    // Kiválasztás frissítése, ha az érintett volt
    if (selectedObjectId) {
      const originalIndex = objectsToProcess.findIndex(o => o.uuid === selectedObjectId);
      if (originalIndex !== -1 && newObjects[originalIndex]) {
        const newSelectedObject = newObjects[originalIndex];
        experience.selectionStore.selectObject(newSelectedObject);
        experience.camera.transformControls.attach(toRaw(newSelectedObject));
      }
    }
    experience.historyStore.addState();
  }

  /**
   * A "Frissítés" gomb hívja meg. Feltétel nélkül rákényszeríti az aktuális globális anyagot minden bútorra.
   */
  async function forceGlobalMaterial(targetSlotId: string) {
    const experience = experienceStore.instance;
    if (!experience) return;

    const materialToApply = globalMaterialSettings.value[targetSlotId];
    if (!materialToApply) return;

    const objectsToProcess = [...toRaw(experienceStore.placedObjects)];
    if (objectsToProcess.length === 0) return;
    
    let changed = false;
    for (const obj of objectsToProcess) {
      const originalProxy = experienceStore.getObjectByUUID(obj.uuid);
      if (originalProxy) {
        originalProxy.userData.materialState[targetSlotId] = materialToApply;
        await experience.stateManager.applyMaterialToSlot(originalProxy, targetSlotId, materialToApply);
        changed = true;
      }
    }

    if (changed) {
      experience.historyStore.addState();
    }
  }

  // --- EGYÉB AKCIÓK ---

  function resetToDefaults() {
    globalMaterialSettings.value = { ...defaultGlobalMaterials };
    globalStyleSettings.value = { ...defaultGlobalStyles };
    areFrontsVisible.value = true;
    isElementListVisible.value = false;
    isRulerModeActive.value = false;
  }

  function setActiveFurnitureId(id: string | null) {
    activeFurnitureId.value = id;
  }
  
  function toggleFrontsVisibility() {
    areFrontsVisible.value = !areFrontsVisible.value;
    console.log(`[Settings Store] Az areFrontsVisible új értéke: ${areFrontsVisible.value}`);

    const experience = experienceStore.instance;
    if (experience) {
      experience.stateManager.updateFrontsVisibility(areFrontsVisible.value);
    }
  }

  function toggleElementListVisibility() {
    isElementListVisible.value = !isElementListVisible.value;
  }

  function toggleRulerMode() {
    isRulerModeActive.value = !isRulerModeActive.value;
  }

  return { 
    // State
    globalMaterialSettings, globalStyleSettings, activeFurnitureId, areFrontsVisible, isSnappingEnabled, isElementListVisible, isRulerModeActive,
    // Actions
    setGlobalMaterial, setGlobalStyle, forceGlobalMaterial, forceGlobalStyle,
    setActiveFurnitureId, toggleFrontsVisibility, toggleElementListVisibility, toggleRulerMode, resetToDefaults,
  }
});