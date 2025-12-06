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
} from 'three'

export default class World {
  constructor(private scene: Scene) {
    this.setupEnvironment()
  }

  private setupEnvironment() {
    // 1. Háttér
    const backgroundColor = new Color('#303030')
    this.scene.background = backgroundColor

    // 2. Padló
    const floorMaterial = new MeshStandardMaterial({
      color: '#2e2e2e',
      roughness: 0.8,
      metalness: 0.1,
      side: DoubleSide,
    })

    const floor = new Mesh(new PlaneGeometry(40, 40), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.position.y = -0.002
    this.scene.add(floor)

    // 3. DUPLA RÁCS RENDSZER

    // A) ALRÁCS (20 cm)
    // Méret: 20m, Osztás: 100 -> 20/100 = 0.2m = 20cm
    // Szín: Nagyon halvány, épphogy elüssön a padlótól (#3a3a3a)
    const subGrid = new GridHelper(20, 100, 0x000000, 0x333333)
    subGrid.position.y = 0
    this.scene.add(subGrid)

    // B) FŐ RÁCS (1 m)
    // Méret: 20m, Osztás: 20 -> 20/20 = 1m
    // Szín: Világosabb, hogy vezesse a szemet
    const mainGrid = new GridHelper(20, 20, 0x666666, 0x444444)
    mainGrid.position.y = 0.001 // Picit feljebb, hogy ne vibráljon az alráccsal (Z-fighting)
    this.scene.add(mainGrid)

    // 4. FÉNYEK (Optimalizálva a mélységérzethez SSAO nélkül)

    // HemisphereLight: Ez adja a "töltőfényt".
    // TRÜKK: Levettem az intenzitást 2.0-ról 0.6-ra!
    // Így a bútorok árnyékos oldala sötétebb marad, ami 3D-s hatást kelt.
    const hemiLight = new HemisphereLight(0xffffff, 0x000000, 1.6)
    hemiLight.position.set(0, 20, 0)
    this.scene.add(hemiLight)

    // DirectionalLight: Ez adja a "napfényt" és az éles árnyékokat.
    // Kicsit emeltem az erején (1.0 -> 1.5), hogy kontrasztosabb legyen.
    const dirLight = new DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 10, 7)
    dirLight.castShadow = true

    // Árnyék minőség beállítások
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.bias = -0.0001
    dirLight.shadow.normalBias = 0.002

    dirLight.shadow.camera.top = 5
    dirLight.shadow.camera.bottom = -5
    dirLight.shadow.camera.left = -5
    dirLight.shadow.camera.right = 5
    dirLight.shadow.camera.near = 0.1
    dirLight.shadow.camera.far = 40
    dirLight.shadow.radius = 2 // Kicsit élesebb árnyék (volt: 5)

    this.scene.add(dirLight)
  }
}
