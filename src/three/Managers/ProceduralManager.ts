import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import type Experience from '../Experience'
import { useExperienceStore } from '@/stores/experience'
import { useConfigStore } from '@/stores/config'
import { useProceduralStore } from '@/stores/procedural'
import { useSettingsStore } from '@/stores/settings'
import { watch } from 'vue'

export default class ProceduralManager {
  private experience: Experience
  private scene: THREE.Scene
  private experienceStore = useExperienceStore()
  private configStore = useConfigStore()
  private proceduralStore = useProceduralStore()
  private settingsStore = useSettingsStore()

  private worktopMesh: THREE.Mesh | null = null
  private plinthMesh: THREE.Mesh | null = null

  private debugHelpers: THREE.Group = new THREE.Group()

  private defaultWorktopMaterial: THREE.Material = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    roughness: 0.5,
    side: THREE.DoubleSide,
  })

  private defaultPlinthMaterial: THREE.Material = new THREE.MeshStandardMaterial({
    color: 0x333333,
  })

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene
    this.scene.add(this.debugHelpers)

    this.initWatchers()
  }

  private initWatchers() {
    watch(
      () => [this.proceduralStore.plinth.height, this.proceduralStore.plinth.depthOffset],
      () => {
        this.fullUpdate()
      },
    )

    watch(
      () => this.proceduralStore.worktop,
      () => {
        this.generateWorktop()
      },
      { deep: true },
    )

    watch(
      () => this.settingsStore.globalComponentSettings,
      () => {
        setTimeout(() => {
          this.fullUpdate()
        }, 50)
      },
      { deep: true },
    )
  }

  public update() {
    this.debugHelpers.clear()
    this.fullUpdate()
  }

  private fullUpdate() {
    this.updateCabinetVerticalPositions()
    this.generateWorktop()
    this.generatePlinth()
  }

  // --- LOGIKA ---

  private isStandardLegActive(obj: THREE.Object3D): boolean {
    const corpusConfig = this.getCorpusConfig(obj)
    if (!corpusConfig) return false

    for (const group of this.configStore.globalGroups) {
      if (group.targets.includes('legs') || group.targets.includes('leg_slot')) {
        const selectedVariantId = this.settingsStore.globalComponentSettings[group.id]
        if (!selectedVariantId) continue

        const variant = group.style.variants.find((v) => v.id === selectedVariantId)
        if (variant && variant.componentIds.includes('leg_standard')) {
          return true
        }
      }
    }

    const state = obj.userData.componentState || {}
    const values = Object.values(state)
    if (values.some((val: any) => typeof val === 'string' && val.includes('leg_standard'))) {
      return true
    }

    return false
  }

  /**
   * Kiszámolja a Design láb magasságát a komponens configból.
   * (A te InteractionManager kódod alapján adaptálva)
   */
  private calculateDesignLegHeight(obj: THREE.Object3D): number {
    let maxLift = 0
    const componentState = obj.userData.componentState

    if (componentState) {
      for (const slotId in componentState) {
        const componentId = componentState[slotId]
        if (typeof componentId !== 'string') continue

        const componentDef = this.configStore.getComponentById(componentId)

        if (componentDef) {
          // Magasság kinyerése (mm-ben van az adatbázisban)
          const heightMM = componentDef.properties?.height || (componentDef as any).height || 0

          // Ha ez egy láb (kategória vagy ID alapján), akkor ez emeli a bútort
          // Figyeljük a 'legs' kategóriát VAGY ha az ID-ban benne van a 'leg'
          if ((componentDef as any).category === 'legs' || componentDef.id.includes('leg')) {
            // Nem standard láb esetén vesszük a magasságot
            if (!componentDef.id.includes('leg_standard')) {
              maxLift = Math.max(maxLift, heightMM / 1000)
            }
          }
        }
      }
    }
    return maxLift
  }

  public updateCabinetVerticalPositions() {
    const cabinets = this.experienceStore.placedObjects
    const globalPlinthHeight = this.proceduralStore.plinth.height

    cabinets.forEach((cabinet) => {
      if (!this.getCorpusConfig(cabinet)) return

      const isStandard = this.isStandardLegActive(cabinet)

      if (isStandard) {
        // 1. ESET: STANDARD LÁB -> Globális magasság
        if (Math.abs(cabinet.position.y - globalPlinthHeight) > 0.0001) {
          cabinet.position.y = globalPlinthHeight
          cabinet.updateMatrixWorld()
        }
        this.toggleLegVisibility(cabinet, false)
      } else {
        // 2. ESET: DESIGN LÁB -> Komponens magasság
        const designHeight = this.calculateDesignLegHeight(cabinet)

        // Ha találtunk magasságot, beállítjuk
        if (Math.abs(cabinet.position.y - designHeight) > 0.0001) {
          cabinet.position.y = designHeight
          cabinet.updateMatrixWorld()
        }

        this.toggleLegVisibility(cabinet, true)
      }
    })
  }

  private toggleLegVisibility(cabinet: THREE.Object3D, visible: boolean) {
    cabinet.traverse((child) => {
      const name = child.name.toLowerCase()
      if (name.includes('leg_standard')) {
        child.visible = visible
      }
      if (child.userData.componentId && child.userData.componentId.includes('leg_standard')) {
        child.visible = visible
      }
    })
  }

  // --- GENERÁLÓK ---

  private generatePlinth() {
    if (this.plinthMesh) {
      this.scene.remove(this.plinthMesh)
      if (this.plinthMesh.geometry) this.plinthMesh.geometry.dispose()
      this.plinthMesh = null
    }

    const conf = this.proceduralStore.plinth

    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      const isBottom = this.getCorpusConfig(obj) !== null
      return isBottom && this.isStandardLegActive(obj)
    })

    if (cabinets.length === 0) return

    const polygons: any[] = []
    const cabinetData: any[] = []

    let inheritedMaterial: THREE.Material = this.defaultPlinthMaterial
    if (cabinets.length > 0) {
      const firstCabinet = cabinets[0]
      if (firstCabinet instanceof THREE.Object3D) {
        const mat = this.getInheritedMaterial(firstCabinet)
        if (mat) inheritedMaterial = mat
      }
    }

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const rawDepth = corpusConfig.properties?.depth ?? 560

      const width = rawWidth / 1000
      const depth = rawDepth / 1000 - conf.depthOffset

      const zOffset = -conf.depthOffset / 2
      const corners = this.getPlinthCorners(cabinet, width, depth, zOffset)

      polygons.push([corners])
      cabinetData.push({ corners, center: cabinet.position.clone() })
    })

    this.generateBridges(cabinetData, polygons, this.proceduralStore.worktop.gapThreshold)

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)
      const shapes = this.createShapesFromPolygon(merged)

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: conf.height,
        bevelEnabled: false,
      })

      this.plinthMesh = new THREE.Mesh(geometry, inheritedMaterial)
      this.plinthMesh.name = 'ProceduralPlinth'
      this.plinthMesh.rotation.x = -Math.PI / 2
      this.plinthMesh.position.y = 0

      this.applyWorldUVs(geometry)
      this.scene.add(this.plinthMesh)
    } catch (e) {
      console.error('❌ Error generating plinth:', e)
    }
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

  private getInheritedMaterial(obj: THREE.Object3D): THREE.Material {
    let bestMaterial: THREE.Material | null = null
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial
        const name = child.name.toLowerCase()
        if (
          name.includes('handle') ||
          name.includes('leg') ||
          name.includes('hinge') ||
          name.includes('glass')
        )
          return
        if (name.includes('corpus') || name.includes('body') || name.includes('carcass')) {
          bestMaterial = mat
          return
        }
        if (!bestMaterial) bestMaterial = mat
      }
    })
    return bestMaterial || this.defaultPlinthMaterial
  }

  private checkNeighbors(
    currentObj: THREE.Object3D,
    allObjects: THREE.Object3D[],
    width: number,
    tolerance: number,
  ) {
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
      if (this.worktopMesh.geometry) this.worktopMesh.geometry.dispose()
      this.worktopMesh = null
    }
    const conf = this.proceduralStore.worktop
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
      const neighbors = this.checkNeighbors(cabinet, cabinets, width, conf.gapThreshold)
      const corners = this.getWorktopCorners(
        cabinet,
        width,
        neighbors,
        false,
        undefined,
        conf.sideOverhang,
        conf.defaultDepth,
      )
      polygons.push([corners])
      cabinetData.push({ corners, center: cabinet.position.clone() })
    })
    this.generateBridges(cabinetData, polygons, conf.gapThreshold)
    if (polygons.length === 0) return
    try {
      const merged = polygonClipping.union(polygons as any)
      const shapes = this.createShapesFromPolygon(merged)
      this.applyHoles(cabinets, shapes, conf.defaultDepth)
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: conf.thickness,
        bevelEnabled: false,
      })
      const material = this.defaultWorktopMaterial
      this.worktopMesh = new THREE.Mesh(geometry, material)
      this.worktopMesh.name = 'ProceduralWorktop'
      this.worktopMesh.rotation.x = -Math.PI / 2
      this.worktopMesh.position.y =
        (maxCorpusHeight > 0.5 ? maxCorpusHeight : conf.elevation) + 0.001
      this.applyWorldUVs(geometry)
      this.worktopMesh.castShadow = true
      this.worktopMesh.receiveShadow = true
      this.scene.add(this.worktopMesh)
    } catch (error) {
      console.error('❌ Error generating worktop:', error)
    }
  }

  private generateBridges(cabinetData: any[], polygons: any[], threshold: number) {
    for (let i = 0; i < cabinetData.length; i++) {
      for (let j = i + 1; j < cabinetData.length; j++) {
        const cabA = cabinetData[i]
        const cabB = cabinetData[j]
        if (cabA.center.distanceTo(cabB.center) > 1.5) continue
        const distBack = Math.hypot(
          cabA.corners[1][0] - cabB.corners[0][0],
          cabA.corners[1][1] - cabB.corners[0][1],
        )
        if (distBack > 0.001 && distBack < threshold) {
          polygons.push([[cabA.corners[1], cabB.corners[0], cabB.corners[3], cabA.corners[2]]])
        }
        const distBackRev = Math.hypot(
          cabA.corners[0][0] - cabB.corners[1][0],
          cabA.corners[0][1] - cabB.corners[1][1],
        )
        if (distBackRev > 0.001 && distBackRev < threshold) {
          polygons.push([[cabB.corners[1], cabA.corners[0], cabA.corners[3], cabB.corners[2]]])
        }
      }
    }
  }

  private applyHoles(cabinets: THREE.Object3D[], shapes: THREE.Shape[], defaultDepth: number) {
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
          0,
          defaultDepth,
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
            shapes.forEach((s) => s.holes.push(holeShape))
          }
        }
      }
    })
  }

  private getWorktopCorners(
    obj: THREE.Object3D,
    width: number,
    neighbors: { hasLeft: boolean; hasRight: boolean },
    isHole = false,
    customDepth?: number,
    sideOverhang = 0.015,
    defaultDepth = 0.6,
  ) {
    const box = new THREE.Box3().setFromObject(obj)
    const worldCenter = new THREE.Vector3()
    box.getCenter(worldCenter)
    const localCenter = obj.worldToLocal(worldCenter.clone())
    const overhangSide = isHole ? 0 : sideOverhang
    let backZ = 0
    let frontZ = defaultDepth
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

  private createShapesFromPolygon(mergedPolygon: any): THREE.Shape[] {
    const shapes: THREE.Shape[] = []
    mergedPolygon.forEach((poly: any) => {
      const outline = poly[0]
      if (!outline || outline.length === 0) return
      const shape = new THREE.Shape()
      shape.moveTo(outline[0][0], outline[0][1])
      for (let i = 1; i < outline.length; i++) {
        shape.lineTo(outline[i][0], outline[i][1])
      }
      shape.closePath()
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
