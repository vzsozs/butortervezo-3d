// src/three/Managers/PlacementManager.ts

import { Group, Vector3, Box3 } from 'three';
import Experience from '../Experience';

const SNAP_INCREMENT = 0.2;

type SnapCandidate = {
  priority: number;
  position: Vector3;
  snapPoint: Vector3;
  distance: number;
  targetObject: Group;
};

export default class PlacementManager {
  constructor(private experience: Experience) {}

  private isPositionColliding(movingObject: Group, position: Vector3, objectsToCompare: Group[]): boolean {
    const movingBoxWorld = this.getVirtualBox(movingObject, position);
    const tolerance = new Vector3(0.01, 0.01, 0.01);
    movingBoxWorld.expandByVector(tolerance.negate());

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue;
      // A statikus objektum dobozát is a proxy alapján számoljuk.
      const staticBoxWorld = new Box3().setFromObject(staticObject);
      if (movingBoxWorld.intersectsBox(staticBoxWorld)) {
        return true;
      }
    }
    return false;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  public calculateFinalPosition(movingObject: Group, proposedPosition: Vector3, objectsToCompare: Group[]): Vector3 {
    const finalHeight = movingObject.position.y; // A magasságot a proxy eredeti pozíciójából vesszük
    const candidates: SnapCandidate[] = [];
    const otherObjects = objectsToCompare.filter(obj => obj.uuid !== movingObject.uuid);

    // A mozgó objektum méretét most már egyszerűen lekérhetjük.
    const movingBox = new Box3().setFromObject(movingObject);
    const movingBoxSize = new Vector3();
    movingBox.getSize(movingBoxSize);

    for (const staticObject of otherObjects) {
      const staticBox = new Box3().setFromObject(staticObject);
      
      const MAX_SNAP_CHECK_DISTANCE = 1.0; 
      const distanceToBoxEdgeX = Math.min(
        Math.abs(proposedPosition.x - staticBox.min.x),
        Math.abs(proposedPosition.x - staticBox.max.x)
      );
      if (distanceToBoxEdgeX > MAX_SNAP_CHECK_DISTANCE) continue;

      // A logika változatlan, de most már garantáltan helyes méretekkel és pozíciókkal dolgozik.
      const distanceToLeftEdge = Math.abs(proposedPosition.x - staticBox.min.x);
      const distanceToRightEdge = Math.abs(proposedPosition.x - staticBox.max.x);

      if (distanceToLeftEdge < distanceToRightEdge) {
        const snapPosition = new Vector3(staticBox.min.x - movingBoxSize.x / 2, finalHeight, proposedPosition.z);
        candidates.push({ 
            priority: 2, 
            position: snapPosition, 
            distance: distanceToLeftEdge,
            snapPoint: new Vector3(staticBox.min.x, finalHeight, snapPosition.z), 
            targetObject: staticObject 
        });
      } else {
        const snapPosition = new Vector3(staticBox.max.x + movingBoxSize.x / 2, finalHeight, proposedPosition.z);
        candidates.push({ 
            priority: 2, 
            position: snapPosition, 
            distance: distanceToRightEdge,
            snapPoint: new Vector3(staticBox.max.x, finalHeight, snapPosition.z), 
            targetObject: staticObject 
        });
      }
    }
    
    this.experience.debug.hideAll();

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
      const bestValidSnap = candidates.find(c => !this.isPositionColliding(movingObject, c.position, otherObjects));
      if (bestValidSnap) {
        const virtualBox = this.getVirtualBox(movingObject, bestValidSnap.position);
        this.experience.debug.updateSnapHelpers(virtualBox, bestValidSnap);
        return bestValidSnap.position;
      }
    }

    const gridSnapPosition = new Vector3(this.snapToGrid(proposedPosition.x), finalHeight, this.snapToGrid(proposedPosition.z));
    if (!this.isPositionColliding(movingObject, gridSnapPosition, otherObjects)) {
      this.experience.debug.updateVirtualBox(this.getVirtualBox(movingObject, gridSnapPosition));
      return gridSnapPosition;
    }

    this.experience.debug.updateVirtualBox(this.getVirtualBox(movingObject, proposedPosition));
    return proposedPosition; 
  }

  // ######################################################################
  // ###             LEEGYSZERŰSÖDÖTT, ROBUSZTUS FÜGGVÉNY               ###
  // ######################################################################
  private getVirtualBox(proxyObject: Group, centerPosition: Vector3): Box3 {
    // Mivel a proxyObject a befoglaló, a méretét egyszerűen lekérhetjük.
    const box = new Box3().setFromObject(proxyObject);
    const size = new Vector3();
    box.getSize(size);
    
    // Létrehozunk egy új dobozt a megfelelő mérettel a kívánt pozícióban.
    return new Box3().setFromCenterAndSize(centerPosition, size);
  }
}