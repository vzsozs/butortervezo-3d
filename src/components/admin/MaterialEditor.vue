<!-- src/components/admin/MaterialEditor.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useConfigStore } from '@/stores/config';
import type { MaterialConfig } from '@/config/furniture';

const configStore = useConfigStore();

// --- ÁLLAPOTOK ---
const selectedMaterial = ref<MaterialConfig | null>(null);
const isNewMaterial = ref(false);
const searchQuery = ref('');
const showTips = ref(false);

// Külön ref a bal oldali kategória létrehozáshoz
const sidebarNewCategoryName = ref('');

// --- COMPUTED ---
const filteredMaterials = computed(() => {
  let result = configStore.materials;
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      (Array.isArray(m.category) ? m.category.some(c => c.toLowerCase().includes(query)) : m.category.toLowerCase().includes(query))
    );
  }
  return result;
});

const groupedMaterials = computed(() => {
  const groups: Record<string, MaterialConfig[]> = {};
  filteredMaterials.value.forEach(m => {
    const categories = Array.isArray(m.category) ? m.category : [m.category];
    categories.forEach(cat => {
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat]!.push(m);
    });
  });
  return groups;
});

// --- MŰVELETEK ---
function handleSelect(material: MaterialConfig) {
  // Deep copy egy lokális változóba
  const tempMaterial = JSON.parse(JSON.stringify(material));

  // Ha régi anyag és nincsenek meg az új propertyk, pótoljuk őket alapértékkel
  // Először biztosítjuk, hogy a properties objektum létezzen
  if (!tempMaterial.properties) {
    tempMaterial.properties = {};
  }

  // Most már biztonságosan írhatunk bele
  if (tempMaterial.properties.transmission === undefined) tempMaterial.properties.transmission = 0;
  if (tempMaterial.properties.opacity === undefined) tempMaterial.properties.opacity = 1;
  if (tempMaterial.properties.transparent === undefined) tempMaterial.properties.transparent = false;

  // Végül átadjuk a reaktív változónak
  selectedMaterial.value = tempMaterial;
  isNewMaterial.value = false;
}

function handleCreateNew() {
  selectedMaterial.value = {
    id: `mat_${Date.now()}`,
    name: 'Új Anyag',
    category: 'general',
    type: 'color',
    value: '#ffffff',
    // Itt már alapból felvesszük az üveghez szükséges tulajdonságokat is
    properties: {
      roughness: 0.5,
      metalness: 0,
      transmission: 0, // Üveghatás (0-1)
      opacity: 1,      // Átlátszóság (0-1)
      transparent: false
    }
  };
  isNewMaterial.value = true;
}

function handleSave() {
  if (!selectedMaterial.value) return;

  if (isNewMaterial.value) {
    configStore.addMaterial(selectedMaterial.value);
  } else {
    configStore.updateMaterial(selectedMaterial.value);
  }
  saveMaterialsToServer();
  selectedMaterial.value = null;
  isNewMaterial.value = false;
}

function handleDelete() {
  if (!selectedMaterial.value) return;
  if (confirm(`Biztosan törlöd a(z) "${selectedMaterial.value.name}" anyagot?`)) {
    configStore.deleteMaterial(selectedMaterial.value.id);
    saveMaterialsToServer();
    selectedMaterial.value = null;
    isNewMaterial.value = false;
  }
}

async function saveMaterialsToServer() {
  try {
    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'materials.json', data: configStore.materials }),
    });
    if (!response.ok) throw new Error(await response.text());
    // Opcionális: toast üzenet
  } catch (error) {
    console.error(error);
    alert('Hiba a mentés során.');
  }
}

// --- TEXTÚRA FELTÖLTÉS ---
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);

function triggerFileInput() { fileInput.value?.click(); }

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) uploadTexture(target.files[0]);
}

function handleDrop(event: DragEvent) {
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) uploadTexture(event.dataTransfer.files[0]);
}

async function uploadTexture(file: File) {
  if (!selectedMaterial.value) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (selectedMaterial.value && e.target?.result) {
      selectedMaterial.value.value = e.target.result as string;
      selectedMaterial.value.type = 'texture';
    }
  };
  reader.readAsDataURL(file);

  isUploading.value = true;
  const formData = new FormData();
  formData.append('textureFile', file);

  try {
    const response = await fetch('/api/upload-texture', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Feltöltési hiba');
    const result = await response.json();
    if (selectedMaterial.value) selectedMaterial.value.value = result.url;
  } catch (error) {
    console.error(error);
    alert('Hiba a kép feltöltésekor.');
  } finally {
    isUploading.value = false;
  }
}

// --- KATEGÓRIA KEZELÉS ---
const availableCategories = ref<string[]>(['Bútorlap', 'Munkapult', 'Fém']);
const selectedCategories = ref<string[]>([]);
const newCategoryName = ref('');

// Szinkronizálás a selectedMaterial-al
watch(selectedMaterial, (newVal) => {
  if (newVal) {
    if (Array.isArray(newVal.category)) {
      selectedCategories.value = [...newVal.category];
    } else {
      selectedCategories.value = [newVal.category];
    }
  } else {
    selectedCategories.value = [];
  }
}, { immediate: true });

watch(selectedCategories, (newVal) => {
  if (selectedMaterial.value) {
    selectedMaterial.value.category = newVal;
  }
});

// Kategória hozzáadása a jobb oldali panelen (checkbox lista alján)
function addCategoryRight() {
  if (newCategoryName.value && !availableCategories.value.includes(newCategoryName.value)) {
    availableCategories.value.push(newCategoryName.value);
    selectedCategories.value.push(newCategoryName.value);
    newCategoryName.value = '';
  }
}

// Kategória hozzáadása a bal oldali panelen (Sidebar)
function createCategorySidebar() {
  if (sidebarNewCategoryName.value && !availableCategories.value.includes(sidebarNewCategoryName.value)) {
    availableCategories.value.push(sidebarNewCategoryName.value);
    // Opcionális: ha épp szerkesztesz egy anyagot, hozzá is adhatjuk
    if (selectedMaterial.value) {
      selectedCategories.value.push(sidebarNewCategoryName.value);
    }
    sidebarNewCategoryName.value = '';
  } else if (availableCategories.value.includes(sidebarNewCategoryName.value)) {
    alert('Ez a kategória már létezik!');
  }
}

// Frissítsük az elérhető kategóriákat a betöltött anyagok alapján is
watch(() => configStore.materials, (materials) => {
  const cats = new Set(availableCategories.value);
  materials.forEach(m => {
    const mCats = Array.isArray(m.category) ? m.category : [m.category];
    mCats.forEach(c => cats.add(c));
  });
  availableCategories.value = Array.from(cats);
}, { immediate: true, deep: true });

function handleCancel() {
  selectedMaterial.value = null;
  isNewMaterial.value = false;
}
</script>

<template>
  <div class="grid grid-cols-12 gap-6 h-full">
    <!-- BAL OLDAL: LISTA -->
    <div class="col-span-4 bg-gray-900 rounded-lg p-4 flex flex-col h-full border border-gray-700">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-white">Anyagok</h2>
        <button @click="handleCreateNew" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm">
          + Új
        </button>
      </div>

      <input v-model="searchQuery" type="text" placeholder="Keresés..."
        class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:border-blue-500" />

      <!-- Lista konténer (flex-1, hogy kitöltse a helyet) -->
      <div class="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4">
        <div v-for="(materials, category) in groupedMaterials" :key="category">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 sticky top-0 bg-gray-900 py-1 z-10">
            {{ category }}
          </h3>
          <div class="space-y-1">
            <div v-for="mat in materials" :key="mat.id" @click="handleSelect(mat)"
              class="flex items-center p-2 rounded cursor-pointer border border-transparent hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800 border-blue-500': selectedMaterial?.id === mat.id }">
              <!-- Előnézet -->
              <div class="w-8 h-8 rounded mr-3 border border-gray-600 flex-shrink-0 overflow-hidden relative">
                <div v-if="mat.type === 'color'" :style="{ backgroundColor: mat.value }" class="w-full h-full"></div>
                <img v-else :src="mat.value" class="w-full h-full object-cover" />
              </div>

              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-200 truncate">{{ mat.name }}</div>
                <div class="text-xs text-gray-500 truncate">{{ mat.id }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ÚJ KATEGÓRIA LÉTREHOZÁSA (Sidebar alja) -->
      <div class="pt-4 border-t border-gray-700 mt-auto">
        <h3 class="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Új Kategória</h3>
        <form @submit.prevent="createCategorySidebar" class="flex gap-2">
          <input type="text" v-model="sidebarNewCategoryName" placeholder="pl. Üveg"
            class="admin-input flex-grow text-sm w-full" />
          <button type="submit"
            class="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded text-sm transition-colors">
            +
          </button>
        </form>
      </div>
    </div>

    <!-- JOBB OLDAL: SZERKESZTŐ -->
    <div class="col-span-8 bg-gray-900 rounded-lg p-6 border border-gray-700 h-full overflow-y-auto custom-scrollbar">
      <div v-if="selectedMaterial" class="max-w-2xl mx-auto">
        <h2 class="text-xl font-bold text-white mb-6">
          {{ isNewMaterial ? 'Új Anyag Létrehozása' : 'Anyag Szerkesztése' }}
        </h2>

        <div class="space-y-6">
          <!-- Alapadatok -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">Név</label>
              <input v-model="selectedMaterial.name" type="text" class="admin-input w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">ID (Egyedi)</label>
              <input v-model="selectedMaterial.id" type="text"
                class="admin-input w-full font-mono disabled:opacity-50 disabled:cursor-not-allowed text-gray-500"
                disabled />
            </div>
          </div>

          <!-- Kategóriák választó -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-2">Kategóriák</label>
            <div class="bg-gray-800 border border-gray-700 rounded p-3 max-h-32 overflow-y-auto custom-scrollbar">
              <div v-for="cat in availableCategories" :key="cat" class="flex items-center mb-2 last:mb-0">
                <input type="checkbox" :value="cat" v-model="selectedCategories" class="checkbox-styled" />
                <label class="ml-2 text-sm text-gray-300">{{ cat }}</label>
              </div>
              <!-- Új kategória (inline) -->
              <div class="flex items-center mt-2 pt-2 border-t border-gray-700">
                <input v-model="newCategoryName" type="text" placeholder="+ Új kategória"
                  class="bg-transparent border-none text-xs text-white placeholder-gray-500 focus:ring-0 w-full"
                  @keydown.enter.prevent="addCategoryRight" />
              </div>
            </div>
          </div>

          <!-- Típus és Érték -->
          <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <label class="block text-xs font-medium text-gray-400 mb-3">Megjelenés</label>

            <div class="flex items-center space-x-4 mb-4">
              <label class="flex items-center cursor-pointer">
                <input type="radio" v-model="selectedMaterial.type" value="color" class="mr-2" />
                <span class="text-sm text-gray-300">Szín (Color)</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input type="radio" v-model="selectedMaterial.type" value="texture" class="mr-2" />
                <span class="text-sm text-gray-300">Textúra (Kép)</span>
              </label>
            </div>

            <div v-if="selectedMaterial.type === 'color'">
              <label class="block text-xs text-gray-500 mb-1">HEX Színkód</label>
              <div class="flex gap-2">
                <input v-model="selectedMaterial.value" type="color"
                  class="h-10 w-20 rounded cursor-pointer bg-transparent" />
                <input v-model="selectedMaterial.value" type="text" class="admin-input flex-1 font-mono" />
              </div>
            </div>

            <div v-else>
              <label class="block text-xs text-gray-500 mb-1">Textúra URL</label>
              <div
                class="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 transition-colors cursor-pointer relative"
                @dragover.prevent @drop.prevent="handleDrop" @click="triggerFileInput">
                <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileSelect" />
                <div v-if="isUploading" class="text-blue-400 text-sm">Feltöltés...</div>
                <div v-else>
                  <p class="text-gray-400 text-sm">Húzd ide a képet, vagy kattints</p>
                </div>
              </div>
              <input v-model="selectedMaterial.value" type="text" class="admin-input w-full font-mono mt-2" />
              <div v-if="selectedMaterial.value"
                class="mt-2 h-32 w-full bg-gray-700 rounded overflow-hidden border border-gray-600 relative group">
                <img :src="selectedMaterial.value" class="w-full h-full object-contain" />
              </div>
            </div>
          </div>

          <!-- Fizikai Tulajdonságok (PBR) -->
          <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div class="flex justify-between items-center mb-3">
              <label class="block text-xs font-medium text-gray-400">Fizikai Jellemzők (PBR)</label>
              <button @click="showTips = !showTips" class="text-xs text-blue-400 hover:text-blue-300 underline">
                {{ showTips ? 'Segédlet elrejtése' : 'Beállítási segédlet' }}
              </button>
            </div>

            <!-- Alap PBR -->
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Érdesség (Roughness): {{
                  selectedMaterial.properties?.roughness }}</label>
                <input type="range" min="0" max="1" step="0.05" v-model.number="selectedMaterial.properties!.roughness"
                  class="slider-styled" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Fémesség (Metalness): {{
                  selectedMaterial.properties?.metalness }}</label>
                <input type="range" min="0" max="1" step="0.05" v-model.number="selectedMaterial.properties!.metalness"
                  class="slider-styled" />
              </div>
            </div>

            <!-- Üveg / Átlátszóság szekció -->
            <div class="border-t border-gray-700 pt-4">
              <label class="block text-xs font-medium text-blue-400 mb-3">Üveg és Átlátszóság</label>

              <div class="flex items-center mb-4">
                <input type="checkbox" v-model="selectedMaterial.properties!.transparent" class="checkbox-styled" />
                <label class="ml-2 text-sm text-gray-300">Átlátszó renderelés engedélyezése</label>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-gray-500 mb-1" title="Fényáteresztés (Üveghatás)">Fénytörés
                    (Transmission): {{
                      selectedMaterial.properties?.transmission }}</label>
                  <input type="range" min="0" max="1" step="0.05"
                    v-model.number="selectedMaterial.properties!.transmission" class="slider-styled" />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1" title="Átlátszatlanság (1 = tömör)">Átlátszatlanság
                    (Opacity): {{
                      selectedMaterial.properties?.opacity }}</label>
                  <input type="range" min="0" max="1" step="0.05" v-model.number="selectedMaterial.properties!.opacity"
                    class="slider-styled" />
                </div>
              </div>
            </div>

            <!-- ÚJ: TIPP SZEKCIÓ -->
            <div v-if="showTips" class="mt-4 bg-gray-900/50 p-3 rounded border border-gray-700 animate-fade-in">
              <p class="text-xs text-gray-300 font-bold mb-2">ℹ️ Gyors beállítási értékek:</p>

              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left text-gray-400">
                  <thead>
                    <tr class="border-b border-gray-700 text-gray-500">
                      <th class="pb-1 font-normal">Anyag típus</th>
                      <th class="pb-1 font-normal">Érdeség..</th>
                      <th class="pb-1 font-normal">Fémes..</th>
                      <th class="pb-1 font-normal">Fényt..</th>
                      <th class="pb-1 font-normal">Átlát..</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-800">
                    <tr>
                      <td class="py-1 text-white">Víztiszta Üveg</td>
                      <td>0</td>
                      <td>0</td>
                      <td>1.0</td>
                      <td class="text-green-400">✔</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Tejüveg (Matt)</td>
                      <td>0.3 - 0.5</td>
                      <td>0</td>
                      <td>0.9</td>
                      <td class="text-green-400">✔</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Színezett Üveg</td>
                      <td>0</td>
                      <td>0</td>
                      <td>0.8</td>
                      <td class="text-green-400">✔</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Króm / Tükör</td>
                      <td>0</td>
                      <td>1.0</td>
                      <td>0</td>
                      <td class="text-red-400">✘</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Matt Fém (Alu)</td>
                      <td>0.4</td>
                      <td>1.0</td>
                      <td>0</td>
                      <td class="text-red-400">✘</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Műanyag (Fényes)</td>
                      <td>0.1</td>
                      <td>0</td>
                      <td>0</td>
                      <td class="text-red-400">✘</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-white">Bútorlap / Fa</td>
                      <td>0.5 - 0.8</td>
                      <td>0</td>
                      <td>0</td>
                      <td class="text-red-400">✘</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-[10px] text-gray-500 mt-2 italic">
                *Az Opacity értéke fizikai anyagoknál általában maradjon 1.0.
              </p>
            </div>

          </div>

          <!-- Gombok -->
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button @click="handleDelete" v-if="!isNewMaterial" class="admin-btn-danger mr-auto">Törlés</button>
            <button @click="handleCancel" class="admin-btn-secondary">Mégse</button>
            <button @click="handleSave" class="admin-btn">Mentés</button>
          </div>
        </div>
      </div>

      <div v-else class="h-full flex flex-col items-center justify-center text-gray-500">
        <div class="text-4xl mb-4">🎨</div>
        <p>Válassz egy anyagot a szerkesztéshez, vagy hozz létre újat.</p>
      </div>
    </div>
  </div>
</template>
