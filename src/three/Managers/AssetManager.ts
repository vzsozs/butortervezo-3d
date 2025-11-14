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
          const attachmentPointsData = childConfig.attachmentPoints || childSlot.attachmentPoints;
          if (!attachmentPointsData) return;

          const attachmentPoints = attachmentPointsData.multiple || [attachmentPointsData.self];
          
          for (const pointName of attachmentPoints) {
            const attachmentDummy = parentModel.getObjectByName(pointName as string);
            if (attachmentDummy) {
              const instance = attachmentPoints.length > 1 ? childModel.clone() : childModel;
              instance.position.copy(attachmentDummy.position);
              instance.rotation.copy(attachmentDummy.rotation);
              if (childSlot.rotation) {
                instance.rotation.x += childSlot.rotation.x;
                instance.rotation.y += childSlot.rotation.y;
                instance.rotation.z += childSlot.rotation.z;
              }
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
      if (!data.slot.attachToSlot) {
        rootNode = data.model;
      }
    });

    if (rootNode) {
      furnitureProxy.add(rootNode);
    } else {
      console.error("Hiba: Nem található gyökér elem!");
    }

    const box = new Box3().setFromObject(furnitureProxy);
    const center = new Vector3();
    box.getCenter(center);
    
    furnitureProxy.children.forEach(child => child.position.sub(center));
    furnitureProxy.position.copy(center);

    // =================================================================
    // === ÚJ LOGIKA: BÚTOR MEGEMELÉSE A LÁB MAGASSÁGÁVAL =============
    // =================================================================
    let legHeight = 0;
    const legComponentId = componentState['leg'];
    if (legComponentId) {
      const legConfig = this.experience.configManager.getComponentById(legComponentId);
      legHeight = legConfig?.height || 0;
    }
    furnitureProxy.position.y += legHeight;
    // =================================================================

    // =================================================================
    // === A USERDATA "STERILIZÁLÁSA" A LÉTREHOZÁSKOR ==========
    // =================================================================
    furnitureProxy.userData = {
      config: config, // A config egy statikus objektum, nem kell másolni
      // A JSON trükk garantálja, hogy egy tiszta, nem reaktív másolatot hozunk létre
      componentState: JSON.parse(JSON.stringify(componentState)),
      propertyState: JSON.parse(JSON.stringify(propertyState)),
      materialState: {}, // Mindig üresen indul
    };
    
    return furnitureProxy;
  }

  private async loadModel(url: string): Promise<Group> {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone(true);
    }
    
    try {
      const gltf = await this.loader.loadAsync(url);
      
      // =================================================================
      // === VISSZAEGYSZERŰSÍTETT "KICSOMAGOLÓ" LOGIKA ===================
      // =================================================================
      // Feltételezzük, hogy a GLB fájl már egy lapos hierarchiát tartalmaz.
      const modelContent = new Group();
      
      // Áthelyezzük a betöltött jelenet összes gyerekét ebbe az új, tiszta Group-ba.
      for (const child of [...gltf.scene.children]) {
        modelContent.add(child);
      }
      
      // Általános beállítások
      modelContent.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material instanceof MeshStandardMaterial) {
            child.material = child.material.clone();
          }
        }
      });
      
      this.modelCache.set(url, modelContent);
      return modelContent.clone(true);

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