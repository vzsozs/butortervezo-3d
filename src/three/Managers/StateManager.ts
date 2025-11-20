import { watch, toRaw } from 'vue';
import { Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import Experience from '../Experience';
import { availableMaterials } from '@/config/materials';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

  // --- PUBLIKUS METÓDUSOK ---

  public updateFrontsVisibility(isVisible: boolean) {
    this.experience.toggleFrontVisibility(isVisible);
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

  public async applyMaterialToSlot(targetObject: Group, slotId: string, materialId: string) {
    const componentId = targetObject.userData.componentState?.[slotId];
    if (!componentId) return;

    const componentConfig = this.experience.configManager.getComponentById(componentId);
    const materialConfig = availableMaterials.find(m => m.id === materialId);
    
    if (!componentConfig?.materialTarget || !materialConfig) return;

    const materialTargetName = componentConfig.materialTarget;

    targetObject.traverse(async (child: Object3D) => {
      // Slot ID alapján keresünk (ez a legbiztosabb)
      if (child.userData.slotId === slotId) {
        child.traverse(async (mesh: Object3D) => {
          if (mesh instanceof Mesh) {
             const matName = Array.isArray(mesh.material) ? mesh.material[0].name : mesh.material.name;
             // Fuzzy match a material névre (pl. MAT_Front.001 is jó)
             if (matName.includes(materialTargetName)) {
              const oldMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
              const newMaterial = oldMat.clone();
              newMaterial.color.set(materialConfig.color);
              
              if (materialConfig.textureUrl) {
                newMaterial.map = await this.experience.assetManager.getTexture(materialConfig.textureUrl);
              } else {
                newMaterial.map = null;
              }
              mesh.material = newMaterial;
            }
          }
        });
      }
    });
  }

  // --- BELSŐ MŰKÖDÉS ---

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const experienceStore = this.experience.experienceStore;

    console.log('[StateManager] Watcherek inicializálása...');

    // 1. ANYAG CSERE
    watch(() => selectionStore.materialChangeRequest, async (request) => {
      if (!request) return;
      console.log('[StateManager] Anyagcsere kérés:', request);
      
      const { targetUUID, slotId, materialId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      
      if (targetObject) {
        const newMaterialState = { ...targetObject.userData.materialState, [slotId]: materialId };
        targetObject.userData.materialState = newMaterialState;
        await this.applyMaterialToSlot(targetObject, slotId, materialId);
        this.experience.historyStore.addState();
      }
      
      selectionStore.acknowledgeMaterialChange();
    }, { deep: true }); // Deep watch a biztonság kedvéért

    // 2. STÍLUS CSERE (Komponens csere)
    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;
      console.log('[StateManager] Stíluscsere kérés:', request);

      const { targetUUID, slotId, newStyleId } = request;
      const targetObject = experienceStore.getObjectByUUID(targetUUID);
      
      if (targetObject) {
        const newComponentState = { ...targetObject.userData.componentState, [slotId]: newStyleId };
        // Rebuild
        await this.experience.rebuildObject(targetObject, newComponentState);
        this.experience.historyStore.addState();
      }
      
      selectionStore.acknowledgeStyleChange();
    }, { deep: true });

    // 3. TÖRLÉS
    watch(() => selectionStore.objectToDeleteUUID, (uuidToDelete) => {
      if (!uuidToDelete) return;
      const objectToRemove = experienceStore.getObjectByUUID(uuidToDelete);
      if (objectToRemove) {
        this.experience.removeObject(objectToRemove);
      }
      selectionStore.acknowledgeDeletion();
    });
  }
}