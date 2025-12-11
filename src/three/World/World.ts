import {
  Scene,
  Color,
  Mesh,
  PlaneGeometry,
  MeshStandardMaterial,
  DoubleSide,
  GridHelper,
  DirectionalLight,
  HemisphereLight,
  EquirectangularReflectionMapping, // <--- FONTOS: Ez kell a térképhez
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

export default class World {
  constructor(private scene: Scene) {
    this.setupEnvironment()
  }

  private setupEnvironment() {
    // 1. Háttér (Marad a szürke szín, nem akarjuk látni magát a HDRI képet a háttérben)
    const backgroundColor = new Color('#313131')
    this.scene.background = backgroundColor

    // --- HDRI BETÖLTÉS ---
    const hdrLoader = new HDRLoader()

    // Aszinkron betöltés
    hdrLoader.load('/textures/environment.hdr', (texture) => {
      // Megmondjuk a Three.js-nek, hogy ez egy gömbpanoráma
      texture.mapping = EquirectangularReflectionMapping

      // Beállítjuk környezetnek
      this.scene.environment = texture

      // Finomhangolás:
      // Mivel a HDRI-k nagyon eltérő fényerejűek lehetnek,
      // itt tudod szabályozni az erejét.
      // Kezdj 0.5-tel, ha sötét, emeld feljebb (akár 1.0-ig vagy fölé).
      this.scene.environmentIntensity = 0.5
    })
    // ---------------------

    // 2. Padló
    const floorMaterial = new MeshStandardMaterial({
      color: '#131313',
      roughness: 0.8,
      metalness: 0.1,
      side: DoubleSide,
    })

    const floor = new Mesh(new PlaneGeometry(40, 40), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = false
    floor.position.y = -0.002
    this.scene.add(floor)

    // 3. RÁCSOK
    const subGrid = new GridHelper(20, 100, 0x000000, 0x333333)
    subGrid.position.y = 0
    this.scene.add(subGrid)

    const mainGrid = new GridHelper(20, 20, 0x666666, 0x444444)
    mainGrid.position.y = 0.001
    this.scene.add(mainGrid)

    // 4. FÉNYEK
    // A HDRI mellé is kellenek a fények az árnyékok miatt,
    // de lehet, hogy finomítani kell rajtuk a HDRI fényerejétől függően.

    const hemiLight = new HemisphereLight(0xffffff, 0x000000, 0.5)
    hemiLight.position.set(0, 20, 0)
    this.scene.add(hemiLight)

    const dirLight = new DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 10, 7)
    dirLight.castShadow = true

    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.bias = -0.00001
    dirLight.shadow.normalBias = 0.00001
    dirLight.shadow.radius = 2
    dirLight.shadow.intensity = 1

    this.scene.add(dirLight)
  }
}
