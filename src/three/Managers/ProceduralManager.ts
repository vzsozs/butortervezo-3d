import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import type Experience from '../Experience'
import { useExperienceStore } from '@/stores/experience'
import { useConfigStore } from '@/stores/config'
import { useProceduralStore } from '@/stores/procedural'
import { useSettingsStore } from '@/stores/settings'
import { FurnitureCategory, GlobalGroupTarget, ProceduralConstants } from '@/config/furniture'
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

  // --- CACHE ---
  private worktopCornersCache = new Map<string, THREE.Vector3[]>()
  private excludedObject: THREE.Object3D | null = null

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene
    this.scene.add(this.debugHelpers)
    this.scene.add(this.debugLabels) // Hozzáadjuk a label csoportot a jelenethez

    this.initWatchers()
  }

  /* --------------------------------------------------
                        DEBUG
  -------------------------------------------------- */
  // --- DEBUG SEGÉD ---
  private debugLabels: THREE.Group = new THREE.Group()

  // Törli a régi számokat frissítés előtt
  private clearDebugLabels() {
    this.debugLabels.clear()
  }

  // Számokat gyártó függvény
  private createDebugLabel(
    position: THREE.Vector3,
    text: string,
    color: string,
    offsetY: number = 0,
  ) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 64
    canvas.height = 64

    ctx.fillStyle = color
    ctx.fillRect(0, 0, 64, 64)

    ctx.font = 'bold 40px Arial'
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 32)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(material)

    sprite.position.copy(position)
    sprite.position.y += 0.1 + offsetY // Kicsit feljebb, hogy látszódjon
    sprite.scale.set(0.1, 0.1, 0.1)

    this.debugLabels.add(sprite)
  }
  /* --------------------------------------------------
                      DEBUG VÉGE
  -------------------------------------------------- */

  // --- ANYAG KERESŐ ---
  private getWorktopMaterial(): THREE.Material {
    const worktopGroup = this.configStore.globalGroups.find((g) =>
      g.targets.includes(GlobalGroupTarget.WORKTOP),
    )
    if (worktopGroup) {
      const selectedMatId = this.settingsStore.globalMaterialSettings[worktopGroup.id]
      if (selectedMatId) {
        const matDef = this.configStore.materials.find((m) => m.id === selectedMatId)
        if (matDef) {
          const matParams: any = { roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }
          if (matDef.value && !matDef.value.includes('/')) {
            matParams.color = new THREE.Color(matDef.value)
          } else if (matDef.value || (matDef as any).textureUrl) {
            const url = (matDef as any).textureUrl || matDef.value
            const texture = new THREE.TextureLoader().load(url)
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.repeat.set(1, 1)
            matParams.map = texture
            matParams.color = 0xffffff
          }
          return new THREE.MeshStandardMaterial(matParams)
        }
      }
    }
    return this.defaultWorktopMaterial
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
        this.fullUpdate()
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

    watch(
      () => this.settingsStore.globalMaterialSettings,
      () => {
        setTimeout(() => {
          this.generatePlinth()
          this.generateWorktop()
        }, 100)
      },
      { deep: true },
    )

    watch(
      () => this.proceduralStore.updateTrigger,
      () => {
        this.fullUpdate()
      },
    )
  }

  public update() {
    this.excludedObject = null
    this.debugHelpers.clear()
    this.fullUpdate()
  }

  private fullUpdate() {
    this.updateCabinetHorizontalPositions()
    this.updateCabinetVerticalPositions()
    this.generateWorktop()
    this.generatePlinth()
  }

  // ==========================================================================
  // 1. GAP SZÁMÍTÁS ÉS VÍZSZINTES ELTOLÁS
  // ==========================================================================

  public calculateGap(obj: THREE.Object3D): number {
    const config = this.getCorpusConfig(obj)
    if (!config) return 0

    const worktopConf = this.proceduralStore.worktop
    const targetDepth = worktopConf.defaultDepth || 0.6
    const overhang = worktopConf.frontOverhang || 0.02
    const frontThickness = 0.019

    let physicalDepth = (config.properties?.physicalDepth ?? config.properties?.depth ?? 560) / 1000

    // Saroknál a sideDepth a mérvadó a szárny mélységéhez
    if ((config as any).structureType === 'corner_L') {
      const sideDepth = (config.properties?.sideDepth ?? 560) / 1000
      physicalDepth = sideDepth
    }

    const gap = targetDepth - (overhang + frontThickness + physicalDepth)
    return Math.max(0, gap)
  }

  private updateCabinetHorizontalPositions() {
    this.clearDebugLabels()

    const cabinets = this.experienceStore.placedObjects
    cabinets.forEach((cabinet) => {
      const config = this.getCorpusConfig(cabinet)
      if (!config) return

      const gap = this.calculateGap(cabinet)
      const visualModel = cabinet.children.find((c) => c.type === 'Group' || c.type === 'Mesh')

      if (visualModel) {
        // Reset
        visualModel.position.set(0, 0, 0)
        visualModel.rotation.set(0, 0, 0)

        if ((config as any).structureType === 'corner_L') {
          // --- SAROKSZEKRÉNY KORREKCIÓ ---

          // 1. Forgatás (Ez jó volt, megtartjuk)
          visualModel.rotation.y = Math.PI / 2

          // 2. Méretek lekérése a visszahúzáshoz
          // Mivel elforgattuk 90 fokkal, a bútor "Mélysége" (Depth) került az X tengelyre.
          // Ezt a távolságot kell kivonnunk, hogy visszakerüljön a sarokba.
          const rawDepth = config.properties?.depth ?? config.properties?.width ?? 600
          const depth = rawDepth / 1000

          // 3. Pozíció beállítása
          // X: Gap - Depth (Visszahúzzuk a testet a falhoz)
          // Z: Gap (Ez jó helyen van, csak el kell tolni a faltól)
          visualModel.position.x = gap
          visualModel.position.z = gap + depth

          // --- DEBUG (Kék doboz) ---
          visualModel.updateMatrixWorld()
          const box = new THREE.Box3().setFromObject(visualModel)
          this.createDebugLabel(new THREE.Vector3(box.min.x, 0, box.min.z), 'B0', 'blue', 0.1)
          this.createDebugLabel(new THREE.Vector3(box.max.x, 0, box.min.z), 'B1', 'blue', 0.1)
          this.createDebugLabel(new THREE.Vector3(box.max.x, 0, box.max.z), 'B2', 'blue', 0.1)
          this.createDebugLabel(new THREE.Vector3(box.min.x, 0, box.max.z), 'B3', 'blue', 0.1)
        } else {
          // --- EGYENES SZEKRÉNY ---
          visualModel.position.z = gap
        }

        visualModel.updateMatrix()
      }
    })
  }

  // ==========================================================================
  // 2. FÜGGŐLEGES POZICIONÁLÁS
  // ==========================================================================

  public updateCabinetVerticalPositions() {
    const cabinets = this.experienceStore.placedObjects
    const globalPlinthHeight = this.proceduralStore.plinth.height

    cabinets.forEach((cabinet) => {
      if (!this.getCorpusConfig(cabinet)) return
      const isStandard = this.isStandardLegActive(cabinet)

      if (isStandard) {
        const override = cabinet.userData.plinthHeightOverride
        const targetHeight =
          override !== undefined && override !== null ? override : globalPlinthHeight

        if (Math.abs(cabinet.position.y - targetHeight) > 0.0001) {
          cabinet.position.y = targetHeight
          cabinet.updateMatrixWorld()
        }
        this.toggleLegVisibility(cabinet, false)
      } else {
        const designHeight = this.calculateDesignLegHeight(cabinet)
        if (Math.abs(cabinet.position.y - designHeight) > 0.0001) {
          cabinet.position.y = designHeight
          cabinet.updateMatrixWorld()
        }
        this.toggleLegVisibility(cabinet, true)
      }
    })
  }

  // ==========================================================================
  // 3. GENERÁLÁS (Lábazat)
  // ==========================================================================

  private generatePlinth() {
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (child.name.includes(ProceduralConstants.MESH_PLINTH)) toRemove.push(child)
    })
    toRemove.forEach((child) => {
      this.scene.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
    })

    const globalConf = this.proceduralStore.plinth

    const heightGroups = new Map<number, THREE.Object3D[]>()
    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      if (this.excludedObject && obj.uuid === this.excludedObject.uuid) return false
      return this.getCorpusConfig(obj) !== null && this.isStandardLegActive(obj)
    })

    cabinets.forEach((cab) => {
      const override = cab.userData.plinthHeightOverride
      const h = override !== undefined && override !== null ? override : globalConf.height
      const key = Math.round(h * 1000) / 1000
      if (!heightGroups.has(key)) heightGroups.set(key, [])
      heightGroups.get(key)!.push(cab)
    })

    heightGroups.forEach((groupCabinets, height) => {
      this.createPlinthMeshForGroup(groupCabinets, height, globalConf)
    })
  }

  // JAVÍTÁS: _conf (unused variable fix)
  private createPlinthMeshForGroup(cabinets: THREE.Object3D[], height: number, _conf: any) {
    const polygons: any[] = []
    const cabinetData: any[] = []

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const width = rawWidth / 1000

      let physicalDepth =
        (corpusConfig.properties?.physicalDepth ?? corpusConfig.properties?.depth ?? 560) / 1000

      // JAVÍTÁS: (corpusConfig as any)
      if ((corpusConfig as any).structureType === 'corner_L') {
        physicalDepth = (corpusConfig.properties?.sideDepth ?? 560) / 1000
      }

      const gap = this.calculateGap(cabinet)
      const corners = this.getPlinthCorners(cabinet, width, physicalDepth, gap)

      polygons.push([corners])
      cabinetData.push({ corners, center: cabinet.position.clone() })
    })

    this.generateBridges(cabinetData, polygons, this.proceduralStore.worktop.gapThreshold)

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)
      const shapes = this.createShapesFromPolygon(merged)
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false })
      const mesh = new THREE.Mesh(geometry, this.defaultPlinthMaterial)
      mesh.name = ProceduralConstants.MESH_PLINTH
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0
      this.applyBoxUVs(geometry)
      this.scene.add(mesh)
    } catch (e) {
      console.error('Plinth generation error', e)
    }
  }

  // ==========================================================================
  // 4. GENERÁLÁS (Munkapult)
  // ==========================================================================

  public getWorktopCornersForCabinet(uuid: string): THREE.Vector3[] {
    return this.worktopCornersCache.get(uuid) || []
  }

  private generateWorktop() {
    this.worktopCornersCache.clear()
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (child.name === ProceduralConstants.MESH_WORKTOP) toRemove.push(child)
    })
    toRemove.forEach((child) => {
      this.scene.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
    })

    const conf = this.proceduralStore.worktop
    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      if (this.excludedObject && obj.uuid === this.excludedObject.uuid) return false
      return this.getCorpusConfig(obj) !== null
    })

    const heightGroups = new Map<number, THREE.Object3D[]>()
    cabinets.forEach((cab) => {
      const box = new THREE.Box3().setFromObject(cab)
      const topY = box.max.y
      const key = Math.round(topY * 1000)
      if (!heightGroups.has(key)) heightGroups.set(key, [])
      heightGroups.get(key)!.push(cab)
    })

    heightGroups.forEach((groupCabinets, heightKey) => {
      this.createWorktopMeshForGroup(groupCabinets, heightKey / 1000, conf)
    })
  }

  private createWorktopMeshForGroup(cabinets: THREE.Object3D[], height: number, conf: any) {
    const polygons: any[] = []
    const cabinetData: any[] = []

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const width = rawWidth / 1000
      const gap = this.calculateGap(cabinet)

      const neighbors = this.checkNeighbors(cabinet, cabinets, width, conf.gapThreshold)

      const corners = this.getWorktopCorners(
        cabinet,
        width,
        gap,
        neighbors,
        false,
        undefined,
        conf.sideOverhang,
        conf.defaultDepth,
      )

      polygons.push([corners])
      cabinetData.push({ corners, center: cabinet.position.clone() })

      const topY = height + conf.thickness
      const worldCorners = corners.map((c) => new THREE.Vector3(c[0], topY, -c[1]))
      this.worktopCornersCache.set(cabinet.uuid, worldCorners)
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
      const mesh = new THREE.Mesh(geometry, this.getWorktopMaterial())
      mesh.name = ProceduralConstants.MESH_WORKTOP
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = height + 0.001
      this.applyBoxUVs(geometry)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
    } catch (error) {
      console.error('Worktop generation error', error)
    }
  }

  // ==========================================================================
  // 5. MATEMATIKA
  // ==========================================================================

  private getPlinthCorners(obj: THREE.Object3D, width: number, physicalDepth: number, gap: number) {
    const corpusConfig = this.getCorpusConfig(obj)
    const structureType = (corpusConfig as any)?.structureType || 'standard'
    const plinthConf = this.proceduralStore.plinth as any
    const frontRecess = plinthConf.frontRecess || 0.05
    const backRecess = plinthConf.backRecess || 0.02

    let points: THREE.Vector3[] = []

    if (structureType === 'corner_L') {
      // --- L-ALAK (DIREKT GENERÁLÁS -90 FOKNAK MEGFELELŐEN) ---
      // X tengely: Mélység irány (Depth)
      // Z tengely: Szélesség irány (Width)

      const rawDepth = corpusConfig?.properties?.depth ?? corpusConfig?.properties?.width ?? 600
      const fullDepth = rawDepth / 1000

      // Határok (0,0 a fal sarka)
      const start = gap + backRecess

      // X irányú kiterjedés (Ez a mélység!)
      const endX = gap + fullDepth

      // Z irányú kiterjedés (Ez a szélesség!)
      const endZ = gap + width

      // Belső vastagság (szár mélysége)
      const armThickness = gap + physicalDepth - frontRecess

      points = [
        new THREE.Vector3(start, 0, start), // 1. Sarok (Falnál)
        new THREE.Vector3(endX, 0, start), // 2. X-szár vége (Falnál)
        new THREE.Vector3(endX, 0, armThickness), // 3. X-szár vége (Elöl)
        new THREE.Vector3(armThickness, 0, armThickness), // 4. Belső sarok
        new THREE.Vector3(armThickness, 0, endZ), // 5. Z-szár vége (Elöl)
        new THREE.Vector3(start, 0, endZ), // 6. Z-szár vége (Falnál)
      ]
    } else {
      // --- STANDARD TÉGLALAP (Változatlan) ---
      const zBack = gap + backRecess
      const zFront = gap + physicalDepth - frontRecess
      const xLeft = 0
      const xRight = width

      points = [
        new THREE.Vector3(xLeft, 0, zBack),
        new THREE.Vector3(xRight, 0, zBack),
        new THREE.Vector3(xRight, 0, zFront),
        new THREE.Vector3(xLeft, 0, zFront),
      ]
    }

    obj.updateMatrixWorld()
    const corners: [number, number][] = []
    points.forEach((p) => {
      p.applyMatrix4(obj.matrixWorld)
      corners.push([p.x, -p.z])
    })
    return corners
  }

  private getWorktopCorners(
    obj: THREE.Object3D,
    width: number,
    gap: number,
    neighbors: { hasLeft: boolean; hasRight: boolean },
    isHole = false,
    customDepth?: number,
    sideOverhang = 0.015,
    defaultDepth = 0.6,
  ) {
    const corpusConfig = this.getCorpusConfig(obj)
    const structureType = (corpusConfig as any)?.structureType || 'standard'

    let points: THREE.Vector3[] = []

    if (structureType === 'corner_L' && !isHole) {
      // --- ITT TUDSZ VARIÁLNI A TENGELYEKKEL ---
      // Jelenlegi beállítás: X=Mélység, Z=Szélesség (Mert azt mondtad 90 fokkal balra van)
      // Ha ez még mindig rossz, cseréld meg a lengthX és lengthZ definíciókat!

      const rawDepth = corpusConfig?.properties?.depth ?? corpusConfig?.properties?.width ?? 600
      const fullDepth = rawDepth / 1000

      // A: Verzió (Ha a GLB Z-irányba széles)
      // const lengthX = gap + fullDepth + sideOverhang
      // const lengthZ = gap + width + sideOverhang

      // B: Verzió (Ha a GLB X-irányba széles - Standard)
      const lengthX = gap + width + sideOverhang
      const lengthZ = gap + fullDepth + sideOverhang

      const armThickness = defaultDepth

      // Generálás (Standard L-alak)
      points = [
        new THREE.Vector3(0, 0, 0), // 0. Sarok
        new THREE.Vector3(lengthX, 0, 0), // 1. X-szár vége (Falnál)
        new THREE.Vector3(lengthX, 0, armThickness), // 2. X-szár vége (Elöl)
        new THREE.Vector3(armThickness, 0, armThickness), // 3. Belső sarok
        new THREE.Vector3(armThickness, 0, lengthZ), // 4. Z-szár vége (Elöl)
        new THREE.Vector3(0, 0, lengthZ), // 5. Z-szár vége (Falnál)
      ]

      // --- PIROS DEBUG: Generált pontok ---
      // A pontokat transzformáljuk a bútor világkoordinátáiba, hogy ott jelenjenek meg, ahol lesznek
      obj.updateMatrixWorld()
      points.forEach((p, index) => {
        const worldPos = p.clone().applyMatrix4(obj.matrixWorld)
        this.createDebugLabel(worldPos, `P${index}`, 'red', 0.2 + index * 0.05)
      })
    } else {
      // Standard téglalap
      const overhangLeft = isHole ? 0 : sideOverhang
      const overhangRight = isHole ? 0 : sideOverhang
      const xLeft = -overhangLeft
      const xRight = width + overhangRight
      const zBack = 0
      const zFront = defaultDepth
      points = [
        new THREE.Vector3(xLeft, 0, zBack),
        new THREE.Vector3(xRight, 0, zBack),
        new THREE.Vector3(xRight, 0, zFront),
        new THREE.Vector3(xLeft, 0, zFront),
      ]
    }

    obj.updateMatrixWorld()
    const corners: [number, number][] = []
    points.forEach((p) => {
      p.applyMatrix4(obj.matrixWorld)
      corners.push([p.x, -p.z])
    })
    return corners
  }

  // ==========================================================================
  // 6. SEGÉDFÜGGVÉNYEK
  // ==========================================================================

  private getCorpusConfig(obj: THREE.Object3D) {
    const state = obj.userData.componentState || {}
    for (const componentId of Object.values(state)) {
      if (typeof componentId !== 'string') continue
      const compConfig = this.configStore.getComponentById(componentId)
      if (compConfig && (compConfig as any).category === FurnitureCategory.BOTTOM_CABINET) {
        return compConfig
      }
    }
    return null
  }

  private isStandardLegActive(obj: THREE.Object3D): boolean {
    const state = obj.userData.componentState || {}
    for (const componentId of Object.values(state)) {
      if (typeof componentId !== 'string') continue
      if (componentId.includes(ProceduralConstants.LEG_STANDARD_ID)) return true
    }
    return false
  }

  private calculateDesignLegHeight(obj: THREE.Object3D): number {
    let maxLift = 0
    const componentState = obj.userData.componentState
    if (componentState) {
      for (const slotId in componentState) {
        const componentId = componentState[slotId]
        if (typeof componentId !== 'string') continue
        const componentDef = this.configStore.getComponentById(componentId)
        if (componentDef) {
          const heightMM = componentDef.properties?.height || (componentDef as any).height || 0
          if (
            (componentDef as any).category === FurnitureCategory.LEG ||
            componentDef.id.includes('leg')
          ) {
            if (!componentDef.id.includes(ProceduralConstants.LEG_STANDARD_ID)) {
              maxLift = Math.max(maxLift, heightMM / 1000)
            }
          }
        }
      }
    }
    return maxLift
  }

  private toggleLegVisibility(cabinet: THREE.Object3D, visible: boolean) {
    cabinet.traverse((child) => {
      const name = child.name.toLowerCase()
      if (name.includes(ProceduralConstants.LEG_STANDARD_ID)) child.visible = visible
      if (
        child.userData.componentId &&
        child.userData.componentId.includes(ProceduralConstants.LEG_STANDARD_ID)
      )
        child.visible = visible
    })
  }

  public regenerateExcluding(obj: THREE.Object3D) {
    this.excludedObject = obj
    this.fullUpdate()
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
        if (distBack > 0.001 && distBack < threshold)
          polygons.push([[cabA.corners[1], cabB.corners[0], cabB.corners[3], cabA.corners[2]]])
        const distBackRev = Math.hypot(
          cabA.corners[0][0] - cabB.corners[1][0],
          cabA.corners[0][1] - cabB.corners[1][1],
        )
        if (distBackRev > 0.001 && distBackRev < threshold)
          polygons.push([[cabB.corners[1], cabA.corners[0], cabA.corners[3], cabB.corners[2]]])
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
          0,
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

  private applyBoxUVs(geometry: THREE.BufferGeometry) {
    geometry.computeVertexNormals()
    const posAttribute = geometry.attributes.position
    const normAttribute = geometry.attributes.normal
    const uvAttribute = geometry.attributes.uv
    if (!posAttribute || !normAttribute || !uvAttribute) return
    const scale = 1.0
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i)
      const y = posAttribute.getY(i)
      const z = posAttribute.getZ(i)
      const nx = Math.abs(normAttribute.getX(i))
      const ny = Math.abs(normAttribute.getY(i))
      const nz = Math.abs(normAttribute.getZ(i))
      let u = 0
      let v = 0
      if (nz > nx && nz > ny) {
        u = y * scale
        v = x * scale
      } else if (nx > ny && nx > nz) {
        u = y * scale
        v = z * scale
      } else {
        u = x * scale
        v = z * scale
      }
      uvAttribute.setXY(i, u, v)
    }
    uvAttribute.needsUpdate = true
  }
}
