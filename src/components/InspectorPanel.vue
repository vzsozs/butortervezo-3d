<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config'
import { availableMaterials } from '@/config/materials'
import { ref, computed } from 'vue'
import { useDraggable } from '@vueuse/core'
import Experience from '@/three/Experience' // <--- EZT IMPORTÁLD BE!

const selectionStore = useSelectionStore()
const configStore = useConfigStore()

const panelRef = ref<HTMLElement | null>(null)
const { style } = useDraggable(panelRef, {
  initialValue: { x: window.innerWidth - 340, y: 80 },
  preventDefault: true
})

// --- COMPUTED LOGIKA ---
const slotGroups = computed(() => selectionStore.selectedObjectConfig?.slotGroups ?? [])

const standaloneSlots = computed(() => {
  const allSlots = selectionStore.selectedObjectConfig?.componentSlots ?? []
  const groups = slotGroups.value
  const controlledSlotIds = new Set<string>()
  groups.forEach(g => g.controlledSlots.forEach(id => controlledSlotIds.add(id)))
  return allSlots.filter(slot => !controlledSlotIds.has(slot.slotId))
})

// --- HELPEREK ---
function getComponentName(componentId: string): string {
  return configStore.getComponentById(componentId)?.name ?? componentId
}

function getCurrentComponentId(slotId: string): string {
  return selectionStore.selectedObject?.userData.componentState?.[slotId] || ''
}

function getCurrentMaterialId(slotId: string): string {
  return selectionStore.selectedObject?.userData.materialState?.[slotId] || ''
}

// --- ACTIONS ---
function handleGroupChange(groupIndex: number, schemaId: string) {
  // Ha a store-ban még nincs kész az applySchema, akkor itt hibát dobna.
  // Biztonsági ellenőrzés:
  if (selectionStore.applySchema) {
    selectionStore.applySchema(groupIndex, schemaId)
  } else {
    console.warn('A selectionStore.applySchema action még nincs implementálva!')
  }
}

function handleComponentChange(slotId: string, componentId: string) {
  console.log(`[InspectorPanel] Komponens csere: ${slotId} -> ${componentId}`); // <--- LOGOLÁS
  if (componentId) selectionStore.changeStyle(slotId, componentId)
}

function handleMaterialChange(slotId: string, materialId: string) {
  console.log(`[InspectorPanel] Anyag csere: ${slotId} -> ${materialId}`); // <--- LOGOLÁS
  if (materialId) selectionStore.changeMaterial(slotId, materialId)
}

function handleDelete() { selectionStore.deleteSelectedObject() }

async function handleDuplicate() {
  const original = selectionStore.selectedObject;
  if (!original) return;

  // JAVÍTÁS: A store helyett közvetlenül a Singleton példányt kérjük el.
  // Ez mindig működik, ha az app már fut.
  const experience = Experience.getInstance(); 
  
  const config = original.userData.config;
  const componentState = original.userData.componentState;
  const materialState = original.userData.materialState;

  const clone = await experience.assetManager.buildFurnitureFromConfig(config, componentState);
  
  clone.userData.materialState = JSON.parse(JSON.stringify(materialState));
  await experience.stateManager.applyMaterialsToObject(clone);
  
  clone.position.copy(original.position);
  clone.rotation.copy(original.rotation);

  experience.interactionManager.startDraggingExistingObject(clone);
}

</script>

<template>
  <div 
    v-if="selectionStore.selectedObject && selectionStore.selectedObjectConfig"
    ref="panelRef"
    :style="style"
    class="fixed w-80 bg-[#1e1e1e]/95 backdrop-blur-md shadow-2xl rounded-lg border border-gray-700 overflow-hidden z-50 flex flex-col text-gray-200"
  >
    <!-- Header -->
    <div class="bg-gray-800 px-4 py-3 flex justify-between items-center cursor-move border-b border-gray-700">
      <h2 class="font-semibold text-sm uppercase tracking-wider text-blue-400">
        {{ selectionStore.selectedObjectConfig.name }}
      </h2>
      <button @click="selectionStore.clearSelection()" class="text-gray-400 hover:text-white transition-colors">
        ✕
      </button>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
      
      <!-- 1. ELRENDEZÉSEK -->
      <div v-if="slotGroups.length > 0" class="space-y-4">
        <h3 class="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Elrendezés</h3>
        <div v-for="(group, index) in slotGroups" :key="group.groupId">
          <label class="block text-xs font-medium text-gray-400 mb-1">{{ group.name }}</label>
          <div class="relative">
            <select 
              class="w-full bg-[#2a2a2a] border border-gray-600 text-gray-200 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2 appearance-none hover:border-gray-500 transition-colors"
              @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled selected>Válassz...</option>
              <option v-for="schema in group.schemas" :key="schema.id" :value="schema.id">
                {{ schema.name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- 2. RÉSZLETEK -->
      <div v-if="standaloneSlots.length > 0" class="space-y-4">
        <h3 class="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Részletek</h3>
        <div v-for="slot in standaloneSlots" :key="slot.slotId" class="bg-[#252525] p-3 rounded border border-gray-700/50">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-gray-300">{{ slot.name }}</span>
          </div>
          <div v-if="slot.allowedComponents.length > 1" class="mb-2 relative">
            <select 
              :value="getCurrentComponentId(slot.slotId)"
              @change="handleComponentChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
              class="w-full bg-[#333] border border-gray-600 text-gray-200 text-xs rounded p-2 appearance-none hover:border-gray-500"
            >
              <option v-for="compId in slot.allowedComponents" :key="compId" :value="compId">
                {{ getComponentName(compId) }}
              </option>
            </select>
          </div>
          <div class="relative">
            <select 
              :value="getCurrentMaterialId(slot.slotId)"
              @change="handleMaterialChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
              class="w-full bg-[#333] border border-gray-600 text-gray-200 text-xs rounded p-2 appearance-none pl-8 hover:border-gray-500"
            >
              <option value="">Alapértelmezett</option>
              <option v-for="mat in availableMaterials" :key="mat.id" :value="mat.id">
                {{ mat.name }}
              </option>
            </select>
            <div 
              class="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 rounded-full border border-gray-500"
              :style="{ backgroundColor: availableMaterials.find(m => m.id === getCurrentMaterialId(slot.slotId))?.color || '#555' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Actions Footer -->
      <div class="pt-4 grid grid-cols-2 gap-3 border-t border-gray-700">
        <button @click="handleDuplicate" class="flex items-center justify-center px-4 py-2 bg-gray-700 text-blue-400 rounded hover:bg-gray-600 transition-colors text-sm font-medium">Duplikálás</button>
        <button @click="handleDelete" class="flex items-center justify-center px-4 py-2 bg-gray-700 text-red-400 rounded hover:bg-gray-600 transition-colors text-sm font-medium">Törlés</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #1e1e1e; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
</style>