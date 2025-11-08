// src/three/Managers/StateManager.ts

import { watch } from 'vue';
import Experience from '../Experience';
import { availableMaterials } from '@/config/materials';
// JAVÍTÁS: A helyes típusokat és a globalMaterials-t importáljuk a központi helyről
import { globalMaterials, type FurnitureSlotConfig, type ComponentConfig, type StyleOption } from '@/config/furniture';
import { Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const settingsStore = this.experience.settingsStore;

    // --- EGYEDI ANYAGVÁLTÁS FIGYELŐ ---
    watch(() => selectionStore.materialChangeRequest, (request) => {
      if (!request) return;
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === request.targetUUID);
      if (!targetObject?.userData.config) {
        selectionStore.acknowledgeMaterialChange();
        return;
      }
      
      const furnitureConfig = targetObject.userData.config;
      // JAVÍTÁS: A helyes típust használjuk
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === request.slotId);
      if (!slotConfig?.materialTarget) {
        selectionStore.acknowledgeMaterialChange();
        return;
      }
      
      const materialConfig = availableMaterials.find(mat => mat.id === request.materialId);
      if (!materialConfig) {
        selectionStore.acknowledgeMaterialChange();
        return;
      }
  
      targetObject.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.name === slotConfig.materialTarget) {
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
      });
      selectionStore.acknowledgeMaterialChange();
    });
  
    // --- STÍLUSVÁLTÁS FIGYELŐ ---
    watch(() => selectionStore.styleChangeRequest, (request) => {
      if (!request) return;
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === request.targetUUID);
      if (!targetObject?.userData.config) {
        selectionStore.acknowledgeStyleChange();
        return;
      }

      const furnitureConfig = targetObject.userData.config;
      // JAVÍTÁS: A helyes típust használjuk
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === request.slotId);
      
      // A te JSON-odban nincs 'styleOptions', hanem 'options' van, ami komponens ID-ket tartalmaz.
      // A stílusváltás logikáját ehhez kell majd igazítani a jövőben.
      // Egyelőre a típus-hibát javítjuk.
      if (!slotConfig?.options) { 
        selectionStore.acknowledgeStyleChange();
        return;
      }

      const newStyleOption = slotConfig.styleOptions.find((opt: StyleOption) => opt.id === request.newStyleId);
      if (!newStyleOption) {
        selectionStore.acknowledgeStyleChange();
        return;
      }
  
      for (const styleOption of slotConfig.styleOptions) {
        targetObject.traverse((child: Object3D) => {
          if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
            child.visible = styleOption.id === request.newStyleId;
          }
        });
      }
      selectionStore.acknowledgeStyleChange();
    });
  
    // --- GLOBÁLIS STÍLUSVÁLTÓ ---
    watch(() => settingsStore.globalStyleSettings, (newSettings) => {
      for (const placedObject of this.experience.placedObjects) {
        const furnitureConfig = placedObject.userData.config;
        if (!furnitureConfig) continue;
        for (const [slotId, newStyleId] of Object.entries(newSettings)) {
          // JAVÍTÁS: A helyes típust használjuk
          const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === slotId);
          if (!slotConfig?.options) continue; // A JSON-ban 'options' van
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

    // ÚJ FIGYELŐ: A frontok láthatóságának változását kezeli.
    watch(() => settingsStore.areFrontsVisible, (isVisible) => {
      console.log(`StateManager: Frontok láthatóságának beállítása -> ${isVisible}`);
      
      // Végigmegyünk az összes lehelyezett bútoron.
      for (const placedObject of this.experience.placedObjects) {
        // Végigmegyünk az adott bútor minden alkatrészén.
        placedObject.traverse((child: Object3D) => {
          // Ha az alkatrész egy Mesh, és a neve alapján frontnak minősül...
          if (
            child instanceof Mesh && 
            (
              child.name.toLowerCase().includes('ajto') || 
              child.name.toLowerCase().includes('fiokos') ||
              child.name.toLowerCase().includes('fogantyu')
            )
          ) {
            // ...akkor a láthatóságát beállítjuk az új értékre.
            child.visible = isVisible;
          }
        });
      }
    });

  }
}