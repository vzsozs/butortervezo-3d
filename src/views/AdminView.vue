<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config'; // <-- ÚJ IMPORT
import type { FurnitureConfig, ComponentConfig, ComponentDatabase } from '@/config/furniture';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue';
import AdminSidePanel from '@/components/admin/AdminSidePanel.vue';
import ComponentSidePanel from '@/components/admin/ComponentSidePanel.vue';

const activeTab = ref('furniture');

// --- KÖZPONTI ADATTÁROLÓK ---
const configStore = useConfigStore(); // Store inicializálása
const { furnitureList: allFurniture, components: allComponents } = storeToRefs(configStore);
const adminSidePanelRef = ref<{ forcePreviewUpdate: () => void } | null>(null); // <-- ÚJ REF

// --- ÚJ "RESET GOMB" A PREVIEW-HOZ ---
const previewUpdateCounter = ref(0);

// Adatok betöltése a komponens indulásakor
onMounted(() => {
  if (Object.keys(allComponents.value).length === 0) {
    // A függvényeket közvetlenül a 'configStore' példányon hívjuk!
    configStore.loadAllData(); // A függvény neve loadAllData
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

// ... a componentPreviewConfig computed property változatlan ...
const componentPreviewConfig = computed<Partial<FurnitureConfig> | null>(() => {
  if (selectedComponent.value?.id && selectedComponent.value.model) {
    return {
      id: 'component_preview', name: selectedComponent.value.name || 'Preview', category: 'preview',
      componentSlots: [{
        slotId: 'preview_slot', name: 'Preview', componentType: 'preview',
        allowedComponents: [selectedComponent.value.id], defaultComponent: selectedComponent.value.id,
      }]
    };
  }
  return null;
});

function handlePreviewUpdateRequest(updatedFurniture: Partial<FurnitureConfig>) {
  console.log('%c[AdminView] 2. Frissítési kérés megérkezett a bútorral.', 'color: #00BFFF;', JSON.parse(JSON.stringify(updatedFurniture)));
  
  // FELÜLÍRJUK a központi állapotot a kapott friss adatokkal
  selectedFurniture.value = updatedFurniture;
  
  console.log('%c[AdminView] 3. Központi "selectedFurniture" frissítve. Számláló növelése...', 'color: #00BFFF;');
  previewUpdateCounter.value++;
}
// --- MENTÉSI LOGIKA ---
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
    // Ha null-t kapunk, akkor töröljük a kiválasztást.
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
  handleCancelFurniture(); // Ez marad
}

function handleSaveFurnitureToServer() {
  saveDatabase('furniture.json', allFurniture.value);
}
function handleSlotClicked(slotId: string) {
  furnitureEditorRef.value?.scrollToSlot(slotId);
}

// --- KOMPONENS KEZELŐ FÜGGVÉNYEK ---
function handleSelectComponent(component: ComponentConfig) {
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
}
function handleCreateNewComponent(type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = { name: '', id: '', model: '', price: undefined, materialTarget: '', height: undefined, materialSource: undefined, attachmentPoints: { self: '' } };
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
  // A komponensek mentése előtt "megtisztítjuk" az üres mezőktől
  // Ezt a logikát a régi ComponentEditor-ból átemelhetjük ide, ha szükséges.
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
              ref="adminSidePanelRef"
              v-if="activeTab === 'furniture'"
              :update-trigger="previewUpdateCounter"
              :furniture-list="allFurniture"
              :selected-furniture="selectedFurniture"
              @update:selected-furniture="handleSelectFurniture"
              @create-new="handleCreateNewFurniture"
              @save-to-server="handleSaveFurnitureToServer"
              @slot-clicked="handleSlotClicked"
            />
            <ComponentSidePanel
              v-if="activeTab === 'components'"
              :update-trigger="previewUpdateCounter"
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
            <FurnitureEditor 
              v-if="activeTab === 'furniture'"
              ref="furnitureEditorRef"
              :furniture="selectedFurniture"
              :is-new="isNewFurniture"
              @save="handleSaveFurniture"
              @cancel="handleCancelFurniture"
              @request-preview-update="handlePreviewUpdateRequest"
              @preview-updated="handlePreviewUpdateRequest"
            />
            <ComponentEditor
              v-if="activeTab === 'components'"
              :component="selectedComponent"
              :is-new="isNewComponent"
              :component-type="selectedComponentType"
              @save="handleSaveComponent"
              @cancel="handleCancelComponent"
              @delete="handleDeleteComponent"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>