// src/three/Managers/PlacementManager.ts

import { Group, Vector3, Box3, Mesh } from 'three';
import Experience from '../Experience'; // Feltételezi, hogy Experience.ts a fő fájl

const SNAP_INCREMENT = 0.2;
const SNAP_DISTANCE = 0.2;

type SnapCandidate = {
  priority: number;
  position: Vector3;
  snapPoint: Vector3;
  distance: number;
  targetObject: Group;
};

export default class PlacementManager {
  constructor(private experience: Experience) {}

  public getAccurateBoundingBox(object: Group): Box3 {
    const box = new Box3();
    object.traverse((child) => {
      if (child instanceof Mesh) {
        box.expandByObject(child);
      }
    });
    return box;
  }

  private isPositionColliding(movingObject: Group, position: Vector3, objectsToCompare: Group[]): boolean {
    const movingBoxTemplate = this.getAccurateBoundingBox(movingObject);
    const movingBoxSize = new Vector3();
    movingBoxTemplate.getSize(movingBoxSize);
    const virtualMovingBox = new Box3().setFromCenterAndSize(position, movingBoxSize);

    for (const staticObject of objectsToCompare) {
      const staticBox = this.getAccurateBoundingBox(staticObject);
      if (virtualMovingBox.intersectsBox(staticBox)) {
        return true;
      }
    }
    return false;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  public calculateFinalPosition(movingObject: Group, proposedPosition: Vector3, objectsToCompare: Group[]): Vector3 {
    const candidates: SnapCandidate[] = [];
    const movingBoxTemplate = this.getAccurateBoundingBox(movingObject);
    const movingBoxSize = new Vector3();
    movingBoxTemplate.getSize(movingBoxSize);
    const virtualMovingBox = new Box3().setFromCenterAndSize(proposedPosition, movingBoxSize);

    for (const staticObject of objectsToCompare) {
      const staticBox = this.getAccurateBoundingBox(staticObject);
      // Oldal Z
          if (Math.abs(virtualMovingBox.max.z - staticBox.max.z) < SNAP_DISTANCE) {
            const offset = virtualMovingBox.max.z - staticBox.max.z;
            const newPosition = proposedPosition.clone().sub(new Vector3(0, 0, offset));
            const snapPoint = new Vector3(this.snapToGrid(proposedPosition.x), 0, staticBox.max.z);
            candidates.push({
              priority: 1,
              position: new Vector3(snapPoint.x, 0, newPosition.z),
              distance: proposedPosition.distanceTo(snapPoint),
              snapPoint: snapPoint,
              targetObject: staticObject
            });
          }
      
          // Oldal X (pozitív)
          if (Math.abs(virtualMovingBox.max.x - staticBox.min.x) < SNAP_DISTANCE) {
            const offset = virtualMovingBox.max.x - staticBox.min.x;
            const newPosition = proposedPosition.clone().sub(new Vector3(offset, 0, 0));
            const snapPoint = new Vector3(staticBox.min.x, 0, this.snapToGrid(proposedPosition.z));
            candidates.push({
              priority: 2,
              position: new Vector3(newPosition.x, 0, snapPoint.z),
              distance: proposedPosition.distanceTo(snapPoint),
              snapPoint: snapPoint,
              targetObject: staticObject
            });
          }
            
          // Oldal X (negatív)
          if (Math.abs(virtualMovingBox.min.x - staticBox.max.x) < SNAP_DISTANCE) {
            const offset = virtualMovingBox.min.x - staticBox.max.x;
            const newPosition = proposedPosition.clone().sub(new Vector3(offset, 0, 0));
            const snapPoint = new Vector3(staticBox.max.x, 0, this.snapToGrid(proposedPosition.z));
            candidates.push({
              priority: 2,
              position: new Vector3(newPosition.x, 0, snapPoint.z),
              distance: proposedPosition.distanceTo(snapPoint),
              snapPoint: snapPoint,
              targetObject: staticObject
            });
          }
    }

    const validCandidates = candidates.filter(c => !this.isPositionColliding(movingObject, c.position, objectsToCompare));
    const gridSnapPosition = new Vector3(this.snapToGrid(proposedPosition.x), 0, this.snapToGrid(proposedPosition.z));
    const isGridSnapValid = !this.isPositionColliding(movingObject, gridSnapPosition, objectsToCompare);

    this.experience.debug?.hideAll();

    if (validCandidates.length > 0) {
      validCandidates.sort((a, b) => a.distance - b.distance || a.priority - b.priority);
      const bestCandidate = validCandidates[0]!;
      this.experience.debug?.updateSnapHelpers(virtualMovingBox, bestCandidate);
      return bestCandidate.position;
    } else if (isGridSnapValid) {
      return gridSnapPosition;
    } else if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance || a.priority - b.priority);
      const closestCollidingCandidate = candidates[0]!;
      this.experience.debug?.updateSnapHelpers(virtualMovingBox, closestCollidingCandidate);
      return closestCollidingCandidate.position;
    } else {
      return movingObject.position;
    }
  }
}