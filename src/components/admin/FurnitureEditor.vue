<!-- src/components/admin/FurnitureEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import type { FurnitureConfig, ComponentSlotConfig } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';

const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const allFurniture = ref<FurnitureConfig[]>([]);
const selectedFurniture = ref<FurnitureConfig | null>(null);
const isNewFurniture = ref(false);

const componentTypesForSelect = computed(() => {
  console.log('[FurnitureEditor] Computed property újra lefutott. A storeComponents.value:', storeComponents.value);
  return Object.keys(storeComponents.value);
});

onMounted(async () => {
  try {
    const response = await fetch('/database/furniture.json');
    if (!response.ok) throw new Error('A furniture.json betöltése siktertelen.');
    allFurniture.value = await response.json();
  } catch (error) {
    console.error(error);
  }
});

function selectFurniture(furniture: FurnitureConfig) {
  selectedFurniture.value = JSON.parse(JSON.stringify(furniture));
  isNewFurniture.value = false;
}

function createNewFurniture() {
  selectedFurniture.value = {
    id: 'uj_butor_id',
    name: 'Új Bútor',
    category: 'bottom_cabinets',
    componentSlots: [],
  };
  isNewFurniture.value = true;
}

function saveFurniture() {
  if (!selectedFurniture.value) return;
  if (isNewFurniture.value) {
    allFurniture.value.push(selectedFurniture.value);
  } else {
    const index = allFurniture.value.findIndex(f => f.id === selectedFurniture.value!.id);
    if (index !== -1) {
      allFurniture.value[index] = selectedFurniture.value;
    }
  }
  selectedFurniture.value = null;
}

function addSlot() {
  if (!selectedFurniture.value) return;
  selectedFurniture.value.componentSlots.push({
    slotId: `slot_${selectedFurniture.value.componentSlots.length + 1}`,
    name: 'Új Slot',
    componentType: '',
    allowedComponents: [],
    defaultComponent: '',
    attachToSlot: 'corpus',
    attachmentPoints: { self: 'attach_point_name' },
  });
}

function onComponentTypeChange(slot: ComponentSlotConfig) {
  slot.allowedComponents = [];
  slot.defaultComponent = '';
}

function removeSlot(index: number) {
  if (!selectedFurniture.value) return;
  selectedFurniture.value.componentSlots.splice(index, 1);
}

function downloadJson() {
  const jsonString = JSON.stringify(allFurniture.value, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'furniture.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert('A furniture.json letöltve! Kérlek, másold be a "public/database" mappába és frissítsd az oldalt.');
}
</script>

<template>
  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Diagnosztikai blokk -->
    <div class="bg-yellow-900 text-white p-4 mb-8 rounded-lg lg:absolute lg:top-32 lg:right-8 z-10">
      <h3 class="font-bold text-lg">Diagnosztikai Információ</h3>
      <p class="text-sm">A store-ból érkező 'components' ref:</p>
      <pre class="bg-black p-2 rounded mt-2 text-xs overflow-auto max-h-48">{{ storeComponents }}</pre>
    </div>
    
    <!-- Bal oldali oszlop: Bútorlista -->
    <div class="w-full lg:w-1/3 bg-gray-900 p-4 rounded-lg self-start">
      <div class="flex justify-end mb-4">
        <button @click="configStore.fillWithTestData()" class="admin-btn-secondary bg-green-600 hover:bg-green-500">Teszt Adat</button>
        <button @click="downloadJson" class="admin-btn-secondary">JSON Letöltése</button>
      </div>
      <div class="space-y-2">
        <div v-for="furniture in allFurniture" :key="furniture.id"
          @click="selectFurniture(furniture)"
          class="p-2 rounded cursor-pointer hover:bg-gray-700"
          :class="{ 'bg-blue-600 hover:bg-blue-500': selectedFurniture?.id === furniture.id }">
          <p class="font-semibold">{{ furniture.name }}</p>
          <p class="text-xs text-gray-400">{{ furniture.id }}</p>
        </div>
      </div>
      <button @click="createNewFurniture" class="admin-btn w-full mt-4">Új Bútor</button>
    </div>

    <!-- Jobb oldali oszlop: Bútor Szerkesztő -->
    <div class="w-full lg:w-2/3 bg-gray-900 p-6 rounded-lg" v-if="selectedFurniture">
      <h3 class="text-xl font-bold mb-6">{{ isNewFurniture ? 'Új Bútor Létrehozása' : 'Bútor Szerkesztése' }}</h3>
      
      <!-- Bútor alapadatai -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div>
          <label for="furnitureId" class="admin-label">ID</label>
          <input type="text" id="furnitureId" v-model="selectedFurniture.id" class="admin-input" :disabled="!isNewFurniture" />
        </div>
        <div>
          <label for="furnitureName" class="admin-label">Név</label>
          <input type="text" id="furnitureName" v-model="selectedFurniture.name" class="admin-input" />
        </div>
        <div>
          <label for="furnitureCategory" class="admin-label">Kategória</label>
          <input type="text" id="furnitureCategory" v-model="selectedFurniture.category" class="admin-input" />
        </div>
      </div>

      <!-- Slotok szerkesztése -->
      <h4 class="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">Komponens Slotok</h4>
      <div class="space-y-6">
        <div v-for="(slot, index) in selectedFurniture.componentSlots" :key="index" class="bg-gray-800 p-4 rounded-md border border-gray-700">
          <div class="flex justify-between items-center mb-4">
            <input type="text" v-model="slot.name" class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0" placeholder="Slot neve"/>
            <button @click="removeSlot(index)" class="admin-btn-danger text-xs !py-1 !px-2">Slot Törlése</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="admin-label">slotId</label>
              <input type="text" v-model="slot.slotId" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">attachToSlot (üres, ha gyökér)</label>
              <input type="text" v-model="slot.attachToSlot" class="admin-input" />
            </div>
            <div class="col-span-1 md:col-span-2">
              <label class="admin-label">componentType</label>
              <select v-model="slot.componentType" @change="onComponentTypeChange(slot)" class="admin-select">
                  <option disabled value="">Válassz típust...</option>
                  <option v-for="type in componentTypesForSelect" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <div class="col-span-1 md:col-span-2">
              <label class="admin-label">allowedComponents (Válaszd ki a listából)</label>
              <select v-if="slot.componentType && storeComponents[slot.componentType]" multiple v-model="slot.allowedComponents" class="admin-input h-32">
                <option v-for="comp in storeComponents[slot.componentType]" :key="comp.id" :value="comp.id">
                  {{ comp.name }} ({{ comp.id }})
                </option>
              </select>
              <div v-else class="admin-input h-32 flex items-center justify-center text-gray-500">
                Először válassz komponens típust.
              </div>
            </div>
            <div class="col-span-1 md:col-span-2">
              <label class="admin-label">defaultComponent</label>
              <select v-if="slot.allowedComponents.length > 0" v-model="slot.defaultComponent" class="admin-select">
                <option disabled value="">Válassz alapértelmezettet...</option>
                <option v-for="compId in slot.allowedComponents" :key="compId" :value="compId">{{ compId }}</option>
              </select>
              <div v-else class="admin-input flex items-center justify-center text-gray-500 text-sm">
                Először válassz engedélyezett komponenseket.
              </div>
            </div>
          </div>
        </div>
      </div>
      <button @click="addSlot" class="admin-btn-secondary w-full mt-6">Új Slot Hozzáadása</button>

      <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
        <button @click="selectedFurniture = null" class="admin-btn-secondary">Mégse</button>
        <button @click="saveFurniture" class="admin-btn">Mentés</button>
      </div>
    </div>
    <div v-else class="w-full lg:w-2/3 flex items-center justify-center text-gray-500 h-96">
      <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
    </div>
  </div>
</template>

<style scoped>
.admin-label {
  @apply block text-sm font-medium text-gray-300 mb-1;
}
</style>