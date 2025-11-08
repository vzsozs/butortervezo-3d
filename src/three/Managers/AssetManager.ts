// src/three/Managers/AssetManager.ts

import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3 } from 'three';
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
      // ######################################################################
      // ###                  ÚJ, JOBB HELYEN LÉVŐ LOG                      ###
      // ######################################################################
      console.groupCollapsed(`--- Slot feldolgozása: '${slot.id}' ---`);

      if (slot.defaultOption && !componentState[slot.id]) {
        componentState[slot.id] = slot.defaultOption;
      }
      
      const componentIdToBuild = componentState[slot.id];
      console.log(`Építendő komponens ID: %c${componentIdToBuild}`, 'color: yellow');
      
      if (componentIdToBuild) {
        const componentConfig = this.experience.configManager.getComponentById(componentIdToBuild);
        
        if (componentConfig) {
          console.log("Megtalált config:", componentConfig);
          if (slot.id === 'leg') {
            legHeight = componentConfig.height || 0;
          }
          const newComponent = await this.buildComponent(componentConfig);
          if (!newComponent) continue;

          // A logikát kiegészítjük, hogy a 'slot.attachmentPoint'-ot is nézze.
          const attachmentNames = 
            componentConfig.attachmentPoint ? [componentConfig.attachmentPoint] : 
            slot.attachmentPoints ? slot.attachmentPoints :
            slot.attachmentPoint ? [slot.attachmentPoint] : 
            [];
          
          // ######################################################################
          // ###                  ÚJ, VÉGLEGES DETEKTÍV LOG                     ###
          // ######################################################################
          console.log(`A(z) '${slot.id}' slothoz a következő csatlakozási pontokat keressük:`, attachmentNames);

          for (const pointName of attachmentNames) {
            const attachmentPoint = this.findObjectByBaseName(furnitureMesh, pointName);
            
            if (attachmentPoint) {
              console.log(`%cTALÁLAT!%c A(z) '${pointName}' csatlakozási pont megtalálva. Komponens: '${newComponent.name}'`, 'color: lightgreen; font-weight: bold;', 'color: inherit;');
              const instance = (attachmentNames.length > 1) ? newComponent.clone() : newComponent;
              instance.position.copy(attachmentPoint.position);
              instance.rotation.copy(attachmentPoint.rotation);
              furnitureMesh.add(instance);
            } else {
              console.error(`%cHIBA!%c A(z) '${pointName}' csatlakozási pont NEM TALÁLHATÓ a(z) '${furnitureMesh.name}' modellen.`, 'color: red; font-weight: bold;', 'color: inherit;');
            }
          }
        } else {
          console.error(`HIBA: Nem található komponens a(z) '${componentIdToBuild}' ID-val!`);
        }
      }
      else {
        console.warn("Nincs építendő komponens ID ehhez a slothoz.");
     }
     console.groupEnd();
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

  public async buildComponent(config: ComponentConfig): Promise<Object3D | null> {
    console.groupCollapsed(`--- buildComponent: '${config.name}' építése ---`);
    
    if (!config.modelUrl) {
      console.error("HIBA: Nincs 'modelUrl' a komponens configjában.");
      console.groupEnd();
      return null;
    }
    
    const loadedScene = await this.loadModel(config.modelUrl);
    const componentMesh = this.findFirstMesh(loadedScene);
    if (!componentMesh) {
      console.error(`HIBA: Nem található mesh a(z) '${config.modelUrl}' fájlban.`);
      console.groupEnd();
      return null;
    }
    
    componentMesh.name = config.name;
    console.log("Mesh sikeresen betöltve és elnevezve:", componentMesh.name);

    if (config.slots && config.slots.length > 0) {
      console.log(`'${config.name}' komponensnek ${config.slots.length} db al-slotja van.`);
      for (const slot of config.slots) {
        console.log(`Al-slot feldolgozása: '${slot.id}'`);
        const subComponentId = slot.defaultOption;
        
        if (subComponentId) {
          console.log(`Építendő al-komponens ID: %c'${subComponentId}'`, 'color: yellow');
          const subComponentConfig = this.experience.configManager.getComponentById(subComponentId);
          
          if (subComponentConfig) {
            console.log("Megtalált al-komponens config:", subComponentConfig.name);
            const subComponent = await this.buildComponent(subComponentConfig);
            
            if (subComponent && slot.attachmentPoint) {
              const attachmentPoint = this.findObjectByBaseName(componentMesh, slot.attachmentPoint);
              if (attachmentPoint) {
                console.log(`%cTALÁLAT!%c Al-komponens ('${subComponent.name}') csatlakoztatása a(z) '${slot.attachmentPoint}' ponthoz.`, 'color: lightgreen; font-weight: bold;', 'color: inherit;');
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