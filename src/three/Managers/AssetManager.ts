import {
  Group,
  TextureLoader,
  Texture,
  SRGBColorSpace,
  RepeatWrapping,
  Vector3,
  Box3,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  Euler,
  DoubleSide,
} from 'three'
import { GLTFLoader } from 'three-stdlib'
import type {
  ComponentConfig,
  FurnitureConfig,
  ComponentSlotConfig,
  MaterialConfig,
} from '@/config/furniture'
import ConfigManager from './ConfigManager'
import DebugManager from './DebugManager'

let instance: AssetManager | null = null

export default class AssetManager {
  private textureLoader: TextureLoader
  private textureCache: Map<string, Texture> = new Map()
  private modelCache: Map<string, Group> = new Map()
  private loader = new GLTFLoader()
  private debugManager = DebugManager.getInstance()

  private constructor() {
    this.textureLoader = new TextureLoader()
  }

  public static getInstance(): AssetManager {
    if (!instance) {
      instance = new AssetManager()
    }
    return instance
  }

  public invalidateModelCache(url: string): void {
    if (this.modelCache.has(url)) {
      this.modelCache.delete(url)
      console.log(`%c[AssetManager] Cache érvénytelenítve: ${url}`, 'color: orange')
    }
  }

  public async buildFurnitureFromConfig(
    config: FurnitureConfig,
    componentState: Record<string, string>,
    propertyState: Record<string, Record<string, string | number | boolean>> = {},
  ): Promise<Group> {
    // console.log('%c[AssetManager] Bútor építése...', 'color: blue'); // Kikommenteltem a spammelés ellen

    const furnitureProxy = new Group()
    // Force new UUID for debugging if needed, but Three.js does it automatically.
    furnitureProxy.name = `proxy_${config.id}`

    const loadedComponents: Map<
      string,
      { model: Group; config: ComponentConfig | null; slot: ComponentSlotConfig }
    > = new Map()

    // 1. Modellek betöltése
    const loadPromises = config.componentSlots.map(async (slot) => {
      const componentId = componentState[slot.slotId]

      // HA NINCS KOMPONENS (pl. "Nincs" opció vagy üres template):
      if (!componentId) {
        // Létrehozunk egy üres csoportot, hogy a hierarchia megmaradjon
        const emptyGroup = new Group()
        emptyGroup.name = slot.slotId
        // Fontos: config null, mert nincs valódi komponens
        loadedComponents.set(slot.slotId, { model: emptyGroup, config: null, slot: slot })
        return
      }

      const componentConfig = ConfigManager.getComponentById(componentId)
      if (!componentConfig) {
        this.debugManager.logConfigNotFound('Komponens', componentId)
        // Itt is üres csoportot adunk vissza hiba esetén
        const emptyGroup = new Group()
        emptyGroup.name = slot.slotId
        loadedComponents.set(slot.slotId, { model: emptyGroup, config: null, slot: slot })
        return
      }

      const modelUrl = componentConfig.model
      const componentModel = await this.loadModel(modelUrl)
      componentModel.name = slot.slotId

      // Slot ID mentése a userData-ba (későbbi kereséshez, pl. front visibility)
      componentModel.userData.slotId = slot.slotId

      // --- MULTI-MATERIAL LOGIKA ---

      // 1. Eset: Új rendszer (Több slot)
      if (componentConfig.materialSlots && componentConfig.materialSlots.length > 0) {
        componentModel.traverse((child) => {
          if (child instanceof Mesh) {
            const matName = Array.isArray(child.material)
              ? child.material[0].name
              : child.material.name

            // Végignézzük az összes definiált slotot
            for (const matSlot of componentConfig.materialSlots!) {
              // Ha a mesh anyagának neve tartalmazza a slot targetjét (pl. "Glass")
              if (matName.toLowerCase().includes(matSlot.target.toLowerCase())) {
                child.userData.isMaterialTarget = true
                child.userData.materialSlotKey = matSlot.key // pl. "glass"
                child.userData.originalMaterialName = matName

                // Fontos: Ha üveg slot, mentsük el, hogy később tudjuk
                if (matSlot.key === 'glass' || matSlot.target.toLowerCase().includes('glass')) {
                  child.userData.isGlass = true
                }
                break // Megtaláltuk, nem kell tovább keresni ehhez a mesh-hez
              }
            }
          }
        })
      }
      // 2. Eset: Régi rendszer (Egyetlen target)
      else if (componentConfig.materialTarget) {
        componentModel.traverse((child) => {
          if (child instanceof Mesh) {
            const matName = Array.isArray(child.material)
              ? child.material[0].name
              : child.material.name

            if (matName.toLowerCase().includes(componentConfig.materialTarget!.toLowerCase())) {
              child.userData.isMaterialTarget = true
              // Ha nincs slot definíció, akkor ez a "default" vagy "base" slot
              child.userData.materialSlotKey = 'base'
              child.userData.originalMaterialName = matName
            }
          }
        })
      }

      loadedComponents.set(slot.slotId, {
        model: componentModel,
        config: componentConfig,
        slot: slot,
      })
    })

    await Promise.all(loadPromises)

    // 2. Hierarchia építése
    const assembledObjects: Map<string, Group> = new Map()
    const slots = Array.from(loadedComponents.values())
    const slotMap = new Map(slots.map((s) => [s.slot.slotId, s.slot]))
    const depthCache = new Map<string, number>()

    function getDepth(slotId: string): number {
      if (depthCache.has(slotId)) return depthCache.get(slotId)!
      const slot = slotMap.get(slotId)
      if (!slot?.attachToSlot) {
        depthCache.set(slotId, 0)
        return 0
      }
      const depth = 1 + getDepth(slot.attachToSlot)
      depthCache.set(slotId, depth)
      return depth
    }

    slots.sort((a, b) => getDepth(a.slot.slotId) - getDepth(b.slot.slotId))

    for (const data of slots) {
      const { model, slot } = data
      const parentSlotId = slot.attachToSlot

      if (!parentSlotId) {
        furnitureProxy.add(model)
        assembledObjects.set(slot.slotId, model)
        continue
      }

      const parentModel = assembledObjects.get(parentSlotId)

      if (!parentModel) {
        // Ha a szülő nincs a fában (mert pl. opcionális és ki van kapcsolva),
        // akkor a gyereket sem tudjuk hova tenni.
        // console.warn(`[AssetManager] Kihagyás: ${slot.slotId} szülője (${parentSlotId}) hiányzik.`);
        continue
      }

      // Csatolási logika
      const applyAttachment = (modelInstance: Group, attachmentPointName: string) => {
        const attachmentDummy = parentModel.getObjectByName(attachmentPointName)
        if (!attachmentDummy) {
          // Ha nincs dummy pont, de a szülő létezik, akkor a 0,0,0-ra tesszük (vagy logolunk)
          // console.warn(`[AssetManager] Csatlakozási pont (${attachmentPointName}) nem található a szülőn (${parentModel.name}).`);
          return
        }

        modelInstance.position.copy(attachmentDummy.position)
        modelInstance.quaternion.copy(attachmentDummy.quaternion)

        if (slot.rotation) {
          const slotEuler = new Euler(slot.rotation.x, slot.rotation.y, slot.rotation.z)
          const slotQuaternion = new Quaternion().setFromEuler(slotEuler)
          modelInstance.quaternion.multiply(slotQuaternion)
        }

        parentModel.add(modelInstance)
      }

      const componentId = componentState[slot.slotId]
      const attachmentPointsFromMapping = componentId
        ? slot.attachmentMapping?.[componentId]
        : undefined

      if (attachmentPointsFromMapping && Array.isArray(attachmentPointsFromMapping)) {
        attachmentPointsFromMapping.forEach((pointName, index) => {
          const instance = index === 0 ? model : model.clone(true)
          applyAttachment(instance, pointName)
        })
      } else if (slot.useAttachmentPoint) {
        applyAttachment(model, slot.useAttachmentPoint)
      } else {
        // --- JAVÍTÁS: KÉZI POZICIONÁLÁS (FALLBACK) ---

        // Csak akkor állítunk pozíciót, ha a slot configban benne van!
        // A régi elemeknél ez undefined, így azok maradnak 0,0,0-án, ahogy eddig.
        if (slot.position) {
          model.position.set(slot.position.x / 1000, slot.position.y / 1000, slot.position.z / 1000)
        }

        if (slot.rotation) {
          model.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z)
        }

        // Skálázásnál figyelni kell, mert a default az 1,1,1, nem a 0,0,0
        if (slot.scale) {
          model.scale.set(slot.scale.x, slot.scale.y, slot.scale.z)
        }

        parentModel.add(model)
      }

      assembledObjects.set(slot.slotId, model)
    }

    // 3. Pozícionálás (Pivot korrekció)
    const box = new Box3().setFromObject(furnitureProxy)
    const center = new Vector3()
    box.getCenter(center)

    furnitureProxy.userData = {
      config: config,
      componentState: JSON.parse(JSON.stringify(componentState)),
      propertyState: JSON.parse(JSON.stringify(propertyState)),
      materialState: {},
    }
    return furnitureProxy
  }

  private async loadModel(url: string): Promise<Group> {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone(true)
    }

    try {
      const gltf = await this.loader.loadAsync(url)
      const modelContent = new Group()

      for (const child of [...gltf.scene.children]) {
        modelContent.add(child)
      }

      modelContent.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child.material instanceof MeshStandardMaterial) {
            child.material = child.material.clone()
          }
        }
      })

      this.modelCache.set(url, modelContent)
      return modelContent.clone(true)
    } catch (error) {
      this.debugManager.logModelLoadError(url, error)
      // Hiba esetén üres csoportot adunk vissza, hogy ne omoljon össze
      return new Group()
    }
  }

  public async getTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      if (this.textureCache.has(url)) {
        resolve(this.textureCache.get(url)!)
        return
      }
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = SRGBColorSpace
          texture.wrapS = RepeatWrapping
          texture.wrapT = RepeatWrapping
          this.textureCache.set(url, texture)
          resolve(texture)
        },
        undefined,
        (error) => {
          console.error(`Hiba a(z) ${url} textúra betöltése közben:`, error)
          reject(error)
        },
      )
    })
  }

  public async createMaterial(config: MaterialConfig): Promise<MeshPhysicalMaterial> {
    // Ha van transmission (üveg), akkor a metalness-nek 0-nak kell lennie a szép eredményhez,
    // és a transparent-nek true-nak.
    const isGlass = (config.properties?.transmission ?? 0) > 0

    const material = new MeshPhysicalMaterial({
      name: config.name,
      roughness: config.properties?.roughness ?? 0.5,
      // Ha üveg, akkor a metalness legyen 0, különben fekete lesz!
      metalness: isGlass ? 0 : (config.properties?.metalness ?? 0),

      transmission: config.properties?.transmission ?? 0,
      opacity: config.properties?.opacity ?? 1,
      // Ha üveg, mindenképp kell a transparent flag
      transparent: isGlass ? true : (config.properties?.transparent ?? false),

      side: DoubleSide,
      // Opcionális: depthWrite false néha segít az üveg renderelési hibákon, de MeshPhysicalMaterialnál általában true is jó
      depthWrite: true,
    })

    if (config.type === 'color') {
      material.color.set(config.value)
    } else if (config.type === 'texture') {
      try {
        const texture = await this.getTexture(config.value)
        material.map = texture
        material.needsUpdate = true
      } catch (error) {
        console.error(`Nem sikerült betölteni a textúrát: ${config.value}`, error)
        material.color.set('#ff0000')
      }
    }

    return material
  }
}
