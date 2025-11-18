<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { FurnitureConfig, ComponentConfig, ComponentDatabase } from '@/config/furniture';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue';
import AdminSidePanel from '@/components/admin/AdminSidePanel.vue';
import ComponentSidePanel from '@/components/admin/ComponentSidePanel.vue';

const activeTab = ref('furniture');

const configStore = useConfigStore();
const { furnitureList: allFurniture, components: allComponents } = storeToRefs(configStore);

onMounted(() => {
  configStore.loadAllData();
});

// --- BÚTOR ÁLLAPOTOK ---
const editingFurniture = ref<Partial<FurnitureConfig> | null>(null);
const isNewFurniture = ref(false);
const furnitureEditorRef = ref<{ scrollToSlot: (id: string) => void } | null>(null);
const furnitureEditorKey = ref<string | undefined>(undefined);

// --- KOMPONENS ÁLLAPOTOK ---
const selectedComponent = ref<Partial<ComponentConfig> | null>(null);
const isNewComponent = ref(false);
const selectedComponentType = ref('');
const componentPreviewConfig = ref<Partial<FurnitureConfig> | null>(null);

// Ez a watch a KOMPONENS preview-hoz kell, ez jó, marad.
watch(selectedComponent, (newComp) => {
  if (newComp?.id && newComp.model) {
    componentPreviewConfig.value = {
      id: 'component_preview',
      name: newComp.name || 'Preview',
      category: 'preview',
      componentSlots: [{
        slotId: 'preview_slot',
        name: 'Preview',
        componentType: 'preview',
        allowedComponents: [newComp.id],
        defaultComponent: newComp.id,
      }]
    };
  } else {
    componentPreviewConfig.value = null;
  }
}, { deep: true });

// --- EZ A HIÁNYZÓ RÉSZ: WATCH AZ AUTOMATIKUS BÚTOR ID GENERÁLÁSHOZ ---
watch(editingFurniture, (currentFurniture) => {
  if (isNewFurniture.value && currentFurniture) {
    const newId = (currentFurniture.name || '') // Biztosítjuk, hogy a name ne legyen undefined
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '');
    
    currentFurniture.id = newId;
  }
}, { deep: true });


// --- ADATBÁZIS MENTÉSE ---
async function saveDatabase(filename: 'furniture.json' | 'components.json', data: FurnitureConfig[] | ComponentDatabase) {
  try {
    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data }),
    });
    if (!response.ok) throw new Error(await response.text());
    alert(`${filename} sikeresen mentve!`);
  } catch (error) {
    console.error(error);
    alert(`Hiba a(z) ${filename} mentése közben.`);
  }
}

// --- BÚTOR KEZELŐ FÜGGVÉNYEK ---

function handleSelectFurniture(furniture: FurnitureConfig | null) {
  if (furniture) {
    editingFurniture.value = JSON.parse(JSON.stringify(furniture));
    isNewFurniture.value = false;
    furnitureEditorKey.value = furniture.id;
  } else {
    editingFurniture.value = null;
    isNewFurniture.value = false;
    furnitureEditorKey.value = undefined;
  }
}

function handleCreateNewFurniture() {
  const tempId = `new_${Date.now()}`; // Ezt a sort kell a helyére tenni
  editingFurniture.value = { id: tempId, name: 'Új bútor', category: 'bottom_cabinets', componentSlots: [] };
  isNewFurniture.value = true;
  furnitureEditorKey.value = tempId;
}

function handleCancelFurniture() {
  editingFurniture.value = null;
  isNewFurniture.value = false;
  furnitureEditorKey.value = undefined;
}

function handleDeleteFurniture() {
  if (!editingFurniture.value || !editingFurniture.value.id || isNewFurniture.value) {
    handleCancelFurniture();
    return;
  }
  if (confirm(`Biztosan törölni szeretnéd a(z) "${editingFurniture.value.name}" bútort?`)) {
    configStore.deleteFurniture(editingFurniture.value.id);
    saveDatabase('furniture.json', allFurniture.value);
    handleCancelFurniture();
  }
}

// AZ EGYETLEN, KÖZPONTI MENTÉS FUNKCIÓ (LETISZTÍTVA)
function handleSaveChanges() {
  if (!editingFurniture.value) return;

  // Ha a név üres, adunk neki egy alap ID-t, hogy ne legyen hiba.
  if (isNewFurniture.value && !editingFurniture.value.id) {
    editingFurniture.value.id = `furniture_${Date.now()}`;
  }

  if (isNewFurniture.value) {
    configStore.addFurniture(editingFurniture.value as FurnitureConfig);
  } else {
    configStore.updateFurniture(editingFurniture.value as FurnitureConfig);
  }

  saveDatabase('furniture.json', allFurniture.value);
  handleCancelFurniture();
}

function handleSlotClicked(slotId: string) {
  furnitureEditorRef.value?.scrollToSlot(slotId);
}

// --- KOMPONENS KEZELŐ FÜGGVÉNYEK (VÁLTOZATLANOK) ---
function handleSelectComponent(component: ComponentConfig, type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
}

function handleCreateNewComponent(type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = { name: '', id: '', model: '', price: undefined, materialTarget: '', height: undefined, materialSource: undefined, attachmentPoints: [] };
  isNewComponent.value = true;
}

function handleCancelComponent() {
  selectedComponent.value = null;
  isNewComponent.value = false;
}

function handleSaveComponent(component: ComponentConfig) {
  if (isNewComponent.value) {
    configStore.addComponent(selectedComponentType.value, component);
  } else {
    configStore.updateComponent(selectedComponentType.value, component);
  }
  handleCancelComponent();
}

function handleDeleteComponent(component: ComponentConfig) {
  const componentsList = allComponents.value[selectedComponentType.value];
  if (!componentsList) return;
  const index = componentsList.findIndex(c => c.id === component.id);
  if (index !== -1) {
    componentsList.splice(index, 1);
  }
  handleCancelComponent();
}

function handleSaveComponentsToServer() {
  saveDatabase('components.json', allComponents.value);
}
</script>

<template>
  <div class="bg-gray-800 text-white min-h-screen p-4 sm:p-8 font-sans flex flex-col">
    <div class="w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
       
      <div class="flex-shrink-0">
        <h1 class="text-3xl sm:text-4xl font-bold">Admin Felület</h1>
        <p class="text-sm text-gray-400 -mt-1 mb-4">Verzió 0.4</p>
        <div class="flex border-b border-gray-700">
          <button 
            @click="activeTab = 'furniture'" 
            :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
          >
            Bútor Szerkesztő
          </button>
          <button 
            @click="activeTab = 'components'" 
            :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
          >
            Komponens Szerkesztő
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 pt-8">
        <div class="grid grid-cols-12 gap-6 h-full">
          
          <!-- BAL OLDALI OSZLOP -->
          <div class="col-span-4 self-start sticky top-8">
            <AdminSidePanel 
              v-if="activeTab === 'furniture'"
              :furniture-list="allFurniture"
              :selected-furniture="editingFurniture"
              @update:selected-furniture="handleSelectFurniture"
              @create-new="handleCreateNewFurniture"
              @save-changes="handleSaveChanges"
              @slot-clicked="handleSlotClicked"
            />
            <ComponentSidePanel
              v-if="activeTab === 'components'"
              :key="selectedComponent ? selectedComponent.id : 'no-component-selected'"
              :component-database="allComponents"
              :selected-component="selectedComponent"
              :preview-config="componentPreviewConfig"
              @select-component="handleSelectComponent"
              @create-new="handleCreateNewComponent"
              @save-to-server="handleSaveComponentsToServer"
            />
          </div>

          <!-- JOBB OLDALI OSZLOP -->
          <div class="col-span-8">
            <div v-if="activeTab === 'furniture'">
              <FurnitureEditor 
                v-if="editingFurniture"
                :key="furnitureEditorKey"
                v-model:furniture="editingFurniture" 
                :is-new="isNewFurniture"
                @cancel="handleCancelFurniture"
                @delete="handleDeleteFurniture"
              />
              <div v-else class="text-center text-gray-500 p-8">
                <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
              </div>
            </div>

            <div v-if="activeTab === 'components'">
              <ComponentEditor
                v-if="selectedComponent"
                :key="selectedComponent.id || 'new-component'"
                :component="selectedComponent"
                :is-new="isNewComponent"
                :component-type="selectedComponentType"
                @save="handleSaveComponent"
                @cancel="handleCancelComponent"
                @delete="handleDeleteComponent"
              />
              <div v-else class="text-center text-gray-500 p-8">
                <p>Válassz ki egy komponenst a szerkesztéshez.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>