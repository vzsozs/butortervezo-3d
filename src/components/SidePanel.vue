<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import type { GlobalSettingConfig } from '@/config/furniture';

// Ikonok
import IconRefresh from '@/assets/icons/refresh.svg?component';
import IconAlsoszekrenyAjtos from '@/assets/icons/alsoszekreny-ajtos.svg?component';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();
const experienceStore = useExperienceStore();

// --- SEGÉDFÜGGVÉNYEK ---

// Családnév szépítése (pl. "modern_stilus" -> "modern stilus")
function formatFamilyName(familyId: string): string {
  if (!familyId) return '';
  // Első betű nagy, alsóvonások cseréje
  return familyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function updateSetting(setting: GlobalSettingConfig, value: string) {
  if (!value) return;
  
  // Mentsük el a választást a Store-ba
  // (A targetSlotId mondja meg, mit vezérlünk, pl. "legs")
  settingsStore.setGlobalStyle(setting.targetSlotId, value);
  
  // Szóljunk a 3D motornak, hogy cseréljen!
  await experienceStore.instance?.updateGlobalStyles();
}

</script>

<template>
  <div @mousedown.stop class="fixed top-0 left-0 h-screen w-80 bg-[#1e1e1e] border-r border-gray-800 flex flex-col shadow-2xl z-40">
    
    <!-- 1. HEADER -->
    <div class="p-6 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent">
      <h1 class="text-2xl font-bold text-white tracking-tight">Bútortervező</h1>
      <p class="text-xs text-blue-400 font-mono mt-1">v0.6 - BÉTA</p>
    </div>

    <!-- 2. GLOBÁLIS BEÁLLÍTÁSOK (DINAMIKUS LISTA) -->
    <div class="flex-shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar" style="max-height: 50vh;">
      <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Stílus Beállítások</h2>
      
      <div v-if="configStore.globalSettings.length === 0" class="text-gray-500 text-sm italic">
        Nincsenek globális beállítások definiálva az Adminban.
      </div>

      <!-- Végigmegyünk az Adminban létrehozott szabályokon -->
      <div v-for="setting in configStore.globalSettings" :key="setting.id" class="space-y-2">
        <label class="text-sm font-medium text-gray-300 block">
          {{ setting.name }}
        </label>
        
        <div class="relative group">
          <select 
            :value="settingsStore.globalStyleSettings[setting.targetSlotId] || ''"
            @change="updateSetting(setting, ($event.target as HTMLSelectElement).value)" 
            class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-sm rounded-md py-2 pl-3 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
          >
            <option value="" disabled>Válassz stílust...</option>
            
            <!-- Az Adminban hozzáadott Családok listázása -->
            <option v-for="familyId in setting.options" :key="familyId" :value="familyId">
              {{ formatFamilyName(familyId) }}
            </option>
          </select>
          
          <!-- Nyíl ikon -->
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
             <svg class="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 3. BÚTORVÁLASZTÓ (Ez változatlan, csak a TS hibát javítottam benne) -->
    <div class="flex-grow border-t border-gray-800 bg-[#1a1a1a] flex flex-col overflow-hidden">
      <div class="p-4 pb-2">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Elemek hozzáadása</h2>
      </div>
      
      <div class="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar">
        <div v-for="category in configStore.furnitureCategories" :key="category.name">
          <h3 class="text-sm font-semibold text-gray-300 mb-3 pl-1 border-l-2 border-blue-500">{{ category.name }}</h3>
          <div class="grid grid-cols-1 gap-3">
            <div v-for="furniture in category.items" :key="furniture.id">
              <button 
                @click="settingsStore.setActiveFurnitureId(furniture.id)"
                class="w-full group relative flex items-center p-2 rounded-lg border border-gray-700 bg-[#252525] hover:bg-[#2f2f2f] hover:border-gray-600 transition-all duration-200"
                :class="{ 'ring-2 ring-blue-500 border-transparent': settingsStore.activeFurnitureId === furniture.id }"
              >
                <div class="flex-shrink-0 w-12 h-12 bg-gray-800 rounded flex items-center justify-center mr-3 group-hover:scale-105 transition-transform">
                  <IconAlsoszekrenyAjtos v-if="furniture.id.includes('also')" class="w-8 h-8 text-gray-500 group-hover:text-blue-400 transition-colors" />
                  <span v-else class="text-xs text-gray-600">IMG</span>
                </div>
                <div class="flex flex-col items-start">
                  <span class="text-sm font-medium text-gray-200 group-hover:text-white">{{ furniture.name }}</span>
                  <span class="text-xs text-gray-500">{{ (furniture as any).dimensions?.width || '?' }}cm széles</span>
                </div>
                
                <div class="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 font-bold text-lg">+</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #1e1e1e; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #60a5fa; }
</style>