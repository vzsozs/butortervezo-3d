<!-- src/components/admin/SlotNode.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia'; // VISSZATÉVE
import { useConfigStore } from '@/stores/config'; // VISSZATÉVE
import type { ComponentSlotConfig } from '@/config/furniture';

type TreeNode = ComponentSlotConfig & { children?: TreeNode[] };

const props = defineProps<{
  node: TreeNode;
  highlightedSlotId?: string | null; 
  suggestions: {
    componentTypes: string[];
    attachmentPoints: string[];
  };
}>();

// --- STORE IMPORT VISSZAÁLLÍTVA ---
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

// --- TÍPUSOK ÉS EMIT DEFINÍCIÓ ---
type SlotUpdatePayload = { key: keyof ComponentSlotConfig; value: ComponentSlotConfig[keyof ComponentSlotConfig] };

const emit = defineEmits<{
  (e: 'update:slot', payload: SlotUpdatePayload): void;
  (e: 'remove:slot'): void;
  (e: 'update:slot', payload: { slotId: string; update: SlotUpdatePayload }): void;
  (e: 'remove:slot', slotId: string): void;
}>();

const isHighlighted = computed(() => props.node.slotId === props.highlightedSlotId);

function updateSlot<K extends keyof ComponentSlotConfig>(key: K, value: ComponentSlotConfig[K]) {
  emit('update:slot', { key, value });
}

function removeSlot() {
  emit('remove:slot');
}

// --- FORGATÁSI LOGIKA (VÁLTOZATLAN) ---
const rotationInDegrees = computed(() => {
  const rad = props.node.rotation || { x: 0, y: 0, z: 0 };
  const toDeg = (r: number) => Math.round(r * (180 / Math.PI));
  const normalize = (deg: number) => (deg % 360 + 360) % 360;
  return {
    x: normalize(toDeg(rad.x)),
    y: normalize(toDeg(rad.y)),
    z: normalize(toDeg(rad.z)),
  };
});

function rotate(axis: 'x' | 'y' | 'z', degrees: number) {
  const currentDegrees = rotationInDegrees.value[axis];
  let newDegrees = currentDegrees + degrees;
  newDegrees = (newDegrees % 360 + 360) % 360;
  const newRotation = { ...(props.node.rotation || { x: 0, y: 0, z: 0 }) };
  newRotation[axis] = newDegrees * (Math.PI / 180);
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
      <!-- ... a komponens választó részek változatlanok ... -->
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
      
      <!-- AZ ÚJ, JAVÍTOTT FORGATÓ UI -->
      <div v-if="node.attachToSlot" class="bg-gray-900 p-3 rounded">
        <label class="admin-label mb-2">Rotation</label>
        <div class="grid grid-cols-3 gap-2 items-center text-center">
          <!-- X Tengely -->
          <div class="flex items-center justify-center gap-1"> <!-- JAVÍTÁS: items-center -->
            <button @click="rotate('x', -90)" class="admin-btn-secondary !p-2">&lt;</button>
            <div class="flex flex-col items-center"> 
              <span class="text-xs text-gray-500">X</span>
              <span class="font-mono text-lg w-16 block bg-gray-800 rounded py-1 text-gray-400">{{ rotationInDegrees.x }}°</span>
            </div>
            <button @click="rotate('x', 90)" class="admin-btn-secondary !p-2">&gt;</button>
          </div>
          <!-- Y Tengely -->
          <div class="flex items-center justify-center gap-1"> <!-- JAVÍTÁS: items-center -->
            <button @click="rotate('y', -90)" class="admin-btn-secondary !p-2">&lt;</button>
            <div class="flex flex-col items-center"> 
              <span class="text-xs text-gray-500">Y</span>
              <span class="font-mono text-lg w-16 block bg-gray-800 rounded py-1 text-gray-400">{{ rotationInDegrees.y }}°</span>
            </div>
            <button @click="rotate('y', 90)" class="admin-btn-secondary !p-2">&gt;</button>
          </div>
          <!-- Z Tengely -->
          <div class="flex items-center justify-center gap-1"> <!-- JAVÍTÁS: items-center -->
            <button @click="rotate('z', -90)" class="admin-btn-secondary !p-2">&lt;</button>
            <div class="flex flex-col items-center"> 
              <span class="text-xs text-gray-500">Z</span>
              <span class="font-mono text-lg w-16 block bg-gray-800 rounded py-1 text-gray-400">{{ rotationInDegrees.z }}°</span>
            </div>
            <button @click="rotate('z', 90)" class="admin-btn-secondary !p-2">&gt;</button>
          </div>
        </div>
      </div>
      
      <div v-if="node.attachToSlot" class="bg-gray-900 p-3 rounded">
        <label class="admin-label">Használt csatlakozási pont a szülőn</label>
        <input
          type="text"
          :value="node.useAttachmentPoint"
          @input="updateSlot('useAttachmentPoint', ($event.target as HTMLInputElement).value)"
          placeholder="attach_pont_neve"
          class="admin-input"
          list="attachment-points-list"
        />
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
        @update:slot="payload => emit('update:slot', { slotId: childNode.slotId, update: payload as SlotUpdatePayload })"
        @remove:slot="$emit('remove:slot', childNode.slotId)"
      />
    </div>
  </div>
</template>