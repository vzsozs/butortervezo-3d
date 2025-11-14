<!-- src/components/SidePanel.vue -->
<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { computed } from 'vue';
import { availableMaterials } from '@/config/materials';
import type { GlobalSettingConfig } from '@/config/furniture';

import IconRefresh from '@/assets/icons/refresh.svg?component';
import IconAlsoszekrenyAjtos from '@/assets/icons/alsoszekreny-ajtos.svg?component';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();

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

// Ez a függvény frissíti a store-t, a @change esemény hívja
function updateSetting(setting: GlobalSettingConfig, value: string) {
  if (!value) return;
  // Itt csak a store-t frissítjük, a watch-ra bízva a cserét
  if (setting.type === 'style') {
    if (settingsStore.globalStyleSettings[setting.targetSlotId] !== value) {
      settingsStore.setGlobalStyle(setting.targetSlotId, value);
    }
  } else if (setting.type === 'material') {
    if (settingsStore.globalMaterialSettings[setting.targetSlotId] !== value) {
      settingsStore.setGlobalMaterial(setting.targetSlotId, value);
    }
  }
}

// A gomb ezt a függvényt hívja, ami "kikényszeríti" a frissítést
function forceApplyRow(row: (typeof layoutRows.value)[0]) {
  console.log(`[SidePanel] Frissítés kényszerítése a(z) '${row.label}' sorra.`);
  
  // =================================================================
  // === JAVÍTÁS: Az új "force" action-ök használata ==================
  // =================================================================

  // Bal oldali beállítás kényszerítése
  if (row.left) {
    if (row.left.type === 'style') {
      settingsStore.forceGlobalStyle(row.left.targetSlotId);
    } else { // type === 'material'
      settingsStore.forceGlobalMaterial(row.left.targetSlotId);
    }
  }

  // Jobb oldali beállítás kényszerítése
  if (row.right) {
    // A jobb oldalon csak anyagválasztó lehet a jelenlegi layout szerint
    settingsStore.forceGlobalMaterial(row.right.targetSlotId);
  }
}

</script>

<template>
  <div @mousedown.stop class="panel top-0 left-0 h-screen w-80 flex flex-col space-y-4 overflow-y-auto">
    
    <!-- 1. Szekció: Logó -->
    <div class="flex-shrink-0">
      <h1 class="text-2xl font-bold text-white">Bútortervező</h1>
      <p class="text-sm text-text-secondary">Verzió 0.1</p>
    </div>

    <!-- 2. Szekció: Globális Beállítások (JAVÍTOTT ELRENDEZÉS) -->
    <div class="flex-shrink-0 border-t border-panel-border pt-4">
      <h2 class="section-header">Globális Beállítások</h2>
      
      <div class="space-y-4 mt-4">
        <div v-for="row in layoutRows" :key="row.label">
          <label class="input-label mb-2">{{ row.label }}</label>
          
          <!-- Egy grid konténer a két select-nek és a gombnak -->
          <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            
            <!-- Bal oldali select -->
            <div v-if="row.left" class="custom-select-wrapper">
              <select @change="updateSetting(row.left, ($event.target as HTMLSelectElement).value)" class="custom-select">
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
              <div class="select-arrow">
                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
            <div v-else></div> <!-- Üres cella, ha nincs bal oldali elem -->

            <!-- Jobb oldali select -->
            <div v-if="row.right" class="custom-select-wrapper">
               <select @change="updateSetting(row.right, ($event.target as HTMLSelectElement).value)" class="custom-select">
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
            <div v-else class="custom-select-wrapper">
              <select class="custom-select" disabled><option>Anyag...</option></select>
            </div>

            <!-- Frissítés gomb a sor végén -->
            <button @click="forceApplyRow(row)" class="btn-icon" title="Sor beállításainak alkalmazása mindenre">
              <IconRefresh class="w-5 h-5" />
            </button>
            
          </div> <!-- A grid konténer itt záródik be helyesen -->
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
                    <IconAlsoszekrenyAjtos v-if="furniture.id === 'also_szekreny_60'" class="w-12 h-12 text-gray-400" />
                    <span v-else class="text-xs text-gray-400">Ikon</span>
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