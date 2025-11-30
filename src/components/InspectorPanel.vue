<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config'
import type { ComponentSlotConfig, SlotGroup, FurnitureConfig } from '@/config/furniture'
import Experience from '@/three/Experience'

const selectionStore = useSelectionStore()
const configStore = useConfigStore()

// --- DRAGGABLE SETUP ---
const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)
const initialX = window.innerWidth - 340
const initialY = window.innerHeight - 500

const { style } = useDraggable(panelRef, {
  initialValue: { x: initialX > 0 ? initialX : 100, y: initialY > 0 ? initialY : 100 },
  handle: dragHandleRef,
  preventDefault: false,
})

// --- ALAP ADATOK ---
const selectedObject = computed(() => selectionStore.selectedObject)

// Eredeti definíció betöltése (Ez tartalmazza a te Admin beállításaidat!)
const furnitureDef = computed<FurnitureConfig | undefined>(() => {
  const instanceConfig = selectionStore.selectedObjectConfig
  if (!instanceConfig) return undefined
  return configStore.getFurnitureById(instanceConfig.id) || instanceConfig
})

// --- MÉRETEK (Csak megjelenítéshez) ---
const dimensions = computed(() => {
  if (!selectedObject.value || !furnitureDef.value) return null;

  const componentState = selectedObject.value.userData.componentState || {};
  const corpusSlot = furnitureDef.value.componentSlots.find(s => s.slotId.includes('corpus'));

  if (corpusSlot) {
    const corpusId = componentState[corpusSlot.slotId];
    const corpusComp = configStore.getComponentById(corpusId);
    if (corpusComp && corpusComp.properties) {
      return {
        width: corpusComp.properties.width ?? '-',
        height: corpusComp.properties.height ?? '-',
        depth: corpusComp.properties.depth ?? '-'
      }
    }
  }

  return {
    width: '-',
    height: furnitureDef.value.height ?? '-',
    depth: '-'
  }
})

// --- LISTÁK ---
const slotGroups = computed(() => furnitureDef.value?.slotGroups ?? [])
const componentSlots = computed(() => furnitureDef.value?.componentSlots ?? [])
const materials = computed(() => configStore.materials)

// --- KOMPONENS LISTÁZÁS (EGYSZERŰSÍTVE) ---

function getFilteredComponents(slot: ComponentSlotConfig) {
  // Nem matekozunk. Azt adjuk vissza, amit az Adminban beállítottál (allowedComponents).
  // Csak átalakítjuk ID-ból teljes objektummá, hogy legyen nevünk.
  return slot.allowedComponents
    .map(id => configStore.getComponentById(id))
    .filter(c => c !== undefined)
}

// --- UI HELPERS ---

function shouldShowComponentSelector(slot: ComponentSlotConfig): boolean {
  // Csak akkor mutatjuk a legördülőt, ha van miből választani (több mint 1 opció)
  return slot.allowedComponents.length > 1
}

function shouldShowMaterialSelector(slot: ComponentSlotConfig): boolean {
  return materials.value.length > 0 && !!slot
}

function getComponentName(id: string): string {
  const comp = configStore.getComponentById(id)
  return comp?.name || id
}

function getCurrentComponentId(slotId: string): string {
  return selectedObject.value?.userData.componentState?.[slotId] || ''
}

function getCurrentMaterialId(slotId: string): string {
  return selectedObject.value?.userData.materialState?.[slotId] || ''
}

function getCurrentSchemaId(group: SlotGroup): string {
  const currentState = selectedObject.value?.userData.componentState || {}
  for (const schema of group.schemas) {
    let match = true
    for (const [slotId, compId] of Object.entries(schema.apply)) {
      if (currentState[slotId] !== compId) {
        match = false
        break
      }
    }
    if (match) return schema.id
  }
  return ''
}

function getMaterialColor(materialId: string): string {
  const mat = materials.value.find(m => m.id === materialId)
  return mat?.type === 'color' ? mat.value : '#999'
}

// --- ACTIONS ---

async function handleGroupChange(groupIndex: number, schemaId: string) {
  console.log(`[Inspector] Layout váltás: GroupIndex=${groupIndex}, SchemaID=${schemaId}`);

  if (!selectedObject.value || !furnitureDef.value) return;

  const group = furnitureDef.value.slotGroups?.[groupIndex];
  const schema = group?.schemas.find(s => s.id === schemaId);

  if (!schema) return;

  selectionStore.applySchema(groupIndex, schemaId);

  // KÖZVETLEN ÚJRAÉPÍTÉS (Force Rebuild)
  const experience = Experience.getInstance();
  const original = selectedObject.value;
  const parent = original.parent;

  if (!parent) return;

  const config = original.userData.config;
  const componentState = JSON.parse(JSON.stringify(original.userData.componentState || {}));
  const materialState = original.userData.materialState;

  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    if (componentId) {
      componentState[slotId] = componentId;
    } else {
      delete componentState[slotId];
    }
  });

  try {
    experience.camera.transformControls.detach();

    const newObject = await experience.assetManager.buildFurnitureFromConfig(config, componentState);

    newObject.userData.materialState = materialState;
    await experience.stateManager.applyMaterialsToObject(newObject);

    newObject.position.copy(original.position);
    newObject.rotation.copy(original.rotation);

    parent.remove(original);
    parent.add(newObject);

    experience.experienceStore.replaceObject(original.uuid, newObject);
    selectionStore.selectObject(newObject);

    experience.camera.transformControls.attach(newObject);

    console.log('[Inspector] Layout sikeresen alkalmazva.');
  } catch (error) {
    console.error('[Inspector] Hiba a layout váltásnál:', error);
  }
}

async function handleComponentChange(slotId: string, componentId: string) {
  console.log(`[Inspector] Komponens csere: ${slotId} -> ${componentId}`);

  if (!componentId || !selectedObject.value) return;

  selectionStore.changeStyle(slotId, componentId);

  const experience = Experience.getInstance();
  const original = selectedObject.value;
  const parent = original.parent;

  if (!parent) return;

  const config = original.userData.config;
  const componentState = JSON.parse(JSON.stringify(original.userData.componentState || {}));
  const materialState = original.userData.materialState;

  componentState[slotId] = componentId;

  try {
    experience.camera.transformControls.detach();

    const newObject = await experience.assetManager.buildFurnitureFromConfig(config, componentState);

    newObject.userData.materialState = materialState;
    await experience.stateManager.applyMaterialsToObject(newObject);

    newObject.position.copy(original.position);
    newObject.rotation.copy(original.rotation);

    parent.remove(original);
    parent.add(newObject);

    experience.experienceStore.replaceObject(original.uuid, newObject);
    selectionStore.selectObject(newObject);

    experience.camera.transformControls.attach(newObject);

    console.log('[Inspector] Bútor sikeresen újraépítve.');
  } catch (error) {
    console.error('[Inspector] Hiba az újraépítés során:', error);
  }
}

async function handleMaterialChange(slotId: string, materialId: string) {
  console.log(`[Inspector] Anyag csere: ${slotId} -> ${materialId}`);

  if (materialId && selectedObject.value) {
    selectionStore.changeMaterial(slotId, materialId);

    const experience = Experience.getInstance();

    if (!selectedObject.value.userData.materialState) {
      selectedObject.value.userData.materialState = {};
    }
    selectedObject.value.userData.materialState[slotId] = materialId;

    await experience.stateManager.applyMaterialsToObject(selectedObject.value);
    console.log('[Inspector] Anyag kényszerítve.');
  }
}

async function handleDuplicate() {
  const original = selectionStore.selectedObject;
  if (!original) return;

  const experience = Experience.getInstance();
  const config = original.userData.config;
  const componentState = original.userData.componentState;
  const materialState = original.userData.materialState;

  const clone = await experience.assetManager.buildFurnitureFromConfig(config, componentState);
  clone.userData.materialState = JSON.parse(JSON.stringify(materialState));
  await experience.stateManager.applyMaterialsToObject(clone);

  clone.position.copy(original.position);
  clone.position.x += 0.2;
  clone.rotation.copy(original.rotation);

  experience.scene.add(clone);
  experience.experienceStore.addObject(clone);

  experience.interactionManager.startDraggingExistingObject(clone);
}

function handleDelete() {
  selectionStore.deleteSelectedObject()
}
</script>

<template>
  <div v-if="selectedObject && furnitureDef" ref="panelRef" :style="style"
    class="fixed w-80 bg-[#1e1e1e] border border-gray-700 shadow-2xl rounded-lg flex flex-col z-50 overflow-hidden"
    style="max-height: 80vh;">

    <!-- 1. HEADER -->
    <div ref="dragHandleRef"
      class="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent cursor-move select-none hover:bg-gray-800/30 transition-colors">
      <div class="flex justify-between items-start">
        <h2 class="font-bold text-white text-md leading-tight">
          {{ furnitureDef.name }}
        </h2>
        <button @mousedown.stop @click="selectionStore.clearSelection()"
          class="text-gray-500 hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div v-if="dimensions" class="mt-2 text-[11px] text-blue-400 font-mono flex flex-wrap gap-x-3">
        <span>Szélesség: <span class="text-gray-300">{{ dimensions.width }}mm</span></span>
        <span>Magasság: <span class="text-gray-300">{{ dimensions.height }}mm</span></span>
        <span>Mélység: <span class="text-gray-300">{{ dimensions.depth }}mm</span></span>
      </div>
    </div>

    <!-- 2. CONTENT -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar" @mousedown.stop>

      <!-- Layouts -->
      <div v-if="slotGroups.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Elrendezés</h3>
        <div class="space-y-3">
          <div v-for="(group, index) in slotGroups" :key="group.groupId">
            <label class="block text-xs font-medium text-gray-400 mb-1.5">{{ group.name }}</label>
            <div class="relative group">
              <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getCurrentSchemaId(group)">
                <option value="" disabled>Válassz...</option>
                <option v-for="schema in group.schemas" :key="schema.id" :value="schema.id">
                  {{ schema.name }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Components -->
      <div v-if="componentSlots.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 pt-2 border-t border-gray-800">
          Részletek</h3>

        <div class="space-y-4">
          <div v-for="slot in componentSlots" :key="slot.slotId" class="space-y-1">

            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <span class="w-1 h-3 bg-gray-600 rounded-full mr-2"></span>
                <span class="text-xs font-bold text-gray-300">{{ slot.name }}</span>
              </div>
              <span v-if="!shouldShowComponentSelector(slot)" class="text-[10px] text-gray-500 italic">
                {{ getComponentName(getCurrentComponentId(slot.slotId)) }}
              </span>
            </div>

            <div class="grid gap-2"
              :class="(shouldShowComponentSelector(slot) && shouldShowMaterialSelector(slot)) ? 'grid-cols-2' : 'grid-cols-1'">

              <!-- Component Selector -->
              <div v-if="shouldShowComponentSelector(slot)">
                <div class="relative group">
                  <select :value="getCurrentComponentId(slot.slotId)"
                    @change="handleComponentChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
                    class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                    <option v-for="comp in getFilteredComponents(slot)" :key="comp.id" :value="comp.id">
                      {{ comp.name }}
                    </option>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                    <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Material Selector -->
              <div v-if="shouldShowMaterialSelector(slot)">
                <div class="relative group">
                  <select :value="getCurrentMaterialId(slot.slotId)"
                    @change="handleMaterialChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
                    class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-6 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                    <option value="">Alapértelmezett</option>
                    <option v-for="mat in materials" :key="mat.id" :value="mat.id">
                      {{ mat.name }}
                    </option>
                  </select>

                  <div
                    class="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full border border-gray-600"
                    :style="{ backgroundColor: getMaterialColor(getCurrentMaterialId(slot.slotId)) }"></div>

                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                    <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- 3. FOOTER -->
    <div class="p-3 bg-[#1a1a1a] border-t border-gray-800 grid grid-cols-2 gap-3" @mousedown.stop>
      <button @click="handleDuplicate"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-blue-400 hover:bg-[#333] hover:border-blue-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z">
          </path>
        </svg>
        Duplikálás
      </button>
      <button @click="handleDelete"
        class="flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-gray-700 rounded text-xs font-medium text-red-400 hover:bg-[#333] hover:border-red-500/50 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
          </path>
        </svg>
        Törlés
      </button>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #60a5fa;
}
</style>
