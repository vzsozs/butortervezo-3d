// src/three/Managers/InteractionManager.ts

import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import Experience from '../Experience';

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
  
  private async startDraggingNewObject(point: Vector3) {
    // JAVÍTÁS: Megvárjuk, amíg a bútor felépül
    const newObject = await this.createDraggableObject(point);
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
      const clickedObject = intersects[0]!.object;

      // --- JAVÍTOTT LOGIKA: MÁSSZUNK FEL A HIERARCHIÁBAN ---
      let parentGroup: Group | null = null;

      // Addig megyünk felfelé a szülőkön, amíg meg nem találjuk azt az objektumot,
      // ami a 'placedObjects' listában is szerepel.
      let current: Object3D | null = clickedObject;
      while (current !== null) {
        if (this.experience.placedObjects.find(obj => obj.uuid === current?.uuid)) {
          parentGroup = current as Group;
          break;
        }
        current = current.parent;
      }
      // ----------------------------------------------------

      if (parentGroup) {
        const objectToSelect = parentGroup;
        if (objectToSelect.parent) {
          this.experience.selectionStore.selectObject(objectToSelect);
          this.experience.debug.selectionBoxHelper.setFromObject(objectToSelect);
          this.experience.debug.selectionBoxHelper.visible = true;
          this.experience.transformControls.attach(objectToSelect);
          this.setTransformMode('translate');
        } else {
          // Ez a log segít, ha a hiba előjön, és tudni akarod, mi okozta.
          console.warn('Megpróbáltunk kiválasztani egy objektumot, ami már nincs a jelenetben.', objectToSelect);
          // Opcionálisan itt ki is ürítheted a selection store-t, ha szükséges.
          this.experience.selectionStore.clearSelection();
        }
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
      // A proxy Y pozícióját nem az egér, hanem a bútor magassága határozza meg.
      point.y = this.draggedObject.position.y;
      const finalPosition = this.experience.placementManager.calculateFinalPosition(
        this.draggedObject, 
        point, 
        this.experience.placedObjects
      );
      this.draggedObject.position.copy(finalPosition);
    }
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0 || !this.draggedObject) return;
    // Az átlátszóságot megszüntetjük a proxy-n belül lévő mesheken.
    this.draggedObject.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material.transparent = false;
        child.material.opacity = 1.0;
      }
    });
    this.experience.placedObjects.push(this.draggedObject);
    this.experience.debug.hideAll();
    this.endDrag();
    this.experience.updateTotalPrice();
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

  // ÚJ, PUBLIKUS METÓDUS
  public setTransformMode(mode: 'translate' | 'rotate') {
    this.experience.transformControls.setMode(mode);
    if (mode === 'translate') {
      // @ts-expect-error - A
      this.experience.transformControls.showX = true;
      // @ts-expect-error - A
      this.experience.transformControls.showY = false;
      // @ts-expect-error - A
      this.experience.transformControls.showZ = true;
    } else if (mode === 'rotate') {
      // @ts-expect-error - A
      this.experience.transformControls.showX = false;
      // @ts-expect-error - A
      this.experience.transformControls.showY = true;
      // @ts-expect-error - A
      this.experience.transformControls.showZ = false;
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // JAVÍTÁS: A transformControls-t az experience-en keresztül érjük el.
    switch (event.key.toLowerCase()) {
      case 'w':
        this.setTransformMode('translate');
        // @ts-expect-error - A 'showX' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showX = true;
        // @ts-expect-error - A 'showY' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showY = false;
        // @ts-expect-error - A 'showZ' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showZ = true;
        break;
      case 'e':
        this.setTransformMode('rotate');
        // @ts-expect-error - A 'showX' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showX = false;
        // @ts-expect-error - A 'showY' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showY = true;
        // @ts-expect-error - A 'showZ' tulajdonság hibásan privátként van deklarálva.
        this.setTransformMode.showZ = false;
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

  // ######################################################################
  // ###                  ÚJ METÓDUS A DUPLIKÁLÁSHOZ                    ###
  // ######################################################################
  public startDraggingExistingObject(object: Group) {
    // 1. Átlátszóvá tesszük, mintha most hoztuk volna létre
    object.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        // Fontos, hogy itt is klónozzuk az anyagot, hogy az átlátszóság
        // ne hasson ki a többi, azonos anyagú objektumra.
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.5;
      }
    });

    // 2. Beállítjuk a húzott objektumnak
    this.draggedObject = object;

    // 3. Elindítjuk a húzási logikát
    this.experience.controls.enabled = false;
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onRightClickCancel);
  }

  // ######################################################################
  // ###         EZ A FÜGGVÉNY MOST MÁR A PROXY-T KEZELI              ###
  // ######################################################################
  private async createDraggableObject(point: Vector3): Promise<Group | null> {
    const activeId = this.experience.settingsStore.activeFurnitureId;
    if (!activeId) {
      console.warn("Nincs aktív bútor kiválasztva a lehelyezéshez.");
      return null;
    }

    // Az AssetManager most már a kész, becsomagolt proxyt adja vissza.
    const furnitureProxy = await this.experience.assetManager.buildFurniture(activeId);
    if (!furnitureProxy) {
      return null;
    }
    
    // Az átlátszóságot a proxy-n belül keressük.
    furnitureProxy.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.5;
      }
    });
    
    // A forgatást és a pozicionálást a proxyn végezzük el.
    furnitureProxy.rotation.y = -Math.PI / 2;
    // A point.y-t lecseréljük a proxy saját, kiszámolt y pozíciójára.
    furnitureProxy.position.set(point.x, furnitureProxy.position.y, point.z);
    
    return furnitureProxy;
  }
}