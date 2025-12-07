<script setup lang="ts">
import { ref, provide, watch } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import { useFurnitureComposer } from '@/composables/useFurnitureComposer';
import FurnitureGeneralTab from './FurnitureGeneralTab.vue';
import FurnitureLayoutTab from './FurnitureLayoutTab.vue';

const props = defineProps<{
  furniture: FurnitureConfig | null;
  isNew: boolean;
}>();

const emit = defineEmits<{
  (e: 'save', furniture: FurnitureConfig): void;
  (e: 'update:furniture', furniture: FurnitureConfig): void;
  (e: 'delete', id: string): void;
  (e: 'cancel'): void;
  (e: 'toggle-markers', visible: boolean, activePoints: string[]): void;
  (e: 'toggle-xray', enabled: boolean): void;
}>();

// --- STATE ---
const editableFurniture = ref<FurnitureConfig | null>(null);
provide('editableFurniture', editableFurniture);

// --- TAB KEZELÉS ---
const activeTab = ref<'general' | 'layouts'>('general');
const openSchemaId = ref<string | null>(null);

// --- WATCHERS ---
watch(() => props.furniture, (newVal) => {
  if (newVal) {
    if (!editableFurniture.value || editableFurniture.value.id !== newVal.id) {
      editableFurniture.value = JSON.parse(JSON.stringify(newVal));
    }
  } else if (props.isNew) {
    editableFurniture.value = {
      id: `furniture_${Date.now()}`,
      name: 'Új Bútor',
      category: 'bottom_cabinets',
      componentSlots: [],
      slotGroups: [],
      price: 0
    };
  } else {
    editableFurniture.value = null;
  }
}, { immediate: true, deep: true });

// --- COMPOSER ---
const { composedSlots } = useFurnitureComposer(editableFurniture, openSchemaId);

watch(composedSlots, (newSlots) => {
  if (editableFurniture.value) {
    const viewObject = {
      ...editableFurniture.value,
      componentSlots: newSlots
    };
    emit('update:furniture', viewObject);
  }
}, { deep: true });

// --- TAB VÁLTÁS ---
function switchTab(tab: 'general' | 'layouts') {
  activeTab.value = tab;
  if (tab === 'general') {
    openSchemaId.value = null;
  }
}

// --- SÉMA KEZELÉS ---
function toggleSchema(schemaId: string) {
  if (openSchemaId.value === schemaId) {
    openSchemaId.value = null;
  } else {
    openSchemaId.value = schemaId;
  }
}

// Markerek kezelése
watch(openSchemaId, (newId) => {
  if (newId) {
    setTimeout(() => updateMarkers(), 100);
    const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
    const schema = layoutGroup?.schemas.find(s => s.id === newId);

    if (schema && (schema.type === 'shelf' || schema.type === 'internal')) {
      emit('toggle-xray', true);
    } else {
      emit('toggle-xray', false);
    }

  } else {
    emit('toggle-markers', false, []);
    emit('toggle-xray', false);
  }
});

function updateMarkers() {
  if (!openSchemaId.value || !editableFurniture.value) return;
  const schema = editableFurniture.value.slotGroups?.find(g => g.name === 'Layouts')?.schemas.find(s => s.id === openSchemaId.value);
  if (!schema) return;

  const activePoints: string[] = [];
  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    if (componentId) {
      const pointId = slotId.replace('slot_', 'attach_');
      activePoints.push(pointId);
    }
  });
  emit('toggle-markers', true, activePoints);
}

// --- 3D INTERAKCIÓ (Kívülről hívott metódus) ---
function handleAttachmentClick(pointId: string) {
  if (!openSchemaId.value || !editableFurniture.value) return;

  const layoutGroup = editableFurniture.value.slotGroups?.find(g => g.name === 'Layouts');
  const schema = layoutGroup?.schemas.find(s => s.id === openSchemaId.value);

  if (!schema) return;

  const path = `root__${pointId}`;

  if (Object.prototype.hasOwnProperty.call(schema.apply, path)) {
    delete schema.apply[path];
  } else {
    schema.apply[path] = null;
  }

  editableFurniture.value = { ...editableFurniture.value };
}

const generalTabRef = ref<any>(null);

function scrollToSlot(slotId: string) {
  switchTab('general');
  // Delegate to child component
  if (generalTabRef.value) {
    generalTabRef.value.scrollToSlot(slotId);
  }
}

defineExpose({
  handleAttachmentClick,
  scrollToSlot
});

function saveChanges() {
  if (editableFurniture.value) emit('save', editableFurniture.value as FurnitureConfig);
}

// Proxy handlers for events from children
function onToggleMarkers(visible: boolean, activePoints: string[]) {
  emit('toggle-markers', visible, activePoints);
}

function onToggleXray(enabled: boolean) {
  emit('toggle-xray', enabled);
}

</script>

<template>
  <div class="admin-panel h-full flex flex-col" v-if="editableFurniture">

    <!-- HEADER -->
    <div class="flex justify-between items-start mb-4 border-b border-gray-700 pb-2">
      <div>
        <h3 class="text-xl font-bold text-white">{{ isNew ? 'Új Bútor' : editableFurniture.name }}</h3>
        <p class="text-sm text-gray-400">ID: {{ editableFurniture.id }}</p>

        <!-- AKTÍV SÉMA JELZŐ -->
        <div v-if="openSchemaId"
          class="mt-1 inline-flex items-center gap-2 bg-blue-900/30 text-blue-300 px-2 py-1 rounded text-xs border border-blue-800">
          <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          Szerkesztés alatt: {{editableFurniture.slotGroups?.find(g => g.name === 'Layouts')?.schemas.find(s => s.id
            === openSchemaId)?.name}} <span class="text-[10px] opacity-50">({{ openSchemaId }})</span>
        </div>
      </div>
      <div class="flex gap-2">
        <button v-if="!isNew" @click="emit('delete', editableFurniture.id)"
          class="admin-btn-danger text-sm mr-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800">Törlés</button>
        <button @click="emit('cancel')" class="admin-btn-secondary text-sm">Mégse</button>
        <button @click="saveChanges" class="admin-btn text-sm">Mentés</button>
      </div>
    </div>

    <!-- TABS -->
    <div class="flex gap-4 mb-4 border-b border-gray-700">
      <button @click="switchTab('general')" class="pb-2 px-2 text-sm font-bold transition-colors border-b-2"
        :class="activeTab === 'general' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-gray-200'">
        Általános & Slotok
      </button>
      <button @click="switchTab('layouts')" class="pb-2 px-2 text-sm font-bold transition-colors border-b-2"
        :class="activeTab === 'layouts' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-gray-200'">
        Elrendezések (Layouts)
      </button>
    </div>

    <!-- TAB CONTENT -->
    <FurnitureGeneralTab v-show="activeTab === 'general'" ref="generalTabRef" :isNew="isNew" @switch-tab="switchTab" />

    <FurnitureLayoutTab v-show="activeTab === 'layouts'" :openSchemaId="openSchemaId" @toggle-schema="toggleSchema"
      @toggle-markers="onToggleMarkers" @toggle-xray="onToggleXray" />

  </div>
</template>
