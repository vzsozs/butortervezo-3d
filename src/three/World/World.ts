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
    const backgroundColor = new Color('#323232')
    this.scene.background = backgroundColor

    // 2. Padló
    const floorMaterial = new MeshStandardMaterial({
      color: '#343434',
      roughness: 0.8,
      metalness: 0.1,
      side: DoubleSide,
    })

    const floor = new Mesh(new PlaneGeometry(40, 40), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.position.y = -0.002
    this.scene.add(floor)

    // 3. KLASSZIKUS RÁCS (Visszarakva)
    // Trükk: Világosabb színeket használunk, hogy az FXAA ne mossa el őket teljesen.
    // CenterLine: 0x888888 (Világosszürke)
    // Grid: 0x555555 (Középszürke) - Ez sokkal jobban látszik a sötét padlón
    const gridHelper = new GridHelper(20, 20, 0x888888, 0x555555)
    gridHelper.position.y = 0
    this.scene.add(gridHelper)

    // 4. Fények
    const hemiLight = new HemisphereLight(0xffffff, 0x444444, 2.0)
    hemiLight.position.set(0, 20, 0)
    this.scene.add(hemiLight)

    const dirLight = new DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(5, 10, 7)
    dirLight.castShadow = true

    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.bias = -0.0001
    dirLight.shadow.normalBias = 0.02

    dirLight.shadow.camera.top = 5
    dirLight.shadow.camera.bottom = -5
    dirLight.shadow.camera.left = -5
    dirLight.shadow.camera.right = 5
    dirLight.shadow.camera.near = 0.1
    dirLight.shadow.camera.far = 40
    dirLight.shadow.radius = 5

    this.scene.add(dirLight)
  }
}
