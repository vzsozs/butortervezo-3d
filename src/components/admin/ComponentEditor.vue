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
}>();

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents, availableFamilies } = storeToRefs(configStore); 

const editableComponent = ref<Partial<ComponentConfig>>({});
const selectedFile = ref<File | null>(null);
const isProcessing = ref(false);
const isAdvancedVisible = ref(false);
const modelMaterialOptions = ref<string[]>([]);

const isFamilyModalOpen = ref(false);
const newFamilyInput = ref('');
const localFamilies = ref<string[]>([]); 
// ÚJ: Egyesített lista a Select-hez (Store + Helyi új)
const allFamilyOptions = computed(() => {
  // Összefűzzük a kettőt, és kiszűrjük a duplikációkat a Set-tel
  const merged = new Set([...availableFamilies.value, ...localFamilies.value]);
  return Array.from(merged).sort();
});

// Checkbox állapotok
const useHeight = ref(false);
const useMaterialSource = ref(false);

// Elérhető típusok (pl. shelves, drawers, legs...)
const componentTypeOptions = computed(() => Object.keys(storeComponents.value));

// --- WATCHERS (ÖSSZEVONVA ÉS TISZTÍTVA) ---
watch(() => props.component, (newComponent) => {
  const comp = newComponent ? JSON.parse(JSON.stringify(newComponent)) : {};
  editableComponent.value = comp;
  selectedFile.value = null;
  
  // Opciók betöltése
  modelMaterialOptions.value = comp.materialOptions || [];
  
  // Checkboxok állapota
  useHeight.value = comp.height !== undefined && comp.height !== null;
  useMaterialSource.value = !!comp.materialSource;

  // Ha nem új, alapból rejtjük a haladót
  if (!props.isNew) {
    isAdvancedVisible.value = false;
  }
}, { immediate: true, deep: true });

// Automatikus ID generálás (Csak új elemnél)
watch(() => editableComponent.value.name, (newName) => {
  if (props.isNew && newName) {
    editableComponent.value.id = newName.toLowerCase()
      .replace(/[áéíóöőúüű]/g, c => ({'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u'}[c] || c)) // Ékezetmentesítés
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '');
  }
});

function openFamilyModal() {
  newFamilyInput.value = ''; // Töröljük a mezőt
  isFamilyModalOpen.value = true;
}

function closeFamilyModal() {
  isFamilyModalOpen.value = false;
}

function confirmNewFamily() {
  if (!newFamilyInput.value) return;

  // ID Generálás
  const formattedId = newFamilyInput.value.toLowerCase()
    .replace(/[áéíóöőúüű]/g, c => ({'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u'}[c] || c))
    .replace(/\s+/g, '_')
    .replace(/[^\w-]+/g, '');

  if (formattedId) {
    // 1. Hozzáadjuk a helyi listához, hogy azonnal választható legyen
    if (!localFamilies.value.includes(formattedId) && !availableFamilies.value.includes(formattedId)) {
      localFamilies.value.push(formattedId);
    }
    
    // 2. Beállítjuk a komponensnek
    if (editableComponent.value) {
      editableComponent.value.familyId = formattedId;
    }

    closeFamilyModal();
  }
}

// --- LOGIKA ---
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  selectedFile.value = file;
  isProcessing.value = true;

  try {
    const analysis = await analyzeModel(file);
    const baseName = file.name.replace(/\.glb$/, '').replace(/_/g, ' ');
    
    editableComponent.value = {
      ...editableComponent.value,
      name: baseName, // Szebb név
      id: baseName.toLowerCase().replace(/\s+/g, '_'),
      model: `/models/${props.componentType}/${file.name}`,
      height: analysis.height,
      materialTarget: analysis.materialNames[0] || '',
      materialOptions: analysis.materialNames, 
      attachmentPoints: analysis.attachmentPointNames.map(name => ({
        id: name,
        allowedComponentTypes: [], // Alapból üres
      })),
    };
    modelMaterialOptions.value = analysis.materialNames;

  } catch (error) {
    console.error("Modell hiba:", error);
    alert("Nem sikerült feldolgozni a modellt.");
    selectedFile.value = null;
  } finally {
    isProcessing.value = false;
  }
}

function saveChanges() {
  if (editableComponent.value) {
    const componentToSave = JSON.parse(JSON.stringify(editableComponent.value));

    // Tisztítás: Ha nincs bepipálva, ne mentsük el az adatot
    if (!useHeight.value) delete componentToSave.height;
    if (!useMaterialSource.value) delete componentToSave.materialSource;
    
    // Üres familyId-t ne mentsünk
    if (componentToSave.familyId === '') delete componentToSave.familyId;

    // Validáció
    if ((componentToSave.price || 0) < 0) {
      alert("Az ár nem lehet negatív!");
      return;
    }

    emit('save', componentToSave as ComponentConfig, selectedFile.value);
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
    <div class="mb-6 p-6 border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 transition-colors text-center relative" v-if="isNew">
      <input type="file" @change="handleFileChange" accept=".glb" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
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
          <input type="text" v-model="editableComponent.name" class="admin-input font-bold"/>
        </div>

        <!-- Azonosító -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Azonosító (ID)</label>
          <input type="text" v-model="editableComponent.id" class="admin-input bg-gray-700/50 text-gray-400 cursor-not-allowed" readonly/>
        </div>

        <!-- Ár -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Ár (HUF)</label>
          <input type="number" v-model="editableComponent.price" placeholder="0" class="admin-input"/>
        </div>

        <!-- Kategória -->
        <div class="flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Kategória (Family)</label>
          <div class="flex gap-2">
            <!-- Most már az 'allFamilyOptions'-t használjuk -->
            <select v-model="editableComponent.familyId" class="admin-select flex-1 cursor-pointer">
              <option value="" disabled>Válassz...</option>
              <option value="">- Nincs -</option>
              <option v-for="fam in allFamilyOptions" :key="fam" :value="fam">
                {{ fam }}
              </option>
            </select>
            
            <!-- Gomb: Prompt helyett Modalt nyit -->
            <button @click="openFamilyModal" class="admin-btn-secondary px-3 font-bold text-xl flex items-center justify-center pb-1" title="Új kategória">
              +
            </button>
          </div>
        </div>

        <!-- Anyag Célpont -->
        <div class="col-span-2 flex flex-col gap-1">
          <label class="admin-label text-xs uppercase tracking-wider text-gray-400">Anyag Célpont (Material Target)</label>
          <select v-model="editableComponent.materialTarget" class="admin-select" :disabled="modelMaterialOptions.length === 0">
            <option v-if="modelMaterialOptions.length === 0" value="">⚠️ Nincs anyag a modellben</option>
            <option v-for="mat in modelMaterialOptions" :key="mat" :value="mat">{{ mat }}</option>
          </select>
        </div>

      </div>

      <!-- CSATLAKOZÁSI PONTOK (MODERN UI) -->
      <div v-if="editableComponent.attachmentPoints && editableComponent.attachmentPoints.length > 0" class="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 class="font-bold text-white mb-1">Csatlakozási Pontok</h4>
        <p class="text-xs text-gray-400 mb-4">Jelöld be, hogy az egyes pontokra milyen típusú elemek csatlakozhatnak!</p>
        
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
                <input type="checkbox" :value="type" v-model="point.allowedComponentTypes" class="hidden"/>
                {{ type }}
              </label>
            </div>

          </div>
        </div>
      </div>

      <!-- HALADÓ BEÁLLÍTÁSOK (Toggle) -->
      <div class="border-t border-gray-700 pt-4">
        <button @click="isAdvancedVisible = !isAdvancedVisible" class="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
          <span class="transform transition-transform" :class="isAdvancedVisible ? 'rotate-90' : ''">▶</span>
          Haladó beállítások
        </button>
        
        <div v-if="isAdvancedVisible" class="grid grid-cols-2 gap-4 mt-4">
          <!-- Magasság -->
          <div class="p-3 bg-gray-800 rounded border border-gray-700" :class="{'opacity-50': !useHeight}">
            <label class="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" v-model="useHeight" class="form-checkbox rounded text-blue-500"/>
              <span class="font-bold text-sm">Fix Magasság (Height)</span>
            </label>
            <input type="number" step="0.01" v-model="editableComponent.height" :disabled="!useHeight" class="admin-input"/>
            <p class="text-xs text-gray-500 mt-1">Pl. lábaknál a magasság meghatározásához.</p>
          </div>

          <!-- Anyag Forrás -->
          <div class="p-3 bg-gray-800 rounded border border-gray-700" :class="{'opacity-50': !useMaterialSource}">
            <label class="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" v-model="useMaterialSource" class="form-checkbox rounded text-blue-500"/>
              <span class="font-bold text-sm">Anyag Öröklés (Source)</span>
            </label>
            <input type="text" v-model="editableComponent.materialSource" placeholder="pl. corpus" :disabled="!useMaterialSource" class="admin-input"/>
            <p class="text-xs text-gray-500 mt-1">Ha az anyagot a szülőtől örökli (pl. korpusz szín).</p>
          </div>
        </div>
      </div>

    </div>

    <!-- MODAL: ÚJ KATEGÓRIA LÉTREHOZÁSA -->
    <div v-if="isFamilyModalOpen" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div class="bg-gray-800 border border-gray-600 p-6 rounded-lg shadow-2xl w-full max-w-md transform transition-all scale-100">
        <h3 class="text-xl font-bold text-white mb-4">Új Kategória Létrehozása</h3>
        
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-1">Kategória neve (pl. Modern Stílus)</label>
          <input 
            type="text" 
            v-model="newFamilyInput" 
            @keyup.enter="confirmNewFamily"
            class="admin-input w-full text-lg" 
            placeholder="Írd be a nevet..." 
            autofocus
          />
          <p class="text-xs text-gray-500 mt-2">
            Az azonosító automatikusan generálódik: <span class="font-mono text-blue-400">{{ newFamilyInput ? newFamilyInput.toLowerCase().replace(/[áéíóöőúüű]/g, c => ({'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u'}[c] || c)).replace(/\s+/g, '_').replace(/[^\w-]+/g, '') : '...' }}</span>
          </p>
        </div>

        <div class="flex justify-end gap-3">
          <button @click="closeFamilyModal" class="admin-btn-secondary">Mégse</button>
          <button @click="confirmNewFamily" class="admin-btn px-6">Létrehozás</button>
        </div>
      </div>
    </div>
  </div>
</template>