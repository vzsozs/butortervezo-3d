// src/three/Managers/AssetManager.ts
import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three-stdlib';
import type { ComponentConfig, FurnitureConfig, ComponentSlotConfig } from '@/config/furniture';
// JAVÍTÁS: Közvetlen importok a többi singletonból
import ConfigManager from './ConfigManager';
import DebugManager from './DebugManager';

// Singleton minta
let instance: AssetManager | null = null;

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();
  
  // JAVÍTÁS: A DebugManager-t is singletonként érjük el
  private debugManager = DebugManager.getInstance();

  // JAVÍTÁS: A konstruktor privát és független
  private constructor() {
    this.textureLoader = new TextureLoader();
  }

  // Statikus metódus a példány elérésére
  public static getInstance(): AssetManager {
    if (!instance) {
      instance = new AssetManager();
    }
    return instance;
  }

  public async buildFurnitureFromConfig(
    config: FurnitureConfig,
    componentState: Record<string, string>,
    propertyState: Record<string, Record<string, string | number | boolean>> = {}
  ): Promise<Group> {
    const furnitureProxy = new Group();
    furnitureProxy.name = `proxy_${config.id}`;
    
    const loadedComponents: Map<string, { model: Group, config: ComponentConfig, slot: ComponentSlotConfig }> = new Map();
    
    const loadPromises = config.componentSlots.map(async (slot) => {
      const componentId = componentState[slot.slotId];
      if (!componentId) return;

      // JAVÍTÁS: A ConfigManager singleton használata
      const componentConfig = ConfigManager.getComponentById(componentId);
      if (!componentConfig) {
        // JAVÍTÁS: A DebugManager singleton használata
        this.debugManager.logConfigNotFound('Komponens', componentId);
        return;
      }

      const modelUrl = componentConfig.model;
      const componentModel = await this.loadModel(modelUrl);
      
      componentModel.name = slot.slotId;
      loadedComponents.set(slot.slotId, { model: componentModel, config: componentConfig, slot: slot });
    });

    await Promise.all(loadPromises);

    loadedComponents.forEach((childData) => {
      const { model: childModel, slot: childSlot, config: childConfig } = childData;

      if (childSlot.attachToSlot) {
        const parentData = loadedComponents.get(childSlot.attachToSlot);
        if (parentData) {
          const { model: parentModel, config: parentConfig } = parentData;
          const attachmentPointsData = childConfig.attachmentPoints || childSlot.attachmentPoints;
          if (!attachmentPointsData) return;

          const attachmentPoints = 'multiple' in attachmentPointsData && attachmentPointsData.multiple ? attachmentPointsData.multiple : ('self' in attachmentPointsData ? [attachmentPointsData.self] : []);
          
          for (const pointName of attachmentPoints) {
            if (!pointName) continue;
            const attachmentDummy = parentModel.getObjectByName(pointName);
            if (attachmentDummy) {
              const instance = attachmentPoints.length > 1 ? childModel.clone() : childModel;
              instance.position.copy(attachmentDummy.position);
              instance.rotation.copy(attachmentDummy.rotation);
              if (childSlot.rotation) {
                instance.rotation.x += childSlot.rotation.x;
                instance.rotation.y += childSlot.rotation.y;
                instance.rotation.z += childSlot.rotation.z;
              }
              parentModel.add(instance);
            } else {
              // JAVÍTÁS: A DebugManager singleton használata
              this.debugManager.logAttachmentPointNotFound(
                pointName,
                parentConfig.name,
                childConfig.name
              );
            }
          }
        }
      }
    });

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

    let legHeight = 0;
    const legComponentId = componentState['leg'];
    if (legComponentId) {
      // JAVÍTÁS: A ConfigManager singleton használata
      const legConfig = ConfigManager.getComponentById(legComponentId);
      legHeight = legConfig?.height || 0;
    }
    furnitureProxy.position.y += legHeight;

    furnitureProxy.userData = {
      config: config,
      componentState: JSON.parse(JSON.stringify(componentState)),
      propertyState: JSON.parse(JSON.stringify(propertyState)),
      materialState: {},
    };
    
    return furnitureProxy;
  }

  private async loadModel(url: string): Promise<Group> {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone(true);
    }
    
    try {
      const gltf = await this.loader.loadAsync(url);
      const modelContent = new Group();
      
      for (const child of [...gltf.scene.children]) {
        modelContent.add(child);
      }
      
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
      // JAVÍTÁS: A DebugManager singleton használata
      this.debugManager.logModelLoadError(url, error);
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