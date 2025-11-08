<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useExperienceStore } from '@/stores/experience';
import { computed } from 'vue';
import type { FurnitureConfig } from '@/three/Managers/ConfigManager';

const settingsStore = useSettingsStore()
const experienceStore = useExperienceStore();

const furnitureList = computed(() => {
  return experienceStore.instance?.configManager.getFurnitureList() || [];
});

const furnitureCategories = computed(() => {
  const categories: Record<string, { name: string, items: FurnitureConfig[] }> = {
    'bottom_cabinets': { name: 'Alsó szekrények', items: [] },
    'top_cabinets': { name: 'Felső szekrények', items: [] },
  };

  for (const furniture of furnitureList.value) {
    // JAVÍTÁS: A kategóriát egy változóba mentjük.
    const category = categories[furniture.category];
    
    // JAVÍTÁS: Most már a változót ellenőrizzük.
    // Ha a 'category' létezik (nem undefined), akkor a TypeScript már tudja,
    // hogy a következő sorban biztonságosan használhatjuk.
    if (category) {
      category.items.push(furniture);
    }
  }
  return Object.values(categories).filter(c => c.items.length > 0);
});

// A globális stílusválasztáshoz kapcsolódó, már nem használt függvényeket töröltük.
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
        
        

        <!-- JAVÍTÁS: A globális stílusválasztó szekciót teljesen eltávolítottuk,
             mivel a logikája a <script> részből is törölve lett.
             Ezt később, az új adatstruktúrával összhangban kell újraépíteni. -->

      </div>
    </div>
    
    <!-- 3. Szekció: Bútorválasztó -->
    <div class="flex-grow border-t border-panel-border pt-4 flex flex-col" style="min-height: 360px;">
      <h2 class="section-header mb-4 flex-shrink-0">Új Elem Hozzáadása</h2>
      
      <div class="flex-grow overflow-y-auto pr-2 furniture-category space-y-4">
        
        <div v-for="category in furnitureCategories" :key="category.name">
          <h3 class="text-sm font-semibold text-text-primary mb-2">{{ category.name }}</h3>
          
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