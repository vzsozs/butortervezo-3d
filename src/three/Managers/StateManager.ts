// src/three/Managers/StateManager.ts

import { watch } from 'vue';
// JAVÍTÁS: A Box3 importálása a 'three' csomagból
import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3, Box3 } from 'three';
import Experience from '../Experience';
import { availableMaterials } from '@/config/materials';
// JAVÍTÁS: A felesleges ComponentConfig import eltávolítva

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

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

  private async applyMaterialToSlot(targetObject: Group, slotId: string, materialId: string) {
    const componentId = targetObject.userData.componentState?.[slotId];
    if (!componentId) return;

    const componentConfig = this.experience.configManager.getComponentById(componentId);
    const materialConfig = availableMaterials.find(m => m.id === materialId);
    if (!componentConfig?.materialTarget || !materialConfig) return;

    const materialTargetName = componentConfig.materialTarget;
    const componentObject = targetObject.getObjectByName(slotId);

    componentObject?.traverse(async (child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.name === materialTargetName) {
        const material = child.material;
        material.color.set(materialConfig.color);
        material.map = materialConfig.textureUrl
          ? await this.experience.assetManager.getTexture(materialConfig.textureUrl)
          : null;
        material.needsUpdate = true;
      }
    });
  }

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const experienceStore = this.experience.experienceStore;

    watch(() => selectionStore.materialChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, materialId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      if (!targetObject) return selectionStore.acknowledgeMaterialChange();

      targetObject.userData.materialState[slotId] = materialId;
      await this.applyMaterialToSlot(targetObject, slotId, materialId);
      
      this.experience.historyStore.addState();
      selectionStore.acknowledgeMaterialChange();
    });

    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, newStyleId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      if (!targetObject) return selectionStore.acknowledgeStyleChange();
      
      targetObject.userData.componentState[slotId] = newStyleId;
      
      await this.experience.rebuildObject(targetObject);

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

        await this.experience.rebuildObject(targetObject);

        this.experience.historyStore.addState();
        selectionStore.acknowledgePropertyChange();
    });

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
      const originalObject = experienceStore.getObjectByUUID(uuidToDuplicate);
      if (!originalObject) return selectionStore.acknowledgeDuplication();

      const newObject = await this.experience.assetManager.buildFurnitureFromConfig(
        originalObject.userData.config,
        originalObject.userData.componentState,
        originalObject.userData.propertyState
      );

      newObject.userData.materialState = JSON.parse(JSON.stringify(originalObject.userData.materialState));
      await this.applyMaterialsToObject(newObject);

      const box = new Box3().setFromObject(originalObject);
      const size = new Vector3();
      box.getSize(size);
      newObject.position.copy(originalObject.position).add(new Vector3(size.x + 0.2, 0, 0));
      
      this.experience.addObjectToScene(newObject);
      this.experience.interactionManager.startDraggingExistingObject(newObject);
      selectionStore.acknowledgeDuplication();
    });
  }
}