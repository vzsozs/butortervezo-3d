// src/three/Camera.ts
import { Scene, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three-stdlib'
import { TransformControls } from 'three-stdlib'
import Experience from './Experience'
import Sizes from './Utils/Sizes'

export default class Camera {
  private experience: Experience
  private sizes: Sizes
  private scene: Scene
  private canvas: HTMLDivElement

  public instance!: PerspectiveCamera
  public controls!: OrbitControls
  public transformControls!: TransformControls

  constructor() {
    this.experience = Experience.getInstance()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas

    this.setInstance()
    this.setOrbitControls()
    this.setTransformControls()
  }

  private setInstance() {
    this.instance = new PerspectiveCamera(60, this.sizes.width / this.sizes.height, 0.1, 50)
    this.instance.position.set(0, 2, 3)
    this.scene.add(this.instance)
  }

  private setOrbitControls() {
    this.controls = new OrbitControls(this.instance, this.canvas)
    this.controls.enableDamping = true
  }

  private setTransformControls() {
    this.transformControls = new TransformControls(this.instance, this.canvas)
    this.scene.add(this.transformControls)
  }

  public onResize = () => {
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
  }

  public update() {
    // PADLÓ VÉDELEM
    // Dinamikusan számoljuk a maximális szöget, hogy a kamera pozíciója
    // sose menjen a padló (Y=0) alá.
    if (this.controls) {
      const minHeight = 0.1 // 10cm biztonsági tartalék
      const targetY = this.controls.target.y
      const radius = this.controls.getDistance()

      // Matematika: cameraY = targetY + radius * cos(phi)
      // Feltétel: cameraY >= minHeight
      // targetY + radius * cos(phi) >= minHeight
      // cos(phi) >= (minHeight - targetY) / radius
      // phi <= acos((minHeight - targetY) / radius)

      // Ha a sugár nagyon kicsi, akkor nem korlátozunk (elkerüljük a 0-val osztást)
      if (radius > 0.1) {
        const cosPhi = (minHeight - targetY) / radius
        // Clampeljük az értéket -1 és 1 közé a biztonság kedvéért
        const clampedCos = Math.max(-1, Math.min(1, cosPhi))
        this.controls.maxPolarAngle = Math.acos(clampedCos)
      }
    }

    this.controls.update()
  }

  public destroy() {
    this.controls.dispose()
    this.transformControls.dispose()
  }
}
