import { watch, toRaw } from 'vue'
import {
  Group,
  Mesh,
  Object3D,
  Vector3,
  Vector2,
  Box3,
  Line,
  BufferGeometry,
  LineDashedMaterial,
  SphereGeometry,
  MeshBasicMaterial,
  Plane,
  Line3,
} from 'three'
import { FurnitureCategory } from '@/config/furniture'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import Experience from '../Experience'

export default class InteractionManager {
  private experience: Experience

  // Dragging State
  private draggedObject: Group | null = null
  private isDraggingNewObject: boolean = false
  private dragStartPosition: Vector3 | null = null
  private isTransforming: boolean = false

  // Mouse State
  private isMouseDown = false
  private isInteractingWithObject = false
  private mouseDownPosition = new Vector2()

  // Ruler State
  private rulerStartPoint: Vector3 | null = null
  private floatingDot: Mesh | null = null
  private activeRulerLine: Line | null = null
  private activeRulerLabel: CSS2DObject | null = null
  private activeRulerStartDot: Mesh | null = null
  private activeRulerEndDot: Mesh | null = null

  constructor(experience: Experience) {
    this.experience = experience
    this.addEventListeners()
    this.setupWatchers()
  }

  // --- SEGÉDFÜGGVÉNY A MAGASSÁGHOZ ---
  private getLiftHeight(object: Group): number {
    const configStore = this.experience.configStore
    let maxLift = 0

    // JAVÍTÁS: Nem szabad a bútor SAJÁT magasságát használni emelésnek,
    // mert az a fizikai mérete (pl. 715mm), nem pedig hogy mennyire kell felemelni a földről.
    // Kivéve ha kifejezetten 'legs' kategória, de azt a lenti ciklus kezeli.

    /*
    if (furnitureConfig && furnitureConfig.height) {
      maxLift = furnitureConfig.height
    } else if (furnitureConfig && furnitureConfig.properties?.height) {
      maxLift = furnitureConfig.properties.height
    }
    */

    const componentState = object.userData.componentState
    if (componentState) {
      for (const slotId in componentState) {
        const componentId = componentState[slotId]
        const componentDef = configStore.getComponentById(componentId)

        if (componentDef) {
          const heightMM = componentDef.properties?.height || (componentDef as any).height || 0
          if (componentDef.componentType === 'legs' || componentDef.id.includes('leg')) {
            maxLift = Math.max(maxLift, heightMM / 1000)
          }
        }
      }
    }

    return maxLift
  }

  private getTargetElevation(object: Group): number {
    const config = object.userData.config
    const category = config?.category

    if (category === FurnitureCategory.BOTTOM_CABINET) {
      return this.getLiftHeight(object)
    }

    if (!this.isDraggingNewObject) {
      return object.position.y
    }

    if (category === 'top_cabinets' || category === 'wall_cabinets') {
      return this.experience.configStore.generalSettings.upperCabinet.defaultElevation
    }

    return 0
  }

  // --- ESEMÉNYKEZELŐK ---

  private onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    // @ts-expect-error - TransformControls
    if (this.experience.camera.transformControls.dragging) return

    this.isMouseDown = true
    this.mouseDownPosition.set(event.clientX, event.clientY)

    // Frissítjük a raycastert a kattintás pillanatában
    this.experience.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.experience.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)

    // Megnézzük, hogy bútorra kattintottunk-e
    const intersects = this.experience.raycaster.intersectObjects(
      this.experience.experienceStore.placedObjects,
      true,
    )
    this.isInteractingWithObject = intersects.length > 0
  }

  private onMouseUp = (event: MouseEvent) => {
    if (this.isDraggingNewObject && this.draggedObject) {
      this.onFurnitureDragEnd(event)
      this.isMouseDown = false
      return
    }

    if (!this.isMouseDown) return
    this.isMouseDown = false

    if (this.draggedObject) {
      this.onFurnitureDragEnd(event)
      return
    }

    const dist = this.mouseDownPosition.distanceTo(new Vector2(event.clientX, event.clientY))
    if (dist < 5) {
      if (this.experience.settingsStore.isRulerModeActive) {
        this.handleRulerClick()
      } else {
        this.handleClick(event)
      }
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    this.experience.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.experience.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    if (this.experience.settingsStore.isRulerModeActive) {
      this.onRulerHover()
      if (this.rulerStartPoint) this.onRulerMouseMove()
    }

    // DRAG INDÍTÁSA MEGLÉVŐ OBJEKTUMRA
    if (
      this.isMouseDown &&
      this.isInteractingWithObject &&
      !this.draggedObject &&
      !this.isTransforming &&
      !this.experience.settingsStore.isRulerModeActive
    ) {
      const dist = this.mouseDownPosition.distanceTo(new Vector2(event.clientX, event.clientY))
      if (dist > 5) {
        this.experience.raycaster.setFromCamera(
          this.experience.mouse,
          this.experience.camera.instance,
        )
        const intersects = this.experience.raycaster.intersectObjects(
          this.experience.experienceStore.placedObjects,
          true,
        )

        if (intersects.length > 0 && intersects[0]) {
          let targetObj: Object3D | null = intersects[0].object
          let parentGroup: Group | null = null

          while (targetObj) {
            if (
              this.experience.experienceStore.placedObjects.some(
                (po) => po.uuid === targetObj?.uuid,
              )
            ) {
              parentGroup = targetObj as Group
              break
            }
            targetObj = targetObj.parent
          }

          if (parentGroup) {
            this.startDraggingExistingObject(parentGroup)
          }
        }
      }
    }

    if (!this.draggedObject) return

    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)

    // VISSZAÁLLÍTVA: Az összes objektumot vizsgáljuk, nem a síkot
    const intersectables = [...this.experience.intersectableObjects]
    const intersects = this.experience.raycaster.intersectObjects(intersectables)

    if (intersects.length > 0 && intersects[0]) {
      const point = intersects[0].point

      // MAGASSÁG BEÁLLÍTÁSA
      const targetY = this.getTargetElevation(this.draggedObject)
      point.y = targetY

      const others = this.experience.experienceStore.placedObjects.filter(
        (o) => o.uuid !== this.draggedObject?.uuid,
      )
      const result = this.experience.placementManager.calculateFinalPosition(
        this.draggedObject,
        point,
        others,
      )

      this.draggedObject.position.copy(result.position)
      if (result.rotation) {
        this.draggedObject.rotation.copy(result.rotation)
      }

      this.experience.debug.updateMovingObject(this.draggedObject)

      // ÚJ: Kijelölés (sárga doboz) frissítése mozgatás közben
      if (this.experience.selectionStore.selectedObject === this.draggedObject) {
        this.experience.debug.selectionBoxHelper.setFromObject(this.draggedObject)
      }
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      return

    switch (event.key.toLowerCase()) {
      case 'w':
        this.setTransformMode('translate')
        break
      case 'e':
        this.setTransformMode('rotate')
        break
      case 'delete':
      case 'backspace':
        this.handleDelete()
        break
      case 'escape':
        this.handleEscape()
        break
    }
  }

  private handleClick(_event: MouseEvent) {
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)

    const intersects = this.experience.raycaster.intersectObjects(
      this.experience.experienceStore.placedObjects,
      true,
    )

    if (intersects.length > 0 && intersects[0]) {
      let targetObj: Object3D | null = intersects[0].object
      let parentGroup: Group | null = null

      while (targetObj) {
        if (
          this.experience.experienceStore.placedObjects.some((po) => po.uuid === targetObj?.uuid)
        ) {
          parentGroup = targetObj as Group
          break
        }
        targetObj = targetObj.parent
      }

      if (parentGroup) {
        this.selectObject(parentGroup)
      }
    } else {
      this.deselectObject()
    }
  }

  public selectObject(object: Group) {
    this.experience.selectionStore.selectObject(object)
    this.experience.debug.selectionBoxHelper.setFromObject(object)
    this.experience.debug.selectionBoxHelper.visible = true
    this.experience.camera.transformControls.attach(object)
    this.setTransformMode('translate')
  }

  public deselectObject() {
    this.experience.selectionStore.clearSelection()
    this.experience.debug.selectionBoxHelper.visible = false
    this.experience.camera.transformControls.detach()
  }

  public async startPlacementMode() {
    const activeId = this.experience.settingsStore.activeFurnitureId
    if (!activeId) return

    const config = this.experience.configManager.getFurnitureById(activeId)
    if (!config) return

    const defaultComponentState: Record<string, string> = {}
    config.componentSlots.forEach((slot) => {
      if (slot.defaultComponent) defaultComponentState[slot.slotId] = slot.defaultComponent
    })

    const newObject = await this.experience.assetManager.buildFurnitureFromConfig(
      config,
      defaultComponentState,
    )
    if (!newObject) return

    if (!newObject.userData.componentState) {
      newObject.userData.componentState = defaultComponentState
    }

    const globalMaterials = this.experience.settingsStore.globalMaterialSettings
    newObject.userData.materialState = { ...globalMaterials }
    await this.experience.stateManager.applyMaterialsToObject(newObject)

    this.isDraggingNewObject = true
    const targetY = this.getTargetElevation(newObject)

    newObject.position.set(0, targetY, 0)

    this.beginDrag(newObject)
  }

  public startDraggingExistingObject(object: Group) {
    this.isDraggingNewObject = false
    this.beginDrag(object)
  }

  public startDraggingDuplicatedObject(object: Group) {
    this.isDraggingNewObject = true

    // 🔥 JAVÍTÁS: Kezdő magasság beállítása
    // Ez biztosítja, hogy a felsőszekrények felvegyék a defaultElevation-t,
    // az alsószekrények pedig a lábak magasságát (a getTargetElevation kezeli).
    const targetY = this.getTargetElevation(object)
    object.position.y = targetY

    this.beginDrag(object)
  }

  private beginDrag(object: Group) {
    this.draggedObject = object
    this.setObjectOpacity(object, 0.5)

    // Exclude this object from procedural generation (hides its worktop/plinth but keeps others)
    this.experience.proceduralManager.regenerateExcluding(object)

    if (!object.parent) {
      this.experience.scene.add(object)
    }

    this.experience.camera.controls.enabled = false
  }

  private onFurnitureDragEnd = (_event: MouseEvent) => {
    if (!this.draggedObject) return

    this.setObjectOpacity(this.draggedObject, 1.0)
    this.experience.camera.controls.enabled = true

    if (this.isDraggingNewObject) {
      this.experience.addObjectToScene(this.draggedObject)
      this.experience.settingsStore.setActiveFurnitureId(null)
      this.selectObject(this.draggedObject)
    } else {
      this.experience.historyStore.addState()
    }

    this.experience.debug.hideAll()
    // Regenerate procedural elements (which also makes them visible again)
    this.experience.proceduralManager.update()
    this.draggedObject = null
    this.isDraggingNewObject = false
    this.isDraggingNewObject = false
  }

  public handleTransformStart() {
    this.isTransforming = true
    // @ts-expect-error - TransformControls
    const object = toRaw(this.experience.camera.transformControls.object)
    if (object) {
      this.dragStartPosition = object.position.clone()
      // Exclude transformed object from procedural generation
      this.experience.proceduralManager.regenerateExcluding(object)
    }
  }

  public handleTransformEnd() {
    this.isTransforming = false
    this.experience.historyStore.addState()
    this.dragStartPosition = null
    // Regenerate everything (restores parts for the transformed object)
    this.experience.proceduralManager.update()
  }

  public setTransformMode(mode: 'translate' | 'rotate') {
    const controls = this.experience.camera.transformControls
    controls.setMode(mode)

    if (mode === 'rotate') {
      // Forgatásnál csak az Y (függőleges) tengely engedélyezett
      // @ts-expect-error - TransformControls
      controls.showX = false
      // @ts-expect-error - TransformControls
      controls.showY = true
      // @ts-expect-error - TransformControls
      controls.showZ = false
    } else {
      // Mozgatásnál (translate) minden tengely engedélyezett (alapértelmezés)
      // @ts-expect-error - showX
      controls.showX = true
      // @ts-expect-error - showY
      controls.showY = true
      // @ts-expect-error - showZ
      controls.showZ = true

      // Itt jön az alsó szekrény specifikus tiltás (ha translate módban vagyunk)
      const selectedObject = this.experience.selectionStore.selectedObject
      if (selectedObject) {
        const category = selectedObject.userData.config?.category
        if (category === FurnitureCategory.BOTTOM_CABINET) {
          // @ts-expect-error - showY
          controls.showY = false
        }
      }
    }
  }

  private startRulerMode() {
    if (!this.floatingDot) {
      this.floatingDot = this.createRulerDot(0.025, 0x00ffff)
      this.experience.rulerElements.add(this.floatingDot)
    }
  }

  private stopRulerMode() {
    if (this.floatingDot) {
      this.experience.rulerElements.remove(this.floatingDot)
      this.floatingDot = null
    }
    // this.experience.rulerElements.clear() // NE töröljük, hogy megmaradjanak a mérések!
    this.rulerStartPoint = null
  }

  public clearRulers() {
    this.experience.rulerElements.clear()
    // Ha aktív a mód, a floatingDot-ot újra létre kell hozni, vagy csak a vonalakat törölni?
    // A rulerElements tartalmazza a floatingDot-ot is!
    // Így, ha törlünk mindent, a floatingDot is eltűnik.
    // Ha aktív a mód, tegyük vissza.
    if (this.experience.settingsStore.isRulerModeActive) {
      this.startRulerMode()
    }
  }

  public toggleRulerVisibility() {
    this.experience.rulerElements.visible = !this.experience.rulerElements.visible
  }

  public get isRulerVisible(): boolean {
    return this.experience.rulerElements.visible
  }

  private onRulerHover() {
    if (!this.floatingDot) return
    // 1. Gyűjtés: Globális padló (intersectableObjects) KIVÉTELE
    // Csak a bútorok és a szoba elemei kellenek
    // 1. Gyűjtés: Bútorok + Szoba + Procedurális elemek (Munkapult, Lábazat)
    const intersectableForRuler = [
      ...this.experience.experienceStore.placedObjects,
      this.experience.roomManager.group,
      ...this.experience.proceduralManager.getProceduralMeshes(),
    ]
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)
    const rawIntersects = this.experience.raycaster.intersectObjects(intersectableForRuler, true)

    // 2. Szűrés: Csak a releváns elemek
    const intersects = rawIntersects.filter((hit) => {
      // Padló név szerinti szűrése
      if (hit.object.name === 'RoomFloor') return false

      // LineSegments (pl. wireframe) kiszűrése - ne snappeljen a fal keretére
      if (hit.object.type === 'LineSegments') return false

      return true
    })

    // 3. Matematikai sík (Y=0) metszése fallback-ként
    let currentPoint: Vector3 | null = null
    let minDist = Infinity

    // Legközelebbi érvényes tárgy találat
    if (intersects.length > 0 && intersects[0]) {
      currentPoint = intersects[0].point.clone()
      minDist = intersects[0].distance
    }

    // Sík metszése
    const plane = new Plane(new Vector3(0, 1, 0), 0)
    const planeTarget = new Vector3()
    const planeHit = this.experience.raycaster.ray.intersectPlane(plane, planeTarget)

    // Ha van sík találat, és közelebb van (vagy nincs más találat) -> Használjuk
    if (planeHit) {
      const planeDist = planeTarget.distanceTo(this.experience.raycaster.ray.origin)
      if (planeDist < minDist) {
        currentPoint = planeTarget
      }
    }

    if (!currentPoint) {
      this.floatingDot.visible = false
      return
    }

    const snapPoint = this.findClosestSnapPoint(currentPoint)
    if (snapPoint) currentPoint = snapPoint

    this.floatingDot.position.copy(currentPoint)
    this.floatingDot.visible = true
  }

  private onRulerMouseMove() {
    if (
      !this.rulerStartPoint ||
      !this.activeRulerLine ||
      !this.activeRulerLabel ||
      !this.activeRulerEndDot
    )
      return

    const intersectableForRuler = [
      ...this.experience.experienceStore.placedObjects,
      this.experience.roomManager.group,
      ...this.experience.proceduralManager.getProceduralMeshes(),
    ]
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)
    const rawIntersects = this.experience.raycaster.intersectObjects(intersectableForRuler, true)

    const intersects = rawIntersects.filter((hit) => {
      if (hit.object.name === 'RoomFloor') return false
      if (hit.object.type === 'LineSegments') return false
      return true
    })

    // 3. Matematikai sík / Tárgy választás
    let currentPoint: Vector3 | null = null
    let minDist = Infinity

    if (intersects.length > 0 && intersects[0]) {
      currentPoint = intersects[0].point.clone()
      minDist = intersects[0].distance
    }

    const plane = new Plane(new Vector3(0, 1, 0), 0)
    const planeTarget = new Vector3()
    const planeHit = this.experience.raycaster.ray.intersectPlane(plane, planeTarget)

    if (planeHit) {
      const planeDist = planeTarget.distanceTo(this.experience.raycaster.ray.origin)
      if (planeDist < minDist) {
        currentPoint = planeTarget
      }
    }

    if (!currentPoint) return

    const snapPoint = this.findClosestSnapPoint(currentPoint)
    if (snapPoint) currentPoint = snapPoint

    this.activeRulerEndDot.position.copy(currentPoint)
    const geometry = this.activeRulerLine.geometry as BufferGeometry
    geometry.setFromPoints([this.rulerStartPoint, currentPoint])
    this.activeRulerLine.computeLineDistances()

    const distance = this.rulerStartPoint.distanceTo(currentPoint)
    this.activeRulerLabel.element.textContent = `${distance.toFixed(2)} m`
    this.activeRulerLabel.position.lerpVectors(this.rulerStartPoint, currentPoint, 0.5)
  }

  private handleRulerClick() {
    if (!this.floatingDot || !this.floatingDot.visible) return
    const point = this.floatingDot.position.clone()

    if (!this.rulerStartPoint) {
      this.rulerStartPoint = point
      this.activeRulerStartDot = this.createRulerDot()
      this.activeRulerStartDot.position.copy(this.rulerStartPoint)
      this.activeRulerEndDot = this.createRulerDot()
      this.activeRulerEndDot.position.copy(this.rulerStartPoint)
      this.activeRulerLine = this.createRulerLine(this.rulerStartPoint, this.rulerStartPoint)
      this.activeRulerLabel = this.createRulerLabel('0.00 m')
      this.activeRulerLabel.position.copy(this.rulerStartPoint)
      this.experience.rulerElements.add(
        this.activeRulerLine,
        this.activeRulerLabel,
        this.activeRulerStartDot,
        this.activeRulerEndDot,
      )
    } else {
      this.rulerStartPoint = null
      this.activeRulerLine = null
      this.activeRulerLabel = null
      this.activeRulerStartDot = null
      this.activeRulerEndDot = null
    }
  }

  private findClosestSnapPoint(currentPoint: Vector3): Vector3 | null {
    const snapThreshold = 0.2
    let closestPoint: Vector3 | null = null
    let minDistance = snapThreshold
    for (const furniture of this.experience.experienceStore.placedObjects) {
      const corners = this.getFurnitureCorners(furniture)
      for (const corner of corners) {
        const distance = currentPoint.distanceTo(corner)
        if (distance < minDistance) {
          minDistance = distance
          closestPoint = corner
        }
      }
    }

    // 2. Szoba pontok (Falak, ablakok sarkai)
    const roomPoints = this.getRoomSnapPoints()
    for (const point of roomPoints) {
      const distance = currentPoint.distanceTo(point)
      if (distance < minDistance) {
        minDistance = distance
        closestPoint = point
      }
    }

    // 3. Szoba élek (Falak élei - LineSegments alapján)
    // Ez lehetővé teszi a fal élére való "tapadást"
    const roomSegments = this.getRoomEdgeSegments()
    const tempPoint = new Vector3()
    const line3 = new Line3()

    for (const segment of roomSegments) {
      line3.set(segment[0], segment[1])
      line3.closestPointToPoint(currentPoint, true, tempPoint)
      const distance = currentPoint.distanceTo(tempPoint)

      // Kisebb threshold éleknél, hogy a sarkok (pontok) prioritást élvezzenek?
      // Vagy ugyanaz, de a sorrend miatt (ha pont talált, az előrébb van) a pont nyerhet?
      // Mivel minDistance csökken, ha a pont közelebb van, az nyer.
      if (distance < minDistance) {
        minDistance = distance
        closestPoint = tempPoint.clone()
      }
    }

    return closestPoint
  }

  private getRoomEdgeSegments(): [Vector3, Vector3][] {
    const segments: [Vector3, Vector3][] = []
    const roomGroup = this.experience.roomManager.group

    roomGroup.traverse((child) => {
      // Csak a LineSegments (drótváz) érdekel minket
      if (child.type === 'LineSegments') {
        // Padlóhoz tartozó vonalak kihagyása (ha nem akarjuk)
        // A RoomManager 'RoomFloor' a mesh neve. A keretét 'addEdges' adja hozzá.
        // A keret parentje a floor.
        if (child.parent && child.parent.name === 'RoomFloor') return

        const geometry = (child as any).geometry
        if (geometry && geometry.isBufferGeometry) {
          const pos = geometry.attributes.position
          // LineSegments: páronként alkotnak vonalat (0-1, 2-3)
          for (let i = 0; i < pos.count; i += 2) {
            const start = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(
              child.matrixWorld,
            )
            const end = new Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)).applyMatrix4(
              child.matrixWorld,
            )
            segments.push([start, end])
          }
        }
      }
    })
    return segments
  }

  private getFurnitureCorners(furniture: Group): Vector3[] {
    const points: Vector3[] = []

    // 2. Munkapult sarkok (Pontos, procedurális adatokból)
    const worktopCorners = this.experience.proceduralManager.getWorktopCornersForCabinet(
      furniture.uuid,
    )

    // 1. Fő befoglaló
    const mainBox = new Box3().setFromObject(furniture)

    if (worktopCorners && worktopCorners.length > 0) {
      // Ha van munkapult, akkor a doboznak CSAK AZ ALSÓ pontjait adjuk hozzá
      // (Mert a felsőket a worktopCorners pontosabban tartalmazza, a doboz teteje pedig bezavarhat "dupla" pontként)
      if (!mainBox.isEmpty()) {
        const boxCorners = this.getBoxCorners(mainBox)
        const centerY = mainBox.getCenter(new Vector3()).y
        // Csak az alsó sarkok (középpont alattiak)
        const bottomCorners = boxCorners.filter((p) => p.y < centerY)
        points.push(...bottomCorners)
      }
      // Hozzáadjuk a munkapult (felső) sarkait
      points.push(...worktopCorners)
    } else {
      // Ha nincs munkapult, mehet az egész doboz (8 sarok)
      if (!mainBox.isEmpty()) {
        points.push(...this.getBoxCorners(mainBox))
      }
    }

    return points
  }

  private getRoomSnapPoints(): Vector3[] {
    const points: Vector3[] = []
    const roomGroup = this.experience.roomManager.group

    // Opcionális: Duplikátumok szűrése, mert a háromszögelés miatt sok azonos pont van
    // De a findClosestSnapPoint amúgy is a legközelebbit keresi, nem baj ha több van ugyanott (csak lassabb)
    roomGroup.traverse((child) => {
      if (child instanceof Mesh) {
        if (child.name === 'RoomFloor') return
        // Árnyék mesh-ek kihagyása
        if (
          child.material instanceof LineDashedMaterial ||
          (child.material as any).isShadowMaterial
        )
          return

        const geometry = child.geometry
        if (geometry) {
          const posAttribute = geometry.attributes.position
          if (posAttribute) {
            // Vertexek gyűjtése (World Space-ben)
            for (let i = 0; i < posAttribute.count; i++) {
              const localV = new Vector3(
                posAttribute.getX(i),
                posAttribute.getY(i),
                posAttribute.getZ(i),
              )
              const worldV = localV.applyMatrix4(child.matrixWorld)
              points.push(worldV)
            }
          }
        }
      }
    })

    return points
  }

  private getBoxCorners(box: Box3): Vector3[] {
    return [
      new Vector3(box.min.x, box.min.y, box.min.z),
      new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z),
      new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z),
      new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z),
      new Vector3(box.max.x, box.max.y, box.max.z),
    ]
  }

  private createRulerLine(start: Vector3, end: Vector3): Line {
    const geometry = new BufferGeometry().setFromPoints([start, end])
    const material = new LineDashedMaterial({
      color: 0xffd700,
      dashSize: 0.05,
      gapSize: 0.025,
      depthTest: false,
    })
    const line = new Line(geometry, material)
    line.computeLineDistances()
    return line
  }

  private createRulerDot(size = 0.02, color: number | string = 0xffd700): Mesh {
    const geometry = new SphereGeometry(size, 16, 16)
    const material = new MeshBasicMaterial({ color: color, depthTest: false })
    return new Mesh(geometry, material)
  }

  private createRulerLabel(text: string): CSS2DObject {
    const div = document.createElement('div')
    div.className = 'ruler-label'
    div.textContent = text
    div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'
    div.style.color = 'white'
    div.style.padding = '2px 5px'
    div.style.borderRadius = '3px'
    div.style.fontSize = '12px'
    return new CSS2DObject(div)
  }

  public handleDelete() {
    const selectedObject = this.experience.selectionStore.selectedObject
    if (selectedObject) {
      this.experience.removeObject(selectedObject)
      this.deselectObject()
    }
  }

  private handleEscape() {
    if (this.isDraggingNewObject && this.draggedObject) {
      this.experience.scene.remove(this.draggedObject)
      this.draggedObject = null
      this.isDraggingNewObject = false
      this.experience.settingsStore.setActiveFurnitureId(null)
      this.experience.settingsStore.setActiveFurnitureId(null)
      this.experience.camera.controls.enabled = true
    } else if (this.experience.settingsStore.isRulerModeActive) {
      this.stopRulerMode()
      this.experience.settingsStore.toggleRulerMode()
    } else if (this.experience.selectionStore.selectedObject) {
      this.deselectObject()
    }
  }

  private setObjectOpacity(object: Group, opacity: number) {
    object.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const mat = Array.isArray(child.material) ? child.material[0] : child.material

        if (mat) {
          // --- MOZGATÁS (Átlátszó "szellem" mód) ---
          if (opacity < 1.0) {
            // 1. Eredeti mentése (csak ha még nincs mentve)
            if (!child.userData.originalMaterial) {
              child.userData.originalMaterial = mat
            }

            // 2. Klónozás a mozgatáshoz
            // Mindig az EREDETIBŐL klónozunk, hogy ne halmozódjanak a hibák
            const baseMat = child.userData.originalMaterial
            const newMat = baseMat.clone()

            newMat.transparent = true
            newMat.opacity = opacity

            // Mozgatás alatt kikapcsoljuk a transmission-t, hogy egyszerűbb/gyorsabb legyen a render
            // és biztosan látszódjon a "szellem"
            if ('transmission' in newMat) {
              newMat.transmission = 0
            }

            child.material = newMat
          }
          // --- VISSZAÁLLÍTÁS (Normál mód) ---
          else {
            if (child.userData.originalMaterial) {
              // Visszarakjuk az eredeti, érintetlen anyagot
              child.material = child.userData.originalMaterial

              // Töröljük a referenciát, hogy legközelebb újra frisset mentsünk
              delete child.userData.originalMaterial
            }
          }
        }
      }
    })
  }

  private setupWatchers() {
    watch(
      () => this.experience.settingsStore.activeFurnitureId,
      (newId) => {
        if (newId) this.startPlacementMode()
      },
    )
    watch(
      () => this.experience.settingsStore.isRulerModeActive,
      (isActive) => {
        if (isActive) this.startRulerMode()
        else this.stopRulerMode()
      },
    )
  }

  public addEventListeners() {
    this.experience.canvas.addEventListener('mousedown', this.onMouseDown)
    this.experience.canvas.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
  }

  public removeEventListeners() {
    this.experience.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.experience.canvas.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}
