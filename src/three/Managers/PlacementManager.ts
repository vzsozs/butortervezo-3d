// src/three/Managers/PlacementManager.ts

import { Group, Vector3, Box3 } from 'three';
import Experience from '../Experience';

const SNAP_INCREMENT = 0.2;

type SnapCandidate = {
  priority: number;
  position: Vector3;
  snapPoint: Vector3 | null; 
  distance: number;
  targetObject: Group;
};

// ÚJ, SZIGORÚBB TÍPUS A DEBUGGER SZÁMÁRA
type SnapCandidateWithPoint = SnapCandidate & { snapPoint: Vector3 };

export default class PlacementManager {
  constructor(private experience: Experience) {}

  private isPositionColliding(movingObject: Group, position: Vector3, objectsToCompare: Group[]): boolean {
    const movingBoxWorld = this.getVirtualBox(movingObject, position);
    const tolerance = new Vector3(0.01, 0.01, 0.01);
    movingBoxWorld.expandByVector(tolerance.negate());

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue;
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
    const finalHeight = movingObject.position.y;
    const candidates: SnapCandidate[] = [];
    const otherObjects = objectsToCompare.filter(obj => obj.uuid !== movingObject.uuid);

    const movingBox = new Box3().setFromObject(movingObject);
    const movingBoxSize = new Vector3();
    movingBox.getSize(movingBoxSize);

    for (const staticObject of otherObjects) {
      const staticBox = new Box3().setFromObject(staticObject);
      const MAX_SNAP_CHECK_DISTANCE = 1.0;

      const potentialSnapPosition = proposedPosition.clone();
      let isSnappingOnX = false;
      let isSnappingOnZ = false;

      const distanceToBoxEdgeZ = Math.abs(proposedPosition.z - staticBox.max.z);
      if (distanceToBoxEdgeZ <= MAX_SNAP_CHECK_DISTANCE) {
        isSnappingOnZ = true;
        potentialSnapPosition.z = staticBox.max.z - movingBoxSize.z / 2;
      }

      const distanceToLeftEdge = Math.abs(proposedPosition.x - staticBox.min.x);
      const distanceToRightEdge = Math.abs(proposedPosition.x - staticBox.max.x);
      
      if (Math.min(distanceToLeftEdge, distanceToRightEdge) <= MAX_SNAP_CHECK_DISTANCE) {
        isSnappingOnX = true;
        if (distanceToLeftEdge < distanceToRightEdge) {
          potentialSnapPosition.x = staticBox.min.x - movingBoxSize.x / 2;
        } else {
          potentialSnapPosition.x = staticBox.max.x + movingBoxSize.x / 2;
        }
      }

      if (isSnappingOnX || isSnappingOnZ) {
        // ######################################################################
        // ###                  JAVÍTOTT SNAP POINT LOGIKA                    ###
        // ######################################################################
        // A snap point a statikus objektum felületén van.
        // A koordinátáit a VÉGLEGESEN igazított pozícióból vezetjük le.
        let snapPointX, snapPointZ;

        if (isSnappingOnX) {
          // Ha X-ben igazítunk, a snap pont X-koordinátája a statikus doboz éle.
          snapPointX = (distanceToLeftEdge < distanceToRightEdge) ? staticBox.min.x : staticBox.max.x;
        } else {
          // Ha X-ben nem, akkor a vonal párhuzamos a Z-tengellyel, az X-koordináta a bútor végső X-pozíciója.
          snapPointX = potentialSnapPosition.x;
        }

        if (isSnappingOnZ) {
          // Ha Z-ben igazítunk, a snap pont Z-koordinátája a statikus doboz éle.
          snapPointZ = staticBox.max.z;
        } else {
          // Ha Z-ben nem, akkor a vonal párhuzamos az X-tengellyel, a Z-koordináta a bútor végső Z-pozíciója.
          snapPointZ = potentialSnapPosition.z;
        }
        
        const primarySnapPoint = new Vector3(snapPointX, finalHeight, snapPointZ);

        candidates.push({
          priority: isSnappingOnZ ? 1 : 2,
          position: potentialSnapPosition,
          distance: proposedPosition.distanceTo(potentialSnapPosition),
          snapPoint: primarySnapPoint,
          targetObject: staticObject,
        });
      }
    }
    
    this.experience.debug.hideAll();

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
      
      const bestValidSnap = candidates.find(c => !this.isPositionColliding(movingObject, c.position, otherObjects));
      
      if (bestValidSnap) {
        const virtualBox = this.getVirtualBox(movingObject, bestValidSnap.position);
        
        if (bestValidSnap.snapPoint) {
          this.experience.debug.updateSnapHelpers(
            virtualBox, 
            bestValidSnap as SnapCandidateWithPoint
          );
        } else {
          this.experience.debug.updateVirtualBox(virtualBox);
        }
        
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


  private getVirtualBox(proxyObject: Group, centerPosition: Vector3): Box3 {
    const box = new Box3().setFromObject(proxyObject);
    const size = new Vector3();
    box.getSize(size);
    return new Box3().setFromCenterAndSize(centerPosition, size);
  }
}