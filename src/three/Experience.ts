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

  public static async create(canvas: HTMLDivElement): Promise<Experience> {
    const experience = new Experience(canvas);
    await experience.configManager.loadData();
    return experience;
  }

  public async rebuildObject(oldObject: Group, newState: Record<string, string>, selectAfterRebuild = true): Promise<Group | null> {
    const config = oldObject.userData.config;
    if (!config) return null;

    const newObject = await this.assetManager.buildFurniture(config.id, newState);
    if (!newObject) return null;

    newObject.position.copy(oldObject.position);
    newObject.rotation.copy(oldObject.rotation);
    newObject.scale.copy(oldObject.scale);

    // JAVÍTÁS: Átmásoljuk a régi anyag-állapotot, hogy a stílusváltás megőrizze a színeket!
    if (oldObject.userData.materialState) {
      newObject.userData.materialState = JSON.parse(JSON.stringify(oldObject.userData.materialState));
      await this.stateManager.applyStateToObject(newObject);
    }

    const index = this.placedObjects.findIndex(obj => obj.uuid === oldObject.uuid);
    if (index > -1) {
      this.placedObjects[index] = newObject;
    }
    this.scene.remove(oldObject);
    this.scene.add(newObject);

    if (selectAfterRebuild) {
      this.selectionStore.selectObject(newObject);
      this.transformControls.attach(newObject);
      this.debug.selectionBoxHelper.setFromObject(newObject);
    }

    return newObject;
  }

  public removeObject(objectToRemove: Group) {
    const index = this.placedObjects.findIndex(obj => obj.uuid === objectToRemove.uuid);
    if (index > -1) {
      this.placedObjects.splice(index, 1);
    }
    this.scene.remove(objectToRemove);

    // @ts-expect-error - a
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

  private onObjectChange = () => {
    // @ts-expect-error - a
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
    // @ts-expect-error - a
    this.transformControls.addEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - a
    this.transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public destroy() {
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('mousemove', this.onPointerMove);
    this.interactionManager.removeEventListeners();
    // @ts-expect-error - a
    this.transformControls.removeEventListener('objectChange', this.onObjectChange);
    // @ts-expect-error - a
    this.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);
    
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