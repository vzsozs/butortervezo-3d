// src/stores/config.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  FurnitureConfig,
  ComponentConfig,
  GlobalGroupConfig, // ÚJ TÍPUS
  ComponentDatabase,
  MaterialConfig,
} from '@/config/furniture'

export const useConfigStore = defineStore('config', () => {
  const furnitureList = ref<FurnitureConfig[]>([])
  const components = ref<ComponentDatabase>({})

  // JAVÍTÁS: globalSettings helyett globalGroups
  const globalGroups = ref<GlobalGroupConfig[]>([])

  const materials = ref<MaterialConfig[]>([])

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

  // --- ÚJ ACTIONS: Global Group Kezelés ---

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
    if (index > 0) {
      const temp = globalGroups.value[index]
      globalGroups.value[index] = globalGroups.value[index - 1]
      globalGroups.value[index - 1] = temp
    }
  }

  function moveGroupDown(index: number) {
    if (index < globalGroups.value.length - 1) {
      const temp = globalGroups.value[index]
      globalGroups.value[index] = globalGroups.value[index + 1]
      globalGroups.value[index + 1] = temp
    }
  }

  // --- Material Kezelés (Változatlan) ---
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

  // Betöltés
  async function loadAllData() {
    try {
      const [furnitureRes, componentsRes, globalSettingsRes, materialsRes] = await Promise.all([
        fetch('/database/furniture.json'),
        fetch('/database/components.json'),
        fetch('/database/globalSettings.json'),
        fetch('/database/materials.json'),
      ])
      furnitureList.value = await furnitureRes.json()
      components.value = await componentsRes.json()

      // JAVÍTÁS: Itt is globalGroups-ba töltünk
      globalGroups.value = await globalSettingsRes.json()

      if (materialsRes.ok) {
        materials.value = await materialsRes.json()
      } else {
        materials.value = []
      }
      console.log('Adatbázis sikeresen betöltve.')
    } catch (error) {
      console.error('Hiba a központi adatbázis betöltése közben:', error)
    }
  }

  // Getterek (Változatlan)
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

  // Admin Actions (Változatlan)
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
    globalGroups, // ÚJ EXPORT
    materials,
    furnitureCategories,
    addGlobalGroup,
    updateGlobalGroup,
    deleteGlobalGroup,
    moveGroupUp, // ÚJ
    moveGroupDown, // ÚJ
    addMaterial,
    updateMaterial,
    deleteMaterial,
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
  }
})
