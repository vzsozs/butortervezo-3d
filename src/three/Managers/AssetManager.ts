import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three-stdlib';
import Experience from '../Experience';
import type { ComponentConfig, FurnitureConfig, ComponentSlotConfig } from '@/config/furniture';

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();

  constructor(private experience: Experience) {
    this.textureLoader = new TextureLoader();
  }

  /**
   * Az új, központi bútorépítő függvény.
   * Egy bútor config és a kiválasztott állapotok alapján felépít egy teljes 3D-s Group-ot.
   */
  public async buildFurnitureFromConfig(
    config: FurnitureConfig,
    componentState: Record<string, string>,
    propertyState: Record<string, Record<string, string | number | boolean>> = {}
  ): Promise<Group> {
    
    const furnitureProxy = new Group();
    furnitureProxy.name = `proxy_${config.id}`;
    
    // =================================================================
    // === 1. FÁZIS: MINDEN MODELL BETÖLTÉSE ===========================
    // =================================================================
    const loadedComponents: Map<string, { model: Group, config: ComponentConfig, slot: ComponentSlotConfig }> = new Map();
    
    const loadPromises = config.componentSlots.map(async (slot) => {
      const componentId = componentState[slot.slotId];
      if (!componentId) return;

      const componentConfig = this.experience.configManager.getComponentById(componentId);
      if (!componentConfig) {
        this.experience.debugManager.logConfigNotFound('Komponens', componentId);
        return;
      }

      const modelUrl = componentConfig.model;
      const componentModel = await this.loadModel(modelUrl);
      
      componentModel.name = slot.slotId;
      loadedComponents.set(slot.slotId, { model: componentModel, config: componentConfig, slot: slot });
    });

    await Promise.all(loadPromises);

    // =================================================================
    // === 2. FÁZIS: HIERARCHIA ÖSSZEÉPÍTÉSE A MEMÓRIÁBAN ==============
    // =================================================================
    loadedComponents.forEach((childData) => {
      const { model: childModel, slot: childSlot, config: childConfig } = childData;

      // Ha a slotnak van szülője, csatlakoztatjuk
      if (childSlot.attachToSlot) {
        const parentData = loadedComponents.get(childSlot.attachToSlot);
        if (parentData) {
          const { model: parentModel, config: parentConfig } = parentData;
          const attachmentPoints = childSlot.attachmentPoints.multiple || [childSlot.attachmentPoints.self];
          
          for (const pointName of attachmentPoints) {
            const attachmentDummy = parentModel.getObjectByName(pointName as string);
            if (attachmentDummy) {
              const instance = attachmentPoints.length > 1 ? childModel.clone() : childModel;
              instance.position.copy(attachmentDummy.position);
              instance.rotation.copy(attachmentDummy.rotation);
              parentModel.add(instance); // <-- A SZÜLŐ MODELLHEZ ADJUK HOZZÁ
            } else {
              this.experience.debugManager.logAttachmentPointNotFound(
                pointName as string,
                parentConfig.name,
                childConfig.name
              );
            }
          }
        }
      }
    });

    // =================================================================
    // === 3. FÁZIS: GYÖKÉR MEGKERESÉSE ÉS VÉGLEGESÍTÉS ===============
    // =================================================================
    let rootNode: Group | null = null;
    loadedComponents.forEach((data) => {
      // Az a gyökér, aminek nincs szülője (nincs attachToSlot-ja)
      if (!data.slot.attachToSlot) {
        rootNode = data.model;
      }
    });

    if (rootNode) {
      furnitureProxy.add(rootNode);
    } else {
      console.error("Hiba: Nem található gyökér elem (attachToSlot nélküli slot) a bútor konfigurációban!");
    }

    const box = new Box3().setFromObject(furnitureProxy);
    const center = new Vector3();
    box.getCenter(center);
    
    // A középre igazítást a proxy gyerekein végezzük el, ami most már csak a rootNode
    furnitureProxy.children.forEach(child => child.position.sub(center));
    furnitureProxy.position.copy(center);

    furnitureProxy.userData = { config, componentState, propertyState, materialState: {} };
    return furnitureProxy;
  }

     private async loadModel(url: string): Promise<Group> {
    if (this.modelCache.has(url)) {
      const cachedObject = this.modelCache.get(url)!;
      const clone = cachedObject.clone(true);
      clone.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material = child.material.clone();
        }
      });
      return clone;
    }
    try {
      const gltf = await this.loader.loadAsync(url);
      const scene = gltf.scene;
      scene.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.modelCache.set(url, scene);
      const firstInstance = scene.clone(true);
      firstInstance.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material = child.material.clone();
        }
      });
      return firstInstance;
    } catch (error) {
      this.experience.debugManager.logModelLoadError(url, error);
      throw new Error(`Modell betöltése sikertelen: ${url}`);
    }
  }
  
  public async getTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      if (this.textureCache.has(url)) {
        resolve(this.textureCache.get(url)!);
        return;
      }
      this.textureLoader.load(url, (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        this.textureCache.set(url, texture);
        resolve(texture);
      }, undefined, (error) => {
        console.error(`Hiba a(z) ${url} textúra betöltése közben:`, error);
        reject(error);
      });
    });
  }
}