<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import { useProceduralStore } from '@/stores/procedural';
import type { GlobalGroupConfig } from '@/config/furniture';

// IKONOK
const ChevronUpIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
const ChevronDownIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
const TrashIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
const SaveIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>`;

const emit = defineEmits<{
  (e: 'save-groups'): void;
  (e: 'save-procedural'): void;
}>();

const configStore = useConfigStore();
const proceduralStore = useProceduralStore();

const { globalGroups, components } = storeToRefs(configStore);
const { worktop, plinth } = storeToRefs(proceduralStore);

// --- UI ÁLLAPOT ---
const activeSubTab = ref<'groups' | 'construction'>('groups');
const selectedGroupId = ref<string | null>(null);
const editingData = ref<Partial<GlobalGroupConfig>>({});

const availableSlotTypes = computed(() => Object.keys(components.value));

// --- MM <-> METER KONVERTEREK ---
const worktopThicknessMm = computed({
  get: () => Math.round(worktop.value.thickness * 1000),
  set: (val) => worktop.value.thickness = val / 1000
});
const worktopOverhangMm = computed({
  get: () => Math.round(worktop.value.sideOverhang * 1000),
  set: (val) => worktop.value.sideOverhang = val / 1000
});
const worktopGapMm = computed({
  get: () => Math.round(worktop.value.gapThreshold * 1000),
  set: (val) => worktop.value.gapThreshold = val / 1000
});
const plinthHeightMm = computed({
  get: () => Math.round(plinth.value.height * 1000),
  set: (val) => plinth.value.height = val / 1000
});
const plinthOffsetMm = computed({
  get: () => Math.round(plinth.value.depthOffset * 1000),
  set: (val) => plinth.value.depthOffset = val / 1000
});
// Ezek kezelik a min/max értékeket mm-ben az admin felületen
const constructionMinMm = computed({
  get: () => editingData.value.construction?.minHeight ? Math.round(editingData.value.construction.minHeight * 1000) : 100,
  set: (val) => {
    if (!editingData.value.construction) editingData.value.construction = { enabled: true };
    editingData.value.construction.minHeight = val / 1000;
  }
});

const constructionMaxMm = computed({
  get: () => editingData.value.construction?.maxHeight ? Math.round(editingData.value.construction.maxHeight * 1000) : 200,
  set: (val) => {
    if (!editingData.value.construction) editingData.value.construction = { enabled: true };
    editingData.value.construction.maxHeight = val / 1000;
  }
});

// Ellenőrizzük, hogy lábakat szerkesztünk-e
const isLegGroup = computed(() => editingData.value.targets?.includes('legs')); // Vagy 'leg_slot', ahogy elnevezted

// --- CSOPORT LOGIKA ---
function createNewGroup() {
  const newId = `group_${Date.now()}`;
  const newGroup: GlobalGroupConfig = {
    id: newId,
    name: 'Új Csoport',
    targets: [],
    material: { enabled: true, allowedCategories: [] },
    style: { enabled: false, variants: [] },
    construction: {
      enabled: false,
      minHeight: 0.05, // 5 cm alapértelmezett min
      maxHeight: 0.20  // 20 cm alapértelmezett max
    }
  };
  configStore.addGlobalGroup(newGroup);
  selectGroup(newGroup);
}

function selectGroup(group: GlobalGroupConfig) {
  selectedGroupId.value = group.id;
  const rawData = JSON.parse(JSON.stringify(group));
  editingData.value = {
    ...rawData,
    targets: rawData.targets || [],
    material: rawData.material || { enabled: true, allowedCategories: [] },
    style: rawData.style || { enabled: false, variants: [] },
    construction: rawData.construction || {
      enabled: false,
      minHeight: 0.05,
      maxHeight: 0.20
    }
  };
}

function saveGroups() {
  if (editingData.value.id) {
    configStore.updateGlobalGroup(editingData.value as GlobalGroupConfig);
  }
  emit('save-groups');
}

function deleteGroup() {
  if (!editingData.value.id) return;
  if (confirm('Biztosan törlöd ezt a csoportot?')) {
    configStore.deleteGlobalGroup(editingData.value.id);
    selectedGroupId.value = null;
    editingData.value = {};
  }
}

function moveUp(index: number) { configStore.moveGroupUp(index); }
function moveDown(index: number) { configStore.moveGroupDown(index); }

const availableMaterialCategories = computed(() => {
  const cats = new Set<string>();
  configStore.materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  return Array.from(cats).sort();
});

const availableComponentsForTargets = computed(() => {
  if (!editingData.value.targets || editingData.value.targets.length === 0) return [];
  let allComps: any[] = [];
  editingData.value.targets.forEach(target => {
    if (components.value[target]) {
      allComps = [...allComps, ...components.value[target]];
    }
  });
  return allComps;
});

function addVariant() {
  if (!editingData.value.style) editingData.value.style = { enabled: true, variants: [] };
  editingData.value.style.variants.push({ id: `var_${Date.now()}`, name: 'Új Variáció', componentIds: [] });
}

function removeVariant(index: number) {
  if (!editingData.value.style) return;
  editingData.value.style.variants.splice(index, 1);
}

function saveProcedural() {
  emit('save-procedural');
}
</script>

<template>
  <div class="h-full flex flex-col">

    <!-- FEJLÉC ÉS TABOK -->
    <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
      <div>
        <h2 class="text-2xl font-bold text-white">Beállítások</h2>
        <p class="text-sm text-gray-400">Globális szabályok és konstrukciós paraméterek.</p>
      </div>

      <!-- TAB VÁLTÓ -->
      <div class="flex bg-gray-800 rounded-lg p-1 border border-gray-600 w-96">
        <button @click="activeSubTab = 'groups'"
          :class="['flex-1 px-4 py-2 rounded text-sm font-bold transition text-center', activeSubTab === 'groups' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white']">
          Csoportok & Szabályok
        </button>
        <button @click="activeSubTab = 'construction'"
          :class="['flex-1 px-4 py-2 rounded text-sm font-bold transition text-center', activeSubTab === 'construction' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white']">
          Konstrukció (Pult/Láb)
        </button>
      </div>
    </div>

    <!-- TARTALOM -->
    <div class="flex-1 min-h-0 overflow-hidden">

      <!-- 1. TAB: CSOPORTOK -->
      <div v-if="activeSubTab === 'groups'" class="grid grid-cols-12 gap-6 h-full">

        <!-- BAL OLDAL: LISTA -->
        <div class="col-span-3 overflow-y-auto bg-gray-800 rounded-lg border border-gray-700 p-2">
          <div class="flex justify-between items-center mb-2 px-2">
            <span class="text-xs text-gray-400 uppercase font-bold">Csoportok</span>
            <button @click="createNewGroup" class="text-blue-400 hover:text-blue-300 text-xs font-bold">+ Új</button>
          </div>

          <div v-if="globalGroups.length === 0" class="text-gray-500 text-center p-4 text-sm">Nincs csoport.</div>

          <div v-for="(group, index) in globalGroups" :key="group.id" @click="selectGroup(group)"
            class="p-3 mb-2 rounded cursor-pointer border-l-4 transition-all hover:bg-gray-700 flex justify-between items-center group"
            :class="selectedGroupId === group.id ? 'bg-gray-700 border-blue-500' : 'bg-gray-800 border-transparent'">
            <span class="font-bold text-white truncate mr-2">{{ group.name }}</span>
            <div class="flex flex-col opacity-80 group-hover:opacity-100">
              <button @click.stop="moveUp(index)" :disabled="index === 0" class="arrow-btn"
                v-html="ChevronUpIcon"></button>
              <button @click.stop="moveDown(index)" :disabled="index === globalGroups.length - 1" class="arrow-btn"
                v-html="ChevronDownIcon"></button>
            </div>
          </div>
        </div>

        <!-- JOBB OLDAL: SZERKESZTŐ -->
        <div class="col-span-9 bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-y-auto flex flex-col"
          v-if="selectedGroupId">

          <div class="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
            <div class="w-full mr-4">
              <label class="admin-label">Csoport Neve</label>
              <input v-model="editingData.name" type="text" class="admin-input text-lg font-bold" />
            </div>
            <button @click="deleteGroup" class="admin-btn-danger mt-6 whitespace-nowrap">Törlés</button>
          </div>

          <div class="mb-8">
            <label class="admin-label mb-2 block">Vezérelt Slotok</label>
            <div class="flex flex-wrap gap-2 bg-gray-900/50 p-3 rounded border border-gray-600">
              <label v-for="type in availableSlotTypes" :key="type"
                class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="(editingData.targets || []).includes(type) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'">
                <input type="checkbox" :value="type" v-model="editingData.targets" class="hidden" />
                {{ type }}
              </label>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-6 mb-6">
            <!-- Stílus -->
            <div class="bg-gray-900/30 border border-gray-600 rounded-lg p-4 flex flex-col">
              <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-2">
                  <input type="checkbox" v-model="editingData.style!.enabled" class="checkbox-styled" />
                  <h3 class="text-lg font-bold text-white">Stílus</h3>
                </div>
                <button v-if="editingData.style!.enabled" @click="addVariant"
                  class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">+ Variáció</button>
              </div>
              <div v-if="editingData.style!.enabled" class="space-y-4 flex-1 overflow-y-auto pr-1 max-h-64">
                <div v-for="(variant, idx) in editingData.style!.variants" :key="variant.id"
                  class="bg-gray-800 p-3 rounded border border-gray-700">
                  <div class="flex justify-between mb-2">
                    <input v-model="variant.name" type="text"
                      class="bg-transparent border-b border-gray-600 text-white text-sm font-bold w-full mr-2 focus:outline-none focus:border-blue-500"
                      placeholder="Variáció neve" />
                    <button @click="removeVariant(idx)" class="text-red-400 hover:text-red-300"
                      v-html="TrashIcon"></button>
                  </div>
                  <div class="max-h-32 overflow-y-auto bg-gray-900/50 p-2 rounded">
                    <label v-for="comp in availableComponentsForTargets" :key="comp.id"
                      class="flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-700/50 p-1 rounded">
                      <input type="checkbox" :value="comp.id" v-model="variant.componentIds" class="checkbox-styled" />
                      <span class="text-xs text-gray-300">{{ comp.name }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Anyag -->
            <div class="bg-gray-900/30 border border-gray-600 rounded-lg p-4 flex flex-col">
              <div class="flex items-center gap-2 mb-4">
                <input type="checkbox" v-model="editingData.material!.enabled" class="checkbox-styled" />
                <h3 class="text-lg font-bold text-white">Anyag</h3>
              </div>
              <div v-if="editingData.material!.enabled">
                <div class="flex flex-wrap gap-2">
                  <label v-for="cat in availableMaterialCategories" :key="cat"
                    class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                    :class="(editingData.material!.allowedCategories || []).includes(cat) ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'">
                    <input type="checkbox" :value="cat" v-model="editingData.material!.allowedCategories"
                      class="hidden" />
                    {{ cat }}
                  </label>
                </div>
              </div>
            </div>
          </div>
          <!-- C) KONSTRUKCIÓ (CSAK HA LÁB!) -->
          <div v-if="isLegGroup" class="col-span-2 bg-gray-900/30 border border-gray-600 rounded-lg p-4 flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              <input type="checkbox" v-model="editingData.construction!.enabled" class="checkbox-styled" />
              <h3 class="text-lg font-bold text-white">Konstrukció Vezérlés (Magasság)</h3>
            </div>

            <div v-if="editingData.construction!.enabled" class="grid grid-cols-2 gap-4">
              <div>
                <label class="admin-label">Minimum Magasság (mm)</label>
                <input type="number" v-model="constructionMinMm" class="admin-input" />
              </div>
              <div>
                <label class="admin-label">Maximum Magasság (mm)</label>
                <input type="number" v-model="constructionMaxMm" class="admin-input" />
              </div>
              <div class="col-span-2 text-xs text-gray-400 italic">
                Ez a tartomány jelenik meg a felhasználónak csúszkaként, ha generált lábat választ.
              </div>
            </div>
            <div v-else class="text-gray-500 text-sm italic mt-2">
              A konstrukciós vezérlés ki van kapcsolva.
            </div>
          </div>

          <div class="mt-auto pt-4 border-t border-gray-700 flex justify-end">
            <button @click="saveGroups" class="admin-btn flex items-center gap-2">
              <span v-html="SaveIcon"></span> Mentés (Csoportok)
            </button>
          </div>
        </div>

        <div v-else class="col-span-9 flex flex-col items-center justify-center text-gray-500 h-full">
          <p>Válassz egy csoportot a szerkesztéshez.</p>
        </div>
      </div>

      <!-- 2. TAB: KONSTRUKCIÓ (MM-BEN) -->
      <div v-else-if="activeSubTab === 'construction'" class="h-full overflow-y-auto p-1">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">

          <!-- MUNKAPULT -->
          <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 class="text-xl font-bold mb-4 text-blue-400 border-b border-gray-700 pb-2">Munkapult (Worktop)</h3>
            <div class="space-y-5">
              <div>
                <label class="block text-sm text-gray-400">Vastagság (mm)</label>
                <input type="number" step="1" v-model="worktopThicknessMm" class="admin-input">
              </div>
              <div>
                <label class="block text-sm text-gray-400">Oldalsó Túllógás (mm)</label>
                <input type="number" step="1" v-model="worktopOverhangMm" class="admin-input">
              </div>
              <div>
                <label class="block text-sm text-gray-400">Híd Küszöbérték (mm)</label>
                <input type="number" step="1" v-model="worktopGapMm" class="admin-input">
                <p class="text-xs text-gray-500 mt-1">Ennél kisebb réseket automatikusan összeköt.</p>
              </div>
            </div>
          </div>

          <!-- LÁBAZAT -->
          <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 class="text-xl font-bold mb-4 text-green-400 border-b border-gray-700 pb-2">Lábazat (Plinth)</h3>
            <div class="space-y-5">

              <div>
                <label class="block text-sm text-gray-400 font-bold mb-1">Alapértelmezett Magasság (mm)</label>
                <p class="text-xs text-gray-500 mb-2">Ez határozza meg a bútorok alap magasságát standard láb esetén.
                </p>
                <input type="number" step="1" v-model="plinthHeightMm" class="admin-input">
              </div>

              <div>
                <label class="block text-sm text-gray-400">Mélység Eltolás (mm)</label>
                <input type="number" step="1" v-model="plinthOffsetMm" class="admin-input">
                <p class="text-xs text-gray-500 mt-1">Mennyivel legyen beljebb a fronttól.</p>
              </div>

              <div class="bg-gray-900/50 p-3 rounded text-xs text-gray-400 mt-4 border border-gray-700">
                <p>ℹ️ <strong>Tipp:</strong> A felhasználó a szerkesztőben választhat más magasságot is, de itt állítod
                  be az induló értéket.</p>
              </div>
            </div>
          </div>

        </div>

        <div class="max-w-5xl mx-auto mt-6 flex justify-end">
          <button @click="saveProcedural" class="admin-btn flex items-center gap-2 bg-green-700 hover:bg-green-600">
            <span v-html="SaveIcon"></span> Mentés (Konstrukció)
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.admin-label {
  @apply block text-xs font-bold text-gray-600 uppercase mb-1;
}

.arrow-btn {
  @apply text-gray-400 hover:text-white disabled:opacity-40 p-0.5 hover:bg-gray-600 rounded;
}
</style>
