// src/three/Experience.ts
import { toRaw } from 'vue';
import { Scene, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Object3D, Group, Clock, Mesh, PlaneGeometry, type EulerOrder } from 'three';
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

export default class Experience {
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
    // === Első, üres állapot mentése a betöltés után ===
    experience.historyStore.addState();
    return experience;
  }

  // =================================================================
  // === ÚJ METÓDUS: ÁLLAPOT BETÖLTÉSE ===============================
  // =================================================================
  public async loadState(state: SceneState) {
    console.log("[Experience] Állapot betöltése...", state);

    // 1. Jelenlegi jelenet kiürítése
    this.selectionStore.clearSelection();
    this.transformControls.detach();
    this.debug.selectionBoxHelper.visible = false;
    
    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.scene.remove(toRaw(obj));
    }
    this.experienceStore.updatePlacedObjects([]);

    // 2. Új objektumok újraépítése a mentett állapotból
    const newObjects: Group[] = [];
    for (const objState of state) {
      const newObject = await this.assetManager.buildFurniture(objState.configId, objState.componentState);
      if (newObject) {
        newObject.position.fromArray(objState.position);
        
        newObject.rotation.fromArray(objState.rotation as [number, number, number, EulerOrder]);
        
        newObject.userData.materialState = objState.materialState;
        await this.stateManager.applyStateToObject(newObject);
        
        this.scene.add(newObject);
        newObjects.push(newObject);
      }
    }

    // 3. Store és ár frissítése
    this.experienceStore.updatePlacedObjects(newObjects);
    this.updateTotalPrice();
    console.log("[Experience] Állapot betöltve.");
  }

  public updateTotalPrice() {
    this.experienceStore.calculateTotalPrice();
  }

  public async rebuildObject(oldObject: Group, newState: Record<string, string>, selectAfterRebuild = true): Promise<Group | null> {
    console.groupCollapsed(`--- [Experience.rebuildObject] Átépítés kezdődik ---`);
    console.log(`🔍 Régi objektum (eltávolítandó):`, { name: oldObject.name, uuid: oldObject.uuid, object: oldObject });

    const config = oldObject.userData.config;
    if (!config) {
      console.error("❌ Hiba: A régi objektumnak nincs configja!", oldObject);
      console.groupEnd();
      return null;
    }

    const newObject = await this.assetManager.buildFurniture(config.id, newState);
    if (!newObject) {
      console.error("❌ Hiba: Az AssetManager nem tudta létrehozni az új objektumot.");
      console.groupEnd();
      return null;
    }
    console.log(`✅ Új objektum (létrehozva):`, { name: newObject.name, uuid: newObject.uuid, object: newObject });

    newObject.position.copy(oldObject.position);
    newObject.rotation.copy(oldObject.rotation);
    newObject.scale.copy(oldObject.scale);

    if (oldObject.userData.materialState) {
      newObject.userData.materialState = JSON.parse(JSON.stringify(oldObject.userData.materialState));
      await this.stateManager.applyStateToObject(newObject);
    }

    // --- KRITIKUS MŰVELETEK LOGOLÁSA ---
    console.log(`scene.remove() hívás a régi objektumra: ${oldObject.uuid}`);
    const rawOldObject = toRaw(oldObject); // Kicsomagoljuk a Proxy-ból
    this.scene.remove(rawOldObject);      // A nyers objektumot adjuk át
    console.log(`scene.add() hívás az új objektumra: ${newObject.uuid}`);
    this.scene.add(newObject);


    // --- STORE FRISSÍTÉS LOGOLÁSA ---
    const allObjectsBefore = this.experienceStore.placedObjects.slice();
    const index = allObjectsBefore.findIndex(obj => obj.uuid === oldObject.uuid);
    console.log(`Régi objektum indexe a store-ban: ${index}`);

    if (index > -1) {
      const allObjectsAfter = [...allObjectsBefore]; // Biztonságos másolat
      allObjectsAfter[index] = newObject;
      this.experienceStore.updatePlacedObjects(allObjectsAfter);
      console.log(`🔄 Store frissítve. Régi UUID: ${oldObject.uuid}, Új UUID: ${newObject.uuid}`);
    } else {
      console.error(`❌ KRITIKUS HIBA: A régi objektum (${oldObject.uuid}) nem található a store-ban! Nem történt csere.`);
    }

    if (selectAfterRebuild) {
      this.selectionStore.selectObject(newObject);
      this.transformControls.attach(toRaw(newObject));
      this.debug.selectionBoxHelper.setFromObject(newObject);
    }

    this.updateTotalPrice(); 
    console.log("--- Átépítés befejezve ---");
    console.groupEnd();
    //this.historyStore.addState();
    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    // A lista módosítása a store-on keresztül
    const allObjects = this.experienceStore.placedObjects.slice(); // Másolat készítése
    const index = allObjects.findIndex(obj => obj.uuid === objectToRemove.uuid);
    if (index > -1) {
      allObjects.splice(index, 1);
      this.experienceStore.updatePlacedObjects(allObjects); // Visszaírás a store-ba
    }

    // @ts-expect-error - a transformControls.object típusdefiníciója hiányos
    if (this.transformControls.object === objectToRemove) {
      this.transformControls.detach();
      this.debug.selectionBoxHelper.visible = false;
      this.selectionStore.clearSelection();
    }

    this.scene.remove(toRaw(objectToRemove));
    console.log('Object removed from experience:', objectToRemove.name);
    this.updateTotalPrice();
    // === VÁLTOZÁS: Állapot mentése a művelet végén ===
    this.historyStore.addState();
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
    // @ts-expect-error - a
    if (!this.transformControls.dragging) return;
    const selectedObject = this.selectionStore.selectedObject;
    if (!selectedObject) return;
    
    // Olvasás a store-ból
    const objectsToCompare = this.experienceStore.placedObjects.filter(obj => obj.uuid !== selectedObject.uuid);
    const finalPosition = this.placementManager.calculateFinalPosition(selectedObject, selectedObject.position, objectsToCompare);
    selectedObject.position.copy(finalPosition);
    this.debug.selectionBoxHelper.setFromObject(selectedObject);
  }

  private onDraggingChanged = (event: { value: boolean }) => {
    this.controls.enabled = !event.value;
    if (!event.value) {
      this.debug.hideAll();
      // === VÁLTOZÁS: Állapot mentése mozgatás/forgatás BEFEJEZÉSEKOR ===
      this.historyStore.addState();
    }
  }

  private setupTransformControlsListeners() {
    // @ts-expect-error - a
    this.transformControls.addEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - a
    this.transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    
    // A fő 3D-s jelenet renderelése
    this.renderer.render(this.scene, this.camera);
    
    // JAVÍTÁS: A labelRenderer-t is frissíteni kell minden képkockán!
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