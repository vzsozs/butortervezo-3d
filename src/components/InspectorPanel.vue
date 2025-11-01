<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { computed } from 'vue'
import { availableMaterials } from '@/config/materials'

const selectionStore = useSelectionStore()

const selectedObjectName = computed(() => {
  if (selectionStore.selectedObject) {
    return selectionStore.selectedObject.name || 'Névtelen objektum'
  }
  return 'Nincs kiválasztva semmi'
})

function handleDelete() {
  selectionStore.deleteSelectedObject()
}

// Ez a függvény mindkét UI elem (gombok és dropdown) számára működik
function handleMaterialChange(materialId: string) {
  // A dropdown @change eseménye üres stringet is adhat, ha nincs kiválasztva semmi
  if (materialId) {
    selectionStore.changeMaterial('ajto', materialId)
  }
}
</script>

<template>
  <div v-if="selectionStore.selectedObject" class="absolute top-4 left-4 bg-gray-800 text-gray-300 p-4 rounded-lg shadow-lg w-72 border border-gray-700">
    <h1 class="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Paraméterpanel</h1>
    
    <div class="space-y-6">
      <!-- Kiválasztott elem neve -->
      <div>
        <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider">Kiválasztott elem</label>
        <p class="text-base font-light">{{ selectedObjectName }}</p>
      </div>

      <!-- Anyagválasztó szekció -->
      <div>
        <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Ajtófront anyaga</label>
        
        <!-- === KONDICIONÁLIS UI === -->

        <!-- 1. GOMB-RÁCS (ha 6 vagy kevesebb anyag van) -->
        <div v-if="availableMaterials.length <= 6" class="grid grid-cols-2 gap-2">
          <button
            v-for="material in availableMaterials"
            :key="material.id"
            @click="handleMaterialChange(material.id)"
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

        <!-- 2. LEGÖRDÜLŐ MENÜ (ha több mint 6 anyag van) -->
        <div v-else class="relative">
          <select 
            @change="handleMaterialChange(($event.target as HTMLSelectElement).value)"
            class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
          >
            <option value="">Válasszon anyagot...</option>
            <option v-for="material in availableMaterials" :key="material.id" :value="material.id">
              {{ material.name }}
            </option>
          </select>
          <!-- Egyedi legördülő nyíl, hogy passzoljon a designhoz -->
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
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