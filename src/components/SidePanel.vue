<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
// Importáljuk a teljes bútor adatbázist is
import { globalMaterials, furnitureDatabase } from '@/config/furniture'
import { availableMaterials } from '@/config/materials'

const settingsStore = useSettingsStore()

function handleGlobalMaterialChange(settingId: string, materialId: string) {
  settingsStore.setGlobalMaterial(settingId, materialId)
}

// ÚJ: Függvény a globális stílusváltás kezelésére
function handleGlobalStyleChange(settingId: string, styleId: string) {
  settingsStore.setGlobalStyle(settingId, styleId)
}

// ÚJ: Segédfüggvény, ami összegyűjti az összes lehetséges stílus-opciót egy adott slothoz
// (Mivel a különböző bútoroknak lehetnek különböző opcióik, egyelőre az első bútorét vesszük alapul)
function getStyleOptionsForSlot(slotId: string) {
  return furnitureDatabase[0]?.componentSlots.find(slot => slot.id === slotId)?.styleOptions || []
}
</script>

<template>
  <div class="fixed top-0 left-0 h-screen w-80 bg-gray-800 text-gray-300 p-4 border-r border-gray-700 shadow-lg space-y-8 overflow-y-auto">
    
    <!-- 1. Szekció: Logó és Programnév -->
    <div>
      <h1 class="text-2xl font-bold text-white">Bútortervező</h1>
      <p class="text-sm text-gray-400">Verzió 0.1</p>
    </div>

    <!-- 2. Szekció: Bútorválasztó -->
    <div class="border-t border-gray-700 pt-4">
      <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Új Elem Hozzáadása</h2>
      <p class="text-sm text-gray-500 italic">(Hamarosan...)</p>
    </div>

    <!-- 3. Szekció: Globális Anyagválasztók -->
    <div class="border-t border-gray-700 pt-4">
      <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Globális Anyagok</h2>
      
      <div class="space-y-4">
        <div v-for="setting in globalMaterials" :key="setting.id">
          <label class="block text-sm font-light text-gray-300 mb-1">{{ setting.name }}</label>
          <div class="relative">
            <select 
              :value="settingsStore.globalMaterialSettings[setting.id]"
              @change="handleGlobalMaterialChange(setting.id, ($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            >
              <option v-for="material in availableMaterials" :key="material.id" :value="material.id">
                {{ material.name }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Szekció: Globális Stílusok -->
    <div class="border-t border-gray-700 pt-4">
      <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Globális Stílusok</h2>
      <div class="space-y-4">
        
        <!-- Front Stílus -->
        <div>
          <label class="block text-sm font-light text-gray-300 mb-1">Frontok</label>
          <div class="relative">
            <select 
              :value="settingsStore.globalStyleSettings['front']"
              @change="handleGlobalStyleChange('front', ($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            >
              <option v-for="style in getStyleOptionsForSlot('front')" :key="style.id" :value="style.id">
                {{ style.name }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <!-- Láb Stílus -->
        <div>
          <label class="block text-sm font-light text-gray-300 mb-1">Lábak</label>
          <div class="relative">
            <select 
              :value="settingsStore.globalStyleSettings['lab']"
              @change="handleGlobalStyleChange('lab', ($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            >
              <option v-for="style in getStyleOptionsForSlot('lab')" :key="style.id" :value="style.id">
                {{ style.name }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <!-- Fogantyú Stílus -->
        <div>
          <label class="block text-sm font-light text-gray-300 mb-1">Fogantyúk</label>
          <div class="relative">
            <select 
              :value="settingsStore.globalStyleSettings['fogantyu']"
              @change="handleGlobalStyleChange('fogantyu', ($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none bg-gray-700 border border-gray-600 text-gray-300 text-sm rounded-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            >
              <option v-for="style in getStyleOptionsForSlot('fogantyu')" :key="style.id" :value="style.id">
                {{ style.name }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>