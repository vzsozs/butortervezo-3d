// src/three/Experience.ts

import { toRaw } from 'vue';
import { Scene, Clock, Raycaster, Vector2, Object3D, Group, Mesh, PlaneGeometry, AmbientLight, DirectionalLight } from 'three';

// Új, moduláris komponensek importálása
import Sizes from './Utils/Sizes';
import Camera from './Camera';
import Renderer from './Renderer';
import World from './World/World';

// Manager importok (a ConfigManager már a globális singleton)
import ConfigManager from './Managers/ConfigManager';
import AssetManager from './Managers/AssetManager';
import PlacementManager from './Managers/PlacementManager';
import InteractionManager from './Managers/InteractionManager';
import StateManager from './Managers/StateManager';
import DebugManager from './Managers/DebugManager';
import Debug from './Utils/Debug';

// Store importok
import { useExperienceStore } from '@/stores/experience';
import { useSelectionStore } from '@/stores/selection';
import { useSettingsStore } from '@/stores/settings';
import { useHistoryStore, type SceneState } from '@/stores/history';

// A Singleton példány tárolása a modul szintjén
let instance: Experience | null = null;

export default class Experience {
  public canvas!: HTMLDivElement;
  public scene!: Scene;
  private clock!: Clock;

  // Új, moduláris property-k
  public sizes!: Sizes;
  public camera!: Camera;
  public renderer!: Renderer;
  public world!: World;
  public debug!: Debug;

  // Interakcióhoz szükséges property-k
  public raycaster!: Raycaster;
  public mouse = new Vector2();
  public intersectableObjects: Object3D[] = [];
  public rulerElements!: Group;

  // Managerek és Store-ok
  public configManager = ConfigManager; // A globális singleton példány használata
  public assetManager = AssetManager.getInstance();
  public placementManager!: PlacementManager;
  public interactionManager!: InteractionManager;
  public stateManager!: StateManager;
  public debugManager = DebugManager.getInstance(); 
  
  public experienceStore = useExperienceStore();
  public selectionStore = useSelectionStore();
  public settingsStore = useSettingsStore();
  public historyStore = useHistoryStore();

  private constructor(canvas: HTMLDivElement) {
    // Singleton minta érvényesítése
    if (instance) {
      return instance;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;

    // Alapvető Three.js elemek
    this.canvas = canvas;
    this.scene = new Scene();
    this.clock = new Clock();
    this.raycaster = new Raycaster();

    // Modulok inicializálása
    this.sizes = new Sizes();
    this.camera = new Camera();
    this.renderer = new Renderer();
    this.world = new World(this.scene);
    this.debug = new Debug(this.scene);

    // Magas szintű Managerek inicializálása
    //this.assetManager = new AssetManager(this);
    this.placementManager = new PlacementManager(this);
    this.interactionManager = new InteractionManager(this);
    this.stateManager = new StateManager(this);
    //this.debugManager = new DebugManager(this);

    // Jelenet specifikus elemek
    this.rulerElements = new Group();
    this.scene.add(this.rulerElements);
    const floor = this.scene.children.find(c => c instanceof Mesh && c.geometry instanceof PlaneGeometry);
    if (floor) this.intersectableObjects.push(floor);

    // Eseményfigyelők beállítása
    this.sizes.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onPointerMove);
    this.setupTransformControlsListeners();

    // A historyStore első állapotának mentése, miután minden felállt
    this.historyStore.addState();

    // Az update ciklus elindítása
    this.update();
  }

  // Statikus metódus a singleton példány elérésére/létrehozására
  public static getInstance(canvas?: HTMLDivElement): Experience {
    if (!instance && canvas) {
      instance = new Experience(canvas);
    } else if (!instance && !canvas) {
      throw new Error("Experience has not been initialized yet. Provide a canvas element.");
    }
    return instance!;
  }

  // --- ESEMÉNYKEZELŐK ---

  private onResize = () => {
    this.camera.onResize();
    this.renderer.onResize();
  }

  private onPointerMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }
  
  private setupTransformControlsListeners() {
    // @ts-expect-error - event listeners are not fully typed
    this.camera.transformControls.addEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - event listeners are not fully typed
    this.camera.transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
  }

  private onObjectChange = () => {
    // @ts-expect-error - dragging is a private property but we need to check it
    if (!this.camera.transformControls.dragging) return;
    const selectedObject = this.selectionStore.selectedObject;
    if (!selectedObject) return;
    const objectsToCompare = this.experienceStore.placedObjects.filter(obj => obj.uuid !== selectedObject.uuid);
    const finalPosition = this.placementManager.calculateFinalPosition(selectedObject, selectedObject.position, objectsToCompare);
    selectedObject.position.copy(finalPosition);
    this.debug.selectionBoxHelper.setFromObject(selectedObject);
  }

  private onDraggingChanged = (event: { value: boolean }) => {
    this.camera.controls.enabled = !event.value;
    if (event.value) {
      this.interactionManager.handleTransformStart();
    } else {
      this.interactionManager.handleTransformEnd();
      this.debug.hideAll();
    }
  }

  public async updateGlobalMaterials() {
    const globalMaterials = this.settingsStore.globalMaterialSettings;
    
    for (const object of this.experienceStore.placedObjects) {
      let needsUpdate = false;
      const materialState = object.userData.materialState || {};
      const config = object.userData.config;

      if (!config) continue;

      for (const slot of config.componentSlots) {
        const slotId = slot.slotId;

        for (const [globalTarget, materialId] of Object.entries(globalMaterials)) {
            if (slotId.includes(globalTarget) && materialState[slotId] !== materialId) {
                materialState[slotId] = materialId;
                needsUpdate = true;
            }
        }
      }

      if (needsUpdate) {
        object.userData.materialState = materialState;
        await this.stateManager.applyMaterialsToObject(object);
      }
    }
  }

  public async updateGlobalStyles() {
    const globalStyles = this.settingsStore.globalStyleSettings;
    const objectsToUpdate = [...this.experienceStore.placedObjects];

    console.log('[Experience] Globális stílusok frissítése...', globalStyles);

    for (const object of objectsToUpdate) {
      let needsRebuild = false;
      
      // Fontos: Másolatot készítünk, hogy ne a reaktív objektumot módosítsuk közvetlenül
      const componentState = JSON.parse(JSON.stringify(object.userData.componentState || {}));
      const config = object.userData.config;

      if (!config) continue;

      // Végigmegyünk a bútor összes definiált slotján (front_1, leg_1, handle_1...)
      for (const slot of config.componentSlots) {
        const slotId = slot.slotId; // pl. "front_1"

        // Megnézzük, hogy van-e erre a típusra globális beállítás
        // Pl. ha slotId="front_1", akkor keressük a "front" kulcsot a globálisokban
        for (const [globalTarget, newComponentId] of Object.entries(globalStyles)) {
            
            // HA a slot ID tartalmazza a kulcsot (pl. "front_1" tartalmazza "front")
            // ÉS az érték különbözik
            if (slotId.includes(globalTarget) && componentState[slotId] !== newComponentId) {
                console.log(`   -> Frissítés: ${slotId} = ${newComponentId}`);
                componentState[slotId] = newComponentId;
                needsRebuild = true;
            }
        }
      }

      if (needsRebuild) {
        // Töröljük a hibásan bekerült kulcsokat (pl. "front", "leg") ha vannak
        // Csak a valódi slot ID-k maradhatnak
        const cleanState: Record<string, string> = {};
        config.componentSlots.forEach((slot: any) => {
            if (componentState[slot.slotId]) {
                cleanState[slot.slotId] = componentState[slot.slotId];
            }
        });

        object.userData.componentState = cleanState;
        await this.rebuildObject(object, cleanState);
      }
    }
  }

  public toggleFrontVisibility(isVisible: boolean) {
    this.experienceStore.placedObjects.forEach((object) => {
      // A userData.componentState-ben tároljuk, mi van a slotokban
      const componentState = object.userData.componentState;
      if (!componentState) return;

      // Megkeressük a front-hoz tartozó alkatrészeket
      // Feltételezzük, hogy a slotId tartalmazza a "front" szót (pl. "front_1", "drawer_front")
      // VAGY a configban jelölve van. 
      // Egyszerűsített megoldás: A "front" nevű slotokat keressük.
      
      object.traverse((child) => {
        // Az AssetManager általában a slotId-t adja a Group nevének vagy userData-nak
        // Itt egy általánosabb megoldás kellhet, de kezdjük ezzel:
        if (child.userData.slotId && child.userData.slotId.includes('front')) {
            child.visible = isVisible;
        }
      });
    });
  }

  // --- FŐ UPDATE CIKLUS ---

  private update = () => {
    requestAnimationFrame(this.update);
    this.camera.update();
    this.renderer.update();
  }

  // --- MAGAS SZINTŰ ALKALMAZÁS LOGIKA ---
  // Ezek a metódusok a régi Experience osztályból lettek átemelve és adaptálva.

  public addObjectToScene(newObject: Group) {
    this.scene.add(newObject);
    this.experienceStore.addObject(newObject);
    this.updateTotalPrice();
    this.historyStore.addState();
  }

  public async loadState(state: SceneState) {
    console.log("[Experience] Állapot betöltése...", state);
    this.camera.transformControls.detach();
    this.selectionStore.clearSelection();
    this.debug.selectionBoxHelper.visible = false;

    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.scene.remove(toRaw(obj));
    }
    this.experienceStore.updatePlacedObjects([]);

    for (const objState of state) {
      const config = this.configManager.getFurnitureById(objState.configId);
      if (config) {
        const newObject = await this.assetManager.buildFurnitureFromConfig(
          config,
          objState.componentState,
          objState.propertyState
        );
        newObject.position.fromArray(objState.position);
        newObject.rotation.fromArray(objState.rotation as [number, number, number]);
        newObject.userData.materialState = objState.materialState;
        
        await this.stateManager.applyMaterialsToObject(newObject);

        this.scene.add(newObject);
        this.experienceStore.addObject(newObject);
      }
    }
    this.updateTotalPrice();
    console.log("[Experience] Állapot betöltve.");
  }

  public async rebuildObject(oldObject: Group, newComponentState: Record<string, string>): Promise<Group | null> {
    const rawOldObject = toRaw(oldObject);
    
    const { config, propertyState, materialState } = rawOldObject.userData;
    if (!config) return null;

    // 1. Megjegyezzük, hogy ez volt-e a kiválasztott objektum
    const wasSelected = this.selectionStore.selectedObject?.uuid === rawOldObject.uuid;

    // 2. HA kiválasztott volt, azonnal lecsatoljuk a TransformControls-t!
    // Ez akadályozza meg a "must be part of scene graph" hibát.
    if (wasSelected) {
        this.camera.transformControls.detach();
        this.debug.selectionBoxHelper.visible = false;
    }

    // 3. Új objektum építése
    const newObject = await this.assetManager.buildFurnitureFromConfig(config, newComponentState, propertyState);
    
    // Pozíció és forgatás másolása
    newObject.position.copy(rawOldObject.position);
    newObject.rotation.copy(rawOldObject.rotation);
    
    // Anyagok átmentése
    newObject.userData.materialState = JSON.parse(JSON.stringify(materialState));
    await this.stateManager.applyMaterialsToObject(newObject);

    // 4. CSERE A SCENE-BEN
    this.scene.remove(rawOldObject);
    this.scene.add(newObject);
    
    // 5. CSERE A STORE-BAN
    this.experienceStore.replaceObject(rawOldObject.uuid, newObject);

    // 6. VISSZACSATOLÁS
    // Ha az előbb lecsatoltuk, most rátesszük az újra
    if (wasSelected) {
        this.selectionStore.selectObject(newObject);
        this.debug.selectionBoxHelper.setFromObject(newObject);
        this.debug.selectionBoxHelper.visible = true;
        this.camera.transformControls.attach(newObject);
    }
    
    this.updateTotalPrice();
    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    const rawObjectToRemove = toRaw(objectToRemove);
    
    // 1. Ellenőrizzük, hogy a TransformControls ezen az objektumon van-e
    // @ts-expect-error - object is private
    const attachedObject = this.camera.transformControls.object;
    
    if (attachedObject && toRaw(attachedObject).uuid === rawObjectToRemove.uuid) {
      this.camera.transformControls.detach();
      this.selectionStore.clearSelection();
      this.debug.selectionBoxHelper.visible = false;
    }

    // 2. Törlés a Scene-ből
    this.scene.remove(rawObjectToRemove);
    
    // 3. Törlés a Store-ból
    const allObjects = this.experienceStore.placedObjects.slice();
    const index = allObjects.findIndex(obj => obj.uuid === rawObjectToRemove.uuid);
    if (index > -1) {
      allObjects.splice(index, 1);
      this.experienceStore.updatePlacedObjects(allObjects);
    }

    this.updateTotalPrice();
    this.historyStore.addState();
  }

  public newScene() {
    console.log("[Experience] Új jelenet létrehozása...");
    
    // 1. Objektumok törlése
    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.removeObject(obj);
    }
    this.experienceStore.updatePlacedObjects([]);
    
    // 2. Vonalzó és egyéb elemek takarítása
    this.rulerElements.clear();
    
    // 3. Kijelölés törlése
    this.selectionStore.clearSelection();
    this.camera.transformControls.detach();
    
    // 4. DEBUG DOBOZOK ELTÜNTETÉSE (Ez hiányzott!)
    this.debug.hideAll();

    // 5. Store-ok resetelése
    this.settingsStore.resetToDefaults();
    this.historyStore.clearHistory();
    this.historyStore.addState();
    
    console.log("[Experience] Jelenet sikeresen visszaállítva.");
  }

  public updateTotalPrice() {
    this.experienceStore.calculateTotalPrice();
  }

  public getScreenshotCanvas(): HTMLCanvasElement | undefined {
    try {
      const screenshotScene = new Scene();
      screenshotScene.background = this.scene.background;
      this.scene.traverse((child) => {
        const rawChild = toRaw(child);
        if (rawChild instanceof AmbientLight || rawChild instanceof DirectionalLight) {
          screenshotScene.add(rawChild.clone());
        }
      });
      for (const proxyObject of this.experienceStore.placedObjects) {
        const rawObject = toRaw(proxyObject);
        screenshotScene.add(rawObject.clone());
      }
      this.renderer.instance.render(screenshotScene, this.camera.instance);
      return this.renderer.instance.domElement;
    } catch (error) {
      console.error("[Experience] Hiba a screenshot canvas előkészítése közben:", error);
      return undefined;
    }
  }

  // --- TAKARÍTÁS ---

  public destroy() {
    // Eseményfigyelők eltávolítása
    this.sizes.destroy();
    window.removeEventListener('mousemove', this.onPointerMove);
    this.interactionManager.removeEventListeners();
    // @ts-expect-error - a
    this.camera.transformControls.removeEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - a
    this.camera.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);

    // Modulok megsemmisítése
    this.camera.destroy();
    this.renderer.destroy();
    
    // Three.js objektumok felszabadítása
    this.scene.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          Object.values(material).forEach((value: unknown) => {
            if (value && typeof (value as { dispose?: () => void }).dispose === 'function') {
              (value as { dispose: () => void }).dispose();
            }
          });
        }
      }
    });

    // Singleton példány nullázása
    instance = null;
    console.log("Experience destroyed");
  }
}