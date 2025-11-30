<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import type { FurnitureConfig, ComponentConfig, ComponentDatabase } from '@/config/furniture';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue';
import AdminSidePanel from '@/components/admin/AdminSidePanel.vue';
import ComponentSidePanel from '@/components/admin/ComponentSidePanel.vue';
import AssetManager from '@/three/Managers/AssetManager';
import GlobalSettingsEditor from '@/components/admin/GlobalSettingsEditor.vue';
import MaterialEditor from '@/components/admin/MaterialEditor.vue';

const activeTab = ref('furniture');
const appVersion = __APP_VERSION__;

const configStore = useConfigStore();
const { furnitureList: allFurniture, components: allComponents } = storeToRefs(configStore);

onMounted(() => {
  configStore.loadAllData();
});

// --- BÚTOR ÁLLAPOTOK ---
const editingFurniture = ref<FurnitureConfig | null>(null);
const isNewFurniture = ref(false);
const furnitureEditorRef = ref<{
  scrollToSlot: (id: string) => void;
  handleAttachmentClick: (pointId: string) => void;
} | null>(null);

// JAVÍTÁS: Kiegészítettük a típust a setXRayMode-dal
const adminSidePanelRef = ref<{
  toggleAttachmentMarkers: (visible: boolean, activePoints: string[]) => void;
  setXRayMode: (enabled: boolean) => void;
} | null>(null);

const originalFurniture = ref<Partial<FurnitureConfig> | null>(null);
const furnitureEditorKey = ref<string | undefined>(undefined);

// --- KOMPONENS ÁLLAPOTOK ---
const selectedComponent = ref<Partial<ComponentConfig> | null>(null);
const isNewComponent = ref(false);
const selectedComponentType = ref('');
const componentPreviewConfig = ref<Partial<FurnitureConfig> | null>(null);

// Watch a KOMPONENS preview-hoz
watch(selectedComponent, (newComp) => {
  if (newComp?.id && newComp.model && !newComp.model.startsWith('path/to')) {
    componentPreviewConfig.value = {
      id: 'component_preview', name: newComp.name || 'Preview', category: 'preview',
      componentSlots: [{ slotId: 'preview_slot', name: 'Preview', componentType: 'preview', allowedComponents: [newComp.id], defaultComponent: newComp.id }]
    };
  } else {
    componentPreviewConfig.value = null;
  }
}, { deep: true });

// Watch az AUTOMATIKUS BÚTOR ID GENERÁLÁSHOZ
watch(editingFurniture, (currentFurniture) => {
  if (isNewFurniture.value && currentFurniture) {
    const newId = (currentFurniture.name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
    currentFurniture.id = newId;
  }
}, { deep: true });

// --- "UNSAVED CHANGES" DETEKTOR ---
const hasUnsavedChanges = computed(() => {
  if (!editingFurniture.value || !originalFurniture.value) return false;
  return JSON.stringify(editingFurniture.value) !== JSON.stringify(originalFurniture.value);
});

function handleSaveGlobalSettings() {
  // Ellenőrizzük, hogy létezik-e az adat
  if (!configStore.globalGroups) {
    console.error("Hiba: Nincs menthető globális beállítás (globalGroups is undefined)");
    return;
  }
  saveDatabase('globalSettings.json', configStore.globalGroups);
}

// --- NAVIGÁCIÓS MEGERŐSÍTŐ ---
function confirmAndProceed(action: () => void) {
  if (hasUnsavedChanges.value) {
    if (confirm('Vannak nem mentett változtatásaid. Biztosan el akarod dobni őket?')) {
      action();
    }
  } else {
    action();
  }
}

// --- ADATBÁZIS MENTÉSI FÜGGVÉNYEK ---

async function saveDatabase(
  filename: 'furniture.json' | 'components.json' | 'globalSettings.json',
  data: FurnitureConfig[] | ComponentDatabase | any
) {
  try {
    // JAVÍTÁS: Proxy mentesítés a biztonság kedvéért
    const cleanData = JSON.parse(JSON.stringify(data));

    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: cleanData }),
    });
    if (!response.ok) throw new Error(await response.text());
    alert(`${filename} sikeresen mentve!`);
  } catch (error) {
    console.error(error);
    alert(`Hiba a(z) ${filename} mentése közben.`);
  }
}

async function saveComponent(component: ComponentConfig, file: File | null): Promise<ComponentConfig | null> {
  const formData = new FormData();
  formData.append('componentData', JSON.stringify(component));
  formData.append('componentType', selectedComponentType.value);
  if (file) {
    formData.append('modelFile', file);
  }

  try {
    const response = await fetch('/api/save-component', { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Ismeretlen hiba');

    alert(`Komponens sikeresen mentve!`);
    if (file) {
      const assetManager = AssetManager.getInstance();
      assetManager.invalidateModelCache(result.updatedComponent.model);
    }
    return result.updatedComponent;
  } catch (error) {
    console.error(error);
    alert(`Hiba a komponens mentése közben: ${error}`);
    return null;
  }
}

async function handleCreateCategory(categoryName: string) {
  if (allComponents.value && !allComponents.value[categoryName]) {
    allComponents.value[categoryName] = [];
    console.log(`Új kategória létrehozva a store-ban: ${categoryName}`);
    try {
      await saveDatabase('components.json', allComponents.value);
      console.log(`A(z) ${categoryName} kategóriával frissített components.json sikeresen mentve.`);
    } catch (error) {
      console.error('Hiba az új kategória mentésekor:', error);
      delete allComponents.value[categoryName];
    }
  }
}

// JAVÍTOTT X-RAY KEZELÉS
function handleToggleXRay(enabled: boolean) {
  console.log('📡 AdminView FOGADTA:', enabled); // <--- EZT FIGYELD

  if (adminSidePanelRef.value) {
    console.log('   ➡️ Továbbítás a SidePanelnek...');
    // Ellenőrizzük, hogy létezik-e a függvény
    if (typeof adminSidePanelRef.value.setXRayMode === 'function') {
      adminSidePanelRef.value.setXRayMode(enabled);
    } else {
      console.error('❌ HIBA: A SidePanelnek nincs setXRayMode függvénye!');
    }
  } else {
    console.error('❌ HIBA: adminSidePanelRef értéke null!');
  }
}

// --- BÚTOR KEZELŐ FÜGGVÉNYEK ---
function handleSelectFurniture(furniture: FurnitureConfig | null) {
  if (furniture) {
    const copy = JSON.parse(JSON.stringify(furniture));
    editingFurniture.value = copy;
    originalFurniture.value = JSON.parse(JSON.stringify(copy));
    isNewFurniture.value = false;
    furnitureEditorKey.value = furniture.id;
  } else {
    editingFurniture.value = null;
    isNewFurniture.value = false;
    furnitureEditorKey.value = undefined;
  }
}
function handleCreateNewFurniture() {
  confirmAndProceed(() => {
    const tempId = `new_${Date.now()}`;
    const newFurniture = { id: tempId, name: 'Új bútor', category: 'bottom_cabinets', componentSlots: [] };
    editingFurniture.value = newFurniture;
    originalFurniture.value = JSON.parse(JSON.stringify(newFurniture));
    isNewFurniture.value = true;
    furnitureEditorKey.value = tempId;
  });
}
function changeTab(tab: 'furniture' | 'components' | 'global' | 'materials') {
  confirmAndProceed(() => {
    activeTab.value = tab;
    handleCancelFurniture();
    handleCancelComponent();
  });
}
function handleCancelFurniture() {
  editingFurniture.value = null;
  isNewFurniture.value = false;
  furnitureEditorKey.value = undefined;
}
function handleDeleteFurniture() {
  if (!editingFurniture.value?.id || isNewFurniture.value) { handleCancelFurniture(); return; }
  if (confirm(`Biztosan törlöd a(z) "${editingFurniture.value.name}" bútort?`)) {
    configStore.deleteFurniture(editingFurniture.value.id);
    saveDatabase('furniture.json', allFurniture.value);
    handleCancelFurniture();
  }
}
function handleSaveChanges() {
  if (!editingFurniture.value) return;
  if (isNewFurniture.value && !editingFurniture.value.id) { editingFurniture.value.id = `furniture_${Date.now()}`; }
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

function handleSaveFurniture(furniture: FurnitureConfig) {
  if (isNewFurniture.value) {
    configStore.addFurniture(furniture);
  } else {
    configStore.updateFurniture(furniture);
  }
  saveDatabase('furniture.json', allFurniture.value);
  originalFurniture.value = JSON.parse(JSON.stringify(furniture));
  handleCancelFurniture();
}

function handleToggleMarkers(visible: boolean, activePoints: string[]) {
  adminSidePanelRef.value?.toggleAttachmentMarkers(visible, activePoints);
}

function handleAttachmentClicked(pointId: string) {
  furnitureEditorRef.value?.handleAttachmentClick(pointId);
}

// --- KOMPONENS KEZELŐ FÜGGVÉNYEK ---
function handleSelectComponent(component: ComponentConfig, type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
}
function handleCreateNewComponent(type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = { name: '', id: '' };
  isNewComponent.value = true;
}
function handleCancelComponent() {
  selectedComponent.value = null;
  isNewComponent.value = false;
}

async function handleSaveComponent(component: ComponentConfig, file: File | null) {
  const savedComponent = await saveComponent(component, file);
  if (savedComponent) {
    if (isNewComponent.value) {
      configStore.addComponent(selectedComponentType.value, savedComponent);
    } else {
      configStore.updateComponent(selectedComponentType.value, savedComponent);
    }
  }
  handleCancelComponent();
}

function handleDeleteComponent(component: ComponentConfig) {
  if (confirm(`Biztosan törölni szeretnéd a(z) "${component.name}" komponenst?`)) {
    configStore.deleteComponent(selectedComponentType.value, component.id);
    saveDatabase('components.json', allComponents.value);
    handleCancelComponent();
  }
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
        <p class="text-xs text-blue-400 mb-4">{{ appVersion }}</p>
        <div class="flex border-b border-gray-700">
          <button @click="changeTab('furniture')"
            :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Bútor
            Szerkesztő</button>
          <button @click="changeTab('components')"
            :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Komponens
            Szerkesztő</button>
          <button @click="changeTab('global')"
            :class="['px-4 py-2 font-semibold', activeTab === 'global' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Globális
            Beállítások</button>
          <button @click="changeTab('materials')"
            :class="['px-4 py-2 font-semibold', activeTab === 'materials' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Anyag
            Szerkesztő</button>
        </div>
      </div>
      <div class="flex-1 min-h-0 pt-8">
        <!-- 1. ESET: GLOBÁLIS BEÁLLÍTÁSOK -->
        <div v-if="activeTab === 'global'" class="h-full p-4">
          <GlobalSettingsEditor @save-to-server="handleSaveGlobalSettings" />
        </div>

        <!-- 2. ESET: ANYAG SZERKESZTŐ -->
        <div v-else-if="activeTab === 'materials'" class="h-full p-4">
          <MaterialEditor />
        </div>

        <!-- 3. ESET: RÉGI NÉZET (Bútor vagy Komponens) -->
        <div v-else class="grid grid-cols-12 gap-6 h-full">

          <!-- Bal oldali sáv (SidePanel) -->
          <div class="col-span-4 self-start sticky top-8">
            <AdminSidePanel v-if="activeTab === 'furniture'" ref="adminSidePanelRef" :furniture-list="allFurniture"
              :selected-furniture="editingFurniture" @update:selected-furniture="handleSelectFurniture"
              @create-new="handleCreateNewFurniture" @save-changes="handleSaveChanges" @slot-clicked="handleSlotClicked"
              @attachment-clicked="handleAttachmentClicked" />
            <ComponentSidePanel v-if="activeTab === 'components'" :component-database="allComponents"
              :selected-component="selectedComponent" :preview-config="componentPreviewConfig"
              @select-component="handleSelectComponent" @create-new="handleCreateNewComponent"
              @save-to-server="handleSaveComponentsToServer" @create-category="handleCreateCategory" />
          </div>

          <!-- Jobb oldali sáv (Editor) -->
          <div class="col-span-8">

            <!-- Bútor Szerkesztő -->
            <div v-if="activeTab === 'furniture'">
              <!-- JAVÍTÁS: Bekötöttük a @toggle-xray eseményt -->
              <FurnitureEditor v-if="editingFurniture" ref="furnitureEditorRef" :key="furnitureEditorKey"
                v-model:furniture="editingFurniture" :is-new="isNewFurniture" @cancel="handleCancelFurniture"
                @delete="handleDeleteFurniture" @save="handleSaveFurniture" @toggle-markers="handleToggleMarkers"
                @toggle-xray="handleToggleXRay" />
              <div v-else class="text-center text-gray-500 p-8">
                <p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p>
              </div>
            </div>

            <!-- Komponens Szerkesztő -->
            <div v-if="activeTab === 'components'">
              <ComponentEditor v-if="selectedComponent" :key="selectedComponent.id || 'new-component'"
                :component="selectedComponent" :is-new="isNewComponent" :component-type="selectedComponentType"
                @save="handleSaveComponent" @cancel="handleCancelComponent" @delete="handleDeleteComponent" />
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
