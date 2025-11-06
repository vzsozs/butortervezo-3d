// src/three/World/World.ts

import { Scene, Color, Mesh, PlaneGeometry, MeshStandardMaterial, DoubleSide, GridHelper, AmbientLight, DirectionalLight } from 'three';

export default class World {
  constructor(private scene: Scene) {
    this.setupEnvironment();
  }

  private setupEnvironment() {
    const backgroundColor = new Color(0x252525);
    this.scene.background = backgroundColor;

    const floorColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.04);
    const floor = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshStandardMaterial({ color: floorColor, side: DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // A padlót hozzá kell adni az Experience intersectableObjects listájához!

    const gridMainColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.05);
    const gridCenterColor = new Color().copy(backgroundColor).offsetHSL(0, 0, 0.09);
    const gridHelper = new GridHelper(20, 20, gridCenterColor, gridMainColor);
    this.scene.add(gridHelper);

    const ambientLight = new AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }
}