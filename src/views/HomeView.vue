<template>
  <div ref="sceneContainer" class="absolute inset-0"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useSelectionStore } from '@/stores/selection'

// =======================================================================
// KONFIGURÁCIÓ ÉS ÁLLAPOT
// =======================================================================

const SNAP_INCREMENT = 0.2
const SNAP_DISTANCE = 0.2

// Three.js alapok
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let raycaster: THREE.Raycaster

// Modellek és objektumok
let loadedModelTemplate: THREE.Group | null = null
const placedObjects: THREE.Group[] = []
const intersectableObjects: THREE.Object3D[] = [] // A padló a raycastinghoz

// Interakciós állapotok
const mouse = new THREE.Vector2()
let draggedObject: THREE.Group | null = null
let selectionBoxHelper: THREE.BoxHelper

// Anyagok
const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfcba03, name: 'HighlightMaterial' });

// Vue reaktivitás
const sceneContainer = ref<HTMLDivElement | null>(null)
const selectionStore = useSelectionStore()


// =======================================================================
// TÖRLÉS FIGYELÉSE (WATCHER)
// =======================================================================

watch(() => selectionStore.objectToDeleteUUID, (uuidToRemove) => {
  // Csak akkor fusson le a logika, ha a jelenet már létezik ÉS van mit törölni.
  if (!scene || !uuidToRemove) {
    return;
  }

  console.log('HomeView észlelte a törlési kérelmet a következő UUID-re:', uuidToRemove)
  
  const objectToRemove = placedObjects.find(obj => obj.uuid === uuidToRemove)

  if (objectToRemove) {
    scene.remove(objectToRemove)
    const index = placedObjects.findIndex(obj => obj.uuid === uuidToRemove)
    if (index > -1) {
      placedObjects.splice(index, 1)
    }
    selectionBoxHelper.visible = false
    if (placedObjects.length === 0) {
      controls.target.set(0, 0, 0)
    }
    console.log('Objektum sikeresen törölve a jelenetből.');
  } else {
    console.warn('A törlendő objektum nem található a placedObjects listában!');
  }
  selectionStore.acknowledgeDeletion()
})

// =======================================================================
// FŐ INICIALIZÁLÓ FÜGGVÉNY (LIFECYCLE HOOK)
// =======================================================================

onMounted(() => {
  const container = sceneContainer.value
  if (!container) { return }

  // 1. Jelenet inicializálása
  initScene(container)
  // 2. Modell betöltése
  loadModels()
  // 3. Eseményfigyelők hozzáadása
  addEventListeners(container)
  // 4. Animációs ciklus elindítása
  animate()
})

onUnmounted(() => {
  // Takarítás, amikor a komponens megszűnik
  removeEventListeners(sceneContainer.value) // Itt adjuk át a ref aktuális értékét
})


// =======================================================================
// INICIALIZÁLÓ SEGÉDFÜGGVÉNYEK
// =======================================================================

function initScene(container: HTMLDivElement) {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  raycaster = new THREE.Raycaster()
  controls = new OrbitControls(camera, renderer.domElement)

  const backgroundColor = new THREE.Color(0x252525)
  scene.background = backgroundColor
  camera.position.set(0, 2, 3)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)
  controls.enableDamping = true

  const floorColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: floorColor, side: THREE.DoubleSide })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  intersectableObjects.push(floor)

  const gridMainColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
  const gridCenterColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)
  const gridHelper = new THREE.GridHelper(20, 20, gridCenterColor, gridMainColor)
  scene.add(gridHelper)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 7)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  selectionBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffff00);
  selectionBoxHelper.visible = false;
  scene.add(selectionBoxHelper);
}

function loadModels() {
  const loader = new GLTFLoader()
  loader.load('/models/szekreny_alap.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.name.toLowerCase().includes('ajto')) {
            child.material = highlightMaterial;
          }
        }
      });
      loadedModelTemplate = model;
    }
  )
}


// =======================================================================
// OBJEKTUM MANIPULÁCIÓS FÜGGVÉNYEK
// =======================================================================

function createDraggableObject(point: THREE.Vector3): THREE.Group | null {
  if (!loadedModelTemplate) { return null }
  const newObject = loadedModelTemplate.clone()
  newObject.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.3;
    }
  });
  newObject.rotation.y = -Math.PI / 2;
  newObject.position.copy(point)
  newObject.position.y = 0
  return newObject
}

function snapToGrid(value: number): number {
  return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
}


// =======================================================================
// EGÉRESEMÉNY-KEZELŐK
// =======================================================================

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return

  if (event.shiftKey) {
    // --- LEHELYEZÉS MÓD ---
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster!.setFromCamera(mouse, camera!)
    const intersects = raycaster!.intersectObjects(intersectableObjects)
    if (intersects.length > 0) {
      const newObject = createDraggableObject(intersects[0]!.point)
      if (newObject) {
        draggedObject = newObject
        scene.add(draggedObject)
        controls.enabled = false
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        window.addEventListener('contextmenu', onRightClickCancel)
      }
    }
  } else {
    // --- KIVÁLASZTÁS MÓD ---
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster!.setFromCamera(mouse, camera!)
    const intersects = raycaster!.intersectObjects(placedObjects, true);
    if (intersects.length > 0) {
      let objectToSelect = intersects[0]!.object;
      while (objectToSelect.parent && objectToSelect.parent !== scene) {
        objectToSelect = objectToSelect.parent;
      }
      if (objectToSelect instanceof THREE.Group) {
        selectionStore.selectObject(objectToSelect);
        selectionBoxHelper.setFromObject(objectToSelect);
        selectionBoxHelper.visible = true;
      }
    } else {
      selectionStore.clearSelection();
      selectionBoxHelper.visible = false;
    }
  }
}

function onMouseMove(event: MouseEvent) {
  if (!draggedObject) return
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  raycaster!.setFromCamera(mouse, camera!)
  const intersects = raycaster!.intersectObjects(intersectableObjects)
  if (intersects.length > 0) {
    const point = intersects[0]!.point;
    const draggedBox = new THREE.Box3().setFromObject(draggedObject);
    const draggedSize = new THREE.Vector3();
    draggedBox.getSize(draggedSize);
    let snappedX = snapToGrid(point.x + draggedSize.x / 2) - draggedSize.x / 2;
    let snappedZ = snapToGrid(point.z);
    for (const targetObject of placedObjects) {
      const targetBox = new THREE.Box3().setFromObject(targetObject);
      const targetSize = new THREE.Vector3();
      targetBox.getSize(targetSize);
      const targetPos = targetObject.position;
      const distZ = Math.abs(point.z - targetPos.z) - (draggedSize.z / 2 + targetSize.z / 2);
      if (distZ < SNAP_DISTANCE) {
        if (point.z > targetPos.z) {
          snappedZ = targetPos.z + targetSize.z / 2 + draggedSize.z / 2;
        } else {
          snappedZ = targetPos.z - targetSize.z / 2 - draggedSize.z / 2;
        }
        snappedX = targetPos.x;
      }
    }
    draggedObject.position.set(snappedX, 0, snappedZ);
  }
}

function onMouseUp(event: MouseEvent) {
  if (event.button !== 0) return
  if (draggedObject) {
    draggedObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.transparent = false;
        child.material.opacity = 1.0;
      }
    });
    placedObjects.push(draggedObject);
    controls.target.copy(draggedObject.position);
  }
  endDrag()
}

function onRightClickCancel(event: MouseEvent) {
  event.preventDefault()
  if (draggedObject) {
    scene.remove(draggedObject)
  }
  endDrag()
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function endDrag() {
  controls.enabled = true
  draggedObject = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('contextmenu', onRightClickCancel)
}

function addEventListeners(container: HTMLDivElement) {
  container.addEventListener('mousedown', onMouseDown)
  window.addEventListener('resize', onWindowResize)
}

function removeEventListeners(container: HTMLDivElement | null) { // Fogadjon el null-t is
  // Csak akkor próbáljuk meg eltávolítani a figyelőt, ha a container még létezik.
  if (container) {
    container.removeEventListener('mousedown', onMouseDown)
  }
  
  window.removeEventListener('resize', onWindowResize)
  endDrag()
}


// =======================================================================
// ANIMÁCIÓS CIKLUS
// =======================================================================

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}
</script>