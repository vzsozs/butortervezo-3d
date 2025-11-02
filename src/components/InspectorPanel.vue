<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { availableMaterials } from '@/config/materials'
import { ref } from 'vue'
import { useDraggable } from '@vueuse/core'

const selectionStore = useSelectionStore()

// --- MOZGATÁS LOGIKA ---
// 1. Létrehozunk egy ref-et, amit a mozgatható panelre kötünk
const panelRef = ref<HTMLElement | null>(null)

// 2. A useDraggable hook inicializálása
//    - Az 'initialValue' megadja a panel kezdő pozícióját.
//    - A 'handle' megmondja, hogy a panel melyik részét megfogva lehet húzni.
//      Itt a teljes panelt mozgathatóvá tesszük.
const { style } = useDraggable(panelRef, {
  initialValue: { x: 400, y: 100 },
})

function handleDelete() {
  selectionStore.deleteSelectedObject()
}

// JAVÍTÁS: A függvény most már a slot ID-jét is megkapja, hogy tudja, MIT kell megváltoztatni.
function handleMaterialChange(slotId: string, materialId: string) {

  console.log(`handleMaterialChange meghívva! Slot: ${slotId}, Anyag: ${materialId}`);

  if (materialId) {
    selectionStore.changeMaterial(slotId, materialId)
  }
}

// ÚJ: Függvény a stílusváltás kezelésére
function handleStyleChange(slotId: string, styleId: string) {
  if (styleId) {
    selectionStore.changeStyle(slotId, styleId)
  }
}
</script>

<template>
    <div 
    v-if="selectionStore.selectedObjectConfig" 
    ref="panelRef"
    @mousedown.stop
    :style="style"
    style="position: fixed"
    class="bg-gray-800 text-gray-300 p-4 rounded-lg shadow-lg w-72 border border-gray-700 cursor-move"
  >
    <h1 class="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">
      {{ selectionStore.selectedObjectConfig.name }}
    </h1>
    
    <div class="space-y-6">
      
      <div v-for="slot in selectionStore.selectedObjectConfig.componentSlots" :key="slot.id">
        <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{{ slot.name }}</label>

        <!-- Anyagválasztó (változatlan) -->
        <div v-if="slot.type.includes('material')">
          <div v-if="availableMaterials.length <= 6" class="grid grid-cols-2 gap-2">
            <button
              v-for="material in availableMaterials"
              :key="material.id"
              @click="handleMaterialChange(slot.id, material.id)"
              class="w-full h-10 rounded border border-gray-600 hover:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 transition-all duration-150"
            >
              <div class="flex items-center space-x-2 px-2">
                <div 
                  class="w-5 h-5 rounded-sm border border-gray-900" 
                  :style="{ backgroundColor: material.color }"
                ></div>
                <span class="text-xs font-light">{{ material.name }}</span>
              </div>
            </button>
          </div>
          <div v-else class="relative">
            <select 
              @change="handleMaterialChange(slot.id, ($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            >
              <option value="">Válasszon anyagot...</option>
              <option v-for="material in availableMaterials" :key="material.id" :value="material.id">
                {{ material.name }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <!-- Stílusválasztó (FRISSÍTVE) -->
        <div v-if="slot.type.includes('style') && slot.styleOptions" class="relative mt-2">
           <!-- JAVÍTÁS: A feltétel most már 6 opció, a rács pedig 2 oszlopos -->
           <div v-if="slot.styleOptions.length <= 6" class="grid grid-cols-2 gap-2">
              <button
                v-for="style in slot.styleOptions"
                :key="style.id"
                @click="handleStyleChange(slot.id, style.id)"
                class="w-full h-10 rounded border border-gray-600 hover:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 transition-all duration-150 flex items-center space-x-2 px-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
                  <path d="M8.25 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5ZM15.75 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5ZM4.5 15.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 15.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z" />
                </svg>
                <span class="text-xs font-light">{{ style.name }}</span>
              </button>
           </div>
           <!-- LEGÖRDÜLŐ MENÜ (ha több mint 6 stílus van) -->
           <div v-else>
              <select 
                @change="handleStyleChange(slot.id, ($event.target as HTMLSelectElement).value)"
                class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
              >
                <option value="">Válasszon stílust...</option>
                <option v-for="style in slot.styleOptions" :key="style.id" :value="style.id">
                  {{ style.name }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
        </div>
      </div>

      <!-- Törlés gomb -->
      <div class="pt-4 border-t border-gray-700">
        <button 
          @click="handleDelete"
          class="w-full bg-red-800 hover:bg-red-900 text-white font-bold py-2 px-4 rounded transition-colors duration-200"
        >
          Törlés
        </button>
      </div>
    </div>
  </div>
</template>