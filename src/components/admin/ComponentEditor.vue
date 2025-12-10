<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import { type ComponentConfig, ComponentType, FurnitureCategory, type MaterialSlotDef } from '@/config/furniture';
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
  { value: ComponentType.CORPUS, label: 'Korpusz' },
  { value: ComponentType.FRONT, label: 'Ajtó' },
  { value: ComponentType.HANDLE, label: 'Fogantyú' },
  { value: ComponentType.LEG, label: 'Láb' },
  { value: ComponentType.SHELF, label: 'Polc' },
  { value: ComponentType.DRAWER, label: 'Fiók' },
  { value: ComponentType.OTHER, label: 'Egyéb' }
];

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents, furnitureList } = storeToRefs(configStore);

const editableComponent = ref<Partial<ComponentConfig>>({});
const selectedFile = ref<File | null>(null);
const isInternalUpdate = ref(false);
const isProcessing = ref(false);
const modelMaterialOptions = ref<string[]>([]);
const useMaterialSource = ref(false);

const { processGlbFile } = useComponentImport();

const componentTypeOptions = computed(() => Object.keys(storeComponents.value));

const availableMaterialCategories = computed(() => {
  const cats = new Set<string>();
  configStore.materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  return Array.from(cats).sort();
});

const availableFurnitureCategories = computed(() => {
  const cats = new Set<string>();
  cats.add(FurnitureCategory.BOTTOM_CABINET);
  if (furnitureList.value) {
    furnitureList.value.forEach(f => {
      if (f.category) cats.add(f.category);
    });
  }
  return Array.from(cats).sort();
});

// --- COMPUTED: Van-e slot? (Ez vezérli a nézetet) ---
const hasSlots = computed(() => {
  return editableComponent.value.materialSlots && editableComponent.value.materialSlots.length > 0;
});

// --- WATCHER ---
watch(() => props.component, (newComponent) => {
  const comp = newComponent ? JSON.parse(JSON.stringify(newComponent)) : {};
  if (!comp.properties) comp.properties = {};

  if (!comp.componentType && props.componentType) {
    comp.componentType = props.componentType;
  }

  if (isInternalUpdate.value) {
    isInternalUpdate.value = false;
  } else {
    const oldId = editableComponent.value?.id;
    const newId = comp.id;
    if (oldId !== newId) {
      selectedFile.value = null;
    }
  }

  editableComponent.value = comp;
  modelMaterialOptions.value = comp.materialOptions || [];
  if (!comp.allowedMaterialCategories) comp.allowedMaterialCategories = [];
  useMaterialSource.value = !!comp.materialSource;

}, { immediate: true, deep: true });

watch(() => editableComponent.value.name, (newName) => {
  if (props.isNew && newName && !isProcessing.value && !selectedFile.value) {
    editableComponent.value.id = newName.toLowerCase()
      .replace(/[áéíóöőúüű]/g, c => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u' }[c] || c))
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '');
  }
});

// --- FÁJL KEZELÉS (OKOS DETEKTÁLÁS) ---
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  selectedFile.value = file;
  isProcessing.value = true;

  try {
    const { config, materialNames } = await processGlbFile(file, props.componentType);

    editableComponent.value = {
      ...editableComponent.value,
      ...config,
      id: editableComponent.value.id || config.id,
      name: editableComponent.value.name || config.name,
    };

    modelMaterialOptions.value = materialNames;

    // 🔥 AUTOMATIKUS DÖNTÉS:
    if (materialNames.length > 1) {
      console.log("🤖 Több anyagot találtam -> Multi-Material mód.");
      // Slotok generálása
      editableComponent.value.materialSlots = materialNames.map((matName, index) => ({
        key: index === 0 ? 'base' : `slot_${index}`,
        name: matName, // Kezdeti név = anyag neve
        target: matName,
        allowedCategories: []
      }));
      // Legacy mező törlése
      editableComponent.value.materialTarget = undefined;
    } else {
      console.log("🤖 Egy anyagot találtam -> Egyszerű mód.");
      // Slotok törlése
      editableComponent.value.materialSlots = [];
      // Legacy mező kitöltése
      if (materialNames.length > 0) {
        editableComponent.value.materialTarget = materialNames[0];
      }
    }

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

    // Slotok tisztítása
    if (componentToSave.materialSlots) {
      componentToSave.materialSlots = componentToSave.materialSlots.filter((s: MaterialSlotDef) => s.key && s.target);
    }

    if (componentToSave.componentType !== ComponentType.CORPUS) {
      if (!useMaterialSource.value) delete componentToSave.materialSource;
    } else {
      delete componentToSave.materialSource;
    }

    if (!componentToSave.componentType) {
      componentToSave.componentType = props.componentType || 'others';
    }

    if ((componentToSave.price || 0) < 0) {
      alert("Az ár nem lehet negatív!");
      return;
    }
    emit('save', componentToSave, selectedFile.value);
  }
}

function deleteItem() {
  if (editableComponent.value) emit('delete', editableComponent.value as ComponentConfig);
}

// --- SLOT KEZELÉS ---
function addMaterialSlot() {
  if (!editableComponent.value.materialSlots) {
    editableComponent.value.materialSlots = [];
  }
  editableComponent.value.materialSlots.push({
    key: '',
    name: '',
    target: '',
    allowedCategories: []
  });
}

function removeMaterialSlot(index: number) {
  if (editableComponent.value.materialSlots) {
    editableComponent.value.materialSlots.splice(index, 1);
  }
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

    <!-- 1. LÉPÉS: FÁJL FELTÖLTÉS -->
    <div
      class="mb-6 p-6 border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 transition-colors text-center relative"
      v-if="isNew">
      <input type="file" @change="handleFileChange" accept=".glb"
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      <div v-if="!isProcessing">
        <p class="text-lg font-bold text-blue-400">Kattints vagy húzd ide a .glb fájlt</p>
      </div>
      <div v-else class="flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
        <p class="text-yellow-400">Modell elemzése...</p>
      </div>
    </div>

    <!-- SZERKESZTŐ ŰRLAP -->
    <div v-if="editableComponent.id" class="space-y-6 pb-10">

      <!-- Alapadatok Grid (VÁLTOZATLAN) -->
      <div class="grid grid-cols-2 gap-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Megnevezés</label>
          <input type="text" v-model="editableComponent.name" class="admin-input font-bold" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Azonosító (ID)</label>
          <input type="text" v-model="editableComponent.id"
            class="admin-input bg-gray-700/50 text-gray-400 cursor-not-allowed" readonly />
        </div>
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Ár (HUF)</label>
          <input type="number" v-model="editableComponent.price" placeholder="0" class="admin-input" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Típus</label>
          <div class="relative">
            <select v-model="editableComponent.componentType"
              class="admin-input w-full appearance-none bg-transparent border-gray-600 focus:border-yellow-500 cursor-pointer pr-10 text-gray-200">
              <option v-for="opt in componentTypeOptionsList" :key="opt.value" :value="opt.value" class="bg-gray-800">{{
                opt.label }}</option>
            </select>
          </div>
        </div>
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
      </div>

      <!-- 🔥 ANYAG BEÁLLÍTÁSOK (OKOSÍTVA) -->
      <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div class="flex justify-between items-center mb-3">
          <div>
            <h4 class="font-bold text-white flex items-center gap-2">
              Anyag Beállítások
              <span v-if="hasSlots"
                class="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded border border-blue-700">MULTI</span>
              <span v-else
                class="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">SIMPLE</span>
            </h4>
            <p class="text-[10px] text-gray-400">
              {{ hasSlots
                ? 'Több anyag kezelése (pl. üveges ajtó: keret + üveg).'
                : 'Egyszerű mód: A teljes modell egy anyagot kap.' }}
            </p>
          </div>
          <!-- Kézi hozzáadás gomb csak Multi módban -->
          <button v-if="hasSlots" @click="addMaterialSlot"
            class="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white border border-gray-600">
            + Slot Hozzáadása
          </button>
        </div>

        <!-- A) MULTI-MATERIAL MÓD (Ha vannak slotok) -->
        <div v-if="hasSlots" class="space-y-4 animate-fade-in">
          <div v-for="(slot, index) in editableComponent.materialSlots" :key="index"
            class="bg-gray-900/50 p-3 rounded border border-gray-700 relative group">

            <button @click="removeMaterialSlot(index)"
              class="absolute top-2 right-2 text-gray-500 hover:text-red-400 transition-colors" title="Slot törlése">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>

            <div class="grid grid-cols-3 gap-4 mb-3">
              <div>
                <label class="block text-[10px] text-gray-500 mb-1 uppercase font-bold">Kulcs (ID)</label>
                <input v-model="slot.key" type="text" class="admin-input w-full text-xs font-bold text-white"
                  placeholder="pl. glass" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-500 mb-1 uppercase font-bold">Megjelenő Név</label>
                <input v-model="slot.name" type="text" class="admin-input w-full text-xs" placeholder="pl. Üveg" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-500 mb-1 uppercase font-bold">Target (GLB Anyag)</label>
                <select v-if="modelMaterialOptions.length > 0" v-model="slot.target"
                  class="admin-input w-full text-xs font-mono text-yellow-500">
                  <option value="" disabled>Válassz...</option>
                  <option v-for="matName in modelMaterialOptions" :key="matName" :value="matName">{{ matName }}</option>
                </select>
                <input v-else v-model="slot.target" type="text"
                  class="admin-input w-full text-xs font-mono text-yellow-500" />
              </div>
            </div>

            <!-- Engedélyezett Kategóriák (Slot-hoz) -->
            <div class="bg-gray-800/50 p-2 rounded border border-gray-700/30">
              <label class="block text-[10px] text-gray-400 mb-2 uppercase">Engedélyezett Anyagkategóriák</label>
              <div class="flex flex-wrap gap-2">
                <label v-for="cat in availableMaterialCategories" :key="cat"
                  class="cursor-pointer select-none px-2 py-1 rounded text-[10px] font-medium border transition-all"
                  :class="(slot.allowedCategories || []).includes(cat)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-300'">
                  <input type="checkbox" :value="cat" v-model="slot.allowedCategories" class="hidden"
                    @change="() => { if (!slot.allowedCategories) slot.allowedCategories = [] }" />
                  {{ cat }}
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- B) EGYSZERŰ MÓD (Ha nincsenek slotok) -->
        <div v-else class="animate-fade-in space-y-4">
          <!-- Target -->
          <div class="bg-gray-900/30 p-3 rounded border border-gray-700/50">
            <label class="block text-xs font-medium text-gray-400 mb-1">Target (GLB Anyag név)</label>
            <div class="flex gap-2">
              <select v-if="modelMaterialOptions.length > 0" v-model="editableComponent.materialTarget"
                class="admin-input w-full font-mono text-yellow-500">
                <option value="" disabled>Válassz anyagot...</option>
                <option v-for="matName in modelMaterialOptions" :key="matName" :value="matName">{{ matName }}</option>
              </select>
              <input v-else v-model="editableComponent.materialTarget" type="text"
                class="admin-input w-full font-mono text-yellow-500" placeholder="pl. Front_Material" />
            </div>
          </div>

          <!-- 🔥 VISSZAÁLLÍTVA: Engedélyezett Kategóriák (Egyszerű módhoz) -->
          <div class="bg-gray-900/30 p-3 rounded border border-gray-700/50">
            <label class="block text-xs font-medium text-gray-400 mb-2 uppercase">Engedélyezett Anyagkategóriák</label>
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

      <!-- SPECIÁLIS TULAJDONSÁGOK (VÁLTOZATLAN) -->
      <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 class="font-bold text-white mb-3">Speciális Beállítások</h4>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col h-full justify-between gap-1">
            <label class="admin-label text-xs tracking-wider text-yellow-500">FALVASTAGSÁG (mm)</label>
            <p class="text-[10px] text-gray-400 mb-1">Korpusz esetén: Ezt vonjuk le a belső magasság számításához.</p>
            <input type="number" v-model.number="editableComponent.properties!.wallThickness" placeholder="pl. 18"
              class="admin-input w-full" />
          </div>
          <div class="flex flex-col h-full justify-between gap-1">
            <label class="admin-label text-xs tracking-wider text-yellow-500">MAX POLCOK (db)</label>
            <p class="text-[10px] text-gray-400 mb-1">Korpusz esetén: Ennyi polcot enged a csúszka.</p>
            <input type="number" v-model.number="editableComponent.properties!.maxShelves" placeholder="pl. 3"
              class="admin-input w-full" />
          </div>
          <div v-if="editableComponent.componentType === ComponentType.CORPUS"
            class="flex flex-col h-full justify-between gap-1">
            <label class="admin-label text-xs uppercase tracking-wider text-yellow-500">Kategória</label>
            <p class="text-[10px] text-gray-400 mb-1">Milyen típusú bútorhoz való ez a korpusz?</p>
            <select v-model="editableComponent.category" class="admin-input w-full">
              <option v-for="cat in availableFurnitureCategories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
          <div v-else class="flex flex-col h-full justify-between gap-1">
            <label
              class="flex items-center gap-2 cursor-pointer admin-label text-xs uppercase tracking-wider text-yellow-500">
              <input type="checkbox" v-model="useMaterialSource" class="checkbox-styled" /> Anyag Öröklés
            </label>
            <p class="text-[10px] text-gray-400 mb-1">Ha az anyagot a szülőtől örökli (pl. korpusz szín).</p>
            <input type="text" v-model="editableComponent.materialSource" :disabled="!useMaterialSource"
              placeholder="pl. corpus" class="admin-input w-full" />
          </div>
        </div>
      </div>

      <!-- CSATLAKOZÁSI PONTOK (VÁLTOZATLAN) -->
      <div v-if="editableComponent.attachmentPoints && editableComponent.attachmentPoints.length > 0"
        class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 class="font-bold text-white mb-1">Csatlakozási Pontok</h4>
        <p class="text-[10px] text-gray-400 mb-4">Jelöld be, hogy az egyes pontokra milyen típusú elemek
          csatlakozhatnak!
        </p>
        <div class="space-y-3 mt-4">
          <div v-for="(point, index) in editableComponent.attachmentPoints" :key="index"
            class="bg-gray-900/50 p-3 rounded border border-gray-700/50">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-yellow-500 text-lg">📍</span>
              <span class="font-mono text-sm font-bold text-gray-200">{{ point.id }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <label v-for="type in componentTypeOptions" :key="type"
                class="cursor-pointer select-none px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="point.allowedComponentTypes.includes(type) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'">
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
