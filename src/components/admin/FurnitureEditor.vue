<!-- src/components/admin/FurnitureEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { FurnitureConfig, ComponentSlotConfig, SlotRotation, AttachmentPoints } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';

const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const allFurniture = ref<FurnitureConfig[]>([]);
const selectedFurniture = ref<Partial<FurnitureConfig> | null>(null);
const isNewFurniture = ref(false);

const componentTypesForSelect = computed(() => Object.keys(storeComponents.value));

const attachmentPointSuggestions = computed(() => {
  const points = new Set<string>();
  Object.values(storeComponents.value).flat().forEach(comp => {
    if (comp.attachmentPoints) {
      if ('self' in comp.attachmentPoints && comp.attachmentPoints.self) points.add(comp.attachmentPoints.self);
      if ('multiple' in comp.attachmentPoints && comp.attachmentPoints.multiple) comp.attachmentPoints.multiple.forEach(p => points.add(p));
    }
  });
  return Array.from(points).sort();
});

// JAVÍTÁS: Konstansok a radián értékekhez a pontosságért
const PI_HALF = Math.PI / 2;

onMounted(async () => {
  try {
    const response = await fetch('/database/furniture.json');
    if (!response.ok) throw new Error('A furniture.json betöltése sikertelen.');
    allFurniture.value = await response.json();
  } catch (error) {
    console.error(error);
  }
});

watch(() => selectedFurniture.value?.name, (newName) => {
  if (isNewFurniture.value && selectedFurniture.value && newName) {
    const normalizedName = newName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
    selectedFurniture.value.id = normalizedName;
  }
}, { deep: true });

function setRotation(axis: 'x' | 'y' | 'z', degrees: number, slot: ComponentSlotConfig) {
  if (!slot.rotation) slot.rotation = { x: 0, y: 0, z: 0 };
  slot.rotation[axis] = degrees === 0 ? 0 : (degrees / 180) * Math.PI;
}

function selectFurniture(furniture: FurnitureConfig) {
  selectedFurniture.value = JSON.parse(JSON.stringify(furniture));
  isNewFurniture.value = false;
}

function createNewFurniture() {
  selectedFurniture.value = {
    id: '',
    name: '',
    category: 'bottom_cabinets',
    componentSlots: [],
  };
  isNewFurniture.value = true;
}

function addSlot() {
  if (!selectedFurniture.value?.componentSlots) return;
  selectedFurniture.value.componentSlots.push({
    slotId: '',
    name: '',
    componentType: componentTypesForSelect.value[0] || '',
    allowedComponents: [],
    defaultComponent: '',
    attachToSlot: '',
    attachmentPoints: { self: '' },
    rotation: { x: 0, y: 0, z: 0 },
  });
}

function removeSlot(index: number) {
  if (!selectedFurniture.value?.componentSlots) return;
  selectedFurniture.value.componentSlots.splice(index, 1);
}

async function saveToServer() {
  const cleanData = allFurniture.value.map(furniture => {
    const cleanSlots = furniture.componentSlots.map(slot => {
      const cleanSlot: Partial<ComponentSlotConfig> = {};
      for (const key in slot) {
        const typedKey = key as keyof ComponentSlotConfig;
        const value = slot[typedKey];
        if (typedKey === 'attachmentPoints') {
          const points = value as AttachmentPoints;
          if (points && 'self' in points && points.self) cleanSlot.attachmentPoints = { self: points.self };
          else if (points && 'multiple' in points && points.multiple && points.multiple.length > 0) cleanSlot.attachmentPoints = { multiple: points.multiple };
        } else if (typedKey === 'rotation') {
          const rot = value as SlotRotation;
          if (rot && (rot.x !== 0 || rot.y !== 0 || rot.z !== 0)) cleanSlot.rotation = rot;
        } else if (value !== '' && value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)) {
          // JAVÍTÁS: Itt is a szándékos 'any' kényszerítést használjuk az ESLint kikapcsolásával.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cleanSlot as any)[typedKey] = value;
        }
      }
      return cleanSlot as ComponentSlotConfig;
    });
    return { ...furniture, componentSlots: cleanSlots };
  });

  try {
    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'furniture.json', data: cleanData }),
    });
    if (!response.ok) throw new Error(await response.text());
    alert('Bútorok sikeresen mentve!');
  } catch (error) {
    console.error(error);
    alert('Hiba a mentés közben.');
  }
}

function saveFurniture() {
  if (!selectedFurniture.value || !selectedFurniture.value.id) return;
  if (isNewFurniture.value) {
    allFurniture.value.push(selectedFurniture.value as FurnitureConfig);
  } else {
    const index = allFurniture.value.findIndex(f => f.id === selectedFurniture.value!.id);
    if (index !== -1) {
      allFurniture.value[index] = selectedFurniture.value as FurnitureConfig;
    }
  }
  selectedFurniture.value = null;
}
</script>

<template>
  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Bal oldali oszlop: Bútorlista -->
    <div class="w-full lg:w-1/3 bg-gray-900 p-4 rounded-lg self-start">
      <div class="flex justify-end mb-4">
        <button @click="saveToServer" class="admin-btn">Mentés</button>
      </div>
      <div class="space-y-2 max-h-[70vh] overflow-y-auto">
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
      <h3 class="text-xl font-bold mb-6">{{ isNewFurniture ? 'Új Bútor' : 'Szerkesztés' }}</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div>
          <label class="admin-label">name</label>
          <input type="text" v-model="selectedFurniture.name" placeholder="Bútor neve..." class="admin-input" />
        </div>
        <div>
          <label class="admin-label">id</label>
          <input type="text" v-model="selectedFurniture.id" placeholder="Automatikus..." class="admin-input" :disabled="!isNewFurniture" />
        </div>
        <div>
          <label class="admin-label">category</label>
          <input type="text" v-model="selectedFurniture.category" placeholder="pl. bottom_cabinets" class="admin-input" />
        </div>
      </div>

      <div class="space-y-6">
        <div v-for="(slot, index) in selectedFurniture.componentSlots" :key="index" class="bg-gray-800 p-4 rounded-md border border-gray-700">
          <div class="flex justify-between items-center">
            <input type="text" v-model="slot.name" placeholder="Slot olvasható neve..." class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0"/>
            <button @click="removeSlot(index)" class="admin-btn-danger text-xs !py-1 !px-2">Slot Törlése</button>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label class="admin-label">slotId</label>
              <input type="text" v-model="slot.slotId" placeholder="pl. corpus, front" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">attachToSlot</label>
              <input type="text" v-model="slot.attachToSlot" placeholder="pl. corpus (üres = gyökér)" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">componentType</label>
              <select v-model="slot.componentType" class="admin-select">
                <option v-for="type in componentTypesForSelect" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <div>
              <label class="admin-label">defaultComponent</label>
              <select v-if="slot.componentType && storeComponents[slot.componentType]" v-model="slot.defaultComponent" class="admin-select">
                <option v-for="comp in storeComponents[slot.componentType]" :key="comp.id" :value="comp.id">{{ comp.name }}</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="admin-label">allowedComponents</label>
              <select v-if="slot.componentType && storeComponents[slot.componentType]" multiple v-model="slot.allowedComponents" class="admin-input h-32">
                <option v-for="comp in storeComponents[slot.componentType]" :key="comp.id" :value="comp.id">{{ comp.name }}</option>
              </select>
            </div>
            
            <!-- Haladó beállítások: Forgatás és Csatolási Pontok -->
            <div class="col-span-2 grid grid-cols-1 gap-4 mt-4">
              <div v-if="slot.rotation" class="bg-gray-900 p-3 rounded">
                <label class="admin-label mb-2">rotation</label>
                <div class="flex items-center gap-x-4">
                  <span class="font-mono text-lg text-center">X</span>
                  <div class="flex gap-1">
                    <button @click="setRotation('x', -90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.x + PI_HALF) < 0.001}">-90°</button>
                    <button @click="setRotation('x', 0, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.x) < 0.001}">0°</button>
                    <button @click="setRotation('x', 90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.x - PI_HALF) < 0.001}">+90°</button>
                  </div>
                  <span class="font-mono text-lg text-center">Y</span>
                  <div class="flex gap-1">
                    <button @click="setRotation('y', -90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.y + PI_HALF) < 0.001}">-90°</button>
                    <button @click="setRotation('y', 0, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.y) < 0.001}">0°</button>
                    <button @click="setRotation('y', 90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.y - PI_HALF) < 0.001}">+90°</button>
                  </div>
                  <span class="font-mono text-lg text-center">Z</span>
                  <div class="flex gap-1">
                    <button @click="setRotation('z', -90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.z + PI_HALF) < 0.001}">-90°</button>
                    <button @click="setRotation('z', 0, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.z) < 0.001}">0°</button>
                    <button @click="setRotation('z', 90, slot)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': Math.abs(slot.rotation.z - PI_HALF) < 0.001}">+90°</button>
                  </div>
                </div>
              </div>
              
              <div v-if="slot.attachmentPoints && typeof slot.attachmentPoints === 'object'" class="bg-gray-900 p-3 rounded">
                <label class="admin-label">attachmentPoints</label>
                <input v-if="'self' in slot.attachmentPoints" type="text" v-model="slot.attachmentPoints.self" placeholder="attach_pont_neve" class="admin-input" list="attachment-points-list"/>
                <datalist id="attachment-points-list">
                  <option v-for="point in attachmentPointSuggestions" :key="point" :value="point" />
                </datalist>
              </div>
            </div>
          </div> <!-- JAVÍTÁS: EZ VOLT A HIÁNYZÓ LEZÁRÓ DIV -->
        </div>
      </div>
      
      <button @click="addSlot" class="admin-btn-secondary w-full mt-6">Új Slot Hozzáadása</button>

      <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
        <button @click="selectedFurniture = null" class="admin-btn-secondary">Mégse</button>
        <button @click="saveFurniture" class="admin-btn">Változások Alkalmazása</button>
      </div>
    </div>
  </div>
</template>