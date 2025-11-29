<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { ComponentSlotConfig, FurnitureConfig } from '@/config/furniture';
import ChevronDown from '@/assets/icons/chevron-down.svg?component';

// Ceruza ikon
const PencilIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;

// --- TÍPUSOK ---
type TreeNode = ComponentSlotConfig & { children?: TreeNode[] };

type SimpleUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedUpdate = { slotId: string; update: SimpleUpdate };

const props = defineProps<{
  node: TreeNode;
  highlightedSlotId?: string | null;
  suggestions: { componentTypes: string[]; attachmentPoints: string[]; };
  magicGroup?: { name: string; slotIds: string[] };
}>();

const emit = defineEmits<{
  (e: 'update:slot', payload: SimpleUpdate | NestedUpdate): void;
  (e: 'remove:slot', slotId: string): void;
  (e: 'activate-magic', groupName: string, slotIds: string[]): void;
}>();

// --- STORE & INJECT ---
const configStore = useConfigStore();
const { getComponentById } = configStore;
const { components: storeComponents } = storeToRefs(configStore);
const editableFurniture = inject<Ref<Partial<FurnitureConfig> | null>>('editableFurniture');

const isHighlighted = computed(() => props.node.slotId === props.highlightedSlotId);

// --- HELPEREK ---
const availableParentSlots = computed(() => {
  if (!editableFurniture?.value?.componentSlots) return [];
  return editableFurniture.value.componentSlots.map(s => s.slotId).filter(id => id !== props.node.slotId);
});

const parentAttachmentPoints = computed(() => {
  if (!props.node.attachToSlot || !editableFurniture?.value?.componentSlots) return [];
  const parentSlot = editableFurniture.value.componentSlots.find(s => s.slotId === props.node.attachToSlot);
  if (!parentSlot?.defaultComponent) return [];
  const parentComponent = getComponentById(parentSlot.defaultComponent);
  if (!parentComponent?.attachmentPoints) return [];
  return parentComponent.attachmentPoints
    .filter(p => p.allowedComponentTypes.includes(props.node.componentType))
    .map(p => p.id);
});

const allComponentsForType = computed(() => {
  if (!props.node.componentType) return [];
  return (storeComponents.value[props.node.componentType] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
});

const allowedComponentsWithNames = computed(() => {
  if (!props.node.componentType || !props.node.allowedComponents) return [];
  const componentsOfType = storeComponents.value[props.node.componentType] || [];
  return props.node.allowedComponents.map(id => {
    const component = componentsOfType.find(c => c.id === id);
    return { id, name: component ? component.name : id };
  }).sort((a, b) => a.name.localeCompare(b.name));
});

// --- SMART FILTERING (Szélesség alapján) ---
const parentComponentWidth = computed(() => {
  if (!props.node.attachToSlot || !editableFurniture?.value?.componentSlots) return undefined;
  const parentSlot = editableFurniture.value.componentSlots.find(s => s.slotId === props.node.attachToSlot);
  if (!parentSlot?.defaultComponent) return undefined;

  const parentComp = getComponentById(parentSlot.defaultComponent);
  // JAVÍTÁS: properties.width használata
  return parentComp?.properties?.width;
});

const ignoreWidthFilter = ref(false);

const filteredComponents = computed(() => {
  const all = allComponentsForType.value;
  const targetWidth = parentComponentWidth.value;

  if (targetWidth === undefined || ignoreWidthFilter.value) return all;

  return all.filter(comp => {
    // JAVÍTÁS: properties.width használata
    const compWidth = comp.properties?.width;
    // Ha a komponensnek nincs szélessége (univerzális), vagy egyezik a szülővel
    return compWidth === undefined || Math.abs(compWidth - targetWidth) < 0.1;
  });
});

// --- UPDATE FÜGGVÉNYEK ---
function updateSlot<K extends keyof ComponentSlotConfig>(key: K, value: ComponentSlotConfig[K]) {
  emit('update:slot', { key, value });
}
function removeSlot() { emit('remove:slot', props.node.slotId); }

function updateAllowedComponent(componentId: string, isChecked: boolean) {
  const newAllowed = [...(props.node.allowedComponents || [])];
  const index = newAllowed.indexOf(componentId);
  if (isChecked && index === -1) newAllowed.push(componentId);
  else if (!isChecked && index > -1) newAllowed.splice(index, 1);
  updateSlot('allowedComponents', newAllowed);
}

function setAllAllowedComponents(selectAll: boolean) {
  const allIds = selectAll ? filteredComponents.value.map(c => c.id) : [];
  updateSlot('allowedComponents', allIds);
}

// --- JAVÍTOTT MAPPING LOGIKA (AUTO-SYNC) ---
function updateAttachmentMapping(componentId: string, pointId: string, isChecked: boolean) {
  const newMapping = JSON.parse(JSON.stringify(props.node.attachmentMapping || {}));
  if (!newMapping[componentId]) newMapping[componentId] = [];

  const points = newMapping[componentId] as string[];
  const index = points.indexOf(pointId);

  if (isChecked && index === -1) points.push(pointId);
  else if (!isChecked && index > -1) points.splice(index, 1);

  updateSlot('attachmentMapping', newMapping);

  if (componentId === props.node.defaultComponent) {
    if (points.length > 0) {
      updateSlot('useAttachmentPoint', points[0]);
    } else {
      updateSlot('useAttachmentPoint', '');
    }
  }
}

function setAllMappings(selectAll: boolean) {
  const newMapping = JSON.parse(JSON.stringify(props.node.attachmentMapping || {}));
  const pointsToSet = selectAll ? [...parentAttachmentPoints.value] : [];
  if (!props.node.allowedComponents) return;

  for (const componentId of props.node.allowedComponents) {
    newMapping[componentId] = pointsToSet;
  }
  updateSlot('attachmentMapping', newMapping);

  if (props.node.defaultComponent && pointsToSet.length > 0) {
    updateSlot('useAttachmentPoint', pointsToSet[0]);
  }
}

function triggerMagic() {
  if (props.magicGroup) emit('activate-magic', props.magicGroup.name, props.magicGroup.slotIds);
}

// --- FORGATÁS ---
const rotationInDegrees = computed(() => {
  const rad = props.node.rotation || { x: 0, y: 0, z: 0 };
  const toDeg = (r: number) => Math.round(r * (180 / Math.PI));
  const normalize = (deg: number) => (deg % 360 + 360) % 360;
  return { x: normalize(toDeg(rad.x)), y: normalize(toDeg(rad.y)), z: normalize(toDeg(rad.z)) };
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
  <div class="bg-gray-800 p-4 rounded-md border border-gray-700 mb-4"
    :class="{ 'shadow-lg shadow-blue-500/50 ring-2 ring-blue-500': isHighlighted }">

    <!-- FEJLÉC -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2 flex-grow">
        <div class="flex items-center gap-2">
          <span class="text-gray-500" v-html="PencilIcon"></span>
          <input type="text" :value="node.name" @input="updateSlot('name', ($event.target as HTMLInputElement).value)"
            class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0 w-auto focus:ring-0 cursor-pointer hover:text-blue-300 transition-colors placeholder-gray-600" />
        </div>
        <button v-if="magicGroup" @click="triggerMagic"
          class="ml-2 text-yellow-400 hover:text-yellow-200 bg-yellow-900/30 hover:bg-yellow-900/50 px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors border border-yellow-700/50"
          title="Automatikus konfiguráció létrehozása">
          <span>✨</span>
          <span class="font-bold">{{ magicGroup.name }}</span>
        </button>
      </div>

      <button @click="removeSlot"
        class="text-red-400 hover:text-red-300 p-1 rounded hover:bg-gray-700 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
          </path>
        </svg>
      </button>
    </div>

    <!-- TARTALOM -->
    <div class="space-y-4 mt-4 border-t border-gray-700 pt-4">

      <!-- Alap beállítások -->
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-2 items-center">
        <label class="admin-label justify-self-end">slotId</label>
        <p class="admin-input bg-gray-700/50 text-gray-400 select-none">{{ node.slotId }}</p>

        <label class="admin-label justify-self-end">attachToSlot</label>
        <select :value="node.attachToSlot"
          @change="updateSlot('attachToSlot', ($event.target as HTMLSelectElement).value)"
          class="admin-select w-full truncate">
          <option value="">-- Gyökér elem --</option>
          <option v-for="slotId in availableParentSlots" :key="slotId" :value="slotId">{{ slotId }}</option>
        </select>
      </div>

      <!-- Komponens választás -->
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-2 items-center">
        <label class="admin-label justify-self-end">componentType</label>
        <p class="admin-input bg-gray-700/50 text-gray-400 select-none">{{ node.componentType }}</p>

        <label class="admin-label justify-self-end">defaultComponent</label>
        <select v-if="node.componentType" :value="node.defaultComponent"
          @change="updateSlot('defaultComponent', ($event.target as HTMLSelectElement).value)"
          class="admin-select w-full truncate">
          <option v-for="comp in allComponentsForType.filter(c => node.allowedComponents?.includes(c.id))"
            :key="comp.id" :value="comp.id">{{ comp.name }}</option>
        </select>
      </div>

      <!-- Engedélyezett Komponensek -->
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="admin-label !mb-0">Engedélyezett Komponensek</label>

          <!-- JAVÍTÁS: Gombok és Checkbox egy csoportban -->
          <div class="flex items-center gap-2">
            <!-- Checkbox gomb stílusban -->
            <label
              class="flex items-center gap-2 cursor-pointer select-none bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 transition-colors"
              :class="{ 'bg-blue-900/30 border-blue-800': !ignoreWidthFilter }">
              <input type="checkbox" v-model="ignoreWidthFilter" class="checkbox-styled">
              <span class="text-[10px] text-gray-300 uppercase font-bold tracking-wider">Minden méret</span>
            </label>

            <div class="h-4 w-px bg-gray-700 mx-1"></div> <!-- Elválasztó -->

            <button @click="setAllAllowedComponents(true)"
              class="admin-btn-secondary text-xs !py-1 !px-2">Összes</button>
            <button @click="setAllAllowedComponents(false)"
              class="admin-btn-secondary text-xs !py-1 !px-2">Semelyik</button>
          </div>
        </div>

        <div class="max-h-48 overflow-y-auto space-y-1 border border-gray-700 rounded-md p-3 custom-scrollbar">
          <div v-if="filteredComponents.length === 0" class="text-xs text-gray-500 italic text-center py-2">
            Nincsenek kompatibilis komponensek (Szélesség: {{ parentComponentWidth ? parentComponentWidth + 'mm' :
              'Bármely' }}).
          </div>
          <label v-for="comp in filteredComponents" :key="comp.id"
            class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-gray-700/50 transition-colors">
            <input type="checkbox" :checked="node.allowedComponents?.includes(comp.id)"
              @change="updateAllowedComponent(comp.id, ($event.target as HTMLInputElement).checked)"
              class="checkbox-styled" />
            <span class="text-gray-300">{{ comp.name }}</span>
            <!-- JAVÍTÁS: properties.width használata -->
            <span v-if="comp.properties?.width" class="text-xs text-gray-500">({{ comp.properties.width }} mm)</span>
          </label>
        </div>
      </div>

      <!-- Haladó beállítások -->
      <div class="space-y-4 mt-4 border-t border-gray-700 pt-4">

        <!-- Forgatási Szabályok -->
        <div v-if="node.attachToSlot">
          <label class="admin-label mb-2">Forgatási Szabályok</label>
          <div class="grid grid-cols-3 gap-3">
            <div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis"
              class="flex items-center justify-between bg-gray-900 rounded-md px-2 py-1">
              <button @click="rotate(axis, -90)" class="p-2 rounded-md hover:bg-gray-700 transition-colors">
                <ChevronDown class="w-5 h-5 transform rotate-90 text-gray-300" />
              </button>
              <div class="text-center">
                <span class="text-xs text-gray-500 uppercase">{{ axis }}</span>
                <span class="font-mono text-lg text-gray-300 block">{{ rotationInDegrees[axis] }}°</span>
              </div>
              <button @click="rotate(axis, 90)" class="p-2 rounded-md hover:bg-gray-700 transition-colors">
                <ChevronDown class="w-5 h-5 transform -rotate-90 text-gray-300" />
              </button>
            </div>
          </div>
        </div>

        <!-- Csatlakozási Szabályok -->
        <div v-if="node.attachToSlot && parentAttachmentPoints.length > 0" class="bg-gray-900 p-3 rounded">
          <div class="flex justify-between items-center mb-3">
            <label class="admin-label !mb-0">Pozíciók és Csatlakozások</label>
            <div class="flex gap-2">
              <button @click="setAllMappings(true)" class="admin-btn-secondary text-xs !py-1 !px-2">Összes</button>
              <button @click="setAllMappings(false)" class="admin-btn-secondary text-xs !py-1 !px-2">Semelyik</button>
            </div>
          </div>

          <div v-if="!allowedComponentsWithNames || allowedComponentsWithNames.length === 0"
            class="text-xs text-gray-500 italic">
            Válassz ki legalább egy "allowedComponent"-et a szabályok beállításához.
          </div>

          <div v-else class="space-y-4">
            <div v-for="component in allowedComponentsWithNames" :key="component.id">
              <div class="flex items-center gap-2 mb-2">
                <p class="font-semibold text-sm text-gray-300">{{ component.name }}</p>
                <span v-if="component.id === node.defaultComponent"
                  class="text-xs bg-blue-900 text-blue-300 px-1.5 rounded">Default</span>
              </div>

              <div class="pl-2 flex flex-col gap-1">
                <label v-for="pointId in parentAttachmentPoints" :key="pointId"
                  class="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-800/50 rounded p-0.5">
                  <input type="checkbox" :checked="node.attachmentMapping?.[component.id]?.includes(pointId)"
                    @change="updateAttachmentMapping(component.id, pointId, ($event.target as HTMLInputElement).checked)"
                    class="checkbox-styled" />
                  <span class="font-mono text-gray-300">{{ pointId }}</span>
                </label>
              </div>
              <p v-if="!node.attachmentMapping?.[component.id]?.length" class="text-xs text-red-400 pl-2 mt-1">
                ⚠️ Nincs pozíció megadva!
              </p>
            </div>
          </div>
        </div>

        <div v-else-if="node.attachToSlot" class="text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded">
          ⚠️ A szülő komponens nem kínál csatlakozási pontokat (attachmentPoints).
        </div>

      </div>
    </div>

    <!-- REKURZÍV GYEREKEK -->
    <div v-if="node.children && node.children.length > 0" class="ml-6 mt-4 space-y-4 border-l-2 border-gray-600 pl-4">
      <SlotNode v-for="childNode in node.children" :key="childNode.slotId" :node="childNode" :suggestions="suggestions"
        :highlighted-slot-id="highlightedSlotId" :magic-group="magicGroup"
        @update:slot="payload => emit('update:slot', { slotId: childNode.slotId, update: payload as SimpleUpdate })"
        @remove:slot="slotId => emit('remove:slot', slotId)" @activate-magic="(g, s) => emit('activate-magic', g, s)" />
    </div>
  </div>
</template>
