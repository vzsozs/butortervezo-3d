<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { GlobalSettingConfig } from '@/config/furniture';

const emit = defineEmits<{
  (e: 'save-to-server'): void;
}>();

const configStore = useConfigStore();
const { globalSettings, components } = storeToRefs(configStore);

// Milyen típusú slotok vannak a rendszerben? (Pl. legs, fronts, handles)
// Ezt a components objektum kulcsaiból szedjük ki.
const availableSlotTypes = computed(() => Object.keys(components.value));

// Éppen szerkesztett beállítás
const editingId = ref<string | null>(null);
const editingData = ref<Partial<GlobalSettingConfig>>({});

// --- Logic ---

function createNew() {
  const newId = `setting_${Date.now()}`;
  const newSetting: GlobalSettingConfig = {
    id: newId,
    name: 'Új Beállítás',
    type: 'select', // Alapértelmezés: legördülő menü
    targetSlotId: 'legs', // Alapértelmezés
    options: [] // Kezdetben üres, ide jönnek a családok
  };
  configStore.addGlobalSetting(newSetting);
  startEditing(newSetting);
}

function startEditing(setting: GlobalSettingConfig) {
  editingId.value = setting.id;
  const data = JSON.parse(JSON.stringify(setting));
  if (!data.allowedMaterialCategories) data.allowedMaterialCategories = [];
  editingData.value = data;
}

function cancelEditing() {
  editingId.value = null;
  editingData.value = {};
}

function saveEditing() {
  if (editingData.value && editingData.value.id) {
    configStore.updateGlobalSetting(editingData.value as GlobalSettingConfig);
    editingId.value = null;
  }
}

function deleteItem(id: string) {
  if (confirm('Biztosan törlöd ezt a beállítást?')) {
    configStore.deleteGlobalSetting(id);
    if (editingId.value === id) cancelEditing();
  }
}

// --- Helper a Checkboxokhoz ---
// Ez adja vissza azokat a családokat, amik elérhetőek a kiválasztott "targetSlotId"-hoz
const availableFamiliesForCurrent = computed(() => {
  if (!editingData.value.targetSlotId) return [];
  return configStore.getFamiliesForType(editingData.value.targetSlotId);
});

// Elérhető anyagkategóriák
const availableMaterialCategories = computed(() => {
  const cats = new Set<string>();
  configStore.materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  return Array.from(cats).sort();
});

function toggleOption(familyId: string) {
  if (!editingData.value.options) editingData.value.options = [];

  const idx = editingData.value.options.indexOf(familyId);
  if (idx === -1) {
    editingData.value.options.push(familyId);
  } else {
    editingData.value.options.splice(idx, 1);
  }
}

function handleSaveToServer() {
  emit('save-to-server');
}

</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
      <h2 class="text-2xl font-bold text-white">Globális Beállítások Szerkesztője</h2>
      <div class="flex gap-3">
        <button @click="createNew" class="admin-btn px-4 py-2 flex items-center gap-2">
          <span>+</span> Új Szabály
        </button>
        <button @click="handleSaveToServer"
          class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold transition-colors flex items-center gap-2">
          💾 Mentés Szerverre
        </button>
      </div>
    </div>

    <div class="grid grid-cols-12 gap-6 h-full min-h-0">

      <!-- BAL OLDAL: LISTA -->
      <div class="col-span-4 overflow-y-auto bg-gray-800 rounded-lg border border-gray-700 p-2">
        <div v-if="globalSettings.length === 0" class="text-gray-500 text-center p-4">
          Még nincs globális szabály. Hozz létre egyet!
        </div>
        <div v-for="setting in globalSettings" :key="setting.id" @click="startEditing(setting)"
          class="p-3 mb-2 rounded cursor-pointer border-l-4 transition-all hover:bg-gray-700"
          :class="editingId === setting.id ? 'bg-gray-700 border-blue-500' : 'bg-gray-800 border-transparent'">
          <div class="font-bold text-white">{{ setting.name }}</div>
          <div class="text-xs text-gray-400 mt-1">Vezérel: <span class="text-blue-300">{{ setting.targetSlotId }}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">{{ setting.options?.length || 0 }} opció</div>
        </div>
      </div>

      <!-- JOBB OLDAL: SZERKESZTŐ -->
      <div class="col-span-8 bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-y-auto" v-if="editingId">

        <h3 class="text-xl font-bold text-white mb-6">Szerkesztés</h3>

        <div class="space-y-6">
          <!-- Név -->
          <div>
            <label class="admin-label">Megjelenő Név (Label)</label>
            <input v-model="editingData.name" type="text" class="admin-input" placeholder="Pl. Lábak Stílusa" />
          </div>

          <!-- Mit vezérel? (Target Slot) -->
          <div>
            <label class="admin-label">Mit vezéreljen? (Komponens Típus)</label>
            <select v-model="editingData.targetSlotId" class="admin-select">
              <option v-for="type in availableSlotTypes" :key="type" :value="type">
                {{ type }} (pl. {{ configStore.getFamiliesForType(type).length }} család)
              </option>
            </select>
            <p class="text-xs text-gray-500 mt-1">Ez határozza meg, hogy milyen családok közül választhatsz.</p>
          </div>

        </div>

        <!-- Engedélyezett Anyagkategóriák (Csak ha anyagválasztóról van szó) -->
        <div class="bg-gray-900 p-4 rounded border border-gray-600"
          v-if="editingData.name && editingData.name.toLowerCase().includes('anyag')">
          <label class="admin-label mb-3 block">Melyik Anyagkategóriák jelenjenek meg?</label>

          <div class="flex flex-wrap gap-2">
            <label v-for="cat in availableMaterialCategories" :key="cat"
              class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
              :class="(editingData.allowedMaterialCategories || []).includes(cat)
                ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-900/50'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'">
              <input type="checkbox" :value="cat" v-model="editingData.allowedMaterialCategories" class="hidden" />
              {{ cat }}
            </label>
          </div>
          <p class="text-[10px] text-gray-500 mt-2">Ha üres, minden kategória megjelenik.</p>
        </div>

        <!-- Opciók (Családok) Kiválasztása -->
        <div class="bg-gray-900 p-4 rounded border border-gray-600">
          <label class="admin-label mb-3 block">Melyik Családok legyenek választhatók?</label>

          <div v-if="availableFamiliesForCurrent.length === 0" class="text-yellow-500 text-sm">
            Ehhez a típushoz ({{ editingData.targetSlotId }}) még nincsenek családok definiálva az alkatrészeknél!
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div v-for="fam in availableFamiliesForCurrent" :key="fam" @click="toggleOption(fam)"
              class="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border"
              :class="editingData.options?.includes(fam) ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'">
              <div class="w-5 h-5 flex items-center justify-center rounded border border-gray-500"
                :class="editingData.options?.includes(fam) ? 'bg-blue-500 border-blue-500' : ''">
                <span v-if="editingData.options?.includes(fam)" class="text-white text-xs font-bold">✓</span>
              </div>
              <span class="text-sm text-gray-200">{{ fam }}</span>
            </div>
          </div>
        </div>

        <!-- Gombok -->
        <div class="flex justify-between pt-4 border-t border-gray-700">
          <button @click="deleteItem(editingData.id!)" class="text-red-400 hover:text-red-300 text-sm">Törlés</button>
          <div class="flex gap-3">
            <button @click="cancelEditing" class="admin-btn-secondary">Mégse</button>
            <button @click="saveEditing" class="admin-btn">Módosítások Mentése</button>
          </div>
        </div>

      </div>
      <div v-else class="col-span-8 flex items-center justify-center text-gray-500">
        Válassz egy elemet a listából a szerkesztéshez!
      </div>

    </div>
  </div>
</template>
