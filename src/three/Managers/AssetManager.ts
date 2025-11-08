// src/three/Managers/AssetManager.ts

import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three-stdlib';
import Experience from '../Experience';
// JAVÍTÁS: A típusokat a központi helyről importáljuk
import type { ComponentConfig } from '@/config/furniture';

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();

  constructor(private experience: Experience) {
    this.textureLoader = new TextureLoader();
  }

  public findObjectByBaseName(parent: Object3D, baseName: string): Object3D | undefined {
    let foundObject: Object3D | undefined = undefined;
    parent.traverse((child) => {
      if (foundObject) return;
      if (child.name.startsWith(baseName)) {
        foundObject = child;
      }
    });
    return foundObject;
  }

  private findFirstMesh(parent: Object3D): Mesh | undefined {
    let foundMesh: Mesh | undefined = undefined;
    parent.traverse((child) => {
      if (!foundMesh && child instanceof Mesh) {
        foundMesh = child;
      }
    });
    return foundMesh;
  }

  private async loadModel(url: string): Promise<Group> {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone();
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
      return scene.clone();
    } catch (error) {
      console.error(`Hiba a(z) ${url} modell betöltése közben:`, error);
      return new Group();
    }
  }

  public async buildFurniture(furnitureId: string): Promise<Group | null> {
    const config = this.experience.configManager.getFurnitureById(furnitureId);
    if (!config) {
      console.error(`Nincs ilyen bútor a konfigurációban: ${furnitureId}`);
      return null;
    }

    if (!config.baseModelUrl) {
      console.error(`A(z) '${config.id}' bútor konfigurációjában HIÁNYZIK a 'baseModelUrl' mező!`);
      return null;
    }

    const visualModelRoot = await this.loadModel(config.baseModelUrl);
    const furnitureMesh = this.findFirstMesh(visualModelRoot);

    if (!furnitureMesh) {
      console.error(`Nem található MESH objektum a(z) ${config.baseModelUrl} fájlban.`);
      return visualModelRoot;
    }

    furnitureMesh.name = config.id;

    furnitureMesh.userData.config = config;
    // ÚJ: Létrehozzuk az állapot tárolót
    const componentState: Record<string, string> = {};
    const materialState: Record<string, string | null> = {};

    let legHeight = 0;
    for (const slot of config.slots) {
      componentState[slot.id] = slot.defaultOption;
      materialState[slot.id] = null; 
      const componentConfig = this.experience.configManager.getComponentById(slot.defaultOption);
      if (componentConfig) {
        if (slot.id === 'leg') {
          legHeight = componentConfig.height || 0;
        }
        const attachmentNames = slot.attachmentPoints || (slot.attachmentPoint ? [slot.attachmentPoint] : []);
        for (const pointName of attachmentNames) {
          const component = await this.buildComponent(componentConfig);
          if (!component) continue;
          const attachmentPoint = this.findObjectByBaseName(furnitureMesh, pointName);
          if (attachmentPoint) {
            component.position.copy(attachmentPoint.position);
            component.rotation.copy(attachmentPoint.rotation);
            furnitureMesh.add(component);
          } else {
            furnitureMesh.add(component);
          }
        }
      }
    }
    visualModelRoot.position.y = legHeight;

    visualModelRoot.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(visualModelRoot);
    const center = new Vector3();
    box.getCenter(center);
    visualModelRoot.position.sub(center);
    const furnitureProxy = new Group();
    furnitureProxy.add(visualModelRoot);
    furnitureProxy.position.copy(center);
    furnitureProxy.name = `proxy_${config.id}`;
    furnitureProxy.userData.config = config;
    furnitureProxy.userData.isProxy = true;
    furnitureProxy.userData.componentState = componentState;
    furnitureProxy.userData.materialState = materialState;
    
    console.log(`Proxy létrehozva a(z) '${config.id}' bútorhoz.`, { state: componentState });
    return furnitureProxy;
  }

  public async buildComponent(config: ComponentConfig): Promise<Object3D | null> {
    if (!config.modelUrl) {
      console.error(`A(z) '${config.name}' komponensnek nincs modelUrl-je.`);
      return null;
    }
    const loadedScene = await this.loadModel(config.modelUrl);
    const componentMesh = this.findFirstMesh(loadedScene);
    if (!componentMesh) {
      console.error(`Nem található MESH objektum a(z) ${config.modelUrl} fájlban.`);
      return null;
    }
    componentMesh.name = config.name;
    componentMesh.userData.config = config;
    if (config.slots && config.slots.length > 0) {
      for (const slot of config.slots) {
        const subComponentConfig = this.experience.configManager.getComponentById(slot.defaultOption);
        if (subComponentConfig) {
          const attachmentNames = slot.attachmentPoints || (slot.attachmentPoint ? [slot.attachmentPoint] : []);
          for (const pointName of attachmentNames) {
            const subComponent = await this.buildComponent(subComponentConfig);
            if (!subComponent) continue;
            const attachmentPoint = this.findObjectByBaseName(componentMesh, pointName);
            if (attachmentPoint) {
              subComponent.position.copy(attachmentPoint.position);
              subComponent.rotation.copy(attachmentPoint.rotation);
              componentMesh.add(subComponent);
            } else {
              componentMesh.add(subComponent);
            }
          }
        }
      }
    }
    return componentMesh;
  }
  
  public getTexture(url: string, callback: (texture: Texture) => void) {
    if (this.textureCache.has(url)) {
      callback(this.textureCache.get(url)!);
      return;
    }
    this.textureLoader.load(url, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      this.textureCache.set(url, texture);
      callback(texture);
    });
  }
}