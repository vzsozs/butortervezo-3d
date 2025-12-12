import { Group, Vector3, Box3, MathUtils, Euler } from 'three'
import { FurnitureCategory } from '@/config/furniture'
import { useProceduralStore } from '../../stores/procedural'
import Experience from '../Experience'
import { useRoomStore } from '../../stores/room'

const MAX_SNAP_CHECK_DISTANCE = 0.4
const UNIT_SCALE = 0.001

type SnapAxis = 'x' | 'z' | 'y'

type SnapCandidate = {
  priority: number
  value: number
  snapEdge: number
  distance: number
  targetObject: Group | string
  axis: SnapAxis
  rotation?: Euler
}

export type PlacementResult = {
  position: Vector3
  rotation?: Euler
}

export default class PlacementManager {
  constructor(private experience: Experience) {}

  /**
   * Intelligens Bounding Box számítás.
   * Figyelem: A box tartalmazza a ProceduralManager által eltolt mesh-t!
   */
  private getBoundingBox(
    object: Group,
    excludeXOverhang: boolean = false,
    excludeWorktop: boolean = false,
  ): Box3 {
    object.updateMatrixWorld(true)

    // Alap Three.js box (benne van a Gap miatti eltolás!)
    const box = new Box3().setFromObject(object)

    const config = object.userData.config
    if (config && config.category === FurnitureCategory.BOTTOM_CABINET) {
      const proceduralStore = useProceduralStore()
      const worktopConf = proceduralStore.worktop

      // X irányú túllógás (sideOverhang)
      if (!excludeXOverhang) {
        const overhang = worktopConf.sideOverhang || 0
        box.min.x -= overhang
        box.max.x += overhang
      }

      // Z irányú kiterjesztés (Munkapult eleje)
      // A pult a Group Z=0-tól Z=defaultDepth-ig tart.
      // A box.max.z a korpusz eleje (Gap + Depth).
      // Ha a pult mélyebb mint a korpusz, akkor a boxot ki kell tolni.
      if (!excludeWorktop) {
        // Ez bonyolultabb forgatásnál, de egyenes állásnál:
        // A Group Z pozíciója a fal.
        // A pult vége lokálisan: defaultDepth.
        // World-ben: object.position.z + defaultDepth (ha 0 rotáció).
        // Hagyjuk a boxot ahogy van, az ütközéshez jó a fizikai kiterjedés.
      }
    }

    return box
  }

  private isPositionColliding(
    movingObject: Group,
    position: Vector3,
    objectsToCompare: Group[],
  ): boolean {
    const movingBox = this.getBoxAtPosition(movingObject, position, true)
    const tolerance = new Vector3(0.002, 0.002, 0.002)
    movingBox.expandByVector(tolerance.negate())

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue
      const staticBox = this.getBoundingBox(staticObject, true, false)
      if (movingBox.intersectsBox(staticBox)) {
        return true
      }
    }
    return false
  }

  private constrainToRoom(movingObject: Group, position: Vector3): Vector3 {
    const roomStore = useRoomStore()
    const halfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const halfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    const currentBox = this.getBoundingBox(movingObject, false, false)
    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    const deltaBack = currentBox.min.z - movingObject.position.z
    const deltaFront = currentBox.max.z - movingObject.position.z

    const constrained = position.clone()
    const minX = -halfWidth - deltaLeft
    const maxX = halfWidth - deltaRight
    if (minX > maxX) constrained.x = 0
    else constrained.x = MathUtils.clamp(constrained.x, minX, maxX)

    const minZ = -halfDepth - deltaBack
    const maxZ = halfDepth - deltaFront
    if (minZ > maxZ) constrained.z = 0
    else constrained.z = MathUtils.clamp(constrained.z, minZ, maxZ)

    return constrained
  }

  // --- ÚJ SNAP LOGIKA: GROUP ORIGIN ALAPÚ ---
  private getWallSnapCandidates(
    movingObject: Group,
    proposedPosition: Vector3,
  ): { x: SnapCandidate[]; z: SnapCandidate[] } {
    const roomStore = useRoomStore()
    const roomHalfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    const candidatesX: SnapCandidate[] = []
    const candidatesZ: SnapCandidate[] = []

    const config = movingObject.userData.config
    const isCorner = config && config.structureType === 'corner_L'

    // --- HÁTSÓ FAL (Z min) ---
    // Mindenkinek a háta (0,0) megy a falra
    const distBack = Math.abs(proposedPosition.z - -roomHalfDepth)
    if (distBack < MAX_SNAP_CHECK_DISTANCE) {
      candidatesZ.push({
        priority: 0,
        value: -roomHalfDepth,
        snapEdge: -roomHalfDepth,
        distance: distBack,
        targetObject: 'Wall Back',
        axis: 'z',
        rotation: new Euler(0, 0, 0),
      })
    }

    // --- ELSŐ FAL (Z max) ---
    const distFront = Math.abs(proposedPosition.z - roomHalfDepth)
    if (distFront < MAX_SNAP_CHECK_DISTANCE) {
      candidatesZ.push({
        priority: 0,
        value: roomHalfDepth,
        snapEdge: roomHalfDepth,
        distance: distFront,
        targetObject: 'Wall Front',
        axis: 'z',
        rotation: new Euler(0, Math.PI, 0),
      })
    }

    // --- BAL FAL (X min) ---
    // Sarokszekrénynél: A (0,0) origót snappeljük a falhoz!
    // Egyenesnél: A bal szélét (ami 0) snappeljük.
    // Tehát mindkét esetben a proposedPosition.x-et nézzük.
    const distLeft = Math.abs(proposedPosition.x - -roomHalfWidth)
    if (distLeft < MAX_SNAP_CHECK_DISTANCE) {
      candidatesX.push({
        priority: 0,
        value: -roomHalfWidth,
        snapEdge: -roomHalfWidth,
        distance: distLeft,
        targetObject: 'Wall Left',
        axis: 'x',
        rotation: new Euler(0, 0, 0),
      })
    }

    // --- JOBB FAL (X max) ---
    // Itt van a különbség!

    if (isCorner) {
      // Sarokszekrénynél a jobb falhoz illesztésnél el kell forgatni -90 fokkal.
      // Ekkor a "háta" (Z tengely) kerül a jobb falra.
      // A Group Origója (0,0) kerül a falra.
      const targetRight = roomHalfWidth
      const distRight = Math.abs(proposedPosition.x - targetRight)

      if (distRight < MAX_SNAP_CHECK_DISTANCE) {
        candidatesX.push({
          priority: 0,
          value: targetRight,
          snapEdge: roomHalfWidth,
          distance: distRight,
          targetObject: 'Wall Right',
          axis: 'x',
          rotation: new Euler(0, -Math.PI / 2, 0), // Forgatás jobbra
        })
      }
    } else {
      // Egyenes szekrénynél a jobb szélét (Width) snappeljük
      // Itt kell a bounding box, de vigyázat: a box tartalmazza a gap-et is!
      // A "hasznos" szélesség a config.width.
      const width = (config?.properties?.width ?? 600) / 1000
      const targetRight = roomHalfWidth - width
      const distRight = Math.abs(proposedPosition.x - targetRight)

      if (distRight < MAX_SNAP_CHECK_DISTANCE) {
        candidatesX.push({
          priority: 0,
          value: targetRight,
          snapEdge: roomHalfWidth,
          distance: distRight,
          targetObject: 'Wall Right',
          axis: 'x',
          rotation: new Euler(0, 0, 0),
        })
      }
    }

    return { x: candidatesX, z: candidatesZ }
  }

  private getObjectSnapCandidates(
    movingObject: Group,
    proposedPosition: Vector3,
    otherObjects: Group[],
  ): { x: SnapCandidate[]; z: SnapCandidate[]; y: SnapCandidate[] } {
    const candidatesX: SnapCandidate[] = []
    const candidatesZ: SnapCandidate[] = []
    const candidatesY: SnapCandidate[] = []

    const corpusBox = this.getBoundingBox(movingObject, true, false)
    const deltaLeft = corpusBox.min.x - movingObject.position.x
    const deltaRight = corpusBox.max.x - movingObject.position.x
    const deltaBack = corpusBox.min.z - movingObject.position.z

    const config = movingObject.userData.config
    const isUpperCabinet =
      config && (config.category === 'top_cabinets' || config.category === 'wall_cabinets')

    for (const staticObject of otherObjects) {
      const staticBox = this.getBoundingBox(staticObject, true, false)

      // X SNAP
      const zOverlap =
        (corpusBox.max.z > staticBox.min.z && corpusBox.min.z < staticBox.max.z) ||
        Math.abs(proposedPosition.z - staticObject.position.z) < 1.0
      if (zOverlap) {
        const snapPosRight = staticBox.max.x - deltaLeft
        if (Math.abs(proposedPosition.x - snapPosRight) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesX.push({
            priority: 1,
            value: snapPosRight,
            snapEdge: staticBox.max.x,
            distance: Math.abs(proposedPosition.x - snapPosRight),
            targetObject: staticObject,
            axis: 'x',
          })
        }
        const snapPosLeft = staticBox.min.x - deltaRight
        if (Math.abs(proposedPosition.x - snapPosLeft) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesX.push({
            priority: 1,
            value: snapPosLeft,
            snapEdge: staticBox.min.x,
            distance: Math.abs(proposedPosition.x - snapPosLeft),
            targetObject: staticObject,
            axis: 'x',
          })
        }
      }

      // Z SNAP
      const xOverlap =
        (corpusBox.max.x > staticBox.min.x && corpusBox.min.x < staticBox.max.x) ||
        Math.abs(proposedPosition.x - staticObject.position.x) < 1.0
      if (xOverlap) {
        const snapPosAlignBack = staticBox.min.z - deltaBack
        if (Math.abs(proposedPosition.z - snapPosAlignBack) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesZ.push({
            priority: 1,
            value: snapPosAlignBack,
            snapEdge: staticBox.min.z,
            distance: Math.abs(proposedPosition.z - snapPosAlignBack),
            targetObject: staticObject,
            axis: 'z',
          })
        }
      }

      // Y SNAP (Upper Cabinets)
      if (isUpperCabinet) {
        const c = staticObject.userData.config
        if (c && (c.category === 'top_cabinets' || c.category === 'wall_cabinets')) {
          const movingFullBox = this.getBoundingBox(movingObject, false, false)
          const deltaBottom = movingFullBox.min.y - movingObject.position.y
          const deltaTop = movingFullBox.max.y - movingObject.position.y
          const staticFullBox = this.getBoundingBox(staticObject, false, false)
          const distXZ = new Vector3(
            staticObject.position.x,
            0,
            staticObject.position.z,
          ).distanceTo(new Vector3(proposedPosition.x, 0, proposedPosition.z))

          if (distXZ < 3.0) {
            const snapPosBottom = staticFullBox.min.y - deltaBottom
            if (Math.abs(proposedPosition.y - snapPosBottom) < MAX_SNAP_CHECK_DISTANCE) {
              candidatesY.push({
                priority: 1,
                value: snapPosBottom,
                snapEdge: staticFullBox.min.y,
                distance: Math.abs(proposedPosition.y - snapPosBottom),
                targetObject: staticObject,
                axis: 'y',
              })
            }
            const snapPosTop = staticFullBox.max.y - deltaTop
            if (Math.abs(proposedPosition.y - snapPosTop) < MAX_SNAP_CHECK_DISTANCE) {
              candidatesY.push({
                priority: 1,
                value: snapPosTop,
                snapEdge: staticFullBox.max.y,
                distance: Math.abs(proposedPosition.y - snapPosTop),
                targetObject: staticObject,
                axis: 'y',
              })
            }
          }
        }
      }
    }

    return { x: candidatesX, z: candidatesZ, y: candidatesY }
  }

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    objectsToCompare: Group[],
  ): PlacementResult {
    this.experience.debug.hideAll()

    const fixedY = movingObject.position.y
    const flatProposedPosition = proposedPosition.clone()
    flatProposedPosition.y = fixedY

    const otherObjects = objectsToCompare.filter((obj) => obj.uuid !== movingObject.uuid)

    // 1. Get Candidates (Nincs Gap számítás, a Group origó a fal)
    const wallCandidates = this.getWallSnapCandidates(movingObject, flatProposedPosition)
    const objCandidates = this.getObjectSnapCandidates(
      movingObject,
      flatProposedPosition,
      otherObjects,
    )

    const candidatesX = [...wallCandidates.x, ...objCandidates.x]
    const candidatesZ = [...wallCandidates.z, ...objCandidates.z]
    const candidatesY = [...objCandidates.y]

    // 2. Sort Candidates
    const sortFn = (a: SnapCandidate, b: SnapCandidate) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.distance - b.distance
    }
    candidatesX.sort(sortFn)
    candidatesZ.sort(sortFn)
    candidatesY.sort(sortFn)

    // 3. Selection
    let finalX = flatProposedPosition.x
    let finalZ = flatProposedPosition.z
    let finalY = flatProposedPosition.y
    let finalRotation: Euler | undefined = undefined

    let usedCandidateX: SnapCandidate | undefined = undefined
    let usedCandidateZ: SnapCandidate | undefined = undefined
    let usedCandidateY: SnapCandidate | undefined = undefined

    if (candidatesX.length > 0) {
      usedCandidateX = candidatesX[0]
      if (usedCandidateX) finalX = usedCandidateX.value
    }

    if (candidatesZ.length > 0) {
      usedCandidateZ = candidatesZ[0]
      if (usedCandidateZ) finalZ = usedCandidateZ.value
    }

    if (candidatesY.length > 0) {
      usedCandidateY = candidatesY[0]
      if (usedCandidateY) finalY = usedCandidateY.value
    }

    // 4. Rotation Logic
    const isCornerCabinet = movingObject.userData.config?.structureType === 'corner_L'

    if (isCornerCabinet && usedCandidateX && usedCandidateZ) {
      const isLeft = usedCandidateX.targetObject === 'Wall Left'
      const isRight = usedCandidateX.targetObject === 'Wall Right'
      const isBack = usedCandidateZ.targetObject === 'Wall Back'
      const isFront = usedCandidateZ.targetObject === 'Wall Front'

      if (isBack && isLeft) finalRotation = new Euler(0, 0, 0)
      else if (isBack && isRight) finalRotation = new Euler(0, -Math.PI / 2, 0)
      else if (isFront && isRight) finalRotation = new Euler(0, Math.PI, 0)
      else if (isFront && isLeft) finalRotation = new Euler(0, Math.PI / 2, 0)
      else if (usedCandidateZ.rotation) finalRotation = usedCandidateZ.rotation
    } else {
      if (usedCandidateX && usedCandidateX.rotation) finalRotation = usedCandidateX.rotation
      if (usedCandidateZ && usedCandidateZ.rotation) {
        if (!usedCandidateX) finalRotation = usedCandidateZ.rotation
        else {
          if (
            usedCandidateZ.priority < usedCandidateX.priority ||
            (usedCandidateZ.priority === usedCandidateX.priority &&
              usedCandidateZ.distance < usedCandidateX.distance)
          ) {
            finalRotation = usedCandidateZ.rotation
          }
        }
      }
    }

    // 5. Final Position Construction & Collision Check
    let finalPos = new Vector3(finalX, finalY, finalZ)
    finalPos = this.constrainToRoom(movingObject, finalPos)

    if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
      const fallbackPos = this.constrainToRoom(movingObject, flatProposedPosition)
      if (!this.isPositionColliding(movingObject, fallbackPos, otherObjects)) {
        finalPos = fallbackPos
        usedCandidateX = undefined
        usedCandidateZ = undefined
        usedCandidateY = undefined
        finalRotation = undefined
      }
    }

    // 6. Visual Feedback
    if (usedCandidateX) this.drawSnapLine(usedCandidateX, finalPos, 'x')
    if (usedCandidateZ) this.drawSnapLine(usedCandidateZ, finalPos, 'z')
    if (usedCandidateY) this.drawSnapLine(usedCandidateY, finalPos, 'y')

    return { position: finalPos, rotation: finalRotation }
  }

  private drawSnapLine(candidate: SnapCandidate, objectPos: Vector3, axis: SnapAxis) {
    const start = new Vector3()
    const end = new Vector3()
    const size = 1.0
    let safeTarget = candidate.targetObject
    if (typeof safeTarget === 'string') safeTarget = new Group()

    const debugCandidate = {
      priority: candidate.priority,
      distance: candidate.distance,
      targetObject: safeTarget,
      position: objectPos.clone(),
      snapPoint: objectPos.clone(),
    }

    if (axis === 'x') {
      start.set(candidate.snapEdge, objectPos.y, objectPos.z - size)
      end.set(candidate.snapEdge, objectPos.y, objectPos.z + size)
      debugCandidate.snapPoint.x = candidate.snapEdge
    } else if (axis === 'z') {
      start.set(objectPos.x - size, objectPos.y, candidate.snapEdge)
      end.set(objectPos.x + size, objectPos.y, candidate.snapEdge)
      debugCandidate.snapPoint.z = candidate.snapEdge
    } else if (axis === 'y') {
      start.set(objectPos.x - size, candidate.snapEdge, objectPos.z)
      end.set(objectPos.x + size, candidate.snapEdge, objectPos.z)
      debugCandidate.snapPoint.y = candidate.snapEdge
    }

    const debugBox = new Box3().setFromPoints([start, end])
    this.experience.debug.updateSnapHelpers(debugBox, debugCandidate as any)
  }

  private getBoxAtPosition(
    object: Group,
    newPosition: Vector3,
    excludeXOverhang: boolean = false,
  ): Box3 {
    const offset = newPosition.clone().sub(object.position)
    const box = this.getBoundingBox(object, excludeXOverhang)
    box.translate(offset)
    return box
  }
}
