<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue';
import { storeToRefs } from 'pinia';
import type { FurnitureConfig, ComponentSlotConfig } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';

// JAVÍTÁS: A 'v-model' a 'modelValue' prop-ot és az 'update:modelValue' eseményt használja
const props = defineProps<{
  furniture: Partial<FurnitureConfig> | null;
  isNew: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:furniture', value: Partial<FurnitureConfig> | null): void;
  (e: 'save', value: FurnitureConfig): void;
  (e: 'cancel'): void;
}>();

// JAVÍTÁS: A belső másolat helyett egy 'computed' property-t használunk
// Ez olvassa a prop-ot, és íráskor kibocsát egy 'update' eseményt.
const editableFurniture = computed({
  get() {
    return props.furniture;
  },
  set(newValue) {
    console.log('➡️ LOG A: [FurnitureEditor] A computed.set lefutott, ezt küldöm fel:', JSON.parse(JSON.stringify(newValue)));
    emit('update:furniture', newValue);
  }
});

const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, ComponentPublicInstance | Element | null>>({});

// A watch blokkok már nem kellenek, mert a 'computed' kezeli a szinkronizációt
// és az ID generálást a 'handleCreateNewFurniture'-be helyezzük át.

const setSlotNodeRef = (el: ComponentPublicInstance | Element | null, slotId: string) => {
  if (el) slotNodeRefs.value[slotId] = el;
};

const slotTemplates: Record<string, Partial<ComponentSlotConfig>> = {
  corpus: { slotId: 'corpus', name: 'Korpusz', componentType: 'corpuses', attachToSlot: '', allowedComponents: [], defaultComponent: '' },
  front: { slotId: 'front', name: 'Front', componentType: 'fronts', attachToSlot: 'corpus', allowedComponents: [], defaultComponent: '' },
  handle: { slotId: 'handle', name: 'Fogantyú', componentType: 'handles', attachToSlot: 'front', allowedComponents: [], defaultComponent: '' },
  leg: { slotId: 'leg', name: 'Láb', componentType: 'legs', attachToSlot: 'corpus', allowedComponents: [], defaultComponent: '' },
};

const hierarchicalSlots = computed(() => {
  if (!editableFurniture.value?.componentSlots) return [];
  
  // JAVÍTÁS: Nincs többé mély másolás, közvetlenül a reaktív adatokkal dolgozunk
  type SlotWithChildren = ComponentSlotConfig & { children: SlotWithChildren[] };
  const slots = editableFurniture.value.componentSlots as SlotWithChildren[];
  
  const slotMap = new Map(slots.map(s => [s.slotId, s]));
  const tree: SlotWithChildren[] = [];

  // Biztosítjuk, hogy minden slotnak legyen 'children' tömbje
  slots.forEach(s => {
    if (!s.children) {
      s.children = [];
    } else {
      s.children.length = 0; // Kiürítjük a régit, hogy ne duplikálódjon
    }
  });

  slots.forEach(s => {
    if (s.attachToSlot && slotMap.has(s.attachToSlot)) {
      slotMap.get(s.attachToSlot)!.children.push(s);
    } else {
      tree.push(s);
    }
  });
  return tree;
});

const suggestions = computed(() => ({
  componentTypes: Object.keys(storeComponents.value),
  attachmentPoints: [],
}));

function addSlotFromTemplate(template: Partial<ComponentSlotConfig>) {
  if (!editableFurniture.value?.componentSlots) return;
  const newSlot = JSON.parse(JSON.stringify(template));
  editableFurniture.value.componentSlots.push(newSlot);
}

type SlotUpdatePayload = { key: keyof ComponentSlotConfig; value: any } | { slotId: string; update: { key: keyof ComponentSlotConfig; value: any } };

function handleSlotUpdate(payload: SlotUpdatePayload, topLevelSlotId: string): void {
  if (!editableFurniture.value?.componentSlots) return;
  
  let targetSlotId: string;
  let updateData: { key: keyof ComponentSlotConfig; value: any };

  if ('slotId' in payload) {
    targetSlotId = payload.slotId;
    updateData = payload.update;
  } else {
    targetSlotId = topLevelSlotId;
    updateData = payload;
  }

  const slot = editableFurniture.value.componentSlots.find(s => s.slotId === targetSlotId);
  
  if (slot) {
    // @ts-expect-error - a
    slot[updateData.key] = updateData.value;

    if (updateData.key === 'allowedComponents' && Array.isArray(updateData.value)) {
      if (!slot.defaultComponent && updateData.value.length > 0) {
        slot.defaultComponent = updateData.value[0] as string;
      }
    }
  }
}

function handleSlotRemove(slotId: string) {
  if (!editableFurniture.value?.componentSlots) return;
  const index = editableFurniture.value.componentSlots.findIndex(s => s.slotId === slotId);
  if (index > -1) {
    editableFurniture.value.componentSlots.splice(index, 1);
  }
}

function saveChanges() {
  if (editableFurniture.value) {
    emit('save', editableFurniture.value as FurnitureConfig);
  }
}

function scrollToSlot(slotId: string) {
  highlightedSlotId.value = slotId;
  const targetRef = slotNodeRefs.value[slotId];
  const targetElement = targetRef && '$el' in targetRef ? targetRef.$el : targetRef;
  if (targetElement) {
    (targetElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setTimeout(() => {
    highlightedSlotId.value = null;
  }, 1500);
}

defineExpose({ scrollToSlot });
</script>

<template>
  <div class="admin-panel overflow-y-auto" v-if="editableFurniture">
    <h3 class="text-xl font-bold mb-6">{{ isNew ? 'Új Bútor Létrehozása' : `Szerkesztés: ${editableFurniture.name}` }}</h3>
    
    <div class="grid grid-cols-1 gap-4 mb-8">
      <div>
        <label class="admin-label">name</label>
        <input type="text" v-model="editableFurniture.name" placeholder="Bútor neve..." class="admin-input" />
      </div>
      <div>
        <label class="admin-label">id</label>
        <input type="text" v-model="editableFurniture.id" placeholder="Automatikus..." class="admin-input" :disabled="!isNew" />
      </div>
      <div>
        <label class="admin-label">category</label>
        <input type="text" v-model="editableFurniture.category" placeholder="pl. bottom_cabinets" class="admin-input" />
      </div>
    </div>

    <div class="mb-6 p-4 bg-gray-800 rounded-lg">
      <h4 class="font-semibold mb-2 text-gray-300">Új Slot Hozzáadása</h4>
      <div class="flex flex-wrap gap-2">
        <button v-for="(template, key) in slotTemplates" :key="key" @click="addSlotFromTemplate(template)" class="admin-btn-secondary text-sm">
          + {{ template.name }}
        </button>
      </div>
    </div>

    <div class="space-y-4">
      <p v-if="!hierarchicalSlots || hierarchicalSlots.length === 0" class="text-center text-gray-500 py-4">Nincsenek slotok. Adj hozzá egyet a sablonok közül!</p>
      <SlotNode 
        v-for="slot in hierarchicalSlots" 
        :key="slot.slotId"
        :node="slot"
        :suggestions="suggestions"
        :highlighted-slot-id="highlightedSlotId"
        :ref="(el) => setSlotNodeRef(el, slot.slotId)"
        @update:slot="handleSlotUpdate($event, slot.slotId)"
        @remove:slot="handleSlotRemove(slot.slotId)"
      />
    </div>
    
    <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
      <button @click="emit('cancel')" class="admin-btn-secondary">Mégse</button>
      <button @click="saveChanges" class="admin-btn">Változások Alkalmazása</button>
    </div>
  </div>
  
  <div class="admin-panel flex items-center justify-center text-gray-500" v-else>
    <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
  </div>
</template>