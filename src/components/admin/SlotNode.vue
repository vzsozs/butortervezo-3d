<!-- src/components/admin/SlotNode.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { ComponentSlotConfig } from '@/config/furniture';
import { computed } from 'vue';

// --- TÍPUSOK ---
// JAVÍTÁS: Helyes rekurzív típus definiálása az 'any' helyett.
// Egy fa-csomópont, ami egy slot, és lehetnek gyerekei, amik szintén fa-csomópontok.
type TreeNode = ComponentSlotConfig & { children?: TreeNode[] };

// --- PROPS & EMITS ---
const props = defineProps<{
  node: TreeNode;
  // JAVÍTÁS: A konkrét slot ID-t kapjuk meg, nem egy boolean-t
  highlightedSlotId?: string | null; 
  suggestions: {
    componentTypes: string[];
    attachmentPoints: string[];
  };
}>();

const isHighlighted = computed(() => props.node.slotId === props.highlightedSlotId);

const emit = defineEmits(['update:slot', 'remove:slot']);

// --- STORE ---
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

// --- HELPER FÜGGVÉNYEK ---
const PI_HALF = Math.PI / 2;

function updateSlot<K extends keyof ComponentSlotConfig>(key: K, value: ComponentSlotConfig[K]) {
  emit('update:slot', { key, value });
}

function removeSlot() {
  emit('remove:slot');
}

function setRotation(axis: 'x' | 'y' | 'z', degrees: number) {
  const newRotation = { ...(props.node.rotation || { x: 0, y: 0, z: 0 }) };
  newRotation[axis] = degrees === 0 ? 0 : (degrees / 180) * Math.PI;
  updateSlot('rotation', newRotation);
}
</script>

<template>
  <div class="bg-gray-800 p-4 rounded-md border border-gray-700 transition-all duration-300"
    :class="{ 'shadow-lg shadow-blue-500/50 ring-2 ring-blue-500': isHighlighted }">
    <!-- Fejléc -->
    <div class="flex justify-between items-center">
      <input type="text" :value="node.name" @input="updateSlot('name', ($event.target as HTMLInputElement).value)" placeholder="Slot neve..." class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0"/>
      <button @click="removeSlot" class="admin-btn-danger text-xs !py-1 !px-2">Törlés</button>
    </div>

    <!-- Alap beállítások -->
    <div class="grid grid-cols-2 gap-4 mt-4">
      <div>
        <label class="admin-label">slotId</label>
        <input type="text" :value="node.slotId" @input="updateSlot('slotId', ($event.target as HTMLInputElement).value)" placeholder="pl. corpus" class="admin-input" />
      </div>
      <div>
        <label class="admin-label">attachToSlot (szülő)</label>
        <input type="text" :value="node.attachToSlot" @input="updateSlot('attachToSlot', ($event.target as HTMLInputElement).value)" placeholder="pl. corpus" class="admin-input" />
      </div>
    </div>

    <!-- Komponens választás -->
    <div class="grid grid-cols-2 gap-4 mt-4 border-t border-gray-700 pt-4">
      <div>
        <label class="admin-label">componentType</label>
        <select :value="node.componentType" @change="updateSlot('componentType', ($event.target as HTMLSelectElement).value)" class="admin-select">
          <option v-for="type in suggestions.componentTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div>
        <label class="admin-label">defaultComponent</label>
        <select v-if="node.componentType && storeComponents[node.componentType]" :value="node.defaultComponent" @change="updateSlot('defaultComponent', ($event.target as HTMLSelectElement).value)" class="admin-select">
          <option v-for="comp in storeComponents[node.componentType]" :key="comp.id" :value="comp.id">{{ comp.name }}</option>
        </select>
      </div>
      <div class="col-span-2">
        <label class="admin-label">allowedComponents</label>
        <select v-if="node.componentType && storeComponents[node.componentType]" multiple :value="node.allowedComponents" @change="updateSlot('allowedComponents', Array.from(($event.target as HTMLSelectElement).selectedOptions).map(o => o.value))" class="admin-input h-32">
          <option v-for="comp in storeComponents[node.componentType]" :key="comp.id" :value="comp.id">{{ comp.name }}</option>
        </select>
      </div>
    </div>

    <!-- Haladó beállítások -->
    <div class="grid grid-cols-1 gap-4 mt-4 border-t border-gray-700 pt-4">
      <div class="bg-gray-900 p-3 rounded">
        <label class="admin-label mb-2">rotation</label>
        <div class="flex items-center gap-x-4 flex-wrap">
          <span class="font-mono text-lg text-center">X</span>
          <div class="flex gap-1">
            <!-- JAVÍTÁS: -PI_HALF -->
            <button @click="setRotation('x', -90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.x.toFixed(4) === (-PI_HALF).toFixed(4)}">-90°</button>
            <button @click="setRotation('x', 0)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': !node.rotation || node.rotation.x.toFixed(4) === (0.0).toFixed(4)}">0°</button>
            <button @click="setRotation('x', 90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.x.toFixed(4) === PI_HALF.toFixed(4)}">+90°</button>
          </div>
          <span class="font-mono text-lg text-center">Y</span>
          <div class="flex gap-1">
            <!-- JAVÍTÁS: -PI_HALF -->
            <button @click="setRotation('y', -90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.y.toFixed(4) === (-PI_HALF).toFixed(4)}">-90°</button>
            <button @click="setRotation('y', 0)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': !node.rotation || node.rotation.y.toFixed(4) === (0.0).toFixed(4)}">0°</button>
            <button @click="setRotation('y', 90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.y.toFixed(4) === PI_HALF.toFixed(4)}">+90°</button>
          </div>
          <span class="font-mono text-lg text-center">Z</span>
          <div class="flex gap-1">
            <!-- JAVÍTÁS: -PI_HALF -->
            <button @click="setRotation('z', -90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.z.toFixed(4) === (-PI_HALF).toFixed(4)}">-90°</button>
            <button @click="setRotation('z', 0)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': !node.rotation || node.rotation.z.toFixed(4) === (0.0).toFixed(4)}">0°</button>
            <button @click="setRotation('z', 90)" class="admin-btn-secondary !px-2 !py-1 text-xs" :class="{'!bg-blue-600 text-white': node.rotation && node.rotation.z.toFixed(4) === PI_HALF.toFixed(4)}">+90°</button>
          </div>
        </div>
      </div>
      
      <div v-if="node.attachmentPoints" class="bg-gray-900 p-3 rounded">
        <label class="admin-label">attachmentPoints</label>
        <input v-if="'self' in node.attachmentPoints" type="text" :value="node.attachmentPoints.self" @input="updateSlot('attachmentPoints', { self: ($event.target as HTMLInputElement).value })" placeholder="attach_pont_neve" class="admin-input" list="attachment-points-list"/>
        <datalist id="attachment-points-list">
          <option v-for="point in suggestions.attachmentPoints" :key="point" :value="point" />
        </datalist>
      </div>
    </div>

    <!-- Rekurzív rész -->
    <div v-if="node.children && node.children.length > 0" class="ml-6 mt-4 space-y-4 border-l-2 border-gray-600 pl-4">
      <SlotNode 
        v-for="childNode in node.children" 
        :key="childNode.slotId"
        :node="childNode"
        :suggestions="suggestions"
        :highlighted-slot-id="highlightedSlotId" 
        @update:slot="$emit('update:slot', { slotId: childNode.slotId, update: $event })"
        @remove:slot="$emit('remove:slot', childNode.slotId)"
      />
    </div>
  </div>
</template>