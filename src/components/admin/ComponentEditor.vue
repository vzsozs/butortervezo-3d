<!-- src/components/admin/ComponentEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { ComponentConfig } from '@/config/furniture';

// --- ÁLLAPOT (STATE) ---
const allComponents = ref<Record<string, ComponentConfig[]>>({});
const componentTypes = computed(() => Object.keys(allComponents.value));
const selectedType = ref<string>('');
const selectedComponent = ref<ComponentConfig | null>(null);
const isNewComponent = ref(false);

// --- ADATBETÖLTÉS ---
onMounted(async () => {
  try {
    const response = await fetch('/database/components.json');
    if (!response.ok) throw new Error('A components.json betöltése sikertelen.');
    allComponents.value = await response.json();
    
    // JAVÍTÁS: Ellenőrizzük, hogy a componentTypes[0] létezik-e
    const firstType = componentTypes.value[0];
    if (firstType) {
      selectedType.value = firstType;
    }
  } catch (error) {
    console.error(error);
    alert('Hiba a components.json betöltésekor. Nézd meg a konzolt!');
  }
});

// --- FELHASZNÁLÓI INTERAKCIÓK ---

function selectComponent(component: ComponentConfig) {
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
}

function createNewComponent() {
  if (!selectedType.value) return;
  selectedComponent.value = {
    id: 'uj_komponens_id',
    name: 'Új Komponens',
    model: '/models/placeholder.glb',
  };
  isNewComponent.value = true;
}

function saveComponent() {
  if (!selectedComponent.value || !selectedType.value) return;

  const componentsList = allComponents.value[selectedType.value];
  // JAVÍTÁS: Ellenőrizzük, hogy a componentsList létezik-e
  if (!componentsList) {
    console.error(`Hiba: Nem található komponens lista a(z) "${selectedType.value}" típushoz.`);
    return;
  }

  if (isNewComponent.value) {
    componentsList.push(selectedComponent.value);
  } else {
    const index = componentsList.findIndex(c => c.id === selectedComponent.value!.id);
    if (index !== -1) {
      componentsList[index] = selectedComponent.value;
    }
  }
  selectedComponent.value = null;
}

function deleteComponent() {
  if (!selectedComponent.value || !selectedType.value || isNewComponent.value) return;
  
  if (confirm(`Biztosan törölni szeretnéd a(z) "${selectedComponent.value.name}" komponenst?`)) {
    const componentsList = allComponents.value[selectedType.value];
    // Itt is hozzáadhatunk egy ellenőrzést a biztonság kedvéért
    if (!componentsList) return;
    const index = componentsList.findIndex(c => c.id === selectedComponent.value!.id);
    if (index !== -1) {
      componentsList.splice(index, 1);
    }
    selectedComponent.value = null;
  }
}

function downloadJson() {
  const jsonString = JSON.stringify(allComponents.value, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'components.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert('A components.json letöltve! Kérlek, másold be a "public/database" mappába és frissítsd az oldalt.');
}
</script>

<template>
  <div class="grid grid-cols-12 gap-8">
    
    <!-- Bal oldali oszlop: Lista -->
    <div class="col-span-4 bg-gray-900 p-4 rounded-lg">
      <div class="flex justify-between items-center mb-4">
        <select v-model="selectedType" class="admin-select">
          <option v-for="type in componentTypes" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <button @click="downloadJson" class="admin-btn-secondary">JSON Letöltése</button>
      </div>
      
      <div class="space-y-2">
        <!-- JAVÍTÁS: v-if a külső template tagen -->
        <template v-if="selectedType && allComponents[selectedType]">
          <div v-for="component in allComponents[selectedType]" :key="component.id"
            @click="selectComponent(component)"
            class="p-2 rounded cursor-pointer hover:bg-gray-700"
            :class="{ 'bg-blue-600 hover:bg-blue-500': selectedComponent?.id === component.id }"
          >
            <p class="font-semibold">{{ component.name }}</p>
            <p class="text-xs text-gray-400">{{ component.id }}</p>
          </div>
        </template>
      </div>
      <button @click="createNewComponent" class="admin-btn w-full mt-4">Új Komponens</button>
    </div>

    <!-- Jobb oldali oszlop: Szerkesztő -->
    <div class="col-span-8 bg-gray-900 p-6 rounded-lg" v-if="selectedComponent">
      <h3 class="text-xl font-bold mb-6">{{ isNewComponent ? 'Új Komponens Létrehozása' : 'Komponens Szerkesztése' }}</h3>
      
      <div class="space-y-4">
        <!-- JAVÍTÁS: A v-model-t a selectedComponent[key as keyof ComponentConfig]-re cseréljük a típusbiztonságért -->
        <div v-for="(value, key) in selectedComponent" :key="key">
          <label :for="key" class="block text-sm font-medium text-gray-300 mb-1">{{ key }}</label>
          <input 
            type="text" 
            :id="key" 
            v-model="selectedComponent[key as keyof ComponentConfig]"
            class="admin-input"
            :disabled="key === 'id' && !isNewComponent"
          />
        </div>
      </div>

      <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
        <button v-if="!isNewComponent" @click="deleteComponent" class="admin-btn-danger">Törlés</button>
        <button @click="selectedComponent = null" class="admin-btn-secondary">Mégse</button>
        <button @click="saveComponent" class="admin-btn">Mentés</button>
      </div>
    </div>
    <div v-else class="col-span-8 flex items-center justify-center text-gray-500">
      <p>Válassz ki egy komponenst a szerkesztéshez, vagy hozz létre egy újat.</p>
    </div>

  </div>
</template>

<!-- A stílusok maradhatnak a main.css-ben -->