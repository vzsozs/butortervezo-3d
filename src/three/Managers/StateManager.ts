// src/three/Managers/StateManager.ts

import { watch } from 'vue';
import Experience from '../Experience';
import { availableMaterials } from '@/config/materials';
import { furnitureDatabase, globalMaterials } from '@/config/furniture';
// JAVÍTÁS: Töröltük a felesleges importokat.
import { Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const settingsStore = this.experience.settingsStore;

    // --- TÖRLÉS FIGYELŐ ---
    watch(() => selectionStore.objectToDeleteUUID, (uuidToRemove) => {
      if (!this.experience.scene || !uuidToRemove) { return; }
      const objectToRemove = this.experience.placedObjects.find(obj => obj.uuid === uuidToRemove);
      if (objectToRemove) {
        this.experience.transformControls.detach();
        this.experience.scene.remove(objectToRemove);
        const index = this.experience.placedObjects.findIndex(obj => obj.uuid === uuidToRemove);
        if (index > -1) {
          this.experience.placedObjects.splice(index, 1);
        }
        this.experience.debug.selectionBoxHelper.visible = false;
        if (this.experience.placedObjects.length === 0) {
          this.experience.controls.target.set(0, 0, 0);
        }
      }
      selectionStore.acknowledgeDeletion();
    });
  
    // --- EGYEDI ANYAGVÁLTÁS FIGYELŐ ---
    watch(() => selectionStore.materialChangeRequest, (request) => {
      if (!this.experience.scene || !request) { return; }
  
      const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
      const furnitureConfig = allFurniture.find(f => f.id === selectionStore.selectedObject?.name);
      
      if (!furnitureConfig) { selectionStore.acknowledgeMaterialChange(); return; }
      const slotConfig = furnitureConfig.componentSlots.find(s => s.id === request.slotId);
      if (!slotConfig || !slotConfig.materialTarget) { selectionStore.acknowledgeMaterialChange(); return; }
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === request.targetUUID);
      if (!targetObject) { selectionStore.acknowledgeMaterialChange(); return; }
      const materialConfig = availableMaterials.find(mat => mat.id === request.materialId);
      if (!materialConfig) { selectionStore.acknowledgeMaterialChange(); return; }
  
      targetObject.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          if (child.material.name === slotConfig.materialTarget) {
            const material = child.material;
            material.color.set(materialConfig.color);
            material.roughness = materialConfig.roughness ?? 1.0;
            material.metalness = materialConfig.metalness ?? 0.0;
            if (materialConfig.textureUrl) {
              this.experience.assetManager.getTexture(materialConfig.textureUrl, (texture: Texture) => {
                material.map = texture;
                material.needsUpdate = true;
              });
            } else {
              material.map = null;
              material.needsUpdate = true;
            }
          }
        }
      });
      selectionStore.acknowledgeMaterialChange();
    });
  
    // --- STÍLUSVÁLTÁS FIGYELŐ ---
    watch(() => selectionStore.styleChangeRequest, (request) => {
      if (!this.experience.scene || !request) { return; }
      const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
      const furnitureConfig = allFurniture.find(f => f.id === selectionStore.selectedObject?.name);
      if (!furnitureConfig) { selectionStore.acknowledgeStyleChange(); return; }
      const slotConfig = furnitureConfig.componentSlots.find(s => s.id === request.slotId);
      if (!slotConfig || !slotConfig.styleOptions) { selectionStore.acknowledgeStyleChange(); return; }
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === request.targetUUID);
      if (!targetObject) { selectionStore.acknowledgeStyleChange(); return; }
      const newStyleOption = slotConfig.styleOptions.find(opt => opt.id === request.newStyleId);
      if (!newStyleOption) { selectionStore.acknowledgeStyleChange(); return; }
  
      for (const styleOption of slotConfig.styleOptions) {
        targetObject.traverse((child: Object3D) => {
          if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
            // JAVÍTÁS: Pótoltuk a hiányzó változó deklarációt.
            const isSelected = styleOption.id === request.newStyleId;
            child.visible = isSelected;
            if (isSelected) {
              if (newStyleOption.inheritsMaterialFrom) {
                const parentSlot = furnitureConfig.componentSlots.find(s => s.id === newStyleOption.inheritsMaterialFrom);
                if (parentSlot && parentSlot.materialTarget) {
                  targetObject.traverse((parentMesh: Object3D) => {
                    if (parentMesh instanceof Mesh && parentMesh.material.name === parentSlot.materialTarget) {
                      child.material = parentMesh.material;
                    }
                  });
                }
              } else if (newStyleOption.materialTarget) {
                targetObject.traverse((sourceMesh: Object3D) => {
                  if (sourceMesh instanceof Mesh && sourceMesh.material.name === newStyleOption.materialTarget) {
                    child.material = sourceMesh.material;
                  }
                });
              }
            }
          }
        });
      }
      selectionStore.acknowledgeStyleChange();
    });
  
    // --- GLOBÁLIS ANYAGVÁLTÁS FIGYELŐ ---
    watch(() => settingsStore.globalMaterialSettings, (newSettings) => {
      for (const placedObject of this.experience.placedObjects) {
        for (const [settingId, materialId] of Object.entries(newSettings)) {
          const globalMaterialConfig = globalMaterials[settingId as keyof typeof globalMaterials];
          if (!globalMaterialConfig) continue;
  
          const materialConfig = availableMaterials.find(m => m.id === materialId);
          if (!materialConfig) continue;
  
          placedObject.traverse((child: Object3D) => {
            if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
              if (child.material.name === globalMaterialConfig.materialTarget) {
                const material = child.material;
                material.color.set(materialConfig.color);
                material.roughness = materialConfig.roughness ?? 1.0;
                material.metalness = materialConfig.metalness ?? 0.0;
  
                if (materialConfig.textureUrl) {
                  this.experience.assetManager.getTexture(materialConfig.textureUrl, (texture: Texture) => {
                    material.map = texture;
                    material.needsUpdate = true;
                  });
                } else {
                  material.map = null;
                  material.needsUpdate = true;
                }
              }
            }
          });
        }
      }
    }, { deep: true });
  
    // --- GLOBÁLIS STÍLUSVÁLTÓ ---
    watch(() => settingsStore.globalStyleSettings, (newSettings) => {
      const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
      for (const placedObject of this.experience.placedObjects) {
        const furnitureConfig = allFurniture.find(f => f.id === placedObject.name);
        if (!furnitureConfig) continue;
        for (const [slotId, newStyleId] of Object.entries(newSettings)) {
          const slotConfig = furnitureConfig.componentSlots.find(s => s.id === slotId);
          if (!slotConfig || !slotConfig.styleOptions) continue;
          for (const styleOption of slotConfig.styleOptions) {
            placedObject.traverse((child: Object3D) => {
              if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
                child.visible = styleOption.id === newStyleId;
              }
            });
          }
        }
      }
    }, { deep: true });
  }
}