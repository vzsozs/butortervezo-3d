<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { ComponentConfig } from '@/config/furniture';
import { analyzeModel } from '@/three/Utils/ModelAnalyzer';

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

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const editableComponent = ref<Partial<ComponentConfig>>({});
const selectedFile = ref<File | null>(null);

// Zászló a belső frissítéshez
const isInternalUpdate = ref(false);

const isProcessing = ref(false);
const modelMaterialOptions = ref<string[]>([]);
const useMaterialSource = ref(false);

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

// --- WATCHER ---
watch(() => props.component, (newComponent) => {
  const comp = newComponent ? JSON.parse(JSON.stringify(newComponent)) : {};
  if (!comp.properties) comp.properties = {};

  // 1. HA BELSŐ FRISSÍTÉS VOLT (Preview)
  if (isInternalUpdate.value) {
    console.log("🛡️ Belső frissítés (Preview) - Fájl megtartása.");
    isInternalUpdate.value = false; // Zászló le
  }
  // 2. HA KÜLSŐ VÁLTÁS TÖRTÉNT
  else {
    const oldId = editableComponent.value?.id;
    const newId = comp.id;

    // Csak akkor törlünk, ha az ID különbözik (másik elemre kattintottál)
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

// Automatikus ID generálás (Csak új elemnél, és ha NINCS fájl feltöltve)
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
    const analysis = await analyzeModel(file);

    // 1. Fájlnév tisztítása (kiterjesztés nélkül)
    const rawName = file.name.replace(/\.glb$/i, '');

    // 2. Stilizált Név (Megjelenítéshez)
    // - Alsóvonalak cseréje szóközre
    // - Szavak kezdőbetűinek nagybetűsítése (opcionális, de szebb)
    const stylizedName = rawName
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 3. Biztonságos Fájlnév (Mentéshez)
    // - Marad az eredeti kisbetűsítés + alsóvonalas logika a fájlrendszer miatt
    const safeFileName = rawName.toLowerCase().replace(/\s+/g, '_');

    // FONTOS: NEM VÁLTOZTATJUK MEG AZ ID-t!
    // Ha megváltoztatnánk, a Vue újrarenderelné az egész komponenst, és elveszne a fájl.
    // Csak a nevet és a modellt frissítjük.

    editableComponent.value = {
      ...editableComponent.value,
      name: stylizedName, // A név változhat
      // id: baseName, // <--- EZT KIVETTÜK! Az ID marad a régi.

      model: `/models/${props.componentType}/${safeFileName}`,
      materialTarget: analysis.materialNames[0] || '',
      materialOptions: analysis.materialNames,
      properties: {
        ...editableComponent.value.properties,
        height: analysis.height ? Math.round(analysis.height * 1000) : 0,
        width: analysis.width ? Math.round(analysis.width * 1000) : 0,
        depth: analysis.depth ? Math.round(analysis.depth * 1000) : 0,
      },
      attachmentPoints: analysis.attachmentPointNames.map(name => {
        const allowedTypes: string[] = [];
        const lowerName = name.toLowerCase();
        if (lowerName.includes('shelf')) allowedTypes.push('shelves');
        if (lowerName.includes('leg')) allowedTypes.push('legs');
        if (lowerName.includes('front') || lowerName.includes('door')) allowedTypes.push('fronts');
        if (lowerName.includes('drawer')) allowedTypes.push('drawers');
        if (lowerName.includes('handle')) allowedTypes.push('handles');
        return { id: name, allowedComponentTypes: allowedTypes };
      }),
    } as ComponentConfig;

    modelMaterialOptions.value = analysis.materialNames;

    // Zászló felhúzása (hogy a watcher ne töröljön, amikor visszajön az adat)
    isInternalUpdate.value = true;

    console.log("📤 Preview küldése...");
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

    if (!useMaterialSource.value) delete componentToSave.materialSource;

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

        <!-- Megnevezés -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Megnevezés</label>
          <input type="text" v-model="editableComponent.name" class="admin-input font-bold" />
        </div>

        <!-- Azonosító -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Azonosító (ID)</label>
          <input type="text" v-model="editableComponent.id"
            class="admin-input bg-gray-700/50 text-gray-400 cursor-not-allowed" readonly />
        </div>

        <!-- Ár -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Ár (HUF)</label>
          <input type="number" v-model="editableComponent.price" placeholder="0" class="admin-input" />
        </div>

        <!-- Szélesség -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs tracking-wider text-gray-400">SZÉLESSÉG (mm)</label>
          <input type="number" v-model.number="editableComponent.properties!.width" placeholder="pl. 600"
            class="admin-input" />
        </div>

        <!-- Magasság -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs tracking-wider text-gray-400">MAGASSÁG (mm)</label>
          <input type="number" v-model.number="editableComponent.properties!.height" placeholder="pl. 720"
            class="admin-input" />
        </div>

        <!-- Mélység -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs tracking-wider text-gray-400">MÉLYSÉG (mm)</label>
          <input type="number" v-model.number="editableComponent.properties!.depth" placeholder="pl. 510"
            class="admin-input" />
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

          <!-- 3. Anyag Öröklés -->
          <div class="flex flex-col h-full justify-between gap-1">
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
