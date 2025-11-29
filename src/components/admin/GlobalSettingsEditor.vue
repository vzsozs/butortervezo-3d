<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { GlobalGroupConfig, StyleVariant } from '@/config/furniture';

// IKONOK
const ChevronUpIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
const ChevronDownIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
const TrashIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

const emit = defineEmits<{
  (e: 'save-to-server'): void;
}>();

const configStore = useConfigStore();
const { globalGroups, components } = storeToRefs(configStore);

// --- ÁLLAPOT ---
const selectedGroupId = ref<string | null>(null);
const editingData = ref<Partial<GlobalGroupConfig>>({});

const availableSlotTypes = computed(() => Object.keys(components.value));

// --- LISTA KEZELÉS ---

function createNewGroup() {
  const newId = `group_${Date.now()}`;
  const newGroup: GlobalGroupConfig = {
    id: newId,
    name: 'Új Csoport',
    targets: [],
    material: { enabled: true, allowedCategories: [] },
    style: { enabled: false, variants: [] }
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
    style: rawData.style || { enabled: false, variants: [] }
  };
}

function saveAndUpload() {
  if (editingData.value.id) {
    // 1. Frissítés a store-ban
    configStore.updateGlobalGroup(editingData.value as GlobalGroupConfig);
    // 2. Mentés a szerverre
    emit('save-to-server');
  }
}

function deleteGroup() {
  if (!editingData.value.id) return;
  if (confirm('Biztosan törlöd ezt a csoportot?')) {
    configStore.deleteGlobalGroup(editingData.value.id);
    selectedGroupId.value = null;
    editingData.value = {};
  }
}

function moveUp(index: number) {
  configStore.moveGroupUp(index);
}

function moveDown(index: number) {
  configStore.moveGroupDown(index);
}

// --- SEGÉDLET: ANYAGOK ---
const availableMaterialCategories = computed(() => {
  const cats = new Set<string>();
  configStore.materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  return Array.from(cats).sort();
});

// --- SEGÉDLET: KOMPONENSEK ---
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

// --- VARIÁCIÓ KEZELÉS ---
function addVariant() {
  if (!editingData.value.style) {
    editingData.value.style = { enabled: true, variants: [] };
  }
  const newVariant: StyleVariant = {
    id: `var_${Date.now()}`,
    name: 'Új Variáció',
    componentIds: []
  };
  editingData.value.style.variants.push(newVariant);
}

function removeVariant(index: number) {
  if (!editingData.value.style) return;
  editingData.value.style.variants.splice(index, 1);
}

</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
      <div>
        <h2 class="text-2xl font-bold text-white">Globális Beállítások</h2>
        <p class="text-sm text-gray-400">Hozd létre a csoportokat és rendeld hozzá a szabályokat.</p>
      </div>
      <div class="flex gap-3">
        <button @click="createNewGroup" class="admin-btn flex items-center gap-2">
          <span>+</span> Új Csoport
        </button>
        <!-- Felső mentés gomb eltávolítva -->
      </div>
    </div>

    <div class="grid grid-cols-12 gap-6 h-full min-h-0">

      <!-- BAL OLDAL: LISTA -->
      <div class="col-span-3 overflow-y-auto bg-gray-800 rounded-lg border border-gray-700 p-2 custom-scrollbar">
        <div v-if="globalGroups.length === 0" class="text-gray-500 text-center p-4 text-sm">
          Nincs csoport.
        </div>

        <div v-for="(group, index) in globalGroups" :key="group.id" @click="selectGroup(group)"
          class="p-3 mb-2 rounded cursor-pointer border-l-4 transition-all hover:bg-gray-700 flex justify-between items-center group"
          :class="selectedGroupId === group.id ? 'bg-gray-700 border-blue-500' : 'bg-gray-800 border-transparent'">

          <span class="font-bold text-white truncate mr-2">{{ group.name }}</span>

          <!-- Nyilak (SVG) -->
          <div class="flex flex-col opacity-80 group-hover:opacity-100">
            <button @click.stop="moveUp(index)" :disabled="index === 0"
              class="text-gray-400 hover:text-white disabled:opacity-40 p-0.5 hover:bg-gray-600 rounded"
              v-html="ChevronUpIcon"></button>
            <button @click.stop="moveDown(index)" :disabled="index === globalGroups.length - 1"
              class="text-gray-400 hover:text-white disabled:opacity-40 p-0.5 hover:bg-gray-600 rounded"
              v-html="ChevronDownIcon"></button>
          </div>
        </div>
      </div>

      <!-- JOBB OLDAL: SZERKESZTŐ -->
      <div class="col-span-9 bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-y-auto custom-scrollbar"
        v-if="selectedGroupId">

        <div class="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
          <div class="w-full mr-4">
            <label class="admin-label">Csoport Neve</label>
            <input v-model="editingData.name" type="text" class="admin-input text-lg font-bold" />
          </div>
          <button @click="deleteGroup" class="admin-btn-danger text-xs whitespace-nowrap mt-6">Csoport Törlése</button>
        </div>

        <!-- 1. CÉLPONTOK -->
        <div class="mb-8">
          <label class="admin-label mb-2 block">Mit vezéreljen ez a csoport?</label>
          <div class="flex flex-wrap gap-2 bg-gray-900/50 p-3 rounded border border-gray-600">
            <label v-for="type in availableSlotTypes" :key="type"
              class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
              :class="(editingData.targets || []).includes(type)
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'">
              <input type="checkbox" :value="type" v-model="editingData.targets" class="hidden" />
              {{ type }}
            </label>
          </div>
        </div>

        <!-- 2. VEZÉRLŐK -->
        <div class="grid grid-cols-2 gap-6">

          <!-- A) STÍLUS -->
          <div class="bg-gray-900/30 border border-gray-600 rounded-lg p-4 flex flex-col">
            <div class="flex justify-between items-center mb-4">
              <div class="flex items-center gap-2">
                <!-- Normál méretű checkbox -->
                <input type="checkbox" v-model="editingData.style!.enabled" class="checkbox-styled" />
                <h3 class="text-lg font-bold text-white">Stílus</h3>
              </div>
              <button v-if="editingData.style!.enabled" @click="addVariant"
                class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">
                + Variáció
              </button>
            </div>

            <div v-if="editingData.style!.enabled" class="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1"
              style="max-height: 400px;">
              <div v-if="editingData.style!.variants.length === 0" class="text-sm text-gray-500 italic">
                Nincsenek variációk. Adj hozzá egyet!
              </div>

              <div v-for="(variant, idx) in editingData.style!.variants" :key="variant.id"
                class="bg-gray-800 p-3 rounded border border-gray-700">

                <div class="flex justify-between mb-2">
                  <input v-model="variant.name" type="text"
                    class="bg-transparent border-b border-gray-600 text-white text-sm font-bold w-full mr-2 focus:outline-none focus:border-blue-500"
                    placeholder="Variáció neve (pl. Keretes)" />
                  <!-- Kuka ikon -->
                  <button @click="removeVariant(idx)"
                    class="text-red-400 hover:text-red-300 p-1 hover:bg-gray-700 rounded" v-html="TrashIcon"></button>
                </div>

                <div class="max-h-32 overflow-y-auto custom-scrollbar bg-gray-900/50 p-2 rounded">
                  <div v-if="availableComponentsForTargets.length === 0" class="text-xs text-yellow-500">
                    ⚠️ Válassz célpontot fentebb!
                  </div>
                  <label v-for="comp in availableComponentsForTargets" :key="comp.id"
                    class="flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-700/50 p-1 rounded">
                    <!-- Normál méretű checkbox -->
                    <input type="checkbox" :value="comp.id" v-model="variant.componentIds" class="checkbox-styled" />
                    <span class="text-xs text-gray-300">{{ comp.name }}</span>
                  </label>
                </div>
              </div>
            </div>
            <div v-else class="text-gray-500 text-sm italic mt-2">
              A stílus vezérlés ki van kapcsolva.
            </div>
          </div>

          <!-- B) ANYAG -->
          <div class="bg-gray-900/30 border border-gray-600 rounded-lg p-4 flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              <!-- Normál méretű checkbox -->
              <input type="checkbox" v-model="editingData.material!.enabled" class="checkbox-styled" />
              <h3 class="text-lg font-bold text-white">Anyag</h3>
            </div>

            <div v-if="editingData.material!.enabled">
              <p class="text-xs text-gray-400 mb-2">Engedélyezett kategóriák:</p>
              <div class="flex flex-wrap gap-2">
                <label v-for="cat in availableMaterialCategories" :key="cat"
                  class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                  :class="(editingData.material!.allowedCategories || []).includes(cat)
                    ? 'bg-green-600 border-green-500 text-white shadow-lg'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'">
                  <input type="checkbox" :value="cat" v-model="editingData.material!.allowedCategories"
                    class="hidden" />
                  {{ cat }}
                </label>
              </div>
              <p class="text-[10px] text-gray-500 mt-2 italic">Ha üres, minden kategória elérhető.</p>
            </div>
            <div v-else class="text-gray-500 text-sm italic mt-2">
              Az anyag vezérlés ki van kapcsolva.
            </div>
          </div>

        </div>

        <!-- MENTÉS GOMB (LENT) -->
        <div class="mt-8 pt-4 border-t border-gray-700 flex justify-end">
          <button @click="saveAndUpload" class="admin-btn w-full md:w-auto flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
            </svg>
            Mentés Szerverre
          </button>
        </div>

      </div>

      <!-- ÜRES ÁLLAPOT -->
      <div v-else class="col-span-9 flex flex-col items-center justify-center text-gray-500 h-full">
        <div class="text-4xl mb-4">🎛️</div>
        <p>Válassz egy csoportot a bal oldali listából, vagy hozz létre újat!</p>
      </div>

    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(31, 41, 55, 0.5);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(75, 85, 99, 0.8);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 114, 128, 1);
}
</style>
