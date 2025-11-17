<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { ComponentConfig, ComponentDatabase } from '@/config/furniture';

const props = defineProps<{
  component: Partial<ComponentConfig> | null;
  isNew: boolean;
  componentType: string;
}>();

const emit = defineEmits<{
  (e: 'save', value: ComponentConfig): void;
  (e: 'cancel'): void;
  (e: 'delete', value: ComponentConfig): void;
}>();

const editableComponent = ref<Partial<ComponentConfig> | null>(null);
const isAdvancedVisible = ref(false);

watch(() => props.component, (newComponent) => {
  editableComponent.value = newComponent ? JSON.parse(JSON.stringify(newComponent)) : null;
  // Biztosítjuk, hogy az attachmentPoints mindig egy tömb legyen, ha létezik
  if (editableComponent.value && editableComponent.value.attachmentPoints && !Array.isArray(editableComponent.value.attachmentPoints)) {
    editableComponent.value.attachmentPoints = [];
  }
  isAdvancedVisible.value = false;
}, { deep: true, immediate: true });

watch(() => editableComponent.value?.name, (newName) => {
  if (editableComponent.value && newName && !editableComponent.value.id && !editableComponent.value.model) {
    const diacritics = new RegExp('[\\u0300-\\u036f]', 'g');
    const normalizedName = newName.toLowerCase().normalize("NFD").replace(diacritics, "").replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
    const newId = `${props.componentType}_${normalizedName}`;
    const folderMap: Record<string, string> = { corpuses: 'corpus', fronts: 'front', handles: 'handle', legs: 'leg' };
    const modelFolder = folderMap[props.componentType] || props.componentType;
    editableComponent.value.id = newId;
    editableComponent.value.model = `/models/${modelFolder}/${newId}.glb`;
  }
}, { deep: true });

const fieldOrder: (keyof ComponentConfig)[] = ['name', 'id', 'model', 'price', 'materialTarget', 'height', 'materialSource', 'attachmentPoints'];
const advancedFields: (keyof ComponentConfig)[] = ['height', 'materialSource', 'attachmentPoints'];
const placeholders: Record<string, string> = {
  price: 'pl. 45000',
  materialTarget: 'pl. MAT_Korpusz',
  height: 'Lábaknál (0.1) = 10cm',
  materialSource: 'Ha örököl egy materialt (pl. corpus)',
};

const attachmentPointSuggestions = ref<string[]>([]);
onMounted(async () => {
  try {
    const response = await fetch('/database/components.json');
    const allComps: ComponentDatabase = await response.json();
    const points = new Set<string>();
    Object.values(allComps).flat().forEach(comp => {
      // JAVÍTOTT LOGIKA: Az új tömb struktúrán megyünk végig
      comp.attachmentPoints?.forEach(p => points.add(p.id));
    });
    attachmentPointSuggestions.value = Array.from(points).sort();
  } catch (error) { console.error(error); }
});

// --- ÚJ FÜGGVÉNYEK AZ ATTACHMENTPOINTS TÖMB KEZELÉSÉHEZ ---
function addAttachmentPoint() {
  if (!editableComponent.value) return;
  if (!editableComponent.value.attachmentPoints) {
    editableComponent.value.attachmentPoints = [];
  }
  editableComponent.value.attachmentPoints.push({ id: '', allowedComponentTypes: [] });
}

function removeAttachmentPoint(index: number) {
  editableComponent.value?.attachmentPoints?.splice(index, 1);
}

function saveChanges() {
  if (editableComponent.value) {
    emit('save', editableComponent.value as ComponentConfig);
  }
}

function deleteItem() {
  if (editableComponent.value && confirm(`Biztosan törlöd a(z) "${editableComponent.value.name}" komponenst?`)) {
    emit('delete', editableComponent.value as ComponentConfig);
  }
}
</script>

<template>
  <div class="admin-panel overflow-y-auto" v-if="editableComponent">
    <h3 class="text-xl font-bold mb-6">{{ isNew ? `Új Komponens (${componentType})` : `Szerkesztés: ${editableComponent.name}` }}</h3>
    <div class="space-y-4">
      <template v-for="key in fieldOrder" :key="key">
        <div v-if="!advancedFields.includes(key)">
          <label :for="key" class="admin-label">{{ key }}</label>
          <input type="text" :id="key" v-model="editableComponent[key]" :placeholder="placeholders[key] || `${key} értéke...`" class="admin-input" :disabled="key === 'id' && !isNew"/>
        </div>
      </template>

      <div class="pt-4">
        <button @click="isAdvancedVisible = !isAdvancedVisible" class="text-blue-400 hover:text-blue-300 text-sm mb-4">
          {{ isAdvancedVisible ? 'Haladó beállítások elrejtése' : 'Haladó beállítások megjelenítése' }}
        </button>
        <div v-if="isAdvancedVisible" class="space-y-4 border-l-2 border-blue-500/30 pl-4">
          <template v-for="key in advancedFields" :key="key">
            <div>
              <label :for="key" class="admin-label">{{ key }}</label>
              
              <div v-if="key === 'attachmentPoints'" class="space-y-2">
                <label class="admin-label">Csatlakozási Pontok (amit ez a komponens kínál)</label>
                <div v-for="(point, index) in editableComponent.attachmentPoints" :key="index" class="flex items-center gap-2 p-2 bg-gray-700 rounded">
                  <input type="text" v-model="point.id" placeholder="pont_neve (pl. attach_handle)" class="admin-input flex-grow">
                  <input type="text" v-model="point.allowedComponentTypes" placeholder="típus (pl. handles)" class="admin-input flex-grow">
                  <button @click="removeAttachmentPoint(index)" class="admin-button-danger text-xs p-1">X</button>
                </div>
                <button @click="addAttachmentPoint" class="admin-button-secondary w-full">+ Új csatlakozási pont</button>
              </div>
              
              <!-- A többi haladó mező (pl. height) -->
              <input v-else type="text" :id="key" v-model="editableComponent[key]" :placeholder="placeholders[key] || `${key} értéke...`" class="admin-input"/>
            </div>
          </template>
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
      <button v-if="!isNew" @click="deleteItem" class="admin-btn-danger">Törlés</button>
      <button @click="emit('cancel')" class="admin-btn-secondary">Mégse</button>
      <button @click="saveChanges" class="admin-btn">Változások Alkalmazása</button>
    </div>
  </div>
  <div class="admin-panel flex items-center justify-center text-gray-500" v-else>
    <p>Válassz ki egy komponenst a szerkesztéshez, vagy hozz létre egy újat.</p>
  </div>
</template>