<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { computed } from 'vue';
import { availableMaterials } from '@/config/materials';
import type { GlobalSettingConfig } from '@/config/furniture';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();

// JAVÍTÁS: Létrehozunk egy "tervrajzot" a globális beállítások elrendezéséhez.
// Ez határozza meg a sorokat, a címkéket, és hogy melyik beállítás hova kerül.
const settingLayout = [
  { label: 'Korpusz / Munkapult', leftId: 'global_corpus_material', rightId: 'global_worktop_material' },
  { label: 'Frontok', leftId: 'global_front_style', rightId: 'global_front_material' },
  { label: 'Lábak', leftId: 'global_leg_style', rightId: 'global_leg_material' },
  { label: 'Fogantyúk', leftId: 'global_handle_style', rightId: 'global_handle_material' },
];

// JAVÍTÁS: Ez a computed property most már a 'settingLayout' alapján építi fel a sorokat.
const layoutRows = computed(() => {
  return settingLayout.map(rowLayout => {
    // A 'find' metódus 'undefined'-et ad vissza, ha nincs találat, ami tökéletes nekünk.
    const leftSetting = configStore.globalSettings.find(s => s.id === rowLayout.leftId);
    const rightSetting = configStore.globalSettings.find(s => s.id === rowLayout.rightId);
    return {
      ...rowLayout,
      left: leftSetting,
      right: rightSetting
    };
  });
});

function getComponentName(componentId: string): string {
  return configStore.getComponentById(componentId)?.name ?? componentId;
}

function handleGlobalChange(setting: GlobalSettingConfig, value: string) {
  if (!value) return;
  if (setting.type === 'style') {
    settingsStore.setGlobalStyle(setting.targetSlotId, value);
  } else if (setting.type === 'material') {
    settingsStore.setGlobalMaterial(setting.targetSlotId, value);
  }
}
</script>

<template>
  <div @mousedown.stop class="panel top-0 left-0 h-screen w-80 flex flex-col space-y-4 overflow-y-auto">
    
    <!-- 1. Szekció: Logó (VÁLTOZATLAN) -->
    <div class="flex-shrink-0">
      <h1 class="text-2xl font-bold text-white">Bútortervező</h1>
      <p class="text-sm text-text-secondary">Verzió 0.1</p>
    </div>

    <!-- 2. Szekció: Globális Beállítások (ÁTÉPÍTVE) -->
    <div class="flex-shrink-0 border-t border-panel-border pt-4">
      <h2 class="section-header">Globális Beállítások</h2>
      
      <div class="space-y-4 mt-4">
        <!-- Az új, 'layoutRows' listán megyünk végig -->
        <div v-for="row in layoutRows" :key="row.label">
          <label class="input-label mb-2">{{ row.label }}</label>
          
          <div class="setting-group-grid">
            
            <!-- Bal oldali oszlop -->
            <div>
              <div v-if="row.left" class="custom-select-wrapper">
                <select @change="handleGlobalChange(row.left, ($event.target as HTMLSelectElement).value)" class="custom-select">
                  <option value="">{{ row.left.type === 'style' ? 'Stílus...' : 'Anyag...' }}</option>
                  <!-- Stílus opciók -->
                  <template v-if="row.left.type === 'style' && row.left.options">
                    <option v-for="styleId in row.left.options" :key="styleId" :value="styleId" :selected="settingsStore.globalStyleSettings[row.left.targetSlotId] === styleId">
                      {{ getComponentName(styleId) }}
                    </option>
                  </template>
                  <!-- Anyag opciók -->
                  <template v-if="row.left.type === 'material'">
                     <option v-for="material in availableMaterials" :key="material.id" :value="material.id" :selected="settingsStore.globalMaterialSettings[row.left.targetSlotId] === material.id">
                      {{ material.name }}
                    </option>
                  </template>
                </select>
                <div class="select-arrow">
                  <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            <!-- Jobb oldali oszlop -->
            <div>
              <div v-if="row.right" class="custom-select-wrapper">
                <select @change="handleGlobalChange(row.right, ($event.target as HTMLSelectElement).value)" class="custom-select">
                  <option value="">{{ row.right.type === 'style' ? 'Stílus...' : 'Anyag...' }}</option>
                  <!-- Stílus opciók -->
                  <template v-if="row.right.type === 'style' && row.right.options">
                    <option v-for="styleId in row.right.options" :key="styleId" :value="styleId" :selected="settingsStore.globalStyleSettings[row.right.targetSlotId] === styleId">
                      {{ getComponentName(styleId) }}
                    </option>
                  </template>
                  <!-- Anyag opciók -->
                  <template v-if="row.right.type === 'material'">
                     <option v-for="material in availableMaterials" :key="material.id" :value="material.id" :selected="settingsStore.globalMaterialSettings[row.right.targetSlotId] === material.id">
                      {{ material.name }}
                    </option>
                  </template>
                </select>
                <div class="select-arrow">
                  <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
              <!-- Speciális eset a Munkapultnak, ami inaktív -->
              <div v-else-if="row.rightId === 'global_worktop_material'" class="custom-select-wrapper">
                 <select class="custom-select" disabled>
                   <option>Anyag...</option>
                 </select>
                 <div class="select-arrow">
                    <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                 </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
    
    <!-- 3. Szekció: Bútorválasztó -->
    <div class="flex-grow border-t border-panel-border pt-4 flex flex-col" style="min-height: 360px;">
      <h2 class="section-header mb-4 flex-shrink-0">Új Elem Hozzáadása</h2>
      <div class="flex-grow overflow-y-auto pr-2 furniture-category space-y-4">
        <div v-for="category in configStore.furnitureCategories" :key="category.name">
          <h3 class="text-sm font-semibold text-text-primary mb-2">{{ category.name }}</h3>
          <div class="grid grid-cols-1 gap-2">
            <div v-for="furniture in category.items" :key="furniture.id">
              <button 
                @click="settingsStore.setActiveFurnitureId(furniture.id)"
                class="furniture-button"
                :class="{ 'furniture-button-active': settingsStore.activeFurnitureId === furniture.id }"
              >
                <div class="flex items-start space-x-2 text-left">
                  <div class="flex-shrink-0 w-12 h-12 bg-gray-600 rounded flex items-center justify-center">
                    <span class="text-xs text-gray-400">Ikon</span>
                  </div>
                  <div class="flex flex-col">
                    <p class="text-sm font-semibold text-text-primary">{{ furniture.name }}</p>
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