<template>
  <div ref="sceneContainer"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// --- VÁLTOZÓK DEFINIÁLÁSA A KOMPONENS SZINTJÉN ---
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let raycaster: THREE.Raycaster
const mouse = new THREE.Vector2()
const intersectableObjects: THREE.Object3D[] = []
let draggedObject: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null

const sceneContainer = ref<HTMLDivElement | null>(null)

onMounted(() => {
  const container = sceneContainer.value
  if (!container) {
    console.error("A 3D jelenet konténere nem található a DOM-ban.")
    return
  }

  // --- OBJEKTUMOK INICIALIZÁLÁSA ---
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  raycaster = new THREE.Raycaster()
  controls = new OrbitControls(camera, renderer.domElement)

  // --- SZÍNEK ---
  const backgroundColor = new THREE.Color(0x252525)
  const floorColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
  const gridMainColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
  const gridCenterColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)

  // --- JELENET ---
  scene.background = backgroundColor
  camera.position.set(4, 5, 7)
  camera.lookAt(0, 0, 0)
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
  function createDraggableObject(point: THREE.Vector3): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
    const material = new THREE.MeshStandardMaterial({ color: 0x33ff66, transparent: true, opacity: 0.7 })
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const newObject = new THREE.Mesh(geometry, material)
    newObject.position.copy(point)
    newObject.position.y = 0.5
    newObject.castShadow = true
    return newObject
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
    // Csak a bal egérgomb érdekel minket
    if (event.button !== 0) return

    // JAVÍTÁS: A "KAPUŐR"
    // Csak akkor lépünk be a lehelyezés módba, ha a Shift le van nyomva.
    if (event.shiftKey) {
      // Ha a Shift le van nyomva, a régi logika fut le:
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
      raycaster!.setFromCamera(mouse, camera!)
      const intersects = raycaster!.intersectObjects(intersectableObjects)

      if (intersects.length > 0) {
        controls.enabled = false // Kamera letiltása
        draggedObject = createDraggableObject(intersects[0]!.point)
        scene.add(draggedObject)
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        window.addEventListener('contextmenu', onRightClickCancel)
      }
    }
    // Ha a Shift NINCS lenyomva, ez a függvény nem csinál semmit.
    // Az esemény "átesik" a mi kódunkon, és a OrbitControls kezeli le,
    // ami a kamera forgatását fogja eredményezni.
  }

  function onMouseMove(event: MouseEvent) {
    if (!draggedObject) return
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster!.setFromCamera(mouse, camera!)
    const intersects = raycaster!.intersectObjects(intersectableObjects)

    if (intersects.length > 0) {
      const point = intersects[0]!.point
      draggedObject.position.x = Math.round(point.x)
      draggedObject.position.z = Math.round(point.z)
      draggedObject.position.y = 0.5
    }
  }

  function onMouseUp(event: MouseEvent) {
    if (event.button !== 0) return
    if (draggedObject) {
      draggedObject.material.color.set(0xff6347)
      draggedObject.material.opacity = 1.0
      draggedObject.material.transparent = false
    }
    endDrag()
  }

  function onRightClickCancel(event: MouseEvent) {
    event.preventDefault()
    if (draggedObject) {
      scene.remove(draggedObject)
      draggedObject = null
    }
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('contextmenu', onRightClickCancel)
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  
  container.addEventListener('mousedown', onMouseDown)
  window.addEventListener('resize', onWindowResize)

  // --- ANIMÁCIÓ ---
  const animate = () => {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // --- TAKARÍTÁS ---
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