<script setup lang="ts">
import { computed, inject, type Ref } from 'vue';
import type { FurnitureConfig, Schema, ComponentSlotConfig } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import SchemaSlotCard from './SchemaSlotCard.vue';
import { useFurnitureComposer } from '@/composables/useFurnitureComposer';

const props = defineProps<{
  openSchemaId: string | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-schema', schemaId: string): void;
  (e: 'delete-schema', index: number): void;
  (e: 'set-default', schemaId: string): void;
  (e: 'toggle-markers', visible: boolean, activePoints: string[]): void;
  (e: 'toggle-xray', enabled: boolean): void;
}>();

const configStore = useConfigStore();
const editableFurniture = inject<Ref<FurnitureConfig | null>>('editableFurniture');

const layoutGroup = computed(() => {
  return editableFurniture?.value?.slotGroups?.find(g => g.name === 'Layouts');
});

const openSchemaIdRef = computed(() => props.openSchemaId);
const { composedSlots } = useFurnitureComposer(editableFurniture!, openSchemaIdRef);

function getSlotForPath(path: string, pointId: string): ComponentSlotConfig | undefined {
  if (!composedSlots.value || composedSlots.value.length === 0) return undefined;
  const fullPath = `${path}__${pointId}`;
  const baseIdSearch = `slot_${fullPath.replace(/__/g, '_')}`;
  return composedSlots.value.find(s => s.slotId.startsWith(baseIdSearch));
}

// --- SÉMA CSOPORTOSÍTÁS ---
const groupedSchemas = computed(() => {
  if (!layoutGroup.value) return {};

  const groups = {
    'Ajtók (Fronts)': [] as Schema[],
    'Fiókok (Drawers)': [] as Schema[],
    // 'Polcok (Shelves)': [] as Schema[], // <-- KIVETTÜK
    'Egyéb': [] as Schema[]
  };

  layoutGroup.value.schemas.forEach(schema => {
    if (schema.type === 'front') groups['Ajtók (Fronts)'].push(schema);
    else if (schema.type === 'drawer') groups['Fiókok (Drawers)'].push(schema);
    // else if (schema.type === 'shelf') groups['Polcok (Shelves)'].push(schema); // <-- KIVETTÜK
    else groups['Egyéb'].push(schema);
  });

  return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0));
});

// --- ACTIONS ---

function handleSchemaUpdate(path: string, componentId: string | null) {
  if (!props.openSchemaId || !editableFurniture?.value) return;
  const schema = layoutGroup.value?.schemas.find(s => s.id === props.openSchemaId);

  if (schema) {
    schema.apply[path] = componentId;
    editableFurniture.value = { ...editableFurniture.value };
  }
}

function handleSchemaPropertyUpdate(path: string, update: Partial<ComponentSlotConfig>) {
  if (!props.openSchemaId || !editableFurniture?.value) return;
  const schema = layoutGroup.value?.schemas.find(s => s.id === props.openSchemaId);

  if (schema) {
    if (!schema.slotProperties) schema.slotProperties = {};
    if (!schema.slotProperties[path]) schema.slotProperties[path] = {};
    Object.assign(schema.slotProperties[path], update);
    editableFurniture.value = { ...editableFurniture.value };
  }
}

function handleSlotUpdate(payloadOrId: any, updateOrTopLevelId?: any) {
  let targetSlotId: string;
  let updateData: any;

  if (typeof payloadOrId === 'string') {
    targetSlotId = payloadOrId;
    updateData = updateOrTopLevelId;
  } else {
    if ('slotId' in payloadOrId) {
      targetSlotId = payloadOrId.slotId;
      updateData = payloadOrId.update;
    } else {
      if (!updateOrTopLevelId || typeof updateOrTopLevelId !== 'string') return;
      targetSlotId = updateOrTopLevelId;
      updateData = payloadOrId;
    }
  }

  if (!editableFurniture?.value?.componentSlots) return;
  const slot = editableFurniture.value.componentSlots.find(s => s.slotId === targetSlotId);

  if (slot) {
    if ('key' in updateData) {
      (slot as any)[updateData.key] = updateData.value;
    } else {
      Object.assign(slot, updateData);
    }
    editableFurniture.value = { ...editableFurniture.value };
  }
}

// --- HELPEREK ---
function getRootComponentId(): string | null {
  if (!editableFurniture?.value?.componentSlots) return null;
  const corpusSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  if (!corpusSlot || !corpusSlot.defaultComponent) return null;
  return configStore.getComponentById(corpusSlot.defaultComponent)?.id || null;
}

function getRootAttachmentPoints(schema: Schema) {
  const rootId = getRootComponentId();
  if (!rootId) return [];
  const rootComp = configStore.getComponentById(rootId);
  if (!rootComp?.attachmentPoints) return [];

  if (schema && schema.type) {
    const typeMap: Record<string, string> = {
      front: 'fronts',
      // shelf: 'shelves', // <-- KIVETTÜK
      drawer: 'drawers',
      leg: 'legs'
    };
    const requiredType = typeMap[schema.type];
    if (requiredType) {
      return rootComp.attachmentPoints.filter(p => p.allowedComponentTypes.includes(requiredType));
    } else {
      return [];
    }
  }
  return rootComp.attachmentPoints;
}

const PencilIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;

</script>

<template>
  <div>
    <div v-if="!layoutGroup || layoutGroup.schemas.length === 0" class="text-gray-500 italic">
      Még nincsenek sémák létrehozva.
    </div>

    <!-- SÉMA LISTA CSOPORTOSÍTVA -->
    <div v-for="(schemas, groupName) in groupedSchemas" :key="groupName" class="mb-6">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 pl-1">{{ groupName }}</h4>

      <div class="space-y-4">
        <div v-for="schema in schemas" :key="schema.id"
          class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden transition-all duration-300"
          :class="{ 'ring-2 ring-blue-500': openSchemaId === schema.id }">

          <!-- SÉMA FEJLÉC -->
          <div class="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-700">

            <!-- BAL OLDAL: Név szerkesztés -->
            <div class="flex items-center gap-2 flex-grow">
              <span class="text-gray-500" v-html="PencilIcon"></span>
              <input type="text" v-model="schema.name"
                class="bg-transparent text-white font-bold focus:outline-none focus:border-b border-blue-500 w-full max-w-xs" />
              <span class="text-[10px] text-gray-600 font-mono">{{ schema.id }}</span>
            </div>

            <!-- JOBB OLDAL: Státuszok és Gombok -->
            <div class="flex items-center gap-2">

              <!-- 1. ÁLLAPOT JELZŐ / GOMB -->
              <span v-if="layoutGroup?.defaultSchemaId === schema.id"
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-900/30 border border-green-800 rounded mr-2 cursor-default select-none">
                Alapértelmezett
              </span>

              <button v-else @click="emit('set-default', schema.id)"
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-900/30 border border-blue-800 rounded hover:bg-blue-800/50 hover:text-white hover:border-blue-600 transition-all mr-2"
                title="Beállítás alapértelmezettként">
                Legyen Default
              </button>

              <!-- 2. SZERKESZTÉS / MEGNYITÁS GOMB -->
              <button @click="emit('toggle-schema', schema.id)"
                class="p-1.5 rounded transition-colors flex items-center gap-1"
                :class="openSchemaId === schema.id ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'">
                <span v-if="openSchemaId === schema.id" class="text-xs font-bold uppercase">Bezárás</span>
                <span v-else class="text-xs font-bold uppercase">Megnyitás</span>
              </button>

              <!-- 3. TÖRLÉS GOMB -->
              <button @click="emit('delete-schema', layoutGroup?.schemas.indexOf(schema) || 0)"
                class="text-red-400 hover:text-red-300 text-xs bg-red-900/20 hover:bg-red-900/40 px-2 py-1.5 rounded ml-2">Törlés</button>
            </div>
          </div>

          <!-- LENYÍLÓ TARTALOM -->
          <div v-if="openSchemaId === schema.id" class="p-4 bg-gray-800/50 border-t border-gray-700">

            <div class="text-sm text-gray-400 mb-4">
              Itt szerkesztheted a bútor felépítését.
            </div>

            <!-- HAGYOMÁNYOS FA NÉZET (Minden ami nem polc) -->
            <div class="space-y-4">
              <SchemaSlotCard v-for="point in getRootAttachmentPoints(schema)" :key="point.id" :pointId="point.id"
                parentPath="root" :schema="schema.apply" :allowedTypes="point.allowedComponentTypes"
                :getSlot="getSlotForPath" @update:schema="handleSchemaUpdate" @update:slot="handleSlotUpdate"
                @update:schema-property="handleSchemaPropertyUpdate" />
            </div>

          </div>
        </div>
      </div>
    </div>

  </div>
</template>
