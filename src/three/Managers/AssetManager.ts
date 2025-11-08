// src/three/Managers/AssetManager.ts

import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three-stdlib';
import Experience from '../Experience';
import type { ComponentConfig } from './ConfigManager';

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();

  constructor(private experience: Experience) {
    this.textureLoader = new TextureLoader();
  }

  private findObjectByBaseName(parent: Object3D, baseName: string): Object3D | undefined {
    let foundObject: Object3D | undefined = undefined;
    parent.traverse((child) => {
      if (foundObject) return;
      if (child.name.startsWith(baseName)) {
        foundObject = child;
      }
    });
    return foundObject;
  }

  // --- ÚJ, TISZTA SEGÉDFÜGGVÉNY ---
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
    // A loadModel most már a teljes betöltött jelenetet adja vissza,
    // a "kibontást" a hívó fél fogja elvégezni.
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone();
    }

    try {
      const gltf = await this.loader.loadAsync(url);
      const scene = gltf.scene; // A teljes jelenetet adjuk vissza
      
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

   

  // ######################################################################
  // ###                    ÁTALAKÍTOTT FŐ FÜGGVÉNY                     ###
  // ######################################################################
  public async buildFurniture(furnitureId: string): Promise<Group | null> {
    const config = this.experience.configManager.getFurnitureById(furnitureId);
    if (!config) {
      console.error(`Nincs ilyen bútor a konfigurációban: ${furnitureId}`);
      return null;
    }

    // 1. LÉPÉS: A bútor vizuális modelljének összeállítása, ahogy eddig is.
    const visualModelRoot = await this.loadModel(config.baseModelUrl);
    const furnitureMesh = this.findFirstMesh(visualModelRoot);

    if (!furnitureMesh) {
      console.error(`Nem található MESH objektum a(z) ${config.baseModelUrl} fájlban.`);
      return visualModelRoot;
    }

    let legHeight = 0;
    for (const slot of config.slots) {
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

    // 2. LÉPÉS: A PROXY OBJEKTUM LÉTREHOZÁSA
    // Frissítjük a mátrixokat, hogy a befoglaló doboz számítása pontos legyen.
    visualModelRoot.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(visualModelRoot);
    const center = new Vector3();
    box.getCenter(center);

    // A látható modellt eltoljuk a saját középpontjával ellentétesen.
    // Így amikor a proxy (0,0,0) pontjában van, a modell vizuálisan középen lesz.
    visualModelRoot.position.sub(center);

    // Létrehozzuk a proxyt, ami egy sima Group. Ez lesz a mozgatható objektum.
    const furnitureProxy = new Group();
    furnitureProxy.add(visualModelRoot); // A látható modellt beletesszük a proxyba.

    // A proxy pozícióját a kiszámolt középpontra állítjuk.
    // Így a bútor vizuálisan ugyanott marad, de most már a proxy irányítja.
    furnitureProxy.position.copy(center);

    // Fontos adatokat átmásolunk a proxyra, hogy a többi menedzser is elérje.
    furnitureProxy.name = `proxy_${config.id}`;
    furnitureProxy.userData.config = config;
    furnitureProxy.userData.isProxy = true; // Jelölő, hogy tudjuk, ez egy proxy.
    
    console.log(`Proxy létrehozva a(z) '${config.id}' bútorhoz. A vizuális modell eltolása:`, visualModelRoot.position);

    // A proxy-t adjuk vissza, nem a vizuális modellt!
    return furnitureProxy;
  }

  private async buildComponent(config: ComponentConfig): Promise<Object3D | null> {
    // ... (ez a függvény változatlan)
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
  
  // JAVÍTÁS: A metódus most már a visszaállított textureCache-t használja.
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