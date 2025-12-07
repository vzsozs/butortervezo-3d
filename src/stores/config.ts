// src/stores/config.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  FurnitureConfig,
  ComponentConfig,
  GlobalGroupConfig,
  ComponentDatabase,
  MaterialConfig,
  FurnitureStyle, // <--- ÚJ IMPORT
  GeneralSettings,
} from '@/config/furniture'

export const useConfigStore = defineStore('config', () => {
  const furnitureList = ref<FurnitureConfig[]>([])
  const components = ref<ComponentDatabase>({})
  const globalGroups = ref<GlobalGroupConfig[]>([])
  const materials = ref<MaterialConfig[]>([])

  // --- ÚJ STATE: STÍLUSOK ---
  const styles = ref<FurnitureStyle[]>([])

  // --- ÚJ STATE: ÁLTALÁNOS BEÁLLÍTÁSOK ---
  const generalSettings = ref<GeneralSettings>({
    upperCabinet: { defaultElevation: 1.5 },
  })

  const furnitureCategories = computed(() => {
    const categories: Record<string, { name: string; items: FurnitureConfig[] }> = {
      bottom_cabinets: { name: 'Alsó szekrények', items: [] },
      top_cabinets: { name: 'Felső szekrények', items: [] },
    }
    for (const furniture of furnitureList.value) {
      const category = categories[furniture.category]
      if (category) {
        category.items.push(furniture)
      }
    }
    return Object.values(categories).filter((c) => c.items.length > 0)
  })

  // --- ÚJ ACTIONS: STÍLUS KEZELÉS (Style System) ---

  function addStyle(name: string) {
    const newStyle: FurnitureStyle = {
      id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: name,
    }
    styles.value.push(newStyle)
    // Itt hívhatsz mentést, ha van (pl. saveToLocalStorage)
  }

  function updateStyle(id: string, updates: Partial<FurnitureStyle>) {
    const style = styles.value.find((s) => s.id === id)
    if (style) {
      Object.assign(style, updates)
    }
  }

  function removeStyle(id: string) {
    // 1. Töröljük magát a stílust
    const index = styles.value.findIndex((s) => s.id === id)
    if (index !== -1) {
      styles.value.splice(index, 1)
    }

    // 2. "Árvátlanítás": Levesszük a stílust azokról a komponensekről, amik ehhez tartoztak
    Object.values(components.value).forEach((category) => {
      category.forEach((comp) => {
        if (comp.styleId === id) {
          comp.styleId = undefined
        }
      })
    })
  }

  // A LEGONTOSABB: Tömeges hozzárendelés
  function assignStyleToComponents(styleId: string | undefined, componentIds: string[]) {
    // Végigmegyünk az összes kategórián
    Object.values(components.value).forEach((category) => {
      category.forEach((comp) => {
        // Ha a komponens ID-ja benne van a kijelöltekben
        if (componentIds.includes(comp.id)) {
          comp.styleId = styleId // Beállítjuk az új stílust (vagy undefined-et leválasztáskor)
        }
      })
    })
    console.log(`[ConfigStore] Stílus (${styleId}) frissítve ${componentIds.length} elemen.`)
  }

  function getStyleById(id: string): FurnitureStyle | undefined {
    return styles.value.find((s) => s.id === id)
  }

  // --- Global Group Kezelés ---

  function addGlobalGroup(group: GlobalGroupConfig) {
    globalGroups.value.push(group)
  }

  function updateGlobalGroup(group: GlobalGroupConfig) {
    const index = globalGroups.value.findIndex((g) => g.id === group.id)
    if (index !== -1) {
      globalGroups.value[index] = group
    }
  }

  function deleteGlobalGroup(groupId: string) {
    const index = globalGroups.value.findIndex((g) => g.id === groupId)
    if (index !== -1) {
      globalGroups.value.splice(index, 1)
    }
  }

  // --- SORRENDEZÉS (NYILAK) ---
  function moveGroupUp(index: number) {
    if (index > 0 && globalGroups.value[index] && globalGroups.value[index - 1]) {
      const temp = globalGroups.value[index]!
      globalGroups.value[index] = globalGroups.value[index - 1]!
      globalGroups.value[index - 1] = temp
    }
  }

  function moveGroupDown(index: number) {
    if (
      index < globalGroups.value.length - 1 &&
      globalGroups.value[index] &&
      globalGroups.value[index + 1]
    ) {
      const temp = globalGroups.value[index]!
      globalGroups.value[index] = globalGroups.value[index + 1]!
      globalGroups.value[index + 1] = temp
    }
  }

  // --- Material Kezelés ---
  function addMaterial(material: MaterialConfig) {
    materials.value.push(material)
  }

  function updateMaterial(material: MaterialConfig) {
    const index = materials.value.findIndex((m) => m.id === material.id)
    if (index !== -1) {
      materials.value[index] = material
    }
  }

  function deleteMaterial(materialId: string) {
    const index = materials.value.findIndex((m) => m.id === materialId)
    if (index !== -1) {
      materials.value.splice(index, 1)
    }
  }

  // --- GENERAL SETTINGS ---
  async function saveGeneralSettings() {
    try {
      const response = await fetch('/api/save-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'general.json',
          data: generalSettings.value,
        }),
      })

      if (!response.ok) throw new Error(await response.text())
      console.log('General Settings sikeresen mentve!')
      // Opcionális: visszajelzés a felhasználónak (pl. toast), de itt most csak logolunk
    } catch (error) {
      console.error('Hiba a General Settings mentésekor:', error)
      alert('Hiba a mentés során!')
    }
  }

  // --- BETÖLTÉS ---
  async function loadAllData() {
    try {
      // Hozzáadtuk a styles.json-t is a betöltéshez
      const [furnitureRes, componentsRes, globalSettingsRes, materialsRes, stylesRes, generalRes] =
        await Promise.all([
          fetch('/database/furniture.json'),
          fetch('/database/components.json'),
          fetch('/database/globalSettings.json'),
          fetch('/database/materials.json'),
          fetch('/database/styles.json').catch(() => null), // Ha nincs még file, ne haljon meg
          fetch('/database/general.json').catch(() => null),
        ])

      furnitureList.value = await furnitureRes.json()
      components.value = await componentsRes.json()
      globalGroups.value = await globalSettingsRes.json()

      if (materialsRes.ok) {
        materials.value = await materialsRes.json()
      } else {
        materials.value = []
      }

      // Stílusok betöltése
      if (stylesRes && stylesRes.ok) {
        styles.value = await stylesRes.json()
      } else {
        // Alapértelmezett, ha nincs fájl
        styles.value = []
      }

      // General Settings betöltése
      if (generalRes && generalRes.ok) {
        const data = await generalRes.json()
        if (data.upperCabinet) {
          generalSettings.value.upperCabinet = data.upperCabinet
        }
      }

      console.log('Adatbázis sikeresen betöltve.')
    } catch (error) {
      console.error('Hiba a központi adatbázis betöltése közben:', error)
    }
  }

  // --- GETTERS ---
  function getComponentById(id: string): ComponentConfig | undefined {
    for (const categoryKey in components.value) {
      const categoryComponents = components.value[categoryKey]
      if (categoryComponents) {
        const component = categoryComponents.find((c) => c.id === id)
        if (component) return component
      }
    }
    return undefined
  }

  function getFurnitureById(id: string): FurnitureConfig | undefined {
    return furnitureList.value.find((f) => f.id === id)
  }

  function getMaterialById(id: string): MaterialConfig | undefined {
    return materials.value.find((m) => m.id === id)
  }

  // --- ADMIN ACTIONS (CRUD) ---
  function addComponent(type: string, component: ComponentConfig) {
    if (!components.value[type]) components.value[type] = []
    components.value[type].push(component)
  }

  function updateComponent(type: string, component: ComponentConfig) {
    const categoryComponents = components.value[type]
    if (!categoryComponents) return
    const index = categoryComponents.findIndex((c) => c.id === component.id)
    if (index !== -1) categoryComponents[index] = component
  }

  function deleteComponent(type: string, componentId: string) {
    const categoryComponents = components.value[type]
    if (!categoryComponents) return
    const index = categoryComponents.findIndex((c) => c.id === componentId)
    if (index !== -1) categoryComponents.splice(index, 1)
  }

  function addFurniture(furniture: FurnitureConfig) {
    furnitureList.value.push(furniture)
  }

  function updateFurniture(furniture: FurnitureConfig) {
    const index = furnitureList.value.findIndex((f) => f.id === furniture.id)
    if (index !== -1) furnitureList.value[index] = furniture
  }

  function deleteFurniture(furnitureId: string) {
    const index = furnitureList.value.findIndex((f) => f.id === furnitureId)
    if (index !== -1) furnitureList.value.splice(index, 1)
  }

  return {
    furnitureList,
    components,
    globalGroups,
    materials,
    styles, // ÚJ EXPORT
    furnitureCategories,
    addGlobalGroup,
    updateGlobalGroup,
    deleteGlobalGroup,
    moveGroupUp,
    moveGroupDown,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    // Style Actions
    addStyle,
    removeStyle,
    updateStyle,
    assignStyleToComponents,
    getStyleById,
    // Common
    getComponentById,
    getFurnitureById,
    getMaterialById,
    loadAllData,
    addComponent,
    updateComponent,
    deleteComponent,
    addFurniture,
    updateFurniture,
    deleteFurniture,
    // General
    generalSettings,
    saveGeneralSettings,
  }
})
