import { Group, Vector3, Box3, MathUtils } from 'three'
import Experience from '../Experience'
import { useRoomStore } from '../../stores/room'

const SNAP_INCREMENT = 0.1
const MAX_SNAP_CHECK_DISTANCE = 0.2
const UNIT_SCALE = 0.001

type SnapCandidate = {
  priority: number
  position: Vector3
  snapPoint: Vector3
  distance: number
  targetObject: Group | string
}

export default class PlacementManager {
  constructor(private experience: Experience) {}

  /**
   * Ellenőrzi, hogy a pozíció ütközik-e más bútorokkal VAGY kilóg-e a szobából.
   */
  /**
   * Ellenőrzi, hogy a pozíció ütközik-e más bútorokkal VAGY kilóg-e a szobából.
   */
  private isPositionColliding(
    movingObject: Group,
    position: Vector3,
    objectsToCompare: Group[],
  ): boolean {
    const movingBox = this.getBoxAtPosition(movingObject, position)
    const tolerance = new Vector3(0.001, 0.001, 0.001)
    movingBox.expandByVector(tolerance.negate())

    // 1. Bútor-Bútor ütközés
    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue
      const staticBox = new Box3().setFromObject(staticObject)
      if (movingBox.intersectsBox(staticBox)) {
        return true
      }
    }

    // 2. Szoba határainak ellenőrzése
    const roomStore = useRoomStore()
    const halfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const halfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    if (
      movingBox.min.x < -halfWidth + 0.001 ||
      movingBox.max.x > halfWidth - 0.001 ||
      movingBox.min.z < -halfDepth + 0.001 ||
      movingBox.max.z > halfDepth - 0.001
    ) {
      return true
    }

    return false
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT
  }

  /**
   * Kényszeríti a pozíciót, hogy a bútor a szobán belül maradjon.
   */
  private constrainToRoom(movingObject: Group, position: Vector3): Vector3 {
    const roomStore = useRoomStore()
    const halfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const halfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    const currentBox = new Box3().setFromObject(movingObject)

    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    const deltaBack = currentBox.min.z - movingObject.position.z
    const deltaFront = currentBox.max.z - movingObject.position.z

    const constrained = position.clone()

    // X tengely clamp
    const minX = -halfWidth - deltaLeft
    const maxX = halfWidth - deltaRight
    constrained.x = MathUtils.clamp(constrained.x, minX, maxX)

    // Z tengely clamp
    const minZ = -halfDepth - deltaBack
    const maxZ = halfDepth - deltaFront
    constrained.z = MathUtils.clamp(constrained.z, minZ, maxZ)

    return constrained
  }

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    objectsToCompare: Group[],
  ): Vector3 {
    // 1. LÉPÉS: Tiszta lap
    this.experience.debug.hideAll()

    const currentY = proposedPosition.y
    const candidates: SnapCandidate[] = []
    const otherObjects = objectsToCompare.filter((obj) => obj.uuid !== movingObject.uuid)

    const roomStore = useRoomStore()
    const roomHalfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    // Offsetek
    const currentBox = new Box3().setFromObject(movingObject)
    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    const deltaBack = currentBox.min.z - movingObject.position.z
    const deltaFront = currentBox.max.z - movingObject.position.z

    // --- 1. PRIORITÁS: BÚTORHOZ IGAZÍTÁS ---
    for (const staticObject of otherObjects) {
      const staticBox = new Box3().setFromObject(staticObject)

      // Jobb oldalra
      const snapPosRight = proposedPosition.clone()
      snapPosRight.x = staticBox.max.x - deltaLeft
      if (Math.abs(proposedPosition.z - staticObject.position.z) < 0.5) {
        snapPosRight.z = staticObject.position.z
      }
      if (Math.abs(proposedPosition.x - snapPosRight.x) < MAX_SNAP_CHECK_DISTANCE) {
        candidates.push({
          priority: 1,
          position: snapPosRight,
          snapPoint: new Vector3(staticBox.max.x, currentY, snapPosRight.z),
          distance: proposedPosition.distanceTo(snapPosRight),
          targetObject: staticObject,
        })
      }

      // Bal oldalra
      const snapPosLeft = proposedPosition.clone()
      snapPosLeft.x = staticBox.min.x - deltaRight
      if (Math.abs(proposedPosition.z - staticObject.position.z) < 0.5) {
        snapPosLeft.z = staticObject.position.z
      }
      if (Math.abs(proposedPosition.x - snapPosLeft.x) < MAX_SNAP_CHECK_DISTANCE) {
        candidates.push({
          priority: 1,
          position: snapPosLeft,
          snapPoint: new Vector3(staticBox.min.x, currentY, snapPosLeft.z),
          distance: proposedPosition.distanceTo(snapPosLeft),
          targetObject: staticObject,
        })
      }
    }

    // --- 2. PRIORITÁS: FALHOZ IGAZÍTÁS ---

    // Bal Fal
    const snapPosWallLeft = proposedPosition.clone()
    snapPosWallLeft.x = -roomHalfWidth - deltaLeft
    if (Math.abs(proposedPosition.x - snapPosWallLeft.x) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallLeft,
        snapPoint: new Vector3(-roomHalfWidth, currentY, proposedPosition.z),
        distance: proposedPosition.distanceTo(snapPosWallLeft),
        targetObject: 'Wall Left',
      })
    }

    // Jobb Fal
    const snapPosWallRight = proposedPosition.clone()
    snapPosWallRight.x = roomHalfWidth - deltaRight
    if (Math.abs(proposedPosition.x - snapPosWallRight.x) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallRight,
        snapPoint: new Vector3(roomHalfWidth, currentY, proposedPosition.z),
        distance: proposedPosition.distanceTo(snapPosWallRight),
        targetObject: 'Wall Right',
      })
    }

    // Hátsó Fal
    const snapPosWallBack = proposedPosition.clone()
    snapPosWallBack.z = -roomHalfDepth - deltaBack
    if (Math.abs(proposedPosition.z - snapPosWallBack.z) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallBack,
        snapPoint: new Vector3(proposedPosition.x, currentY, -roomHalfDepth),
        distance: proposedPosition.distanceTo(snapPosWallBack),
        targetObject: 'Wall Back',
      })
    }

    // Első Fal
    const snapPosWallFront = proposedPosition.clone()
    snapPosWallFront.z = roomHalfDepth - deltaFront
    if (Math.abs(proposedPosition.z - snapPosWallFront.z) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallFront,
        snapPoint: new Vector3(proposedPosition.x, currentY, roomHalfDepth),
        distance: proposedPosition.distanceTo(snapPosWallFront),
        targetObject: 'Wall Front',
      })
    }

    // --- KIVÁLASZTÁS ---
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return a.distance - b.distance
      })

      const bestValidSnap = candidates.find(
        (c) => !this.isPositionColliding(movingObject, c.position, otherObjects),
      )

      if (bestValidSnap) {
        const debugBox =
          bestValidSnap.targetObject instanceof Group
            ? new Box3().setFromObject(bestValidSnap.targetObject)
            : new Box3()

        this.experience.debug.updateSnapHelpers(debugBox, bestValidSnap as any)
        return bestValidSnap.position
      }
    }

    // --- 3. PRIORITÁS: GRID + ÜTKÖZÉS BLOKKOLÁS ---

    let finalPos = new Vector3(
      this.snapToGrid(proposedPosition.x),
      currentY,
      this.snapToGrid(proposedPosition.z),
    )

    // 1. Ellenőrizzük a rácsra igazított pozíciót
    if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
      // 2. Ha a rács ütközik, megnézzük az eredeti egérpozíciót (hátha két rácspont között elfér)
      if (this.isPositionColliding(movingObject, proposedPosition, otherObjects)) {
        // 3. Ha az egérpozíció is ütközik, akkor BLOKKOLJUK a mozgást.
        // Visszaadjuk a bútor JELENLEGI pozícióját (ahol most áll).
        // Így a bútor "megakad" az akadály előtt.
        finalPos = movingObject.position.clone()
      } else {
        // Ha az egérpozíció jó (nem ütközik), akkor azt használjuk (finommozgás)
        finalPos = proposedPosition.clone()
      }
    }

    // --- 4. FALON BELÜL TARTÁS (Clamp) ---
    // Bármi is jött ki (Grid, Proposed vagy Blocked), kényszerítjük, hogy a szobán belül maradjon.
    finalPos = this.constrainToRoom(movingObject, finalPos)

    return finalPos
  }

  private getBoxAtPosition(object: Group, newPosition: Vector3): Box3 {
    const offset = newPosition.clone().sub(object.position)
    const box = new Box3().setFromObject(object)
    box.translate(offset)
    return box
  }
}
