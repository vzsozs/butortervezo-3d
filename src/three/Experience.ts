// src/three/Experience.ts

// =================================================================
// === EZ AZ ÚJ, REFAKTORÁLT EXPERIENCE OSZTÁLY =====================
// =================================================================
// Ez az osztály most már egy "karmester" (singleton), ami
// összefogja a különálló, egy-egy feladatért felelős modulokat
// (Sizes, Camera, Renderer, World) és a magas szintű logikát.
// =================================================================

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
  public assetManager!: AssetManager;
  public placementManager!: PlacementManager;
  public interactionManager!: InteractionManager;
  public stateManager!: StateManager;
  public debugManager!: DebugManager;
  
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
    this.assetManager = new AssetManager(this);
    this.placementManager = new PlacementManager(this);
    this.interactionManager = new InteractionManager(this);
    this.stateManager = new StateManager(this);
    this.debugManager = new DebugManager(this);

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
    this.debugManager.logSeparator('ÚJRAÉPÍTÉS FOLYAMAT');
    this.debugManager.logObjectState('1. Régi objektum állapota (induláskor)', rawOldObject);

    const { config, propertyState, materialState } = rawOldObject.userData;
    if (!config) return null;

    const newObject = await this.assetManager.buildFurnitureFromConfig(config, newComponentState, propertyState);
    
    newObject.position.copy(rawOldObject.position);
    newObject.rotation.copy(rawOldObject.rotation);
    newObject.userData.materialState = JSON.parse(JSON.stringify(materialState));
    
    this.debugManager.logObjectState('2. Új objektum állapota (összerakás után, anyagok előtt)', newObject);
    
    await this.stateManager.applyMaterialsToObject(newObject);
    this.debugManager.logObjectState('3. Új objektum állapota (anyagok alkalmazása után)', newObject);

    // Objektumok cseréje a jelenetben és a store-ban
    this.scene.remove(rawOldObject);
    this.experienceStore.replaceObject(rawOldObject.uuid, newObject);
    this.scene.add(newObject);
    
    // =================================================================
    // === JAVÍTÁS: A kiválasztás állapotának frissítése az új objektumra
    // =================================================================
    // Miután lecseréltük az objektumot, a kiválasztást is át kell irányítanunk
    // az új objektumra, hogy a TransformControls és a SelectionStore konzisztens maradjon.
    this.selectionStore.selectObject(newObject);
    this.camera.transformControls.attach(newObject);
    this.debug.selectionBoxHelper.setFromObject(newObject);
    this.debug.selectionBoxHelper.visible = true;
    // =================================================================
    
    this.updateTotalPrice();
    // A historyStore-t nem kell itt hívni, mert a Vue komponens, ami a rebuild-ot
    // indította, felelős az új állapot mentéséért.
    
    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    const rawObjectToRemove = toRaw(objectToRemove);
    // @ts-expect-error - object is a private property but we need to access it
    const attachedObject = this.camera.transformControls.object;
    if (attachedObject && toRaw(attachedObject) === rawObjectToRemove) {
      this.camera.transformControls.detach();
      this.selectionStore.clearSelection();
      this.debug.selectionBoxHelper.visible = false;
    }
    this.scene.remove(rawObjectToRemove);
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
    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.removeObject(obj);
    }
    this.experienceStore.updatePlacedObjects([]);
    this.rulerElements.clear();
    this.selectionStore.clearSelection();
    this.camera.transformControls.detach();
    this.debug.selectionBoxHelper.visible = false;
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