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
    this.instance = new PerspectiveCamera(75, this.sizes.width / this.sizes.height, 0.1, 1000)
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
    this.controls.update()
  }

  public destroy() {
    this.controls.dispose()
    this.transformControls.dispose()
  }
}
