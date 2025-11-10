// src/three/Managers/InteractionManager.ts

import { watch } from 'vue';
import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3, Vector2, Line, BufferGeometry, LineDashedMaterial, SphereGeometry, MeshBasicMaterial, Box3 } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Experience from '../Experience';

export default class InteractionManager {
  private draggedObject: Group | null = null;
  private rulerStartPoint: Vector3 | null = null;
  private floatingDot: Mesh | null = null;
  private activeRulerLine: Line | null = null;
  private activeRulerLabel: CSS2DObject | null = null;
  private activeRulerStartDot: Mesh | null = null;
  private activeRulerEndDot: Mesh | null = null;

  // Új, egyszerűsített állapotjelzők
  private isMouseDown = false;
  private mouseDownPosition = new Vector2();

  constructor(private experience: Experience) {
    this.addEventListeners();
    this.setupWatchers();
  }

  private onMouseDown = (event: MouseEvent) => {
    // @ts-expect-error - a
    if (event.button !== 0 || this.experience.transformControls.dragging) return;

    this.isMouseDown = true;
    this.mouseDownPosition.set(event.clientX, event.clientY);

    // A Shift+kattintás logikája visszakerül ide, hogy azonnal elindítsa a húzást
    if (!this.experience.settingsStore.isRulerModeActive && event.shiftKey) {
      this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);
      const intersects = this.experience.raycaster.intersectObjects(this.experience.intersectableObjects);
      if (intersects.length > 0) {
        this.startDraggingNewObject(intersects[0]!.point);
      }
    }
  }

  // Új, letisztult onMouseUp, ami mindent kezel
  private onMouseUp = (event: MouseEvent) => {
    if (!this.isMouseDown) return;
    this.isMouseDown = false;

    // Ha éppen bútort húztunk, a dedikált bútor-kezelő lefut
    if (this.draggedObject) {
      this.onFurnitureDragMouseUp(event);
      return;
    }

    // Ellenőrizzük, hogy ez kattintás volt-e (nem húzás)
    const currentPosition = new Vector2(event.clientX, event.clientY);
    const isClick = this.mouseDownPosition.distanceTo(currentPosition) < 5;

    if (!isClick) return; // Ha húzás volt, nem csinálunk semmit (kamera forgott)

    // Ha kattintás volt:
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);
    if (this.experience.settingsStore.isRulerModeActive) {
      this.handleRulerClick();
    } else {
      this.handleObjectSelection();
    }
  }

  // --- VONALZÓ METÓDUSOK ---

  private startRulerMode() {
    if (!this.floatingDot) {
      this.floatingDot = this.createRulerDot(0.025, 0x00ffff);
      this.experience.rulerElements.add(this.floatingDot);
    }
    window.addEventListener('mousemove', this.onRulerHover);
  }

  private stopRulerMode() {
    // A javítás itt is megmarad
    window.removeEventListener('mousemove', this.onRulerHover);
    if (this.floatingDot) {
      this.experience.rulerElements.remove(this.floatingDot);
      this.floatingDot = null;
    }
    this.experience.rulerElements.clear();
    this.rulerStartPoint = null;
  }

  private onRulerHover = () => {
    if (!this.floatingDot) return;
    const intersectableForRuler = [...this.experience.intersectableObjects, ...this.experience.experienceStore.placedObjects];
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);
    const intersects = this.experience.raycaster.intersectObjects(intersectableForRuler, true);
    if (intersects.length === 0) {
        this.floatingDot.visible = false;
        return;
    }

    let currentPoint = intersects[0]!.point.clone();
    const snapPoint = this.findClosestSnapPoint(currentPoint);
    if (snapPoint) {
      currentPoint = snapPoint;
    }
    this.floatingDot.position.copy(currentPoint);
    this.floatingDot.visible = true;

    if (this.rulerStartPoint && this.activeRulerLine && this.activeRulerLabel && this.activeRulerEndDot) {
      this.activeRulerEndDot.position.copy(currentPoint);
      const geometry = this.activeRulerLine.geometry as BufferGeometry;
      geometry.setFromPoints([this.rulerStartPoint, currentPoint]);
      this.activeRulerLine.computeLineDistances();
      const distance = this.rulerStartPoint.distanceTo(currentPoint);
      this.activeRulerLabel.element.textContent = `${distance.toFixed(2)} m`;
      this.activeRulerLabel.position.lerpVectors(this.rulerStartPoint, currentPoint, 0.5);
    }
  }

  private handleRulerClick() {
    if (!this.floatingDot || !this.floatingDot.visible) return;
    const point = this.floatingDot.position.clone();

    if (!this.rulerStartPoint) {
      this.rulerStartPoint = point;
      this.activeRulerStartDot = this.createRulerDot();
      this.activeRulerStartDot.position.copy(this.rulerStartPoint);
      this.activeRulerEndDot = this.createRulerDot();
      this.activeRulerEndDot.position.copy(this.rulerStartPoint);
      this.activeRulerLine = this.createRulerLine(this.rulerStartPoint, this.rulerStartPoint);
      this.activeRulerLabel = this.createRulerLabel("0.00 m");
      this.activeRulerLabel.position.copy(this.rulerStartPoint);
      this.experience.rulerElements.add(this.activeRulerLine, this.activeRulerLabel, this.activeRulerStartDot, this.activeRulerEndDot);
    } else {
      this.rulerStartPoint = null;
      this.activeRulerLine = null;
      this.activeRulerLabel = null;
      this.activeRulerStartDot = null;
      this.activeRulerEndDot = null;
    }
  }

  private findClosestSnapPoint(currentPoint: Vector3): Vector3 | null {
    const snapThreshold = 0.2;
    let closestPoint: Vector3 | null = null;
    let minDistance = snapThreshold;
    for (const furniture of this.experience.experienceStore.placedObjects) {
      const corners = this.getFurnitureCorners(furniture);
      for (const corner of corners) {
        const distance = currentPoint.distanceTo(corner);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = corner;
        }
      }
    }
    return closestPoint;
  }

  private getFurnitureCorners(furniture: Group): Vector3[] {
    const box = new Box3().setFromObject(furniture);
    return [
      new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z), new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z), new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z),
    ];
  }

  private createRulerLine(start: Vector3, end: Vector3): Line {
    const geometry = new BufferGeometry().setFromPoints([start, end]);
    const material = new LineDashedMaterial({ color: 0xffd700, dashSize: 0.05, gapSize: 0.025, depthTest: false });
    const line = new Line(geometry, material);
    line.computeLineDistances();
    return line;
  }

  private createRulerDot(size = 0.02, color: number | string = 0xffd700): Mesh {
    const geometry = new SphereGeometry(size, 16, 16);
    const material = new MeshBasicMaterial({ color: color, depthTest: false });
    return new Mesh(geometry, material);
  }

  private createRulerLabel(text: string): CSS2DObject {
    const div = document.createElement('div');
    div.className = 'ruler-label';
    div.textContent = text;
    return new CSS2DObject(div);
  }

  private setupWatchers() {
    watch(() => this.experience.settingsStore.isRulerModeActive, (isActive) => {
      if (isActive) {
        this.startRulerMode();
      } else {
        this.stopRulerMode();
      }
    });
  }

  // --- BÚTORKEZELŐ METÓDUSOK ---

  private handleObjectSelection() {
    const intersects = this.experience.raycaster.intersectObjects(this.experience.experienceStore.placedObjects, true);
    if (intersects.length > 0) {
      let parentGroup: Group | null = null;
      let current: Object3D | null = intersects[0]!.object;
      while (current !== null) {
        if (this.experience.experienceStore.placedObjects.find(obj => obj.uuid === current?.uuid)) {
          parentGroup = current as Group;
          break;
        }
        current = current.parent;
      }
      if (parentGroup) {
        if (parentGroup.parent) {
          this.experience.selectionStore.selectObject(parentGroup);
          this.experience.debug.selectionBoxHelper.setFromObject(parentGroup);
          this.experience.debug.selectionBoxHelper.visible = true;
          this.experience.transformControls.attach(parentGroup);
          // JAVÍTÁS: A setTransformMode-ot hívjuk meg, ami már tartalmazza a logikát
          this.setTransformMode('translate'); 
        } else {
          this.experience.selectionStore.clearSelection();
        }
      }
    } else {
      // @ts-expect-error - a
      if (!this.experience.transformControls.axis) {
        this.experience.selectionStore.clearSelection();
        this.experience.debug.selectionBoxHelper.visible = false;
        this.experience.transformControls.detach();
      }
    }
  }

  private onMouseMove = (_event: MouseEvent) => {
    if (!this.draggedObject) return;
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);
    const intersects = this.experience.raycaster.intersectObjects(this.experience.intersectableObjects);
    if (intersects.length > 0) {
      const point = intersects[0]!.point;
      point.y = this.draggedObject.position.y;
      const finalPosition = this.experience.placementManager.calculateFinalPosition(
        this.draggedObject, point, this.experience.experienceStore.placedObjects
      );
      this.draggedObject.position.copy(finalPosition);
    }
  }

  private onFurnitureDragMouseUp = (event: MouseEvent) => { 
  if (event.button !== 0 || !this.draggedObject) return;
  
  this.draggedObject.traverse((child) => {
    if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      child.material.transparent = false;
      child.material.opacity = 1.0;
    }
  });

  const allObjects = this.experience.experienceStore.placedObjects.slice();
  allObjects.push(this.draggedObject);
  this.experience.experienceStore.updatePlacedObjects(allObjects);

  this.experience.debug.hideAll();
  this.endDrag();
  this.experience.updateTotalPrice();
  // === ÚJ SOR: ÁLLAPOT MENTÉSE ===
  this.experience.historyStore.addState();
}

  private onRightClickCancel = (event: MouseEvent) => {
    event.preventDefault();
    if (this.draggedObject) {
      this.experience.scene.remove(this.draggedObject);
    }
    this.endDrag();
  }

  private endDrag = () => {
    this.experience.controls.enabled = true;
    this.draggedObject = null;
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onFurnitureDragMouseUp);
    window.removeEventListener('contextmenu', this.onRightClickCancel);
  }

  public setTransformMode(mode: 'translate' | 'rotate') {
    const selectedObject = this.experience.selectionStore.selectedObject;
    const controls = this.experience.transformControls;

    controls.setMode(mode);

    // Alapértelmezett beállítások (minden engedélyezve)
    // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
    controls.showX = true;
    // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
    controls.showY = true;
    // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
    controls.showZ = true;

    // Ha van kiválasztott objektum, alkalmazzuk a specifikus szabályokat
    if (selectedObject) {
      const category = selectedObject.userData.config?.category;

      if (mode === 'translate') {
        // Alsó szekrényeknél letiltjuk az Y mozgatást
        if (category === 'bottom_cabinets') {
          // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
          controls.showY = false;
        }
      } else if (mode === 'rotate') {
        // Forgatást csak az Y tengely körül engedélyezünk mindenhol
      // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
        controls.showX = false;
      // @ts-expect-error - A típusdefiníciók hibásan privátként jelölik
        controls.showZ = false;
      }
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    switch (event.key.toLowerCase()) {
      case 'w': this.setTransformMode('translate'); break;
      case 'e': this.setTransformMode('rotate'); break;
    }
  }

  // Eseményfigyelők frissítése
  public addEventListeners() {
    this.experience.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    // Most már csak egyetlen mouseup figyelő kell
    this.experience.renderer.domElement.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public removeEventListeners() {
    if (this.experience.renderer.domElement) {
      this.experience.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
      this.experience.renderer.domElement.removeEventListener('mouseup', this.onMouseUp);
    }
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private async startDraggingNewObject(point: Vector3) {
    const newObject = await this.createDraggableObject(point);
    if (newObject) {
      this.draggedObject = newObject;
      this.experience.scene.add(this.draggedObject);
      this.experience.controls.enabled = false;
      window.addEventListener('mousemove', this.onMouseMove);
      // A mouseup figyelőt már nem itt adjuk hozzá!
      window.addEventListener('contextmenu', this.onRightClickCancel);
    }
  }

  public startDraggingExistingObject(object: Group) {
    object.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.5;
      }
    });
    this.draggedObject = object;
    this.experience.controls.enabled = false;
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onFurnitureDragMouseUp);
    window.addEventListener('contextmenu', this.onRightClickCancel);
  }

  private async createDraggableObject(point: Vector3): Promise<Group | null> {
    const activeId = this.experience.settingsStore.activeFurnitureId;
    if (!activeId) return null;
    const furnitureProxy = await this.experience.assetManager.buildFurniture(activeId);
    if (!furnitureProxy) return null;
    furnitureProxy.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.5;
      }
    });
    furnitureProxy.rotation.y = -Math.PI / 2;
    furnitureProxy.position.set(point.x, furnitureProxy.position.y, point.z);
    return furnitureProxy;
  }
}