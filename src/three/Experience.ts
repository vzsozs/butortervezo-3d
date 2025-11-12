// src/three/Experience.ts
import { toRaw } from 'vue';
import { Scene, AmbientLight, DirectionalLight, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Object3D, Group, Clock, Mesh, PlaneGeometry, type EulerOrder } from 'three';
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

  // === ÚJ JELENET ===
  public newScene() {
    console.log("[Experience] Új jelenet létrehozása...");

    // 1. Jelenlegi bútorok törlése
    const objectsToRemove = [...this.experienceStore.placedObjects];
    for (const obj of objectsToRemove) {
      this.removeObject(obj); // A removeObject már kezeli a history-t is
    }
    this.experienceStore.updatePlacedObjects([]);

    // 2. Vonalzó elemek törlése
    this.rulerElements.clear();

    // 3. Kiválasztás törlése
    this.selectionStore.clearSelection();
    this.transformControls.detach();
    this.debug.selectionBoxHelper.visible = false;

    // 4. Globális beállítások visszaállítása (opcionális, de ajánlott)
    // Ehhez a settingsStore-ban kell egy 'reset' akció
    this.settingsStore.resetToDefaults();

    // 5. Előzmények törlése és új kezdőállapot mentése
    this.historyStore.clearHistory();
    this.historyStore.addState();

    console.log("[Experience] Jelenet sikeresen visszaállítva.");
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

  // METÓDUS A SCREENSHOT
  public getScreenshotCanvas(): HTMLCanvasElement | undefined {
    try {
    // === VÉGSŐ, KOMBINÁLT SCREENSHOT LOGIKA ===

    // 1. A segédelemeket NEM rejtjük el, mert egy teljesen új jelenetet renderelünk.
    // Így nem kell őket a végén visszakapcsolgatni.

    // 2. Létrehozunk egy teljesen új, ideiglenes jelenetet
    const screenshotScene = new Scene();
    screenshotScene.background = this.scene.background;

    // 3. Átmásoljuk a fényeket, de a "nyers" verziójukat klónozzuk
    this.scene.traverse((child) => {
      const rawChild = toRaw(child); // MINDIG a nyers objektummal dolgozunk
      if (rawChild instanceof AmbientLight || rawChild instanceof DirectionalLight) {
        screenshotScene.add(rawChild.clone());
      }
    });

    // 4. Hozzáadjuk a bútorok "nyers" klónjait
    for (const proxyObject of this.experienceStore.placedObjects) {
      const rawObject = toRaw(proxyObject);
      screenshotScene.add(rawObject.clone());
    }

    // 5. Az ideiglenes, TISZTA jelenetet rendereljük
    // Az ideiglenes, TISZTA jelenetet rendereljük
      this.renderer.render(screenshotScene, this.camera);
      
      console.log(`[Experience] Screenshot canvas előkészítve.`);
      
      // A dataURL helyett magát a canvas elemet adjuk vissza
      return this.renderer.domElement;

    } catch (error) {
      console.error("[Experience] Hiba a screenshot canvas előkészítése közben:", error);
      return undefined;
    }
  }


  public async rebuildObject(oldObject: Group, newState: Record<string, string>, selectAfterRebuild = true): Promise<Group | null> {
    const rawOldObject = toRaw(oldObject); // A 'toRaw' hívást a legelejére hozzuk
    console.groupCollapsed(`--- [Experience.rebuildObject] Átépítés kezdődik ---`);
    console.log(`🔍 Régi objektum (eltávolítandó):`, { name: rawOldObject.name, uuid: rawOldObject.uuid });

    // =================================================================
    // === KRITIKUS TAKARÍTÁS AZ ÁTÉPÍTÉS ELŐTT ========================
    // =================================================================
    // @ts-expect-error - a
    const attachedObject = this.transformControls.object;
    if (attachedObject && toRaw(attachedObject) === rawOldObject) {
      console.log(` -> Átépítendő objektum ki van választva, vezérlők leválasztása.`);
      this.transformControls.detach();
      this.debug.selectionBoxHelper.visible = false;
    }
    // =================================================================

    const config = rawOldObject.userData.config;
    if (!config) {
      console.error("❌ Hiba: A régi objektumnak nincs configja!", rawOldObject);
      console.groupEnd();
      return null;
    }

    const newObject = await this.assetManager.buildFurniture(config.id, newState);
    if (!newObject) {
      console.error("❌ Hiba: Az AssetManager nem tudta létrehozni az új objektumot.");
      console.groupEnd();
      return null;
    }
    console.log(`✅ Új objektum (létrehozva):`, { name: newObject.name, uuid: newObject.uuid });

    newObject.position.copy(rawOldObject.position);
    newObject.rotation.copy(rawOldObject.rotation);
    newObject.scale.copy(rawOldObject.scale);

    if (rawOldObject.userData.materialState) {
      newObject.userData.materialState = JSON.parse(JSON.stringify(rawOldObject.userData.materialState));
      await this.stateManager.applyStateToObject(newObject);
    }

    console.log(`scene.remove() hívás a régi objektumra: ${rawOldObject.uuid}`);
    this.scene.remove(rawOldObject);
    console.log(`scene.add() hívás az új objektumra: ${newObject.uuid}`);
    this.scene.add(newObject);

    const allObjectsBefore = this.experienceStore.placedObjects.slice();
    const index = allObjectsBefore.findIndex(obj => obj.uuid === rawOldObject.uuid);
    console.log(`Régi objektum indexe a store-ban: ${index}`);

    if (index > -1) {
      const allObjectsAfter = [...allObjectsBefore];
      allObjectsAfter[index] = newObject;
      this.experienceStore.updatePlacedObjects(allObjectsAfter);
      console.log(`🔄 Store frissítve. Régi UUID: ${rawOldObject.uuid}, Új UUID: ${newObject.uuid}`);
    } else {
      console.error(`❌ KRITIKUS HIBA: A régi objektum (${rawOldObject.uuid}) nem található a store-ban! Nem történt csere.`);
    }

    if (selectAfterRebuild) {
      this.selectionStore.selectObject(newObject);
      this.transformControls.attach(toRaw(newObject));
      this.debug.selectionBoxHelper.setFromObject(newObject);
      this.debug.selectionBoxHelper.visible = true; // Biztosítjuk, hogy látható legyen
    }

    this.updateTotalPrice(); 
    console.log("--- Átépítés befejezve ---");
    console.groupEnd();
    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    const rawObjectToRemove = toRaw(objectToRemove);
    console.log(`[Experience] removeObject hívás: ${rawObjectToRemove.uuid}`);

    // === JAVÍTÁS: MINDKÉT OLDALT KICSOMAGOLJUK ===
    // @ts-expect-error - a
    const attachedObject = this.transformControls.object;
    if (attachedObject && toRaw(attachedObject) === rawObjectToRemove) {
      console.log(` -> Objektum ki van választva, vezérlők leválasztása.`);
      this.transformControls.detach();
      this.debug.selectionBoxHelper.visible = false;
      this.selectionStore.clearSelection();
    }
    // ===========================================

    this.scene.remove(rawObjectToRemove);
    console.log(` -> Objektum eltávolítva a scene-ből.`);

    const allObjects = this.experienceStore.placedObjects.slice();
    const index = allObjects.findIndex(obj => obj.uuid === rawObjectToRemove.uuid);
    if (index > -1) {
      allObjects.splice(index, 1);
      this.experienceStore.updatePlacedObjects(allObjects);
      console.log(` -> Objektum eltávolítva a store-ból.`);
    } else {
      console.warn(` -> Figyelmeztetés: A törlendő objektum nem található a store-ban.`);
    }

    this.updateTotalPrice();
    this.historyStore.addState();
    console.log(`[Experience] removeObject befejezve.`);
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
    if (event.value) {
      // Húzás ELINDULT
      this.interactionManager.handleTransformStart();
    } else {
      // Húzás BEFEJEZŐDÖTT
      this.interactionManager.handleTransformEnd();
      this.debug.hideAll();
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