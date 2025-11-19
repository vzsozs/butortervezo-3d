// src/three/Managers/AssetManager.ts
import { Group, TextureLoader, Texture, SRGBColorSpace, RepeatWrapping, Vector3, Box3, Object3D, Mesh, MeshStandardMaterial, Quaternion, Euler } from 'three';
import { GLTFLoader } from 'three-stdlib';
import type { ComponentConfig, FurnitureConfig, ComponentSlotConfig } from '@/config/furniture';
import ConfigManager from './ConfigManager';
import DebugManager from './DebugManager';

// Singleton minta
let instance: AssetManager | null = null;

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();
  private debugManager = DebugManager.getInstance();

  private constructor() {
    this.textureLoader = new TextureLoader();
  }

  public static getInstance(): AssetManager {
    if (!instance) {
      instance = new AssetManager();
    }
    return instance;
  }

  public invalidateModelCache(url: string): void {
    if (this.modelCache.has(url)) {
      this.modelCache.delete(url);
      console.log(`%c[AssetManager] Cache érvénytelenítve a következő modellhez: ${url}`, 'color: orange');
    }
  }


  public async buildFurnitureFromConfig(
    config: FurnitureConfig,
    componentState: Record<string, string>,
    propertyState: Record<string, Record<string, string | number | boolean>> = {}
    ): Promise<Group> {
    console.log('%c[AssetManager] Bútor építése elkezdődött:', 'color: blue', { config, componentState });
    const furnitureProxy = new Group();
    furnitureProxy.name = `proxy_${config.id}`;
    
    const loadedComponents: Map<string, { model: Group, config: ComponentConfig, slot: ComponentSlotConfig }> = new Map();
    
    // A betöltési logika változatlan
    const loadPromises = config.componentSlots.map(async (slot) => {
      const componentId = componentState[slot.slotId];
      if (!componentId) return;
      const componentConfig = ConfigManager.getComponentById(componentId);
      if (!componentConfig) {
        this.debugManager.logConfigNotFound('Komponens', componentId);
        return;
      }
      const modelUrl = componentConfig.model;
      const componentModel = await this.loadModel(modelUrl);
      componentModel.name = slot.slotId;
      loadedComponents.set(slot.slotId, { model: componentModel, config: componentConfig, slot: slot });
    });

    await Promise.all(loadPromises);

    // A hierarchia-építés és sorbarendezés logikája változatlan
    const assembledObjects: Map<string, Group> = new Map();
    const slots = Array.from(loadedComponents.values());
    const slotMap = new Map(slots.map(s => [s.slot.slotId, s.slot]));
    const depthCache = new Map<string, number>();

    function getDepth(slotId: string): number {
      if (depthCache.has(slotId)) return depthCache.get(slotId)!;
      const slot = slotMap.get(slotId);
      if (!slot?.attachToSlot) {
        depthCache.set(slotId, 0);
        return 0;
      }
      const depth = 1 + getDepth(slot.attachToSlot);
      depthCache.set(slotId, depth);
      return depth;
    }

    slots.sort((a, b) => getDepth(a.slot.slotId) - getDepth(b.slot.slotId));

    // Az összeszerelési ciklus változatlan
    for (const data of slots) {
      const { model, slot } = data;
      const parentSlotId = slot.attachToSlot;

      if (!parentSlotId) {
        furnitureProxy.add(model);
        assembledObjects.set(slot.slotId, model);
        continue;
      }

      const parentModel = assembledObjects.get(parentSlotId);
      const parentData = loadedComponents.get(parentSlotId);

      if (!parentModel || !parentData) {
        console.error(`[AssetManager] HIBA: A(z) '${parentSlotId}' szülő nem található!`);
        continue;
      }
      
      const applyAttachment = (modelInstance: Group, attachmentPointName: string) => {
        const attachmentDummy = parentModel.getObjectByName(attachmentPointName);
        if (!attachmentDummy) {
          console.error(`[AssetManager] HIBA: A(z) '${attachmentPointName}' csat. pont nem található a(z) '${parentModel.name}' szülőn!`);
          return;
        }
        
        modelInstance.position.copy(attachmentDummy.position);
        modelInstance.quaternion.copy(attachmentDummy.quaternion);

        if (slot.rotation) {
          const slotEuler = new Euler(slot.rotation.x, slot.rotation.y, slot.rotation.z);
          const slotQuaternion = new Quaternion().setFromEuler(slotEuler);
          modelInstance.quaternion.multiply(slotQuaternion);
        }
        
        parentModel.add(modelInstance);
      };

      const componentId = componentState[slot.slotId];
      const attachmentPointsFromMapping = componentId ? slot.attachmentMapping?.[componentId] : undefined;

      if (attachmentPointsFromMapping && Array.isArray(attachmentPointsFromMapping)) {
        attachmentPointsFromMapping.forEach((pointName, index) => {
          const instance = index === 0 ? model : model.clone(true);
          applyAttachment(instance, pointName);
        });
      } else if (slot.useAttachmentPoint) {
        applyAttachment(model, slot.useAttachmentPoint);
      } else {
        console.warn(`[AssetManager] FIGYELEM: A(z) '${slot.slotId}' gyerek slotnak nincs csatlakozási szabálya...`);
      }

      assembledObjects.set(slot.slotId, model);
    }

    // --- EZ A RÉSZ VÁLTOZIK ---

    // 1. Kiszámoljuk a teljes bútor befoglaló dobozát
    const box = new Box3().setFromObject(furnitureProxy);
    const center = new Vector3();
    box.getCenter(center);

    // 2. Kiszámoljuk a láb magasságát
    let legHeight = 0;
    const legComponentId = componentState['leg'];
    if (legComponentId) {
      const legConfig = ConfigManager.getComponentById(legComponentId);
      if (legConfig && legConfig.height) {
        legHeight = legConfig.height;
      }
    }

    // 3. Beállítjuk a végleges pozíciót
    furnitureProxy.position.set(
      -center.x,
      -box.min.y + legHeight,
      -center.z
    );
    
    // --- VÁLTOZÁS VÉGE ---

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
      this.debugManager.logModelLoadError(url, error);
      throw new Error(`Modell betöltése sikertelen: ${url}`);
    }
  }
  
  public async getTexture(url: string): Promise<Texture> {
    // ... ez a függvény változatlan ...
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