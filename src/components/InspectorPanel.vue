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

// ÚJ FÜGGVÉNY
function handleDuplicate() {
  selectionStore.duplicateSelectedObject()
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
    class="panel w-72 cursor-move"
  >
    <h1 class="panel-header">
      {{ selectionStore.selectedObjectConfig.name }}
    </h1>
    
    <div class="space-y-6">
      
      <div v-for="slot in selectionStore.selectedObjectConfig.componentSlots" :key="slot.id">
        <label class="input-label mb-2">{{ slot.name }}</label>

        <!-- Anyagválasztó -->
        <div v-if="slot.type.includes('material')">
          <div v-if="availableMaterials.length <= 6" class="grid grid-cols-2 gap-2">
            <button
              v-for="material in availableMaterials"
              :key="material.id"
              @click="handleMaterialChange(slot.id, material.id)"
              class="btn h-10"
            >
              <div 
                class="w-5 h-5 rounded-sm border border-gray-900" 
                :style="{ backgroundColor: material.color }"
              ></div>
              <span class="text-xs font-light">{{ material.name }}</span>
            </button>
          </div>
          <div v-else class="custom-select-wrapper">
            <select 
              @change="handleMaterialChange(slot.id, ($event.target as HTMLSelectElement).value)"
              class="custom-select"
            >
              <option value="">Válasszon anyagot...</option>
              <option v-for="material in availableMaterials" :key="material.id" :value="material.id">
                {{ material.name }}
              </option>
            </select>
            <div class="select-arrow">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <!-- Stílusválasztó -->
        <div v-if="slot.type.includes('style') && slot.styleOptions" class="mt-2">
           <div v-if="slot.styleOptions.length <= 6" class="grid grid-cols-2 gap-2">
              <button
                v-for="style in slot.styleOptions"
                :key="style.id"
                @click="handleStyleChange(slot.id, style.id)"
                class="btn h-10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-text-secondary">
                  <path d="M8.25 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5ZM15.75 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5ZM4.5 15.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 15.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z" />
                </svg>
                <span class="text-xs font-light">{{ style.name }}</span>
              </button>
           </div>
           <div v-else class="custom-select-wrapper">
              <select 
                @change="handleStyleChange(slot.id, ($event.target as HTMLSelectElement).value)"
                class="custom-select"
              >
                <option value="">Válasszon stílust...</option>
                <option v-for="style in slot.styleOptions" :key="style.id" :value="style.id">
                  {{ style.name }}
                </option>
              </select>
              <div class="select-arrow">
                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
        </div>
      </div>

      <!-- Törlés és Duplikálás gombok -->
        <div class="pt-4 border-t border-panel-border">
          <div class="grid grid-cols-2 gap-2">
            <!-- JAVÍTÁS: A duplikálás gomb került balra, és új stílusosztályt kapott -->
            <button 
              @click="handleDuplicate"
              class="btn-secondary"
            >
              Duplikálás
            </button>
            <!-- JAVÍTÁS: A törlés gomb került jobbra -->
            <button 
              @click="handleDelete"
              class="btn-danger"
            >
              Törlés
            </button>
          </div>
        </div>
    </div>
  </div>
</template>