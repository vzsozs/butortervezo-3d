// src/three/AdminExperience.ts

import { 
  Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, Group, Box3, Vector3, Raycaster, Vector2, Object3D, 
  Mesh, MeshStandardMaterial, Material, WireframeGeometry, LineSegments, LineBasicMaterial 
} from 'three';
import { OrbitControls } from 'three-stdlib';
import AssetManager from './Managers/AssetManager';
import type { FurnitureConfig } from '@/config/furniture';

export default class AdminExperience extends EventTarget {
  // JAVÍTÁS: Átneveztem 'container'-re, hogy konzisztens legyen a resize() metódussal
  public container: HTMLDivElement; 
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer;
  public controls: OrbitControls;
  private assetManager: AssetManager;
  private currentObject: Group | null = null;
  private animationFrameId: number = 0;
  private raycaster: Raycaster;
  private mouse: Vector2;
  private highlightMaterial: MeshStandardMaterial;
  private highlightedObject: Mesh | null = null;
  private originalMaterial: Material | null = null;
  private currentObjectId: string | null = null;

  constructor(container: HTMLDivElement) { // JAVÍTÁS: Paraméter neve is container
    super();
    this.container = container; // JAVÍTÁS: Mentés container-ként
    this.scene = new Scene();
    
    const sizes = { width: container.clientWidth, height: container.clientHeight };
    
    this.camera = new PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 1000);
    this.camera.position.set(1.1, 0.8, 0.5); 
    
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(sizes.width, sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    this.container.appendChild(this.renderer.domElement); // JAVÍTÁS: container használata
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.35, 0);
    
    const ambientLight = new AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    const directionalLight = new DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
    
    this.assetManager = AssetManager.getInstance();
    this.raycaster = new Raycaster();
    this.mouse = new Vector2();
    
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.highlightMaterial = new MeshStandardMaterial({ color: 0x00aaff, emissive: 0x33bbff });
    
    this.animate();
  }

  // JAVÍTÁS: Most már működni fog, mert létezik a this.container
  resize() {
    if (!this.camera || !this.renderer || !this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    // Csak akkor frissítünk, ha van értelmes méret (pl. nem 0x0)
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public async updateObject(config: FurnitureConfig, resetCamera: boolean) {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
    }
    this.clearHighlight();

    const componentState: Record<string, string> = {};
    if (config.componentSlots) { // JAVÍTÁS: Ellenőrzés, hogy létezik-e
        config.componentSlots.forEach(slot => {
        if (slot.defaultComponent) componentState[slot.slotId] = slot.defaultComponent;
        });
    }

    const newObject = await this.assetManager.buildFurnitureFromConfig(config, componentState);
    if (!newObject) return;

    newObject.traverse(child => {
      if (child instanceof Mesh) {
        const wireframeGeo = new WireframeGeometry(child.geometry);
        const wireframeMat = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        const wireframe = new LineSegments(wireframeGeo, wireframeMat);
        child.add(wireframe);
      }
    });

    this.currentObject = newObject;
    this.scene.add(this.currentObject);
    
    if (resetCamera) {
      console.log('%c[Experience] Új bútor, kamera reset.', 'color: cyan');
      this.frameObject(this.currentObject);
    } else {
      console.log('%c[Experience] Meglévő bútor frissítve, kamera pozíció megmarad.', 'color: cyan');
    }

    this.currentObjectId = config.id;
  }

  private frameObject(object: Group) {
    const box = new Box3().setFromObject(object);
    
    // Ha üres az objektum (pl. még nincs benne semmi), ne fagyjon le
    if (box.isEmpty()) return;

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / Math.tan(fov / 2)) * 0.8; 

    const direction = new Vector3(1.3, 0.8, 0.6).normalize();
    const newPosition = new Vector3().copy(center).add(direction.multiplyScalar(distance));

    this.camera.position.copy(newPosition);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private clearHighlight() {
    if (this.highlightedObject && this.originalMaterial) {
      this.highlightedObject.material = this.originalMaterial;
    }
    this.highlightedObject = null;
    this.originalMaterial = null;
  }

  private onClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    this.clearHighlight();

    const currentObject = this.currentObject;
    if (!currentObject) return;

    const intersects = this.raycaster.intersectObject(currentObject, true);
    if (intersects.length === 0) return;

    // JAVÍTÁS: Típusellenőrzés a userData-ra
    const config = currentObject.userData.config as FurnitureConfig | undefined;
    if (!config || !config.componentSlots) return;

    const validSlotIds = new Set(
        config.componentSlots
            .filter(Boolean) 
            .map(slot => slot.slotId)
    );

    let foundSlotObject: Object3D | null = null;
    let currentParent: Object3D | null = intersects[0]?.object ?? null;

    while (currentParent) {
        if (validSlotIds.has(currentParent.name)) {
            foundSlotObject = currentParent;
            break; 
        }
        currentParent = currentParent.parent;
    }

    if (foundSlotObject) {
        this.dispatchEvent(new CustomEvent('slotClicked', { detail: { slotId: foundSlotObject.name } }));

        if (foundSlotObject instanceof Mesh) {
            this.highlightedObject = foundSlotObject;
            this.originalMaterial = foundSlotObject.material as Material;
            foundSlotObject.material = this.highlightMaterial;
        }
    }
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public clearCanvas() {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
      this.currentObject = null;
    }
    this.clearHighlight();
    this.currentObjectId = null;
  }

  public destroy() {
    this.renderer.domElement.removeEventListener('click', this.onClick);
    cancelAnimationFrame(this.animationFrameId);
    this.renderer.dispose();
    this.controls.dispose();
    // JAVÍTÁS: container használata
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}