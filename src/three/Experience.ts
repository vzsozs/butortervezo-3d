// src/three/Experience.ts
import { toRaw } from 'vue';
// JAVÍTÁS: A felesleges EulerOrder import eltávolítva
import { Scene, AmbientLight, DirectionalLight, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Object3D, Group, Clock, Mesh, PlaneGeometry } from 'three';
import { OrbitControls } from 'three-stdlib';
import { TransformControls } from 'three-stdlib';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useExperienceStore } from '@/stores/experience'; 
import { useSelectionStore } from '@/stores/selection';
import { useSettingsStore } from '@/stores/settings';
import { useHistoryStore, type SceneState } from '@/stores/history';
import ConfigManager from './Managers/ConfigManager';
import World from './World/World';
import Debug from './Utils/Debug';
import AssetManager from './Managers/AssetManager';
import PlacementManager from './Managers/PlacementManager';
import InteractionManager from './Managers/InteractionManager';
import StateManager from './Managers/StateManager';
import DebugManager from './Managers/DebugManager'; // <-- ÚJ IMPORT

export default class Experience {
  // ... a property-k (canvas, scene, stb.) változatlanok ...
  public canvas: HTMLDivElement;
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer;
  public labelRenderer: CSS2DRenderer;
  public rulerElements: Group;
  private clock: Clock;
  public configManager: ConfigManager;
  public controls: OrbitControls;
  public transformControls: TransformControls;
  public raycaster: Raycaster;
  public mouse = new Vector2();
  public intersectableObjects: Object3D[] = [];
  public selectionStore = useSelectionStore();
  public settingsStore = useSettingsStore();
  public experienceStore = useExperienceStore();
  public historyStore = useHistoryStore();
  public world: World;
  public debug: Debug;
  public assetManager: AssetManager;
  public placementManager: PlacementManager;
  public interactionManager: InteractionManager;
  public stateManager: StateManager;
  public debugManager: DebugManager; // <-- ÚJ PROPERTY

  private constructor(canvas: HTMLDivElement) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 2, 3);
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.canvas.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.canvas.appendChild(this.labelRenderer.domElement);
    this.clock = new Clock();
    this.raycaster = new Raycaster();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.transformControls);
    this.configManager = new ConfigManager();
    this.debug = new Debug(this.scene);
    this.world = new World(this.scene);
    this.assetManager = new AssetManager(this);
    this.placementManager = new PlacementManager(this);
    this.interactionManager = new InteractionManager(this);
    this.stateManager = new StateManager(this);
    this.debugManager = new DebugManager(this);
    this.rulerElements = new Group();
    this.scene.add(this.rulerElements);
    const floor = this.scene.children.find(c => c instanceof Mesh && c.geometry instanceof PlaneGeometry);
    if (floor) this.intersectableObjects.push(floor);
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('mousemove', this.onPointerMove);
    this.setupTransformControlsListeners();
    this.animate();
  }

  public static async create(canvas: HTMLDivElement): Promise<Experience> {
    const experience = new Experience(canvas);
    await experience.configManager.loadData();
    experience.historyStore.addState();
    return experience;
  }

  public addObjectToScene(newObject: Group) {
    this.scene.add(newObject);
    this.experienceStore.addObject(newObject);
    this.updateTotalPrice();
    this.historyStore.addState();
  }

  public async loadState(state: SceneState) {
    console.log("[Experience] Állapot betöltése...", state);
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

  public async rebuildObject(oldObject: Group): Promise<Group | null> {
    const rawOldObject = toRaw(oldObject);
    console.groupCollapsed(`--- [Experience.rebuildObject] Átépítés kezdődik ---`);
    
    // JAVÍTÁS: A TypeScript hiba elnyomása
    // @ts-expect-error - object is a private property but we need to access it
    if (this.transformControls.object === rawOldObject) {
      this.transformControls.detach();
    }

    const { config, componentState, propertyState, materialState } = rawOldObject.userData;
    if (!config) {
      console.error("Hiba: A régi objektumnak nincs configja!");
      console.groupEnd();
      return null;
    }

    const newObject = await this.assetManager.buildFurnitureFromConfig(config, componentState, propertyState);
    
    newObject.position.copy(rawOldObject.position);
    newObject.rotation.copy(rawOldObject.rotation);
    newObject.userData.materialState = materialState;
    
    await this.stateManager.applyMaterialsToObject(newObject);

    this.scene.remove(rawOldObject);
    this.scene.add(newObject);
    this.experienceStore.replaceObject(rawOldObject.uuid, newObject);

    if (this.selectionStore.selectedObject?.uuid === rawOldObject.uuid) {
      this.selectionStore.selectObject(newObject);
      this.transformControls.attach(toRaw(newObject));
    }

    this.updateTotalPrice();
    console.groupEnd();
    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    const rawObjectToRemove = toRaw(objectToRemove);
    // JAVÍTÁS: A TypeScript hiba elnyomása
    // @ts-expect-error - object is a private property but we need to access it
    const attachedObject = this.transformControls.object;
    if (attachedObject && toRaw(attachedObject) === rawObjectToRemove) {
      this.transformControls.detach();
      this.selectionStore.clearSelection();
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

  // ... a többi függvény (newScene, getScreenshotCanvas, onWindowResize, stb.) változatlan ...
  // A teljesség kedvéért idemásolom őket, de nem változtak.
  public newScene() {
    console.log("[Experience] Új jelenet létrehozása...");
    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.removeObject(obj);
    }
    this.experienceStore.updatePlacedObjects([]);
    this.rulerElements.clear();
    this.selectionStore.clearSelection();
    this.transformControls.detach();
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
      this.renderer.render(screenshotScene, this.camera);
      return this.renderer.domElement;
    } catch (error) {
      console.error("[Experience] Hiba a screenshot canvas előkészítése közben:", error);
      return undefined;
    }
  }

  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  private onPointerMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  private onObjectChange = () => {
    // JAVÍTÁS: A TypeScript hiba elnyomása
    // @ts-expect-error - dragging is a private property but we need to check it
    if (!this.transformControls.dragging) return;
    const selectedObject = this.selectionStore.selectedObject;
    if (!selectedObject) return;
    const objectsToCompare = this.experienceStore.placedObjects.filter(obj => obj.uuid !== selectedObject.uuid);
    const finalPosition = this.placementManager.calculateFinalPosition(selectedObject, selectedObject.position, objectsToCompare);
    selectedObject.position.copy(finalPosition);
    this.debug.selectionBoxHelper.setFromObject(selectedObject);
  }

  private onDraggingChanged = (event: { value: boolean }) => {
    this.controls.enabled = !event.value;
    if (event.value) {
      this.interactionManager.handleTransformStart();
    } else {
      this.interactionManager.handleTransformEnd();
      this.debug.hideAll();
    }
  }

  private setupTransformControlsListeners() {
    // @ts-expect-error - event listeners are not fully typed
    this.transformControls.addEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - event listeners are not fully typed
    this.transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  public destroy() {
    // ... a destroy metódus tartalma változatlan ...
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('mousemove', this.onPointerMove);
    this.interactionManager.removeEventListeners();
    // @ts-expect-error - a
    this.transformControls.removeEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - a
    this.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);

    if (this.labelRenderer.domElement.parentNode === this.canvas) {
        this.canvas.removeChild(this.labelRenderer.domElement);
    }
    
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

    this.transformControls.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.remove(this.debug.virtualBoxMesh, this.debug.staticBoxHelper, this.debug.snapPointHelper, this.debug.selectionBoxHelper);
    console.log("Experience destroyed");
  }
}