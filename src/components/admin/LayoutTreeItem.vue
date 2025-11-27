<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ComponentConfig, ComponentSlotConfig } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';


const props = defineProps<{
  componentId: string;
  path: string;
  schema: Record<string, string | null>;
  depth?: number;
  // Function to find the actual slot config for a given path/point
  getSlot: (path: string, pointId: string) => ComponentSlotConfig | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:schema', path: string, componentId: string | null): void;
  (e: 'update:slot', slotId: string, update: Partial<ComponentSlotConfig>): void;
}>();

const configStore = useConfigStore();
const expandedSettings = ref<Record<string, boolean>>({});

const component = computed(() => configStore.getComponentById(props.componentId));

const attachmentPoints = computed(() => {
  return component.value?.attachmentPoints || [];
});

function getAssignedComponentId(pointId: string) {
  const childPath = `${props.path}__${pointId}`;
  return props.schema[childPath];
}

function handleComponentChange(pointId: string, event: Event) {
  const select = event.target as HTMLSelectElement;
  const childPath = `${props.path}__${pointId}`;
  emit('update:schema', childPath, select.value || null);
}

function getAvailableComponents(allowedTypes: string[]) {
  const all = configStore.components || {};
  let options: ComponentConfig[] = [];
  allowedTypes.forEach(type => {
    if (all[type]) {
      options = options.concat(all[type]);
    }
  });
  return options;
}

function toggleSettings(pointId: string) {
  expandedSettings.value[pointId] = !expandedSettings.value[pointId];
}

function updateTransform(pointId: string, type: 'position' | 'rotation', axis: 'x' | 'y' | 'z', value: number) {
  const slot = props.getSlot(props.path, pointId);
  if (slot) {
    const current = slot[type] || { x: 0, y: 0, z: 0 };
    const newValue = { ...current, [axis]: Number(value) };
    emit('update:slot', slot.slotId, { [type]: newValue });
  }
}
</script>

<template>
  <div class="layout-tree-item" :style="{ marginLeft: `${(depth || 0) * 12}px` }">
    <!-- Current Component Info -->
    <div class="flex items-center p-2 bg-gray-50 rounded mb-2 border border-gray-200">
      <span class="font-medium text-sm text-gray-700">{{ component?.name || componentId }}</span>
      <span class="ml-2 text-xs text-gray-400">({{ componentId }})</span>
    </div>

    <!-- Attachment Points -->
    <div v-if="attachmentPoints.length > 0" class="pl-4 border-l-2 border-gray-100 ml-2">
      <div v-for="point in attachmentPoints" :key="point.id" class="mb-3">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-2 h-2 rounded-full bg-blue-400"></div>
          <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">{{ point.id }}</span>

          <!-- Settings Toggle -->
          <button @click="toggleSettings(point.id)" class="ml-auto text-gray-400 hover:text-blue-500 p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
              </path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </button>
        </div>

        <!-- Component Selector -->
        <div class="flex items-center gap-2">
          <select :value="getAssignedComponentId(point.id) || ''" @change="handleComponentChange(point.id, $event)"
            class="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="">(Üres)</option>
            <option v-for="opt in getAvailableComponents(point.allowedComponentTypes)" :key="opt.id" :value="opt.id">
              {{ opt.name }}
            </option>
          </select>
        </div>

        <!-- INLINE SETTINGS -->
        <div v-if="expandedSettings[point.id] && getSlot(path, point.id)"
          class="mt-2 p-3 bg-gray-100 rounded text-xs border border-gray-200">
          <div class="grid grid-cols-2 gap-4">
            <!-- Position -->
            <div>
              <div class="font-bold mb-1 text-gray-500">Pozíció (mm)</div>
              <div class="grid grid-cols-3 gap-1">
                <input type="number" :value="getSlot(path, point.id)?.position?.x"
                  @input="updateTransform(point.id, 'position', 'x', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="X">
                <input type="number" :value="getSlot(path, point.id)?.position?.y"
                  @input="updateTransform(point.id, 'position', 'y', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="Y">
                <input type="number" :value="getSlot(path, point.id)?.position?.z"
                  @input="updateTransform(point.id, 'position', 'z', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="Z">
              </div>
            </div>
            <!-- Rotation -->
            <div>
              <div class="font-bold mb-1 text-gray-500">Forgatás (rad)</div>
              <div class="grid grid-cols-3 gap-1">
                <input type="number" step="0.1" :value="getSlot(path, point.id)?.rotation?.x"
                  @input="updateTransform(point.id, 'rotation', 'x', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="X">
                <input type="number" step="0.1" :value="getSlot(path, point.id)?.rotation?.y"
                  @input="updateTransform(point.id, 'rotation', 'y', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="Y">
                <input type="number" step="0.1" :value="getSlot(path, point.id)?.rotation?.z"
                  @input="updateTransform(point.id, 'rotation', 'z', ($event.target as any).value)"
                  class="w-full px-1 py-0.5 border rounded" placeholder="Z">
              </div>
            </div>
          </div>
        </div>

        <!-- Recursive Child -->
        <div v-if="getAssignedComponentId(point.id)" class="mt-2">
          <LayoutTreeItem :componentId="getAssignedComponentId(point.id)!" :path="`${path}__${point.id}`"
            :schema="schema" :depth="(depth || 0) + 1" :getSlot="getSlot"
            @update:schema="(p, c) => emit('update:schema', p, c)"
            @update:slot="(id, u) => emit('update:slot', id, u)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-tree-item {
  transition: all 0.3s ease;
}
</style>
