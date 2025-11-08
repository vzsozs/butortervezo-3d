// src/three/Utils/Debug.ts

import { Scene, BoxHelper, Mesh, LineSegments, SphereGeometry, MeshStandardMaterial, BoxGeometry, EdgesGeometry, LineBasicMaterial, Object3D, Box3, Vector3, Group } from 'three';

// Ezt a típust a PlacementManager is használja.
type SnapCandidate = {
  priority: number;
  position: Vector3;
  snapPoint: Vector3;
  distance: number;
  targetObject: Group;
};

export default class Debug {
  public virtualBoxMesh: LineSegments;
  public staticBoxHelper: BoxHelper;
  public snapPointHelper: Mesh;
  public selectionBoxHelper: BoxHelper;

  constructor(private scene: Scene) {
    // Virtuális mozgó doboz
    const boxGeom = new BoxGeometry(1, 1, 1);
    const boxEdges = new EdgesGeometry(boxGeom);
    this.virtualBoxMesh = new LineSegments(boxEdges, new LineBasicMaterial({ color: 0xff0000 }));
    this.scene.add(this.virtualBoxMesh);

    // Statikus célpont doboza
    this.staticBoxHelper = new BoxHelper(new Object3D(), 0x0000ff);
    this.scene.add(this.staticBoxHelper);

    // Snap pont (célkereszt)
    this.snapPointHelper = new Mesh(
      new SphereGeometry(0.05),
      new MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00 })
    );
    this.scene.add(this.snapPointHelper);

    // Kijelölés doboza
    this.selectionBoxHelper = new BoxHelper(new Object3D(), 0xffff00);
    this.scene.add(this.selectionBoxHelper);

    this.hideAll();
  }

  public hideAll() {
    this.virtualBoxMesh.visible = false;
    this.staticBoxHelper.visible = false;
    this.snapPointHelper.visible = false;
  }

  

  // ÚJ METÓDUS
  public updateVirtualBox(virtualMovingBox: Box3) {
    const center = new Vector3();
    const size = new Vector3();
    virtualMovingBox.getCenter(center);
    virtualMovingBox.getSize(size);
    
    this.virtualBoxMesh.position.copy(center);
    this.virtualBoxMesh.scale.copy(size);
    this.virtualBoxMesh.visible = true;
  }

  public updateSnapHelpers(virtualMovingBox: Box3, bestCandidate: SnapCandidate) {
    this.updateVirtualBox(virtualMovingBox); // Újrahasználjuk a fenti logikát

    this.snapPointHelper.position.copy(bestCandidate.snapPoint);
    this.snapPointHelper.visible = true;

    this.staticBoxHelper.setFromObject(bestCandidate.targetObject);
    this.staticBoxHelper.visible = true;
  }
}