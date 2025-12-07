<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { ComponentConfig } from '@/config/furniture';
import { useComponentImport } from '@/composables/useComponentImport';

const props = defineProps<{
  component: Partial<ComponentConfig> | null;
  isNew: boolean;
  componentType: string;
}>();

const emit = defineEmits<{
  (e: 'save', component: ComponentConfig, file: File | null): void;
  (e: 'cancel'): void;
  (e: 'delete', component: ComponentConfig): void;
  (e: 'preview', file: File, data: Partial<ComponentConfig>): void;
}>();

const componentTypeOptionsList = [
  { value: 'corpuses', label: 'Korpusz' },
  { value: 'fronts', label: 'Ajtó' },
  { value: 'handles', label: 'Fogantyú' },
  { value: 'legs', label: 'Láb' },
  { value: 'shelves', label: 'Polc' },
  { value: 'drawers', label: 'Fiók' },
  { value: 'others', label: 'Egyéb' }
];

// --- STATE ---
const configStore = useConfigStore();
// JAVÍTÁS: Behúztuk a furnitureList-et is a kategóriákhoz
const { components: storeComponents, furnitureList } = storeToRefs(configStore);

const editableComponent = ref<Partial<ComponentConfig>>({});
const selectedFile = ref<File | null>(null);

// Zászló a belső frissítéshez
const isInternalUpdate = ref(false);

const isProcessing = ref(false);
const modelMaterialOptions = ref<string[]>([]);
const useMaterialSource = ref(false);

// Composable
const { processGlbFile } = useComponentImport();

// Elérhető típusok
const componentTypeOptions = computed(() => Object.keys(storeComponents.value));

// Elérhető anyagkategóriák
const availableMaterialCategories = computed(() => {
  const cats = new Set<string>();
  configStore.materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  return Array.from(cats).sort();
});

// ÚJ: Elérhető Bútor Kategóriák (a furnitureList-ből)
const availableFurnitureCategories = computed(() => {
  const cats = new Set<string>();
  // Alapértelmezettek, hogy biztosan legyen valami
  cats.add('bottom_cabinets');

  if (furnitureList.value) {
    furnitureList.value.forEach(f => {
      if (f.category) cats.add(f.category);
    });
  }
  return Array.from(cats).sort();
});

// --- WATCHER ---
watch(() => props.component, (newComponent) => {
  const comp = newComponent ? JSON.parse(JSON.stringify(newComponent)) : {};
  if (!comp.properties) comp.properties = {};

  // 🔥 AUTOMATIKUS TÍPUS KITÖLTÉS
  if (!comp.componentType && props.componentType) {
    comp.componentType = props.componentType;
    console.log(`🤖 Automatikus típus beállítás: ${comp.componentType}`);
  }

  // 1. HA BELSŐ FRISSÍTÉS VOLT (Preview)
  if (isInternalUpdate.value) {
    console.log("🛡️ Belső frissítés (Preview) - Fájl megtartása.");
    isInternalUpdate.value = false; // Zászló le
  }
  // 2. HA KÜLSŐ VÁLTÁS TÖRTÉNT
  else {
    const oldId = editableComponent.value?.id;
    const newId = comp.id;

    if (oldId !== newId) {
      console.log(`♻️ Külső váltás (${oldId} -> ${newId}) - Fájl törlése.`);
      selectedFile.value = null;
    }
  }

  // Adatok betöltése
  editableComponent.value = comp;
  modelMaterialOptions.value = comp.materialOptions || [];
  if (!comp.allowedMaterialCategories) comp.allowedMaterialCategories = [];
  useMaterialSource.value = !!comp.materialSource;

}, { immediate: true, deep: true });

// Automatikus ID generálás
watch(() => editableComponent.value.name, (newName) => {
  if (props.isNew && newName && !isProcessing.value && !selectedFile.value) {
    editableComponent.value.id = newName.toLowerCase()
      .replace(/[áéíóöőúüű]/g, c => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u' }[c] || c))
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '');
  }
});

// --- FÁJL KEZELÉS ---
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  console.log("📂 Fájl kiválasztva:", file.name);
  selectedFile.value = file;
  isProcessing.value = true;

  try {
    // Használjuk a composable-t a feldolgozáshoz
    const { config, materialNames } = await processGlbFile(file, props.componentType);

    // Összefésüljük a meglévő adatokkal (pl. ha már volt ID vagy egyéb beállítás)
    // De a modellből jövő adatok (méretek, pontok) felülírják a régieket
    editableComponent.value = {
      ...editableComponent.value,
      ...config,
      // Az ID-t ne írjuk felül, ha már van, kivéve ha üres
      id: editableComponent.value.id || config.id,
      // A nevet is csak akkor, ha üres (vagy a composable generálta)
      name: editableComponent.value.name || config.name,
    };

    modelMaterialOptions.value = materialNames;
    isInternalUpdate.value = true;
    emit('preview', file, editableComponent.value as ComponentConfig);

  } catch (error) {
    console.error("❌ Modell hiba:", error);
    alert("Nem sikerült feldolgozni a modellt.");
    selectedFile.value = null;
  } finally {
    isProcessing.value = false;
  }
}

function saveChanges() {
  if (editableComponent.value) {
    const componentToSave = JSON.parse(JSON.stringify(editableComponent.value));

    // Ha nem korpusz, akkor kezeljük az anyag forrást
    if (componentToSave.componentType !== 'corpuses') {
      if (!useMaterialSource.value) delete componentToSave.materialSource;
    }
    // Ha korpusz, akkor töröljük a materialSource-t, mert ott kategória van helyette
    else {
      delete componentToSave.materialSource;
    }

    if (!componentToSave.componentType) {
      componentToSave.componentType = props.componentType || 'others';
    }

    if ((componentToSave.price || 0) < 0) {
      alert("Az ár nem lehet negatív!");
      return;
    }

    console.log("💾 Mentés indítása. Fájl:", selectedFile.value);
    emit('save', componentToSave, selectedFile.value);
  } else {
    console.error("Hiba: Nincs editableComponent!");
  }
}

function deleteItem() {
  if (editableComponent.value) emit('delete', editableComponent.value as ComponentConfig);
}
</script>

<template>
  <div class="admin-panel overflow-y-auto h-full flex flex-col" v-if="editableComponent">

    <!-- FEJLÉC -->
    <div class="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
      <div>
        <h3 class="text-xl font-bold text-white">
          {{ isNew ? `Új ${componentType} feltöltése` : `Szerkesztés: ${editableComponent.name}` }}
        </h3>
        <p class="text-sm text-gray-400" v-if="!isNew">ID: {{ editableComponent.id }}</p>
      </div>
      <div class="flex gap-2">
        <button v-if="!isNew" @click="deleteItem" class="admin-btn-danger text-sm">Törlés</button>
        <button @click="emit('cancel')" class="admin-btn-secondary text-sm">Mégse</button>
        <button @click="saveChanges" class="admin-btn text-sm">Mentés</button>
      </div>
    </div>

    <!-- 1. LÉPÉS: FÁJL FELTÖLTÉS (Csak újnál) -->
    <div
      class="mb-6 p-6 border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 transition-colors text-center relative"
      v-if="isNew">
      <input type="file" @change="handleFileChange" accept=".glb"
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      <div v-if="!isProcessing">
        <p class="text-lg font-bold text-blue-400">Kattints vagy húzd ide a .glb fájlt</p>
        <p class="text-sm text-gray-500 mt-1">A rendszer automatikusan felismeri a méreteket és pontokat.</p>
      </div>
      <div v-else class="flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
        <p class="text-yellow-400">Modell elemzése...</p>
      </div>
    </div>

    <!-- SZERKESZTŐ ŰRLAP -->
    <div v-if="editableComponent.id" class="space-y-6 pb-10">

      <!-- Alapadatok Grid -->
      <div class="grid grid-cols-2 gap-6 bg-gray-800 p-4 rounded-lg border border-gray-700">

        <!-- 1. SOR: Megnevezés és ID -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Megnevezés</label>
          <input type="text" v-model="editableComponent.name" class="admin-input font-bold" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Azonosító (ID)</label>
          <input type="text" v-model="editableComponent.id"
            class="admin-input bg-gray-700/50 text-gray-400 cursor-not-allowed" readonly />
        </div>

        <!-- 2. SOR: Ár és Típus -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Ár (HUF)</label>
          <input type="number" v-model="editableComponent.price" placeholder="0" class="admin-input" />
        </div>

        <!-- Típus (ComponentType) -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">
            Típus (ComponentType)
          </label>
          <div class="relative">
            <select v-model="editableComponent.componentType"
              class="admin-input w-full appearance-none bg-transparent border-gray-600 focus:border-yellow-500 cursor-pointer pr-10 text-gray-200">
              <option v-for="opt in componentTypeOptionsList" :key="opt.value" :value="opt.value" class="bg-gray-800">
                {{ opt.label }}
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400">
              <svg class="h-4 w-4 fill-current" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- 3. SOR: Méretek -->
        <div class="col-span-2 grid grid-cols-3 gap-4 bg-gray-900/30 p-3 rounded border border-gray-700/30">
          <div class="flex flex-col gap-1">
            <label class="admin-label text-xs tracking-wider text-gray-400 text-center">SZÉLESSÉG (mm)</label>
            <input type="number" v-model.number="editableComponent.properties!.width" placeholder="pl. 600"
              class="admin-input text-center" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="admin-label text-xs tracking-wider text-gray-400 text-center">MAGASSÁG (mm)</label>
            <input type="number" v-model.number="editableComponent.properties!.height" placeholder="pl. 720"
              class="admin-input text-center" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="admin-label text-xs tracking-wider text-gray-400 text-center">MÉLYSÉG (mm)</label>
            <input type="number" v-model.number="editableComponent.properties!.depth" placeholder="pl. 510"
              class="admin-input text-center" />
          </div>
        </div>

        <!-- Engedélyezett Anyagkategóriák -->
        <div class="col-span-2 flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Engedélyezett
            Anyagkategóriák</label>
          <div class="bg-gray-900/50 p-3 rounded border border-gray-700/50 max-h-32 overflow-y-auto custom-scrollbar">
            <div v-if="availableMaterialCategories.length === 0" class="text-gray-500 text-xs italic">
              Nincsenek elérhető anyagkategóriák.
            </div>
            <div class="flex flex-wrap gap-2">
              <label v-for="cat in availableMaterialCategories" :key="cat"
                class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="(editableComponent.allowedMaterialCategories || []).includes(cat)
                  ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-900/50'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'">
                <input type="checkbox" :value="cat" v-model="editableComponent.allowedMaterialCategories"
                  class="hidden" />
                {{ cat }}
              </label>
            </div>
            <p class="text-[10px] text-gray-500 mt-2">Ha üres, minden kategória engedélyezett.</p>
          </div>
        </div>

      </div>

      <!-- SPECIÁLIS TULAJDONSÁGOK (Korpusz / Polc / Anyag) -->
      <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 class="font-bold text-white mb-3">Speciális Beállítások</h4>

        <div class="grid grid-cols-3 gap-4">

          <!-- 1. Falvastagság -->
          <div class="flex flex-col h-full justify-between gap-1">
            <div>
              <label class="admin-label text-xs tracking-wider text-yellow-500">FALVASTAGSÁG (mm)</label>
              <p class="text-[10px] text-gray-400 mb-1">Korpusz esetén: Ezt vonjuk le a belső magasság számításához.</p>
            </div>
            <input type="number" v-model.number="editableComponent.properties!.wallThickness" placeholder="pl. 18"
              class="admin-input w-full" />
          </div>

          <!-- 2. Max Polcok -->
          <div class="flex flex-col h-full justify-between gap-1">
            <div>
              <label class="admin-label text-xs uppercase tracking-wider text-yellow-500">Max Polcok Száma</label>
              <p class="text-[10px] text-gray-400 mb-1">Korpusz esetén: Ennyi polcot enged a csúszka.</p>
            </div>
            <input type="number" v-model.number="editableComponent.properties!.maxShelves" placeholder="pl. 3"
              class="admin-input w-full" />
          </div>

          <!-- 3. MEZŐ: KATEGÓRIA (Ha Korpusz) VAGY ANYAG ÖRÖKLÉS (Minden más) -->

          <!-- A: KATEGÓRIA VÁLASZTÓ (Csak Korpusz) -->
          <div v-if="editableComponent.componentType === 'corpuses'" class="flex flex-col h-full justify-between gap-1">
            <div>
              <label class="admin-label text-xs uppercase tracking-wider text-yellow-500">Kategória</label>
              <p class="text-[10px] text-gray-400 mb-1">Milyen típusú bútorhoz való ez a korpusz?</p>
            </div>
            <div class="relative">
              <select v-model="editableComponent.category"
                class="admin-input w-full appearance-none bg-transparent border-gray-600 focus:border-yellow-500 cursor-pointer pr-10 text-gray-200">
                <option v-for="cat in availableFurnitureCategories" :key="cat" :value="cat" class="bg-gray-800">
                  {{ cat }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400">
                <svg class="h-4 w-4 fill-current" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- B: ANYAG ÖRÖKLÉS (Minden más) -->
          <div v-else class="flex flex-col h-full justify-between gap-1">
            <div>
              <label
                class="flex items-center gap-2 cursor-pointer admin-label text-xs uppercase tracking-wider text-yellow-500">
                <input type="checkbox" v-model="useMaterialSource" class="checkbox-styled" />
                Anyag Öröklés
              </label>
              <p class="text-[10px] text-gray-400 mb-1">Ha az anyagot a szülőtől örökli (pl. korpusz szín).</p>
            </div>
            <input type="text" v-model="editableComponent.materialSource" placeholder="pl. corpus"
              :disabled="!useMaterialSource" class="admin-input w-full" />
          </div>

        </div>
      </div>

      <!-- CSATLAKOZÁSI PONTOK -->
      <div v-if="editableComponent.attachmentPoints && editableComponent.attachmentPoints.length > 0"
        class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 class="font-bold text-white mb-1">Csatlakozási Pontok</h4>
        <p class="text-xs text-gray-400 mb-4">Jelöld be, hogy az egyes pontokra milyen típusú elemek csatlakozhatnak!
        </p>

        <div class="space-y-3">
          <div v-for="(point, index) in editableComponent.attachmentPoints" :key="index"
            class="bg-gray-900/50 p-3 rounded border border-gray-700/50">

            <div class="flex items-center gap-2 mb-2">
              <span class="text-yellow-500 text-lg">📍</span>
              <span class="font-mono text-sm font-bold text-gray-200">{{ point.id }}</span>
            </div>

            <!-- Címkés választó (Tags) -->
            <div class="flex flex-wrap gap-2">
              <label v-for="type in componentTypeOptions" :key="type"
                class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="point.allowedComponentTypes.includes(type)
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'">
                <input type="checkbox" :value="type" v-model="point.allowedComponentTypes" class="hidden" />
                {{ type }}
              </label>
            </div>

          </div>
        </div>
      </div>

    </div>
  </div>
</template>
