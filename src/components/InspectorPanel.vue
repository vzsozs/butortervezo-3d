<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { useConfigStore } from '@/stores/config' // Használjuk a config store-t
import { availableMaterials } from '@/config/materials'
import { ref, computed } from 'vue'
import { useDraggable } from '@vueuse/core'

const selectionStore = useSelectionStore()
const configStore = useConfigStore() // Példányosítjuk a store-t

const panelRef = ref<HTMLElement | null>(null)
const { style } = useDraggable(panelRef, {
  initialValue: { x: window.innerWidth - 320, y: 40 },
})

// EGYSZERŰSÍTÉS: Nincs többé szükség bonyolult, rekurzív slot keresésre.
// A bútor configja közvetlenül tartalmazza az összes releváns slotot.
const componentSlots = computed(() => {
  return selectionStore.selectedObjectConfig?.componentSlots ?? []
})

// Helper a komponens nevének lekérdezéséhez
function getComponentName(componentId: string): string {
  return configStore.getComponentById(componentId)?.name ?? componentId
}

// Helper a kiválasztott komponens ID-jának lekérdezéséhez egy slothoz
function getSelectedComponentIdForSlot(slotId: string): string | undefined {
  return selectionStore.selectedObject?.userData.componentState?.[slotId]
}

function handleDelete() {
  selectionStore.deleteSelectedObject()
}

function handleDuplicate() {
  selectionStore.duplicateSelectedObject()
}

function handleMaterialChange(slotId: string, materialId: string) {
  if (materialId) {
    selectionStore.changeMaterial(slotId, materialId)
  }
}

function handleStyleChange(slotId: string, componentId: string) {
  if (componentId) {
    selectionStore.changeStyle(slotId, componentId)
  }
}

// ÚJ FUNKCIÓ: A dinamikus property-k kezelése
function handlePropertyChange(slotId: string, propertyId: string, value: string) {
    selectionStore.changeProperty(slotId, propertyId, value);
}

</script>

<template>
  <div 
    v-if="selectionStore.selectedObjectConfig && selectionStore.selectedObject"
    ref="panelRef"
    :style="style"
    style="position: fixed"
    class="panel w-72 cursor-move"
    @mousedown.stop
  >
    <h1 class="panel-header">{{ selectionStore.selectedObjectConfig.name }}</h1>
    <div class="space-y-6">
      
      <!-- EGYSZERŰSÍTETT V-FOR: Közvetlenül a bútor slotjain iterálunk -->
      <div v-for="slot in componentSlots" :key="slot.slotId">
        <label class="input-label mb-2">{{ slot.name }}</label>

        <!-- Komponens stílus választó -->
        <div v-if="slot.allowedComponents.length > 1" class="custom-select-wrapper">
          <select 
            :value="getSelectedComponentIdForSlot(slot.slotId)"
            @change="handleStyleChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
            class="custom-select"
          >
            <option 
              v-for="componentId in slot.allowedComponents" 
              :key="componentId" 
              :value="componentId"
            >
              {{ getComponentName(componentId) }}
            </option>
          </select>
          <div class="select-arrow">
             <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
        
        <!-- Anyagválasztó (logika maradt, de tisztább) -->
        <div class="mt-2 custom-select-wrapper">
          <!-- TODO: Az anyagválasztó logikát is a slot configra kell majd kötni -->
          <select 
            @change="handleMaterialChange(slot.slotId, ($event.target as HTMLSelectElement).value)"
            class="custom-select"
          >
            <option value="">Válasszon anyagot...</option>
            <option 
              v-for="material in availableMaterials" 
              :key="material.id" 
              :value="material.id"
              :selected="material.id === selectionStore.selectedObject.userData.materialState[slot.slotId]"
            >
              {{ material.name }}
            </option>
          </select>
           <div class="select-arrow">
             <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>

        <!-- ÚJ SZEKCIÓ: Dinamikus property-k renderelése -->
        <div v-if="slot.properties" class="mt-4 space-y-2">
            <div v-for="prop in slot.properties" :key="prop.id">
                <label class="input-label text-sm">{{ prop.name }}</label>
                <div v-if="prop.type === 'select'" class="custom-select-wrapper mt-1">
                    <select 
                        class="custom-select"
                        @change="handlePropertyChange(slot.slotId, prop.id, ($event.target as HTMLSelectElement).value)"
                    >
                        <option v-for="option in prop.options" :key="option.value" :value="option.value"
                            :selected="option.value === (selectionStore.selectedObject.userData.propertyState?.[slot.slotId]?.[prop.id] ?? prop.defaultValue)">
                            {{ option.label }}
                        </option>
                    </select>
                    <div class="select-arrow">
                        <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
                <!-- Ide jöhetnek majd más típusú inputok is (pl. checkbox, number input) -->
            </div>
        </div>

      </div>

      <!-- Törlés és Duplikálás gombok -->
      <div class="pt-4 border-t border-panel-border">
        <div class="grid grid-cols-2 gap-2">
          <button @click="handleDuplicate" class="btn-secondary">Duplikálás</button>
          <button @click="handleDelete" class="btn-danger">Törlés</button>
        </div>
      </div>
    </div>
  </div>
</template>