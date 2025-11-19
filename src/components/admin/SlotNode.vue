<!-- src/components/admin/SlotNode.vue -->
<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'; 
import { storeToRefs } from 'pinia'; 
import { useConfigStore } from '@/stores/config'; 
import type { ComponentSlotConfig, FurnitureConfig } from '@/config/furniture'; 
import ChevronDown from '@/assets/icons/chevron-down.svg?component';

type TreeNode = ComponentSlotConfig & { children?: TreeNode[] };

const props = defineProps<{
  node: TreeNode;
  highlightedSlotId?: string | null; 
  suggestions: {
    componentTypes: string[];
    attachmentPoints: string[];
  };
}>();

// --- STORE IMPORT VISSZAÁLLÍTVA ---
const configStore = useConfigStore();
const { getComponentById } = configStore; // A gettert is behúzzuk
const { components: storeComponents } = storeToRefs(configStore);

// --- TÍPUSOK ÉS EMIT DEFINÍCIÓ ---
type SimpleUpdate = { key: keyof ComponentSlotConfig; value: any };
type NestedUpdate = { slotId: string; update: SimpleUpdate };

const emit = defineEmits<{
  (e: 'update:slot', payload: SimpleUpdate | NestedUpdate): void;
  (e: 'remove:slot', slotId: string): void;
}>();

const isHighlighted = computed(() => props.node.slotId === props.highlightedSlotId);

// JAVÍTÁS: Új computed property a lehetséges szülő slotok listázásához
const availableParentSlots = computed(() => {
  if (!editableFurniture?.value?.componentSlots) return [];
  // Kilistázzuk az összes többi slot ID-ját, ami nem a jelenlegi.
  return editableFurniture.value.componentSlots
    .map(s => s.slotId)
    .filter(id => id !== props.node.slotId);
});

// --- ÚJ LOGIKA ---

// 1. Inject-eljük a szülőtől kapott teljes bútor configot
const editableFurniture = inject<Ref<Partial<FurnitureConfig> | null>>('editableFurniture');

// 2. Kiszámoljuk a szülő által kínált, releváns csatlakozási pontokat
const parentAttachmentPoints = computed(() => {
  if (!props.node.attachToSlot || !editableFurniture?.value?.componentSlots) {
    return [];
  }
  
  // Keressük meg a szülő slotot a teljes listában
  const parentSlot = editableFurniture.value.componentSlots.find(
    s => s.slotId === props.node.attachToSlot
  );
  if (!parentSlot?.defaultComponent) return [];

  // Kérjük le a szülő komponens adatait a store-ból
  const parentComponent = getComponentById(parentSlot.defaultComponent);
  if (!parentComponent?.attachmentPoints) return [];

  // Szűrjük a pontokat a jelenlegi slot típusára (pl. csak 'legs' típusúakat)
  return parentComponent.attachmentPoints
    .filter(p => p.allowedComponentTypes.includes(props.node.componentType))
    .map(p => p.id);
});

// --- ÚJ LOGIKA A NEVEKHEZ ---
const allowedComponentsWithNames = computed(() => {
  if (!props.node.componentType || !props.node.allowedComponents) return [];
  
  const componentsOfType = storeComponents.value[props.node.componentType] || [];
  
  return props.node.allowedComponents
    .map(id => {
      const component = componentsOfType.find(c => c.id === id);
      return {
        id,
        name: component ? component.name : id // Fallback az ID-ra, ha a név nem található
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // ABC sorrendbe rendezzük
});

// 3. Függvény a mapping frissítésére
function updateAttachmentMapping(componentId: string, pointId: string, isChecked: boolean) {
  // Mély másolatot készítünk, hogy ne módosítsuk direktben a prop-ot
  const newMapping = JSON.parse(JSON.stringify(props.node.attachmentMapping || {}));

  // Biztosítjuk, hogy létezik a tömb az adott komponenshez
  if (!newMapping[componentId]) {
    newMapping[componentId] = [];
  }

  const points = newMapping[componentId] as string[];
  const index = points.indexOf(pointId);

  if (isChecked && index === -1) {
    // Hozzáadás, ha bepipálták és még nincs benne
    points.push(pointId);
  } else if (!isChecked && index > -1) {
    // Törlés, ha kivették a pipát és benne van
    points.splice(index, 1);
  }

  updateSlot('attachmentMapping', newMapping);
}

// --- ÚJ: Globális "Összes/Semelyik" vezérlő függvény ---
// Ez a függvény a komponensenkénti toggle-t váltja le.
function setAllMappings(selectAll: boolean) {
  const newMapping = JSON.parse(JSON.stringify(props.node.attachmentMapping || {}));
  
  // Meghatározzuk, hogy a teljes listát vagy egy üres listát kell-e beállítani
  const pointsToSet = selectAll ? [...parentAttachmentPoints.value] : [];

  // Ha nincsenek engedélyezett komponensek, nem csinálunk semmit
  if (!props.node.allowedComponents) return;

  // Végigmegyünk az ÖSSZES engedélyezett komponensen...
  for (const componentId of props.node.allowedComponents) {
    // ...és mindegyikre beállítjuk a kívánt állapotot.
    newMapping[componentId] = pointsToSet;
  }

  updateSlot('attachmentMapping', newMapping);
}

// --- ÚJ LOGIKA AZ ALLOWEDCOMPONENTS KEZELÉSÉHEZ ---

// 1. Egy computed, ami visszaadja az összes lehetséges komponenst az adott típushoz.
const allComponentsForType = computed(() => {
  if (!props.node.componentType) return [];
  // Visszaadjuk a store-ból a komponenseket, név szerint rendezve.
  return (storeComponents.value[props.node.componentType] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
});

// 2. Függvény egyedi checkbox kattintás kezelésére.
function updateAllowedComponent(componentId: string, isChecked: boolean) {
  // Másolatot készítünk, hogy ne a prop-ot módosítsuk.
  const newAllowed = [...(props.node.allowedComponents || [])];
  const index = newAllowed.indexOf(componentId);

  if (isChecked && index === -1) {
    newAllowed.push(componentId); // Hozzáadás
  } else if (!isChecked && index > -1) {
    newAllowed.splice(index, 1); // Törlés
  }

  updateSlot('allowedComponents', newAllowed);
}

// 3. Függvény az "Összes" / "Semelyik" gombokhoz.
function setAllAllowedComponents(selectAll: boolean) {
  if (selectAll) {
    // Az összes lehetséges komponens ID-ját beállítjuk.
    const allIds = allComponentsForType.value.map(c => c.id);
    updateSlot('allowedComponents', allIds);
  } else {
    // Kiürítjük a tömböt.
    updateSlot('allowedComponents', []);
  }
}

function updateSlot<K extends keyof ComponentSlotConfig>(key: K, value: ComponentSlotConfig[K]) {
  emit('update:slot', { key, value });
}

function removeSlot() {
  emit('remove:slot', props.node.slotId);
}

// --- FORGATÁSI LOGIKA (VÁLTOZATLAN) ---
const rotationInDegrees = computed(() => {
  const rad = props.node.rotation || { x: 0, y: 0, z: 0 };
  const toDeg = (r: number) => Math.round(r * (180 / Math.PI));
  const normalize = (deg: number) => (deg % 360 + 360) % 360;
  return {
    x: normalize(toDeg(rad.x)),
    y: normalize(toDeg(rad.y)),
    z: normalize(toDeg(rad.z)),
  };
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
  <div class="bg-gray-800 p-4 rounded-md border border-gray-700"
       :class="{ 'shadow-lg shadow-blue-500/50 ring-2 ring-blue-500': isHighlighted }">
    
    <!-- Fejléc (változatlan) -->
    <div class="flex justify-between items-center">
      <input type="text" :value="node.name" @input="updateSlot('name', ($event.target as HTMLInputElement).value)" placeholder="Slot neve..." class="admin-input bg-transparent text-lg font-semibold !p-0 !border-0"/>
      <button @click="removeSlot" class="admin-btn-danger text-xs !py-1 !px-2">Törlés</button>
    </div>

    <!-- JAVÍTÁS: Az egész szekció egy space-y-4 konténerben van a megfelelő térközökért -->
    <div class="space-y-4 mt-4 border-t border-gray-700 pt-4">

      <!-- Alap beállítások: Read-only slotId és dropdown attachToSlot -->
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-2 items-center">
        <label class="admin-label justify-self-end">slotId</label>
        <p class="admin-input bg-gray-700/50 text-gray-400 select-none">{{ node.slotId }}</p>

        <label class="admin-label justify-self-end">attachToSlot</label>
        <select :value="node.attachToSlot" @change="updateSlot('attachToSlot', ($event.target as HTMLSelectElement).value)" class="admin-select">
          <option value="">-- Gyökér elem --</option>
          <option v-for="slotId in availableParentSlots" :key="slotId" :value="slotId">{{ slotId }}</option>
        </select>
      </div>

      <!-- Komponens választás: Precíz 4 oszlopos grid az igazításhoz -->
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-2 items-center">
        <label class="admin-label justify-self-end">componentType</label>
        <p class="admin-input bg-gray-700/50 text-gray-400 select-none">{{ node.componentType }}</p>

        <label class="admin-label justify-self-end">defaultComponent</label>
        <select v-if="node.componentType" :value="node.defaultComponent" @change="updateSlot('defaultComponent', ($event.target as HTMLSelectElement).value)" class="admin-select">
          <option v-for="comp in allComponentsForType.filter(c => node.allowedComponents?.includes(c.id))" :key="comp.id" :value="comp.id">{{ comp.name }}</option>
        </select>
      </div>
      
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="admin-label !mb-0">Engedélyezett Komponensek</label>
            <button @click="setAllAllowedComponents(true)" class="admin-btn-secondary text-xs !py-1 !px-2">Összes</button>
            <button @click="setAllAllowedComponents(false)" class="admin-btn-secondary text-xs !py-1 !px-2">Semelyik</button>
        </div>
        
        <!-- JAVÍTÁS: A lista megkapta a kért keretet és belső paddinget -->
        <div class="max-h-48 overflow-y-auto space-y-1 border border-gray-700 rounded-md p-3">
          <div v-if="allComponentsForType.length === 0" class="text-xs text-gray-500 italic text-center py-2">
            Nincsenek komponensek a kiválasztott 'componentType'-hoz.
          </div>
          <label v-for="comp in allComponentsForType" :key="comp.id" class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-gray-700/50 transition-colors">
            <input type="checkbox" :checked="node.allowedComponents?.includes(comp.id)" @change="updateAllowedComponent(comp.id, ($event.target as HTMLInputElement).checked)" class="form-checkbox bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"/>
            <span class="text-gray-300">{{ comp.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Haladó beállítások (NAGY ÁTALAKÍTÁS) -->
    <div class="space-y-4 mt-4 border-t border-gray-700 pt-4">

      <!-- ÚJ SZEKCIÓ: CSATLAKOZÁSI PONT VÁLASZTÓ -->
      <div v-if="node.attachToSlot">
        <label class="admin-label block">Használt csatlakozási pont (useAttachmentPoint)</label>
        <select 
          :value="node.useAttachmentPoint" 
          @change="updateSlot('useAttachmentPoint', ($event.target as HTMLSelectElement).value)" 
          class="admin-select"
        >
          <option value="">-- Válassz csatlakozási pontot --</option>
          <option v-for="point in parentAttachmentPoints" :key="point" :value="point">
            {{ point }}
          </option>
        </select>
        <p v-if="parentAttachmentPoints.length === 0" class="text-xs text-yellow-400 mt-1">
          A szülő komponens nem kínál megfelelő csatlakozási pontot ehhez a slottípushoz.
        </p>
      </div>
      
      <!-- Forgatási Szabályok: Nagyobb, kerekített gombok és SVG ikonok -->
      <div v-if="node.attachToSlot">
        <label class="admin-label mb-2">Forgatási Szabályok</label>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="flex items-center justify-between bg-gray-900 rounded-md px-2 py-1">
            <button @click="rotate(axis, -90)" class="p-2 rounded-md hover:bg-gray-700 transition-colors"><ChevronDown class="w-5 h-5 transform rotate-90 text-gray-300" /></button>
            <div class="text-center">
              <span class="text-xs text-gray-500 uppercase">{{ axis }}</span>
              <span class="font-mono text-lg text-gray-300 block">{{ rotationInDegrees[axis] }}°</span>
            </div>
            <button @click="rotate(axis, 90)" class="p-2 rounded-md hover:bg-gray-700 transition-colors"><ChevronDown class="w-5 h-5 transform -rotate-90 text-gray-300" /></button>
          </div>
        </div>
      </div>

      <!-- AZ ÁTALAKÍTOTT CSATLAKOZÁSI SZABÁLYOK SZEKCIÓ -->
      <div v-if="node.attachToSlot && parentAttachmentPoints.length > 0" class="bg-gray-900 p-3 rounded">
        
        <!-- ÚJ: Fejléc a címmel és a globális gombokkal -->
        <div class="flex justify-between items-center mb-3">
          <label class="admin-label !mb-0">Csatlakozási Szabályok</label>
          <div class="flex gap-2">
            <button @click="setAllMappings(true)" class="admin-btn-secondary text-xs !py-1 !px-2">Összes</button>
            <button @click="setAllMappings(false)" class="admin-btn-secondary text-xs !py-1 !px-2">Semelyik</button>
          </div>
        </div>
        
        <div v-if="!allowedComponentsWithNames || allowedComponentsWithNames.length === 0" class="text-xs text-gray-500 italic">
          Válassz ki legalább egy "allowedComponent"-et a szabályok beállításához.
        </div>

        <div v-else class="space-y-4">
          <!-- Végigmegyünk az összes engedélyezett alkatrészen -->
          <div v-for="component in allowedComponentsWithNames" :key="component.id">
            
            <!-- A komponens neve most már csak egy egyszerű cím, gomb nélkül -->
            <p class="font-semibold text-sm text-gray-300 mb-2">{{ component.name }}</p>

            <div class="pl-2 flex flex-col gap-1">
              <!-- A checkbox lista logikája változatlan -->
              <label v-for="pointId in parentAttachmentPoints" :key="pointId" class="flex items-center gap-2 text-sm cursor-pointer">
                <input 
                  type="checkbox"
                  :checked="node.attachmentMapping?.[component.id]?.includes(pointId)"
                  @change="updateAttachmentMapping(component.id, pointId, ($event.target as HTMLInputElement).checked)"
                  class="form-checkbox bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                />
                <span class="font-mono text-gray-300">{{ pointId }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rekurzív rész -->
    <div v-if="node.children && node.children.length > 0" class="ml-6 mt-4 space-y-4 border-l-2 border-gray-600 pl-4">
      <SlotNode 
        v-for="childNode in node.children" 
        :key="childNode.slotId"
        :node="childNode"
        :suggestions="suggestions"
        :highlighted-slot-id="highlightedSlotId" 
        @update:slot="payload => emit('update:slot', { slotId: childNode.slotId, update: payload as SimpleUpdate })"
        @remove:slot="slotId => emit('remove:slot', slotId)"
      />
    </div>
  </div>
</template>