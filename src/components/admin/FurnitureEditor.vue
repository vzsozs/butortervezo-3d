<script setup lang="ts">
import { computed, ref, provide, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import type { FurnitureConfig, ComponentSlotConfig, Schema } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';
import SchemaWizard from './SchemaWizard.vue';
import SchemaSlotCard from './SchemaSlotCard.vue';
import { useFurnitureComposer } from '@/composables/useFurnitureComposer';
import ComponentSelectorModal from './ComponentSelectorModal.vue';
// ÚJ IMPORT:
import { getSuggestedComponentConfig } from '@/utils/AutoConfigurator';

// --- TÍPUSOK ---
type SimpleSlotUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedSlotUpdate = { slotId: string; update: SimpleSlotUpdate };

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
const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const editableFurniture = ref<FurnitureConfig | null>(null);
provide('editableFurniture', editableFurniture);

// --- TAB KEZELÉS ---
const activeTab = ref<'general' | 'layouts'>('general');
const openSchemaId = ref<string | null>(null);
const showWizard = ref(false);

// --- SLOT TEMPLATES ---
const slotTemplates: Record<string, { name: string, type: string, prefix: string }> = {
  corpus: { name: 'Korpusz', type: 'corpuses', prefix: 'corpus' },
  front: { name: 'Ajtó', type: 'fronts', prefix: 'front' },
  handle: { name: 'Fogantyú', type: 'handles', prefix: 'handle' },
  leg: { name: 'Láb', type: 'legs', prefix: 'leg' },
  shelf: { name: 'Polc', type: 'shelves', prefix: 'shelf' },
  drawer: { name: 'Fiók', type: 'drawers', prefix: 'drawer' },
};

const templateOrder = ['corpus', 'front', 'handle', 'leg', 'shelf', 'drawer'];

const layoutGroup = computed(() => {
  return editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
});

// --- WATCHERS ---
watch(() => props.furniture, (newVal) => {
  if (newVal) {
    if (!editableFurniture.value || editableFurniture.value.id !== newVal.id) {
      editableFurniture.value = JSON.parse(JSON.stringify(newVal));
    }
  } else if (props.isNew) {
    // JAVÍTÁS: Ha új bútor, inicializáljuk egy üres vázzal, hogy ne legyen null error
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

// --- COMPOSER BEKÖTÉSE (AZ ÚJ MOTOR) ---
const { composedSlots } = useFurnitureComposer(editableFurniture, openSchemaId);

// Live update a szülő felé (3D nézet)
watch(composedSlots, (newSlots) => {
  // console.log('📡 [Editor] composedSlots changed! Emitting update...', newSlots.length, 'items');
  if (editableFurniture.value) {
    const viewObject = {
      ...editableFurniture.value,
      componentSlots: newSlots
    };
    emit('update:furniture', viewObject);
  }
}, { deep: true });

// --- TAB VÁLTÁS LOGIKA ---
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

async function handleSchemaCreate(type: 'front' | 'shelf' | 'drawer') {
  if (!editableFurniture.value) return;
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
    id: `schema_${Date.now()}`,
    name: `${typeNames[type]} Elrendezés ${layoutGroup.schemas.length + 1}`,
    type: type,
    apply: {}
  };

  layoutGroup.schemas.push(newSchema);

  editableFurniture.value = { ...editableFurniture.value };
  await nextTick();

  openSchemaId.value = newSchema.id;
  showWizard.value = false;
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

// --- 3D INTERAKCIÓ KEZELÉSE ---

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

defineExpose({
  handleAttachmentClick,
  scrollToSlot
});

// --- SÉMA UPDATE HANDLERS ---

function handleSchemaUpdate(path: string, componentId: string | null) {
  if (!openSchemaId.value || !editableFurniture.value) return;
  const layoutGroup = editableFurniture.value.slotGroups?.find(g => g.name === 'Layouts');
  const schema = layoutGroup?.schemas.find(s => s.id === openSchemaId.value);

  if (schema) {
    schema.apply[path] = componentId;
    editableFurniture.value = { ...editableFurniture.value };
  }
}

function handleSchemaPropertyUpdate(path: string, update: Partial<ComponentSlotConfig>) {
  if (!openSchemaId.value || !editableFurniture.value) return;
  const layoutGroup = editableFurniture.value.slotGroups?.find(g => g.name === 'Layouts');
  const schema = layoutGroup?.schemas.find(s => s.id === openSchemaId.value);

  if (schema) {
    if (!schema.slotProperties) schema.slotProperties = {};
    if (!schema.slotProperties[path]) schema.slotProperties[path] = {};
    Object.assign(schema.slotProperties[path], update);
    editableFurniture.value = { ...editableFurniture.value };
  }
}

function getSlotForPath(path: string, pointId: string): ComponentSlotConfig | undefined {
  if (!composedSlots.value || composedSlots.value.length === 0) return undefined;
  const fullPath = `${path}__${pointId}`;
  const baseIdSearch = `slot_${fullPath.replace(/__/g, '_')}`;
  return composedSlots.value.find(s => s.slotId.startsWith(baseIdSearch));
}

// --- MANUÁLIS SLOT KEZELÉS ---

function addSlotFromTemplate(template: { name: string, type: string, prefix: string }) {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.componentSlots) editableFurniture.value.componentSlots = [];

  // JAVÍTÁS: Automatikus komponens választás az új AutoConfigurator segítségével
  const suggestions = getSuggestedComponentConfig(template.type, storeComponents.value);

  const count = editableFurniture.value.componentSlots.filter(s => s.slotId.startsWith(template.prefix)).length + 1;

  const newSlot: ComponentSlotConfig = {
    slotId: `${template.prefix}_${count}`,
    name: `${template.name} ${count}`,
    componentType: template.type,
    // Itt töltjük ki az adatokat a store-ból:
    allowedComponents: suggestions.allowedComponents,
    defaultComponent: suggestions.defaultComponent ?? null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    attachToSlot: '',
    useAttachmentPoint: '',
  };

  // Automatikus szülő keresés
  if (newSlot.componentType === 'handles') {
    // 1. Fogantyú speciális eset: Ajtót vagy Fiókot keresünk
    // Megkeressük az első elérhető frontot vagy fiókot
    const parent = editableFurniture.value.componentSlots.find(s =>
      s.componentType === 'fronts' || s.componentType === 'drawers'
    );

    if (parent) {
      newSlot.attachToSlot = parent.slotId;
    }
  }
  else if (newSlot.componentType !== 'corpuses') {
    // 2. Minden más (Láb, Polc, stb.) -> Korpuszhoz csatlakozik
    const corpus = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
    if (corpus) {
      newSlot.attachToSlot = corpus.slotId;
    }
  }

  editableFurniture.value.componentSlots.push(newSlot);

  // Trigger update
  editableFurniture.value = { ...editableFurniture.value };
}

function handleSlotUpdate(payloadOrId: SimpleSlotUpdate | NestedSlotUpdate | string, updateOrTopLevelId?: string | Partial<ComponentSlotConfig>) {
  let targetSlotId: string;
  let updateData: Partial<ComponentSlotConfig> | SimpleSlotUpdate;

  if (typeof payloadOrId === 'string') {
    targetSlotId = payloadOrId;
    updateData = updateOrTopLevelId as Partial<ComponentSlotConfig>;
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

  if (!editableFurniture.value?.componentSlots) return;
  const slot = editableFurniture.value.componentSlots.find(s => s.slotId === targetSlotId);

  if (slot) {
    if ('key' in updateData) {
      (slot as any)[updateData.key] = updateData.value;
    } else {
      Object.assign(slot, updateData);
    }
    // Trigger reactivity
    editableFurniture.value = { ...editableFurniture.value };
  }
}

function handleSlotRemove(slotId: string) {
  if (!editableFurniture.value?.componentSlots) return;
  const index = editableFurniture.value.componentSlots.findIndex(s => s.slotId === slotId);
  if (index !== -1) {
    editableFurniture.value.componentSlots.splice(index, 1);
    editableFurniture.value = { ...editableFurniture.value };
  }
}

// --- VIZUÁLIS CSOPORTOSÍTÁS ---
const groupedDisplay = computed(() => {
  if (!editableFurniture.value?.componentSlots) return { groups: {}, orphans: [] };

  const groups: Record<string, { title: string, slots: ComponentSlotConfig[] }> = {};
  Object.keys(slotTemplates).forEach(key => {
    if (slotTemplates[key]) {
      groups[key] = { title: slotTemplates[key].name, slots: [] };
    }
  });

  const orphans: ComponentSlotConfig[] = [];

  editableFurniture.value.componentSlots.forEach(slot => {
    if (slot.isAutoGenerated) return;

    let matched = false;
    for (const [key, template] of Object.entries(slotTemplates)) {
      const typeMatch = slot.componentType === template.type;
      const isCorpusForce = key === 'corpus' && slot.slotId.startsWith('corpus');

      if (typeMatch || isCorpusForce) {
        if (groups[key]) {
          groups[key].slots.push(slot);
          matched = true;
        }
        break;
      }
    }
    if (!matched) orphans.push(slot);
  });

  return { groups, orphans };
});

// --- HELPEREK ---
const rootComponent = computed(() => {
  if (!editableFurniture.value?.componentSlots) return null;
  const corpusSlot = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
  if (!corpusSlot || !corpusSlot.defaultComponent) return null;
  return configStore.getComponentById(corpusSlot.defaultComponent);
});

function getRootComponentId(): string | null {
  return rootComponent.value?.id || null;
}

function getRootAttachmentPoints() {
  const rootId = getRootComponentId();
  if (!rootId) return [];
  const rootComp = configStore.getComponentById(rootId);
  if (!rootComp?.attachmentPoints) return [];

  if (openSchemaId.value) {
    const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
    const schema = layoutGroup?.schemas.find(s => s.id === openSchemaId.value);

    if (schema && schema.type) {
      const typeMap: Record<string, string> = {
        front: 'fronts',
        shelf: 'shelves',
        drawer: 'drawers',
        leg: 'legs'
      };
      const requiredType = typeMap[schema.type];
      if (requiredType) {
        return rootComp.attachmentPoints.filter(p => p.allowedComponentTypes.includes(requiredType));
      }
    }
  }
  return rootComp.attachmentPoints;
}

function isGroupManagedByLayout(groupKey: string): boolean {
  if (!editableFurniture.value?.slotGroups) return false;
  if (groupKey === 'corpus') return false;

  const layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) return false;

  return layoutGroup.schemas.some(schema => {
    if (schema.type === groupKey) return true;
    if (schema.type === 'front' && groupKey === 'handle') return true;
    return false;
  });
}

function getSlotsForGroup(groupKey: string) {
  return groupedDisplay.value.groups[groupKey]?.slots || [];
}

const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, any>>({});
function setSlotNodeRef(el: any, slotId: string) { if (el) slotNodeRefs.value[slotId] = el; }
const suggestions = computed(() => ({ componentTypes: storeComponents.value ? Object.keys(storeComponents.value) : [], attachmentPoints: [] }));

const hasAnyLayouts = computed(() => {
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  return (layoutGroup?.schemas.length || 0) > 0;
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

function deleteSchema(index: number) {
  const layoutGroup = editableFurniture.value?.slotGroups?.find(g => g.name === 'Layouts');
  if (layoutGroup) {
    layoutGroup.schemas.splice(index, 1);
    if (openSchemaId.value) openSchemaId.value = null;
  }
}

function saveChanges() {
  if (editableFurniture.value) emit('save', editableFurniture.value as FurnitureConfig);
}

function scrollToSlot(slotId: string) {
  switchTab('general');
  setTimeout(() => {
    const element = slotNodeRefs.value[slotId];
    if (element) {
      const domElement = (element as any).$el || element;
      domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightedSlotId.value = slotId;
      setTimeout(() => { highlightedSlotId.value = null; }, 2000);
    }
  }, 100);
}

function setDefaultSchema(schemaId: string) {
  if (!layoutGroup.value) return;

  layoutGroup.value.defaultSchemaId = schemaId;
  editableFurniture.value = { ...editableFurniture.value } as FurnitureConfig;
}

// Polc config frissítése
function updateShelfConfig(schema: Schema, key: string, value: any) {
  if (!schema.shelfConfig) {
    schema.shelfConfig = { mode: 'auto', count: getRootComponentMaxShelves(), componentId: null };
  }
  (schema.shelfConfig as any)[key] = value;
  editableFurniture.value = { ...editableFurniture.value } as FurnitureConfig;
}

// Korpusz max polc számának lekérése
function getRootComponentMaxShelves(): number {
  const rootId = getRootComponentId();
  if (!rootId) return 5;
  const comp = configStore.getComponentById(rootId);
  return comp?.properties?.maxShelves || 5;
}

// Komponens név lekérése ID alapján
function getComponentName(id: string | null | undefined) {
  if (!id) return null;
  return configStore.getComponentById(id)?.name;
}

// Polc választó modal kezelése
const showShelfSelector = ref(false);
const activeShelfSchema = ref<Schema | null>(null);

function openShelfSelector(schema: Schema) {
  activeShelfSchema.value = schema;
  showShelfSelector.value = true;
}

function handleShelfSelect(componentId: string) {
  if (activeShelfSchema.value) {
    updateShelfConfig(activeShelfSchema.value, 'componentId', componentId);
  }
  showShelfSelector.value = false;
  activeShelfSchema.value = null;
}

const PencilIcon = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;
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
            === openSchemaId)?.name}}
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

    <!-- TAB 1: GENERAL -->
    <div v-show="activeTab === 'general'" class="flex-1 overflow-y-auto space-y-6 pb-10">

      <!-- ALAP ADATOK -->
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="admin-label">Megnevezés</label>
          <input type="text" v-model="editableFurniture.name" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Kategória</label>
          <input type="text" v-model="editableFurniture.category" class="admin-input" />
        </div>
      </div>

      <!-- ÚJ ELEM HOZZÁADÁS -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2 text-gray-300 text-sm">Új Elem Hozzáadása</h4>
        <div class="flex flex-wrap gap-2">
          <button v-for="key in templateOrder" :key="key" @click="addSlotFromTemplate(slotTemplates[key]!)"
            :disabled="isGroupManagedByLayout(key)"
            class="px-3 py-1.5 rounded text-sm font-medium transition-colors border flex items-center gap-2" :class="isGroupManagedByLayout(key)
              ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
              : 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'">
            <span>+ {{ slotTemplates[key]?.name }}</span>
            <span v-if="isGroupManagedByLayout(key)" class="text-[10px] uppercase ml-1">(Layout)</span>
          </button>
        </div>
      </div>

      <!-- DINAMIKUS LISTA -->
      <div v-for="key in templateOrder" :key="key">

        <!-- 1. ESET: LAYOUT VEZÉRELT -->
        <div v-if="isGroupManagedByLayout(key)"
          class="bg-gray-800/30 border border-gray-700/50 rounded-lg overflow-hidden mb-4">
          <div class="bg-gray-900/50 px-4 py-2 border-b border-gray-700/50 flex justify-between items-center">
            <h4 class="font-bold text-gray-400 text-sm uppercase tracking-wider">{{ slotTemplates[key]?.name }}</h4>
            <span class="text-xs text-blue-400 font-mono bg-blue-900/20 px-2 py-0.5 rounded">Layout Vezérelt</span>
          </div>
          <div class="p-6 text-center">
            <p class="text-gray-400 text-sm mb-3">
              A(z) <strong>{{ slotTemplates[key]?.name }}</strong> elemeket az Elrendezések (Layouts) fülön kezeljük.
            </p>
            <button @click="switchTab('layouts')" class="admin-btn-secondary text-sm inline-flex items-center gap-2">
              <span>Ugrás a Layouts fülre</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3">
                </path>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. ESET: MANUÁLIS CSOPORT -->
        <div v-else-if="getSlotsForGroup(key).length > 0"
          class="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden mb-4 transition-all duration-300"
          :style="(key === 'corpus' && hasAnyLayouts) ? 'opacity: 0.5; pointer-events: none; filter: grayscale(100%);' : ''">

          <!-- Fejléc -->
          <div class="bg-gray-900 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
            <h4 class="font-bold text-gray-300 text-sm uppercase tracking-wider">{{ slotTemplates[key]?.name }}</h4>

            <!-- Jelzés -->
            <span v-if="key === 'corpus' && hasAnyLayouts"
              class="text-xs text-yellow-500 font-bold flex items-center gap-1 bg-yellow-900/20 px-2 py-1 rounded border border-yellow-900/50">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z">
                </path>
              </svg>
              Zárolva (Van Layout)
            </span>
            <span v-else class="text-xs text-gray-500">{{ getSlotsForGroup(key).length }} elem</span>
          </div>

          <!-- Tartalom -->
          <div class="p-4 space-y-4">
            <SlotNode v-for="slot in getSlotsForGroup(key)" :key="slot.slotId" :node="slot" :suggestions="suggestions"
              :highlighted-slot-id="highlightedSlotId" :ref="(el) => setSlotNodeRef(el, slot.slotId)"
              @update:slot="handleSlotUpdate($event, slot.slotId)" @remove:slot="handleSlotRemove" />
          </div>
        </div>

      </div>

      <!-- ÁRVÁK -->
      <div v-if="groupedDisplay.orphans.length > 0" class="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mt-8">
        <h4 class="text-sm font-bold text-gray-400 mb-4 uppercase">Egyéb / Besorolatlan Elemek</h4>
        <div class="space-y-4">
          <SlotNode v-for="slot in groupedDisplay.orphans" :key="slot.slotId" :node="slot" :suggestions="suggestions"
            :highlighted-slot-id="highlightedSlotId" :ref="(el) => setSlotNodeRef(el, slot.slotId)"
            @update:slot="handleSlotUpdate($event, slot.slotId)" @remove:slot="handleSlotRemove" />
        </div>
      </div>
    </div>

    <!-- TAB 2: LAYOUTS -->
    <div v-show="activeTab === 'layouts'" class="flex-1 overflow-y-auto pb-10">

      <div v-if="!getRootComponentId()" class="text-center py-10 text-gray-500">
        <p class="text-lg mb-2">⚠️ Nincs Korpusz kiválasztva.</p>
        <p class="text-sm">Kérlek válassz egy korpuszt az Általános fülön.</p>
      </div>

      <div v-else class="space-y-6">

        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold text-white">Elrendezés Sémák</h3>
          <button @click="showWizard = true" class="admin-btn text-sm">+ Új Séma</button>
        </div>

        <div v-if="editableFurniture?.slotGroups?.find(g => g.name === 'Layouts')?.schemas.length === 0"
          class="text-gray-500 italic">
          Még nincsenek sémák létrehozva.
        </div>

        <!-- SÉMA LISTA -->
        <div v-for="(schema, idx) in editableFurniture?.slotGroups?.find(g => g.name === 'Layouts')?.schemas || []"
          :key="schema.id" class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden transition-all"
          :class="{ 'ring-2 ring-blue-500': openSchemaId === schema.id }">

          <!-- SÉMA FEJLÉC -->
          <div class="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-700">

            <!-- BAL OLDAL: Név szerkesztés -->
            <div class="flex items-center gap-2 flex-grow">
              <span class="text-gray-500" v-html="PencilIcon"></span>
              <input type="text" v-model="schema.name"
                class="bg-transparent text-white font-bold focus:outline-none focus:border-b border-blue-500 w-full max-w-xs" />
            </div>

            <!-- JOBB OLDAL: Státuszok és Gombok -->
            <div class="flex items-center gap-2">

              <!-- 1. ÁLLAPOT JELZŐ / GOMB -->
              <span v-if="layoutGroup?.defaultSchemaId === schema.id"
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-900/30 border border-green-800 rounded mr-2 cursor-default select-none">
                Alapértelmezett
              </span>

              <button v-else @click="setDefaultSchema(schema.id)"
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-900/30 border border-blue-800 rounded hover:bg-blue-800/50 hover:text-white hover:border-blue-600 transition-all mr-2"
                title="Beállítás alapértelmezettként">
                Legyen Default
              </button>

              <!-- 2. SZERKESZTÉS / MEGNYITÁS GOMB -->
              <button @click="toggleSchema(schema.id)" class="p-1.5 rounded transition-colors flex items-center gap-1"
                :class="openSchemaId === schema.id ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'">
                <span v-if="openSchemaId === schema.id" class="text-xs font-bold uppercase">Szerkesztés</span>
                <span v-else class="text-xs font-bold uppercase">Megnyitás</span>
              </button>

              <!-- 3. TÖRLÉS GOMB -->
              <button @click="deleteSchema(idx)"
                class="text-red-400 hover:text-red-300 text-xs bg-red-900/20 hover:bg-red-900/40 px-2 py-1.5 rounded ml-2">Törlés</button>
            </div>
          </div>

          <!-- REKURZÍV FA NÉZET (Csak ha nyitva van) -->
          <div v-if="openSchemaId === schema.id" class="p-4 bg-gray-800/50">

            <div class="text-sm text-gray-400 mb-4">
              Itt szerkesztheted a bútor felépítését.
            </div>

            <!-- A) SPECIÁLIS POLC VEZÉRLŐ (Ha type === 'shelf') -->
            <div v-if="schema.type === 'shelf'" class="space-y-6">

              <!-- 1. MÓD VÁLASZTÓ -->
              <div class="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                <button @click="updateShelfConfig(schema, 'mode', 'auto')"
                  class="flex-1 py-2 text-sm font-bold rounded transition-colors"
                  :class="schema.shelfConfig?.mode === 'auto' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'">
                  🧮 Automatikus (Osztott)
                </button>
                <button @click="updateShelfConfig(schema, 'mode', 'custom')"
                  class="flex-1 py-2 text-sm font-bold rounded transition-colors"
                  :class="schema.shelfConfig?.mode === 'custom' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'">
                  📍 Egyedi (Fix Pontok)
                </button>
              </div>

              <!-- 2. AUTOMATA MÓD BEÁLLÍTÁSOK -->
              <div v-if="schema.shelfConfig?.mode === 'auto'"
                class="space-y-4 bg-gray-800 p-4 rounded border border-gray-700">

                <!-- Polc Típus Választó -->
                <div>
                  <label class="text-xs font-bold text-gray-500 uppercase mb-2 block">Polc Típusa</label>
                  <button @click="openShelfSelector(schema)"
                    class="w-full flex justify-between items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-white">
                    <span>{{ getComponentName(schema.shelfConfig?.componentId) || 'Válassz polcot...' }}</span>
                    <span class="text-gray-400">▼</span>
                  </button>
                </div>

                <!-- Darabszám Slider -->
                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-xs font-bold text-gray-500 uppercase">Polcok Száma</label>
                    <span class="text-sm font-bold text-blue-400">{{ schema.shelfConfig?.count || 0 }} db</span>
                  </div>
                  <input type="range" min="0" :max="getRootComponentMaxShelves() || 5" step="1"
                    :value="schema.shelfConfig?.count || 0"
                    @input="updateShelfConfig(schema, 'count', parseInt(($event.target as HTMLInputElement).value))"
                    class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  <div class="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>Max: {{ getRootComponentMaxShelves() || 5 }}</span>
                  </div>
                </div>

                <!-- Info -->
                <div class="text-xs text-gray-400 italic bg-gray-900/50 p-2 rounded">
                  ℹ️ A polcok egyenletesen lesznek elosztva a korpusz belső magasságában.
                </div>

              </div>

              <!-- 3. EGYEDI MÓD (Visszaesik a Fa nézetre) -->
              <div v-else>
                <div class="text-xs text-yellow-500 mb-2">
                  ⚠️ Egyedi módban a 3D modellben lévő csatlakozási pontokat (attach_shelf_...) használjuk.
                </div>
              </div>

            </div>

            <!-- B) HAGYOMÁNYOS FA NÉZET (Minden másra, VAGY ha shelf=custom) -->
            <div v-if="schema.type !== 'shelf' || schema.shelfConfig?.mode === 'custom'" class="space-y-4">
              <SchemaSlotCard v-for="point in getRootAttachmentPoints()" :key="point.id" :pointId="point.id"
                parentPath="root" :schema="schema.apply" :allowedTypes="point.allowedComponentTypes"
                :getSlot="getSlotForPath" @update:schema="handleSchemaUpdate" @update:slot="handleSlotUpdate"
                @update:schema-property="handleSchemaPropertyUpdate" />
            </div>

          </div>
        </div>

      </div>
    </div>

    <!-- WIZARD MODAL -->
    <SchemaWizard v-if="showWizard" @select="handleSchemaCreate" @cancel="showWizard = false" />

    <!-- POLC VÁLASZTÓ MODAL -->
    <ComponentSelectorModal v-if="showShelfSelector" :allowedTypes="['shelves']"
      :currentValue="activeShelfSchema?.shelfConfig?.componentId || null" :selectedValues="[]" :multiple="false"
      @select="handleShelfSelect" @close="showShelfSelector = false" />

  </div>
</template>
