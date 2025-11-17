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
  if (Object.keys(allComponents.value).length === 0) {
    configStore.loadAllData();
  }
});

// --- BÚTOR ÁLLAPOTOK ---
const selectedFurniture = ref<Partial<FurnitureConfig> | null>(null);
const isNewFurniture = ref(false);
const furnitureEditorRef = ref<{ scrollToSlot: (id: string) => void } | null>(null);

// --- KOMPONENS ÁLLAPOTOK ---
const selectedComponent = ref<Partial<ComponentConfig> | null>(null);
const isNewComponent = ref(false);
const selectedComponentType = ref('');

// --- JAVÍTOTT PREVIEW LOGIKA ---
// A 'computed' helyett egy sima 'ref'-et használunk
const componentPreviewConfig = ref<Partial<FurnitureConfig> | null>(null);

// Egy 'watch' figyeli a 'selectedComponent' változását, és frissíti a previewConfig-et.
// Ez a megközelítés direktebb és megbízhatóbb a reaktivitás szempontjából.
watch(selectedComponent, (newComp) => {
  console.log('👀 PREVIEW WATCH: selectedComponent változott, preview frissítése...');
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
    console.log('   -> Új preview config beállítva.');
  } else {
    componentPreviewConfig.value = null;
    console.log('   -> Preview config nullázva.');
  }
}, { deep: true });
// --- JAVÍTOTT PREVIEW LOGIKA VÉGE ---

// --- ÚJ DETEKTÍV A BÚTOROKHOZ ---
watch(selectedFurniture, (newValue, oldValue) => {
  console.log('📥 LOG B: [AdminView] A "selectedFurniture" állapot megváltozott!');
  // A JSON.stringify itt nem kell, mert a konzol szépen kiírja az objektumot
  console.log('   Előző érték:', oldValue);
  console.log('   Új érték:', newValue);
}, { deep: true });
// --- ÚJ DETEKTÍV VÉGE ---

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
    selectedFurniture.value = JSON.parse(JSON.stringify(furniture));
    isNewFurniture.value = false;
  } else {
    selectedFurniture.value = null;
    isNewFurniture.value = false;
  }
}

function handleCreateNewFurniture() {
  selectedFurniture.value = { id: '', name: '', category: 'bottom_cabinets', componentSlots: [] };
  isNewFurniture.value = true;
}
function handleCancelFurniture() {
  selectedFurniture.value = null;
  isNewFurniture.value = false;
}

function handleSaveFurniture(furniture: FurnitureConfig) {
  if (isNewFurniture.value) {
    configStore.addFurniture(furniture);
  } else {
    configStore.updateFurniture(furniture);
  }
  handleCancelFurniture();
}

function handleSaveFurnitureToServer() {
  saveDatabase('furniture.json', allFurniture.value);
}
function handleSlotClicked(slotId: string) {
  furnitureEditorRef.value?.scrollToSlot(slotId);
}

// --- KOMPONENS KEZELŐ FÜGGVÉNYEK ---
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
        <p class="text-sm text-gray-400 -mt-1 mb-4">Verzió 0.1</p>
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
              :furniture-config="selectedFurniture"
              v-if="activeTab === 'furniture'"
              :furniture-list="allFurniture"
              :selected-furniture="selectedFurniture"
              @update:selected-furniture="handleSelectFurniture"
              @create-new="handleCreateNewFurniture"
              @save-to-server="handleSaveFurnitureToServer"
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
            <!-- JAVÍTÁS: A v-if visszakerült az activeTab-ra -->
            <div v-if="activeTab === 'furniture'">
              <FurnitureEditor 
                v-if="selectedFurniture"
                :key="selectedFurniture.id || 'new-furniture'"
                v-model:furniture="selectedFurniture"
                :is-new="isNewFurniture"
                @save="handleSaveFurniture"
                @cancel="handleCancelFurniture"
              />
              <!-- JAVÍTÁS: Hozzáadunk egy üzenetet, ha nincs kiválasztva bútor -->
              <div v-else class="text-center text-gray-500 p-8">
                <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
              </div>
            </div>

            <!-- JAVÍTÁS: A v-if visszakerült az activeTab-ra -->
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
              <!-- JAVÍTÁS: Hozzáadunk egy üzenetet, ha nincs kiválasztva komponens -->
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