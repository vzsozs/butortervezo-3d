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
  
  
    // --- STÍLUSVÁLTÁS FIGYELŐ (TELJESEN ÚJRAÍRVA) ---
    watch(() => selectionStore.styleChangeRequest, async (request) => {
      if (!request) return;

      const { targetUUID, slotId, newStyleId } = request;
      const targetObject = this.experience.placedObjects.find(obj => obj.uuid === targetUUID);
      
      if (!targetObject || !targetObject.userData.config || !targetObject.userData.componentState) {
        selectionStore.acknowledgeStyleChange();
        return;
      }

      console.log(`Stílusváltás kérése: Slot='${slotId}', Új ID='${newStyleId}'`);

      const furnitureConfig = targetObject.userData.config;
      const componentState = targetObject.userData.componentState;
      const slotConfig = furnitureConfig.slots.find((s: FurnitureSlotConfig) => s.id === slotId);
      
      const oldComponentId = componentState[slotId];
      const oldComponentConfig = this.experience.configManager.getComponentById(oldComponentId);
      const newComponentConfig = this.experience.configManager.getComponentById(newStyleId);

      if (!slotConfig || !newComponentConfig || !oldComponentConfig) {
        console.error("Hiányzó konfiguráció a stílusváltáshoz.");
        selectionStore.acknowledgeStyleChange();
        return;
      }

      // 1. Keressük meg a bútor alaptestét (ahova a komponensek csatlakoznak)
      let baseMesh: Object3D | undefined;
      targetObject.traverse((child) => {
        if (child.userData.config?.id === furnitureConfig.id) {
          baseMesh = child;
        }
      });
      if (!baseMesh) {
        console.error("Nem található a bútor alapteste a proxy-n belül.");
        selectionStore.acknowledgeStyleChange();
        return;
      }

      // 2. Keressük meg és töröljük a régi komponenst
      const oldComponentObject = baseMesh.children.find(child => child.name === oldComponentConfig.name);
      if (oldComponentObject) {
        baseMesh.remove(oldComponentObject);
      }

      // 3. Építsük meg az új komponenst
      const newComponentObject = await this.experience.assetManager.buildComponent(newComponentConfig);
      if (!newComponentObject) {
        selectionStore.acknowledgeStyleChange();
        return;
      }

      // 4. Helyezzük el az új komponenst a megfelelő csatlakozási ponton
      const attachmentNames = slotConfig.attachmentPoints || (slotConfig.attachmentPoint ? [slotConfig.attachmentPoint] : []);
      for (const pointName of attachmentNames) {
        const attachmentPoint = this.experience.assetManager.findObjectByBaseName(baseMesh, pointName);
        if (attachmentPoint) {
          const instance = (attachmentNames.length > 1) ? newComponentObject.clone() : newComponentObject;
          instance.position.copy(attachmentPoint.position);
          instance.rotation.copy(attachmentPoint.rotation);
          baseMesh.add(instance);
        }
      }

      // 5. Frissítsük az állapotot
      componentState[slotId] = newStyleId;
      // Frissítsük a defaultOption-t is, hogy a UI szinkronban maradjon
      slotConfig.defaultOption = newStyleId;

      targetObject.userData.componentState[slotId] = newStyleId;

      console.log("Stílusváltás sikeres. Új állapot:", componentState);
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