<template>
  <div ref="sceneContainer"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// --- KONFIGURÁCIÓS VÁLTOZÓK ---
const SNAP_INCREMENT = 0.5
const SNAP_DISTANCE = 0.2

// --- VÁLTOZÓK DEFINIÁLÁSA A KOMPONENS SZINTJÉN ---
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let raycaster: THREE.Raycaster
const mouse = new THREE.Vector2()
const intersectableObjects: THREE.Object3D[] = []
let draggedObject: THREE.Group | null = null
const placedObjects: THREE.Group[] = []
let loadedModelTemplate: THREE.Group | null = null

const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfcba03, name: 'HighlightMaterial' });

const sceneContainer = ref<HTMLDivElement | null>(null)

onMounted(() => {
  const container = sceneContainer.value
  if (!container) { return }

  // ... Inicializálás ...
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  raycaster = new THREE.Raycaster()
  controls = new OrbitControls(camera, renderer.domElement)

  // ... Modell betöltése (változatlan) ...
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

  // ... Színek, Jelenet, Fények (változatlan) ...
  // --- SZÍNEK ---
  const backgroundColor = new THREE.Color(0x252525)
  const floorColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
  const gridMainColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
  const gridCenterColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)
  // --- JELENET ---
  scene.background = backgroundColor
  // JAVÍTÁS: Kényelmesebb kezdő kamera pozíció
  camera.position.set(0, 2, 3)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)
  controls.enableDamping = true
  // --- OBJEKTUMOK ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: floorColor, side: THREE.DoubleSide })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  intersectableObjects.push(floor)
  const gridHelper = new THREE.GridHelper(20, 20, gridCenterColor, gridMainColor)
  scene.add(gridHelper)
  // --- FÉNYEK ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 7)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  // --- FÜGGVÉNYEK ---
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
    newObject.position.copy(point)
    newObject.position.y = 0
    return newObject
  }

  function snapToGrid(value: number): number {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  function endDrag() {
    controls.enabled = true
    draggedObject = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('contextmenu', onRightClickCancel)
  }

  // --- EGÉRESEMÉNY-KEZELŐK ---
  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 || !event.shiftKey) return
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

      // JAVÍTÁS: "Hátlap a rácshoz" logika
      // A kurzor pozíciójához hozzáadjuk a tárgy fél mélységét, ezt igazítjuk a rácsra,
      // majd az eredményből levonjuk a fél mélységet, hogy a tárgy középpontját kapjuk meg.
      let snappedX = snapToGrid(point.x);
      let snappedZ = snapToGrid(point.z + draggedSize.z / 2) - draggedSize.z / 2;

      for (const targetObject of placedObjects) {
        const targetBox = new THREE.Box3().setFromObject(targetObject);
        const targetSize = new THREE.Vector3();
        targetBox.getSize(targetSize);
        const targetPos = targetObject.position;

        const distX = Math.abs(point.x - targetPos.x) - (draggedSize.x / 2 + targetSize.x / 2);
        if (distX < SNAP_DISTANCE) {
          if (point.x > targetPos.x) {
            snappedX = targetPos.x + targetSize.x / 2 + draggedSize.x / 2;
          } else {
            snappedX = targetPos.x - targetSize.x / 2 - draggedSize.x / 2;
          }
          // JAVÍTÁS: Ha X-tengelyen vonzódunk, a Z pozíciót is igazítjuk, hogy egy sorban legyenek.
          snappedZ = targetPos.z;
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
      // JAVÍTÁS: A kamera célpontját az utoljára letett objektumra állítjuk.
      // Így a forgatás és zoomolás mindig a munkaterületre fókuszál.
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
  
  // ... a többi kód változatlan ...
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  container.addEventListener('mousedown', onMouseDown)
  window.addEventListener('resize', onWindowResize)
  const animate = () => {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
  onUnmounted(() => {
    container.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('resize', onWindowResize)
    endDrag()
  })
})
</script>

<style scoped>
div {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>