<!-- src/components/admin/ComponentEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import type { ComponentConfig, ComponentDatabase, AttachmentPoints } from '@/config/furniture';

const allComponents = ref<ComponentDatabase>({});
const componentTypes = computed(() => Object.keys(allComponents.value));
const selectedType = ref<string>('');
const selectedComponent = ref<Partial<ComponentConfig> | null>(null);
const isNewComponent = ref(false);
const isAdvancedVisible = ref(false);

const fieldOrder: (keyof ComponentConfig)[] = ['name', 'id', 'model', 'price', 'materialTarget', 'height', 'materialSource', 'attachmentPoints'];
const advancedFields: (keyof ComponentConfig)[] = ['height', 'materialSource', 'attachmentPoints'];
const placeholders: Record<string, string> = {
  price: 'pl. 45000',
  materialTarget: 'pl. MAT_Korpusz',
  height: 'Lábaknál (0.1) = 10cm',
  materialSource: 'Ha örököl egy materialt (pl. corpus)',
};

const attachmentPointSuggestions = computed(() => {
  const points = new Set<string>();
  Object.values(allComponents.value).flat().forEach(comp => {
    if (comp.attachmentPoints) {
      if ('self' in comp.attachmentPoints && comp.attachmentPoints.self) points.add(comp.attachmentPoints.self);
      if ('multiple' in comp.attachmentPoints && comp.attachmentPoints.multiple) comp.attachmentPoints.multiple.forEach(p => points.add(p));
    }
  });
  return Array.from(points).sort();
});

onMounted(async () => {
  try {
    const response = await fetch('/database/components.json');
    if (!response.ok) throw new Error('A components.json betöltése sikertelen.');
    allComponents.value = await response.json();
    if (componentTypes.value[0]) selectedType.value = componentTypes.value[0];
  } catch (error) { console.error(error); }
});

watch(() => selectedComponent.value?.name, (newName) => {
  if (isNewComponent.value && selectedComponent.value && newName && selectedType.value) {
    // JAVÍTÁS: A .replace(/.../) helyett a new RegExp() konstruktort használjuk
    const diacritics = new RegExp('[\\u0300-\\u036f]', 'g');
    const normalizedName = newName
      .toLowerCase()
      .normalize("NFD")
      .replace(diacritics, "") // Az ékezetek eltávolítása a biztonságos módon
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '');
      
    selectedComponent.value.id = `${selectedType.value}_${normalizedName}`;
    selectedComponent.value.model = `/models/${selectedType.value}/${selectedComponent.value.id}.glb`;
  }
}, { deep: true });

function selectComponent(component: ComponentConfig) {
  selectedComponent.value = JSON.parse(JSON.stringify(component));
  isNewComponent.value = false;
  isAdvancedVisible.value = false;
}

function createNewComponent() {
  if (!selectedType.value) return;
  selectedComponent.value = { name: '', id: '', model: '', price: undefined, materialTarget: '', height: undefined, materialSource: undefined, attachmentPoints: { self: '' } };
  isNewComponent.value = true;
  isAdvancedVisible.value = false;
}

async function saveToServer() {
  const cleanData: ComponentDatabase = {};
  for (const type in allComponents.value) {
    if (!allComponents.value[type]) continue;
    cleanData[type] = allComponents.value[type].map(component => {
      const cleanComponent: Partial<ComponentConfig> = {};
      for (const key in component) {
        const typedKey = key as keyof ComponentConfig;
        const value = component[typedKey];
        if (typedKey === 'attachmentPoints') {
          const points = value as AttachmentPoints;
          if (points && 'self' in points && points.self) cleanComponent.attachmentPoints = { self: points.self };
          else if (points && 'multiple' in points && points.multiple && points.multiple.length > 0) cleanComponent.attachmentPoints = { multiple: points.multiple };
        } else if (value !== '' && value !== null && value !== undefined) {
          // JAVÍTÁS: Ez a legtisztább módja a TypeScript korlátjának kezelésére.
          // Jelezzük az ESLintnek, hogy itt az 'any' használata szándékos és indokolt.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cleanComponent as any)[typedKey] = value;
        }
      }
      return cleanComponent as ComponentConfig;
    });
  }

  try {
    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'components.json', data: cleanData }),
    });
    if (!response.ok) throw new Error(await response.text());
    alert('Komponensek sikeresen mentve!');
  } catch (error) {
    console.error(error);
    alert('Hiba a mentés közben.');
  }
}


function saveComponent() {
  if (!selectedComponent.value || !selectedType.value || !selectedComponent.value.id) return;
  const componentsList = allComponents.value[selectedType.value];
  if (!componentsList) return;
  if (isNewComponent.value) {
    componentsList.push(selectedComponent.value as ComponentConfig);
  } else {
    const index = componentsList.findIndex(c => c.id === selectedComponent.value!.id);
    if (index !== -1) {
      componentsList[index] = selectedComponent.value as ComponentConfig;
    }
  }
  selectedComponent.value = null;
}

function deleteComponent() {
  if (!selectedComponent.value || !selectedType.value || isNewComponent.value || !selectedComponent.value.id) return;
  if (confirm(`Biztosan törlöd a(z) "${selectedComponent.value.name}" komponenst?`)) {
    const componentsList = allComponents.value[selectedType.value];
    if (!componentsList) return;
    const index = componentsList.findIndex(c => c.id === selectedComponent.value!.id);
    if (index !== -1) {
      componentsList.splice(index, 1);
    }
    selectedComponent.value = null;
  }
}

</script>

<template>
  <div class="grid grid-cols-12 gap-8">
    <div class="col-span-4 bg-gray-900 p-4 rounded-lg self-start">
      <div class="flex justify-between items-center mb-4">
        <select v-model="selectedType" class="admin-select">
          <option v-for="type in componentTypes" :key="type" :value="type">{{ type }}</option>
        </select>
        <button @click="saveToServer" class="admin-btn">Mentés</button>
      </div>
      <div class="space-y-2 max-h-[70vh] overflow-y-auto">
        <template v-if="selectedType && allComponents[selectedType]">
          <div v-for="component in allComponents[selectedType]" :key="component.id"
            @click="selectComponent(component)"
            class="p-2 rounded cursor-pointer hover:bg-gray-700"
            :class="{ 'bg-blue-600 hover:bg-blue-500': selectedComponent?.id === component.id }">
            <p class="font-semibold">{{ component.name }}</p>
            <p class="text-xs text-gray-400">{{ component.id }}</p>
          </div>
        </template>
      </div>
      <button @click="createNewComponent" class="admin-btn w-full mt-4">Új Komponens</button>
    </div>

    <!-- Jobb oldali oszlop: Szerkesztő -->
    <div class="col-span-8 bg-gray-900 p-6 rounded-lg" v-if="selectedComponent">
      <h3 class="text-xl font-bold mb-6">{{ isNewComponent ? 'Új Komponens' : 'Szerkesztés' }}</h3>
      <div class="space-y-4">
        <template v-for="key in fieldOrder" :key="key">
          <div v-if="!advancedFields.includes(key)">
            <label :for="key" class="admin-label">{{ key }}</label>
            <input type="text" :id="key" v-model="selectedComponent[key]" :placeholder="placeholders[key] || `${key} értéke...`" class="admin-input" :disabled="key === 'id' && !isNewComponent"/>
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
                <div v-if="key === 'attachmentPoints' && typeof selectedComponent[key] === 'object' && selectedComponent[key] !== null" class="bg-gray-800 p-3 rounded">
                  
                  <!-- JAVÍTÁS: Checkbox-os UI a 'multiple' ponthoz -->
                  <div v-if="'multiple' in selectedComponent[key]" class="space-y-2 max-h-40 overflow-y-auto">
                    <label v-for="point in attachmentPointSuggestions" :key="point" class="flex items-center gap-2 p-1 rounded hover:bg-gray-700 cursor-pointer">
                      <input type="checkbox" :value="point" v-model="selectedComponent[key]!.multiple" class="bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-600"/>
                      <span class="text-sm">{{ point }}</span>
                    </label>
                  </div>
                  
                  <!-- Normál input a 'self' ponthoz -->
                  <input v-if="'self' in selectedComponent[key]" type="text" v-model="selectedComponent[key]!.self" placeholder="attach_pont_neve" class="admin-input" list="attachment-points-list"/>
                  <datalist id="attachment-points-list">
                    <option v-for="point in attachmentPointSuggestions" :key="point" :value="point" />
                  </datalist>
                </div>
                <input v-else type="text" :id="key" v-model="selectedComponent[key]" :placeholder="placeholders[key] || `${key} értéke...`" class="admin-input"/>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-700">
        <button v-if="!isNewComponent" @click="deleteComponent" class="admin-btn-danger">Törlés</button>
        <button @click="selectedComponent = null" class="admin-btn-secondary">Mégse</button>
        <button @click="saveComponent" class="admin-btn">Változások Alkalmazása</button>
      </div>
    </div>
  </div>
</template>