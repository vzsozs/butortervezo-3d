// src/three/Managers/StateManager.ts

import { watch } from 'vue';
import Experience from '../Experience';
import { availableMaterials, type MaterialConfig } from '@/config/materials';
// JAVÍTÁS: Visszaállítjuk a hiányzó globalMaterials importot
import { type FurnitureSlotConfig, globalMaterials } from '@/config/furniture';
import { Mesh, MeshStandardMaterial, Object3D, Texture, Group } from 'three';

export default class StateManager {
  constructor(private experience: Experience) {
    this.setupWatchers();
  }

   // ######################################################################
  // ###                  ÚJ, PUBLIKUS METÓDUS                          ###
  // ######################################################################
  public async applyStateToObject(targetObject: Group) {
    if (!targetObject.userData.config || !targetObject.userData.componentState || !targetObject.userData.materialState) {
      console.error("applyStateToObject: Hiányzó userData a cél objektumon.");
      return;
    }

    console.log("Állapot alkalmazása az új objektumra:", {
      components: targetObject.userData.componentState,
      materials: targetObject.userData.materialState,
    });

    // 1. LÉPÉS: Stílusok (komponensek) alkalmazása
    // A stílusváltás logikáját ide másoljuk, de most egy ciklusban futtatjuk.
    for (const [slotId, newStyleId] of Object.entries(targetObject.userData.componentState)) {
      // Itt a stílusváltás logikáját kellene futtatni, ha az eltér a defaulttól.
      // Ezt a következő lépésben, a stílusváltás implementálásakor fogjuk megírni.
      // Egyelőre a log elég.
      console.log(`- Stílus ellenőrzése a(z) '${slotId}' sloton: '${newStyleId}'`);
    }

    // 2. LÉPÉS: Anyagok alkalmazása
    for (const [slotId, materialId] of Object.entries(targetObject.userData.materialState)) {
      if (typeof materialId !== 'string') continue; // Csak a beállított anyagokkal foglalkozunk

      console.log(`- Anyag alkalmazása a(z) '${slotId}' slotra: '${materialId}'`);
      
      // Ez a logika megegyezik a watch-ban lévővel.
      const furnitureConfig = targetObject.userData.config;
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === slotId);
      const componentId = targetObject.userData.componentState?.[slotId];
      const componentConfig = componentId ? this.experience.configManager.getComponentById(componentId) : null;
      const effectiveMaterialTarget = slotConfig?.materialTarget || componentConfig?.materialTarget;
      const materialConfig = availableMaterials.find((mat: MaterialConfig) => mat.id === materialId);

      if (effectiveMaterialTarget && materialConfig) {
        targetObject.traverse((child: Object3D) => {
          if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.name === effectiveMaterialTarget) {
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
            }
            material.needsUpdate = true;
          }
        });
      }
    }
  }

  private setupWatchers() {
    const selectionStore = this.experience.selectionStore;
    const settingsStore = this.experience.settingsStore;

    watch(() => selectionStore.materialChangeRequest, (request) => {
      if (!request) return;
      
      console.groupCollapsed(`--- StateManager: Anyagváltás kérelem feldolgozása ---`);
      console.log("KÉRELEM ÉRKEZETT:", request);

      const { targetUUID, slotId, materialId } = request;
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === targetUUID);
      
      if (!targetObject?.userData.config || !targetObject.userData.materialState) {
        console.error("Hiba: A cél objektum vagy a konfigurációja hiányzik.");
        selectionStore.acknowledgeMaterialChange();
        console.groupEnd();
        return;
      }
      
      const furnitureConfig = targetObject.userData.config;
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === slotId);
      const componentId = targetObject.userData.componentState?.[slotId];
      const componentConfig = componentId ? this.experience.configManager.getComponentById(componentId) : null;
      
      const effectiveMaterialTarget = slotConfig?.materialTarget || componentConfig?.materialTarget;
      
      console.log(`KERESETT CÉL (materialTarget): %c${effectiveMaterialTarget}`, 'color: yellow; font-weight: bold;');

      if (!effectiveMaterialTarget) {
        console.warn(`Nincs 'materialTarget' definiálva a(z) '${slotId}' slothoz.`);
        selectionStore.acknowledgeMaterialChange();
        console.groupEnd();
        return;
      }

      const materialConfig = availableMaterials.find((mat: MaterialConfig) => mat.id === materialId);
      if (!materialConfig) {
        console.error("Hiba: A kért új anyag nem található az 'availableMaterials' listában.");
        selectionStore.acknowledgeMaterialChange();
        console.groupEnd();
        return;
      }
  
      let foundAndUpdated = false;
      console.log("A 3D modellen talált anyagok nevei:");
      targetObject.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          // Kiírjuk az összes talált anyag nevét, hogy lássuk, mi a valóság
          console.log(`- Mesh neve: '${child.name}', Anyag neve: %c'${child.material.name}'`, 'color: cyan');

          if (child.material.name === effectiveMaterialTarget) {
            console.log(`%cEGYEZÉS! A(z) '${child.name}' meshen a(z) '${child.material.name}' anyagot frissítjük.`, 'color: lightgreen; font-weight: bold;');
            foundAndUpdated = true;
            
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
            }
            material.needsUpdate = true;
          }
        }
      });

      if (!foundAndUpdated) {
        console.error(`HIBA: Nem találtunk egyetlen anyagot sem a 3D modellen, aminek a neve '${effectiveMaterialTarget}' lenne.`);
      }

      targetObject.userData.materialState[slotId] = materialId;
      selectionStore.acknowledgeMaterialChange();
      console.groupEnd();
    });
  
  
    // --- STÍLUSVÁLTÁS FIGYELŐ (EGYSZERŰSÍTVE) ---
    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;

      const { targetUUID, slotId, newStyleId } = request;
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === targetUUID);
      if (!targetObject?.userData.config) {
        selectionStore.acknowledgeStyleChange();
        return;
      }

      // 1. Frissítjük a bútor állapotát
      const currentState = targetObject.userData.componentState;
      currentState[slotId] = newStyleId;

      // 2. Szólunk az Experience-nek, hogy építse újra a bútort
      this.experience.rebuildObject(targetObject, currentState);

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
          // A 'globalMaterials' most már ismert az import miatt
          const globalMaterialConfig = globalMaterials[settingId as keyof typeof globalMaterials];
          if (!globalMaterialConfig) continue;
  
          // JAVÍTÁS: Az 'm' paraméternek megadjuk a helyes típust
          const materialConfig = availableMaterials.find((m: MaterialConfig) => m.id === materialId);
          if (!materialConfig) continue;
  
          placedObject.traverse((child: Object3D) => {
            if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
              if (child.material.name === globalMaterialConfig.materialTarget) {
                const material = child.material;
                material.color.set(materialConfig.color);
                material.roughness = materialConfig.roughness ?? 1.0;
                material.metalness = materialConfig.metalness ?? 0.0;
  
                if (materialConfig.textureUrl) {
                  // A 'Texture' típus most már ismert az import miatt
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