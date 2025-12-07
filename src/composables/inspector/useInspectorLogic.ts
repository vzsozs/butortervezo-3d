import { ref, computed, watch, nextTick, type Ref, onUnmounted } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config'
import { useProceduralStore } from '@/stores/procedural'
import {
  ComponentType,
  FurnitureCategory,
  ProceduralConstants,
  type FurnitureConfig,
  type ComponentSlotConfig,
  type SlotGroup,
  type MaterialConfig,
} from '@/config/furniture'
import type { InspectorControl } from './useInspectorGrouping'
import type { Group, Mesh } from 'three'

// --- TYPE DEFINITIONS ---
export interface FurnitureUserData {
  config?: FurnitureConfig
  componentState?: Record<string, string>
  materialState?: Record<string, string>
  plinthHeightOverride?: number
  worktopThicknessOverride?: number
  initialized?: boolean
  [key: string]: unknown
}

export type FurnitureObject = Group & {
  userData: FurnitureUserData
}

// --- 1. INSPECTOR DATA ---
export function useInspectorData() {
  const selectionStore = useSelectionStore()
  const configStore = useConfigStore()

  const selectedObject = computed<FurnitureObject | null>(
    () => selectionStore.selectedObject as FurnitureObject | null,
  )
  const currentConfig = computed<FurnitureConfig | null>(() => selectionStore.selectedObjectConfig)

  const furnitureDef = computed<FurnitureConfig | undefined>(() => {
    if (!currentConfig.value) return undefined
    return configStore.getFurnitureById(currentConfig.value.id) || currentConfig.value
  })

  // Ensure currentState is always a Record<string, string>
  const currentState = computed<Record<string, string>>(
    () => selectedObject.value?.userData.componentState || {},
  )

  return {
    selectionStore,
    configStore,
    selectedObject,
    currentConfig,
    furnitureDef,
    currentState,
  }
}

// --- 2. DRAGGABLE ---
export function useInspectorDraggable() {
  const panelRef = ref<HTMLElement | null>(null)
  const dragHandleRef = ref<HTMLElement | null>(null)

  const initialX = window.innerWidth - 340
  const initialY = 100

  const { style } = useDraggable(panelRef, {
    initialValue: { x: initialX > 0 ? initialX : 100, y: initialY },
    handle: dragHandleRef,
    preventDefault: false,
  })

  return { panelRef, dragHandleRef, style }
}

// --- 3. DIMENSIONS ---
export function useDimensions(
  selectedObject: Ref<FurnitureObject | null>,
  currentConfig: Ref<FurnitureConfig | null>,
  currentState: Ref<Record<string, string>>,
) {
  const configStore = useConfigStore()
  const proceduralStore = useProceduralStore()

  const dimensions = computed(() => {
    if (!selectedObject.value || !currentConfig.value) return null

    const _dep = proceduralStore.updateTrigger // Trigger

    let w = 0,
      h = 0,
      d = 0

    const corpusSlot = currentConfig.value.componentSlots?.find(
      (s: ComponentSlotConfig) =>
        s.componentType === ComponentType.CORPUS || s.slotId.includes('corpus'),
    )

    if (corpusSlot) {
      const corpusId = currentState.value[corpusSlot.slotId]
      if (corpusId) {
        const corpusComp = configStore.getComponentById(corpusId)
        if (corpusComp?.properties) {
          w = corpusComp.properties.width || 0
          h = corpusComp.properties.height || 0
          d = corpusComp.properties.depth || 0
        }
      }
    }

    // Use correct type for config access, handle legacy properties if needed
    // FurnitureConfig should have dimensions according to updated types,
    // but if we support legacy data, we might need adjustments.
    const conf = currentConfig.value
    if (h === 0) h = conf.dimensions?.height || conf.height || 0
    if (w === 0) w = conf.dimensions?.width || conf.width || 0
    if (d === 0) d = conf.dimensions?.depth || conf.depth || 0

    // Lábazat
    const hasStandardLeg = Object.values(currentState.value).some(
      (id) => typeof id === 'string' && id.includes(ProceduralConstants.LEG_STANDARD_ID),
    )

    if (hasStandardLeg) {
      const pHeightMeter =
        selectedObject.value.userData.plinthHeightOverride ?? proceduralStore.plinth.height
      h += pHeightMeter * 1000
    }

    // Munkapult
    if (currentConfig.value.category === FurnitureCategory.BOTTOM_CABINET) {
      const wThickMeter =
        selectedObject.value.userData.worktopThicknessOverride ?? proceduralStore.worktop.thickness
      h += wThickMeter * 1000
    }

    return {
      width: Math.round(w),
      height: Math.round(h),
      depth: Math.round(d),
    }
  })

  return { dimensions }
}

// --- 4. PROMOTED PROPERTIES (Lábazat Override) ---
export function usePromotedProperties(selectedObject: Ref<FurnitureObject | null>) {
  const configStore = useConfigStore()
  const proceduralStore = useProceduralStore()

  const legConstraints = computed(() => {
    if (!configStore.globalGroups) return { minHeight: 0.05, maxHeight: 0.2 }
    const legGroup = configStore.globalGroups.find(
      (g) => g.targets.includes('legs') || g.targets.includes('leg_slot'),
    )
    return legGroup?.construction || { minHeight: 0.05, maxHeight: 0.2 }
  })

  function isControlStandardLeg(
    control: InspectorControl,
    currentState: Record<string, string>,
  ): boolean {
    const firstSlot = control.slots[0]
    if (!firstSlot) return false
    const currentId = currentState[firstSlot.slotId]
    return currentId ? currentId.includes(ProceduralConstants.LEG_STANDARD_ID) : false
  }

  const internalPlinthHeight = ref(0.1)

  watch(
    selectedObject,
    (newObj) => {
      if (newObj) {
        internalPlinthHeight.value =
          newObj.userData.plinthHeightOverride ?? proceduralStore.plinth.height
      }
    },
    { immediate: true },
  )

  watch(
    () => proceduralStore.plinth.height,
    (newGlobal) => {
      if (
        selectedObject.value &&
        selectedObject.value.userData.plinthHeightOverride === undefined
      ) {
        internalPlinthHeight.value = newGlobal
      }
    },
  )

  const localPlinthHeight = computed({
    get: () => internalPlinthHeight.value,
    set: (val: number) => {
      internalPlinthHeight.value = val
      if (selectedObject.value) {
        selectedObject.value.userData.plinthHeightOverride = val
        proceduralStore.triggerUpdate()
      }
    },
  })

  const hasOverride = computed(() => {
    const _dep = proceduralStore.updateTrigger
    return selectedObject.value?.userData.plinthHeightOverride !== undefined
  })

  function ensureOverride() {
    if (selectedObject.value && selectedObject.value.userData.plinthHeightOverride === undefined) {
      localPlinthHeight.value = localPlinthHeight.value
    }
  }

  function resetPlinthOverride() {
    if (selectedObject.value) {
      delete selectedObject.value.userData.plinthHeightOverride
      internalPlinthHeight.value = proceduralStore.plinth.height
      proceduralStore.triggerUpdate()
    }
  }

  return {
    legConstraints,
    isControlStandardLeg,
    localPlinthHeight,
    hasOverride,
    ensureOverride,
    resetPlinthOverride,
  }
}

// --- 5. DOOR VISIBILITY (Ghost Mode) ---
export function useDoorVisibility(
  selectedObject: Ref<FurnitureObject | null>,
  currentConfig: Ref<FurnitureConfig | null>,
) {
  const areDoorsVisible = ref(true)
  const lastConfigId = ref<string | null>(null)
  const lastKnownObject = ref<FurnitureObject | null>(null)

  function forceRestoreVisibility(object: FurnitureObject) {
    if (!object) return
    object.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      const mesh = child as Mesh
      const name = mesh.name.toLowerCase()
      const slotId = (mesh.userData.slotId || '').toLowerCase()
      const isFront =
        name.includes('front') ||
        slotId.includes('front') ||
        name.includes('door') ||
        slotId.includes('door')
      const isHandle = name.includes('handle') || slotId.includes('handle')

      if (isFront || isHandle) {
        mesh.castShadow = true
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          if (mat.userData.originalOpacity !== undefined) {
            mat.opacity = mat.userData.originalOpacity
            mat.transparent = mat.userData.originalTransparent
            mat.depthWrite = mat.userData.originalDepthWrite
            delete mat.userData.originalOpacity
            delete mat.userData.originalTransparent
            delete mat.userData.originalDepthWrite
          } else {
            mat.opacity = 1.0
            mat.transparent = false
            mat.depthWrite = true
          }
          mat.needsUpdate = true
        })
      }
    })
  }

  function applyDoorVisibility() {
    setTimeout(() => {
      if (!selectedObject.value) return
      const isGhostMode = !areDoorsVisible.value

      selectedObject.value.traverse((child) => {
        if (!(child as Mesh).isMesh) return
        const mesh = child as Mesh

        const name = mesh.name.toLowerCase()
        const slotId = (mesh.userData.slotId || '').toLowerCase()

        const isFront =
          name.includes('front') ||
          slotId.includes('front') ||
          name.includes('door') ||
          slotId.includes('door')
        const isHandle =
          name.includes('handle') || slotId.includes('handle') || name.includes('fogantyu')
        const isDrawerFront = name.includes('drawer') && name.includes('front')

        if (isFront || isHandle || isDrawerFront) {
          mesh.castShadow = !isGhostMode
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

          materials.forEach((mat) => {
            if (isGhostMode) {
              if (mat.userData.originalOpacity === undefined) {
                mat.userData.originalOpacity = mat.opacity
                mat.userData.originalTransparent = mat.transparent
                mat.userData.originalDepthWrite = mat.depthWrite
              }
              mat.transparent = true
              mat.opacity = 0.2
              mat.depthWrite = false
            } else {
              if (mat.userData.originalOpacity !== undefined) {
                mat.opacity = mat.userData.originalOpacity
                mat.transparent = mat.userData.originalTransparent
                mat.depthWrite = mat.userData.originalDepthWrite
                delete mat.userData.originalOpacity
                delete mat.userData.originalTransparent
                delete mat.userData.originalDepthWrite
              } else {
                mat.opacity = 1.0
                mat.transparent = false
                mat.depthWrite = true
              }
            }
            mat.needsUpdate = true
          })
        }
      })
    }, 50)
  }

  function toggleDoors() {
    areDoorsVisible.value = !areDoorsVisible.value
    applyDoorVisibility()
  }

  onUnmounted(() => {
    if (lastKnownObject.value) {
      forceRestoreVisibility(lastKnownObject.value)
    }
  })

  watch(
    () => selectedObject.value,
    async (newObj, oldObj) => {
      if (!newObj) {
        if (oldObj) forceRestoreVisibility(oldObj)
        lastConfigId.value = null
        lastKnownObject.value = null
        return
      }

      lastKnownObject.value = newObj
      const currentId = currentConfig.value?.id
      const isNewFurniture = currentId !== lastConfigId.value

      if (isNewFurniture) {
        areDoorsVisible.value = true
        lastConfigId.value = currentId || null
        await nextTick()
      }

      applyDoorVisibility()
    },
    { immediate: true },
  )

  return { areDoorsVisible, toggleDoors, applyDoorVisibility, forceRestoreVisibility }
}

// --- 6. SHELF LOGIC ---
export function useShelfLogic(
  currentConfig: Ref<FurnitureConfig | null>,
  currentState: Ref<Record<string, string>>,
  areDoorsVisible: Ref<boolean>,
  applyDoorVisibility: () => void,
) {
  const configStore = useConfigStore()
  const selectionStore = useSelectionStore()

  function hasShelfSchema(group: SlotGroup): boolean {
    return group.schemas.some((s) => s.type === 'shelf' || s.shelfConfig !== undefined)
  }

  function getMaxShelves(group: SlotGroup): number {
    if (!currentConfig.value) return 5
    const corpusSlotDef = currentConfig.value.componentSlots.find(
      (s) => s.componentType === ComponentType.CORPUS,
    )
    if (corpusSlotDef) {
      const activeCorpusId = currentState.value[corpusSlotDef.slotId]
      if (activeCorpusId) {
        const corpusComp = configStore.getComponentById(activeCorpusId)
        if (corpusComp?.properties?.maxShelves !== undefined) {
          return corpusComp.properties.maxShelves
        }
      }
    }
    return group.controlledSlots.length > 0 ? group.controlledSlots.length : 5
  }

  function getShelfCount(group: SlotGroup): number {
    const state = currentState.value
    const hasPhysicalShelves = Object.keys(state).some((key) => key.startsWith('shelf_'))
    if (!hasPhysicalShelves) return 0

    if (currentConfig.value && currentConfig.value.slotGroups) {
      const dynamicGroup = currentConfig.value.slotGroups.find((g) => g.groupId === group.groupId)
      if (dynamicGroup) {
        const shelfSchema = dynamicGroup.schemas.find((s) => s.type === 'shelf')
        if (shelfSchema && shelfSchema.shelfConfig) {
          return shelfSchema.shelfConfig.count ?? 0
        }
      }
    }
    return 0
  }

  function setShelfCount(groupIndex: number, group: SlotGroup, count: number) {
    const config = currentConfig.value
    if (!config) return

    const max = getMaxShelves(group)
    const safeCount = Math.max(0, Math.min(count, max))

    if (areDoorsVisible.value) {
      areDoorsVisible.value = false
      applyDoorVisibility()
    }

    const storeGroup = config.slotGroups?.find((g) => g.groupId === group.groupId)
    const shelfSchema = storeGroup?.schemas.find((s) => s.type === 'shelf')

    if (shelfSchema && shelfSchema.shelfConfig) {
      shelfSchema.shelfConfig.count = safeCount
      selectionStore.applySchema(groupIndex, shelfSchema.id)
    }
  }

  return { hasShelfSchema, getMaxShelves, getShelfCount, setShelfCount }
}

// --- 7. LAYOUT LOGIC ---
export function useLayoutLogic(selectedObject: Ref<FurnitureObject | null>) {
  const selectionStore = useSelectionStore()

  function getLayoutDropdownValue(group: SlotGroup): string {
    const currentState = selectedObject.value?.userData.componentState || {}
    const layoutSchema = group.schemas.find((schema) => {
      if (schema.type === 'shelf') return false
      if (Object.keys(schema.apply).length === 0) return false
      for (const [slotId, compId] of Object.entries(schema.apply)) {
        if (currentState[slotId] !== compId) return false
      }
      return true
    })

    if (layoutSchema) return layoutSchema.id
    if (group.defaultSchemaId) return group.defaultSchemaId
    const firstLayout = group.schemas.find((s) => s.type !== 'shelf')
    return firstLayout ? firstLayout.id : ''
  }

  function handleGroupChange(groupIndex: number, schemaId: string) {
    selectionStore.applySchema(groupIndex, schemaId)
  }

  function hasLayoutSchema(group: SlotGroup): boolean {
    return group.schemas.some((s) => s.type !== 'shelf')
  }

  async function checkDefaults(
    furnitureDef: FurnitureConfig | undefined,
    currentState: Record<string, string>,
  ) {
    const def = furnitureDef
    if (!def?.slotGroups || def.slotGroups.length === 0) return
    if (selectedObject.value?.userData?.initialized) return

    for (const [index, group] of def.slotGroups.entries()) {
      if (!group.defaultSchemaId) continue
      const defaultSchema = group.schemas.find((s) => s.id === group.defaultSchemaId)
      if (!defaultSchema) continue
      const state = currentState
      let needsUpdate = false

      if (defaultSchema.apply && Object.keys(defaultSchema.apply).length > 0) {
        for (const requiredSlot of Object.keys(defaultSchema.apply)) {
          if (!state[requiredSlot]) {
            needsUpdate = true
            break
          }
        }
      }
      if (
        defaultSchema.type === 'shelf' &&
        defaultSchema.shelfConfig &&
        defaultSchema.shelfConfig.count > 0
      ) {
        const hasShelves = Object.keys(state).some((k) => k.startsWith('shelf_'))
        if (!hasShelves) needsUpdate = true
      }
      if (needsUpdate) {
        await selectionStore.applySchema(index, group.defaultSchemaId)
      }
    }
    if (selectedObject.value) {
      selectedObject.value.userData.initialized = true
    }
  }

  return { getLayoutDropdownValue, handleGroupChange, hasLayoutSchema, checkDefaults }
}

// --- 8. MATERIAL SELECTION (FIXED SINGLETON) ---
const activeMaterialControl = ref<InspectorControl | null>(null) // Singleton state
const _matTrigger = ref(0) // Singleton trigger
function triggerMaterialUpdate() {
  _matTrigger.value++
}

export function useMaterialSelection(
  currentState: Ref<Record<string, string>>,
  selectedObject: Ref<FurnitureObject | null>,
) {
  const configStore = useConfigStore()
  const selectionStore = useSelectionStore()
  const proceduralStore = useProceduralStore()

  function openMaterialSelector(control: InspectorControl) {
    activeMaterialControl.value = control
  }

  function closeMaterialSelector() {
    activeMaterialControl.value = null
  }

  const availableMaterialsForActiveControl = computed(() => {
    if (!activeMaterialControl.value) return []
    const slot = activeMaterialControl.value.referenceSlot
    const currentId = currentState.value[slot.slotId]
    const comp = configStore.getComponentById(currentId || '')
    const allowedCats = comp?.allowedMaterialCategories || []

    if (allowedCats.length === 0) return configStore.materials

    return configStore.materials.filter((mat) => {
      const matCats = Array.isArray(mat.category) ? mat.category : [mat.category]
      return matCats.some((c) => allowedCats.includes(c))
    })
  })

  function selectMaterial(materialId: string) {
    if (!activeMaterialControl.value) return

    // Manually update the local state to trigger reactivity immediately
    if (selectedObject.value) {
      if (!selectedObject.value.userData.materialState) {
        selectedObject.value.userData.materialState = {}
      }
      activeMaterialControl.value.slots.forEach((slot) => {
        // Strict null check for userData in selectedObject
        selectedObject.value!.userData.materialState![slot.slotId] = materialId
      })
    }

    const updates = activeMaterialControl.value.slots.map((slot) => ({
      slotId: slot.slotId,
      materialId: materialId,
    }))
    selectionStore.changeMaterials(updates)
    setTimeout(() => {
      proceduralStore.triggerUpdate()
      triggerMaterialUpdate() // Custom trigger
    }, 50)

    triggerMaterialUpdate() // Immediate trigger
    closeMaterialSelector()
  }

  function getCurrentMaterialId(slotId: string): string {
    const _dep = _matTrigger.value // Dependency
    const stateVal = selectedObject.value?.userData.materialState?.[slotId]
    if (stateVal) return stateVal
    const compId = currentState.value[slotId]
    if (compId) {
      const comp = configStore.getComponentById(compId)
      if (comp?.materialOptions && comp.materialOptions.length > 0) {
        return comp.materialOptions[0] || ''
      }
    }
    return 'default_material'
  }

  function getCurrentMaterial(
    slotId: string,
  ): MaterialConfig | { type: 'color'; value: string; name: string; thumbnail: string } {
    const matId = getCurrentMaterialId(slotId)
    const found = configStore.materials.find((m) => m.id === matId)
    const systemDefault = configStore.materials.find((m) => m.id === 'default_material')
    return (
      found ||
      systemDefault || { type: 'color', value: '#cccccc', name: 'Loading...', thumbnail: '' }
    )
  }

  function getMatType(slotId: string): string {
    return getCurrentMaterial(slotId)?.type || 'color'
  }

  function getMatValue(slotId: string): string {
    return getCurrentMaterial(slotId)?.value || '#cccccc'
  }

  function getMatThumbnail(slotId: string): string {
    const mat = getCurrentMaterial(slotId)
    if ('thumbnail' in mat && mat.thumbnail) {
      return mat.thumbnail
    }
    if ('value' in mat && mat.value) {
      return mat.value
    }
    return ''
  }

  function shouldShowMaterialSelector(slot: ComponentSlotConfig): boolean {
    if (configStore.materials.length === 0 || !slot) return false
    const currentId = currentState.value[slot.slotId]
    return !!currentId
  }

  function isMaterialInherited(slot: ComponentSlotConfig): boolean {
    const currentId = currentState.value[slot.slotId]
    if (!currentId) return false
    const comp = configStore.getComponentById(currentId)
    return !!comp?.materialSource
  }

  return {
    activeMaterialControl,
    openMaterialSelector,
    closeMaterialSelector,
    availableMaterialsForActiveControl,
    selectMaterial,
    getMatType,
    getMatValue,
    getMatThumbnail,
    shouldShowMaterialSelector,
    isMaterialInherited,
  }
}
