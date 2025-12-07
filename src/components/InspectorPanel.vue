<script setup lang="ts">
import { ref, watch, nextTick, type ComponentPublicInstance } from 'vue'
import { useSelectionStore } from '@/stores/selection'

// Composables
// Composables
import {
  useInspectorData,
  useInspectorDraggable,
  useDoorVisibility,
  useDimensions,
  useLayoutLogic,
  useMaterialSelection
} from '@/composables/inspector/useInspectorLogic'
import { useInspectorGrouping } from '@/composables/inspector/useInspectorGrouping'

// Components
import InspectorHeader from './inspector/InspectorHeader.vue'
import InspectorDebug from './inspector/InspectorDebug.vue'
import MaterialSelectorOverlay from './inspector/MaterialSelectorOverlay.vue'
import LayoutControls from './inspector/LayoutControls.vue'
import ComponentGroup from './inspector/ComponentGroup.vue'

// --- SETUP ---
const selectionStore = useSelectionStore()

// 1. DATA & STATE
const {
  selectedObject,
  currentConfig,
  currentState,
  furnitureDef
} = useInspectorData()

const slotGroups = ref<any[]>([])
watch(furnitureDef, (def) => {
  slotGroups.value = def?.slotGroups ?? []
}, { immediate: true })


// 2. LOGIC COMPOSABLES
const {
  panelRef,
  dragHandleRef: rawDragHandleRef,
  style
} = useInspectorDraggable()

// Handle ref from the component
const headerRef = ref<ComponentPublicInstance | null>(null)
watch(headerRef, (comp) => {
  if (comp && comp.$el) {
    // If the component exposes rootElement, use that. Or just $el
    // InspectorHeader exposes rootElement
    rawDragHandleRef.value = (comp as any).rootElement || comp.$el
  }
})


const {
  areDoorsVisible,
  toggleDoors,
  applyDoorVisibility
} = useDoorVisibility(selectedObject, currentConfig)

const { dimensions } = useDimensions(selectedObject, currentConfig, currentState)

const {
  displayGroups
} = useInspectorGrouping(currentConfig, currentState)

const {
  checkDefaults
} = useLayoutLogic(selectedObject)

const {
  activeMaterialControl,
  availableMaterialsForActiveControl,
  closeMaterialSelector,
  selectMaterial
} = useMaterialSelection(currentState, selectedObject)


// 3. ORCHESTRATION (Watchers that connect features)
const lastConfigId = ref<string | null>(null)

watch(() => selectedObject.value, async (newObj) => {
  if (!newObj) {
    lastConfigId.value = null
    return
  }

  const currentId = currentConfig.value?.id
  const isNewFurniture = currentId !== lastConfigId.value

  if (isNewFurniture) {
    lastConfigId.value = currentId || null
    await nextTick()

    // Trigger layout check defaults
    await checkDefaults(furnitureDef.value, currentState.value)
  }
}, { immediate: true })

</script>

<template>
  <div v-if="selectedObject && furnitureDef" ref="panelRef" :style="style"
    class="fixed w-80 bg-[#1e1e1e] border border-gray-700 shadow-2xl rounded-lg flex flex-col z-50 overflow-hidden transition-opacity duration-200"
    :class="{ 'opacity-80 pointer-events-none select-none': selectionStore.isBusy }" style="max-height: 90vh;">

    <!-- BUSY STATE OVERLAY -->
    <div v-if="selectionStore.isBusy"
      class="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
      <span class="text-xs text-blue-200 font-mono animate-pulse">Frissítés...</span>
    </div>

    <!-- MATERIAL SELECTOR OVERLAY -->
    <MaterialSelectorOverlay v-if="activeMaterialControl" :active-control="activeMaterialControl"
      :available-materials="availableMaterialsForActiveControl" @close="closeMaterialSelector"
      @select="selectMaterial" />

    <!-- HEADER -->
    <InspectorHeader ref="headerRef" :title="furnitureDef.name" :dimensions="dimensions"
      @close="selectionStore.clearSelection()" />

    <!-- CONTENT -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar" @mousedown.stop>

      <!-- Layouts -->
      <LayoutControls :slot-groups="slotGroups" :are-doors-visible="areDoorsVisible" @toggle-doors="toggleDoors"
        @force-hide-doors="areDoorsVisible = false; applyDoorVisibility()" />

      <!-- DYNAMIC GROUPS -->
      <ComponentGroup v-for="group in displayGroups" :key="group.id" :group="group" />

    </div>

    <!-- FOOTER -->
    <div class="p-3 bg-[#1a1a1a] border-t border-gray-800 grid grid-cols-2 gap-3" @mousedown.stop>
      <button @click="selectionStore.duplicateSelectedObject()"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-blue-400 hover:bg-[#333] hover:border-blue-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z">
          </path>
        </svg>
        Duplikálás
      </button>
      <button @click="selectionStore.deleteSelectedObject()"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-red-400 hover:bg-[#333] hover:border-red-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
          </path>
        </svg>
        Törlés
      </button>
    </div>

    <!-- DEBUG PANEL -->
    <InspectorDebug />

  </div>
</template>
