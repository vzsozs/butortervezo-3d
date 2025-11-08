// src/three/Experience.ts

import { Scene, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Object3D, Group, Clock, Mesh, PlaneGeometry, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import { TransformControls } from 'three-stdlib';
import { useSelectionStore } from '@/stores/selection';
import { useSettingsStore } from '@/stores/settings';
import ConfigManager from './Managers/ConfigManager';

import World from './World/World';
import Debug from './Utils/Debug';
import AssetManager from './Managers/AssetManager';
import PlacementManager from './Managers/PlacementManager';
import InteractionManager from './Managers/InteractionManager';
import StateManager from './Managers/StateManager';

export default class Experience {
  // ... (a property-k maradnak ugyanazok)
  public canvas: HTMLDivElement;
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer;
  private clock: Clock;
  public configManager: ConfigManager;
  public controls: OrbitControls;
  public transformControls: TransformControls;
  public raycaster: Raycaster;
  public mouse = new Vector2();
  public placedObjects: Group[] = [];
  public intersectableObjects: Object3D[] = [];
  public selectionStore = useSelectionStore();
  public settingsStore = useSettingsStore();
  public world: World;
  public debug: Debug;
  public assetManager: AssetManager;
  public placementManager: PlacementManager;
  public interactionManager: InteractionManager;
  public stateManager: StateManager;

  // JAVÍTÁS: A konstruktor most már privát!
  // Ez azt jelenti, hogy nem lehet `new Experience()`-szel meghívni,
  // csak a lenti `create` metóduson keresztül.
  private constructor(canvas: HTMLDivElement) {
    this.canvas = canvas;

    // A konstruktor többi része változatlan
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 2, 3);
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.canvas.appendChild(this.renderer.domElement);
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
    const floor = this.scene.children.find(c => c instanceof Mesh && c.geometry instanceof PlaneGeometry);
    if (floor) this.intersectableObjects.push(floor);
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('mousemove', this.onPointerMove);
    this.setupTransformControlsListeners();
    this.animate();
  }

  // JAVÍTÁS: Itt van a hiányzó 'create' metódus
  public static async create(canvas: HTMLDivElement): Promise<Experience> {
    const experience = new Experience(canvas);
    await experience.configManager.loadData();
    return experience;
  }

  private async updateFromStore() {
    // Törlési kérelem figyelése
    const uuidToDelete = this.selectionStore.objectToDeleteUUID;
    if (uuidToDelete) {
      const objectToRemove = this.placedObjects.find(obj => obj.uuid === uuidToDelete);
      if (objectToRemove) {
        this.removeObject(objectToRemove);
      }
      this.selectionStore.acknowledgeDeletion();
    }

    // ######################################################################
    // ###                ÚJ: DUPLIKÁLÁSI KÉRELEM FIGYELÉSE               ###
    // ######################################################################
    const uuidToDuplicate = this.selectionStore.objectToDuplicateUUID;
    if (uuidToDuplicate) {
      const originalObject = this.placedObjects.find(obj => obj.uuid === uuidToDuplicate);
      
      if (originalObject && originalObject.userData.config) {
        // 1. Létrehozzuk az új, alapértelmezett bútort
        const newObject = await this.assetManager.buildFurniture(originalObject.userData.config.id);
        
        if (newObject) {
          // ######################################################################
          // ###                         JAVÍTOTT RÉSZ                          ###
          // ######################################################################

          // 2. MÉLYEN átmásoljuk az állapotot a régiről az újra
          // A JSON.stringify/parse egy egyszerű trükk a mély klónozásra
          if (originalObject.userData.componentState) {
            newObject.userData.componentState = JSON.parse(JSON.stringify(originalObject.userData.componentState));
          }
          if (originalObject.userData.materialState) {
            newObject.userData.materialState = JSON.parse(JSON.stringify(originalObject.userData.materialState));
          }

          // 3. Alkalmazzuk a másolt állapotot a 3D modellre
          await this.stateManager.applyStateToObject(newObject);

          // 4. Beállítjuk a pozíciót és a forgatást
          const boundingBox = this.placementManager.getVirtualBox(originalObject, originalObject.position);
          const size = new Vector3();
          boundingBox.getSize(size);
          const offset = new Vector3(size.x + 0.1, 0, 0);
          newObject.position.copy(originalObject.position).add(offset);
          newObject.rotation.copy(originalObject.rotation);
          newObject.scale.copy(originalObject.scale);

          // 5. A többi lépés változatlan
          this.scene.add(newObject);
          this.transformControls.detach();
          this.selectionStore.clearSelection();
          this.interactionManager.startDraggingExistingObject(newObject);
        }
      }
      this.selectionStore.acknowledgeDuplication();
    }
  }

  

  public removeObject(objectToRemove: Group) {
    const index = this.placedObjects.findIndex(obj => obj.uuid === objectToRemove.uuid);
    if (index > -1) {
      this.placedObjects.splice(index, 1);
    }
    this.scene.remove(objectToRemove);

    // JAVÍTÁS: Itt van a @ts-expect-error a privát property hiba miatt
    // @ts-expect-error - A three-stdlib típusdefiníciója hibásan privátnak jelöli az 'object' property-t.
    if (this.transformControls.object === objectToRemove) {
      this.transformControls.detach();
      this.debug.selectionBoxHelper.visible = false;
    }
    console.log('Object removed from experience:', objectToRemove.name);
  }

  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

    private onPointerMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

    // --- NEVESÍTETT LISTENER FÜGGVÉNYEK ---
  private onObjectChange = () => {
    // @ts-expect-error - A 'dragging' tulajdonság hibásan privátként van deklarálva a three-stdlib típusdefiníciójában.
    if (!this.transformControls.dragging) return;
    const selectedObject = this.selectionStore.selectedObject;
    if (!selectedObject) return;
    
    const objectsToCompare = this.placedObjects.filter(obj => obj.uuid !== selectedObject.uuid);
    const finalPosition = this.placementManager.calculateFinalPosition(selectedObject, selectedObject.position, objectsToCompare);
    selectedObject.position.copy(finalPosition);
    this.debug.selectionBoxHelper.setFromObject(selectedObject);
  }

  private onDraggingChanged = (event: { value: boolean }) => {
    this.controls.enabled = !event.value;
    if (!event.value) {
      this.debug.hideAll();
    }
  }

  private setupTransformControlsListeners() {
    // @ts-expect-error - Az 'objectChange' esemény nem része a standard Three.js típusoknak.
    this.transformControls.addEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - A 'dragging-changed' esemény nem része a standard Three.js típusoknak.
    this.transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    
    // Az updateFromStore most már aszinkron, ezért így hívjuk
    this.updateFromStore().catch(console.error);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

   public destroy() {
    // 1. Eseményfigyelők eltávolítása
    window.removeEventListener('resize', this.onWindowResize);
    // A globális egérkövető listener eltávolítása
    window.removeEventListener('mousemove', this.onPointerMove);
    this.interactionManager.removeEventListeners();
    // @ts-expect-error - Az 'objectChange' esemény nem része a standard Three.js típusoknak.
    this.transformControls.removeEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - A 'dragging-changed' esemény nem része a standard Three.js típusoknak.
    this.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);
    
    // 2. Three.js objektumok felszabadítása
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

    // 3. Kontrollok és renderer felszabadítása
    this.transformControls.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    // 4. Debug helper-ek eltávolítása a scene-ből
    this.scene.remove(this.debug.virtualBoxMesh, this.debug.staticBoxHelper, this.debug.snapPointHelper, this.debug.selectionBoxHelper);

    console.log("Experience destroyed");
  }
}