import { Scene, BoxHelper, Mesh, LineSegments, SphereGeometry, MeshStandardMaterial, BoxGeometry, EdgesGeometry, LineBasicMaterial, Object3D, Box3, Vector3, Group } from 'three';

type SnapCandidate = {
  priority: number;
  position: Vector3;
  snapPoint: Vector3;
  distance: number;
  targetObject: Group;
};

export default class Debug {
  // A régi (hibás) doboz definíciója marad, hogy ne törjön el a kód máshol
  public virtualBoxMesh: LineSegments;
  
  // AZ ÚJ, JÓ DOBOZ (BoxHelper)
  public virtualBoxHelper: BoxHelper;

  public staticBoxHelper: BoxHelper;
  public snapPointHelper: Mesh;
  public selectionBoxHelper: BoxHelper;

  constructor(private scene: Scene) {
    // Régi doboz (ezt majd elrejtjük)
    const boxGeom = new BoxGeometry(1, 1, 1);
    const boxEdges = new EdgesGeometry(boxGeom);
    this.virtualBoxMesh = new LineSegments(boxEdges, new LineBasicMaterial({ color: 0xff0000 }));
    this.scene.add(this.virtualBoxMesh);
    this.virtualBoxMesh.visible = false; // Alapból rejtett

    // ÚJ PIROS DOBOZ (BoxHelper - ez követi a geometriát)
    this.virtualBoxHelper = new BoxHelper(new Object3D(), 0xff0000);
    this.scene.add(this.virtualBoxHelper);

    // Statikus kék doboz
    this.staticBoxHelper = new BoxHelper(new Object3D(), 0x0000ff);
    this.scene.add(this.staticBoxHelper);

    // Snap pont
    this.snapPointHelper = new Mesh(
      new SphereGeometry(0.05),
      new MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00 })
    );
    this.scene.add(this.snapPointHelper);

    // Kijelölés sárga doboza
    this.selectionBoxHelper = new BoxHelper(new Object3D(), 0xffff00);
    this.scene.add(this.selectionBoxHelper);

    this.hideAll();
  }

  public hideAll() {
    this.virtualBoxMesh.visible = false;
    this.virtualBoxHelper.visible = false; // Az újat is rejtjük
    this.staticBoxHelper.visible = false;
    this.snapPointHelper.visible = false;
  }

  // --- RÉGI METÓDUS (Ezt hívja a PlacementManager) ---
  // Mivel a PlacementManager rossz Box3-at küld, itt egyszerűen
  // NEM rajzoljuk ki a régi dobozt. Így eltűnik a rossz helyen lévő piros keret.
  public updateVirtualBox(_virtualMovingBox: Box3) {
     this.virtualBoxMesh.visible = false; 
  }

  // --- ÚJ METÓDUS (Ezt hívja majd az InteractionManager) ---
  // Ez közvetlenül az objektumra teszi a dobozt, ami tökéletes lesz.
  public updateMovingObject(object: Object3D) {
    this.virtualBoxHelper.setFromObject(object);
    this.virtualBoxHelper.visible = true;
  }

  public updateSnapHelpers(_virtualMovingBox: Box3, bestCandidate: SnapCandidate) {
    // A _virtualMovingBox-ot ignoráljuk, mert az InteractionManager kezeli a piros dobozt
    
    this.snapPointHelper.position.copy(bestCandidate.snapPoint);
    this.snapPointHelper.visible = true;

    this.staticBoxHelper.setFromObject(bestCandidate.targetObject);
    this.staticBoxHelper.visible = true;
  }
}