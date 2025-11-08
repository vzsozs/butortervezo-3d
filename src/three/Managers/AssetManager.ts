import { Mesh, Group, TextureLoader, Texture, Object3D, SRGBColorSpace, RepeatWrapping, Vector3 } from 'three';
import { GLTFLoader } from 'three-stdlib';
import Experience from '../Experience';
import type { ComponentConfig } from './ConfigManager';

export default class AssetManager {
  private textureLoader: TextureLoader;
  // JAVÍTÁS: Visszaállítottuk a textureCache property-t.
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private loader = new GLTFLoader();

  constructor(private experience: Experience) {
    this.textureLoader = new TextureLoader();
  }

  // --- ÚJ SEGÉDFÜGGVÉNY ---
  /**
   * Megkeres egy objektumot a szülőjén belül a neve kezdete alapján.
   * Figyelmen kívül hagyja az exportáló által hozzáadott "_001" és hasonló utótagokat.
   * @param parent Az objektum, amiben keresünk.
   * @param baseName A név, amivel a keresett objektum nevének kezdődnie kell.
   * @returns A talált Object3D, vagy undefined, ha nincs találat.
   */

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

   // --- ÚJ, RÉSZLETES DIAGNOSZTIKAI FÜGGVÉNY ---
  private logTransformations(
    parentObj: Object3D, 
    dummyObj: Object3D, 
    componentObj: Object3D, 
    slotId: string
  ) {
    console.groupCollapsed(`DIAGNOSZTIKA: '${componentObj.name}' csatlakoztatása a(z) '${slotId}' slot-hoz`);

    const formatPos = (v: Vector3) => `x:${v.x.toFixed(3)}, y:${v.y.toFixed(3)}, z:${v.z.toFixed(3)}`;
    
    const parentWorldPos = new Vector3();
    parentObj.getWorldPosition(parentWorldPos);
    console.log(`%cSZÜLŐ (ahova csatolunk): ${parentObj.name}`, 'font-weight: bold;', {
      "Szülőjének neve": parentObj.parent?.name || 'NINCS',
      "Lokális Pozíció": formatPos(parentObj.position),
      "Világ Pozíció": formatPos(parentWorldPos),
    });

    const dummyWorldPos = new Vector3();
    dummyObj.getWorldPosition(dummyWorldPos);
    console.log(`%cCSATLAKOZÁSI PONT: ${dummyObj.name}`, 'font-weight: bold;', {
      "Szülőjének neve": dummyObj.parent?.name || 'NINCS',
      "Lokális Pozíció": formatPos(dummyObj.position),
      "Világ Pozíció": formatPos(dummyWorldPos),
    });

    console.log(`%cKOMPONENS (csatolás előtt): ${componentObj.name}`, 'font-weight: bold;', {
      "Lokális Pozíció": formatPos(componentObj.position),
    });

    // Szimuláljuk a transzformációt
    const finalLocalPos = new Vector3();
    dummyObj.getWorldPosition(finalLocalPos);
    parentObj.worldToLocal(finalLocalPos);

    console.log(`%cSZÁMÍTÁS: A dummy világpozíciója a szülő lokális terében: ${formatPos(finalLocalPos)}`, 'color: cyan');
    
    console.groupEnd();
  }


    public async buildFurniture(furnitureId: string): Promise<Group | null> {
    const config = this.experience.configManager.getFurnitureById(furnitureId);
    if (!config) {
      console.error(`Nincs ilyen bútor a konfigurációban: ${furnitureId}`);
      return null;
    }

    const loadedScene = await this.loadModel(config.baseModelUrl);
    const furnitureGroup = this.findFirstMesh(loadedScene);

    if (!furnitureGroup) {
      console.error(`Nem található MESH objektum a(z) ${config.baseModelUrl} fájlban.`);
      return loadedScene;
    }

    furnitureGroup.name = config.id;
    furnitureGroup.userData.config = config;

    let legHeight = 0; // Változó a láb magasságának tárolására

    for (const slot of config.slots) {
      const componentConfig = this.experience.configManager.getComponentById(slot.defaultOption);
      if (componentConfig) {
        if (slot.id === 'leg') {
          legHeight = componentConfig.height || 0;

          console.log(`Láb komponens ('${slot.defaultOption}') magassága az adatbázisból: ${componentConfig.height}m. A bútor ennyivel lesz megemelve: ${legHeight}m`);
        }
        const component = await this.buildComponent(componentConfig);
        if (!component) continue;
        
        const attachmentNames = slot.attachmentPoints || (slot.attachmentPoint ? [slot.attachmentPoint] : []);

        // 2. Végigmegyünk a listán, és minden ponthoz létrehozunk egy komponenst.
        for (const pointName of attachmentNames) {
          const component = await this.buildComponent(componentConfig);
          if (!component) continue;
          
          const attachmentPoint = this.findObjectByBaseName(furnitureGroup, pointName);
          
          if (attachmentPoint) {
            component.position.copy(attachmentPoint.position);
            component.rotation.copy(attachmentPoint.rotation);
            furnitureGroup.add(component);
          } else {
            console.warn(`Nem található a(z) '${pointName}' csatlakozási pont a(z) '${furnitureGroup.name}' modellen.`);
            furnitureGroup.add(component);
          }
        }
      }
    }
    // --- RÉSZLETES DIAGNOSZTIKAI LOG A VÉGÉN ---
  console.groupCollapsed(`DIAGNOSZTIKA: Véglegesítés - ${config.id}`);

  console.log(`SZÁMÍTOTT LÁBMAGASSÁG: ${legHeight}`);

  console.log("Módosítás ELŐTT:", {
    "loadedScene neve": loadedScene.name,
    "loadedScene pozíciója": loadedScene.position.clone(),
    "furnitureGroup neve": furnitureGroup.name,
    "furnitureGroup pozíciója": furnitureGroup.position.clone(),
  });

  // Itt történik a módosítási kísérlet
  loadedScene.position.y = legHeight;

  console.log("Módosítás UTÁN:", {
    "loadedScene pozíciója": loadedScene.position.clone(),
  });

  console.groupEnd();
  // --- LOG VÉGE ---

  return loadedScene;
  }

   private async buildComponent(config: ComponentConfig): Promise<Object3D | null> {
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

    loadedScene.updateMatrixWorld(true);

    if (config.slots && config.slots.length > 0) {
      for (const slot of config.slots) {
        const subComponentConfig = this.experience.configManager.getComponentById(slot.defaultOption);
        if (subComponentConfig) {
          // --- EZ A JAVÍTOTT RÉSZ, UGYANAZ, MINT A BUILDFURNITURE-BEN ---
          const attachmentNames = slot.attachmentPoints || (slot.attachmentPoint ? [slot.attachmentPoint] : []);

          for (const pointName of attachmentNames) {
            const subComponent = await this.buildComponent(subComponentConfig);
            if (!subComponent) continue;
            
            // A 'pointName' itt már garantáltan 'string'.
            const attachmentPoint = this.findObjectByBaseName(componentMesh, pointName);

            if (attachmentPoint) {
              subComponent.position.copy(attachmentPoint.position);
              subComponent.rotation.copy(attachmentPoint.rotation);
              componentMesh.add(subComponent);
            } else {
              console.warn(`Nem található a(z) '${pointName}' csatlakozási pont a(z) '${config.name}' modellen.`);
              componentMesh.add(subComponent);
            }
          }
        }
      }
    }

    // JAVÍTÁS: A végén a "kibontott" Mesht adjuk vissza, nem a teljes jelenetet!
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