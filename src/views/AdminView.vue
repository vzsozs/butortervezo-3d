<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '@/stores/config';
import { FurnitureCategory, type FurnitureConfig, type ComponentConfig, type ComponentDatabase } from '@/config/furniture';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue';
import AdminSidePanel from '@/components/admin/AdminSidePanel.vue';
import ComponentSidePanel from '@/components/admin/ComponentSidePanel.vue';
import AssetManager from '@/three/Managers/AssetManager';
import GlobalSettingsEditor from '@/components/admin/GlobalSettingsEditor.vue';
import MaterialEditor from '@/components/admin/MaterialEditor.vue';
import StyleManager from '@/components/admin/StyleManager.vue';
import ProceduralEditor from '@/components/admin/ProceduralEditor.vue';
import { useProceduralStore } from '@/stores/procedural';

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
const componentEditorKey = ref(0); // ÚJ: Stabil kulcs a szerkesztőhöz

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

// --- SEGÉDFÜGGVÉNY A KATEGÓRIA NÉV TISZTÍTÁSÁHOZ ---
function sanitizeCategoryName(name: string): string {
  return name
    .toLowerCase()                 // Kisbetűsítés
    .normalize('NFD')              // Ékezetek szétválasztása (pl. é -> e + ')
    .replace(/[\u0300-\u036f]/g, '') // Ékezetek eltávolítása
    .replace(/\s+/g, '_')          // Szóközök cseréje aláhúzásra
    .replace(/[^\w_]/g, '');       // Minden egyéb speciális karakter törlése
}


// --- JAVÍTÁS: STÍLUS MENTÉS ---
function handleSaveStyles() {
  // Stílusok mentése
  saveDatabase('styles.json', configStore.styles);
  // ÉS a komponensek mentése is (mert ott van a styleId bekötve!)
  saveDatabase('components.json', configStore.components);
}

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

function handleSaveProceduralSettings() {
  // A store-ból kiszedjük a nyers adatokat
  const proceduralStore = useProceduralStore();

  const dataToSave = {
    worktop: proceduralStore.worktop,
    plinth: proceduralStore.plinth
  };

  saveDatabase('procedural.json', dataToSave);
}

async function saveDatabase(
  filename: 'furniture.json' | 'components.json' | 'globalSettings.json' | 'styles.json' | 'procedural.json' | 'general.json',
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
  console.log("--- MENTÉS INDÍTÁSA ---");
  console.log("1. Kapott fájl:", file ? file.name : "NINCS FÁJL (NULL)");

  const payload = { ...component };

  // Blob tisztítás
  if (payload.model && payload.model.startsWith('blob:')) {
    console.log("2. Blob URL törlése a JSON-ból...");
    (payload as any).model = null;
  }

  const formData = new FormData();
  formData.append('componentData', JSON.stringify(payload));
  formData.append('componentType', selectedComponentType.value);

  if (file) {
    console.log("3. Fájl csatolása a kéréshez...");
    formData.append('modelFile', file);
  } else {
    console.warn("3. FIGYELEM: Nem csatolunk fájlt a kéréshez!");
  }

  try {
    console.log("4. Küldés a szervernek (/api/save-component)...");
    const response = await fetch('/api/save-component', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Szerver hiba');
    }

    const result = await response.json();
    console.log("5. Szerver válasza:", result);

    alert(`Komponens sikeresen mentve!`);

    if (result.updatedComponent?.model) {
      const assetManager = AssetManager.getInstance();
      assetManager.invalidateModelCache(result.updatedComponent.model);
    }

    return result.updatedComponent;

  } catch (error) {
    console.error("KRITIKUS HIBA MENTÉSKOR:", error);
    alert(`Hiba: ${error}`);
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

function handleCreateNewFurniture(categoryInput?: string | any) {
  let category: any = FurnitureCategory.BOTTOM_CABINET;
  let displayCategoryName = FurnitureCategory.BOTTOM_CABINET; // Ezt használjuk a bútor nevében (szép név)

  if (typeof categoryInput === 'string' && categoryInput) {
    displayCategoryName = categoryInput; // Pl: "Felső Polcok"
    category = sanitizeCategoryName(categoryInput); // Pl: "felso_polcok"
  }

  confirmAndProceed(() => {
    const tempId = `new_${Date.now()}`;
    const newFurniture = {
      id: tempId,
      // A névben maradhat az eredeti, olvasható formátum, hogy tudd mit hoztál létre
      name: category === FurnitureCategory.BOTTOM_CABINET ? 'Új bútor' : `Új ${displayCategoryName} elem`,
      category: category, // Az adatbázisba a tisztított technikai név kerül
      componentSlots: []
    };
    editingFurniture.value = newFurniture;
    originalFurniture.value = JSON.parse(JSON.stringify(newFurniture));
    isNewFurniture.value = true;
    furnitureEditorKey.value = tempId;
  });
}

function changeTab(tab: 'furniture' | 'components' | 'global' | 'styles' | 'materials' | 'procedural') {
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
  componentEditorKey.value++; // ÚJ: Kényszerítjük az újramountolást váltáskor
}
function handleCreateNewComponent(type: string) {
  selectedComponentType.value = type;
  selectedComponent.value = { name: '', id: '' };
  isNewComponent.value = true;
  componentEditorKey.value++; // ÚJ: Kényszerítjük az újramountolást létrehozáskor
}
function handleCancelComponent() {
  // Ha új komponenst hoztunk létre, és az bekerült a listába (mert volt preview),
  // de nem mentettük el, akkor ki kell venni a listából.
  if (isNewComponent.value && selectedComponent.value?.id) {
    const type = selectedComponentType.value;
    const list = allComponents.value[type];

    if (list) {
      // Megkeressük és töröljük
      const index = list.findIndex(c => c.id === selectedComponent.value!.id);
      if (index !== -1) {
        list.splice(index, 1); // KIVESSZÜK A LISTÁBÓL
        console.log('🧹 Takarítás: Nem mentett preview komponens eltávolítva.');
      }
    }
  }

  selectedComponent.value = null;
  isNewComponent.value = false;
}

// --- ÚJ: PREVIEW KEZELÉS ---
function handleComponentPreview(file: File, data: Partial<ComponentConfig>) {
  if (!selectedComponent.value) return;

  const blobUrl = URL.createObjectURL(file);

  // FRISSÍTÉS: Összefésüljük a meglévő adatokat a ModelAnalyzer által küldött adatokkal
  selectedComponent.value = {
    ...selectedComponent.value,
    ...data,       // Név, méretek, csatlakozási pontok
    model: blobUrl // A blob URL
  };

  // ID generálás (ha még nincs)
  if (!selectedComponent.value.id) {
    const tempId = selectedComponent.value.name
      ? selectedComponent.value.name.toLowerCase().replace(/\s+/g, '_')
      : `temp_${Date.now()}`;
    selectedComponent.value.id = tempId;
  }

  // Store injektálás (ez marad, mert kell a 3D-nek)
  const type = selectedComponentType.value;
  if (!allComponents.value[type]) allComponents.value[type] = [];

  const list = allComponents.value[type];
  const index = list.findIndex(c => c.id === selectedComponent.value!.id);

  const compConfig = JSON.parse(JSON.stringify(selectedComponent.value)) as ComponentConfig;

  if (index !== -1) {
    list[index] = compConfig;
  } else {
    list.push(compConfig);
  }
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
            :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Bútorszerkesztő</button>
          <button @click="changeTab('components')"
            :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Komponensszerkesztő</button>
          <button @click="changeTab('styles')"
            :class="['px-4 py-2 font-semibold', activeTab === 'styles' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Stílus
            manager</button>
          <button @click="changeTab('materials')"
            :class="['px-4 py-2 font-semibold', activeTab === 'materials' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Anyag
            szerkesztő</button>
          <button @click="changeTab('global')"
            :class="['px-4 py-2 font-semibold', activeTab === 'global' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']">Általános
            beállítások</button>
        </div>
      </div>

      <div class="flex-1 min-h-0 pt-8">
        <!-- 1. ESET: GLOBÁLIS BEÁLLÍTÁSOK -->
        <div v-if="activeTab === 'global'" class="h-full p-4">
          <GlobalSettingsEditor @save-groups="handleSaveGlobalSettings"
            @save-procedural="handleSaveProceduralSettings" />
        </div>

        <!-- 2. ESET: ANYAG SZERKESZTŐ -->
        <div v-else-if="activeTab === 'materials'" class="h-full p-4">
          <MaterialEditor />
        </div>

        <!-- 4. ESET: Stílus SZERKESZTŐ -->
        <div v-else-if="activeTab === 'styles'" class="h-full p-4">
          <StyleManager @save-changes="handleSaveStyles" />
        </div>

        <!-- 5. ESET: PROCEDURÁLIS SZERKESZTŐ -->
        <div v-else-if="activeTab === 'procedural'" class="h-full p-4">
          <ProceduralEditor @save="handleSaveProceduralSettings" />
        </div>

        <!-- 3. ESET: RÉGI NÉZET (Bútor vagy Komponens) -->
        <div v-else class="grid grid-cols-12 gap-6 h-full">

          <!-- Bal oldali sáv (SidePanel) -->
          <div class="col-span-4 self-start sticky top-8">
            <AdminSidePanel v-if="activeTab === 'furniture'" ref="adminSidePanelRef" :furniture-list="allFurniture"
              :selected-furniture="editingFurniture" @update:selected-furniture="handleSelectFurniture"
              @create-new="handleCreateNewFurniture" @create-category="handleCreateNewFurniture"
              @save-changes="handleSaveChanges" @slot-clicked="handleSlotClicked"
              @attachment-clicked="handleAttachmentClicked" />
            <ComponentSidePanel v-if="activeTab === 'components'" :component-database="allComponents"
              :selected-component="selectedComponent" :preview-config="componentPreviewConfig"
              @select-component="handleSelectComponent" @create-new="handleCreateNewComponent"
              @save-to-server="handleSaveComponentsToServer" @create-category="handleCreateCategory" />
          </div>

          <!-- Jobb oldali sáv (Editor) -->
          <div class="col-span-8">

            <!-- Bútorszerkesztő -->
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

            <!-- Komponensszerkesztő -->
            <div v-if="activeTab === 'components'">
              <ComponentEditor v-if="selectedComponent" :key="componentEditorKey" :component="selectedComponent"
                :is-new="isNewComponent" :component-type="selectedComponentType" @save="handleSaveComponent"
                @cancel="handleCancelComponent" @delete="handleDeleteComponent" @preview="handleComponentPreview" />
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
