import { Group, Vector3, Box3 } from 'three';
import Experience from '../Experience';

const SNAP_INCREMENT = 0.2;
const MAX_SNAP_CHECK_DISTANCE = 1.0;

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
    const movingBox = this.getBoxAtPosition(movingObject, position);
    const tolerance = new Vector3(0.001, 0.001, 0.001); 
    movingBox.expandByVector(tolerance.negate());

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue;
      const staticBox = new Box3().setFromObject(staticObject);
      if (movingBox.intersectsBox(staticBox)) {
        return true;
      }
    }
    return false;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  public calculateFinalPosition(movingObject: Group, proposedPosition: Vector3, objectsToCompare: Group[]): Vector3 {
    // A magasságot (Y) nem bántjuk, azt az InteractionManager már beállította
    const currentY = proposedPosition.y;
    
    const candidates: SnapCandidate[] = [];
    const otherObjects = objectsToCompare.filter(obj => obj.uuid !== movingObject.uuid);

    // --- RELATÍV ÉLEK KISZÁMÍTÁSA ---
    const currentBox = new Box3().setFromObject(movingObject);
    
    const deltaLeft = currentBox.min.x - movingObject.position.x;
    const deltaRight = currentBox.max.x - movingObject.position.x;
    // A deltaBack és deltaFront törölve lett, mert nem használtuk

    for (const staticObject of otherObjects) {
      const staticBox = new Box3().setFromObject(staticObject);

      // 1. ESET: Jobb oldalra illesztés
      const snapPosRight = proposedPosition.clone();
      snapPosRight.x = staticBox.max.x - deltaLeft;
      
      if (Math.abs(proposedPosition.z - staticObject.position.z) < 0.5) {
          snapPosRight.z = staticObject.position.z;
      }

      if (Math.abs(proposedPosition.x - snapPosRight.x) < MAX_SNAP_CHECK_DISTANCE) {
          candidates.push({
              priority: 1,
              position: snapPosRight,
              snapPoint: new Vector3(staticBox.max.x, currentY, snapPosRight.z),
              distance: proposedPosition.distanceTo(snapPosRight),
              targetObject: staticObject
          });
      }

      // 2. ESET: Bal oldalra illesztés
      const snapPosLeft = proposedPosition.clone();
      snapPosLeft.x = staticBox.min.x - deltaRight;
      
      if (Math.abs(proposedPosition.z - staticObject.position.z) < 0.5) {
          snapPosLeft.z = staticObject.position.z;
      }

      if (Math.abs(proposedPosition.x - snapPosLeft.x) < MAX_SNAP_CHECK_DISTANCE) {
          candidates.push({
              priority: 1,
              position: snapPosLeft,
              snapPoint: new Vector3(staticBox.min.x, currentY, snapPosLeft.z),
              distance: proposedPosition.distanceTo(snapPosLeft),
              targetObject: staticObject
          });
      }
    }
    
    this.experience.debug.hideAll();

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const bestValidSnap = candidates.find(c => !this.isPositionColliding(movingObject, c.position, otherObjects));
      
      if (bestValidSnap) {
        this.experience.debug.updateSnapHelpers(new Box3(), bestValidSnap);
        return bestValidSnap.position;
      }
    }

    const gridSnapPosition = new Vector3(
        this.snapToGrid(proposedPosition.x), 
        currentY, 
        this.snapToGrid(proposedPosition.z)
    );
    
    if (!this.isPositionColliding(movingObject, gridSnapPosition, otherObjects)) {
      return gridSnapPosition;
    }

    return proposedPosition; 
  }

  private getBoxAtPosition(object: Group, newPosition: Vector3): Box3 {
    const offset = newPosition.clone().sub(object.position);
    const box = new Box3().setFromObject(object);
    box.translate(offset);
    return box;
  }
}