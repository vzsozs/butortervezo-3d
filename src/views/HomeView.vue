<template>
  <div ref="sceneContainer"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// ÚJ: Behozzuk a GLTF betöltőt
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// --- VÁLTOZÓK DEFINIÁLÁSA A KOMPONENS SZINTJÉN ---
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let raycaster: THREE.Raycaster
const mouse = new THREE.Vector2()
const intersectableObjects: THREE.Object3D[] = []
// JAVÍTÁS: A draggedObject most már egy Group lehet, mert a GLTF modellek általában több mesht tartalmaznak
let draggedObject: THREE.Group | null = null
// ÚJ: Egy változó, ami a betöltött modell "sablonját" tárolja
let loadedModelTemplate: THREE.Group | null = null

// ÚJ: Létrehozunk egy új, cserélhető anyagot
const highlightMaterial = new THREE.MeshStandardMaterial({ 
  color: 0xfcba03, // Egy feltűnő narancssárga szín
  name: 'HighlightMaterial' // Adunk neki egy nevet a könnyebb azonosításért
});

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

  // --- ÚJ: A MODELL BETÖLTÉSE ---
  const loader = new GLTFLoader()
  loader.load(
    '/models/szekreny_alap.glb', // Az útvonal a 'public' mappából indul
    (gltf) => {
      // Sikeres betöltés után ez a függvény fut le
      console.log('Modell sikeresen betöltve!', gltf)
      const model = gltf.scene;

      // Végigmegyünk a modell minden részén
      model.traverse((child) => {
        // A child.name a 3D szoftverben megadott objektumnév
        console.log('Talált objektum:', child.name, child);

        if (child instanceof THREE.Mesh) {
          // Minden mesh-re bekapcsoljuk az árnyékokat
          child.castShadow = true;
          child.receiveShadow = true; // A bútor részei egymásra is vethetnek árnyékot

          // KERESÉS ÉS CSERE:
          // Ha az objektum neve tartalmazza az "Ajto" szót (kis- és nagybetű nem számít)
          // FONTOS: Cseréld le az "Ajto" szót arra, amit a 3D szoftveredben használtál!
          if (child.name.toLowerCase().includes('ajto')) {
            console.log(`MEGTALÁLTAM AZ AJTÓT: ${child.name}. Anyag cseréje...`);
            // Lecseréljük az ajto anyagát a mi kiemelő anyagunkra
            child.material = highlightMaterial;
          }
        }
      });

      loadedModelTemplate = model; // Elmentjük az előkészített modell sablonját
    },
    undefined,
    (error) => {
      console.error('Hiba történt a modell betöltése közben:', error)
    }
  )

  // ... a többi beállítás (színek, jelenet, stb.) változatlan ...
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
 function createDraggableObject(point: THREE.Vector3): THREE.Group | null {
    if (!loadedModelTemplate) {
      console.warn("A modell még nem töltődött be, próbálja újra.")
      return null
    }
    const newObject = loadedModelTemplate.clone()

    // JAVÍTÁS: Végigmegyünk a klónozott modellen, és áttetszővé tesszük
    newObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Fontos: klónozzuk az anyagot, hogy ne az eredeti sablon anyagát módosítsuk!
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.3;
      }
    });

    newObject.position.copy(point)
    newObject.position.y = 0
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
    if (event.button !== 0) return
    if (event.shiftKey) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
      raycaster!.setFromCamera(mouse, camera!)
      const intersects = raycaster!.intersectObjects(intersectableObjects)

      if (intersects.length > 0) {
        // JAVÍTÁS: A createDraggableObject most már null-t is visszaadhat
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
      // A magasságot fixen tartjuk, hogy ne süllyedjen a padlóba
      draggedObject.position.y = 0
    }
  }

  function onMouseUp(event: MouseEvent) {
    if (event.button !== 0) return

    if (draggedObject) {
      // JAVÍTÁS: Végigmegyünk a lehelyezett objektumon, és visszaállítjuk az átlátszóságát
      draggedObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      });
    }
    endDrag()
  }

  function onRightClickCancel(event: MouseEvent) {
    event.preventDefault()
    if (draggedObject) {
      scene.remove(draggedObject)
    }
    endDrag() // A cancel most már az endDrag-et hívja, ami mindent rendberak
  }

  // ... a többi eseménykezelő és az animate loop változatlan ...
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