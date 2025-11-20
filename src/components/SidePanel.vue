<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import { availableMaterials } from '@/config/materials';
import type { GlobalSettingConfig } from '@/config/furniture';

import IconRefresh from '@/assets/icons/refresh.svg?component';
import IconAlsoszekrenyAjtos from '@/assets/icons/alsoszekreny-ajtos.svg?component';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();
const experienceStore = useExperienceStore();

const settingLayout = [
  { label: 'Korpusz / Munkapult', leftId: 'global_corpus_material', rightId: 'global_worktop_material' },
  { label: 'Frontok', leftId: 'global_front_style', rightId: 'global_front_material' },
  { label: 'Lábak', leftId: 'global_leg_style', rightId: 'global_leg_material' },
  { label: 'Fogantyúk', leftId: 'global_handle_style', rightId: 'global_handle_material' },
];

const layoutRows = computed(() => {
  return settingLayout.map(rowLayout => {
    const leftSetting = configStore.globalSettings.find(s => s.id === rowLayout.leftId);
    const rightSetting = configStore.globalSettings.find(s => s.id === rowLayout.rightId);
    return { ...rowLayout, left: leftSetting, right: rightSetting };
  });
});

function getComponentName(componentId: string): string {
  return configStore.getComponentById(componentId)?.name ?? componentId;
}

async function updateSetting(setting: GlobalSettingConfig, value: string) {
  if (!value) return;
  if (setting.type === 'style') {
    settingsStore.setGlobalStyle(setting.targetSlotId, value);
    await experienceStore.instance?.updateGlobalStyles();
  } else if (setting.type === 'material') {
    settingsStore.setGlobalMaterial(setting.targetSlotId, value);
    await experienceStore.instance?.updateGlobalMaterials();
  }
}

function reapplyRow(row: (typeof layoutRows.value)[0]) {
  if (row.left) {
      const val = row.left.type === 'style' ? settingsStore.globalStyleSettings[row.left.targetSlotId] : settingsStore.globalMaterialSettings[row.left.targetSlotId];
      if(val) updateSetting(row.left, val);
  }
  if (row.right) {
      const val = settingsStore.globalMaterialSettings[row.right.targetSlotId];
      if(val) updateSetting(row.right, val);
  }
}
</script>

<template>
  <div @mousedown.stop class="fixed top-0 left-0 h-screen w-80 bg-[#1e1e1e] border-r border-gray-800 flex flex-col shadow-2xl z-40">
    
    <!-- 1. Header -->
    <div class="p-6 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent">
      <h1 class="text-2xl font-bold text-white tracking-tight">Bútortervező</h1>
      <p class="text-xs text-blue-400 font-mono mt-1">v1.0.0 BETA</p>
    </div>

    <!-- 2. Globális Beállítások -->
    <div class="flex-shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar" style="max-height: 50vh;">
      <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Globális Beállítások</h2>
      
      <div v-for="row in layoutRows" :key="row.label" class="space-y-2">
        <label class="text-sm font-medium text-gray-300">{{ row.label }}</label>
        
        <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
          
          <!-- Bal oldali -->
          <div v-if="row.left" class="relative group">
            <select 
              @change="updateSetting(row.left!, ($event.target as HTMLSelectElement).value)" 
              class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-6 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
            >
              <template v-if="row.left.type === 'style' && row.left.options">
                <option v-for="styleId in row.left.options" :key="styleId" :value="styleId" :selected="settingsStore.globalStyleSettings[row.left.targetSlotId] === styleId">
                  {{ getComponentName(styleId) }}
                </option>
              </template>
              <template v-if="row.left.type === 'material'">
                 <option v-for="material in availableMaterials" :key="material.id" :value="material.id" :selected="settingsStore.globalMaterialSettings[row.left.targetSlotId] === material.id">
                  {{ material.name }}
                </option>
              </template>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
               <svg class="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          <div v-else></div>

          <!-- Jobb oldali -->
          <div v-if="row.right" class="relative group">
             <select 
              @change="updateSetting(row.right!, ($event.target as HTMLSelectElement).value)" 
              class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-6 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
            >
              <template v-if="row.right.type === 'material'">
                 <option v-for="material in availableMaterials" :key="material.id" :value="material.id" :selected="settingsStore.globalMaterialSettings[row.right.targetSlotId] === material.id">
                  {{ material.name }}
                </option>
              </template>
            </select>
             <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
               <svg class="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          <div v-else class="w-full bg-transparent"></div>

          <!-- Frissítés -->
          <button @click="reapplyRow(row)" class="p-2 text-gray-500 hover:text-blue-400 transition-colors" title="Újraalkalmazás">
            <IconRefresh class="w-4 h-4" />
          </button>
          
        </div>
      </div>
    </div>
    
    <!-- 3. Bútorválasztó -->
    <div class="flex-grow border-t border-gray-800 bg-[#1a1a1a] flex flex-col overflow-hidden">
      <div class="p-4 pb-2">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Elemek</h2>
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
                  <!-- JAVÍTÁS: (furniture as any) használata a TS hiba ellen -->
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