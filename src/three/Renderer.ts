import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  DepthTexture,
  UnsignedShortType,
} from 'three'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
// import { BrightnessContrastShader } from 'three/examples/jsm/shaders/BrightnessContrastShader.js'

import Experience from './Experience'
import Sizes from './Utils/Sizes'

export default class Renderer {
  private experience: Experience
  private canvas: HTMLDivElement
  private sizes: Sizes
  private scene: Scene
  private camera: PerspectiveCamera

  public instance!: WebGLRenderer
  public labelInstance!: CSS2DRenderer
  public composer!: EffectComposer
  private fxaaPass!: ShaderPass

  constructor() {
    this.experience = Experience.getInstance()
    this.canvas = this.experience.canvas
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.camera = this.experience.camera.instance

    this.setInstance()
    this.setLabelInstance()
    this.setPostProcessing()
  }

  private setInstance() {
    this.instance = new WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: true,
    })

    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = PCFSoftShadowMap

    this.instance.toneMapping = ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.0

    this.canvas.appendChild(this.instance.domElement)
  }

  private setLabelInstance() {
    this.labelInstance = new CSS2DRenderer()
    this.labelInstance.setSize(this.sizes.width, this.sizes.height)
    this.labelInstance.domElement.style.position = 'absolute'
    this.labelInstance.domElement.style.top = '0px'
    this.labelInstance.domElement.style.pointerEvents = 'none'
    this.canvas.appendChild(this.labelInstance.domElement)
  }

  private setPostProcessing() {
    this.composer = new EffectComposer(this.instance)
    this.composer.setSize(this.sizes.width, this.sizes.height)
    this.composer.setPixelRatio(this.sizes.pixelRatio)

    // --- DEPTH TEXTURE (Maradhat, nem zavar) ---
    const depthTexture = new DepthTexture(this.sizes.width, this.sizes.height)
    depthTexture.type = UnsignedShortType
    this.composer.renderTarget1.depthTexture = depthTexture
    this.composer.renderTarget2.depthTexture = depthTexture

    // 1. Render Pass
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    // --- KONTRAST --- ❌ KIKAPCSOLVA
    /*
    const contrastPass = new ShaderPass(BrightnessContrastShader)

    // contrast: 0 az alap.
    // 0.1 - 0.3 között érdemes próbálkozni.
    // Ha negatív, akkor szürkébb lesz.

    contrastPass.uniforms['contrast']!.value = 0.1

    // brightness: Ha kell, itt a fényerőt is finomhangolhatod (0 az alap)

    contrastPass.uniforms['brightness']!.value = 0.03

    this.composer.addPass(contrastPass)
    */

    // 2. SSAO Pass - ❌ KIKAPCSOLVA

    const ssaoPass = new SSAOPass(this.scene, this.camera, this.sizes.width, this.sizes.height)
    ssaoPass.kernelRadius = 0.1
    ssaoPass.minDistance = 0.001
    ssaoPass.maxDistance = 0.04
    ssaoPass.output = SSAOPass.OUTPUT.Default
    this.composer.addPass(ssaoPass)

    // 3. Output Pass
    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)

    // 4. FXAA Pass (Élsimítás maradjon!)
    this.fxaaPass = new ShaderPass(FXAAShader)
    const pixelRatio = this.instance.getPixelRatio()
    if (this.fxaaPass.material.uniforms['resolution']) {
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (this.sizes.width * pixelRatio)
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (this.sizes.height * pixelRatio)
    }

    this.composer.addPass(this.fxaaPass)
  }

  public onResize = () => {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    this.composer.setSize(this.sizes.width, this.sizes.height)
    this.composer.setPixelRatio(this.sizes.pixelRatio)

    const pixelRatio = this.instance.getPixelRatio()
    if (this.fxaaPass && this.fxaaPass.material.uniforms['resolution']) {
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (this.sizes.width * pixelRatio)
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (this.sizes.height * pixelRatio)
    }

    this.labelInstance.setSize(this.sizes.width, this.sizes.height)
  }

  public update() {
    this.composer.render()
    this.labelInstance.render(this.scene, this.camera)
  }

  public destroy() {
    this.instance.dispose()
    this.composer.dispose()
    if (this.labelInstance.domElement.parentNode === this.canvas) {
      this.canvas.removeChild(this.labelInstance.domElement)
    }
    if (this.instance.domElement.parentNode === this.canvas) {
      this.canvas.removeChild(this.instance.domElement)
    }
  }
}
