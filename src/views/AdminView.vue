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
const originalFurniture = ref<Partial<FurnitureConfig> | null>(null); 
const furnitureEditorKey = ref<string | undefined>(undefined);

// --- KOMPONENS ÁLLAPOTOK ---
const selectedComponent = ref<Partial<ComponentConfig> | null>(null);
const isNewComponent = ref(false);
const selectedComponentType = ref('');
const componentPreviewConfig = ref<Partial<FurnitureConfig> | null>(null);

// Watch a KOMPONENS preview-hoz (változatlan)
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

// Watch az AUTOMATIKUS BÚTOR ID GENERÁLÁSHOZ (változatlan)
watch(editingFurniture, (currentFurniture) => {
  if (isNewFurniture.value && currentFurniture) {
    const newId = (currentFurniture.name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
    currentFurniture.id = newId;
  }
}, { deep: true });

// --- ÚJ: "UNSAVED CHANGES" DETEKTOR ---
const hasUnsavedChanges = computed(() => {
  if (!editingFurniture.value || !originalFurniture.value) return false;
  // Összehasonlítjuk az eredeti és a jelenlegi állapotot
  return JSON.stringify(editingFurniture.value) !== JSON.stringify(originalFurniture.value);
});

// --- ÚJ: NAVIGÁCIÓS MEGERŐSÍTŐ ---
function confirmAndProceed(action: () => void) {
  if (hasUnsavedChanges.value) {
    if (confirm('Vannak nem mentett változtatásaid. Biztosan el akarod dobni őket?')) {
      action();
    }
  } else {
    action();
  }
}

// --- ADATBÁZIS MENTÉSI FÜGGVÉNYEK (SZÉTVÁLASZTVA) ---

// 1. SIMA JSON MENTÉS (Bútorokhoz és a bal oldali komponens mentés gombhoz)
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

// 2. KOMPONENS MENTÉSE FÁJLLAL (JAVÍTVA: most már visszaadja a frissített komponenst)
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
    return result.updatedComponent; // Visszaadjuk a szerver által véglegesített adatot
  } catch (error) {
    console.error(error);
    alert(`Hiba a komponens mentése közben: ${error}`);
    return null; // Hiba esetén null-t adunk vissza
  }
}

// --- BÚTOR KEZELŐ FÜGGVÉNYEK (VÁLTOZATLAN) ---
function handleSelectFurniture(furniture: FurnitureConfig | null) {
  if (furniture) {
    const copy = JSON.parse(JSON.stringify(furniture));
    editingFurniture.value = copy;
    originalFurniture.value = JSON.parse(JSON.stringify(copy)); // Eredeti állapot mentése
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
    originalFurniture.value = JSON.parse(JSON.stringify(newFurniture)); // Eredeti állapot mentése
    isNewFurniture.value = true;
    furnitureEditorKey.value = tempId;
  });
}
function changeTab(tab: 'furniture' | 'components') {
  confirmAndProceed(() => {
    activeTab.value = tab;
    // Zárd be a szerkesztőket fülváltáskor
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
  // 1. Lépés: Store frissítése
  if (isNewFurniture.value) {
    configStore.addFurniture(furniture);
  } else {
    configStore.updateFurniture(furniture);
  }

  // 2. Lépés: Szerverre mentés
  saveDatabase('furniture.json', allFurniture.value);

  // 3. Lépés: Szerkesztési állapotok resetelése
  // A mentett állapot lesz az új "eredeti"
  originalFurniture.value = JSON.parse(JSON.stringify(furniture)); 
  // Bezárjuk a szerkesztőt
  handleCancelFurniture(); 
}

// --- KOMPONENS KEZELŐ FÜGGVÉNYEK (MÓDOSÍTVA) ---
function handleSelectComponent(component: ComponentConfig, type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
}
function handleCreateNewComponent(type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = { name: '', id: '' }; // Kevesebb alapértelmezett érték, a fájl úgyis felülírja
  isNewComponent.value = true;
}
function handleCancelComponent() {
  selectedComponent.value = null;
  isNewComponent.value = false;
}
// EZ A FÜGGVÉNY FOGADJA AZ ESEMÉNYT A COMPONENTEDITOR-BÓL
async function handleSaveComponent(component: ComponentConfig, file: File | null) {
  const savedComponent = await saveComponent(component, file);

  // Csak akkor frissítjük a store-t, ha a mentés sikeres volt
  if (savedComponent) {
    // EZ A HIÁNYZÓ LOGIKA:
    // Megnézzük, hogy új komponensről volt-e szó, és a megfelelő store action-t hívjuk.
    if (isNewComponent.value) {
      configStore.addComponent(selectedComponentType.value, savedComponent);
    } else {
      // A frissítés már a saveComponent-ben megtörtént a szerver válasza alapján,
      // de a biztonság kedvéért itt is meghívhatjuk.
      configStore.updateComponent(selectedComponentType.value, savedComponent);
    }
  }
  
  handleCancelComponent();
}

function handleDeleteComponent(component: ComponentConfig) {
  // 1. Lépés: Kérjünk megerősítést a felhasználótól
  if (confirm(`Biztosan törölni szeretnéd a(z) "${component.name}" komponenst?`)) {
    
    // 2. Lépés: Hívjuk meg a Pinia store megfelelő action-jét
    // Ez reaktívan frissíteni fogja a bal oldali listát.
    configStore.deleteComponent(selectedComponentType.value, component.id);
    
    // 3. Lépés: Mentsük el a frissített, teljes components.json-t a szerverre
    saveDatabase('components.json', allComponents.value);
    
    // 4. Lépés: Zárjuk be a szerkesztő nézetet
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
        <p class="text-sm text-gray-400 -mt-1 mb-4">Verzió 0.5</p>
        <div class="flex border-b border-gray-700">
          <button @click="changeTab('furniture')" :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Bútor Szerkesztő</button>
          <button @click="changeTab('components')" :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Komponens Szerkesztő</button>
        </div>
      </div>
      <div class="flex-1 min-h-0 pt-8">
        <div class="grid grid-cols-12 gap-6 h-full">
          <div class="col-span-4 self-start sticky top-8">
            <AdminSidePanel v-if="activeTab === 'furniture'" :furniture-list="allFurniture" :selected-furniture="editingFurniture" @update:selected-furniture="handleSelectFurniture" @create-new="handleCreateNewFurniture" @save-changes="handleSaveChanges" @slot-clicked="handleSlotClicked" />
            <ComponentSidePanel v-if="activeTab === 'components'" :key="selectedComponent ? selectedComponent.id : 'no-component-selected'" :component-database="allComponents" :selected-component="selectedComponent" :preview-config="componentPreviewConfig" @select-component="handleSelectComponent" @create-new="handleCreateNewComponent" @save-to-server="handleSaveComponentsToServer" />
          </div>
          <div class="col-span-8">
            <div v-if="activeTab === 'furniture'">
              <FurnitureEditor 
                v-if="editingFurniture"
                :key="furnitureEditorKey"
                v-model:furniture="editingFurniture" 
                :is-new="isNewFurniture"
                @cancel="handleCancelFurniture"
                @delete="handleDeleteFurniture"
                @save="handleSaveFurniture"
              />
              <div v-else class="text-center text-gray-500 p-8"><p>Válassz ki egy bútort a szerkesztéshez, vagy hozz létre egy újat.</p></div>
            </div>
            <div v-if="activeTab === 'components'">
              <ComponentEditor v-if="selectedComponent" :key="selectedComponent.id || 'new-component'" :component="selectedComponent" :is-new="isNewComponent" :component-type="selectedComponentType" @save="handleSaveComponent" @cancel="handleCancelComponent" @delete="handleDeleteComponent" />
              <div v-else class="text-center text-gray-500 p-8"><p>Válassz ki egy komponenst a szerkesztéshez.</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>