// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed, shallowRef } from 'vue' // shallowRef fontos!
import type { FurnitureConfig } from '@/config/furniture'
import { useExperienceStore } from './experience'; 
import Experience from '@/three/Experience'; // <<< EZT NE FELEJTSD KI!

export const useSelectionStore = defineStore('selection', () => {
  const experienceStore = useExperienceStore();
  
  // TELJESÍTMÉNY JAVÍTÁS: shallowRef a Three.js objektumhoz
  const selectedObject = shallowRef<Group | null>(null)
  
  const objectToDeleteUUID = ref<string | null>(null)
  const objectToDuplicateUUID = ref<string | null>(null)

  const materialChangeRequest = ref<{
    targetUUID: string;
    slotId: string; 
    materialId: string;
  } | null>(null)

  const styleChangeRequest = ref<{
    targetUUID: string;
    slotId: string;
    newStyleId: string;
  } | null>(null)

  const propertyChangeRequest = ref<{
    targetUUID: string;
    slotId: string;
    propertyId: string;
    newValue: string | boolean | number;
  } | null>(null)

  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig;
    }
    return null;
  })

  function selectObject(object: Group | null) {
    if (experienceStore.instance) {
        experienceStore.instance.debugManager.logSeparator('KIVÁLASZTÁS');
        if (object) {
            experienceStore.instance.debugManager.logObjectState('Objektum kiválasztva', object);
        } else {
            console.log('Kiválasztás törölve.');
        }
    }
    selectedObject.value = object;
  }

  function clearSelection() {
    selectedObject.value = null
  }

  function deleteSelectedObject() {
    if (selectedObject.value) {
      objectToDeleteUUID.value = selectedObject.value.uuid
      clearSelection()
    }
  }

  function acknowledgeDeletion() {
    objectToDeleteUUID.value = null
  }

  function duplicateSelectedObject() {
    if (selectedObject.value) {
      objectToDuplicateUUID.value = selectedObject.value.uuid;
    }
  }

  function acknowledgeDuplication() {
    objectToDuplicateUUID.value = null;
  }

  function changeMaterial(slotId: string, materialId: string) {
    if (selectedObject.value) {
      materialChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        materialId,
      }
    }
  }

  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  function changeStyle(slotId: string, newStyleId: string) {
    if (selectedObject.value) {
      styleChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        newStyleId,
      }
    }
  }

  function acknowledgeStyleChange() {
    styleChangeRequest.value = null
  }

  function changeProperty(slotId: string, propertyId: string, newValue: string | boolean | number) {
    if (selectedObject.value) {
      propertyChangeRequest.value = {
        targetUUID: selectedObject.value.uuid,
        slotId,
        propertyId,
        newValue,
      }
    }
  }

  function acknowledgePropertyChange() {
    propertyChangeRequest.value = null
  }

  // --- A JAVÍTOTT FÜGGVÉNY ---
  async function applySchema(groupIndex: number, schemaId: string) {
    // Mivel Setup Store-ban vagyunk, a .value-t kell használni!
    if (!selectedObject.value || !selectedObjectConfig.value) return;

    const group = selectedObjectConfig.value.slotGroups?.[groupIndex];
    if (!group) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = group.schemas.find((s: any) => s.id === schemaId);
    if (!schema) return;

    console.log(`[SelectionStore] Séma alkalmazása: ${schema.name}`);

    const currentComponentState = JSON.parse(JSON.stringify(selectedObject.value.userData.componentState || {}));
    
    Object.entries(schema.apply).forEach(([slotId, componentId]) => {
      if (componentId) {
        currentComponentState[slotId] = componentId;
      } else {
        delete currentComponentState[slotId];
      }
    });

    const experience = Experience.getInstance();
    
    // --- 1. LÉPÉS: LECSATOLJUK A GIZMO-T (FONTOS!) ---
    const controls = experience.camera.transformControls;
    controls.detach();

    const oldPosition = selectedObject.value.position.clone();
    const oldRotation = selectedObject.value.rotation.clone();
    const oldMaterialState = JSON.parse(JSON.stringify(selectedObject.value.userData.materialState || {}));
    const parent = selectedObject.value.parent;

    const newObject = await experience.assetManager.buildFurnitureFromConfig(
      selectedObjectConfig.value,
      currentComponentState
    );

    if (newObject && parent) {
      newObject.position.copy(oldPosition);
      newObject.rotation.copy(oldRotation);
      newObject.userData.materialState = oldMaterialState;

      await experience.stateManager.applyMaterialsToObject(newObject);

      parent.remove(selectedObject.value);
      parent.add(newObject);

      // --- 2. LÉPÉS: ÚJRAKIJELÖLÉS ÉS VISSZACSATOLÁS ---
      selectObject(newObject);
      
      controls.attach(newObject);
      
      experience.historyStore.addState();
    }
  }

  return { 
    selectedObject, 
    selectedObjectConfig,
    objectToDeleteUUID, 
    materialChangeRequest,
    styleChangeRequest,
    objectToDuplicateUUID,
    propertyChangeRequest,
    duplicateSelectedObject,
    acknowledgeDuplication,
    selectObject, 
    clearSelection, 
    deleteSelectedObject, 
    acknowledgeDeletion,
    changeMaterial,
    acknowledgeMaterialChange,
    changeStyle,
    acknowledgeStyleChange,
    changeProperty,
    acknowledgePropertyChange,
    applySchema 
  }
})