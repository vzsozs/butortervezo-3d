<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { useProceduralStore } from '@/stores/procedural';
import type { GlobalGroupConfig } from '@/config/furniture';

// Ikonok
import IconAlsoszekrenyAjtos from '@/assets/icons/alsoszekreny-ajtos.svg?component';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();
const proceduralStore = useProceduralStore();
const appVersion = __APP_VERSION__;

// --- ANYAGOK SZŰRÉSE ---
function getMaterialsForGroup(group: GlobalGroupConfig) {
  const allowedCategories = group.material.allowedCategories || [];
  if (allowedCategories.length > 0) {
    return configStore.materials.filter(m => {
      const matCats = Array.isArray(m.category) ? m.category : [m.category];
      return matCats.some(c => allowedCategories.includes(c));
    });
  }
  return configStore.materials;
}

// --- UPDATE HANDLERS ---
function updateMaterial(groupId: string, materialId: string) {
  settingsStore.setGlobalMaterial(groupId, materialId);
}

function updateStyle(groupId: string, variantId: string) {
  settingsStore.setGlobalComponentStyle(groupId, variantId);
}

// --- HELPER: LÁB ELLENŐRZÉS ---
function isStandardLegSelected(group: GlobalGroupConfig): boolean {
  // 1. Megnézzük, melyik variáció van kiválasztva (pl. "var_12345")
  const selectedVariantId = settingsStore.globalComponentSettings[group.id];

  if (!selectedVariantId) return false; // Ha nincs semmi kiválasztva

  // 2. Megkeressük ezt a variációt a csoport definíciójában
  const variant = group.style.variants.find(v => v.id === selectedVariantId);

  if (!variant) return false; // Ha valamiért nem találjuk

  // 3. Megnézzük, hogy ez a variáció a 'leg_standard' komponenst tartalmazza-e
  // (Mivel a componentIds egy tömb)
  return variant.componentIds.includes('leg_standard');
}

</script>

<template>
  <div @mousedown.stop
    class="fixed top-0 left-0 h-screen w-80 bg-[#1e1e1e] border-r border-gray-800 flex flex-col shadow-2xl z-40">

    <!-- 1. HEADER -->
    <div class="p-6 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent">
      <h1 class="text-2xl font-bold text-white tracking-tight">Bútortervező</h1>
      <p class="text-xs text-blue-400 font-mono mt-1">{{ appVersion }}</p>
    </div>

    <!-- 2. GLOBÁLIS BEÁLLÍTÁSOK -->
    <div class="flex-shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar" style="max-height: 60vh;">
      <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Globális Beállítások</h2>

      <div v-if="configStore.globalGroups.length === 0" class="text-gray-500 text-sm italic">
        Nincsenek beállítások.
      </div>

      <!-- CSOPORT LISTA (V-FOR CIKLUS KEZDŐDIK) -->
      <div v-for="group in configStore.globalGroups" :key="group.id"
        class="space-y-2 pb-4 border-b border-gray-800 last:border-0">

        <!-- Csoport Cím -->
        <h3 class="text-sm font-bold text-white capitalize flex items-center mb-2">
          <span class="w-1 h-4 bg-blue-500 rounded-full mr-2"></span>
          {{ group.name }}
        </h3>

        <!-- GRID: Balra (Stílus VAGY Vastagság), Jobbra (Anyag) -->
        <div class="grid gap-2"
          :class="((group.style.enabled || (group.construction?.enabled && group.targets.includes('worktops'))) && group.material.enabled) ? 'grid-cols-2' : 'grid-cols-1'">

          <!-- BAL OLDAL 1: STÍLUS VÁLASZTÓ (Ha van stílus) -->
          <div v-if="group.style.enabled">
            <div class="relative group">
              <select :value="settingsStore.globalComponentSettings[group.id] || ''"
                @change="updateStyle(group.id, ($event.target as HTMLSelectElement).value)"
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                <option value="" disabled>Válassz stílust...</option>
                <option v-for="variant in group.style.variants" :key="variant.id" :value="variant.id">
                  {{ variant.name }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- BAL OLDAL 2: VASTAGSÁG VÁLASZTÓ (Ha munkapult és nincs stílus) -->
          <div v-else-if="group.construction?.enabled && group.targets.includes('worktops')">
            <div class="relative group">
              <select v-model="proceduralStore.worktop.thickness"
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                <option v-for="thickness in group.construction.thicknessOptions" :key="thickness" :value="thickness">
                  {{ (thickness * 1000).toFixed(0) }} mm
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- JOBB OLDAL: ANYAG VÁLASZTÓ -->
          <div v-if="group.material.enabled">
            <div class="relative group">
              <select :value="settingsStore.globalMaterialSettings[group.id] || ''"
                @change="updateMaterial(group.id, ($event.target as HTMLSelectElement).value)"
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-4 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                <option value="" disabled>Válassz anyagot...</option>
                <option v-for="mat in getMaterialsForGroup(group)" :key="mat.id" :value="mat.id">
                  {{ mat.name }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <!-- C) KONSTRUKCIÓS CSÚSZKA (LÁBAZAT MAGASSÁG) -->
        <div v-if="group.construction?.enabled && isStandardLegSelected(group)"
          class="mt-3 p-3 bg-gray-800/50 rounded border border-gray-700 animate-fade-in">

          <div class="flex justify-between mb-1">
            <label class="text-xs font-bold text-gray-300">Lábazat Magassága</label>
            <span class="text-xs text-blue-400 font-mono">
              {{ (proceduralStore.plinth.height * 100).toFixed(1) }} cm
            </span>
          </div>

          <input type="range" :min="group.construction.minHeight || 0.05" :max="group.construction.maxHeight || 0.20"
            step="0.005" v-model="proceduralStore.plinth.height"
            class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400" />

          <div class="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>{{ ((group.construction.minHeight || 0.05) * 100).toFixed(0) }}cm</span>
            <span>{{ ((group.construction.maxHeight || 0.20) * 100).toFixed(0) }}cm</span>
          </div>
        </div>

      </div>

    </div>

    <!-- 3. BÚTORVÁLASZTÓ (Változatlan) -->
    <div class="flex-grow border-t border-gray-800 bg-[#1a1a1a] flex flex-col overflow-hidden">
      <div class="p-4 pb-2">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Elemek hozzáadása</h2>
      </div>

      <div class="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar">
        <div v-for="category in configStore.furnitureCategories" :key="category.name">
          <h3 class="text-sm font-semibold text-gray-300 mb-3 pl-1 border-l-2 border-blue-500">{{ category.name }}</h3>
          <div class="grid grid-cols-1 gap-3">
            <div v-for="furniture in category.items" :key="furniture.id">
              <button @click="settingsStore.setActiveFurnitureId(furniture.id)"
                class="w-full group relative flex items-center p-2 rounded-lg border border-gray-700 bg-[#252525] hover:bg-[#2f2f2f] hover:border-gray-600 transition-all duration-200"
                :class="{ 'ring-2 ring-blue-500 border-transparent': settingsStore.activeFurnitureId === furniture.id }">
                <div
                  class="flex-shrink-0 w-12 h-12 bg-gray-800 rounded flex items-center justify-center mr-3 group-hover:scale-105 transition-transform">
                  <IconAlsoszekrenyAjtos v-if="furniture.id.includes('also')"
                    class="w-8 h-8 text-gray-500 group-hover:text-blue-400 transition-colors" />
                  <span v-else class="text-xs text-gray-600">IMG</span>
                </div>
                <div class="flex flex-col items-start">
                  <span class="text-sm font-medium text-gray-200 group-hover:text-white">{{ furniture.name }}</span>
                  <span class="text-xs text-gray-500">{{ (furniture as any).dimensions?.width || '?' }}cm széles</span>
                </div>

                <div
                  class="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 font-bold text-lg">
                  +</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #60a5fa;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
