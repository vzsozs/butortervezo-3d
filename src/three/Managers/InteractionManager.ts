// src/three/Managers/InteractionManager.ts

import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import Experience from '../Experience';
// JAVÍTÁS: Importáljuk a config fájlt, amire szükségünk van.
import { furnitureDatabase } from '@/config/furniture';

export default class InteractionManager {
  private draggedObject: Group | null = null;

  constructor(private experience: Experience) {
    this.addEventListeners();
  }

  private onMouseDown = (event: MouseEvent) => {
    // JAVÍTÁS: Használjunk @ts-expect-error-t a privát property-k eléréséhez.
    // @ts-expect-error - A 'dragging' tulajdonság hibásan privátként van deklarálva a three-stdlib típusdefiníciójában.
    if (event.button !== 0 || this.experience.transformControls.dragging) return;

    this.experience.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.experience.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);

    if (event.shiftKey) {
      const intersects = this.experience.raycaster.intersectObjects(this.experience.intersectableObjects);
      if (intersects.length > 0) {
        this.startDraggingNewObject(intersects[0]!.point);
      }
    } else {
      this.handleObjectSelection();
    }
  }
  
  private startDraggingNewObject(point: Vector3) {
    console.log('--- startDraggingNewObject --- Kezdeti pont:', point);
    const newObject = this.createDraggableObject(point);
    if (newObject) {
      this.draggedObject = newObject;
      this.experience.scene.add(this.draggedObject);
      this.experience.controls.enabled = false;
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('contextmenu', this.onRightClickCancel);
    }
  }

  private handleObjectSelection() {
    const intersects = this.experience.raycaster.intersectObjects(this.experience.placedObjects, true);
    if (intersects.length > 0) {
      let objectToSelect = intersects[0]!.object;
      while (objectToSelect.parent && objectToSelect.parent !== this.experience.scene) {
        objectToSelect = objectToSelect.parent;
      }
      if (objectToSelect instanceof Group) {
        this.experience.selectionStore.selectObject(objectToSelect);
        // JAVÍTÁS: Az opcionális láncolás (?) nem működik értékadás bal oldalán.
        // Mivel a debug modul biztosan létezik, használhatunk !-t vagy egyszerűen elhagyhatjuk.
        this.experience.debug.selectionBoxHelper.setFromObject(objectToSelect);
        this.experience.debug.selectionBoxHelper.visible = true;
        this.experience.transformControls.attach(objectToSelect);
      }
    } else {
      // JAVÍTÁS: Használjunk @ts-expect-error-t a privát property-k eléréséhez.
      // @ts-expect-error - Az 'axis' tulajdonság hibásan privátként van deklarálva a three-stdlib típusdefiníciójában.
      if (!this.experience.transformControls.axis) {
        this.experience.selectionStore.clearSelection();
        this.experience.debug.selectionBoxHelper.visible = false;
        this.experience.transformControls.detach();
      }
    }
  }

  private onMouseMove = (_event: MouseEvent) => {
    if (!this.draggedObject) return;

    // EZEK A SOROK MÁR FELESLEGESEK, MERT AZ EXPERIENCE FOLYAMATOSAN FRISSÍTI AZ EGÉRPOZÍCIÓT
    // this.experience.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    // this.experience.mouse.y = -(event.clientY / window.innerHeight) * 2 - 1;
    
    // A raycaster-t viszont itt kell frissíteni a legfrissebb egérpozícióval!
    this.experience.raycaster.setFromCamera(this.experience.mouse, this.experience.camera);

    const intersects = this.experience.raycaster.intersectObjects(this.experience.intersectableObjects);
    if (intersects.length > 0) {
      const point = intersects[0]!.point;

      const finalPosition = this.experience.placementManager.calculateFinalPosition(
        this.draggedObject, 
        point, 
        this.experience.placedObjects
      );
      console.log('onMouseMove -> Egér pont:', point, 'Számított végleges pozíció:', finalPosition);
      this.draggedObject.position.copy(finalPosition);
    }
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0 || !this.draggedObject) return;
    
    this.draggedObject.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material.transparent = false;
        child.material.opacity = 1.0;
      }
    });

    this.experience.placedObjects.push(this.draggedObject);
    //this.experience.controls.target.copy(this.draggedObject.position); // zsozs: Kamera pozíciója követi a lehelyezett objectet 
    this.experience.debug.hideAll();
    this.endDrag();
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
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onRightClickCancel);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // JAVÍTÁS: A transformControls-t az experience-en keresztül érjük el.
    switch (event.key.toLowerCase()) {
      case 'w':
        this.experience.transformControls.setMode('translate');
        // @ts-expect-error - A 'showX' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showX = true;
        // @ts-expect-error - A 'showY' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showY = false;
        // @ts-expect-error - A 'showZ' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showZ = true;
        break;
      case 'e':
        this.experience.transformControls.setMode('rotate');
        // @ts-expect-error - A 'showX' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showX = false;
        // @ts-expect-error - A 'showY' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showY = true;
        // @ts-expect-error - A 'showZ' tulajdonság hibásan privátként van deklarálva.
        this.experience.transformControls.showZ = false;
        break;
    }
  }

  public addEventListeners() {
    // JAVÍTÁS: A renderer-t az experience-en keresztül érjük el.
    this.experience.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public removeEventListeners() {
    // JAVÍTÁS: A renderer-t az experience-en keresztül érjük el.
    // JAVÍTÁS: A felesleges listener-eltávolítások törlése. Ezeket már az Experience kezeli.
    if (this.experience.renderer.domElement) {
      this.experience.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    // A 'drag' közbeni listenereket az endDrag() már eltávolítja.
  }

  private createDraggableObject(point: Vector3): Group | null {
    // JAVÍTÁS: A store-okat és managereket az experience-en keresztül érjük el.
    const activeId = this.experience.settingsStore.activeFurnitureId;
    if (!activeId) {
      console.warn("Nincs aktív bútor kiválasztva a lehelyezéshez.");
      return null;
    }
    const allFurniture = furnitureDatabase.flatMap(cat => cat.items);
    const furnitureConfig = allFurniture.find(f => f.id === activeId);
    if (!furnitureConfig) return null;
    
    // Az AssetManager-t használjuk a modell klónozásához.
    const modelTemplate = this.experience.assetManager.getModel(furnitureConfig.modelUrl);
    if (!modelTemplate) {
      // Az AssetManager már logolja a hibát, itt nem kell újra.
      return null;
    }
    
    const newObject = modelTemplate; // A getModel már klónozott.
    newObject.name = furnitureConfig.id;
    newObject.traverse((child: Object3D) => { // JAVÍTÁS: Típus megadása a child-nak
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material.transparent = true;
        child.material.opacity = 0.5;
      }
    });
    newObject.rotation.y = -Math.PI / 2;
    newObject.position.copy(point);
    newObject.position.y = 0;
    return newObject;
  }
}