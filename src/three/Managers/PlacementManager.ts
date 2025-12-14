import {
  Group,
  Vector3,
  MathUtils,
  Euler,
  Matrix4,
  Vector2,
  LineSegments,
  MeshBasicMaterial,
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  Box3, // ✅ MOST MÁR ITT VAN!
} from 'three'
import { useProceduralStore } from '../../stores/procedural'
import { useRoomStore } from '../../stores/room'
import Experience from '../Experience'

// ==========================================================================
// 0. KONFIGURÁCIÓ
// ==========================================================================

export const WALL_IDS = {
  BACK: 0, // Z min
  RIGHT: 1, // X max
  FRONT: 2, // Z max
  LEFT: 3, // X min
} as const

const SNAP_DISTANCE = 0.6
const UNIT_SCALE = 0.001

type FootprintEdge = {
  p1: Vector2
  p2: Vector2
  type: 'back' | 'left' | 'right' | 'front'
}

type SnapResult = {
  position: Vector3
  rotation: Euler
  snappedWallIds: number[]
}

export default class PlacementManager {
  private proceduralStore = useProceduralStore()
  private roomStore = useRoomStore()

  // DEBUG HELPER GROUP
  private debugGroup: Group = new Group()

  constructor(private experience: Experience) {
    this.experience.scene.add(this.debugGroup)
  }

  // ==========================================================================
  // 1. FOOTPRINT LOGIKA (AUTOMATIKUS MÉRÉS - BOX3)
  // ==========================================================================

  private getFootprintEdges(object: Group): FootprintEdge[] {
    // 1. PRÓBA: Procedurális "Source of Truth" lekérdezése
    // Ez a legpontosabb, mert a konfigurációból számol, nem a geometriából
    if (this.experience.proceduralManager) {
      const points = this.experience.proceduralManager.getFootprintForPlacement(object)
      if (points.length > 0) {
        const edges: FootprintEdge[] = []
        for (let i = 0; i < points.length; i += 2) {
          // A ProceduralManager párosával adja vissza a pontokat (Start -> End) egy élhez
          // Vagy folyamatosan? A kód alapján: p1, p2 (egy szakasz), p3, p4 (következő szakasz)...
          // A ProceduralManager implementációban: push(p1), push(p2) minden típushoz.
          // Tehát i és i+1 egy élt alkot.
          if (i + 1 >= points.length) break

          const pStart = points[i]!
          const pEnd = points[i + 1]!

          edges.push({
            p1: new Vector2(pStart.x, pStart.z),
            p2: new Vector2(pEnd.x, pEnd.z),
            type: pStart.type as any,
          })
        }
        return edges
      }
    }

    // 2. FALLBACK: Geometriai mérés (Tight Box Fit)
    // Ha nincs procedurális adat, mérjük le a geometriát.
    // TRÜKK: Visszaforgatjuk 0-ra a mérés idejére, hogy a Box3 az objektum SAJÁT tengelyei mentén mérjen (OBB),
    // ne a világ tengelyei mentén (AABB). Így elkerüljük a doboz "hízását" forgatáskor.

    const visual = object.children.find((c) => c.type === 'Mesh' || c.type === 'Group')
    if (!visual) return []

    // a) Mentsük a jelenlegi állapotot
    const originalRotation = object.rotation.clone()

    // b) Forgatás nullázása és frissítés
    object.rotation.set(0, 0, 0)
    object.updateMatrixWorld(true) // Force update

    // c) Mérés a "tiszta" állapoton
    const box = new Box3().setFromObject(visual)
    const inverseMatrix = object.matrixWorld.clone().invert()

    // 2.a Minden sarokpontot transzformálunk (bár forgatás nélkül a sima box.min is elég lenne, de a biztonság kedvéért maradjon a logika)
    const corners = [
      new Vector3(box.min.x, box.min.y, box.min.z),
      new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z),
      new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z),
      new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z),
      new Vector3(box.max.x, box.max.y, box.max.z),
    ]

    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)

    corners.forEach((p) => {
      p.applyMatrix4(inverseMatrix)
      min.min(p)
      max.max(p)
    })

    // d) Állapot visszaállítása
    object.rotation.copy(originalRotation)
    object.updateMatrixWorld(true)

    // e) Élek generálása a lokális min/max-ból
    const edges: FootprintEdge[] = []

    const config = this.getConfig(object)
    const structureType = (config as any).structureType || 'standard'

    // Megjegyzés: Itt a structureType ellenőrzés csak az alakzat (L vs I) miatt kell,
    // de a méreteket már a pontos mérésből vesszük.

    if (structureType === 'corner_L') {
      // --- SAROKSZEKRÉNY (Box approximáció) ---
      // Bal él (X min)
      edges.push({
        p1: new Vector2(min.x, min.z),
        p2: new Vector2(min.x, max.z),
        type: 'left',
      })
      // Hátsó él (Z min)
      edges.push({
        p1: new Vector2(min.x, min.z),
        p2: new Vector2(max.x, min.z),
        type: 'back',
      })
      // Jobb él (X max)
      edges.push({
        p1: new Vector2(max.x, min.z),
        p2: new Vector2(max.x, max.z),
        type: 'right',
      })
      // Első él (Z max)
      edges.push({
        p1: new Vector2(min.x, max.z),
        p2: new Vector2(max.x, max.z),
        type: 'front',
      })
    } else {
      // --- EGYENES SZEKRÉNY ---
      // Hátsó (Z min)
      edges.push({
        p1: new Vector2(min.x, min.z),
        p2: new Vector2(max.x, min.z),
        type: 'back',
      })
      // Bal (X min)
      edges.push({
        p1: new Vector2(min.x, min.z),
        p2: new Vector2(min.x, max.z),
        type: 'left',
      })
      // Jobb (X max)
      edges.push({
        p1: new Vector2(max.x, min.z),
        p2: new Vector2(max.x, max.z),
        type: 'right',
      })
      // Első (Z max)
      edges.push({
        p1: new Vector2(min.x, max.z),
        p2: new Vector2(max.x, max.z),
        type: 'front',
      })
    }

    return edges
  }

  // ==========================================================================
  // 2. FŐ KALKULÁCIÓ
  // ==========================================================================

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    _objectsToCompare: Group[],
  ): SnapResult {
    this.debugGroup.clear()

    const roomHalfWidth = (this.roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (this.roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    const distBack = Math.abs(proposedPosition.z - -roomHalfDepth)
    const distRight = Math.abs(proposedPosition.x - roomHalfWidth)
    const distFront = Math.abs(proposedPosition.z - roomHalfDepth)
    const distLeft = Math.abs(proposedPosition.x - -roomHalfWidth)

    const nearBack = distBack < SNAP_DISTANCE
    const nearRight = distRight < SNAP_DISTANCE
    const nearFront = distFront < SNAP_DISTANCE
    const nearLeft = distLeft < SNAP_DISTANCE

    const activeWalls: number[] = []
    if (nearBack) activeWalls.push(WALL_IDS.BACK)
    if (nearRight) activeWalls.push(WALL_IDS.RIGHT)
    if (nearFront) activeWalls.push(WALL_IDS.FRONT)
    if (nearLeft) activeWalls.push(WALL_IDS.LEFT)

    const config = this.getConfig(movingObject)
    const structureType = config?.structureType || config?.properties?.structureType || 'standard'
    const isCorner = structureType === 'corner_L'

    let result: SnapResult | null = null

    if (isCorner && activeWalls.length >= 2) {
      result = this.solveCornerLogic(movingObject, activeWalls, roomHalfWidth, roomHalfDepth)
    }

    if (!result && activeWalls.length > 0) {
      const primaryWall = activeWalls[0]!
      result = this.solveWallLogic(
        movingObject,
        primaryWall,
        proposedPosition,
        roomHalfWidth,
        roomHalfDepth,
      )
    }

    if (!result) {
      const constrained = this.constrainToRoom(
        movingObject,
        proposedPosition,
        movingObject.rotation,
      )
      result = {
        position: constrained,
        rotation: movingObject.rotation,
        snappedWallIds: [],
      }
    }

    this.drawDebugVisuals(movingObject, result.position, result.rotation)

    return result
  }

  // ==========================================================================
  // 3. LOGIKAI MEGOLDÓK
  // ==========================================================================

  private solveCornerLogic(
    obj: Group,
    walls: number[],
    roomW: number,
    roomD: number,
  ): SnapResult | null {
    const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

    for (const rotY of rotations) {
      const rotEuler = new Euler(0, rotY, 0)
      const edges = this.getFootprintEdges(obj)
      const rotMatrix = new Matrix4().makeRotationFromEuler(rotEuler)

      let deltaX = 0
      let deltaZ = 0
      let matchedX = false
      let matchedZ = false

      const wallCoords: Record<number, number> = {
        [WALL_IDS.BACK]: -roomD,
        [WALL_IDS.FRONT]: roomD,
        [WALL_IDS.LEFT]: -roomW,
        [WALL_IDS.RIGHT]: roomW,
      }

      for (const wallId of walls) {
        const wallCoord = wallCoords[wallId]!
        let edge: FootprintEdge | null = null

        if (wallId === WALL_IDS.BACK) {
          edge = this.findEdgeFacing(edges, rotMatrix, 'negZ')
          if (edge) {
            deltaZ = wallCoord - this.getEdgeWorldZ(edge, rotMatrix, 0)
            matchedZ = true
          }
        } else if (wallId === WALL_IDS.FRONT) {
          edge = this.findEdgeFacing(edges, rotMatrix, 'posZ')
          if (edge) {
            deltaZ = wallCoord - this.getEdgeWorldZ(edge, rotMatrix, 0)
            matchedZ = true
          }
        } else if (wallId === WALL_IDS.LEFT) {
          edge = this.findEdgeFacing(edges, rotMatrix, 'negX')
          if (edge) {
            deltaX = wallCoord - this.getEdgeWorldX(edge, rotMatrix, 0)
            matchedX = true
          }
        } else if (wallId === WALL_IDS.RIGHT) {
          edge = this.findEdgeFacing(edges, rotMatrix, 'posX')
          if (edge) {
            deltaX = wallCoord - this.getEdgeWorldX(edge, rotMatrix, 0)
            matchedX = true
          }
        }
      }

      if (!matchedX || !matchedZ) continue

      const proposedPos = new Vector3(deltaX, 0, deltaZ)
      const bounds = this.getRotatedFootprintBounds(obj, rotEuler)
      const TOLERANCE = 0.05

      const isInside =
        proposedPos.x + bounds.minX >= -roomW - TOLERANCE &&
        proposedPos.x + bounds.maxX <= roomW + TOLERANCE &&
        proposedPos.z + bounds.minZ >= -roomD - TOLERANCE &&
        proposedPos.z + bounds.maxZ <= roomD + TOLERANCE

      if (isInside) {
        return { position: proposedPos, rotation: rotEuler, snappedWallIds: walls }
      }
    }
    return null
  }

  private solveWallLogic(
    obj: Group,
    wallId: number,
    currentPos: Vector3,
    roomW: number,
    roomD: number,
  ): SnapResult | null {
    let targetRotY = 0
    if (wallId === WALL_IDS.BACK) targetRotY = 0
    else if (wallId === WALL_IDS.RIGHT) targetRotY = -Math.PI / 2
    else if (wallId === WALL_IDS.FRONT) targetRotY = Math.PI
    else if (wallId === WALL_IDS.LEFT) targetRotY = Math.PI / 2

    const rotEuler = new Euler(0, targetRotY, 0)
    const rotMatrix = new Matrix4().makeRotationFromEuler(rotEuler)
    const edges = this.getFootprintEdges(obj)

    let deltaX = 0
    let deltaZ = 0
    let lockedX = false
    let lockedZ = false

    if (wallId === WALL_IDS.BACK) {
      const edge = this.findEdgeFacing(edges, rotMatrix, 'negZ')
      if (edge) {
        deltaZ = -roomD - this.getEdgeWorldZ(edge, rotMatrix, currentPos.z)
        lockedZ = true
      }
    } else if (wallId === WALL_IDS.FRONT) {
      const edge = this.findEdgeFacing(edges, rotMatrix, 'posZ')
      if (edge) {
        deltaZ = roomD - this.getEdgeWorldZ(edge, rotMatrix, currentPos.z)
        lockedZ = true
      }
    } else if (wallId === WALL_IDS.LEFT) {
      const edge = this.findEdgeFacing(edges, rotMatrix, 'negX')
      if (edge) {
        deltaX = -roomW - this.getEdgeWorldX(edge, rotMatrix, currentPos.x)
        lockedX = true
      }
    } else if (wallId === WALL_IDS.RIGHT) {
      const edge = this.findEdgeFacing(edges, rotMatrix, 'posX')
      if (edge) {
        deltaX = roomW - this.getEdgeWorldX(edge, rotMatrix, currentPos.x)
        lockedX = true
      }
    }

    const finalPos = currentPos.clone()
    if (lockedX) finalPos.x += deltaX
    if (lockedZ) finalPos.z += deltaZ

    const constrained = this.constrainToRoom(obj, finalPos, rotEuler)
    return { position: constrained, rotation: rotEuler, snappedWallIds: [wallId] }
  }

  // ==========================================================================
  // 4. DEBUG VIZUALIZÁCIÓ
  // ==========================================================================

  private drawDebugVisuals(obj: Group, pos: Vector3, rot: Euler) {
    // 1. PIVOT PONT (Kék gömb)
    const pivotGeo = new SphereGeometry(0.05, 16, 16)
    const pivotMat = new MeshBasicMaterial({ color: 0x0000ff, depthTest: false })
    const pivotMesh = new Mesh(pivotGeo, pivotMat)
    pivotMesh.position.copy(pos)
    this.debugGroup.add(pivotMesh)

    const edges = this.getFootprintEdges(obj)
    const rotMatrix = new Matrix4().makeRotationFromEuler(rot)
    const HEIGHT = 0.9

    const points: number[] = []

    edges.forEach((edge) => {
      const v1_bottom = new Vector3(edge.p1.x, 0, edge.p1.y).applyMatrix4(rotMatrix).add(pos)
      const v2_bottom = new Vector3(edge.p2.x, 0, edge.p2.y).applyMatrix4(rotMatrix).add(pos)
      const v1_top = new Vector3(edge.p1.x, HEIGHT, edge.p1.y).applyMatrix4(rotMatrix).add(pos)
      const v2_top = new Vector3(edge.p2.x, HEIGHT, edge.p2.y).applyMatrix4(rotMatrix).add(pos)

      // Zárt doboz rajzolása
      points.push(v1_bottom.x, v1_bottom.y, v1_bottom.z, v2_bottom.x, v2_bottom.y, v2_bottom.z)
      points.push(v1_top.x, v1_top.y, v1_top.z, v2_top.x, v2_top.y, v2_top.z)
      points.push(v1_bottom.x, v1_bottom.y, v1_bottom.z, v1_top.x, v1_top.y, v1_top.z)
      points.push(v2_bottom.x, v2_bottom.y, v2_bottom.z, v2_top.x, v2_top.y, v2_top.z)
    })

    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new Float32BufferAttribute(points, 3))

    // ZÖLD SZÍN = MÉRÉS ALAPÚ DOBOZ
    const lineMat = new MeshBasicMaterial({
      color: 0x00ff00,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    })
    const wireframe = new LineSegments(lineGeo, lineMat)
    this.debugGroup.add(wireframe)

    // Irányjelző
    const forwardVec = new Vector3(0, 0, 0.5).applyMatrix4(rotMatrix).add(pos)
    const dirPoints = [pos.x, pos.y + 0.1, pos.z, forwardVec.x, forwardVec.y + 0.1, forwardVec.z]
    const dirGeo = new BufferGeometry()
    dirGeo.setAttribute('position', new Float32BufferAttribute(dirPoints, 3))
    const dirLine = new LineSegments(
      dirGeo,
      new MeshBasicMaterial({ color: 0xffff00, depthTest: false }),
    )
    this.debugGroup.add(dirLine)
  }

  // ==========================================================================
  // SEGÉDFÜGGVÉNYEK
  // ==========================================================================

  private getEdgeWorldZ(edge: FootprintEdge, rotMatrix: Matrix4, offsetZ: number): number {
    const midX = (edge.p1.x + edge.p2.x) / 2
    const midZ = (edge.p1.y + edge.p2.y) / 2
    const vec = new Vector3(midX, 0, midZ).applyMatrix4(rotMatrix)
    return offsetZ + vec.z
  }

  private getEdgeWorldX(edge: FootprintEdge, rotMatrix: Matrix4, offsetX: number): number {
    const midX = (edge.p1.x + edge.p2.x) / 2
    const midZ = (edge.p1.y + edge.p2.y) / 2
    const vec = new Vector3(midX, 0, midZ).applyMatrix4(rotMatrix)
    return offsetX + vec.x
  }

  private findEdgeFacing(
    edges: FootprintEdge[],
    rotMatrix: Matrix4,
    direction: string,
  ): FootprintEdge | null {
    let bestEdge: FootprintEdge | null = null
    let bestVal = direction.startsWith('pos') ? -Infinity : Infinity

    for (const edge of edges) {
      const p1 = new Vector3(edge.p1.x, 0, edge.p1.y).applyMatrix4(rotMatrix)
      const p2 = new Vector3(edge.p2.x, 0, edge.p2.y).applyMatrix4(rotMatrix)

      const isAlignedZ = Math.abs(p1.x - p2.x) < 0.01
      const isAlignedX = Math.abs(p1.z - p2.z) < 0.01

      if (direction.endsWith('X') && !isAlignedZ) continue
      if (direction.endsWith('Z') && !isAlignedX) continue

      const val = direction.endsWith('X') ? (p1.x + p2.x) / 2 : (p1.z + p2.z) / 2

      if (direction.startsWith('pos')) {
        if (val > bestVal) {
          bestVal = val
          bestEdge = edge
        }
      } else {
        if (val < bestVal) {
          bestVal = val
          bestEdge = edge
        }
      }
    }
    return bestEdge
  }

  private getRotatedFootprintBounds(
    obj: Group,
    rot: Euler,
  ): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const edges = this.getFootprintEdges(obj)
    const matrix = new Matrix4().makeRotationFromEuler(rot)

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity
    if (edges.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }

    edges.forEach((edge) => {
      ;[edge.p1, edge.p2].forEach((p) => {
        const vec = new Vector3(p.x, 0, p.y).applyMatrix4(matrix)
        if (vec.x < minX) minX = vec.x
        if (vec.x > maxX) maxX = vec.x
        if (vec.z < minZ) minZ = vec.z
        if (vec.z > maxZ) maxZ = vec.z
      })
    })
    return { minX, maxX, minZ, maxZ }
  }

  private constrainToRoom(obj: Group, pos: Vector3, rot: Euler): Vector3 {
    const roomW = (this.roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomD = (this.roomStore.roomDimensions.depth * UNIT_SCALE) / 2
    const bounds = this.getRotatedFootprintBounds(obj, rot)

    const minAllowedX = -roomW - bounds.minX
    const maxAllowedX = roomW - bounds.maxX
    const minAllowedZ = -roomD - bounds.minZ
    const maxAllowedZ = roomD - bounds.maxZ

    const safeX = minAllowedX > maxAllowedX ? 0 : MathUtils.clamp(pos.x, minAllowedX, maxAllowedX)
    const safeZ = minAllowedZ > maxAllowedZ ? 0 : MathUtils.clamp(pos.z, minAllowedZ, maxAllowedZ)

    return new Vector3(safeX, pos.y, safeZ)
  }

  private getConfig(object: Group): any {
    return object.userData.config || null
  }
}
