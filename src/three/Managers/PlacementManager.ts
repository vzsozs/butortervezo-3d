import { Group, Vector3, Box3, MathUtils, Mesh } from 'three'
import { FurnitureCategory } from '@/config/furniture'
import { useProceduralStore } from '../../stores/procedural'
import Experience from '../Experience'
import { useRoomStore } from '../../stores/room'

const SNAP_INCREMENT = 0.1
const MAX_SNAP_CHECK_DISTANCE = 0.3
const UNIT_SCALE = 0.001

type SnapAxis = 'x' | 'z' | 'y'

type SnapCandidate = {
  priority: number
  value: number
  snapEdge: number
  distance: number
  targetObject: Group | string
  axis: SnapAxis
}

export default class PlacementManager {
  constructor(private experience: Experience) {}

  /**
   * Intelligens Bounding Box számítás.
   * @param object A vizsgált bútor
   * @param excludeXOverhang Ha TRUE, akkor levágja a munkalap oldalsó túllógását (bútor-bútor illesztéshez).
   *                         Ha FALSE, akkor a teljes szélességet adja (falhoz illesztéshez).
   */
  private getBoundingBox(object: Group, excludeXOverhang: boolean = false): Box3 {
    // 1. Alap doboz (csak a korpusz)
    object.updateMatrixWorld(true)

    object.traverse((child) => {
      if (child instanceof Mesh && child.geometry && !child.geometry.boundingBox) {
        child.geometry.computeBoundingBox()
      }
    })

    const box = new Box3().setFromObject(object)

    // 2. "Virtuális" kiterjesztés a munkalap miatt
    const config = object.userData.config
    if (config && config.category === FurnitureCategory.BOTTOM_CABINET) {
      const proceduralStore = useProceduralStore()
      const worktopConf = proceduralStore.worktop

      // X irányú túllógás (sideOverhang)
      // CSAK akkor adjuk hozzá, ha NEM kérték a kizárását (excludeXOverhang = false)
      if (!excludeXOverhang) {
        const overhang = worktopConf.sideOverhang || 0
        box.min.x -= overhang
        box.max.x += overhang
      }

      // Z irányú kiterjesztés (Mélység) - Ez MINDIG kell, mert a falba hátrafelé sose lóghatunk
      const currentDepth = box.max.z - box.min.z
      const targetDepth = worktopConf.defaultDepth || 0.6

      if (targetDepth > currentDepth) {
        // Feltételezzük, hogy a munkalap hátrafelé terjeszkedik a korpuszhoz képest
        box.min.z = box.max.z - targetDepth
      }
    }

    return box
  }

  /**
   * Ütközésvizsgálatnál a KORPUSZOKAT nézzük (excludeXOverhang = true).
   * Így a munkalapok összeérhetnek/átfedhetnek, de a szekrények nem.
   */
  private isPositionColliding(
    movingObject: Group,
    position: Vector3,
    objectsToCompare: Group[],
  ): boolean {
    // Itt TRUE-t adunk át: a korpusz dobozát vizsgáljuk
    const movingBox = this.getBoxAtPosition(movingObject, position, true)
    const tolerance = new Vector3(0.002, 0.002, 0.002)
    movingBox.expandByVector(tolerance.negate())

    for (const staticObject of objectsToCompare) {
      if (movingObject === staticObject) continue
      // A többi bútornak is csak a korpuszát nézzük
      const staticBox = this.getBoundingBox(staticObject, true)
      if (movingBox.intersectsBox(staticBox)) {
        return true
      }
    }
    return false
  }

  private snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT
  }

  /**
   * Szoba határainál a TELJES méretet nézzük (excludeXOverhang = false).
   * A munkalap széle sem lóghat ki a falból.
   */
  private constrainToRoom(movingObject: Group, position: Vector3): Vector3 {
    const roomStore = useRoomStore()
    const halfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const halfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    // Itt FALSE: a munkalappal együtt számolunk
    const currentBox = this.getBoundingBox(movingObject, false)

    const deltaLeft = currentBox.min.x - movingObject.position.x
    const deltaRight = currentBox.max.x - movingObject.position.x
    const deltaBack = currentBox.min.z - movingObject.position.z
    const deltaFront = currentBox.max.z - movingObject.position.z

    const constrained = position.clone()

    // X Clamp
    const minX = -halfWidth - deltaLeft
    const maxX = halfWidth - deltaRight

    if (minX > maxX) {
      constrained.x = 0
    } else {
      constrained.x = MathUtils.clamp(constrained.x, minX, maxX)
    }

    // Z Clamp
    const minZ = -halfDepth - deltaBack
    const maxZ = halfDepth - deltaFront

    if (minZ > maxZ) {
      constrained.z = 0
    } else {
      constrained.z = MathUtils.clamp(constrained.z, minZ, maxZ)
    }

    return constrained
  }

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    objectsToCompare: Group[],
  ): Vector3 {
    this.experience.debug.hideAll()

    const fixedY = movingObject.position.y
    const flatProposedPosition = proposedPosition.clone()
    flatProposedPosition.y = fixedY

    const otherObjects = objectsToCompare.filter((obj) => obj.uuid !== movingObject.uuid)
    const roomStore = useRoomStore()
    const roomHalfWidth = (roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    // --- KÉTFAJTA DOBOZRA LESZ SZÜKSÉGÜNK ---

    // 1. Korpusz doboz (Bútorhoz igazításhoz) - Nincs X overhang
    const corpusBox = this.getBoundingBox(movingObject, true)
    const deltaLeftCorpus = corpusBox.min.x - movingObject.position.x
    const deltaRightCorpus = corpusBox.max.x - movingObject.position.x
    // A Z irányú delták közösek, mert mélységben mindig a legnagyobbat nézzük
    const deltaBack = corpusBox.min.z - movingObject.position.z
    const deltaFront = corpusBox.max.z - movingObject.position.z

    // 2. Teljes doboz (Falhoz igazításhoz) - Van X overhang
    const fullBox = this.getBoundingBox(movingObject, false)
    const deltaLeftFull = fullBox.min.x - movingObject.position.x
    const deltaRightFull = fullBox.max.x - movingObject.position.x

    const candidatesX: SnapCandidate[] = []
    const candidatesZ: SnapCandidate[] = []

    // --- A. BÚTORHOZ IGAZÍTÁS (Korpusz a Korpuszhoz) ---
    for (const staticObject of otherObjects) {
      // A statikus bútornak is a korpuszát kérjük el (true)
      const staticBox = this.getBoundingBox(staticObject, true)

      // X TENGELY SNAP
      // Itt a corpusBox-ot használjuk az átfedés vizsgálathoz is
      const zOverlap =
        (corpusBox.max.z > staticBox.min.z && corpusBox.min.z < staticBox.max.z) ||
        Math.abs(flatProposedPosition.z - staticObject.position.z) < 1.0

      if (zOverlap) {
        // Jobb oldalra (A statikus jobb oldala = A mozgó bal oldala)
        const snapPosRight = staticBox.max.x - deltaLeftCorpus
        if (Math.abs(flatProposedPosition.x - snapPosRight) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesX.push({
            priority: 1,
            value: snapPosRight,
            snapEdge: staticBox.max.x,
            distance: Math.abs(flatProposedPosition.x - snapPosRight),
            targetObject: staticObject,
            axis: 'x',
          })
        }

        // Bal oldalra (A statikus bal oldala = A mozgó jobb oldala)
        const snapPosLeft = staticBox.min.x - deltaRightCorpus
        if (Math.abs(flatProposedPosition.x - snapPosLeft) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesX.push({
            priority: 1,
            value: snapPosLeft,
            snapEdge: staticBox.min.x,
            distance: Math.abs(flatProposedPosition.x - snapPosLeft),
            targetObject: staticObject,
            axis: 'x',
          })
        }
      }

      // Z TENGELY SNAP (Hátlap a Hátlaphoz)
      const xOverlap =
        (corpusBox.max.x > staticBox.min.x && corpusBox.min.x < staticBox.max.x) ||
        Math.abs(flatProposedPosition.x - staticObject.position.x) < 1.0

      if (xOverlap) {
        const snapPosAlignBack = staticBox.min.z - deltaBack
        if (Math.abs(flatProposedPosition.z - snapPosAlignBack) < MAX_SNAP_CHECK_DISTANCE) {
          candidatesZ.push({
            priority: 1,
            value: snapPosAlignBack,
            snapEdge: staticBox.min.z,
            distance: Math.abs(flatProposedPosition.z - snapPosAlignBack),
            targetObject: staticObject,
            axis: 'z',
          })
        }
      }
    }

    // --- B. FALHOZ IGAZÍTÁS (Munkalap a Falhoz) ---
    // Itt a FULL doboz deltáit (deltaLeftFull, deltaRightFull) használjuk!

    // Bal Fal (X)
    const snapWallLeft = -roomHalfWidth - deltaLeftFull
    if (Math.abs(flatProposedPosition.x - snapWallLeft) < MAX_SNAP_CHECK_DISTANCE) {
      candidatesX.push({
        priority: 2,
        value: snapWallLeft,
        snapEdge: -roomHalfWidth,
        distance: Math.abs(flatProposedPosition.x - snapWallLeft),
        targetObject: 'Wall Left',
        axis: 'x',
      })
    }

    // Jobb Fal (X)
    const snapWallRight = roomHalfWidth - deltaRightFull
    if (Math.abs(flatProposedPosition.x - snapWallRight) < MAX_SNAP_CHECK_DISTANCE) {
      candidatesX.push({
        priority: 2,
        value: snapWallRight,
        snapEdge: roomHalfWidth,
        distance: Math.abs(flatProposedPosition.x - snapWallRight),
        targetObject: 'Wall Right',
        axis: 'x',
      })
    }

    // Hátsó Fal (Z) - Itt a deltaBack ugyanaz (munkalap hátrafelé lógása benne van)
    const snapWallBack = -roomHalfDepth - deltaBack
    if (Math.abs(flatProposedPosition.z - snapWallBack) < MAX_SNAP_CHECK_DISTANCE) {
      candidatesZ.push({
        priority: 2,
        value: snapWallBack,
        snapEdge: -roomHalfDepth,
        distance: Math.abs(flatProposedPosition.z - snapWallBack),
        targetObject: 'Wall Back',
        axis: 'z',
      })
    }

    // Első Fal (Z)
    const snapWallFront = roomHalfDepth - deltaFront
    if (Math.abs(flatProposedPosition.z - snapWallFront) < MAX_SNAP_CHECK_DISTANCE) {
      candidatesZ.push({
        priority: 2,
        value: snapWallFront,
        snapEdge: roomHalfDepth,
        distance: Math.abs(flatProposedPosition.z - snapWallFront),
        targetObject: 'Wall Front',
        axis: 'z',
      })
    }

    // --- C. Y-TENGELY SNAP (FELSŐ SZEKRÉNYEKHEZ) ---
    const config = movingObject.userData.config
    const isUpperCabinet =
      config && (config.category === 'top_cabinets' || config.category === 'wall_cabinets')

    const candidatesY: SnapCandidate[] = []

    if (isUpperCabinet) {
      // Csak más felső szekrényekhez igazítunk
      const upperCabinets = otherObjects.filter((o) => {
        const c = o.userData.config
        return c && (c.category === 'top_cabinets' || c.category === 'wall_cabinets')
      })

      // A teljes doboz magasságát nézzük
      const movingFullBox = this.getBoundingBox(movingObject, false)

      const deltaBottom = movingFullBox.min.y - movingObject.position.y
      const deltaTop = movingFullBox.max.y - movingObject.position.y

      const currentProposedY = flatProposedPosition.y

      for (const staticObject of upperCabinets) {
        const staticBox = this.getBoundingBox(staticObject, false)

        // Csak akkor snappelünk, ha "közel" vannak vízszintesen (hogy ne snappeljen a szoba másik végébe)
        // A sík távolságát vesszük alapul (X-Z sík)
        const distXZ = new Vector3(staticObject.position.x, 0, staticObject.position.z).distanceTo(
          new Vector3(flatProposedPosition.x, 0, flatProposedPosition.z),
        )

        // Ha 3 méteren belül van, engedjük a snappet
        if (distXZ < 3.0) {
          // 1. ALJ-ALJ Igazítás (Bottom align)
          const snapPosBottom = staticBox.min.y - deltaBottom
          if (Math.abs(currentProposedY - snapPosBottom) < MAX_SNAP_CHECK_DISTANCE) {
            candidatesY.push({
              priority: 1,
              value: snapPosBottom,
              snapEdge: staticBox.min.y,
              distance: Math.abs(currentProposedY - snapPosBottom),
              targetObject: staticObject,
              axis: 'y',
            })
          }

          // 2. TETŐ-TETŐ Igazítás (Top align)
          const snapPosTop = staticBox.max.y - deltaTop
          if (Math.abs(currentProposedY - snapPosTop) < MAX_SNAP_CHECK_DISTANCE) {
            candidatesY.push({
              priority: 1,
              value: snapPosTop,
              snapEdge: staticBox.max.y,
              distance: Math.abs(currentProposedY - snapPosTop),
              targetObject: staticObject,
              axis: 'y',
            })
          }

          // 3. ALJ-TETŐ (Egymás alá pakolás)
          const snapPosStackUnder = staticBox.min.y - deltaTop
          if (Math.abs(currentProposedY - snapPosStackUnder) < MAX_SNAP_CHECK_DISTANCE) {
            candidatesY.push({
              priority: 2,
              value: snapPosStackUnder,
              snapEdge: staticBox.min.y,
              distance: Math.abs(currentProposedY - snapPosStackUnder),
              targetObject: staticObject,
              axis: 'y',
            })
          }

          // 4. TETŐ-ALJ (Egymás fölé pakolás)
          const snapPosStackOver = staticBox.max.y - deltaBottom
          if (Math.abs(currentProposedY - snapPosStackOver) < MAX_SNAP_CHECK_DISTANCE) {
            candidatesY.push({
              priority: 2,
              value: snapPosStackOver,
              snapEdge: staticBox.max.y,
              distance: Math.abs(currentProposedY - snapPosStackOver),
              targetObject: staticObject,
              axis: 'y',
            })
          }
        }
      }
    }

    // --- KIVÁLASZTÁS ---

    const sortFn = (a: SnapCandidate, b: SnapCandidate) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.distance - b.distance
    }
    candidatesX.sort(sortFn)
    candidatesZ.sort(sortFn)
    candidatesY.sort(sortFn) // ÚJ

    let finalX = this.snapToGrid(flatProposedPosition.x)
    let finalZ = this.snapToGrid(flatProposedPosition.z)

    // JAVÍTÁS: Alapból a proposed (célzott) Y-t használjuk, kivéve ha találunk snappet
    let finalY = flatProposedPosition.y

    let usedCandidateX: SnapCandidate | null = null
    let usedCandidateZ: SnapCandidate | null = null
    let usedCandidateY: SnapCandidate | null = null // ÚJ

    if (candidatesX.length > 0) {
      const bestX = candidatesX[0]
      if (bestX) {
        finalX = bestX.value
        usedCandidateX = bestX
      }
    }

    if (candidatesZ.length > 0) {
      const bestZ = candidatesZ[0]
      if (bestZ) {
        finalZ = bestZ.value
        usedCandidateZ = bestZ
      }
    }

    if (candidatesY.length > 0) {
      const bestY = candidatesY[0]
      if (bestY) {
        finalY = bestY.value
        usedCandidateY = bestY
      }
    }

    // --- ÜTKÖZÉSVIZSGÁLAT (Kombinált) ---
    // JAVÍTÁS: Most már a finalY-t használjuk a fixedY helyett
    let finalPos = new Vector3(finalX, finalY, finalZ)

    // Szigorú szoba határ (Full Box-szal!)
    const constrainedPos = this.constrainToRoom(movingObject, finalPos)
    // Megjegyzés: A constrainToRoom jelenleg nem módosítja az Y-t.
    finalPos = constrainedPos

    if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
      // 1. Próba: Csak X snap (Z elengedve, Y tartva)
      const posXOnly = new Vector3(finalX, finalY, this.snapToGrid(flatProposedPosition.z))
      const constrainedX = this.constrainToRoom(movingObject, posXOnly)

      if (!this.isPositionColliding(movingObject, constrainedX, otherObjects)) {
        finalPos = constrainedX
        usedCandidateZ = null
      } else {
        // 2. Próba: Csak Z snap (X elengedve, Y tartva)
        const posZOnly = new Vector3(this.snapToGrid(flatProposedPosition.x), finalY, finalZ)
        const constrainedZ = this.constrainToRoom(movingObject, posZOnly)

        if (!this.isPositionColliding(movingObject, constrainedZ, otherObjects)) {
          finalPos = constrainedZ
          usedCandidateX = null
        } else {
          // 3. Próba: Egyik sem (Grid) - Y marad snappelt
          const posNoSnap = new Vector3(
            this.snapToGrid(flatProposedPosition.x),
            finalY,
            this.snapToGrid(flatProposedPosition.z),
          )
          finalPos = this.constrainToRoom(movingObject, posNoSnap)
          usedCandidateX = null
          usedCandidateZ = null

          if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
            // 4. Próba: Y snap elengedése (Vissza a proposed Y-ra)
            const posNoSnapY = new Vector3(
              this.snapToGrid(flatProposedPosition.x),
              flatProposedPosition.y,
              this.snapToGrid(flatProposedPosition.z),
            )
            finalPos = this.constrainToRoom(movingObject, posNoSnapY)
            usedCandidateY = null

            if (this.isPositionColliding(movingObject, finalPos, otherObjects)) {
              // VÉGSŐ FALLBACK: Vissza az eredeti pozícióra
              return this.constrainToRoom(movingObject, movingObject.position.clone())
            }
          }
        }
      }
    }

    // --- VIZUÁLIS VISSZAJELZÉS ---
    if (usedCandidateX) {
      this.drawSnapLine(usedCandidateX, finalPos, 'x')
    }
    if (usedCandidateZ) {
      this.drawSnapLine(usedCandidateZ, finalPos, 'z')
    }
    if (usedCandidateY) {
      this.drawSnapLine(usedCandidateY, finalPos, 'y')
    }

    return finalPos
  }

  private drawSnapLine(candidate: SnapCandidate, objectPos: Vector3, axis: SnapAxis) {
    const start = new Vector3()
    const end = new Vector3()
    const size = 1.0

    let safeTarget = candidate.targetObject
    if (typeof safeTarget === 'string') {
      safeTarget = new Group()
    }

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
      // Keresztet rajzolunk a síkban (vízszintes vonal)
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
