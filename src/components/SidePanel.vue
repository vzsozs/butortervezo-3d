<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { globalMaterials, furnitureDatabase } from '@/config/furniture'
import { availableMaterials } from '@/config/materials'

const settingsStore = useSettingsStore()

function handleGlobalMaterialChange(settingId: string, materialId: string) {
  settingsStore.setGlobalMaterial(settingId, materialId)
}

function handleGlobalStyleChange(settingId: string, styleId: string) {
  settingsStore.setGlobalStyle(settingId, styleId)
}

// JAVÍTÁS: A függvény most már az összes bútorból kigyűjti a slotot
function getStyleOptionsForSlot(slotId: string) {
  // Egyelőre az első kategória első bútorát használjuk referenciaként
  const referenceFurniture = furnitureDatabase[0]?.items[0];
  return referenceFurniture?.componentSlots.find(slot => slot.id === slotId)?.styleOptions || []
}
</script>

<template>
  <div @mousedown.stop class="panel top-0 left-0 h-screen w-80 flex flex-col space-y-4 overflow-y-auto">
    
    <!-- 1. Szekció: Logó -->
    <div class="flex-shrink-0">
      <h1 class="text-2xl font-bold text-white">Bútortervező</h1>
      <p class="text-sm text-text-secondary">Verzió 0.1</p>
    </div>

    <!-- 2. Szekció: Globális Beállítások -->
    <div class="flex-shrink-0 border-t border-panel-border pt-4">
      <h2 class="section-header">Globális Beállítások</h2>
      
      <div class="grid grid-cols-2 gap-x-2 gap-y-2">
        
        <!-- Globális Anyagok -->
        <div v-for="setting in globalMaterials" :key="setting.id">
          <label class="input-label">{{ setting.name }}</label>
          <div class="custom-select-wrapper">
            <select 
              :value="settingsStore.globalMaterialSettings[setting.id]"
              @change="handleGlobalMaterialChange(setting.id, ($event.target as HTMLSelectElement).value)"
              class="custom-select"
            >
              <option v-for="material in availableMaterials" :key="material.id" :value="material.id">{{ material.name }}</option>
            </select>
            <div class="select-arrow">
              <svg class="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <!-- Globális Stílusok -->
        <div v-for="slotId in ['front', 'lab', 'fogantyu']" :key="slotId">
          <label class="input-label">{{ furnitureDatabase[0]?.items[0]?.componentSlots.find(s => s.id === slotId)?.name }} Stílus</label>
          <div class="custom-select-wrapper">
            <select 
              :value="settingsStore.globalStyleSettings[slotId]"
              @change="handleGlobalStyleChange(slotId, ($event.target as HTMLSelectElement).value)"
              class="custom-select"
            >
              <option v-for="style in getStyleOptionsForSlot(slotId)" :key="style.id" :value="style.id">{{ style.name }}</option>
            </select>
            <div class="select-arrow">
              <svg class="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 3. Szekció: Bútorválasztó (TELJESEN ÚJ) -->
    <div class="flex-grow border-t border-panel-border pt-4 flex flex-col" style="min-height: 360px;">
      <h2 class="section-header mb-4 flex-shrink-0">Új Elem Hozzáadása</h2>
      
      <!-- A görgethető tartalom konténere -->
      <div class="flex-grow overflow-y-auto pr-2 space-y-4">
        
        <!-- Végigiterálunk a kategóriákon ("mappákon") -->
        <div v-for="category in furnitureDatabase" :key="category.id">
          <h3 class="text-sm font-semibold text-text-primary mb-2">{{ category.name }}</h3>
          
          <!-- Rács a bútoroknak -->
          <div class="grid grid-cols-2 gap-2">
            <!-- Végigiterálunk a kategória elemein -->
            <div v-for="furniture in category.items" :key="furniture.id">
              <button 
                @click="settingsStore.setActiveFurniture(furniture.id)"
                class="w-full rounded-md border-2 p-2 space-y-2 transition-colors duration-150"
                :class="settingsStore.activeFurnitureId === furniture.id ? 'bg-yellow-500/20 border-yellow-500' : 'bg-gray-700/50 border-transparent hover:border-gray-500'"
              >
                <!-- Nagy Ikon Helye -->
                <div class="aspect-square w-full bg-gray-600 rounded flex items-center justify-center">
                  <span class="text-xs text-gray-400">Ikon</span>
                </div>
                <!-- Leírás -->
                <p class="text-xs font-light text-text-primary text-center">{{ furniture.name }}</p>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>