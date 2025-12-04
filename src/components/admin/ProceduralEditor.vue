<script setup lang="ts">
import { useProceduralStore } from '@/stores/procedural'
import { storeToRefs } from 'pinia'

defineEmits(['save'])

const proceduralStore = useProceduralStore()
const { worktop, plinth } = storeToRefs(proceduralStore)

// Ideiglenes anyag lista (ezt majd a ConfigStore-ból vagy MaterialStore-ból kell tölteni)
const availableMaterials = [
  { id: 'default_worktop_grey', name: 'Alap Szürke' },
  { id: 'marble_white', name: 'Márvány Fehér' },
  { id: 'wood_oak', name: 'Tölgyfa' }
]
</script>

<template>
  <div class="bg-gray-900 p-6 rounded-lg shadow-lg text-white max-w-4xl mx-auto">
    <!-- FEJLÉC MENTÉS GOMBBAL -->
    <div class="flex justify-between items-center mb-6 border-b border-gray-700 pb-2">
      <h2 class="text-2xl font-bold">Procedurális Elemek Konfigurációja</h2>
      <button @click="$emit('save')"
        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold transition">
        Mentés Szerverre
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">

      <!-- MUNKAPULT -->
      <div class="bg-gray-800 p-4 rounded-md">
        <h3 class="text-xl font-semibold mb-4 text-blue-400">Munkapult (Worktop)</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400">Vastagság (m)</label>
            <input type="number" step="0.001" v-model="worktop.thickness"
              class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1 focus:ring-2 focus:ring-blue-500 outline-none">
            <p class="text-xs text-gray-500 mt-1">Jelenleg: {{ (worktop.thickness * 1000).toFixed(0) }} mm</p>
          </div>

          <div>
            <label class="block text-sm text-gray-400">Oldalsó Túllógás (m)</label>
            <input type="number" step="0.001" v-model="worktop.sideOverhang"
              class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1">
          </div>

          <div>
            <label class="block text-sm text-gray-400">Híd Küszöbérték (m)</label>
            <input type="number" step="0.01" v-model="worktop.gapThreshold"
              class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1">
            <p class="text-xs text-gray-500 mt-1">Ennél kisebb réseket köt össze.</p>
          </div>

          <div>
            <label class="block text-sm text-gray-400">Anyag</label>
            <select v-model="worktop.materialId" class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1">
              <option v-for="mat in availableMaterials" :key="mat.id" :value="mat.id">{{ mat.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- LÁBAZAT -->
      <div class="bg-gray-800 p-4 rounded-md">
        <h3 class="text-xl font-semibold mb-4 text-green-400">Lábazat (Plinth)</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400">Magasság (m)</label>
            <input type="number" step="0.001" v-model="plinth.height"
              class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1">
            <p class="text-xs text-gray-500 mt-1">Jelenleg: {{ (plinth.height * 1000).toFixed(0) }} mm</p>
          </div>

          <div>
            <label class="block text-sm text-gray-400">Mélység Eltolás (m)</label>
            <input type="number" step="0.001" v-model="plinth.depthOffset"
              class="w-full bg-gray-700 border border-gray-600 rounded p-2 mt-1">
            <p class="text-xs text-gray-500 mt-1">Mennyivel van beljebb a fronttól.</p>
          </div>
        </div>

        <div class="mt-6 p-3 bg-gray-700/50 rounded text-sm text-gray-300">
          <p>ℹ️ <strong>Info:</strong> A lábazat anyaga automatikusan öröklődik a felette lévő korpusz anyagából.</p>
        </div>
      </div>

    </div>
  </div>
</template>
