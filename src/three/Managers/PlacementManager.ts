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
  Box3,
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
const OBJECT_SNAP_DISTANCE = 0.2 // Kicsit szigorúbb a bútoroknál
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
  snappedObjectId?: string // Debug infó
  isColliding: boolean // ÚJ: Jelezzük, ha baj van
}

export default class PlacementManager {
  private proceduralStore = useProceduralStore()
  private roomStore = useRoomStore()

  // DEBUG
  private debugGroup: Group = new Group()
  public debugMode: boolean = true // 🟡 3. FELADAT: Kapcsoló

  constructor(private experience: Experience) {
    this.experience.scene.add(this.debugGroup)
  }

  private isUpperCabinet(obj: Group): boolean {
    const config = this.getConfig(obj)
    return (
      (config as any)?.category === 'TopCabinet' ||
      (config as any)?.category === 'WallCabinet' ||
      config?.id?.includes('top_')
    )
  }

  private getDefaultHeightForObject(obj: Group): number {
    const config = this.getConfig(obj)
    const category = config?.category || config?.properties?.category

    // 1. FELSŐSZEKRÉNY DETEKTÁLÁS
    const isUpperCabinet =
      category === 'TopCabinet' ||
      category === 'WallCabinet' ||
      (config?.id && config.id.includes('top_'))

    if (isUpperCabinet) {
      // Admin beállítás vagy default 145cm
      if (config?.properties?.defaultHeight !== undefined) {
        return Number(config.properties.defaultHeight) * UNIT_SCALE
      }
      if (config?.defaultHeight !== undefined) {
        return Number(config.defaultHeight) * UNIT_SCALE
      }
      return 1.45
    }

    // 2. ALSÓSZEKRÉNYEK / ÁLLÓSZEKRÉNYEK (LÁBAZAT KEZELÉS)
    // Ha nem felsőszekrény, akkor feltételezzük, hogy lábon áll.
    // Lekérjük az aktuális lábazat magasságot a store-ból.
    const plinthHeight = this.proceduralStore?.plinth?.height ?? 0.15 // Default 15cm fallback

    return plinthHeight
  }

  // ==========================================================================
  // ÚJ: VERTIKÁLIS POZÍCIÓ ÉS SNAP SZÁMÍTÁS
  // ==========================================================================
  private calculateVerticalPosition(
    movingObj: Group,
    proposedPos: Vector3,
    others: Group[],
  ): number {
    const isUpper = this.isUpperCabinet(movingObj)

    // 1. ALSÓSZEKRÉNYEK: Fixen a lábazaton/padlón
    if (!isUpper) {
      return this.proceduralStore?.plinth?.height ?? 0.15
    }

    // 2. FELSŐSZEKRÉNYEK LOGIKÁJA

    // Alapértelmezett magasság (pl. 145cm)
    const defaultHeight = this.getDefaultHeightForObject(movingObj)

    // A javasolt magasság az egér pozíciójából
    let targetY = proposedPos.y

    // A) PADLÓ VÉDELEM (Lerakás segítése)
    // Ha az egér a padlón van (pl. < 50cm), akkor ne csússzon a földön a felsőszekrény,
    // hanem ugorjon fel a default magasságra. Ez oldja meg a "lerakásnál legyen fix" kérést.
    if (targetY < 0.5) {
      targetY = defaultHeight
    }

    // B) DEFAULT HEIGHT SNAP (Mágneses alapmagasság)
    // Ha közel vagyunk az alapbeállításhoz (pl. 15cm), odaugrunk.
    if (Math.abs(targetY - defaultHeight) < 0.15) {
      targetY = defaultHeight
    }

    // C) SZOMSZÉD SNAP (Igazodás más felsőszekrényekhez)
    // Megnézzük, van-e olyan bútor, aminek az aljához vagy tetejéhez igazodhatunk.

    const SNAP_Y_DIST = 0.1 // 10cm snap távolság
    let bestSnapDist = Infinity
    let snappedY = targetY

    // Saját magasság kiszámolása
    const myBox = new Box3().setFromObject(movingObj)
    const myHeight = myBox.max.y - myBox.min.y

    for (const other of others) {
      if (other === movingObj) continue
      if (!this.isUpperCabinet(other)) continue // Csak felsőhöz igazodjunk

      const otherBox = new Box3().setFromObject(other)
      const otherBottom = other.position.y // Feltételezve, hogy a pivot lent van
      const otherTop = otherBottom + (otherBox.max.y - otherBox.min.y)

      // Lehetséges igazodási pontok:
      // 1. Alja az Aljához (Bottom-Bottom)
      const distBB = Math.abs(targetY - otherBottom)
      if (distBB < SNAP_Y_DIST && distBB < bestSnapDist) {
        bestSnapDist = distBB
        snappedY = otherBottom
      }

      // 2. Teteje a Tetejéhez (Top-Top)
      // A saját tetőnk: targetY + myHeight
      // Cél: targetY + myHeight = otherTop  =>  targetY = otherTop - myHeight
      const targetForTopAlign = otherTop - myHeight
      const distTT = Math.abs(targetY - targetForTopAlign)
      if (distTT < SNAP_Y_DIST && distTT < bestSnapDist) {
        bestSnapDist = distTT
        snappedY = targetForTopAlign
      }

      // (Opcionális: Alja a Tetejéhez, stb. de konyhánál a fenti kettő a lényeg)
    }

    // Ha találtunk snap-et, azt használjuk
    if (bestSnapDist < Infinity) {
      return snappedY
    }

    return targetY
  }

  // ==========================================================================
  // SEGÉDFÜGGVÉNY: GAP LEKÉRÉSE (ÚJ)
  // ==========================================================================
  private getWallGap(obj: Group): number {
    // Lekérjük a ProceduralManager-től a pontos gap értéket.
    // Ha valamiért nem elérhető, fallback-nek marad a 0.05 (5cm).
    return this.experience.proceduralManager?.calculateGap(obj) ?? 0.05
  }

  // ==========================================================================
  // SEGÉDFÜGGVÉNY: TÚLLÓGÁS LEKÉRDEZÉSE
  // ==========================================================================
  private getOverhangForDirection(obj: Group, worldDirection: Vector3): number {
    const config = this.getConfig(obj)
    const overhangData = config?.overhang ?? config?.properties?.overhang ?? config?.overhangs ?? {}
    const structureType = config?.structureType ?? config?.properties?.structureType ?? 'standard'

    // 1. FELSŐSZEKRÉNY DETEKTÁLÁS
    // Ugyanaz a logika, amit a magasságnál is használtunk
    const isUpper =
      (config as any)?.category === 'TopCabinet' || // Ha van ilyen Enum értéked
      (config as any)?.category === 'WallCabinet' ||
      config?.id?.includes('top_')

    // 2. ALAPÉRTÉK MEGHATÁROZÁSA
    // Ha felsőszekrény -> 0 (nincs munkalap túllógás, korpusz a korpuszhoz)
    // Ha alsó -> Store érték (munkalap túllógás)
    const currentStoreOverhang = isUpper ? 0 : (this.proceduralStore?.worktop?.sideOverhang ?? 0)

    // 3. SAROK LOGIKA
    // Ha 0 az alap, akkor a sarok adjustment is 0 lesz, ami felsőnél általában jó.
    // Ha alsó, akkor marad a duplázás.
    const CORNER_ADJUSTMENT = currentStoreOverhang * 2

    const isCorner = structureType === 'corner_L'

    const getValMm = (val: any, isCornerSide: boolean = false) => {
      if (val !== undefined && val !== null) return Number(val) * UNIT_SCALE

      if (isCornerSide) return CORNER_ADJUSTMENT

      return currentStoreOverhang
    }

    const localDir = worldDirection.clone().applyQuaternion(obj.quaternion.clone().invert())

    // --- 1. BAL OLDAL (-X) ---
    if (localDir.x < -0.5) {
      const v = getValMm(overhangData.left, isCorner)
      this.logOverhang(obj, worldDirection, v, `Left (-X) [isCorner:${isCorner}]`)
      return v
    }

    // --- 2. JOBB OLDAL (+X) ---
    if (localDir.x > 0.5) {
      if (isCorner) return 0
      const val = getValMm(overhangData.right, false)
      this.logOverhang(obj, worldDirection, val, `Right (+X)`)
      return val
    }

    // --- 3. HÁTULJA (-Z) ---
    if (localDir.z < -0.5) {
      const v = getValMm(overhangData.back, isCorner)
      this.logOverhang(obj, worldDirection, v, `Back (-Z) [isCorner:${isCorner}]`)
      return v
    }

    // --- 4. ELEJE (+Z) ---
    if (localDir.z > 0.5) {
      if (isCorner) return 0
      const val = getValMm(overhangData.front, false)
      this.logOverhang(obj, worldDirection, val, `Front (+Z)`)
      return val
    }

    return 0
  }

  // DEBUG helper wrapper
  private logOverhang(obj: Group, dir: Vector3, val: number, ctx: string) {
    if (!this.debugMode) return
    const conf = this.getConfig(obj)
    const type = conf?.structureType || 'unknown'
    console.log(
      `[SnapDebug] ${ctx} | Type: ${type} | Dir: ${dir.x},${dir.y},${dir.z} | Overhang: ${val}`,
    )
  }

  // ==========================================================================
  // 1. FOOTPRINT LOGIKA
  // ==========================================================================

  private getFootprintEdges(object: Group): FootprintEdge[] {
    // 1. PRÓBA: Procedurális "Source of Truth"
    if (this.experience.proceduralManager) {
      const points = this.experience.proceduralManager.getFootprintForPlacement(object)
      if (points.length > 0) {
        const edges: FootprintEdge[] = []
        for (let i = 0; i < points.length; i += 2) {
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

    // 2. FALLBACK: Box3 mérés (JAVÍTOTT)
    // Nem keresgélünk 'visual' gyereket, hanem az egész objektumot mérjük.
    // Ez sokkal biztosabb, megtalálja a mélyen lévő Mesh-eket is.

    const originalRotation = object.rotation.clone()
    object.rotation.set(0, 0, 0)
    object.updateMatrixWorld(true)

    // JAVÍTÁS: setFromObject(object) a visual helyett
    const box = new Box3().setFromObject(object)

    // Ha üres a box (pl. még nincs betöltve), adjunk vissza egy default méretet, hogy ne menjen ki
    if (box.isEmpty()) {
      const s = 0.3 // 30cm default
      box.min.set(-s, 0, -s)
      box.max.set(s, s, s)
    }

    const inverseMatrix = object.matrixWorld.clone().invert()

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

    object.rotation.copy(originalRotation)
    object.updateMatrixWorld(true)

    const edges: FootprintEdge[] = []
    const config = this.getConfig(object)
    const structureType = (config as any).structureType || 'standard'

    if (structureType === 'corner_L') {
      edges.push({ p1: new Vector2(min.x, min.z), p2: new Vector2(min.x, max.z), type: 'left' })
      edges.push({ p1: new Vector2(min.x, min.z), p2: new Vector2(max.x, min.z), type: 'back' })
      edges.push({ p1: new Vector2(max.x, min.z), p2: new Vector2(max.x, max.z), type: 'right' })
      edges.push({ p1: new Vector2(min.x, max.z), p2: new Vector2(max.x, max.z), type: 'front' })
    } else {
      edges.push({ p1: new Vector2(min.x, min.z), p2: new Vector2(max.x, min.z), type: 'back' })
      edges.push({ p1: new Vector2(min.x, min.z), p2: new Vector2(min.x, max.z), type: 'left' })
      edges.push({ p1: new Vector2(max.x, min.z), p2: new Vector2(max.x, max.z), type: 'right' })
      edges.push({ p1: new Vector2(min.x, max.z), p2: new Vector2(max.x, max.z), type: 'front' })
    }

    return edges
  }

  // ==========================================================================
  // 2. FŐ KALKULÁCIÓ
  // ==========================================================================

  public calculateFinalPosition(
    movingObject: Group,
    proposedPosition: Vector3,
    objectsToCompare: Group[],
  ): SnapResult {
    if (this.debugMode) this.debugGroup.clear()

    const roomHalfWidth = (this.roomStore.roomDimensions.width * UNIT_SCALE) / 2
    const roomHalfDepth = (this.roomStore.roomDimensions.depth * UNIT_SCALE) / 2

    // Fal közelség vizsgálat
    const distBack = Math.abs(proposedPosition.z - -roomHalfDepth)
    const distRight = Math.abs(proposedPosition.x - roomHalfWidth)
    const distFront = Math.abs(proposedPosition.z - roomHalfDepth)
    const distLeft = Math.abs(proposedPosition.x - -roomHalfWidth)

    const activeWalls: number[] = []
    if (distBack < SNAP_DISTANCE) activeWalls.push(WALL_IDS.BACK)
    if (distRight < SNAP_DISTANCE) activeWalls.push(WALL_IDS.RIGHT)
    if (distFront < SNAP_DISTANCE) activeWalls.push(WALL_IDS.FRONT)
    if (distLeft < SNAP_DISTANCE) activeWalls.push(WALL_IDS.LEFT)

    const config = this.getConfig(movingObject)
    const structureType = config?.structureType ?? config?.properties?.structureType ?? 'standard'
    const isCorner = structureType === 'corner_L'

    let result: SnapResult | null = null

    // A) SAROK SNAP
    if (isCorner && activeWalls.length >= 2) {
      result = this.solveCornerLogic(movingObject, activeWalls, roomHalfWidth, roomHalfDepth)
    }

    // B) FAL SNAP + BÚTOR SNAP
    if (!result && activeWalls.length > 0) {
      const primaryWall = activeWalls[0]!
      const wallSnapResult = this.solveWallLogic(
        movingObject,
        primaryWall,
        proposedPosition,
        roomHalfWidth,
        roomHalfDepth,
      )

      if (wallSnapResult) {
        const lockedAxis =
          primaryWall === WALL_IDS.BACK || primaryWall === WALL_IDS.FRONT ? 'z' : 'x'

        const objectSnapPos = this.solveObjectLogic(
          movingObject,
          wallSnapResult.position,
          wallSnapResult.rotation,
          objectsToCompare,
          lockedAxis,
        )

        if (objectSnapPos) {
          // Ha találtunk bútort, frissítjük a pozíciót
          wallSnapResult.position.copy(objectSnapPos)
          wallSnapResult.snappedObjectId = 'object-secondary'

          // 🔴 JAVÍTÁS 1: BIZTONSÁGI KORLÁTOZÁS
          // Mivel a solveObjectLogic eltolhatta a bútort a szabad tengelyen,
          // ellenőrizni kell, nem toltuk-e ki a szobából oldalirányba.
          const safePos = this.constrainToRoom(
            movingObject,
            wallSnapResult.position,
            wallSnapResult.rotation,
          )
          wallSnapResult.position.copy(safePos)
        }
        result = wallSnapResult
      }
    }

    // C) CSAK BÚTOR SNAP
    if (!result) {
      const currentRot = movingObject.rotation
      const objectSnapPos = this.solveObjectLogic(
        movingObject,
        proposedPosition,
        currentRot,
        objectsToCompare,
        null,
      )

      if (objectSnapPos) {
        // 🔴 JAVÍTÁS 2: BIZTONSÁGI KORLÁTOZÁS (EZ A KRITIKUS!)
        // Ha a fal snap már elengedte (0.6 fölött), de a bútor snap még fogja (0.2),
        // akkor eddig ez a pont simán kivihette a falon túlra.
        // Most ráhúzzuk a szoba határait.
        const safePos = this.constrainToRoom(movingObject, objectSnapPos, currentRot)

        result = {
          position: safePos, // objectSnapPos helyett safePos
          rotation: currentRot,
          snappedWallIds: [],
          snappedObjectId: 'object-primary',
          isColliding: false,
        }
      }
    }

    // D) FALLBACK
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
        isColliding: false,
      }
    }

    // Magasság beállítása (Padló vagy Default)
    result.position.y = this.calculateVerticalPosition(
      movingObject,
      proposedPosition,
      objectsToCompare,
    )

    // Szellem bútor vizuális korrekciója
    this.applyPreviewGap(movingObject, isCorner)

    // Ütközésvizsgálat (Ez már a 3D-s verzió, amit az előbb írtunk, így jó lesz)
    result.isColliding = this.checkCollision(
      movingObject,
      result.position,
      result.rotation,
      objectsToCompare,
    )

    if (this.debugMode) {
      // Ha kellenek a befoglaló dobozok kirajzolása ezt kell visszakapcsolni.
      // this.drawDebugVisuals(movingObject, result.position, result.rotation, result.isColliding)
    }

    return result
  }

  // ==========================================================================
  // ÚJ SEGÉDFÜGGVÉNY: PREVIEW GAP
  // ==========================================================================
  private applyPreviewGap(obj: Group, isCorner: boolean) {
    // 1. Megkeressük a vizuális modellt a Group-on belül
    const visualModel = obj.children.find((c) => c.type === 'Group' || c.type === 'Mesh')
    if (!visualModel) return

    // 2. Lekérjük a szükséges gap-et
    const gap = this.getWallGap(obj)

    // 3. Alkalmazzuk a helyi eltolást (ugyanaz a logika, mint a ProceduralManager-ben)
    // Fontos: Ez a Group lokális koordinátarendszerében történik!
    if (isCorner) {
      // Sarokszekrény: X és Z irányba is eltoljuk
      visualModel.position.set(gap, 0, gap)
    } else {
      // Egyenes szekrény: Csak mélységben (Z) toljuk el
      // (Feltételezve, hogy a modell Z+ felé néz vagy onnan indul)
      visualModel.position.set(0, 0, gap)
    }

    // Frissítjük a mátrixot, hogy a bounding box számítások pontosak legyenek
    visualModel.updateMatrix()
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
        return {
          position: proposedPos,
          rotation: rotEuler,
          snappedWallIds: walls,
          isColliding: false,
        }
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

    return {
      position: constrained,
      rotation: rotEuler,
      snappedWallIds: [wallId],
      isColliding: false,
    }
  }

  // 🔴 1. FELADAT IMPLEMENTÁCIÓJA: Bútor-Bútor Snap
  private solveObjectLogic(
    movingObj: Group,
    currentPos: Vector3,
    currentRot: Euler,
    others: Group[],
    lockedAxis: 'x' | 'z' | null,
  ): Vector3 | null {
    const movingEdges = this.getFootprintEdges(movingObj)
    const movingMatrix = new Matrix4().makeRotationFromEuler(currentRot)

    // FONTOS: A segédfüggvényhez be kell állítani a kvaterniót a tervezett forgatásra!
    const originalQuat = movingObj.quaternion.clone()
    movingObj.setRotationFromEuler(currentRot)
    movingObj.updateMatrix() // Biztos ami biztos

    const bestPos = currentPos.clone()
    const minDistance = OBJECT_SNAP_DISTANCE

    let snappedX = false
    let snappedZ = false

    for (const other of others) {
      if (other === movingObj) continue

      // 🔴 ÚJ SZŰRÉS: KATEGÓRIA ALAPJÁN
      const isMovingUpper = this.isUpperCabinet(movingObj)
      const isOtherUpper = this.isUpperCabinet(other)

      // SZABÁLY: Alsószekrény (moving) NEM snappelhet Felsőszekrényhez (other)
      // De fordítva (Felső az Alsóhoz) engedjük, hogy lehessen igazítani őket.
      if (!isMovingUpper && isOtherUpper) {
        continue
      }

      const otherEdges = this.getFootprintEdges(other)
      const otherMatrix = new Matrix4().makeRotationFromEuler(other.rotation)
      const otherPos = other.position

      // --- X TENGELY SNAP ---
      if (lockedAxis !== 'x') {
        // 1. ESET: Mozgó BAL oldala (Világ -X) vs Másik JOBB oldala (Világ +X)
        const movingLeftEdge = this.findEdgeFacing(movingEdges, movingMatrix, 'negX')
        const otherRightEdge = this.findEdgeFacing(otherEdges, otherMatrix, 'posX')

        if (movingLeftEdge && otherRightEdge) {
          const mX_Visual = this.getEdgeWorldX(movingLeftEdge, movingMatrix, currentPos.x)
          const oX_Visual = this.getEdgeWorldX(otherRightEdge, otherMatrix, otherPos.x)

          const mOffset = this.getOverhangForDirection(movingObj, new Vector3(-1, 0, 0))
          const oOffset = this.getOverhangForDirection(other, new Vector3(1, 0, 0))

          if (this.debugMode) {
            console.log(`[Snap X] MOVING Left (-X) vs OTHER Right (+X)`)
            console.log(`   Moving Offset: ${mOffset}, Other Offset: ${oOffset}`)
          }

          const mX_Carcass = mX_Visual + mOffset
          const oX_Carcass = oX_Visual - oOffset

          const dist = Math.abs(mX_Carcass - oX_Carcass)

          if (dist < minDistance) {
            const delta = oX_Carcass - mX_Carcass
            bestPos.x = currentPos.x + delta
            snappedX = true
          }
        }

        // 2. ESET: Mozgó JOBB oldala (Világ +X) vs Másik BAL oldala (Világ -X)
        const movingRightEdge = this.findEdgeFacing(movingEdges, movingMatrix, 'posX')
        const otherLeftEdge = this.findEdgeFacing(otherEdges, otherMatrix, 'negX')

        if (movingRightEdge && otherLeftEdge) {
          const mX_Visual = this.getEdgeWorldX(movingRightEdge, movingMatrix, currentPos.x)
          const oX_Visual = this.getEdgeWorldX(otherLeftEdge, otherMatrix, otherPos.x)

          const mOffset = this.getOverhangForDirection(movingObj, new Vector3(1, 0, 0))
          const oOffset = this.getOverhangForDirection(other, new Vector3(-1, 0, 0))

          if (this.debugMode) {
            console.log(`[Snap X] MOVING Right (+X) vs OTHER Left (-X)`)
            console.log(`   Moving Offset: ${mOffset}, Other Offset: ${oOffset}`)
          }

          const mX_Carcass = mX_Visual - mOffset
          const oX_Carcass = oX_Visual + oOffset

          const dist = Math.abs(mX_Carcass - oX_Carcass)

          if (dist < minDistance) {
            const delta = oX_Carcass - mX_Carcass
            bestPos.x = currentPos.x + delta
            snappedX = true
          }
        }
      }

      // --- Z TENGELY SNAP ---
      if (lockedAxis !== 'z') {
        // 3. ESET: Mozgó HÁTSÓ (Világ -Z) vs Másik ELSŐ (Világ +Z)
        const movingBackEdge = this.findEdgeFacing(movingEdges, movingMatrix, 'negZ')
        const otherFrontEdge = this.findEdgeFacing(otherEdges, otherMatrix, 'posZ')

        if (movingBackEdge && otherFrontEdge) {
          const mZ_Visual = this.getEdgeWorldZ(movingBackEdge, movingMatrix, currentPos.z)
          const oZ_Visual = this.getEdgeWorldZ(otherFrontEdge, otherMatrix, otherPos.z)

          const mOffset = this.getOverhangForDirection(movingObj, new Vector3(0, 0, -1))
          const oOffset = this.getOverhangForDirection(other, new Vector3(0, 0, 1))

          if (this.debugMode) {
            console.log(`[Snap Z] MOVING Back (-Z) vs OTHER Front (+Z)`)
            console.log(`   Moving Offset: ${mOffset}, Other Offset: ${oOffset}`)
          }

          const mZ_Carcass = mZ_Visual + mOffset
          const oZ_Carcass = oZ_Visual - oOffset

          const dist = Math.abs(mZ_Carcass - oZ_Carcass)

          if (dist < minDistance) {
            const delta = oZ_Carcass - mZ_Carcass
            bestPos.z = currentPos.z + delta
            snappedZ = true
          }
        }

        // 4. ESET: Mozgó ELSŐ (Világ +Z) vs Másik HÁTSÓ (Világ -Z)
        const movingFrontEdge = this.findEdgeFacing(movingEdges, movingMatrix, 'posZ')
        const otherBackEdge = this.findEdgeFacing(otherEdges, otherMatrix, 'negZ')

        if (movingFrontEdge && otherBackEdge) {
          const mZ_Visual = this.getEdgeWorldZ(movingFrontEdge, movingMatrix, currentPos.z)
          const oZ_Visual = this.getEdgeWorldZ(otherBackEdge, otherMatrix, otherPos.z)

          const mOffset = this.getOverhangForDirection(movingObj, new Vector3(0, 0, 1))
          const oOffset = this.getOverhangForDirection(other, new Vector3(0, 0, -1))

          if (this.debugMode) {
            console.log(`[Snap Z] MOVING Front (+Z) vs OTHER Back (-Z)`)
            console.log(`   Moving Offset: ${mOffset}, Other Offset: ${oOffset}`)
          }

          const mZ_Carcass = mZ_Visual - mOffset
          const oZ_Carcass = oZ_Visual + oOffset

          const dist = Math.abs(mZ_Carcass - oZ_Carcass)

          if (dist < minDistance) {
            const delta = oZ_Carcass - mZ_Carcass
            bestPos.z = currentPos.z + delta
            snappedZ = true
          }
        }
      }
    }

    // Visszaállítjuk az eredeti állapotot
    movingObj.quaternion.copy(originalQuat)
    movingObj.updateMatrix()

    if (snappedX || snappedZ) {
      return bestPos
    }

    return null
  }

  // 🔴 2. Ütközésvizsgálat (3D - Magassággal együtt)
  private checkCollision(movingObj: Group, pos: Vector3, rot: Euler, others: Group[]): boolean {
    // 1. Mozgó objektum 2D határai (Footprint)
    const myBoundsLocal = this.getRotatedFootprintBounds(movingObj, rot)
    const myMinX = pos.x + myBoundsLocal.minX + 0.01
    const myMaxX = pos.x + myBoundsLocal.maxX - 0.01
    const myMinZ = pos.z + myBoundsLocal.minZ + 0.01
    const myMaxZ = pos.z + myBoundsLocal.maxZ - 0.01

    // 2. Mozgó objektum MAGASSÁGI határai (Y tengely)
    // Mivel a Box3 a világkoordinátákat nézi, trükköznünk kell kicsit,
    // mert a movingObj még nincs a 'pos' helyen fizikailag.

    // Lemérjük az objektum saját magasságát (bounding box height)
    const tempBox = new Box3().setFromObject(movingObj)
    const height = tempBox.max.y - tempBox.min.y

    // A tervezett Y pozíció (pos.y) az alja, a teteje pedig pos.y + height
    // (Feltételezve, hogy a pivot pont az alján van, ami nálad így van)
    const myMinY = pos.y + 0.01 // Kis tolerancia
    const myMaxY = pos.y + height - 0.01

    for (const other of others) {
      if (other === movingObj) continue

      // --- A) MAGASSÁG VIZSGÁLAT (Gyors szűrés) ---
      // Megnézzük a másik objektum magasságát a világban
      const otherBox = new Box3().setFromObject(other)

      // Ha nincs átfedés Y-ban, akkor NINCS ütközés, mehetünk tovább
      // (pl. alsószekrény vs felsőszekrény)
      if (myMaxY < otherBox.min.y || myMinY > otherBox.max.y) {
        continue
      }

      // --- B) ALAPRAJZ (2D) VIZSGÁLAT ---
      // Ha magasságban összeérnek, akkor megnézzük, hogy síkban is összeérnek-e
      const otherBoundsLocal = this.getRotatedFootprintBounds(other, other.rotation)
      const otherMinX = other.position.x + otherBoundsLocal.minX
      const otherMaxX = other.position.x + otherBoundsLocal.maxX
      const otherMinZ = other.position.z + otherBoundsLocal.minZ
      const otherMaxZ = other.position.z + otherBoundsLocal.maxZ

      const overlapX = myMinX < otherMaxX && myMaxX > otherMinX
      const overlapZ = myMinZ < otherMaxZ && myMaxZ > otherMinZ

      if (overlapX && overlapZ) {
        return true // Tényleges 3D ütközés
      }
    }

    return false
  }

  // ==========================================================================
  // 4. DEBUG VIZUALIZÁCIÓ
  // ==========================================================================

  private drawDebugVisuals(obj: Group, pos: Vector3, rot: Euler, isColliding: boolean) {
    // 1. PIVOT PONT
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

      points.push(v1_bottom.x, v1_bottom.y, v1_bottom.z, v2_bottom.x, v2_bottom.y, v2_bottom.z)
      points.push(v1_top.x, v1_top.y, v1_top.z, v2_top.x, v2_top.y, v2_top.z)
      points.push(v1_bottom.x, v1_bottom.y, v1_bottom.z, v1_top.x, v1_top.y, v1_top.z)
      points.push(v2_bottom.x, v2_bottom.y, v2_bottom.z, v2_top.x, v2_top.y, v2_top.z)
    })

    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new Float32BufferAttribute(points, 3))

    // SZÍN: Zöld ha oké, Piros ha ütközik
    const color = isColliding ? 0xff0000 : 0x00ff00
    const lineMat = new MeshBasicMaterial({
      color: color,
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
    // 1. Procedurális config (pl. Corpus config a store-ból)
    if (this.experience.proceduralManager) {
      const proceduralConfig = this.experience.proceduralManager.getCorpusConfig(object)
      if (proceduralConfig) return proceduralConfig
    }

    // 2. Fallback
    return object.userData.config || null
  }
}
