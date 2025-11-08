<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import { availableMaterials } from '@/config/materials'
import { ref, computed } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useExperienceStore } from '@/stores/experience';
import type { ComponentConfig } from '@/config/furniture';

const selectionStore = useSelectionStore()
const experienceStore = useExperienceStore();

const panelRef = ref<HTMLElement | null>(null)
const { style } = useDraggable(panelRef, {
  initialValue: { x: window.innerWidth - 320, y: 40 },
})

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

function getComponent(componentId: string): ComponentConfig | undefined {
  return experienceStore.instance?.configManager.getComponentById(componentId);
}

// Computed property, ami visszaadja a kiválasztott komponens configját egy adott slothoz.
const selectedComponentForSlot = computed(() => (slotId: string) => {
  const componentId = selectionStore.selectedObject?.userData.componentState?.[slotId];
  if (componentId) {
    return getComponent(componentId);
  }
  return undefined;
});
</script>

<template>
  <div 
    v-if="selectionStore.selectedObjectConfig && selectionStore.selectedObject" 
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
      <div v-for="slot in selectionStore.selectedObjectConfig.slots" :key="slot.id">
        <label class="input-label mb-2">{{ slot.name }}</label>

        <!-- Stílus/Komponens választó -->
        <div v-if="slot.options && slot.options.length > 1" class="custom-select-wrapper">
          <select 
            @change="handleStyleChange(slot.id, ($event.target as HTMLSelectElement).value)"
            class="custom-select"
          >
            <option 
              v-for="componentId in slot.options" 
              :key="componentId" 
              :value="componentId"
              :selected="componentId === selectionStore.selectedObject.userData.componentState[slot.id]"
            >
              {{ getComponent(componentId)?.name ?? componentId }}
            </option>
          </select>
          <div class="select-arrow">
             <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
        
        <!-- Anyagválasztó -->
        <div 
          v-if="slot.materialTarget || selectedComponentForSlot(slot.id)?.materialTarget" 
          class="mt-2 custom-select-wrapper"
        >
          <select 
            @change="handleMaterialChange(slot.id, ($event.target as HTMLSelectElement).value)"
            class="custom-select"
          >
            <option value="">Válasszon anyagot...</option>
            <option 
              v-for="material in availableMaterials" 
              :key="material.id" 
              :value="material.id"
              :selected="material.id === selectionStore.selectedObject.userData.materialState[slot.id]"
            >
              {{ material.name }}
            </option>
          </select>
          <div class="select-arrow">
             <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
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