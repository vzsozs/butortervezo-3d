<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useConfigStore } from '@/stores/config';
import { computed } from 'vue';
import type { GlobalSettingConfig } from '@/config/furniture';

// Ikonok
import IconAlsoszekrenyAjtos from '@/assets/icons/alsoszekreny-ajtos.svg?component';

const settingsStore = useSettingsStore();
const configStore = useConfigStore();

// --- SEGÉDFÜGGVÉNYEK ---

// Családnév szépítése (pl. "modern_stilus" -> "modern stilus")
function formatFamilyName(familyId: string): string {
  if (!familyId) return '';
  // Első betű nagy, alsóvonások cseréje
  return familyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatTargetName(slotId: string): string {
  const map: Record<string, string> = {
    'front': 'Ajtók',
    'fronts': 'Ajtók',
    'leg': 'Lábak',
    'legs': 'Lábak',
    'handle': 'Fogantyúk',
    'handles': 'Fogantyúk',
    'corpus': 'Korpusz',
    'worktop': 'Munkalap'
  };
  return map[slotId] || formatFamilyName(slotId);
}

const groupedSettings = computed(() => {
  const groups: Record<string, { targetSlotId: string, styleSetting?: GlobalSettingConfig, materialSetting?: GlobalSettingConfig }> = {};

  configStore.globalSettings.forEach(setting => {
    const target = setting.targetSlotId;
    if (!groups[target]) {
      groups[target] = { targetSlotId: target };
    }

    let type = setting.type;
    // Ha az admin "select"-et ment, próbáljuk kitalálni a nevéből
    if (type === 'select') {
      if (setting.name.toLowerCase().includes('anyag')) {
        type = 'material';
      } else {
        type = 'style';
      }
    }

    if (type === 'style') {
      groups[target].styleSetting = setting;
    } else if (type === 'material') {
      groups[target].materialSetting = setting;
    }
  });

  return Object.values(groups);
});

function getMaterialsForTarget(targetSlotId: string) {
  // 1. Megnézzük, van-e globális beállítás erre a slotra, ami korlátozza a kategóriákat
  const setting = configStore.globalSettings.find(s => s.targetSlotId === targetSlotId && s.type === 'material');

  let allowedCategories: string[] = [];

  if (setting && setting.allowedMaterialCategories && setting.allowedMaterialCategories.length > 0) {
    allowedCategories = setting.allowedMaterialCategories;
  } else {
    // 2. Ha nincs, használjuk a hardcoded mappinget (fallback)
    const categoryMap: Record<string, string> = {
      'worktop': 'Munkapult',
      'front': 'Bútorlap',
      'corpus': 'Bútorlap',
      'back_panel': 'Hátfal'
    };
    const mapped = categoryMap[targetSlotId];
    if (mapped) allowedCategories = [mapped];
  }

  // 3. Szűrés
  if (allowedCategories.length > 0) {
    return configStore.materials.filter(m => {
      const matCats = Array.isArray(m.category) ? m.category : [m.category];
      return matCats.some(c => allowedCategories.includes(c));
    });
  }

  // Ha nincs semmilyen korlátozás, visszaadjuk az összeset
  return configStore.materials;
}

async function updateSetting(setting: GlobalSettingConfig, value: string) {
  if (!value) return;

  let type = setting.type;
  if (type === 'select') {
    if (setting.name.toLowerCase().includes('anyag')) {
      type = 'material';
    } else {
      type = 'style';
    }
  }

  if (type === 'style') {
    settingsStore.setGlobalStyle(setting.targetSlotId, value);
  } else if (type === 'material') {
    settingsStore.setGlobalMaterial(setting.targetSlotId, value);
  }

  // A Store action-ök már intézik a frissítést (updateGlobalStyles vagy forceGlobalMaterial),
  // de a biztonság kedvéért itt hagyhatjuk, ha a store nem hívná meg.
  // Jelenleg a SettingsStore hívja meg őket.
}

</script>

<template>
  <div @mousedown.stop
    class="fixed top-0 left-0 h-screen w-80 bg-[#1e1e1e] border-r border-gray-800 flex flex-col shadow-2xl z-40">

    <!-- 1. HEADER -->
    <div class="p-6 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent">
      <h1 class="text-2xl font-bold text-white tracking-tight">Bútortervező</h1>
      <p class="text-xs text-blue-400 font-mono mt-1">v0.6 - BÉTA</p>
    </div>

    <!-- 2. GLOBÁLIS BEÁLLÍTÁSOK (DINAMIKUS LISTA) -->
    <div class="flex-shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar" style="max-height: 50vh;">
      <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Globális Beállítások</h2>

      <div v-if="groupedSettings.length === 0" class="text-gray-500 text-sm italic">
        Nincsenek globális beállítások definiálva.
      </div>

      <!-- CSOPORTOSÍTOTT BEÁLLÍTÁSOK -->
      <div v-for="group in groupedSettings" :key="group.targetSlotId"
        class="space-y-3 pb-4 border-b border-gray-800 last:border-0">
        <h3 class="text-sm font-bold text-white capitalize flex items-center">
          <span class="w-1 h-4 bg-blue-500 rounded-full mr-2"></span>
          {{ formatTargetName(group.targetSlotId) }}
        </h3>

        <div class="grid grid-cols-2 gap-3">
          <!-- STÍLUS VÁLASZTÓ (Ha van) -->
          <div v-if="group.styleSetting" class="space-y-1">
            <label class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Forma / Stílus</label>
            <div class="relative group">
              <select :value="settingsStore.globalStyleSettings[group.styleSetting.targetSlotId] || ''"
                @change="updateSetting(group.styleSetting, ($event.target as HTMLSelectElement).value)"
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-6 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                <option value="" disabled>Válassz...</option>
                <option v-for="opt in group.styleSetting.options" :key="opt" :value="opt">
                  {{ formatFamilyName(opt) }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- ANYAG VÁLASZTÓ (Ha van) -->
          <div v-if="group.materialSetting" class="space-y-1">
            <label class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Anyag / Szín</label>
            <div class="relative group">
              <select :value="settingsStore.globalMaterialSettings[group.materialSetting.targetSlotId] || ''"
                @change="updateSetting(group.materialSetting, ($event.target as HTMLSelectElement).value)"
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-6 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]">
                <option value="" disabled>Válassz...</option>
                <option v-for="mat in getMaterialsForTarget(group.materialSetting.targetSlotId)" :key="mat.id"
                  :value="mat.id">
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
</style>
