// src/three/Managers/StateManager.ts

import { watch } from 'vue';
import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import Experience from '../Experience';
import { availableMaterials, type MaterialConfig } from '@/config/materials';
import { type FurnitureSlotConfig, type ComponentSlotConfig } from '@/config/furniture';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

  public async applyStateToObject(targetObject: Group) {
    if (!targetObject.userData.config || !targetObject.userData.materialState) return;

    for (const [slotId, materialId] of Object.entries(targetObject.userData.materialState)) {
      if (typeof materialId !== 'string') continue;
      await this.applyMaterial(targetObject, slotId, materialId);
    }
  }

  private async applyMaterial(targetObject: Group, slotId: string, materialId: string) {
    const furnitureConfig = targetObject.userData.config;
    const componentState = targetObject.userData.componentState;
    const pathParts = slotId.split('.');
    const mainSlotId = pathParts[0];
    const subSlotId = pathParts[1];

    let effectiveMaterialTarget: string | undefined;

    if (mainSlotId && subSlotId) {
      const mainComponentId = componentState?.[mainSlotId];
      const mainComponentConfig = mainComponentId ? this.experience.configManager.getComponentById(mainComponentId) : null;
      const subSlotConfig = mainComponentConfig?.slots.find((s: ComponentSlotConfig) => s.id === subSlotId);
      const subComponentId = componentState?.[subSlotId];
      const subComponentConfig = subComponentId ? this.experience.configManager.getComponentById(subComponentId) : null;
      effectiveMaterialTarget = subSlotConfig?.materialTarget || subComponentConfig?.materialTarget;
    } else if (mainSlotId) {
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === mainSlotId);
      const componentId = componentState?.[mainSlotId];
      const componentConfig = componentId ? this.experience.configManager.getComponentById(componentId) : null;
      effectiveMaterialTarget = slotConfig?.materialTarget || componentConfig?.materialTarget;
    }

    const materialConfig = availableMaterials.find((mat: MaterialConfig) => mat.id === materialId);
    if (!effectiveMaterialTarget || !materialConfig) return;

    targetObject.traverse(async (child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.name === effectiveMaterialTarget) {
        const material = child.material;
        material.color.set(materialConfig.color);
        if (materialConfig.textureUrl) {
          try {
            const texture = await this.experience.assetManager.getTexture(materialConfig.textureUrl);
            material.map = texture;
          } catch { material.map = null; }
        } else {
          material.map = null;
        }
        material.needsUpdate = true;
      }
    });
  }

private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const settingsStore = this.experience.settingsStore;
    const experienceStore = this.experience.experienceStore; // Rövidítés a könnyebb használatért

    watch(() => selectionStore.materialChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, materialId } = request;
      // JAVÍTÁS: A store-ból olvassuk a listát
      const targetObject = experienceStore.placedObjects.find(obj => obj.uuid === targetUUID);
      if (!targetObject) {
        selectionStore.acknowledgeMaterialChange();
        return;
      }
      targetObject.userData.materialState[slotId] = materialId;
      await this.applyMaterial(targetObject, slotId, materialId);
      selectionStore.acknowledgeMaterialChange();
    });

    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;
      const { targetUUID, slotId, newStyleId } = request;
      // JAVÍTÁS: A store-ból olvassuk a listát
      const targetObject = experienceStore.placedObjects.find(obj => obj.uuid === targetUUID);
      if (!targetObject?.userData.config) {
        selectionStore.acknowledgeStyleChange();
        return;
      }
      const currentState = targetObject.userData.componentState;
      const pathParts = slotId.split('.');
      const stateKey = pathParts.length > 1 ? pathParts[1] : pathParts[0];
      if (!stateKey) {
        selectionStore.acknowledgeStyleChange();
        return;
      }
      currentState[stateKey] = newStyleId;
      this.experience.rebuildObject(targetObject, currentState);
      selectionStore.acknowledgeStyleChange();
    });

    watch(() => selectionStore.objectToDeleteUUID, (uuidToDelete) => {
      if (!uuidToDelete) return;
      // JAVÍTÁS: A store-ból olvassuk a listát
      const objectToRemove = experienceStore.placedObjects.find(obj => obj.uuid === uuidToDelete);
      if (objectToRemove) {
        this.experience.removeObject(objectToRemove);
      }
      selectionStore.acknowledgeDeletion();
    });

    watch(() => selectionStore.objectToDuplicateUUID, async (uuidToDuplicate) => {
      if (!uuidToDuplicate) return;
      // JAVÍTÁS: A store-ból olvassuk a listát
      const originalObject = experienceStore.placedObjects.find(obj => obj.uuid === uuidToDuplicate);
      if (!originalObject?.userData.config) {
        selectionStore.acknowledgeDuplication();
        return;
      }

      const newState = JSON.parse(JSON.stringify(originalObject.userData.componentState));
      const newMaterialState = JSON.parse(JSON.stringify(originalObject.userData.materialState));

      const newObject = await this.experience.assetManager.buildFurniture(originalObject.userData.config.id, newState);
      if (!newObject) {
        selectionStore.acknowledgeDuplication();
        return;
      }

      newObject.userData.materialState = newMaterialState;
      await this.applyStateToObject(newObject);

      const boundingBox = this.experience.placementManager.getVirtualBox(originalObject, originalObject.position);
      const size = new Vector3();
      boundingBox.getSize(size);
      const offset = new Vector3(size.x + 0.1, 0, 0);
      newObject.position.copy(originalObject.position).add(offset);
      newObject.rotation.copy(originalObject.rotation);
      newObject.scale.copy(originalObject.scale);

      this.experience.scene.add(newObject);
      this.experience.transformControls.detach();
      this.experience.selectionStore.clearSelection();
      this.experience.interactionManager.startDraggingExistingObject(newObject);

      selectionStore.acknowledgeDuplication();
    });

    // --- GLOBÁLIS STÍLUSVÁLTÁS FIGYELŐ ---
    watch(() => settingsStore.globalStyleSettings, (newSettings, oldSettings) => {
      console.groupCollapsed("--- [StateManager] Globális stílusváltás (OKOSÍTOTT) ---");
      
      // 1. LÉPÉS: A változás detektálása
      // Megkeressük, hogy PONTOSAN melyik beállítás változott.
      let changedSlotId: string | null = null;
      for (const key in newSettings) {
        if (newSettings[key] !== oldSettings[key]) {
          changedSlotId = key;
          break; // Feltételezzük, hogy egyszerre csak egy dolog változik
        }
      }

      if (!changedSlotId) {
        console.log("Nem történt érdemi változás.");
        console.groupEnd();
        return;
      }
      
      const newStyleId = newSettings[changedSlotId];
      console.log(`🔍 Változás detektálva: A '${changedSlotId}' slot új stílusa '${newStyleId}'.`);

      // 2. LÉPÉS: Feladatok összegyűjtése (a "Queue" minta marad)
      const rebuildQueue: { oldObject: Group, newState: Record<string, string> }[] = [];

      for (const placedObject of experienceStore.placedObjects) {
        const currentState = placedObject.userData.componentState;
        if (!currentState) continue;

        // 3. LÉPÉS: Döntés a felülírásról
        // Csak akkor írjuk felül a bútor állapotát, ha az MEGEGYEZETT a RÉGI globális beállítással.
        // Ezzel megőrizzük a szándékos, egyedi beállításokat.
        if (currentState[changedSlotId] === oldSettings[changedSlotId]) {
          const newState = { ...currentState };
          newState[changedSlotId] = newStyleId;
          rebuildQueue.push({ oldObject: placedObject, newState });
        }
      }

      // 4. LÉPÉS: Feladatok végrehajtása
      if (rebuildQueue.length > 0) {
        console.log(`📬 Várólista összeállítva: ${rebuildQueue.length} elem kerül átépítésre.`);
        Promise.all(rebuildQueue.map(task => 
          this.experience.rebuildObject(task.oldObject, task.newState, false)
        ));
      } else {
        console.log("Egyetlen bútor sem felelt meg a cserének (valószínűleg mind egyedi stílusú).");
      }
      
      console.groupEnd();
    }, { deep: true });

    // --- GLOBÁLIS ANYAGVÁLTÁS FIGYELŐ ---
    watch(() => settingsStore.globalMaterialSettings, (newSettings) => {
      console.groupCollapsed("--- StateManager: Globális anyagváltás ---");
      // JAVÍTÁS: A store-ból olvassuk a listát
      console.log("Lehelyezett objektumok száma:", experienceStore.placedObjects.length);

      // JAVÍTÁS: A store-ból olvassuk a listát
      for (const placedObject of experienceStore.placedObjects) {
        if (!placedObject.userData.materialState) continue;
        for (const [targetSlotId, newMaterialId] of Object.entries(newSettings)) {
          if (placedObject.userData.materialState[targetSlotId] !== newMaterialId) {
            placedObject.userData.materialState[targetSlotId] = newMaterialId;
            this.applyMaterial(placedObject, targetSlotId, newMaterialId);
          }
        }
      }
      console.groupEnd();
    }, { deep: true });

    // --- FRONTOK LÁTHATÓSÁGÁNAK FIGYELŐJE ---
    watch(() => settingsStore.areFrontsVisible, (isVisible) => {
      console.log(`--- StateManager: Frontok láthatósága -> ${isVisible} ---`);
      // JAVÍTÁS: A store-ból olvassuk a listát
      for (const placedObject of experienceStore.placedObjects) {
        const frontObject = placedObject.getObjectByName('front');
        if (frontObject) {
          frontObject.visible = isVisible;
        } else {
          console.warn(`Nem található 'front' nevű objektum a(z) '${placedObject.name}' bútoron.`);
        }
      }
    }, { immediate: true });
  }
}