<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const sceneContainer = ref<HTMLDivElement | null>(null)

onMounted(() => {
  const container = sceneContainer.value
  if (!container) {
    console.error("A 3D jelenet konténere nem található a DOM-ban.")
    return
  }

  // --- VÁLTOZÓK INICIALIZÁLÁSA ---
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  
  const intersectableObjects: THREE.Object3D[] = []

  // --- SZÍN DEFINÍCIÓK (A TE ÚJ SZÍNEIDDEL) ---
  const backgroundColor = new THREE.Color(0x252525)
  const floorColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.04)
  const gridMainColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.05)
  const gridCenterColor = new THREE.Color().copy(backgroundColor).offsetHSL(0, 0, 0.09)

  // --- JELENET BEÁLLÍTÁSA ---
  scene.background = backgroundColor
  camera.position.set(4, 5, 7)
  camera.lookAt(0, 0, 0)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  // --- OBJEKTUMOK ---
  const floorGeometry = new THREE.PlaneGeometry(20, 20)
  const floorMaterial = new THREE.MeshStandardMaterial({ color: floorColor, side: THREE.DoubleSide })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
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
  function addObjectAtPoint(point: THREE.Vector3) {
    const material = new THREE.MeshStandardMaterial({ color: 0xff6347 })
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const newObject = new THREE.Mesh(geometry, material)
    
    newObject.position.copy(point)
    newObject.position.y = 0.5
    
    newObject.castShadow = true
    scene.add(newObject)
  }

  // --- ESEMÉNYKEZELŐK ---
  function onDoubleClick(event: MouseEvent) {
    if (!raycaster || !camera) return

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObjects(intersectableObjects)

    if (intersects.length > 0) {
      addObjectAtPoint(intersects[0].point)
    }
  }

  // ÚJ: Ablak átméretezését kezelő függvény
  function onWindowResize() {
    // 1. Kamera képarányának frissítése
    camera.aspect = window.innerWidth / window.innerHeight
    // 2. Kamera vetítési mátrixának frissítése (EZ KRITIKUS!)
    camera.updateProjectionMatrix()
    // 3. Renderelő méretének frissítése
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  
  window.addEventListener('dblclick', onDoubleClick)
  // ÚJ: Eseményfigyelő az átméretezésre
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
    window.removeEventListener('dblclick', onDoubleClick)
    // ÚJ: Átméretezés figyelőjének eltávolítása is
    window.removeEventListener('resize', onWindowResize)
  })
})
</script>
<!-- EZ A BLOKK HIÁNYZOTT VAGY SÉRÜLT VOLT -->
<template>
  <div ref="sceneContainer"></div>
</template>

<!-- EZ A BLOKK IS FONTOS LEHET -->
<style scoped>
div {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>