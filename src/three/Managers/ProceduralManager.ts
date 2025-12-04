import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import type Experience from '../Experience'
import { useExperienceStore } from '@/stores/experience'
import { useConfigStore } from '@/stores/config'

export default class ProceduralManager {
  private experience: Experience
  private scene: THREE.Scene
  private experienceStore = useExperienceStore()
  private configStore = useConfigStore()

  private worktopMesh: THREE.Mesh | null = null
  private plinthMesh: THREE.Mesh | null = null

  private isDebugMode = false
  private debugHelpers: THREE.Group = new THREE.Group()

  private config = {
    worktop: {
      height: 0.03,
      elevation: 0.87,
      defaultDepth: 0.6,
      sideOverhang: 0.015,
      gapThreshold: 0.2,
      material: new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
    },
    plinth: {
      height: 0.1,
      depthOffset: 0.05,
      material: new THREE.MeshStandardMaterial({ color: 0x333333 }),
    },
  }

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene
    this.scene.add(this.debugHelpers)
  }

  public update() {
    this.debugHelpers.clear()
    this.generateWorktop()
    this.generatePlinth()
  }

  private getCorpusConfig(obj: THREE.Object3D) {
    const state = obj.userData.componentState || {}
    for (const componentId of Object.values(state)) {
      if (typeof componentId !== 'string') continue
      const compConfig = this.configStore.getComponentById(componentId)
      if (compConfig && (compConfig as any).category === 'bottom_cabinet') {
        return compConfig
      }
    }
    return null
  }

  private hasStandardLeg(obj: THREE.Object3D): boolean {
    const state = obj.userData.componentState || {}
    return Object.values(state).some(
      (val: any) => typeof val === 'string' && val.includes('leg_standard'),
    )
  }

  private checkNeighbors(currentObj: THREE.Object3D, allObjects: THREE.Object3D[], width: number) {
    const tolerance = this.config.worktop.gapThreshold

    const box = new THREE.Box3().setFromObject(currentObj)
    const center = new THREE.Vector3()
    box.getCenter(center)

    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(currentObj.quaternion).normalize()
    const leftDir = rightDir.clone().negate()

    const rightEdgePos = center.clone().add(rightDir.clone().multiplyScalar(width / 2))
    const leftEdgePos = center.clone().add(leftDir.clone().multiplyScalar(width / 2))

    let hasLeft = false
    let hasRight = false

    for (const other of allObjects) {
      if (other === currentObj) continue

      const otherConfig = this.getCorpusConfig(other)
      if (!otherConfig) continue
      const otherWidth = (otherConfig.properties?.width ?? 600) / 1000

      const otherBox = new THREE.Box3().setFromObject(other)
      const otherCenter = new THREE.Vector3()
      otherBox.getCenter(otherCenter)

      const otherRightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(other.quaternion).normalize()
      const otherLeftDir = otherRightDir.clone().negate()

      const otherRightEdge = otherCenter
        .clone()
        .add(otherRightDir.clone().multiplyScalar(otherWidth / 2))
      const otherLeftEdge = otherCenter
        .clone()
        .add(otherLeftDir.clone().multiplyScalar(otherWidth / 2))

      if (leftEdgePos.distanceTo(otherRightEdge) < tolerance) hasLeft = true
      if (rightEdgePos.distanceTo(otherLeftEdge) < tolerance) hasRight = true
    }

    return { hasLeft, hasRight }
  }

  private generateWorktop() {
    if (this.worktopMesh) {
      this.scene.remove(this.worktopMesh)
      this.worktopMesh.geometry.dispose()
      this.worktopMesh = null
    }

    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      return this.getCorpusConfig(obj) !== null
    })

    if (cabinets.length === 0) return

    const polygons: any[] = []
    let maxCorpusHeight = 0

    const cabinetData: any[] = []

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const box = new THREE.Box3().setFromObject(cabinet)
      if (box.max.y > maxCorpusHeight) maxCorpusHeight = box.max.y

      const width = rawWidth / 1000
      const neighbors = this.checkNeighbors(cabinet, cabinets, width)
      const corners = this.getWorktopCorners(cabinet, width, neighbors)

      polygons.push([corners])

      cabinetData.push({
        corners: corners,
        center: cabinet.position.clone(),
      })
    })

    // Híd generálás
    for (let i = 0; i < cabinetData.length; i++) {
      for (let j = i + 1; j < cabinetData.length; j++) {
        const cabA = cabinetData[i]
        const cabB = cabinetData[j]

        if (cabA.center.distanceTo(cabB.center) > 1.5) continue

        const distBack = Math.hypot(
          cabA.corners[1][0] - cabB.corners[0][0],
          cabA.corners[1][1] - cabB.corners[0][1],
        )

        if (distBack > 0.001 && distBack < this.config.worktop.gapThreshold) {
          const bridge = [cabA.corners[1], cabB.corners[0], cabB.corners[3], cabA.corners[2]]
          polygons.push([bridge])
        }

        const distBackRev = Math.hypot(
          cabA.corners[0][0] - cabB.corners[1][0],
          cabA.corners[0][1] - cabB.corners[1][1],
        )
        if (distBackRev > 0.001 && distBackRev < this.config.worktop.gapThreshold) {
          const bridge = [cabB.corners[1], cabA.corners[0], cabA.corners[3], cabB.corners[2]]
          polygons.push([bridge])
        }
      }
    }

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)

      // JAVÍTÁS: Tömböt kérünk vissza
      const shapes = this.createShapesFromPolygon(merged)

      // Lyukak
      cabinets.forEach((cabinet) => {
        if (cabinet.userData.hasSink || cabinet.userData.hasHob) {
          const corpusConfig = this.getCorpusConfig(cabinet)
          if (!corpusConfig) return
          const rawWidth = corpusConfig.properties?.width ?? 600
          const rawDepth = corpusConfig.properties?.depth ?? 560
          const holeWidth = rawWidth / 1000 - 0.1
          const holeDepth = rawDepth / 1000 - 0.1
          const holeCorners = this.getWorktopCorners(
            cabinet,
            holeWidth,
            { hasLeft: true, hasRight: true },
            true,
            holeDepth,
          )

          if (holeCorners && holeCorners.length > 0) {
            const holeShape = new THREE.Shape()
            const p0 = holeCorners[0]
            if (p0) {
              holeShape.moveTo(p0[0], p0[1])
              for (let i = 1; i < holeCorners.length; i++) {
                const pi = holeCorners[i]
                if (pi) holeShape.lineTo(pi[0], pi[1])
              }
              // A lyukat minden shape-hez hozzáadjuk (egyszerűsítés, az ExtrudeGeometry kezeli)
              // Vagy precízebben: megkeressük melyik shape-be esik.
              // De mivel a lyukak "kivonást" jelentenek, ha hozzáadjuk az összeshez,
              // csak ahhoz fog tartozni, amelyikben fizikailag benne van.
              shapes.forEach((s) => s.holes.push(holeShape))
            }
          }
        }
      })

      // JAVÍTÁS: Az ExtrudeGeometry elfogad Shape[] tömböt is!
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: this.config.worktop.height,
        bevelEnabled: false,
      })

      this.worktopMesh = new THREE.Mesh(geometry, this.config.worktop.material)
      this.worktopMesh.name = 'ProceduralWorktop'
      this.worktopMesh.rotation.x = -Math.PI / 2

      // JAVÍTÁS: 3mm emelés a csíkozódás ellen
      this.worktopMesh.position.y =
        (maxCorpusHeight > 0.5 ? maxCorpusHeight : this.config.worktop.elevation) + 0.003

      this.applyWorldUVs(geometry)

      this.worktopMesh.castShadow = true
      this.worktopMesh.receiveShadow = true
      this.scene.add(this.worktopMesh)
    } catch (error) {
      console.error('❌ Error generating worktop:', error)
    }
  }

  private generatePlinth() {
    if (this.plinthMesh) {
      this.scene.remove(this.plinthMesh)
      this.plinthMesh.geometry.dispose()
      this.plinthMesh = null
    }

    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      const isBottom = this.getCorpusConfig(obj) !== null
      const hasLegs = this.hasStandardLeg(obj)
      return isBottom && hasLegs
    })

    if (cabinets.length === 0) return

    const polygons: any[] = []
    const cabinetData: any[] = []

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const rawDepth = corpusConfig.properties?.depth ?? 560

      const width = rawWidth / 1000
      const depth = rawDepth / 1000 - this.config.plinth.depthOffset

      const zOffset = -this.config.plinth.depthOffset / 2
      const corners = this.getPlinthCorners(cabinet, width, depth, zOffset)

      polygons.push([corners])

      cabinetData.push({
        corners: corners,
        center: cabinet.position.clone(),
      })
    })

    // Lábazat híd
    for (let i = 0; i < cabinetData.length; i++) {
      for (let j = i + 1; j < cabinetData.length; j++) {
        const cabA = cabinetData[i]
        const cabB = cabinetData[j]
        if (cabA.center.distanceTo(cabB.center) > 1.5) continue

        const distBack = Math.hypot(
          cabA.corners[1][0] - cabB.corners[0][0],
          cabA.corners[1][1] - cabB.corners[0][1],
        )
        if (distBack > 0.001 && distBack < this.config.worktop.gapThreshold) {
          const bridge = [cabA.corners[1], cabB.corners[0], cabB.corners[3], cabA.corners[2]]
          polygons.push([bridge])
        }
        const distBackRev = Math.hypot(
          cabA.corners[0][0] - cabB.corners[1][0],
          cabA.corners[0][1] - cabB.corners[1][1],
        )
        if (distBackRev > 0.001 && distBackRev < this.config.worktop.gapThreshold) {
          const bridge = [cabB.corners[1], cabA.corners[0], cabA.corners[3], cabB.corners[2]]
          polygons.push([bridge])
        }
      }
    }

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)

      // JAVÍTÁS: Shape tömb
      const shapes = this.createShapesFromPolygon(merged)

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: this.config.plinth.height,
        bevelEnabled: false,
      })

      this.plinthMesh = new THREE.Mesh(geometry, this.config.plinth.material)
      this.plinthMesh.name = 'ProceduralPlinth'
      this.plinthMesh.rotation.x = -Math.PI / 2
      this.plinthMesh.position.y = 0

      this.applyWorldUVs(geometry)
      this.scene.add(this.plinthMesh)
    } catch (e) {
      console.error('❌ Error generating plinth:', e)
    }
  }

  private getWorktopCorners(
    obj: THREE.Object3D,
    width: number,
    neighbors: { hasLeft: boolean; hasRight: boolean },
    isHole = false,
    customDepth?: number,
  ) {
    const box = new THREE.Box3().setFromObject(obj)
    const worldCenter = new THREE.Vector3()
    box.getCenter(worldCenter)
    const localCenter = obj.worldToLocal(worldCenter.clone())

    const overhangSide = isHole ? 0 : this.config.worktop.sideOverhang

    let backZ = 0
    let frontZ = this.config.worktop.defaultDepth

    if (isHole && customDepth) {
      const holeCenterZ = customDepth / 2
      backZ = holeCenterZ - customDepth / 2
      frontZ = holeCenterZ + customDepth / 2
    }

    const leftX = localCenter.x - width / 2 - (neighbors.hasLeft ? 0 : overhangSide)
    const rightX = localCenter.x + width / 2 + (neighbors.hasRight ? 0 : overhangSide)

    const points = [
      new THREE.Vector3(leftX, 0, backZ),
      new THREE.Vector3(rightX, 0, backZ),
      new THREE.Vector3(rightX, 0, frontZ),
      new THREE.Vector3(leftX, 0, frontZ),
    ]

    obj.updateMatrixWorld()
    const corners: [number, number][] = []

    points.forEach((p) => {
      p.applyMatrix4(obj.matrixWorld)
      corners.push([p.x, -p.z])
    })

    return corners
  }

  private getPlinthCorners(obj: THREE.Object3D, width: number, depth: number, zOffset: number) {
    const box = new THREE.Box3().setFromObject(obj)
    const worldCenter = new THREE.Vector3()
    box.getCenter(worldCenter)
    const localCenter = obj.worldToLocal(worldCenter.clone())

    const halfW = width / 2
    const halfD = depth / 2

    const points = [
      new THREE.Vector3(localCenter.x - halfW, 0, localCenter.z - halfD + zOffset),
      new THREE.Vector3(localCenter.x + halfW, 0, localCenter.z - halfD + zOffset),
      new THREE.Vector3(localCenter.x + halfW, 0, localCenter.z + halfD + zOffset),
      new THREE.Vector3(localCenter.x - halfW, 0, localCenter.z + halfD + zOffset),
    ]

    obj.updateMatrixWorld()
    const corners: [number, number][] = []

    points.forEach((p) => {
      p.applyMatrix4(obj.matrixWorld)
      corners.push([p.x, -p.z])
    })

    return corners
  }

  // --- JAVÍTOTT FÜGGVÉNY: TÖMBÖT AD VISSZA ---
  private createShapesFromPolygon(mergedPolygon: any): THREE.Shape[] {
    const shapes: THREE.Shape[] = []

    // Minden egyes "sziget" (polygon) külön Shape lesz
    mergedPolygon.forEach((poly: any) => {
      const outline = poly[0]
      if (!outline || outline.length === 0) return

      const shape = new THREE.Shape()
      shape.moveTo(outline[0][0], outline[0][1])
      for (let i = 1; i < outline.length; i++) {
        shape.lineTo(outline[i][0], outline[i][1])
      }
      shape.closePath()

      // Lyukak az adott szigeten belül
      for (let i = 1; i < poly.length; i++) {
        const holePath = new THREE.Path()
        const hole = poly[i]
        if (!hole || hole.length === 0) continue
        holePath.moveTo(hole[0][0], hole[0][1])
        for (let j = 1; j < hole.length; j++) {
          holePath.lineTo(hole[j][0], hole[j][1])
        }
        holePath.closePath()
        shape.holes.push(holePath)
      }

      shapes.push(shape)
    })

    return shapes
  }

  private applyWorldUVs(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox()
    const posAttribute = geometry.attributes.position
    const uvAttribute = geometry.attributes.uv
    if (!posAttribute || !uvAttribute) return
    const scale = 1.0
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i)
      const y = posAttribute.getY(i)
      uvAttribute.setXY(i, x * scale, y * scale)
    }
    uvAttribute.needsUpdate = true
  }
}
