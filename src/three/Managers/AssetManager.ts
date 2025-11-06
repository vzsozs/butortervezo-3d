// src/three/Managers/AssetManager.ts

import { Mesh, MeshStandardMaterial, Group, TextureLoader, Texture, SRGBColorSpace, RepeatWrapping } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { furnitureDatabase } from '@/config/furniture';
import Experience from '../Experience';

export default class AssetManager {
  private textureLoader: TextureLoader;
  private textureCache: Map<string, Texture> = new Map();
  private modelCache: Map<string, Group> = new Map();
  private materials: { [key: string]: MeshStandardMaterial } = {};

  constructor(private experience: Experience) {
    this.textureLoader = new TextureLoader();
    this.createAppMaterials();
    this.loadModels();
  }

  private createAppMaterials() {
    this.materials['MAT_Frontok'] = new MeshStandardMaterial({ name: 'MAT_Frontok', color: 0xffffff });
    this.materials['MAT_Korpusz'] = new MeshStandardMaterial({ name: 'MAT_Korpusz', color: 0x808080 });
    this.materials['MAT_Munkapult'] = new MeshStandardMaterial({ name: 'MAT_Munkapult', color: 0x404040 });
    this.materials['MAT_Fem_Kiegeszitok'] = new MeshStandardMaterial({ name: 'MAT_Fem_Kiegeszitok', color: 0xc0c0c0, metalness: 1.0, roughness: 0.2 });
  }

  private loadModels() {
    const loader = new GLTFLoader();
    for (const category of furnitureDatabase) {
      for (const furniture of category.items) {
        if (!furniture || this.modelCache.has(furniture.modelUrl)) continue;

        loader.load(furniture.modelUrl, (gltf) => {
          const model = gltf.scene;
          model.traverse((child) => {
            if (child instanceof Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.name.toLowerCase().includes('ajto') || child.name.toLowerCase().includes('fiokos')) {
                child.material = this.materials['MAT_Frontok']!.clone();
              } else if (child.name.toLowerCase().includes('korpusz')) {
                child.material = this.materials['MAT_Korpusz']!.clone();
              } else if (child.name.toLowerCase().includes('munkapult')) {
                child.material = this.materials['MAT_Munkapult']!.clone();
              } else if (child.name.toLowerCase().includes('fogantyu') || child.name.toLowerCase().includes('labazat_cso')) {
                child.material = this.materials['MAT_Fem_Kiegeszitok']!.clone();
              } else if (child.name.toLowerCase().includes('labazat_standard')) {
                child.material = this.materials['MAT_Korpusz']!.clone();
              } else {
                child.material = new MeshStandardMaterial({ color: 0xff00ff });
              }
            }
          });
          
          for (const slot of furniture.componentSlots) {
            if (slot.type.includes('style') && slot.styleOptions && slot.styleOptions.length > 0) {
              slot.styleOptions.forEach((styleOption, index) => {
                model.traverse((child) => {
                  if (child instanceof Mesh && child.name.toLowerCase().includes(styleOption.targetMesh.toLowerCase())) {
                    child.visible = (index === 0);
                  }
                });
              });
            }
          }

          this.modelCache.set(furniture.modelUrl, model);
        });
      }
    }
  }

  public getModel(modelUrl: string): Group | null {
    const modelTemplate = this.modelCache.get(modelUrl);
    if (!modelTemplate) {
      console.error(`A(z) '${modelUrl}' modell nincs a cache-ben!`);
      return null;
    }
    return modelTemplate.clone();
  }

  public getTexture(url: string, callback: (texture: Texture) => void) {
    if (this.textureCache.has(url)) {
      callback(this.textureCache.get(url)!);
    } else {
      this.textureLoader.load(url, (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        this.textureCache.set(url, texture);
        callback(texture);
      });
    }
  }
}