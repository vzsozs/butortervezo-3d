<script setup lang="ts">
import { useRoomStore } from '@/stores/room';
import { storeToRefs } from 'pinia';

const roomStore = useRoomStore();
const { roomDimensions, openings } = storeToRefs(roomStore);

// Falak nevei a könnyebb tájékozódáshoz
const wallNames = ['Elülső fal', 'Jobb fal', 'Hátsó fal', 'Bal fal'];

</script>

<template>
  <div class="flex flex-col h-full space-y-6">

    <!-- 1. SZOBA MÉRETEK -->
    <div class="space-y-3">
      <h3 class="font-semibold text-gray-200 uppercase text-xs tracking-wider">Helyiség Méretei</h3>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Szélesség (X)</label>
          <input type="number" v-model.number="roomDimensions.width" class="admin-input" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Hosszúság (Z)</label>
          <input type="number" v-model.number="roomDimensions.depth" class="admin-input" />
        </div>
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-xs text-gray-400">Belmagasság (Y)</label>
          <input type="number" v-model.number="roomDimensions.height" class="admin-input" />
        </div>
      </div>
    </div>

    <!-- 2. NYÍLÁSZÁRÓK HOZZÁADÁSA -->
    <div class="space-y-3 pt-4 border-t border-gray-700">
      <h3 class="font-semibold text-gray-200 uppercase text-xs tracking-wider">Új Elem Hozzáadása</h3>
      <div class="grid grid-cols-2 gap-3">
        <button @click="roomStore.addOpening('door')"
          class="flex flex-col items-center justify-center p-3 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 hover:border-blue-500 transition-all group">
          <span class="text-2xl mb-1 group-hover:scale-110 transition-transform">🚪</span>
          <span class="text-xs text-gray-300">Ajtó</span>
        </button>
        <button @click="roomStore.addOpening('window')"
          class="flex flex-col items-center justify-center p-3 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 hover:border-blue-500 transition-all group">
          <span class="text-2xl mb-1 group-hover:scale-110 transition-transform">🪟</span>
          <span class="text-xs text-gray-300">Ablak</span>
        </button>
      </div>
    </div>

    <!-- 3. HOZZÁADOTT ELEMEK LISTÁJA -->
    <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
      <h3 class="font-semibold text-gray-200 uppercase text-xs tracking-wider mb-2 sticky top-0 bg-gray-900 py-2 z-10">
        Elhelyezett Elemek ({{ openings.length }})
      </h3>

      <div v-if="openings.length === 0" class="text-center text-gray-500 text-sm py-4 italic">
        Még nincsenek ajtók vagy ablakok.
      </div>

      <div v-for="item in openings" :key="item.id"
        class="bg-gray-800 p-3 rounded border-l-4 border-gray-600 hover:border-blue-500 transition-colors group relative">

        <!-- Fejléc -->
        <div class="flex justify-between items-center mb-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ item.type === 'door' ? '🚪' : '🪟' }}</span>
            <span class="font-bold text-sm text-gray-200">{{ item.type === 'door' ? 'Ajtó' : 'Ablak' }}</span>
          </div>
          <button @click="roomStore.removeOpening(item.id)" class="text-gray-500 hover:text-red-400 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
              </path>
            </svg>
          </button>
        </div>

        <!-- Beállítások -->
        <div class="grid grid-cols-2 gap-2 text-xs">

          <!-- Melyik falon? -->
          <div class="col-span-2">
            <label class="text-gray-500 block mb-1">Elhelyezkedés (Fal)</label>
            <select v-model.number="item.wallIndex" class="admin-input w-full py-1">
              <option v-for="(name, idx) in wallNames" :key="idx" :value="idx">{{ name }}</option>
            </select>
          </div>

          <!-- Pozíció -->
          <div>
            <label class="text-gray-500 block mb-1">Pozíció (mm)</label>
            <input type="number" v-model.number="item.position" class="admin-input w-full py-1" />
          </div>

          <!-- Szélesség -->
          <div>
            <label class="text-gray-500 block mb-1">Szélesség</label>
            <input type="number" v-model.number="item.width" class="admin-input w-full py-1" />
          </div>

          <!-- Magasság -->
          <div>
            <label class="text-gray-500 block mb-1">Magasság</label>
            <input type="number" v-model.number="item.height" class="admin-input w-full py-1" />
          </div>

          <!-- Parapet (csak ablaknál) -->
          <div v-if="item.type === 'window'">
            <label class="text-gray-500 block mb-1">Parapet</label>
            <input type="number" v-model.number="item.elevation" class="admin-input w-full py-1" />
          </div>

        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.admin-input {
  @apply bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all;
}
</style>
