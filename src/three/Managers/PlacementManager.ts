// src/three/Managers/PlacementManager.ts

import { Group, Vector3, Box3, Mesh, Matrix4, Object3D } from 'three';
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

  private findFirstMesh(parent: Object3D): Mesh | undefined {
    let foundMesh: Mesh | undefined = undefined;
    parent.traverse((child) => {
      if (!foundMesh && child instanceof Mesh) {
        foundMesh = child;
      }
    });
    return foundMesh;
  }

  private isPositionColliding(movingObject: Group, position: Vector3, objectsToCompare: Group[]): boolean {
    const movingBoxWorld = this.getVirtualBox(movingObject, position);
    const tolerance = new Vector3(0.01, 0.01, 0.01);
    movingBoxWorld.expandByVector(tolerance.negate());

    for (const staticObject of objectsToCompare) {
      const staticBoxWorld = new Box3().setFromObject(staticObject, true);
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
    console.groupCollapsed(`--- PM.calculateFinalPosition ---`);
    
    const finalHeight = proposedPosition.y;
    const candidates: SnapCandidate[] = [];
    
    console.log("Bemenet:", { proposedPosition: proposedPosition.clone(), finalHeight });

    // 1. JELÖLTEK GYŰJTÉSE (HELYES, LOKÁLIS MÉRETEKKEL)
    const movingMesh = this.findFirstMesh(movingObject);
    if (!movingMesh) return proposedPosition; // Hiba esetén ne csináljon semmit

    const movingBoxSize = new Vector3();
    if (!movingMesh.geometry.boundingBox) movingMesh.geometry.computeBoundingBox();
    movingMesh.geometry.boundingBox!.getSize(movingBoxSize);
    movingBoxSize.multiply(movingObject.scale); // Alkalmazzuk a skálázást

    for (const staticObject of objectsToCompare) {
      const staticBox = new Box3().setFromObject(staticObject, true);
      
      const distanceX = Math.min(Math.abs(proposedPosition.x - staticBox.min.x), Math.abs(proposedPosition.x - staticBox.max.x));
      const distanceZ = Math.min(Math.abs(proposedPosition.z - staticBox.min.z), Math.abs(proposedPosition.z - staticBox.max.z));

      const MAX_SNAP_CHECK_DISTANCE = 0.5; 
      if (distanceX > MAX_SNAP_CHECK_DISTANCE && distanceZ > MAX_SNAP_CHECK_DISTANCE) {
        continue;
      }

      // A pozíciók a bútor KÖZEPÉT reprezentálják
      const posZ_BackToBack = new Vector3(proposedPosition.x, finalHeight, staticBox.max.z - movingBoxSize.z / 2);
      candidates.push({ priority: 1, position: posZ_BackToBack, distance: proposedPosition.distanceTo(posZ_BackToBack), snapPoint: new Vector3(posZ_BackToBack.x, finalHeight, staticBox.max.z), targetObject: staticObject });

      const posX_LeftToRight = new Vector3(staticBox.max.x + movingBoxSize.x / 2, finalHeight, proposedPosition.z);
      candidates.push({ priority: 2, position: posX_LeftToRight, distance: proposedPosition.distanceTo(posX_LeftToRight), snapPoint: new Vector3(staticBox.max.x, finalHeight, posX_LeftToRight.z), targetObject: staticObject });
      
      const posX_RightToLeft = new Vector3(staticBox.min.x - movingBoxSize.x / 2, finalHeight, proposedPosition.z);
      candidates.push({ priority: 2, position: posX_RightToLeft, distance: proposedPosition.distanceTo(posX_RightToLeft), snapPoint: new Vector3(staticBox.min.x, finalHeight, posX_RightToLeft.z), targetObject: staticObject });
    }
    
    console.log(`Talált snap jelöltek: ${candidates.length} db`);

    // 2. DÖNTÉSI LOGIKA
    this.experience.debug.hideAll();

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
      
      const bestValidSnap = candidates.find(c => 
        !this.isPositionColliding(movingObject, c.position, objectsToCompare)
      );

      if (bestValidSnap) {
        console.log("%c döntés: ELSŐ ÉRVÉNYES SNAP HASZNÁLATA", "color: lightgreen");
        const virtualBox = this.getVirtualBox(movingObject, bestValidSnap.position);
        this.experience.debug.updateSnapHelpers(virtualBox, bestValidSnap);
        console.groupEnd();
        return bestValidSnap.position;
      }
    }

    const gridSnapPosition = new Vector3(this.snapToGrid(proposedPosition.x), finalHeight, this.snapToGrid(proposedPosition.z));
    if (!this.isPositionColliding(movingObject, gridSnapPosition, objectsToCompare)) {
      console.log("%c döntés: RÁCSHOZ IGAZÍTÁS", "color: cyan");
      this.experience.debug.updateVirtualBox(this.getVirtualBox(movingObject, gridSnapPosition));
      console.groupEnd();
      return gridSnapPosition;
    }

    console.log("%c döntés: MINDEN ÜTKÖZIK, MARADJ A HELYEDEN", "color: red");
    this.experience.debug.updateVirtualBox(this.getVirtualBox(movingObject, proposedPosition));
    console.groupEnd();
    return movingObject.position;
  }

   // --- VÉGLEGES, HELYES getVirtualBox ---
  private getVirtualBox(movingObject: Group, centerPosition: Vector3): Box3 {
    const mesh = this.findFirstMesh(movingObject);
    if (!mesh) return new Box3();

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const localBox = mesh.geometry.boundingBox!.clone();
    
    const transformMatrix = new Matrix4().compose(
      centerPosition,
      movingObject.quaternion,
      movingObject.scale
    );

    return localBox.applyMatrix4(transformMatrix);
  }
}