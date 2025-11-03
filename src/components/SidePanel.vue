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
    
    <!-- 3. Szekció: Bútorválasztó -->
    <div class="flex-grow border-t border-panel-border pt-4 flex flex-col" style="min-height: 360px;">
      <h2 class="section-header mb-4 flex-shrink-0">Új Elem Hozzáadása</h2>
      
      <!-- JAVÍTÁS: A sötétebb háttér és a görgetés most a külső konténeren van -->
      <div class="flex-grow overflow-y-auto pr-2 furniture-category space-y-4">
        
        <!-- Végigiterálunk a kategóriákon -->
        <div v-for="category in furnitureDatabase" :key="category.id">
          <h3 class="text-sm font-semibold text-text-primary mb-2">{{ category.name }}</h3>
          
          <!-- JAVÍTÁS: A gridet egyetlen oszloposra állítjuk -->
          <div class="grid grid-cols-1 gap-2">
            <div v-for="furniture in category.items" :key="furniture.id">
              <button 
                @click="settingsStore.setActiveFurniture(furniture.id)"
                class="furniture-button"
                :class="{ 'furniture-button-active': settingsStore.activeFurnitureId === furniture.id }"
              >
                <div class="flex items-start space-x-2">
                  <div class="flex-shrink-0 w-12 h-12 bg-gray-600 rounded flex items-center justify-center">
                    <span class="text-xs text-gray-400">Ikon</span>
                  </div>
                  <div class="flex flex-col">
                    <p class="text-xs font-semibold text-text-primary">{{ furniture.name }}</p>
                    <p class="text-xxs font-light text-text-secondary">60 x 85 x 60 cm</p>
                    <p class="text-xxs font-light text-text-secondary mt-1">Rövid leírás ide...</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>