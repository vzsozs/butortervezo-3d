// src/three/Managers/AssetManager.ts

import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three-stdlib';
import Experience from '../Experience';
import { type ComponentConfig } from '@/config/furniture';

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
      const cachedObject = this.modelCache.get(url)!;
      const clone = cachedObject.clone();

      // JAVÍTÁS: Mélyen klónozzuk az anyagokat, hogy minden példány egyedi legyen!
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
      // Az első betöltésnél a clone() már eleve új anyagokat hoz létre, de a biztonság kedvéért itt is klónozhatunk
      const firstClone = scene.clone();
      firstClone.traverse((child: Object3D) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material = child.material.clone();
        }
      });
      return firstClone;
    } catch (error) {
      console.error(`Hiba a(z) ${url} modell betöltése közben:`, error);
      return new Group();
    }
  }

  public async buildFurniture(furnitureId: string, initialState?: Record<string, string>): Promise<Group | null> {
    const config = this.experience.configManager.getFurnitureById(furnitureId);
    if (!config || !config.baseModelUrl) return null;

    const visualModelRoot = await this.loadModel(config.baseModelUrl);
    const furnitureMesh = this.findFirstMesh(visualModelRoot);
    if (!furnitureMesh) return visualModelRoot;

    furnitureMesh.name = config.id;
    
    const componentState = initialState || {};
    const materialState: Record<string, string | null> = {};

    let legHeight = 0;
    for (const slot of config.slots) {
      if (slot.defaultOption && !componentState[slot.id]) {
        componentState[slot.id] = slot.defaultOption;
      }
      
      const componentIdToBuild = componentState[slot.id];
      if (componentIdToBuild) {
        const componentConfig = this.experience.configManager.getComponentById(componentIdToBuild);
        if (componentConfig) {
          if (slot.id === 'leg') {
            legHeight = componentConfig.height || 0;
          }
          // JAVÍTÁS: Átadjuk az állapotot a komponens építőnek is!
          const newComponent = await this.buildComponent(componentConfig, componentState);
          if (!newComponent) continue;

          newComponent.name = slot.id;

          // JAVÍTÁS: Helyes prioritási sorrend a csatlakozási pontokhoz
          const attachmentNames = 
            componentConfig.attachmentPoint ? [componentConfig.attachmentPoint] :
            slot.attachmentPoints ? slot.attachmentPoints :
            slot.attachmentPoint ? [slot.attachmentPoint] :
            [];
          
          for (const pointName of attachmentNames) {
            const attachmentPoint = this.findObjectByBaseName(furnitureMesh, pointName);
            if (attachmentPoint) {
              const instance = (attachmentNames.length > 1) ? newComponent.clone() : newComponent;
              instance.position.copy(attachmentPoint.position);
              instance.rotation.copy(attachmentPoint.rotation);
              furnitureMesh.add(instance);
            }
          }
        }
      }
      materialState[slot.id] = null;
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
    
    return furnitureProxy;
  }

  public async buildComponent(config: ComponentConfig, state: Record<string, string>): Promise<Object3D | null> {
    if (!config.modelUrl) return null;
    
    const loadedScene = await this.loadModel(config.modelUrl);
    const componentMesh = this.findFirstMesh(loadedScene);
    if (!componentMesh) return null;
    
    componentMesh.name = config.name;

    if (config.slots && config.slots.length > 0) {
      for (const slot of config.slots) {
        // JAVÍTÁS: Először a state-ből próbáljuk venni az ID-t, utána a defaultot
        const subComponentId = state[slot.id] || slot.defaultOption;
        if (subComponentId) {
          const subComponentConfig = this.experience.configManager.getComponentById(subComponentId);
          if (subComponentConfig) {
            // JAVÍTÁS: Továbbadjuk az állapotot a rekurzív hívásnak
            const subComponent = await this.buildComponent(subComponentConfig, state);
            if (subComponent && slot.attachmentPoint) {
              const attachmentPoint = this.findObjectByBaseName(componentMesh, slot.attachmentPoint);
              if (attachmentPoint) {
                subComponent.position.copy(attachmentPoint.position);
                subComponent.rotation.copy(attachmentPoint.rotation);
                componentMesh.add(subComponent);
              } else {
                console.error(`%cHIBA!%c Az al-komponens csatlakozási pontja ('${slot.attachmentPoint}') NEM TALÁLHATÓ a(z) '${componentMesh.name}' modellen.`, 'color: red; font-weight: bold;', 'color: inherit;');
              }
            } else if (!slot.attachmentPoint) {
              console.error(`HIBA: A(z) '${slot.id}' al-slotnak nincs 'attachmentPoint' megadva.`);
            }
          } else {
            console.error(`HIBA: Nem található al-komponens a(z) '${subComponentId}' ID-val!`);
          }
        }
      }
    } else {
      console.log(`'${config.name}' komponensnek nincsenek al-slotjai.`);
    }
    
    console.groupEnd();
    return componentMesh;
  }

  
  public getTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      if (this.textureCache.has(url)) {
        resolve(this.textureCache.get(url)!);
        return;
      }
      
      this.textureLoader.load(
        url, 
        (texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.wrapS = RepeatWrapping;
          texture.wrapT = RepeatWrapping;
          this.textureCache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Hiba a(z) ${url} textúra betöltése közben:`, error);
          reject(error);
        }
      );
    });
  }
}