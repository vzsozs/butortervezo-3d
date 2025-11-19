<script setup lang="ts">
import { computed, ref, provide, type ComponentPublicInstance } from 'vue'; 
// KIVETTEM a 'storeToRefs'-t, mert nem használtuk
import type { FurnitureConfig, ComponentSlotConfig, SlotGroup, Schema } from '@/config/furniture'; // HOZZÁADVA: Schema
import { useConfigStore } from '@/stores/config';
import SlotNode from './SlotNode.vue';
import { generateSmartSchemas } from '@/utils/AutoConfigurator';

// --- TÍPUSOK ---
// JAVÍTÁS: Kikapcsoljuk az any ellenőrzést erre a sorra, mert itt szükséges a dinamikus típus
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SimpleSlotUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedSlotUpdate = { slotId: string; update: SimpleSlotUpdate };

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

// --- STATE ---
const configStore = useConfigStore();
const { components: storeComponents, getComponentById } = configStore;

const editableFurniture = computed({
  get: () => props.furniture,
  set: (newValue) => emit('update:furniture', newValue)
});
provide('editableFurniture', editableFurniture);

// --- 1. INTELLIGENS SZÁMOZÁS (Auto-Naming) ---
const slotTemplates: Record<string, Partial<ComponentSlotConfig>> = {
  corpus: { slotId: 'corpus', name: 'Korpusz', componentType: 'corpuses', children: [] },
  front: { slotId: 'front', name: 'Front', componentType: 'fronts', attachToSlot: 'corpus', children: [] },
  shelf: { slotId: 'shelf', name: 'Polc', componentType: 'shelves', attachToSlot: 'corpus', children: [] },
  drawer: { slotId: 'drawer', name: 'Fiók', componentType: 'drawers', attachToSlot: 'corpus', children: [] },
  leg:    { slotId: 'leg', name: 'Láb', componentType: 'legs', attachToSlot: 'corpus', children: [] },
  handle: { slotId: 'handle', name: 'Fogantyú', componentType: 'handles', attachToSlot: 'front', children: [] },
};

function addSlotFromTemplate(template: Partial<ComponentSlotConfig>) {
  if (!editableFurniture.value) return;
  if (!editableFurniture.value.componentSlots) editableFurniture.value.componentSlots = [];
  
  const newSlot = JSON.parse(JSON.stringify(template));
  const prefix = template.slotId || 'slot';
  
  // 1. Sorszám meghatározása
  const existingCount = editableFurniture.value.componentSlots?.filter(s => s.slotId.startsWith(prefix)).length || 0;
  const nextIndex = existingCount + 1;
  
  newSlot.slotId = `${prefix}_${nextIndex}`;
  newSlot.name = `${template.name} ${nextIndex}`;

  // 2. OKOS AUTO-ATTACH LOGIKA
  if (newSlot.attachToSlot) {
    const parentSlot = allSlots.value.find(s => s.slotId === newSlot.attachToSlot);
    if (parentSlot && parentSlot.defaultComponent) {
      const parentComp = getComponentById(parentSlot.defaultComponent);
      
      if (parentComp && parentComp.attachmentPoints) {
        // Keresési stratégia:
        // 1. Próbáljuk meg a sorszámot is illeszteni (pl. "shelf" ÉS "2" vagy "02")
        let match = parentComp.attachmentPoints.find(p => {
          const pId = p.id.toLowerCase();
          const typeMatch = pId.includes(prefix) || pId.includes(newSlot.componentType);
          // Megnézzük, hogy a sorszám (pl. "2") benne van-e a pont nevében
          const indexMatch = pId.includes(nextIndex.toString()) || pId.includes(nextIndex.toString().padStart(2, '0'));
          return typeMatch && indexMatch;
        });

        // 2. Ha nincs sorszámos találat, vegyük az első szabadot (ami még nincs használva)
        if (!match) {
          const usedPoints = editableFurniture.value.componentSlots.map(s => s.useAttachmentPoint);
          match = parentComp.attachmentPoints.find(p => 
            (p.id.toLowerCase().includes(prefix) || p.id.toLowerCase().includes(newSlot.componentType)) &&
            !usedPoints.includes(p.id)
          );
        }

        if (match) {
          newSlot.useAttachmentPoint = match.id;
          console.log(`✅ Auto-Attach sikerült: ${newSlot.slotId} -> ${match.id}`);
        } else {
          console.warn(`⚠️ Auto-Attach sikertelen: Nem találtam szabad pontot ehhez: ${newSlot.slotId} (Szülő: ${parentComp.name})`);
        }
      }
    }
  }

  editableFurniture.value.componentSlots?.push(newSlot);
}

// --- 2. VIZUÁLIS CSOPORTOSÍTÁS ---
const groupedDisplay = computed(() => {
  if (!editableFurniture.value?.componentSlots) return { groups: {}, orphans: [] };

  const groups: Record<string, { title: string, slots: ComponentSlotConfig[] }> = {};
  const orphans: ComponentSlotConfig[] = [];

  editableFurniture.value.componentSlots.forEach(slot => {
    const match = slot.slotId.match(/^([a-z]+)(?:_?\d*)?$/i);
    
    if (match && match[1] && slotTemplates[match[1]]) {
      const key = match[1];
      if (!groups[key]) {
        groups[key] = { 
          title: slotTemplates[key].name || key,
          slots: [] 
        };
      }
      groups[key].slots.push(slot);
    } else {
      orphans.push(slot);
    }
  });

  return { groups, orphans };
});

// --- 3. VARÁZSLAT & KONFIGURÁCIÓ KEZELÉS ---

function getActiveConfigForGroup(slotIds: string[]) {
  if (!editableFurniture.value?.slotGroups) return null;
  return editableFurniture.value.slotGroups.find(g => 
    g.controlledSlots.length > 0 && 
    g.controlledSlots.every(id => slotIds.includes(id))
  );
}

function activateGroupMagic(groupKey: string, slots: ComponentSlotConfig[]) {
  if (!editableFurniture.value) return;
  
  const slotIds = slots.map(s => s.slotId);
  const featureName = slotTemplates[groupKey]?.name || groupKey;
  
  if (getActiveConfigForGroup(slotIds)) return;

  const firstSlot = slots[0];
  const defaultComp = firstSlot?.defaultComponent || null;
  
  const newGroup = generateSmartSchemas(featureName, slotIds, defaultComp);

  if (!editableFurniture.value.slotGroups) editableFurniture.value.slotGroups = [];
  editableFurniture.value.slotGroups.push(newGroup);
}

function removeConfigGroup(group: SlotGroup) {
  if (!editableFurniture.value?.slotGroups) return;
  const idx = editableFurniture.value.slotGroups.indexOf(group);
  if (idx > -1) editableFurniture.value.slotGroups.splice(idx, 1);
}

// --- SÉMA ELŐNÉZET ÉS TÖRLÉS (JAVÍTVA) ---

function previewSchema(schema: Schema) {
  if (!schema.apply) return;

  Object.entries(schema.apply).forEach(([slotId, componentId]) => {
    const slot = allSlots.value.find(s => s.slotId === slotId);
    if (slot) {
      // JAVÍTÁS: Típus kényszerítése (Type Casting), mert a TS nem tudja, hogy ez string vagy null
      slot.defaultComponent = componentId as string | null;
    }
  });
}

function removeSchemaFromGroup(group: SlotGroup, schemaIndex: number) {
  if (confirm('Biztosan törlöd ezt a variációt?')) {
    group.schemas.splice(schemaIndex, 1);
  }
}

// --- HELPEREK & UPDATE ---
const highlightedSlotId = ref<string | null>(null);
const slotNodeRefs = ref<Record<string, ComponentPublicInstance | Element | null>>({});
const setSlotNodeRef = (el: ComponentPublicInstance | Element | null, slotId: string) => { if (el) slotNodeRefs.value[slotId] = el; };
const suggestions = computed(() => ({ componentTypes: storeComponents.value ? Object.keys(storeComponents.value) : [], attachmentPoints: [] }));

const allSlots = computed(() => {
    const slots: ComponentSlotConfig[] = [];
    function traverse(nodes: ComponentSlotConfig[]) {
        for (const node of nodes) {
            slots.push(node);
            if (node.children) traverse(node.children);
        }
    }
    if (editableFurniture.value?.componentSlots && Array.isArray(editableFurniture.value.componentSlots)) {
        traverse(editableFurniture.value.componentSlots);
    }
    return slots;
});

function handleSlotUpdate(payload: SimpleSlotUpdate | NestedSlotUpdate, topLevelSlotId?: string) {
  let targetSlotId: string;
  let updateData: SimpleSlotUpdate;
  if ('slotId' in payload) { targetSlotId = payload.slotId; updateData = payload.update; } 
  else { if (!topLevelSlotId) return; targetSlotId = topLevelSlotId; updateData = payload; }

  const slot = allSlots.value.find(s => s.slotId === targetSlotId);
  if (slot) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (slot as any)[updateData.key] = updateData.value;
    if (updateData.key === 'allowedComponents' && Array.isArray(updateData.value)) {
      if (!slot.defaultComponent && updateData.value.length > 0) slot.defaultComponent = updateData.value[0] as string;
    }
  }
}

function findAndRemoveSlot(nodes: ComponentSlotConfig[], slotId: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node && node.slotId === slotId) { nodes.splice(i, 1); return true; }
        if (node && node.children && findAndRemoveSlot(node.children, slotId)) return true;
    }
    return false;
}
function handleSlotRemove(slotId: string) {
    if (editableFurniture.value?.componentSlots) findAndRemoveSlot(editableFurniture.value.componentSlots, slotId);
}
function saveChanges() { if (editableFurniture.value) emit('save', editableFurniture.value as FurnitureConfig); }
</script>

<template>
  <div class="admin-panel h-full flex flex-col" v-if="editableFurniture">
    
    <!-- HEADER -->
    <div class="flex justify-between items-start mb-4 border-b border-gray-700 pb-2">
      <div>
        <h3 class="text-xl font-bold text-white">{{ isNew ? 'Új Bútor' : editableFurniture.name }}</h3>
        <p class="text-sm text-gray-400">ID: {{ editableFurniture.id }}</p>
      </div>
      <div class="flex gap-2">
        <button @click="emit('cancel')" class="admin-btn-secondary text-sm">Mégse</button>
        <button @click="saveChanges" class="admin-btn text-sm">Mentés</button>
      </div>
    </div>

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

    <!-- ÚJ ELEM HOZZÁADÁSA (Gombok) -->
    <div class="mb-6">
      <h4 class="font-semibold mb-2 text-gray-300 text-sm">Új Elem Hozzáadása</h4>
      <div class="flex flex-wrap gap-2">
        <button v-for="(template, key) in slotTemplates" :key="key" @click="addSlotFromTemplate(template)" 
                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors border border-gray-600 flex items-center gap-2">
          <span>+ {{ template.name }}</span>
        </button>
      </div>
    </div>

    <!-- FŐ TARTALOM: CSOPORTOSÍTOTT NÉZET -->
    <div class="flex-1 overflow-y-auto space-y-6 pb-10">
      
      <!-- 1. CSOPORTOK (Polcok, Fiókok, stb.) -->
      <div v-for="(groupData, groupKey) in groupedDisplay.groups" :key="groupKey" 
           class="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
        
        <!-- CSOPORT FEJLÉC -->
        <div class="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
          <div class="flex items-center gap-3">
            <h4 class="text-lg font-bold text-white">{{ groupData.title }}</h4>
            <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{{ groupData.slots.length }} db</span>
          </div>

          <!-- VARÁZSGOMB (Ha még nincs konfiguráció) -->
          <button v-if="!getActiveConfigForGroup(groupData.slots.map(s => s.slotId))" 
                  @click="activateGroupMagic(groupKey as string, groupData.slots)"
                  class="text-yellow-400 hover:text-yellow-200 bg-yellow-900/30 hover:bg-yellow-900/50 px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors border border-yellow-700/50">
            <span>✨</span>
            <span class="font-bold">Automatikus Konfiguráció</span>
          </button>
        </div>

        <!-- AKTÍV KONFIGURÁCIÓ (Ha van - KÉK DOBOZ) -->
        <div v-if="getActiveConfigForGroup(groupData.slots.map(s => s.slotId))" 
             class="bg-blue-900/20 border-b border-blue-800 p-3">
          
          <div class="flex justify-between items-start mb-3">
            <div class="flex items-center gap-2">
              <span class="text-xl">🎛️</span>
              <span class="font-bold text-blue-400 text-sm uppercase tracking-wider">Aktív Vásárlói Opciók</span>
            </div>
            <button @click="removeConfigGroup(getActiveConfigForGroup(groupData.slots.map(s => s.slotId))!)" 
                    class="text-red-400 hover:text-red-300 text-xs underline">
              Teljes Konfiguráció Törlése
            </button>
          </div>

          <!-- SÉMÁK LISTÁJA (ÚJ DESIGN) -->
          <div class="flex flex-wrap gap-2">
            <div v-for="(schema, sIdx) in getActiveConfigForGroup(groupData.slots.map(s => s.slotId))!.schemas" :key="schema.id" 
                 class="flex items-center bg-gray-900 border border-blue-500/30 rounded overflow-hidden group hover:border-blue-400 transition-colors">
              
              <!-- Név -->
              <span class="px-3 py-1.5 text-blue-300 text-xs font-medium border-r border-blue-500/30">
                {{ schema.name }}
              </span>

              <!-- Szem (Preview) -->
              <button @click="previewSchema(schema)" 
                      class="p-1.5 hover:bg-blue-600/30 text-gray-400 hover:text-white transition-colors"
                      title="Előnézet alkalmazása">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
              </button>

              <!-- Kuka (Törlés) -->
              <button @click="removeSchemaFromGroup(getActiveConfigForGroup(groupData.slots.map(s => s.slotId))!, sIdx)" 
                      class="p-1.5 hover:bg-red-900/50 text-gray-500 hover:text-red-400 transition-colors"
                      title="Opció törlése">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>

        </div>

        <!-- SLOTOK LISTÁJA -->
        <div class="p-4 space-y-4">
           <SlotNode 
            v-for="slot in groupData.slots" 
            :key="slot.slotId"
            :node="slot"
            :suggestions="suggestions"
            :highlighted-slot-id="highlightedSlotId"
            :ref="(el) => setSlotNodeRef(el, slot.slotId)"
            @update:slot="handleSlotUpdate($event, slot.slotId)"
            @remove:slot="handleSlotRemove"
          />
        </div>
      </div>

      <!-- 2. ÁRVÁK (Egyéb slotok) -->
      <div v-if="groupedDisplay.orphans.length > 0" class="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
        <h4 class="text-sm font-bold text-gray-400 mb-4 uppercase">Egyéb Elemek</h4>
        <div class="space-y-4">
           <SlotNode 
            v-for="slot in groupedDisplay.orphans" 
            :key="slot.slotId"
            :node="slot"
            :suggestions="suggestions"
            :highlighted-slot-id="highlightedSlotId"
            :ref="(el) => setSlotNodeRef(el, slot.slotId)"
            @update:slot="handleSlotUpdate($event, slot.slotId)"
            @remove:slot="handleSlotRemove"
          />
        </div>
      </div>

    </div>
  </div>
</template>