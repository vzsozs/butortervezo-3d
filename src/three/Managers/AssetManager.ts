import {
  Group,
  TextureLoader,
  Texture,
  SRGBColorSpace,
  RepeatWrapping,
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
    const furnitureProxy = new Group()
    furnitureProxy.name = `proxy_${config.id}`

    const loadedComponents: Map<
      string,
      { model: Group; config: ComponentConfig | null; slot: ComponentSlotConfig }
    > = new Map()

    // 1. Modellek betöltése
    const loadPromises = config.componentSlots.map(async (slot) => {
      const componentId = componentState[slot.slotId]

      // HA NINCS KOMPONENS
      if (!componentId) {
        const emptyGroup = new Group()
        emptyGroup.name = slot.slotId
        loadedComponents.set(slot.slotId, { model: emptyGroup, config: null, slot: slot })
        return
      }

      const componentConfig = ConfigManager.getComponentById(componentId)
      if (!componentConfig) {
        this.debugManager.logConfigNotFound('Komponens', componentId)
        const emptyGroup = new Group()
        emptyGroup.name = slot.slotId
        loadedComponents.set(slot.slotId, { model: emptyGroup, config: null, slot: slot })
        return
      }

      const modelUrl = componentConfig.model
      const componentModel = await this.loadModel(modelUrl)
      componentModel.name = slot.slotId

      // Slot ID mentése
      componentModel.userData.slotId = slot.slotId
      // Config mentése a gyerekre is (biztonsági tartalék)
      componentModel.userData.config = componentConfig

      // --- MULTI-MATERIAL LOGIKA ---
      if (componentConfig.materialSlots && componentConfig.materialSlots.length > 0) {
        componentModel.traverse((child) => {
          if (child instanceof Mesh) {
            const matName = Array.isArray(child.material)
              ? child.material[0].name
              : child.material.name

            for (const matSlot of componentConfig.materialSlots!) {
              if (matName.toLowerCase().includes(matSlot.target.toLowerCase())) {
                child.userData.isMaterialTarget = true
                child.userData.materialSlotKey = matSlot.key
                child.userData.originalMaterialName = matName
                if (matSlot.key === 'glass' || matSlot.target.toLowerCase().includes('glass')) {
                  child.userData.isGlass = true
                }
                break
              }
            }
          }
        })
      } else if (componentConfig.materialTarget) {
        componentModel.traverse((child) => {
          if (child instanceof Mesh) {
            const matName = Array.isArray(child.material)
              ? child.material[0].name
              : child.material.name

            if (matName.toLowerCase().includes(componentConfig.materialTarget!.toLowerCase())) {
              child.userData.isMaterialTarget = true
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
        continue
      }

      const applyAttachment = (modelInstance: Group, attachmentPointName: string) => {
        const attachmentDummy = parentModel.getObjectByName(attachmentPointName)
        if (!attachmentDummy) {
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
        if (slot.position) {
          model.position.set(slot.position.x / 1000, slot.position.y / 1000, slot.position.z / 1000)
        }
        if (slot.rotation) {
          model.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z)
        }
        if (slot.scale) {
          model.scale.set(slot.scale.x, slot.scale.y, slot.scale.z)
        }
        parentModel.add(model)
      }

      assembledObjects.set(slot.slotId, model)
    }

    // 3. Pozícionálás (Pivot korrekció)
    const box = new Box3().setFromObject(furnitureProxy)
    // A center nem kell, ha a sarokra igazítunk, de a biztonság kedvéért benne hagyhatjuk a változót, vagy töröljük.
    // Inkább igazítsuk a Minimum pontra (Bal-Hátul-Alul), mert a PlacementManager sarokszekrény logikája ezt feltételezi.

    // Pivot beállítása: Bal-Hátul-Alul (0,0,0) legyen a sarok
    for (const child of furnitureProxy.children) {
      child.position.x -= box.min.x
      child.position.z -= box.min.z
      child.position.y -= box.min.y
    }

    // --- ÚJ LOGIKA: Adatok felbuborékoltatása (BIZTONSÁGOS VERZIÓ) ---
    // Nem használunk JSON deep clone-t a configra, mert az tönkreteheti a Vue Proxy-t!
    try {
      // 1. Sekély másolatot készítünk az eredeti configról
      const enrichedConfig = { ...config } as any

      let structuralComponentConfig: any = null

      // Megkeressük a strukturális komponenst (pl. sarok korpusz)
      for (const data of loadedComponents.values()) {
        if (data.config) {
          const conf = data.config as any
          if (conf.structureType === 'corner_L') {
            structuralComponentConfig = data.config
            break
          }
          if (!structuralComponentConfig && data.config.componentType === 'corpuses') {
            structuralComponentConfig = data.config
          }
        }
      }

      // Ha találtunk ilyet, óvatosan átmásoljuk az adatokat
      if (structuralComponentConfig) {
        const structConf = structuralComponentConfig as any

        // Típus átvétele
        if (structConf.structureType) {
          enrichedConfig.structureType = structConf.structureType
        }

        // Properties összefésülése
        // Itt is figyelünk, hogy ne írjuk felül az eredeti objektumot, hanem újat hozzunk létre
        if (structuralComponentConfig.properties) {
          enrichedConfig.properties = {
            ...(enrichedConfig.properties || {}), // Eredeti tulajdonságok
            ...structuralComponentConfig.properties, // Új tulajdonságok (pl. sideDepth)
          }
        }
      }

      console.log('[AssetManager] DEBUG: Bubbling complete.')
      console.log('  -> Original Config:', config)
      console.log('  -> Enriched Config:', enrichedConfig)

      furnitureProxy.userData = {
        config: enrichedConfig, // Most már a biztonságos, bővített configot használjuk
        componentState: JSON.parse(JSON.stringify(componentState)),
        propertyState: JSON.parse(JSON.stringify(propertyState)),
        materialState: {},
      }
      console.log('  -> Proxy UserData set:', furnitureProxy.userData)
    } catch (e) {
      console.error('[AssetManager] Error bubbling config, falling back to original:', e)
      // Fallback a biztonságos, eredeti működésre
      furnitureProxy.userData = {
        config: config,
        componentState: JSON.parse(JSON.stringify(componentState)),
        propertyState: JSON.parse(JSON.stringify(propertyState)),
        materialState: {},
      }
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
