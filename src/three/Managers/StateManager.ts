// src/three/Managers/StateManager.ts

import { watch } from 'vue';
import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import Experience from '../Experience';
import { availableMaterials, type MaterialConfig } from '@/config/materials';
import { type FurnitureSlotConfig, type ComponentSlotConfig } from '@/config/furniture';
import { usePersistenceStore } from '@/stores/persistence'; // <-- ÚJ IMPORT

export default class StateManager {
  constructor(private experience: Experience) {
    this.experience = experience; 
    this.setupWatchers();
  }

  private persistenceStore = usePersistenceStore(); // <-- ÚJ PÉLDÁNY
  private autosaveTimeout: number | null = null; // <-- ÚJ TULAJDONSÁG

   // === A KÉNYSZERÍTŐ FÜGGVÉNYEK VISSZAÁLLÍTÁSA ===
  public async forceGlobalStyle(slotId: string, newStyleId: string) {
    // === EZ A LEGFONTOSABB LOG ===
    console.log(`[StateManager] forceGlobalStyle METÓDUS ELINDULT. Paraméterek: ${slotId}, ${newStyleId}`);
    
    const experienceStore = this.experience.experienceStore;
    const rebuildQueue: { oldObject: Group, newState: Record<string, string> }[] = [];
    for (const placedObject of experienceStore.placedObjects) {
      const currentState = placedObject.userData.componentState;
      // Logoljuk a döntést
      if (currentState && typeof currentState[slotId] !== 'undefined' && currentState[slotId] !== newStyleId) {
        console.log(` -> Bútor (${placedObject.uuid.substring(0,4)}) felvéve a listára. Régi stílus: ${currentState[slotId]}`);
        const newState = { ...currentState, [slotId]: newStyleId };
        rebuildQueue.push({ oldObject: placedObject, newState });
      }
    }
    if (rebuildQueue.length > 0) {
      await Promise.all(rebuildQueue.map(task => this.experience.rebuildObject(task.oldObject, task.newState, false)));
      this.experience.historyStore.addState();
    } else {
      console.log(`[StateManager] Nem volt szükség egyetlen bútor átépítésére sem.`);
    }
  }

  public forceGlobalMaterial(slotId: string, newMaterialId: string) {
    console.log(`[StateManager] forceGlobalMaterial METÓDUS ELINDULT. Paraméterek: ${slotId}, ${newMaterialId}`);
    const experienceStore = this.experience.experienceStore;
    console.log(`[StateManager] Globális anyag kényszerítése: ${slotId} -> ${newMaterialId}`);
    let changed = false;
    for (const placedObject of experienceStore.placedObjects) {
      if (placedObject.userData.materialState && typeof placedObject.userData.materialState[slotId] !== 'undefined' && placedObject.userData.materialState[slotId] !== newMaterialId) {
        placedObject.userData.materialState[slotId] = newMaterialId;
        this.applyMaterial(placedObject, slotId, newMaterialId);
        changed = true;
      }
    }
    if (changed) {
      this.experience.historyStore.addState();
    }
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

   // === ÚJ METÓDUS AZ AUTOMENTÉSHEZ ===
  private triggerAutosave() {
    // Töröljük a korábbi időzítőt, ha volt
    if (this.autosaveTimeout) {
      clearTimeout(this.autosaveTimeout);
    }
    // Beállítunk egy újat, ami 2 másodperc múlva ment
    this.autosaveTimeout = window.setTimeout(() => {
      this.persistenceStore.saveStateToLocalStorage();
    }, 2000); // 2 másodperc késleltetés
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
      this.experience.historyStore.addState();
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
      await this.experience.rebuildObject(targetObject, currentState);
      this.experience.historyStore.addState();
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
    watch(
      () => [
        settingsStore.globalStyleSettings.front,
        settingsStore.globalStyleSettings.leg,
        settingsStore.globalStyleSettings.handle,
      ],
      async ([newFront, newLeg, newHandle], [oldFront, oldLeg, oldHandle]) => {
        console.groupCollapsed("--- [StateManager] Globális stílusváltás (ATOMIZÁLT) ---");

        let changedSlotId: string | null = null;
        let newStyleId: string | undefined;
        let oldStyleId: string | undefined;

        // Megkeressük, hogy PONTOSAN melyik változott
        if (newFront !== oldFront) {
          changedSlotId = 'front';
          newStyleId = newFront;
          oldStyleId = oldFront;
        } else if (newLeg !== oldLeg) {
          changedSlotId = 'leg';
          newStyleId = newLeg;
          oldStyleId = oldLeg;
        } else if (newHandle !== oldHandle) {
          changedSlotId = 'handle';
          newStyleId = newHandle;
          oldStyleId = oldHandle;
        }

        if (!changedSlotId || !newStyleId || typeof oldStyleId === 'undefined') {
          console.log("Nem történt érdemi változás.");
          console.groupEnd();
          return;
        }
        
        console.log(`🔍 Változás detektálva: A '${changedSlotId}' slot új stílusa '${newStyleId}'.`);

        const rebuildQueue: { oldObject: Group, newState: Record<string, string> }[] = [];

        for (const placedObject of experienceStore.placedObjects) {
          const currentState = placedObject.userData.componentState;
          if (!currentState) continue;

          // Csak akkor írjuk felül, ha a bútor állapota megegyezett a RÉGI globális beállítással
          if (currentState[changedSlotId] === oldStyleId) {
            const newState = { ...currentState };
            newState[changedSlotId] = newStyleId;
            rebuildQueue.push({ oldObject: placedObject, newState });
          }
        }

        if (rebuildQueue.length > 0) {
          console.log(`📬 Várólista összeállítva: ${rebuildQueue.length} elem kerül átépítésre.`);
          await Promise.all(rebuildQueue.map(task => 
            this.experience.rebuildObject(task.oldObject, task.newState, false)
          ));
          this.experience.historyStore.addState();
        } else {
          console.log("Egyetlen bútor sem felelt meg a cserének.");
        }
        
        console.groupEnd();
      },
      { deep: false } // A deep watch itt már nem szükséges, sőt, felesleges
    );

    // --- GLOBÁLIS ANYAGVÁLTÁS FIGYELŐ ---
    watch(
      () => [
        settingsStore.globalMaterialSettings.front,
        settingsStore.globalMaterialSettings.corpus,
        settingsStore.globalMaterialSettings.leg,
        settingsStore.globalMaterialSettings.handle,
      ],
      ([newFrontMat, newCorpusMat, newLegMat, newHandleMat], [oldFrontMat, oldCorpusMat, oldLegMat, oldHandleMat]) => {
        console.groupCollapsed("--- [StateManager] Globális anyagváltás (ATOMIZÁLT) ---");

        let changedSlotId: string | null = null;

        if (newFrontMat !== oldFrontMat) changedSlotId = 'front';
        else if (newCorpusMat !== oldCorpusMat) changedSlotId = 'corpus';
        else if (newLegMat !== oldLegMat) changedSlotId = 'leg';
        else if (newHandleMat !== oldHandleMat) changedSlotId = 'handle';

        if (!changedSlotId) {
          console.log("Nem történt érdemi anyagváltozás.");
          console.groupEnd();
          return;
        }
        
        const newMaterialId = settingsStore.globalMaterialSettings[changedSlotId];
        console.log(`🔍 Anyagváltozás detektálva: A '${changedSlotId}' slot új anyaga '${newMaterialId}'.`);

        let changed = false;
        for (const placedObject of experienceStore.placedObjects) {
          // === ITT VOLT A HIBA ===
          if (placedObject.userData.materialState && typeof placedObject.userData.materialState[changedSlotId] !== 'undefined') {
            placedObject.userData.materialState[changedSlotId] = newMaterialId;
            this.applyMaterial(placedObject, changedSlotId, newMaterialId as string);
            changed = true;
          }
        }

        if (changed) {
          this.experience.historyStore.addState();
        }
        
        console.groupEnd();
      },
      { deep: false }
    );

    // === AUTOMENTÉS TRIGGER ===
    watch(() => this.experience.historyStore.history, () => {
      this.triggerAutosave();
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