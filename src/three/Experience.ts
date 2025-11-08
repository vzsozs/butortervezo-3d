// src/three/Experience.ts

import { Scene, PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Object3D, Group, Clock, Mesh, PlaneGeometry } from 'three';
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
  // Core
  public canvas: HTMLDivElement;
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer;
  private clock: Clock;
  public configManager: ConfigManager;

  // Controls & Interaction State
  public controls: OrbitControls;
  public transformControls: TransformControls;
  public raycaster: Raycaster;
  public mouse = new Vector2();
  
  // Scene State
  public placedObjects: Group[] = [];
  public intersectableObjects: Object3D[] = [];

  // Stores
  public selectionStore = useSelectionStore();
  public settingsStore = useSettingsStore();

  // Modules
  public world: World;
  public debug: Debug;
  public assetManager: AssetManager;
  public placementManager: PlacementManager;
  public interactionManager: InteractionManager;
  public stateManager: StateManager;

  private constructor(canvas: HTMLDivElement) {
    this.canvas = canvas;

    // Core setup
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

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.transformControls);

    // Modules Initialization
    this.configManager = new ConfigManager(); // Ez az első!
    this.debug = new Debug(this.scene);
    this.world = new World(this.scene);
    this.assetManager = new AssetManager(this);
    this.placementManager = new PlacementManager(this);
    this.interactionManager = new InteractionManager(this);
    this.stateManager = new StateManager(this);

    // Add floor to intersectable objects
    const floor = this.scene.children.find(c => c instanceof Mesh && c.geometry instanceof PlaneGeometry);
    if (floor) this.intersectableObjects.push(floor);

    // Event Listeners
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('mousemove', this.onPointerMove);
    this.setupTransformControlsListeners();

    // Start loop
    this.animate();
  }

  public static async create(canvas: HTMLDivElement): Promise<Experience> {
    const experience = new Experience(canvas);
    
    // Megvárjuk, amíg a konfiguráció betöltődik
    await experience.configManager.loadData();

    // Most, hogy az adatok betöltődtek, elindíthatjuk azokat a folyamatokat,
    // amiknek szükségük van rá (pl. modellek előtöltése)
    // experience.assetManager.preloadCommonAssets(); // Ezt később implementáljuk

    return experience;
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