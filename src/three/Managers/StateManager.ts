// src/three/Managers/StateManager.ts

import { watch, toRaw } from 'vue';
import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3, Box3 } from 'three';
import Experience from '../Experience';
import { availableMaterials } from '@/config/materials';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

  // --- PUBLIKUS METÓDUSOK ---

  public async applyMaterialsToObject(targetObject: Group) {
    const componentState = targetObject.userData.componentState;
    const materialState = targetObject.userData.materialState;
    if (!componentState || !materialState) return;

    for (const slotId in componentState) {
      const componentId = componentState[slotId];
      const materialId = materialState[slotId];

      if (componentId && materialId) {
        await this.applyMaterialToSlot(targetObject, slotId, materialId);
      }
    }
  }

  public async applyMaterialToSlot(targetObject: Group, slotId: string, materialId: string) {
    const componentId = targetObject.userData.componentState?.[slotId];
    if (!componentId) return;

    const componentConfig = this.experience.configManager.getComponentById(componentId);
    const materialConfig = availableMaterials.find(m => m.id === materialId);
    if (!componentConfig?.materialTarget || !materialConfig) return;

    const materialTargetName = componentConfig.materialTarget;

    targetObject.traverse(async (object: Object3D) => {
      // Csak azokat az objektumokat vizsgáljuk, amiknek a neve pontosan a slotId
      if (object.name === slotId) {
        // Most az adott komponens-példányon (pl. egy lábon) belül keressük a cél mesht
        object.traverse(async (child: Object3D) => {
          if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.name === materialTargetName) {
            const newMaterial = child.material.clone();
            newMaterial.color.set(materialConfig.color);
            newMaterial.map = materialConfig.textureUrl
              ? await this.experience.assetManager.getTexture(materialConfig.textureUrl)
              : null;
            child.material = newMaterial;
          }
        });
      }
    });
  }

public updateFrontsVisibility(isVisible: boolean) {
    console.log(`[StateManager] updateFrontsVisibility metódus meghívva. Láthatóság: ${isVisible}`);
    const experienceStore = this.experience.experienceStore;
    for (const placedObject of experienceStore.placedObjects) {
      const frontObject = placedObject.getObjectByName('front');
      if (frontObject) {
        frontObject.visible = isVisible;
      }
    }
  }

  // --- BELSŐ MŰKÖDÉS ---

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const experienceStore = this.experience.experienceStore;
    // A settingsStore-ra itt már nincs szükség

    // --- FIGYELŐK AZ INSPECTOR PANEL ESEMÉNYEIRE ---

    watch(() => selectionStore.materialChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, materialId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      if (!targetObject) return selectionStore.acknowledgeMaterialChange();

      const newMaterialState = { ...targetObject.userData.materialState, [slotId]: materialId };
      targetObject.userData.materialState = newMaterialState;

      await this.applyMaterialToSlot(targetObject, slotId, materialId);
      this.experience.historyStore.addState();
      selectionStore.acknowledgeMaterialChange();
    });

    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, newStyleId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      if (!targetObject) return selectionStore.acknowledgeStyleChange();

      const newComponentState = { ...targetObject.userData.componentState, [slotId]: newStyleId };
      const wasSelected = selectionStore.selectedObject?.uuid === targetUUID;
      const newObject = await this.experience.rebuildObject(targetObject, newComponentState);

      if (newObject && wasSelected) {
        this.experience.selectionStore.selectObject(newObject);
        this.experience.camera.transformControls.attach(toRaw(newObject));
      }
      this.experience.historyStore.addState();
      selectionStore.acknowledgeStyleChange();
    });

    watch(() => selectionStore.propertyChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, propertyId, newValue } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      if (!targetObject) return selectionStore.acknowledgePropertyChange();

      if (!targetObject.userData.propertyState) targetObject.userData.propertyState = {};
      if (!targetObject.userData.propertyState[slotId]) targetObject.userData.propertyState[slotId] = {};
      targetObject.userData.propertyState[slotId][propertyId] = newValue;

      await this.experience.rebuildObject(targetObject, targetObject.userData.componentState);
      this.experience.historyStore.addState();
      selectionStore.acknowledgePropertyChange();
    });

    // --- FIGYELŐK A TÖRÉSRE ÉS DUPLIKÁLÁSRA ---

    watch(() => selectionStore.objectToDeleteUUID, (uuidToDelete) => {
      if (!uuidToDelete) return;
      const objectToRemove = experienceStore.getObjectByUUID(uuidToDelete);
      if (objectToRemove) {
        this.experience.removeObject(objectToRemove);
      }
      selectionStore.acknowledgeDeletion();
    });

    watch(() => selectionStore.objectToDuplicateUUID, async (uuidToDuplicate) => {
      if (!uuidToDuplicate) return;
      this.experience.debugManager.logAction('Duplikálás', { uuid: uuidToDuplicate });
      const originalObject = experienceStore.getObjectByUUID(uuidToDuplicate);
      if (!originalObject) return;

      this.experience.debugManager.logObjectState('Duplikálandó eredeti objektum állapota', originalObject);

      const newObject = await this.experience.assetManager.buildFurnitureFromConfig(
        originalObject.userData.config,
        originalObject.userData.componentState,
        originalObject.userData.propertyState
      );

      newObject.userData.materialState = JSON.parse(JSON.stringify(originalObject.userData.materialState));
      await this.applyMaterialsToObject(newObject);

      this.experience.debugManager.logObjectState('Új, duplikált objektum állapota', newObject);

      const box = new Box3().setFromObject(originalObject);
      const size = new Vector3();
      box.getSize(size);
      newObject.position.copy(originalObject.position).add(new Vector3(size.x + 0.2, 0, 0));
      newObject.rotation.copy(originalObject.rotation);
      
      this.experience.addObjectToScene(newObject);
      this.experience.interactionManager.startDraggingExistingObject(newObject);
      selectionStore.acknowledgeDuplication();
    });

    // A globális figyelők (pl. frontok láthatósága) itt már nincsenek,
    // mert a "direkt hívás" mintát használjuk a store-okból.
  }
}