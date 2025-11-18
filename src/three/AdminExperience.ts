// src/three/AdminExperience.ts

import { 
  Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, Group, Box3, Vector3, Raycaster, Vector2, Object3D, 
  Mesh, MeshStandardMaterial, Material, WireframeGeometry, LineSegments, LineBasicMaterial 
} from 'three';
import { OrbitControls } from 'three-stdlib';
import AssetManager from './Managers/AssetManager';
// Az importot is tisztítjuk, nincs szükség a ComponentSlotConfig-ra itt
import type { FurnitureConfig } from '@/config/furniture';

export default class AdminExperience extends EventTarget {
  public canvas: HTMLDivElement;
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
  private currentObjectId: string | null = null; // <<< ÚJ: Eltároljuk az aktuális bútor ID-ját

  constructor(canvas: HTMLDivElement) {
    super();
    this.canvas = canvas;
    this.scene = new Scene();
    const sizes = { width: canvas.clientWidth, height: canvas.clientHeight };
    this.camera = new PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 1000);
    this.camera.position.set(1.1, 0.6, 0.5); 
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(sizes.width, sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.05, 0);
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

  public async updateObject(config: FurnitureConfig, resetCamera: boolean) {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
    }
    this.clearHighlight();

    const componentState: Record<string, string> = {};
    config.componentSlots.forEach(slot => {
      if (slot.defaultComponent) componentState[slot.slotId] = slot.defaultComponent;
    });

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
    // JAVÍTÁS: Csak akkor állítjuk be a kamerát, ha a flag igaz
    if (resetCamera) {
      console.log('%c[Experience] Új bútor, kamera reset.', 'color: cyan');
      this.frameObject(this.currentObject);
    } else {
      console.log('%c[Experience] Meglévő bútor frissítve, kamera pozíció megmarad.', 'color: cyan');
    }

    // ÚJ: Frissítjük az eltárolt ID-t
    this.currentObjectId = config.id;
  }

  private frameObject(object: Group) {
    const box = new Box3().setFromObject(object);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    // 1. Kiszámoljuk a szükséges távolságot, hogy minden beleférjen
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    // A szorzó (1.5) finomhangolja a zoom-ot, ízlés szerint állítható
    const distance = Math.abs(maxDim / Math.tan(fov / 2)) * 0.8; 

    // 2. Meghatározzuk a kívánt nézési irányt (egy vektor, ami jobb-felülről mutat)
    // Az (1, 0.8, 1) egy kellemes, enyhén felülnézeti, isometrikus szöget ad
    const direction = new Vector3(1.3, 0.8, 0.6).normalize();

    // 3. Kiszámoljuk az új kamera pozíciót:
    // A bútor közepétől indulunk, és a nézési irány mentén hátrafelé mozgunk a kiszámolt távolságra.
    const newPosition = new Vector3().copy(center).add(direction.multiplyScalar(distance));

    // 4. Beállítjuk a kamerát és a célpontot
    this.camera.position.copy(newPosition);
    this.controls.target.copy(center);

    // Fontos: Frissítjük a vezérlőket a változások után
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

    const config = currentObject.userData.config as FurnitureConfig | undefined;
    if (!config || !config.componentSlots) return;

    const validSlotIds = new Set(
        config.componentSlots
            .filter(Boolean) 
            .map(slot => slot.slotId)
    );

    let foundSlotObject: Object3D | null = null;
    
    // --- AZ UTOLSÓ RÍTUS ---
    // A ?. biztosítja, hogy a kód ne haljon el, ha az intersects[0] nem létezik.
    // A ?? null pedig garantálja, hogy a currentParent típusa null lesz, ha nincs találat.
    // Ezt a logikát a sérült elemző is megérti.
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

  // ÚJ METÓDUS: Eltávolítja az aktuális objektumot a jelenetből.
  public clearCanvas() {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
      this.currentObject = null;
    }
    this.clearHighlight();
    // ÚJ: A vászon törlésekor az ID-t is töröljük
    this.currentObjectId = null;
  }

  public destroy() {
    this.renderer.domElement.removeEventListener('click', this.onClick);
    cancelAnimationFrame(this.animationFrameId);
    this.renderer.dispose();
    this.controls.dispose();
    if (this.renderer.domElement.parentElement === this.canvas) {
      this.canvas.removeChild(this.renderer.domElement);
    }
  }
}