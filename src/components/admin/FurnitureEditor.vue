<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance, provide } from 'vue'; 
import { storeToRefs } from 'pinia';
import type { FurnitureConfig, ComponentSlotConfig, SlotGroup, Schema } from '@/config/furniture';
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';

const props = defineProps<{
  furniture: Partial<FurnitureConfig> | null;
  isNew: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:furniture', value: Partial<FurnitureConfig> | null): void;
  (e: 'save', value: FurnitureConfig): void;
  (e: 'cancel'): void;
  (e: 'delete'): void; 
}>();

const editableFurniture = computed({
  get: () => props.furniture,
  set: (newValue) => emit('update:furniture', newValue)
});

provide('editableFurniture', editableFurniture);

const configStore = useConfigStore();
const { components: storeComponents } = storeToRefs(configStore);

const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, ComponentPublicInstance | Element | null>>({});
const setSlotNodeRef = (el: ComponentPublicInstance | Element | null, slotId: string) => {
  if (el) slotNodeRefs.value[slotId] = el;
};
const slotTemplates: Record<string, Partial<ComponentSlotConfig>> = {
  corpus: { slotId: 'corpus', name: 'Korpusz', componentType: 'corpuses', children: [] },
  front: { slotId: 'front', name: 'Front', componentType: 'fronts', attachToSlot: 'corpus', children: [] },
  shelf: { slotId: 'shelf', name: 'Polc', componentType: 'shelves', attachToSlot: 'corpus', children: [] },
};

// --- HELPER COMPUTED PROPERTIES ---
const allSlots = computed(() => {
    const slots: ComponentSlotConfig[] = [];
    function traverse(nodes: ComponentSlotConfig[]) {
        for (const node of nodes) {
            slots.push(node);
            if (node.children) {
                traverse(node.children);
            }
        }
    }
    if (editableFurniture.value?.componentSlots) {
        traverse(editableFurniture.value.componentSlots);
    }
    return slots;
});

const allSlotIds = computed(() => allSlots.value.map(s => s.slotId));

function getSlotById(slotId: string): ComponentSlotConfig | undefined {
    return allSlots.value.find(s => s.slotId === slotId);
}

// --- SLOT CSOPORT LOGIKA ---
function addSlotGroup() {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.slotGroups) {
    editableFurniture.value.slotGroups = [];
  }
  const newGroup: SlotGroup = {
    groupId: `group_${Date.now()}`, name: 'Új Csoport', controlType: 'schema_select', controlledSlots: [], schemas: []
  };
  editableFurniture.value.slotGroups.push(newGroup);
}
function removeSlotGroup(index: number) {
  if (!editableFurniture.value?.slotGroups) return;
  editableFurniture.value.slotGroups.splice(index, 1);
}
function addSchema(groupIndex: number) {
  const group = editableFurniture.value?.slotGroups?.[groupIndex];
  if (group) {
    const newSchema: Schema = {
      id: `schema_${Date.now()}`, name: 'Új Elrendezés', apply: {}
    };
    group.schemas.push(newSchema);
  }
}
function removeSchema(groupIndex: number, schemaIndex: number) {
  const group = editableFurniture.value?.slotGroups?.[groupIndex];
  if (group) {
    group.schemas.splice(schemaIndex, 1);
  }
}

// --- SLOT KEZELŐ FÜGGVÉNYEK ---
const hierarchicalSlots = computed(() => editableFurniture.value?.componentSlots || []);

function addSlotFromTemplate(template: Partial<ComponentSlotConfig>) {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.componentSlots) {
    editableFurniture.value.componentSlots = [];
  }
  const newSlot = JSON.parse(JSON.stringify(template));
  newSlot.slotId = `${template.slotId}_${Date.now()}`;
  editableFurniture.value.componentSlots.push(newSlot);
}

const suggestions = computed(() => ({
  componentTypes: Object.keys(storeComponents.value),
  attachmentPoints: [],
}));

// JAVÍTÁS: A típusokat még pontosabbra vesszük
type SimpleSlotUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedSlotUpdate = { slotId: string; update: SimpleSlotUpdate };

function handleSlotUpdate(payload: SimpleSlotUpdate | NestedSlotUpdate, topLevelSlotId?: string) {
  let targetSlotId: string;
  let updateData: SimpleSlotUpdate;

  if ('slotId' in payload) {
    // Beágyazott hívás jött
    targetSlotId = payload.slotId;
    updateData = payload.update;
  } else {
    // Legfelső szintű hívás jött
    if (!topLevelSlotId) return;
    targetSlotId = topLevelSlotId;
    updateData = payload;
  }

  const slot = allSlots.value.find(s => s.slotId === targetSlotId);
  
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

// JAVÍTÁS: A rekurzív törlő most már teljesen típusbiztos
function findAndRemoveSlot(nodes: ComponentSlotConfig[], slotId: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        // JAVÍTÁS: Ellenőrizzük, hogy a 'node' biztosan létezik-e (bár a ciklus miatt mindig létezni fog)
        if (node && node.slotId === slotId) {
            nodes.splice(i, 1);
            return true;
        }
        // JAVÍTÁS: Itt is ellenőrizzük a 'node' létezését
        if (node && node.children && findAndRemoveSlot(node.children, slotId)) {
            return true;
        }
    }
    return false;
}

function handleSlotRemove(slotId: string) {
    if (editableFurniture.value?.componentSlots) {
        findAndRemoveSlot(editableFurniture.value.componentSlots, slotId);
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
        <!-- JAVÍTÁS: A mező most már mindig readonly, de a stílusa jelzi, hogy ez egy input -->
        <input 
          type="text" 
          v-model="editableFurniture.id" 
          placeholder="Automatikus..." 
          class="admin-input bg-gray-700/50 text-gray-400 select-all" 
          readonly 
        />
      </div>
      <div>
        <label class="admin-label">category</label>
        <input type="text" v-model="editableFurniture.category" placeholder="pl. bottom_cabinets" class="admin-input" />
      </div>
    </div>

    <!-- ÚJ SZEKCIÓ: SLOT CSOPORT SZERKESZTŐ -->
    <div class="mb-6 p-4 bg-gray-900/50 rounded-lg space-y-4">
      <div class="flex justify-between items-center">
        <h4 class="font-semibold text-gray-300">Slot Csoportok (Vezérlők)</h4>
        <button @click="addSlotGroup" class="admin-btn-secondary text-sm">+ Új Csoport</button>
      </div>

      <div v-for="(group, groupIndex) in editableFurniture.slotGroups" :key="group.groupId" class="p-3 bg-gray-800 rounded-md border border-gray-700 space-y-3">
        <!-- Csoport Fejléc -->
        <div class="flex justify-between items-center">
          <input type="text" v-model="group.name" class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0 w-full"/>
          <button @click="removeSlotGroup(groupIndex)" class="admin-btn-danger text-xs !py-1 !px-2">Csoport Törlése</button>
        </div>

        <!-- Irányított Slotok -->
        <div>
          <label class="admin-label">Irányított Slotok</label>
          <div class="p-2 bg-gray-900/50 rounded max-h-32 overflow-y-auto space-y-1">
            <label v-for="slotId in allSlotIds" :key="slotId" class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" :value="slotId" v-model="group.controlledSlots" class="form-checkbox"/>
              {{ slotId }}
            </label>
          </div>
        </div>

        <!-- Sémák -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <label class="admin-label">Sémák (Elrendezések)</label>
            <button @click="addSchema(groupIndex)" class="admin-btn-secondary text-xs !py-1 !px-2">+ Új Séma</button>
          </div>
          <div class="space-y-2">
            <div v-for="(schema, schemaIndex) in group.schemas" :key="schema.id" class="p-2 bg-gray-900/50 rounded">
              <div class="flex items-center gap-2 mb-2">
                <input type="text" v-model="schema.name" placeholder="Séma neve..." class="admin-input flex-grow"/>
                <button @click="removeSchema(groupIndex, schemaIndex)" class="admin-btn-danger text-xs !py-1 !px-2">X</button>
              </div>
              <!-- Szabályok -->
              <div class="pl-4 space-y-1">
                <div v-for="slotId in group.controlledSlots" :key="slotId" class="grid grid-cols-2 items-center gap-2">
                  <label class="text-xs text-gray-400 text-right">{{ slotId }}</label>
                  <select v-model="schema.apply[slotId]" class="admin-select text-xs">
                    <option :value="null">-- Kikapcsolva --</option>
                    <option v-for="comp in getSlotById(slotId)?.allowedComponents" :key="comp" :value="comp">{{ comp }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SLOT DEFINÍCIÓK (változatlan) -->
    <div class="mb-6 p-4 bg-gray-800 rounded-lg">
      <h4 class="font-semibold mb-2 text-gray-300">Slot Definíciók (Tervrajz)</h4>
      <div class="flex flex-wrap gap-2">
        <button v-for="(template, key) in slotTemplates" :key="key" @click="addSlotFromTemplate(template)" class="admin-btn-secondary text-sm">+ {{ template.name }}</button>
      </div>
    </div>
    <div class="space-y-4">
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
    
    <!-- ÚJ GOMB ELRENDEZÉS -->
    <div class="flex justify-between items-center mt-8 pt-6 border-t border-gray-700">
      <button @click="emit('delete')" class="admin-btn-danger">Bútor Törlése</button>
      <div class="flex gap-4">
        <button @click="emit('cancel')" class="admin-btn-secondary">Mégse</button>
        <button @click="saveChanges" class="admin-btn">Bútor Mentése</button>
      </div>
    </div>
  </div>
  
  <div class="admin-panel flex items-center justify-center text-gray-500" v-else>
    <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
  </div>
</template>