<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config'; // JAVÍTÁS
import { availableMaterials } from '@/config/materials';
import type { GlobalSettingConfig } from '@/config/furniture';

const settingsStore = useSettingsStore();
const configStore = useConfigStore(); // JAVÍTÁS

// A getComponentName most már a configStore-t használja
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

    <!-- Globális Beállítások -->
    <div class="flex-shrink-0 border-t border-panel-border pt-4">
      <h2 class="section-header">Globális Beállítások</h2>
      <div class="space-y-4 mt-4">
        <!-- JAVÍTÁS: A globalSettings a configStore-ból jön -->
        <div v-for="setting in configStore.globalSettings" :key="setting.id">
          <label class="input-label mb-2">{{ setting.name }}</label>

          <!-- Globális Stílusválasztó -->
          <div v-if="setting.type === 'style' && setting.options" class="custom-select-wrapper">
            <select @change="handleGlobalChange(setting, ($event.target as HTMLSelectElement).value)" class="custom-select">
              <option value="">Válasszon stílust...</option>
              <option 
                v-for="styleId in setting.options" 
                :key="styleId" 
                :value="styleId"
                :selected="settingsStore.globalStyleSettings[setting.targetSlotId] === styleId"
              >
                {{ getComponentName(styleId) }}
              </option>
            </select>
            <div class="select-arrow">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>

          <!-- Globális Anyagválasztó -->
          <div v-if="setting.type === 'material'" class="custom-select-wrapper">
            <select @change="handleGlobalChange(setting, ($event.target as HTMLSelectElement).value)" class="custom-select">
              <option value="">Válasszon anyagot...</option>
              <option 
                v-for="material in availableMaterials" 
                :key="material.id" 
                :value="material.id"
                :selected="settingsStore.globalMaterialSettings[setting.targetSlotId] === material.id"
              >
                {{ material.name }}
              </option>
            </select>
            <div class="select-arrow">
              <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Bútorválasztó -->
    <div class="flex-grow border-t border-panel-border pt-4 flex flex-col" style="min-height: 360px;">
      <h2 class="section-header mb-4 flex-shrink-0">Új Elem Hozzáadása</h2>
      <div class="flex-grow overflow-y-auto pr-2 furniture-category space-y-4">
        <!-- JAVÍTÁS: A furnitureCategories a configStore-ból jön -->
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
                    <!-- Ide jöhet majd egy kép vagy ikon a bútorról -->
                    <span class="text-xs text-gray-400">Ikon</span>
                  </div>
                  <div class="flex flex-col">
                    <p class="text-sm font-semibold text-text-primary">{{ furniture.name }}</p>
                    <!-- Ide jöhetne egy rövid leírás, ha lenne -->
                    <!-- <p class="text-xs text-text-secondary">Leírás...</p> -->
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