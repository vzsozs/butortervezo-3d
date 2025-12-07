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

  private isPositionColliding(
    movingObject: Group,
    position: Vector3,
    objectsToCompare: Group[],
  ): boolean {
    const movingBox = this.getBoxAtPosition(movingObject, position)
    const tolerance = new Vector3(0.001, 0.001, 0.001)
    movingBox.expandByVector(tolerance.negate())

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue
      const staticBox = new Box3().setFromObject(staticObject)
      if (movingBox.intersectsBox(staticBox)) {
        return true
      }
    }
    return false
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT
  }

  private constrainToRoom(movingObject: Group, position: Vector3): Vector3 {
    const roomStore = useRoomStore()
    const halfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const halfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    const currentBox = new Box3().setFromObject(movingObject)

    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    // A deltaBack-et itt sem használjuk a hátsó falhoz, mert ott a Pivot a mérvadó!
    const deltaBack = currentBox.min.z - movingObject.position.z
    const deltaFront = currentBox.max.z - movingObject.position.z

    const constrained = position.clone()

    // X Clamp
    const minX = -halfWidth - deltaLeft
    const maxX = halfWidth - deltaRight
    constrained.x = MathUtils.clamp(constrained.x, minX, maxX)

    // Z Clamp
    // JAVÍTÁS: A hátsó falnál (minZ) közvetlenül a falhoz (-halfDepth) igazítunk.
    // Nem vonjuk le a deltaBack-et, mert a pivot pont a "szent", nem a doboz hátulja.
    const minZ = -halfDepth
    const maxZ = halfDepth - deltaFront
    constrained.z = MathUtils.clamp(constrained.z, minZ, maxZ)

    return constrained
  }

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    objectsToCompare: Group[],
  ): Vector3 {
    this.experience.debug.hideAll()

    // Y Rögzítés
    const fixedY = movingObject.position.y
    const flatProposedPosition = proposedPosition.clone()
    flatProposedPosition.y = fixedY

    const candidates: SnapCandidate[] = []
    const otherObjects = objectsToCompare.filter((obj) => obj.uuid !== movingObject.uuid)

    const roomStore = useRoomStore()
    const roomHalfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    // Offsetek
    const currentBox = new Box3().setFromObject(movingObject)
    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    // TS HIBA JAVÍTVA: deltaBack törölve, mert nem használtuk
    const deltaFront = currentBox.max.z - movingObject.position.z

    // --- 1. PRIORITÁS: BÚTORHOZ IGAZÍTÁS ---
    for (const staticObject of otherObjects) {
      const staticBox = new Box3().setFromObject(staticObject)

      // Jobb oldalra
      const snapPosRight = flatProposedPosition.clone()
      snapPosRight.x = staticBox.max.x - deltaLeft

      if (Math.abs(flatProposedPosition.z - staticObject.position.z) < 0.5) {
        snapPosRight.z = staticObject.position.z
      }

      if (Math.abs(flatProposedPosition.x - snapPosRight.x) < MAX_SNAP_CHECK_DISTANCE) {
        candidates.push({
          priority: 1,
          position: snapPosRight,
          snapPoint: new Vector3(staticBox.max.x, fixedY, snapPosRight.z),
          distance: flatProposedPosition.distanceTo(snapPosRight),
          targetObject: staticObject,
        })
      }

      // Bal oldalra
      const snapPosLeft = flatProposedPosition.clone()
      snapPosLeft.x = staticBox.min.x - deltaRight

      if (Math.abs(flatProposedPosition.z - staticObject.position.z) < 0.5) {
        snapPosLeft.z = staticObject.position.z
      }

      if (Math.abs(flatProposedPosition.x - snapPosLeft.x) < MAX_SNAP_CHECK_DISTANCE) {
        candidates.push({
          priority: 1,
          position: snapPosLeft,
          snapPoint: new Vector3(staticBox.min.x, fixedY, snapPosLeft.z),
          distance: flatProposedPosition.distanceTo(snapPosLeft),
          targetObject: staticObject,
        })
      }
    }

    // --- 2. PRIORITÁS: FALHOZ IGAZÍTÁS ---

    // Bal Fal
    const snapPosWallLeft = flatProposedPosition.clone()
    snapPosWallLeft.x = -roomHalfWidth - deltaLeft
    if (Math.abs(flatProposedPosition.x - snapPosWallLeft.x) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallLeft,
        snapPoint: new Vector3(-roomHalfWidth, fixedY, flatProposedPosition.z),
        distance: flatProposedPosition.distanceTo(snapPosWallLeft),
        targetObject: 'Wall Left',
      })
    }

    // Jobb Fal
    const snapPosWallRight = flatProposedPosition.clone()
    snapPosWallRight.x = roomHalfWidth - deltaRight
    if (Math.abs(flatProposedPosition.x - snapPosWallRight.x) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallRight,
        snapPoint: new Vector3(roomHalfWidth, fixedY, flatProposedPosition.z),
        distance: flatProposedPosition.distanceTo(snapPosWallRight),
        targetObject: 'Wall Right',
      })
    }

    // Hátsó Fal (PIVOT SNAP)
    const snapPosWallBack = flatProposedPosition.clone()
    snapPosWallBack.z = -roomHalfDepth

    if (Math.abs(flatProposedPosition.z - snapPosWallBack.z) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallBack,
        snapPoint: new Vector3(flatProposedPosition.x, fixedY, -roomHalfDepth),
        distance: Math.abs(flatProposedPosition.z - snapPosWallBack.z),
        targetObject: 'Wall Back',
      })
    }

    // Első Fal
    const snapPosWallFront = flatProposedPosition.clone()
    snapPosWallFront.z = roomHalfDepth - deltaFront
    if (Math.abs(flatProposedPosition.z - snapPosWallFront.z) < MAX_SNAP_CHECK_DISTANCE) {
      candidates.push({
        priority: 2,
        position: snapPosWallFront,
        snapPoint: new Vector3(flatProposedPosition.x, fixedY, roomHalfDepth),
        distance: flatProposedPosition.distanceTo(snapPosWallFront),
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

        let safeTarget = bestValidSnap.targetObject
        if (typeof safeTarget === 'string') {
          safeTarget = new Group()
          safeTarget.position.copy(bestValidSnap.snapPoint)
        }

        const safeCandidate = {
          ...bestValidSnap,
          targetObject: safeTarget,
        }

        this.experience.debug.updateSnapHelpers(debugBox, safeCandidate as any)
        return bestValidSnap.position
      }
    }

    // --- 3. GRID FALLBACK ---
    let finalPos = new Vector3(
      this.snapToGrid(flatProposedPosition.x),
      fixedY,
      this.snapToGrid(flatProposedPosition.z),
    )

    if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
      if (this.isPositionColliding(movingObject, flatProposedPosition, otherObjects)) {
        finalPos = movingObject.position.clone()
      } else {
        finalPos = flatProposedPosition.clone()
      }
    }

    // --- CONSTRAIN ---
    finalPos = this.constrainToRoom(movingObject, finalPos)

    if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
      return movingObject.position.clone()
    }

    return finalPos
  }

  private getBoxAtPosition(object: Group, newPosition: Vector3): Box3 {
    const offset = newPosition.clone().sub(object.position)
    const box = new Box3().setFromObject(object)
    box.translate(offset)
    return box
  }
}
