<script setup lang="ts">
import { computed, ref, inject, type Ref } from 'vue';
import { type FurnitureConfig, type ComponentSlotConfig, ComponentType } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import { storeToRefs } from 'pinia';
import SlotNode from './SlotNode.vue';
import { getSuggestedComponentConfig } from '@/utils/AutoConfigurator';

// --- TÍPUSOK ---
type SimpleSlotUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedSlotUpdate = { slotId: string; update: SimpleSlotUpdate };

defineProps<{
  isNew: boolean;
}>();

const emit = defineEmits<{
  (e: 'switch-tab', tab: 'layouts'): void;
}>();

const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

// Inject editableFurniture from parent
const editableFurniture = inject<Ref<FurnitureConfig | null>>('editableFurniture');

// --- SLOT TEMPLATES ---
const slotTemplates: Record<string, { name: string, type: string, prefix: string }> = {
  corpus: { name: 'Korpusz', type: ComponentType.CORPUS, prefix: 'corpus' },
  front: { name: 'Ajtó', type: ComponentType.FRONT, prefix: 'front' },
  handle: { name: 'Fogantyú', type: ComponentType.HANDLE, prefix: 'handle' },
  leg: { name: 'Láb', type: ComponentType.LEG, prefix: 'leg' },
  shelf: { name: 'Polc', type: ComponentType.SHELF, prefix: 'shelf' },
  drawer: { name: 'Fiók', type: ComponentType.DRAWER, prefix: 'drawer' },
};

const templateOrder = ['corpus', 'front', 'handle', 'leg', 'shelf', 'drawer'];

const hasAnyLayouts = computed(() => {
  const layoutGroup = editableFurniture?.value?.slotGroups?.find(g => g.name === 'Layouts');
  return (layoutGroup?.schemas.length || 0) > 0;
});

const suggestions = computed(() => ({ componentTypes: storeComponents.value ? Object.keys(storeComponents.value) : [], attachmentPoints: [] }));
const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, any>>({});
function setSlotNodeRef(el: any, slotId: string) { if (el) slotNodeRefs.value[slotId] = el; }

// --- LOGIKA ---

function isGroupManagedByLayout(groupKey: string): boolean {
  if (!editableFurniture?.value?.slotGroups) return false;
  if (groupKey === 'corpus') return false;

  const layoutGroup = editableFurniture.value.slotGroups.find(g => g.name === 'Layouts');
  if (!layoutGroup) return false;

  return layoutGroup.schemas.some(schema => {
    if (schema.type === groupKey) return true;
    if (schema.type === 'front' && groupKey === 'handle') return true;
    return false;
  });
}

function addSlotFromTemplate(template: { name: string, type: string, prefix: string }) {
  if (!editableFurniture?.value) return;
  if (!editableFurniture.value.componentSlots) editableFurniture.value.componentSlots = [];

  const suggestions = getSuggestedComponentConfig(template.type, storeComponents.value);
  const count = editableFurniture.value.componentSlots.filter(s => s.slotId.startsWith(template.prefix)).length + 1;

  const newSlot: ComponentSlotConfig = {
    slotId: `${template.prefix}_${count}`,
    name: `${template.name} ${count}`,
    componentType: template.type,
    allowedComponents: suggestions.allowedComponents,
    defaultComponent: suggestions.defaultComponent ?? null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    attachToSlot: '',
    useAttachmentPoint: '',
  };

  if (newSlot.componentType === ComponentType.HANDLE) {
    const parent = editableFurniture.value.componentSlots.find(s =>
      s.componentType === ComponentType.FRONT || s.componentType === ComponentType.DRAWER
    );
    if (parent) {
      newSlot.attachToSlot = parent.slotId;
    }
  }
  else if (newSlot.componentType !== ComponentType.CORPUS) {
    const corpus = editableFurniture.value.componentSlots.find(s => s.slotId.includes('corpus'));
    if (corpus) {
      newSlot.attachToSlot = corpus.slotId;
    }
  }

  editableFurniture.value.componentSlots.push(newSlot);
  // Trigger reactivity
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

function handleSlotRemove(slotId: string) {
  if (!editableFurniture?.value?.componentSlots) return;
  const index = editableFurniture.value.componentSlots.findIndex(s => s.slotId === slotId);
  if (index !== -1) {
    editableFurniture.value.componentSlots.splice(index, 1);
    editableFurniture.value = { ...editableFurniture.value };
  }
}

// --- VIZUÁLIS CSOPORTOSÍTÁS ---
const groupedDisplay = computed(() => {
  if (!editableFurniture?.value?.componentSlots) return { groups: {}, orphans: [] };

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

function getSlotsForGroup(groupKey: string) {
  return groupedDisplay.value.groups[groupKey]?.slots || [];
}

// Expose scrollToSlot for parent
function scrollToSlot(slotId: string) {
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

defineExpose({ scrollToSlot });

</script>

<template>
  <div class="flex-1 overflow-y-auto space-y-6 pb-10" v-if="editableFurniture">

    <!-- ALAP ADATOK -->
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label class="admin-label">Megnevezés</label>
        <input type="text" v-model="editableFurniture.name" class="admin-input" />
      </div>
      <div>
        <label class="admin-label">Kategória</label>
        <input type="text" v-model="editableFurniture.category"
          class="admin-input bg-gray-700/50 text-gray-400 cursor-not-allowed" readonly />
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
          <button @click="emit('switch-tab', 'layouts')"
            class="admin-btn-secondary text-sm inline-flex items-center gap-2">
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
</template>
