<script setup lang="ts">
import { ref, watch } from 'vue';
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

const editableComponent = ref<Partial<ComponentConfig>>({});
const selectedFile = ref<File | null>(null);
const isProcessing = ref(false);
const isAdvancedVisible = ref(false);
const modelMaterialOptions = ref<string[]>([]);

// --- LOKÁLIS ÁLLAPOTOK A CHECKBOXOKHOZ ---
const useHeight = ref(false);
const useMaterialSource = ref(false);

// Ez a lista a jövőben a globalSettings.json-ből jöhet
const componentTypeOptions = ['corpuses', 'fronts', 'handles', 'legs', 'accessories'];

watch(() => props.component, (newComponent) => {
  const comp = newComponent ? JSON.parse(JSON.stringify(newComponent)) : {};
  editableComponent.value = comp;
  selectedFile.value = null;
  modelMaterialOptions.value = [];
  
  // JAVÍTÁS: A 'comp' változót használjuk, amit a sor elején definiáltunk
  useHeight.value = comp.height !== undefined && comp.height !== null;
  useMaterialSource.value = !!comp.materialSource;

  if (!props.isNew) {
    isAdvancedVisible.value = false;
  }
}, { immediate: true, deep: true });

// Automatikus ID generálás a névből
watch(() => editableComponent.value.name, (newName) => {
  if (props.isNew && newName) {
    editableComponent.value.id = newName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
  }
});

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  selectedFile.value = file;
  isProcessing.value = true;

  try {
    const analysis = await analyzeModel(file);
    
    const baseName = file.name.replace(/\.glb$/, '');
    editableComponent.value = {
      ...editableComponent.value, // Megtartjuk a meglévő adatokat, pl. a típust
      name: baseName.replace(/_/g, ' '),
      id: baseName,
      model: `/models/${props.componentType}/${file.name}`, // Előre kitöltjük a várható útvonallal
      height: analysis.height,
      materialTarget: analysis.materialNames[0] || '',
      attachmentPoints: analysis.attachmentPointNames.map(name => ({
        id: name,
        allowedComponentTypes: [],
      })),
    };
    modelMaterialOptions.value = analysis.materialNames;

  } catch (error) {
    console.error("Modell analizálása sikertelen:", error);
    alert("Hiba a modell feldolgozása közben. Lehet, hogy a fájl sérült.");
    selectedFile.value = null; // Hiba esetén töröljük a fájlt
  } finally {
    isProcessing.value = false;
  }
}

function saveChanges() {
  if (editableComponent.value) {
    const componentToSave = JSON.parse(JSON.stringify(editableComponent.value));

    // Ha a checkbox nincs bepipálva, töröljük a property-t a mentendő objektumból
    if (!useHeight.value) {
      delete componentToSave.height;
    }
    if (!useMaterialSource.value) {
      delete componentToSave.materialSource;
    }

    emit('save', componentToSave as ComponentConfig, selectedFile.value);
  }
}

function deleteItem() {
  if (editableComponent.value && confirm(`Biztosan törlöd a(z) "${editableComponent.value.name}" komponenst?`)) {
    emit('delete', editableComponent.value as ComponentConfig);
  }
}
</script>

<template>
  <div class="admin-panel overflow-y-auto" v-if="editableComponent">
    <h3 class="text-xl font-bold mb-6">{{ isNew ? `Új Komponens (${componentType})` : `Szerkesztés: ${editableComponent.name}` }}</h3>
    
    <!-- FÁJL VÁLASZTÓ (csak új komponensnél vagy ha még nincs modell) -->
    <div class="mb-6" v-if="isNew">
      <label class="admin-label">1. Lépés: Modell Fájl Kiválasztása (.glb)</label>
      <div class="relative">
        <input type="file" @change="handleFileChange" accept=".glb" class="admin-input file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"/>
        <div v-if="isProcessing" class="absolute inset-0 bg-gray-800/80 flex items-center justify-center rounded-lg">
          <p class="text-yellow-400 animate-pulse">Modell feldolgozása...</p>
        </div>
      </div>
    </div>

    <!-- SZERKESZTŐ ŰRLAP (akkor jelenik meg, ha van mit szerkeszteni) -->
    <div v-if="editableComponent.id">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="admin-label">Név (name)</label>
            <input type="text" v-model="editableComponent.name" class="admin-input"/>
          </div>
          <div>
            <label class="admin-label">Azonosító (id)</label>
            <input type="text" v-model="editableComponent.id" class="admin-input bg-gray-700/50" readonly/>
          </div>
          <div>
            <label class="admin-label">Ár (price)</label>
            <input type="number" v-model="editableComponent.price" placeholder="pl. 45000" class="admin-input"/>
          </div>
          <div>
            <label class="admin-label">Cél Anyag (materialTarget)</label>
            <select v-model="editableComponent.materialTarget" class="admin-select">
              <option v-if="modelMaterialOptions.length === 0" value="">-- Nincs anyag a modellben --</option>
              <option v-for="mat in modelMaterialOptions" :key="mat" :value="mat">{{ mat }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- CSATLAKOZÁSI PONTOK -->
      <div class="mt-6 pt-6 border-t border-gray-700" v-if="editableComponent.attachmentPoints && editableComponent.attachmentPoints.length > 0">
        <h4 class="font-semibold mb-4 text-gray-300">Csatlakozási Pontok</h4>
        <div class="space-y-3">
          <div v-for="(point, index) in editableComponent.attachmentPoints" :key="index" class="grid grid-cols-[1fr_2fr] gap-4 items-center p-2 bg-gray-900/50 rounded-md">
            <label class="font-mono text-sm text-gray-400 truncate text-right">{{ point.id }}</label>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <label v-for="type in componentTypeOptions" :key="type" class="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" :value="type" v-model="point.allowedComponentTypes" class="form-checkbox bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 rounded"/>
                {{ type }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- HALADÓ BEÁLLÍTÁSOK -->
      <div class="mt-6 pt-6 border-t border-gray-700">
        <button @click="isAdvancedVisible = !isAdvancedVisible" class="text-blue-400 hover:text-blue-300 text-sm">
          {{ isAdvancedVisible ? '▼ Haladó beállítások elrejtése' : '► Haladó beállítások megjelenítése' }}
        </button>
        
        <div v-if="isAdvancedVisible" class="space-y-4 mt-4">
          <!-- Magasság (height) Szekció -->
          <div class="p-3 bg-gray-900/50 rounded-md">
            <label class="flex items-center gap-2 cursor-pointer">
              <!-- JAVÍTÁS: v-model a lokális 'useHeight' ref-re kötve -->
              <input type="checkbox" v-model="useHeight" class="form-checkbox rounded"/>
              <span class="admin-label !mb-0">Magasság (height) használata</span>
            </label>
            <p class="font-mono text-xs text-gray-500 mt-1 pl-6">
              Például lábaknál. Ez az opció a bútor alapértelmezett magasságát adja meg.
            </p>
            <input 
              type="number" 
              step="0.01" 
              v-model="editableComponent.height" 
              placeholder="Modellből kinyerve..." 
              class="admin-input mt-2 ml-6"
              :disabled="!useHeight"
              :class="{ 'opacity-50 cursor-not-allowed': !useHeight }"
            />
          </div>

          <!-- Anyag Forrása (materialSource) Szekció -->
          <div class="p-3 bg-gray-900/50 rounded-md">
            <label class="flex items-center gap-2 cursor-pointer">
              <!-- JAVÍTÁS: v-model a lokális 'useMaterialSource' ref-re kötve -->
              <input type="checkbox" v-model="useMaterialSource" class="form-checkbox rounded"/>
              <span class="admin-label !mb-0">Anyag öröklése (materialSource)</span>
            </label>
            <p class="font-mono text-xs text-gray-500 mt-1 pl-6">
              Amikor egy elem anyaga egy másik elemtől függ (pl. bútorlapláb a korpusztól).
            </p>
            <input 
              type="text" 
              v-model="editableComponent.materialSource" 
              placeholder="pl. corpus" 
              class="admin-input mt-2 ml-6"
              :disabled="!useMaterialSource"
              :class="{ 'opacity-50 cursor-not-allowed': !useMaterialSource }"
            />
          </div>
        </div>
      </div>

      <!-- GOMBOK -->
      <div class="flex justify-between items-center mt-8 pt-6 border-t border-gray-700">
        <button v-if="!isNew" @click="deleteItem" class="admin-btn-danger">Törlés</button>
        <div v-else></div> <!-- Üres div a helykihasználásért -->
        <div class="flex gap-4">
          <button @click="emit('cancel')" class="admin-btn-secondary">Mégse</button>
          <button @click="saveChanges" class="admin-btn">Mentés</button>
        </div>
      </div>
    </div>
    
    <!-- Üzenet, amíg nincs fájl kiválasztva -->
    <div v-else-if="isNew" class="text-center text-gray-500 p-8">
      <p>Kezdéshez válassz ki egy .glb modell fájlt.</p>
    </div>

  </div>
</template>