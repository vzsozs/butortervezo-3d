<script setup lang="ts">
import { inject, type Ref, ref } from 'vue';
import type { FurnitureConfig, Schema } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import SchemaManager from './SchemaManager.vue';
import SchemaWizard from './SchemaWizard.vue';

defineProps<{
  openSchemaId: string | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-schema', schemaId: string): void;
  (e: 'toggle-markers', visible: boolean, activePoints: string[]): void;
  (e: 'toggle-xray', enabled: boolean): void;
}>();

const configStore = useConfigStore();
const editableFurniture = inject<Ref<FurnitureConfig | null>>('editableFurniture');

const showWizard = ref(false);

function getRootComponentId(): string | null {
  if (!editableFurniture?.value?.componentSlots) return null;
  const corpusSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  if (!corpusSlot || !corpusSlot.defaultComponent) return null;
  return configStore.getComponentById(corpusSlot.defaultComponent)?.id || null;
}

// --- SÉMA KEZELÉS ---

function handleSchemaCreate(type: 'front' | 'shelf' | 'drawer') {
  if (!editableFurniture?.value) return;
  if (!editableFurniture.value.slotGroups) editableFurniture.value.slotGroups = [];

  let layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) {
    layoutGroup = {
      groupId: 'layouts',
      name: 'Layouts',
      controlType: 'schema_select',
      schemas: [],
      controlledSlots: []
    };
    editableFurniture.value.slotGroups.push(layoutGroup);
  }

  const typeNames = { front: 'Ajtó', shelf: 'Polc', drawer: 'Fiók' };
  const newSchema: Schema = {
    id: `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${typeNames[type]} Elrendezés ${layoutGroup.schemas.length + 1}`,
    type: type,
    apply: {}
  };

  layoutGroup.schemas.push(newSchema);
  editableFurniture.value = { ...editableFurniture.value };

  // Azonnal kinyitjuk az újat (ez bezárja a régit)
  emit('toggle-schema', newSchema.id);
  showWizard.value = false;
}

function deleteSchema(index: number) {
  const layoutGroup = editableFurniture?.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.schemas.splice(index, 1);
    // If deleted schema was open, close it (parent handles this via openSchemaId check usually, but we should emit if needed)
    // Actually parent manages openSchemaId. If we delete it, we should probably close it.
    // But let's let the parent handle the state update if it notices the ID is gone?
    // Or we can emit toggle-schema with null or same ID to toggle off?
    // The parent's toggleSchema logic handles "if same ID, close".
    // But here the ID is gone.
    // Let's just update the model. The parent watcher on openSchemaId might need to check validity?
    // Or we just leave it.
  }
}

function setDefaultSchema(schemaId: string) {
  const layoutGroup = editableFurniture?.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (!layoutGroup) return;

  layoutGroup.defaultSchemaId = schemaId;
  editableFurniture!.value = { ...editableFurniture!.value } as FurnitureConfig;
}

// Proxy emits from SchemaManager
function onToggleSchema(schemaId: string) {
  emit('toggle-schema', schemaId);
}

function onToggleMarkers(visible: boolean, activePoints: string[]) {
  emit('toggle-markers', visible, activePoints);
}

function onToggleXray(enabled: boolean) {
  emit('toggle-xray', enabled);
}

</script>

<template>
  <div class="flex-1 overflow-y-auto pb-10">

    <div v-if="!getRootComponentId()" class="text-center py-10 text-gray-500">
      <p class="text-lg mb-2">⚠️ Nincs Korpusz kiválasztva.</p>
      <p class="text-sm">Kérlek válassz egy korpuszt az Általános fülön.</p>
    </div>

    <div v-else class="space-y-6">

      <div class="flex justify-between items-center">
        <h3 class="text-lg font-bold text-white">Elrendezés Sémák</h3>
        <button @click="showWizard = true" class="admin-btn text-sm">+ Új Séma</button>
      </div>

      <SchemaManager :openSchemaId="openSchemaId" @toggle-schema="onToggleSchema" @delete-schema="deleteSchema"
        @set-default="setDefaultSchema" @toggle-markers="onToggleMarkers" @toggle-xray="onToggleXray" />

    </div>

    <!-- WIZARD MODAL -->
    <SchemaWizard v-if="showWizard" @select="handleSchemaCreate" @cancel="showWizard = false" />

  </div>
</template>
