<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { computed } from 'vue'

const selectionStore = useSelectionStore()

const selectedObjectName = computed(() => {
  if (selectionStore.selectedObject) {
    return selectionStore.selectedObject.name || 'Névtelen objektum'
  }
  return 'Nincs kiválasztva semmi'
})

// ÚJ: Függvény, ami meghívja a store törlési akcióját
function handleDelete() {
  selectionStore.deleteSelectedObject()
}
</script>

<template>
  <div v-if="selectionStore.selectedObject" class="absolute top-4 left-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg w-64 border border-gray-600">
    <h1 class="text-xl font-bold border-b border-gray-600 pb-2 mb-4">Paraméterpanel</h1>
    
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-400">Kiválasztott elem:</label>
        <p class="text-lg font-semibold">{{ selectedObjectName }}</p>
      </div>

      <!-- ÚJ: A Törlés gomb -->
      <div>
        <button 
          @click="handleDelete"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200"
        >
          Törlés
        </button>
      </div>
    </div>
  </div>
</template>