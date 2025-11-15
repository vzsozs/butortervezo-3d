<script setup lang="ts">
import { ref } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import ComponentEditor from '@/components/admin/ComponentEditor.vue';
import FurnitureEditor from '@/components/admin/FurnitureEditor.vue';
import AdminSidePanel from '@/components/admin/AdminSidePanel.vue'; // <-- ÚJ IMPORT

const activeTab = ref('components');

// --- ÚJ ÁLLAPOTKEZELÉS A NÉZET SZINTJÉN ---
const selectedFurniture = ref<Partial<FurnitureConfig> | null>(null);
const isNewFurniture = ref(false);
const furnitureEditorRef = ref<{ scrollToSlot: (id: string) => void } | null>(null);

function handleSelectFurniture(furniture: FurnitureConfig | null) {
  selectedFurniture.value = furniture;
  isNewFurniture.value = false;
}

function handleCreateNew() {
  selectedFurniture.value = { id: '', name: '', category: 'bottom_cabinets', componentSlots: [] };
  isNewFurniture.value = true;
}

function handleCancel() {
  selectedFurniture.value = null;
  isNewFurniture.value = false;
}

function handleSave(furniture: FurnitureConfig) {
  // Itt jönne a logika, ami elmenti a bútort a teljes listába.
  // Ezt a logikát a régi FurnitureEditor-ból kell majd áthozni,
  // de egyelőre csak logoljuk, hogy a kommunikáció működik.
  console.log('Mentés érkezett:', furniture);
  alert('A mentési logika még nincs implementálva az AdminView-ban, de az adat megérkezett! (lásd konzol)');
  handleCancel(); // Mentés után bezárjuk a szerkesztőt
}

function handleSaveToServer() {
  // Itt jönne a szerverre mentés logikája
  alert('Szerverre mentés!');
}

function handleSlotClicked(slotId: string) {
  furnitureEditorRef.value?.scrollToSlot(slotId);
}

</script>

<template>
  <div class="bg-gray-800 text-white min-h-screen p-4 sm:p-8 font-sans flex flex-col">
    <div class="w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
       
       <div class="flex-shrink-0">
        <h1 class="text-3xl sm:text-4xl font-bold">Admin Felület</h1>
          <p class="text-sm text-gray-400 -mt-1 mb-4">Verzió 0.1</p>
        <div class="flex border-b border-gray-700 mb-8">
          <button 
            @click="activeTab = 'components'" 
            :class="['px-4 py-2 font-semibold', activeTab === 'components' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
          >
            Komponens Szerkesztő
          </button>
          <button 
            @click="activeTab = 'furniture'" 
            :class="['px-4 py-2 font-semibold', activeTab === 'furniture' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400']"
          >
            Bútor Szerkesztő
          </button>
        </div>
      </div>

      <!-- Tartalmi rész (kitölti a maradék helyet) -->
      <div class="flex-1 min-h-0">
        <div v-if="activeTab === 'components'" class="h-full">
          <ComponentEditor />
        </div>
        
        <!-- BÚTOR SZERKESZTŐ ÚJ ELRENDEZÉSE -->
        <div v-if="activeTab === 'furniture'" class="h-full flex gap-8">
          <!-- Bal oldali panel (fix szélesség) -->
            <!-- JAVÍTÁS: Hozzáadjuk a 'sticky', 'top-8' és 'self-start' osztályokat -->
            <div class="w-80 flex-shrink-0 h-full sticky top-8 self-start">
              <AdminSidePanel 
                :selected-furniture="selectedFurniture"
                @update:selected-furniture="handleSelectFurniture"
                @create-new="handleCreateNew"
                @save-to-server="handleSaveToServer"
                @slot-clicked="handleSlotClicked"
              />
            </div>
          
          <!-- Jobb oldali szerkesztő (kitölti a maradék helyet) -->
          <div class="flex-1 h-full">
            <FurnitureEditor 
              ref="furnitureEditorRef"
              :furniture="selectedFurniture"
              :is-new="isNewFurniture"
              @save="handleSave"
              @cancel="handleCancel"
            />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>