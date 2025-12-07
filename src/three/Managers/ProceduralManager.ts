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

  public getProceduralMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (
        child.name === ProceduralConstants.MESH_WORKTOP ||
        child.name === ProceduralConstants.MESH_PLINTH
      ) {
        meshes.push(child)
      }
    })
    return meshes
  }

  private debugHelpers: THREE.Group = new THREE.Group()

  private defaultWorktopMaterial: THREE.Material = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    roughness: 0.5,
    side: THREE.DoubleSide,
  })

  private defaultPlinthMaterial: THREE.Material = new THREE.MeshStandardMaterial({
    color: 0x333333,
  })

  // --- ANYAG KERESŐ ---
  private getWorktopMaterial(): THREE.Material {
    // 1. Megkeressük a csoportot, ami a 'worktops'-ot vezérli
    const worktopGroup = this.configStore.globalGroups.find((g) =>
      g.targets.includes(GlobalGroupTarget.WORKTOP),
    )

    if (worktopGroup) {
      // 2. Megnézzük, mi van kiválasztva a SettingsStore-ban ehhez a csoporthoz
      const selectedMatId = this.settingsStore.globalMaterialSettings[worktopGroup.id]

      if (selectedMatId) {
        // 3. Megkeressük az anyag definíciót a ConfigStore-ban
        const matDef = this.configStore.materials.find((m) => m.id === selectedMatId)

        if (matDef) {
          // 4. Létrehozzuk a Three.js anyagot
          // FONTOS: Itt kellene használni az AssetManager-t a textúra betöltéshez!
          // Mivel azt a kódot nem látom, írok egy egyszerűsített verziót:

          const matParams: any = {
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide,
          }

          // Ha van szín
          if (matDef.value && !matDef.value.includes('/')) {
            matParams.color = new THREE.Color(matDef.value)
          }
          // Ha textúra (feltételezzük, hogy a value egy útvonal, vagy van textureUrl)
          else if (matDef.value || (matDef as any).textureUrl) {
            const url = (matDef as any).textureUrl || matDef.value
            // Ideiglenes textúra betöltő (AssetManager cache nélkül lassú lehet, de működik)
            const texture = new THREE.TextureLoader().load(url)

            // Textúra ismétlődés beállítása (hogy ne legyen torz)
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            // Ez egy durva becslés, a valódi UV mapping a geometrián történik
            texture.repeat.set(1, 1)

            matParams.map = texture
            // Ha fehér a textúra, a color legyen fehér, különben elszínezi
            matParams.color = 0xffffff
          }

          return new THREE.MeshStandardMaterial(matParams)
        }
      }
    }

    // Fallback: Ha nincs kiválasztva semmi, marad a default
    return this.defaultWorktopMaterial
  }

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene
    this.scene.add(this.debugHelpers)

    this.initWatchers()
  }

  private initWatchers() {
    // 1. Méret változások (Csúszka)
    watch(
      () => [this.proceduralStore.plinth.height, this.proceduralStore.plinth.depthOffset],
      () => {
        this.fullUpdate()
      },
    )

    // 2. Munkapult változások
    watch(
      () => this.proceduralStore.worktop,
      () => {
        this.generateWorktop()
      },
      { deep: true },
    )

    // 3. Komponens cserék (Láb típus váltás)
    watch(
      () => this.settingsStore.globalComponentSettings,
      () => {
        setTimeout(() => {
          this.fullUpdate()
        }, 50)
      },
      { deep: true },
    )

    // 4. Anyag változások (Korpusz szín csere)
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

    // 5. Kézi trigger (pl. InspectorPanel csúszka)
    watch(
      () => this.proceduralStore.updateTrigger,
      () => {
        this.fullUpdate()
      },
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

  /*private isStandardLegActive(obj: THREE.Object3D): boolean {
    const corpusConfig = this.getCorpusConfig(obj)
    if (!corpusConfig) return false

    for (const group of this.configStore.globalGroups) {
      if (group.targets.includes(GlobalGroupTarget.LEG) || group.targets.includes(GlobalGroupTarget.LEG_SLOT)) {
        const selectedVariantId = this.settingsStore.globalComponentSettings[group.id]
        if (!selectedVariantId) continue

        const variant = group.style.variants.find((v) => v.id === selectedVariantId)
        if (variant && variant.componentIds.includes(ProceduralConstants.LEG_STANDARD_ID)) {
          return true
        }
      }
    }

    const state = obj.userData.componentState || {}
    const values = Object.values(state)
    if (values.some((val: any) => typeof val === 'string' && val.includes(ProceduralConstants.LEG_STANDARD_ID))) {
      return true
    }

    return false
  }
    */

  /**
   * Kizárólag a bútor aktuális állapotát vizsgálja.
   * Ha a 'legs' slotban 'leg_standard' van, akkor TRUE.
   * Minden más esetben (nincs láb, vagy design láb van) FALSE.
   */
  private isStandardLegActive(obj: THREE.Object3D): boolean {
    // 1. Megnézzük a bútorra mentett állapotot
    const state = obj.userData.componentState || {}

    // 2. Végigmegyünk a slotokon (JAVÍTÁS: Object.values használata)
    // Így nem keletkezik felesleges 'slotName' változó
    for (const componentId of Object.values(state)) {
      if (typeof componentId !== 'string') continue

      // Ha a komponens ID-ja 'leg_standard'
      if (componentId.includes(ProceduralConstants.LEG_STANDARD_ID)) {
        return true
      }
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
          if (
            (componentDef as any).category === FurnitureCategory.LEG ||
            componentDef.id.includes('leg')
          ) {
            // Nem standard láb esetén vesszük a magasságot
            if (!componentDef.id.includes(ProceduralConstants.LEG_STANDARD_ID)) {
              maxLift = Math.max(maxLift, heightMM / 1000)
            }
          }
        }
      }
    }
    return maxLift
  }

  // --- POZICIONÁLÁS JAVÍTÁSA ---
  public updateCabinetVerticalPositions() {
    const cabinets = this.experienceStore.placedObjects
    const globalPlinthHeight = this.proceduralStore.plinth.height

    cabinets.forEach((cabinet) => {
      if (!this.getCorpusConfig(cabinet)) return

      const isStandard = this.isStandardLegActive(cabinet)

      if (isStandard) {
        // 1. ESET: STANDARD LÁB

        // Megnézzük, van-e egyedi felülbírálás a bútoron
        const override = cabinet.userData.plinthHeightOverride
        // Ha van override, azt használjuk, ha nincs, a globálisat
        const targetHeight =
          override !== undefined && override !== null ? override : globalPlinthHeight

        if (Math.abs(cabinet.position.y - targetHeight) > 0.0001) {
          cabinet.position.y = targetHeight
          cabinet.updateMatrixWorld()
        }
        this.toggleLegVisibility(cabinet, false)
      } else {
        // 2. ESET: DESIGN LÁB (Ez maradt a régi)
        const designHeight = this.calculateDesignLegHeight(cabinet)
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
      if (name.includes(ProceduralConstants.LEG_STANDARD_ID)) {
        child.visible = visible
      }
      if (
        child.userData.componentId &&
        child.userData.componentId.includes(ProceduralConstants.LEG_STANDARD_ID)
      ) {
        child.visible = visible
      }
    })
  }

  // --- GENERÁLÓK ---

  // --- GENERÁLÁS JAVÍTÁSA (Több magasság kezelése) ---
  private generatePlinth() {
    // 1. Takarítás: Töröljük a régi "ProceduralPlinth" nevű mesheket
    // Mivel most már több is lehet, név alapján keresünk
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (child.name === ProceduralConstants.MESH_PLINTH) toRemove.push(child)
    })
    toRemove.forEach((child) => {
      this.scene.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
    })
    this.plinthMesh = null // Ez a referencia már nem elég, de nullázzuk

    const globalConf = this.proceduralStore.plinth
    const globalHeight = globalConf.height

    // 2. Bútorok összegyűjtése és CSOPORTOSÍTÁSA magasság szerint
    // Map<magasság, bútorok[]>
    const heightGroups = new Map<number, THREE.Object3D[]>()

    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      const isBottom = this.getCorpusConfig(obj) !== null
      return isBottom && this.isStandardLegActive(obj)
    })

    if (cabinets.length === 0) return

    // Csoportosítás
    cabinets.forEach((cab) => {
      const override = cab.userData.plinthHeightOverride
      // Kulcs a magasság (fix 3 tizedesjegyre kerekítve a mapelés miatt)
      const h = override !== undefined && override !== null ? override : globalHeight
      const key = Math.round(h * 1000) / 1000

      if (!heightGroups.has(key)) heightGroups.set(key, [])
      heightGroups.get(key)!.push(cab)
    })

    // 3. Generálás minden magasság-csoporthoz külön-külön
    heightGroups.forEach((groupCabinets, height) => {
      this.createPlinthMeshForGroup(groupCabinets, height, globalConf)
    })
  }

  // Segédfüggvény egy adott magasságú csoport generálásához
  private createPlinthMeshForGroup(cabinets: THREE.Object3D[], height: number, conf: any) {
    const polygons: any[] = []
    const cabinetData: any[] = []

    // Anyag keresés
    let inheritedMaterial: THREE.Material = this.defaultPlinthMaterial

    // JAVÍTÁS: Kimentjük változóba és ellenőrizzük
    if (cabinets.length > 0) {
      const firstCabinet = cabinets[0]
      if (firstCabinet) {
        // Ez a check hiányzott
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

    // Hidak generálása (csak az azonos magasságúak között!)
    this.generateBridges(cabinetData, polygons, this.proceduralStore.worktop.gapThreshold)

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)
      const shapes = this.createShapesFromPolygon(merged)

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: height, // Itt a csoport magasságát használjuk!
        bevelEnabled: false,
      })

      const mesh = new THREE.Mesh(geometry, inheritedMaterial)
      mesh.name = ProceduralConstants.MESH_PLINTH // Fontos a törléshez
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0

      this.applyBoxUVs(geometry)
      this.scene.add(mesh)
    } catch (e) {
      console.error('❌ Error generating plinth group:', e)
    }
  }

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

  // --- MUNKAPULT GENERÁLÁS (Több magasság kezelése) ---
  private generateWorktop() {
    // 1. Takarítás
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (child.name === ProceduralConstants.MESH_WORKTOP) toRemove.push(child)
    })
    toRemove.forEach((child) => {
      this.scene.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
    })
    this.worktopMesh = null

    // Globális beállítások betöltése
    const conf = this.proceduralStore.worktop

    const cabinets = this.experienceStore.placedObjects.filter((obj) => {
      return this.getCorpusConfig(obj) !== null
    })

    if (cabinets.length === 0) return

    // 2. Csoportosítás KIZÁRÓLAG MAGASSÁG szerint
    // Map<magasság_mm, bútorok[]>
    const heightGroups = new Map<number, THREE.Object3D[]>()

    cabinets.forEach((cab) => {
      const box = new THREE.Box3().setFromObject(cab)
      const topY = box.max.y

      // Kerekítjük mm pontosságra
      const key = Math.round(topY * 1000)

      if (!heightGroups.has(key)) heightGroups.set(key, [])
      heightGroups.get(key)!.push(cab)
    })

    // 3. Generálás minden szintre
    heightGroups.forEach((groupCabinets, heightKey) => {
      const exactHeight = heightKey / 1000

      // Itt simán átadjuk a globális konfigot (conf), nem kell variálni a vastagsággal
      this.createWorktopMeshForGroup(groupCabinets, exactHeight, conf)
    })
  }

  // Segédfüggvény: Egy adott magasságú pult-sziget generálása
  private createWorktopMeshForGroup(cabinets: THREE.Object3D[], height: number, conf: any) {
    const polygons: any[] = []
    const cabinetData: any[] = []

    cabinets.forEach((cabinet) => {
      const corpusConfig = this.getCorpusConfig(cabinet)
      if (!corpusConfig) return

      const rawWidth = corpusConfig.properties?.width ?? 600
      const width = rawWidth / 1000

      // Szomszédokat csak a SAJÁT CSOPORTON BELÜL keresünk!
      // Így nem köti össze a lenti bútort a fentivel.
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

    // Hidak generálása (csak a csoporton belül)
    this.generateBridges(cabinetData, polygons, conf.gapThreshold)

    if (polygons.length === 0) return

    try {
      const merged = polygonClipping.union(polygons as any)
      const shapes = this.createShapesFromPolygon(merged)

      // Lyukak kivágása (csak azokat a bútorokat nézzük, amik ebben a csoportban vannak)
      this.applyHoles(cabinets, shapes, conf.defaultDepth)

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: conf.thickness,
        bevelEnabled: false,
      })

      // Anyag kezelés (egyelőre default, később ide jöhet a textúra)
      const material = this.getWorktopMaterial()

      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = ProceduralConstants.MESH_WORKTOP
      mesh.rotation.x = -Math.PI / 2

      // Pozicionálás: A csoport magassága + pici emelés (Z-fighting ellen)
      mesh.position.y = height + 0.001

      this.applyBoxUVs(geometry)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
    } catch (error) {
      console.error('❌ Error generating worktop group:', error)
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

  private applyBoxUVs(geometry: THREE.BufferGeometry) {
    geometry.computeVertexNormals()

    const posAttribute = geometry.attributes.position
    const normAttribute = geometry.attributes.normal
    const uvAttribute = geometry.attributes.uv

    // JAVÍTÁS: Ha bármelyik hiányzik, azonnal kilépünk, így a TS megnyugszik
    if (!posAttribute || !normAttribute || !uvAttribute) return

    const scale = 1.0

    // Innentől a TS már tudja, hogy ezek léteznek, nem fog sírni
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i)
      const y = posAttribute.getY(i)
      const z = posAttribute.getZ(i)

      const nx = Math.abs(normAttribute.getX(i))
      const ny = Math.abs(normAttribute.getY(i))
      const nz = Math.abs(normAttribute.getZ(i))

      let u = 0
      let v = 0

      // 1. TETŐ és ALJA (Local Z domináns -> World Y)
      if (nz > nx && nz > ny) {
        u = y * scale
        v = x * scale // 90 fokos forgatás
      }
      // 2. OLDALAK (Local X domináns)
      else if (nx > ny && nx > nz) {
        u = y * scale
        v = z * scale
      }
      // 3. ELŐLAP/HÁTLAP (Local Y domináns)
      else {
        u = x * scale
        v = z * scale
      }

      uvAttribute.setXY(i, u, v)
    }

    uvAttribute.needsUpdate = true
  }
}
