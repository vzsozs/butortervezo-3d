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

    const furnitureConfig = object.userData.config
    if (furnitureConfig && furnitureConfig.height) {
      maxLift = furnitureConfig.height
    } else if (furnitureConfig && furnitureConfig.properties?.height) {
      maxLift = furnitureConfig.properties.height
    }

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
    if (this.isMouseDown && !this.draggedObject && !this.isTransforming) {
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
      const finalPosition = this.experience.placementManager.calculateFinalPosition(
        this.draggedObject,
        point,
        others,
      )

      this.draggedObject.position.copy(finalPosition)
      this.experience.debug.updateMovingObject(this.draggedObject)

      // ÚJ: Kijelölés (sárga doboz) frissítése mozgatás közben
      if (this.experience.selectionStore.selectedObject === this.draggedObject) {
        this.experience.debug.selectionBoxHelper.setFromObject(this.draggedObject)
      }
    }
  }

  // ... (A többi metódus változatlan: onKeyDown, handleClick, selectObject, deselectObject, startPlacementMode, startDraggingExistingObject, beginDrag, onFurnitureDragEnd, handleTransformStart, handleTransformEnd, setTransformMode, Ruler logika, handleDelete, handleEscape, setObjectOpacity, setupWatchers, addEventListeners, removeEventListeners) ...

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
    this.beginDrag(object)
  }

  private beginDrag(object: Group) {
    this.draggedObject = object
    this.setObjectOpacity(object, 0.5)

    if (!object.parent) {
      this.experience.scene.add(object)
    }

    this.experience.camera.controls.enabled = false
    window.addEventListener('mousemove', this.onMouseMove)
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
    this.draggedObject = null
    this.isDraggingNewObject = false
    window.removeEventListener('mousemove', this.onMouseMove)
  }

  public handleTransformStart() {
    this.isTransforming = true
    // @ts-expect-error - TransformControls
    const object = toRaw(this.experience.camera.transformControls.object)
    if (object) {
      this.dragStartPosition = object.position.clone()
    }
  }

  public handleTransformEnd() {
    this.isTransforming = false
    this.experience.historyStore.addState()
    this.dragStartPosition = null
  }

  public setTransformMode(mode: 'translate' | 'rotate') {
    const controls = this.experience.camera.transformControls
    controls.setMode(mode)

    // @ts-expect-error - showX
    controls.showX = true
    // @ts-expect-error - showY
    controls.showY = true
    // @ts-expect-error - showZ
    controls.showZ = true

    const selectedObject = this.experience.selectionStore.selectedObject
    if (selectedObject && mode === 'translate') {
      const category = selectedObject.userData.config?.category
      if (category === FurnitureCategory.BOTTOM_CABINET) {
        // @ts-expect-error - showY
        controls.showY = false
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
    this.experience.rulerElements.clear()
    this.rulerStartPoint = null
  }

  private onRulerHover() {
    if (!this.floatingDot) return
    const intersectableForRuler = [
      ...this.experience.intersectableObjects,
      ...this.experience.experienceStore.placedObjects,
    ]
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)
    const intersects = this.experience.raycaster.intersectObjects(intersectableForRuler, true)

    if (intersects.length === 0 || !intersects[0]) {
      this.floatingDot.visible = false
      return
    }

    let currentPoint = intersects[0].point.clone()
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
      ...this.experience.intersectableObjects,
      ...this.experience.experienceStore.placedObjects,
    ]
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera.instance)
    const intersects = this.experience.raycaster.intersectObjects(intersectableForRuler, true)

    if (intersects.length === 0 || !intersects[0]) return

    let currentPoint = intersects[0].point.clone()
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
    return closestPoint
  }

  private getFurnitureCorners(furniture: Group): Vector3[] {
    const box = new Box3().setFromObject(furniture)
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
      this.experience.camera.controls.enabled = true
      window.removeEventListener('mousemove', this.onMouseMove)
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
        if (mat && 'opacity' in mat && 'transparent' in mat) {
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = mat.clone()
          }
          const newMat = mat.clone()
          newMat.transparent = opacity < 1.0
          newMat.opacity = opacity
          child.material = newMat
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
    window.addEventListener('keydown', this.onKeyDown)
  }

  public removeEventListeners() {
    this.experience.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.experience.canvas.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}
