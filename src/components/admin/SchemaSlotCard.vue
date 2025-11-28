<script setup lang="ts">
import { computed, ref } from 'vue';
import { useConfigStore } from '@/stores/config';
import type { ComponentSlotConfig } from '@/config/furniture';
import ChevronDown from '@/assets/icons/chevron-down.svg?component';
import ComponentSelectorModal from './ComponentSelectorModal.vue';

const props = defineProps<{
  pointId: string;
  parentPath: string;
  schema: Record<string, string | null>;
  allowedTypes: string[];
  depth?: number;
  getSlot: (path: string, pointId: string) => ComponentSlotConfig | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:schema', path: string, componentId: string | null): void;
  (e: 'update:slot', slotId: string, update: Partial<ComponentSlotConfig>): void;
  (e: 'update:schema-property', path: string, update: Partial<ComponentSlotConfig>): void;
}>();

const configStore = useConfigStore();
const isExpanded = ref(true);
const showSettings = ref(false);

// ÁLLAPOT: Melyik módban van a modal?
const activeModalMode = ref<'single' | 'multiple' | null>(null);

// --- COMPUTED ---
const currentPath = computed(() => `${props.parentPath}__${props.pointId}`);
const assignedComponentId = computed(() => props.schema[currentPath.value]);

const slotConfig = computed(() => props.getSlot(props.parentPath, props.pointId));

const assignedComponent = computed(() =>
  assignedComponentId.value ? configStore.getComponentById(assignedComponentId.value) : null
);

const childPoints = computed(() => assignedComponent.value?.attachmentPoints || []);

const rotationInDegrees = computed(() => {
  const rad = slotConfig.value?.rotation || { x: 0, y: 0, z: 0 };
  const toDeg = (r: number) => Math.round(r * (180 / Math.PI));
  const normalize = (deg: number) => (deg % 360 + 360) % 360;
  return { x: normalize(toDeg(rad.x)), y: normalize(toDeg(rad.y)), z: normalize(toDeg(rad.z)) };
});

// --- ACTIONS ---

function handleSingleSelect(componentId: string) {
  emit('update:schema', currentPath.value, componentId || null);
  activeModalMode.value = null;
}

function handleMultiSelect(componentIds: string[]) {
  updateSlotProperty('allowedComponents', componentIds);

  const current = assignedComponentId.value;
  if (componentIds.length === 0) {
    if (current) emit('update:schema', currentPath.value, null);
  } else {
    if (!current || !componentIds.includes(current)) {
      emit('update:schema', currentPath.value, componentIds[0] || null);
    }
  }
}

function updateSlotProperty(key: keyof ComponentSlotConfig, value: any) {
  if (slotConfig.value) {
    emit('update:slot', slotConfig.value.slotId, { [key]: value });
    emit('update:schema-property', currentPath.value, { [key]: value });
  }
}

function rotate(axis: 'x' | 'y' | 'z', degrees: number) {
  if (!slotConfig.value) return;
  const currentDegrees = rotationInDegrees.value[axis];
  let newDegrees = currentDegrees + degrees;
  newDegrees = (newDegrees % 360 + 360) % 360;
  const newRotation = { ...(slotConfig.value.rotation || { x: 0, y: 0, z: 0 }) };
  newRotation[axis] = newDegrees * (Math.PI / 180);
  updateSlotProperty('rotation', newRotation);
}

</script>

<template>
  <div class="schema-slot-card mb-6 relative border-b border-gray-700/50 pb-6" :class="{ 'pl-6': depth && depth > 0 }">
    <!-- Hierarchy Line -->
    <div v-if="depth && depth > 0" class="absolute left-0 top-0 bottom-0 w-px bg-gray-700 ml-2"></div>
    <div v-if="depth && depth > 0" class="absolute left-2 top-6 w-4 h-px bg-gray-700"></div>

    <!-- CARD HEADER -->
    <div
      class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div class="p-3 flex items-center gap-3 bg-gray-900/50 border-b border-gray-700/50">

        <!-- Toggle Children -->
        <button @click="isExpanded = !isExpanded" class="text-gray-400 hover:text-white transition-colors">
          <ChevronDown class="w-4 h-4 transition-transform" :class="{ '-rotate-90': !isExpanded }" />
        </button>

        <!-- Slot Name / Point ID (BAL OLDAL) -->
        <div class="flex-grow font-bold text-gray-200">
          {{ pointId }}
        </div>

        <!-- JOBB OLDAL: Alapértelmezett + Beállítások -->
        <div class="flex items-center gap-3">

          <!-- Alapértelmezett választó -->
          <div class="flex items-center gap-2 mr-2">
            <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Alapértelmezett:</span>

            <button v-if="assignedComponent" @click.stop="activeModalMode = 'single'"
              class="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-800 hover:bg-blue-800 hover:text-white hover:border-blue-500 transition-colors cursor-pointer"
              title="Kattints az alapértelmezett elem módosításához">
              {{ assignedComponent.name }}
            </button>

            <span v-else class="text-xs text-gray-500 italic">(Nincs)</span>
          </div>

          <!-- Settings Toggle -->
          <button @click="showSettings = !showSettings"
            class="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-colors border border-transparent hover:border-gray-600"
            :class="{ 'text-blue-400 bg-blue-900/20 border-blue-800': showSettings }" title="Beállítások">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
              </path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z">
              </path>
            </svg>
          </button>
        </div>

      </div>

      <!-- CARD BODY (Component Selection) -->
      <div class="p-3 bg-gray-800 space-y-2">
        <button @click="activeModalMode = 'multiple'"
          class="w-full flex justify-between items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md text-sm text-white transition-colors">
          <span v-if="assignedComponent" class="font-medium">{{ assignedComponent.name }}</span>
          <span v-else class="text-gray-400 italic">Komponens kiválasztása...</span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <!-- SETTINGS PANEL -->
      <div v-if="showSettings && slotConfig" class="border-t border-gray-700 p-3 bg-gray-900/30 space-y-4">
        <!-- Rotation -->
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase mb-2 block">Forgatás</label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis"
              class="flex items-center justify-between bg-gray-800 rounded px-2 py-1 border border-gray-700">
              <button @click="rotate(axis, -90)" class="text-gray-400 hover:text-white hover:bg-gray-700 rounded p-1">
                <ChevronDown class="w-3 h-3 rotate-90" />
              </button>
              <span class="text-sm font-mono text-gray-300">{{ rotationInDegrees[axis] }}°</span>
              <button @click="rotate(axis, 90)" class="text-gray-400 hover:text-white hover:bg-gray-700 rounded p-1">
                <ChevronDown class="w-3 h-3 -rotate-90" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CHILDREN RECURSION -->
    <div v-if="isExpanded && assignedComponent" class="mt-2">
      <SchemaSlotCard v-for="childPoint in childPoints" :key="childPoint.id" :pointId="childPoint.id"
        :parentPath="currentPath" :schema="schema" :allowedTypes="childPoint.allowedComponentTypes"
        :depth="(depth || 0) + 1" :getSlot="getSlot" @update:schema="(p, c) => emit('update:schema', p, c)"
        @update:slot="(id, u) => emit('update:slot', id, u)"
        @update:schema-property="(p, u) => emit('update:schema-property', p, u)" />
    </div>

  </div>

  <!-- MODAL -->
  <ComponentSelectorModal v-if="activeModalMode" :allowedTypes="allowedTypes" :multiple="activeModalMode === 'multiple'"
    :currentValue="assignedComponentId" :selectedValues="slotConfig?.allowedComponents || []"
    @select="handleSingleSelect" @select-multiple="handleMultiSelect" @close="activeModalMode = null" />
</template>
