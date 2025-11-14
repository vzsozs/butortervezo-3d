// src/three/Renderer.ts
import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Experience from './Experience';
import Sizes from './Utils/Sizes';

export default class Renderer {
  private experience: Experience;
  private canvas: HTMLDivElement;
  private sizes: Sizes;
  private scene: Scene;
  private camera: PerspectiveCamera;

  public instance!: WebGLRenderer;
  public labelInstance!: CSS2DRenderer;

  constructor() {
    this.experience = Experience.getInstance();
    this.canvas = this.experience.canvas;
    this.sizes = this.experience.sizes;
    this.scene = this.experience.scene;
    this.camera = this.experience.camera.instance;

    this.setInstance();
    this.setLabelInstance();
  }

  private setInstance() {
    this.instance = new WebGLRenderer({ antialias: true });
    this.instance.setSize(this.sizes.width, this.sizes.height);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
    this.instance.shadowMap.enabled = true;
    this.canvas.appendChild(this.instance.domElement);
  }

  private setLabelInstance() {
    this.labelInstance = new CSS2DRenderer();
    this.labelInstance.setSize(this.sizes.width, this.sizes.height);
    this.labelInstance.domElement.style.position = 'absolute';
    this.labelInstance.domElement.style.top = '0px';
    this.labelInstance.domElement.style.pointerEvents = 'none';
    this.canvas.appendChild(this.labelInstance.domElement);
  }

  public onResize = () => {
    this.instance.setSize(this.sizes.width, this.sizes.height);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
    this.labelInstance.setSize(this.sizes.width, this.sizes.height);
  }

  public update() {
    this.instance.render(this.scene, this.camera);
    this.labelInstance.render(this.scene, this.camera);
  }

  public destroy() {
    this.instance.dispose();
    if (this.labelInstance.domElement.parentNode === this.canvas) {
      this.canvas.removeChild(this.labelInstance.domElement);
    }
  }
}