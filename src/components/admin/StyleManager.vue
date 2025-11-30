<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import type { ComponentConfig } from '@/config/furniture'

const configStore = useConfigStore()
// Esemény definiálása a szülő felé
const emit = defineEmits(['save-changes'])

// --- STATE ---
const selectedStyleId = ref<string | null>(null)
const filterType = ref<string>('all')
const searchQuery = ref('')
const selectedComponentIds = ref<Set<string>>(new Set())
const newStyleName = ref('')

// --- COMPUTED ---
const activeStyle = computed(() =>
  configStore.styles.find(s => s.id === selectedStyleId.value)
)

const allComponents = computed(() => {
  const list: ComponentConfig[] = []
  if (configStore.components) {
    Object.values(configStore.components).forEach(category => {
      list.push(...category)
    })
  }
  return list
})

const filteredComponents = computed(() => {
  return allComponents.value.filter(comp => {
    if (filterType.value !== 'all' && comp.componentType !== filterType.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      if (!comp.name.toLowerCase().includes(q) && !comp.id.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const aIsActive = a.styleId === selectedStyleId.value
    const bIsActive = b.styleId === selectedStyleId.value
    if (aIsActive && !bIsActive) return -1
    if (!aIsActive && bIsActive) return 1
    return a.name.localeCompare(b.name)
  })
})

const availableTypes = computed(() => {
  if (!configStore.components) return []
  return Object.keys(configStore.components)
})

// --- ACTIONS ---

function createStyle() {
  if (newStyleName.value.trim()) {
    configStore.addStyle(newStyleName.value)
    newStyleName.value = ''
    emit('save-changes') // <--- MENTÉS KÉRÉS
  }
}

function deleteActiveStyle() {
  if (selectedStyleId.value && confirm('Biztosan törlöd ezt a stílust? A komponensek besorolása elveszik.')) {
    configStore.removeStyle(selectedStyleId.value)
    selectedStyleId.value = null
    emit('save-changes') // <--- MENTÉS KÉRÉS
  }
}

function toggleSelection(id: string) {
  if (selectedComponentIds.value.has(id)) {
    selectedComponentIds.value.delete(id)
  } else {
    selectedComponentIds.value.add(id)
  }
}

function assignSelectedToStyle() {
  if (!selectedStyleId.value) return
  configStore.assignStyleToComponents(selectedStyleId.value, Array.from(selectedComponentIds.value))
  selectedComponentIds.value.clear()
  emit('save-changes') // <--- MENTÉS KÉRÉS (Mindkét fájl mentése)
}

function removeFromStyle() {
  configStore.assignStyleToComponents(undefined, Array.from(selectedComponentIds.value))
  selectedComponentIds.value.clear()
  emit('save-changes') // <--- MENTÉS KÉRÉS
}

function getStyleName(id?: string) {
  if (!id) return '-'
  return configStore.styles.find(s => s.id === id)?.name || 'Ismeretlen'
}
</script>

<template>
  <div class="flex h-full bg-[#1e1e1e] text-gray-200">
    <!-- 1. SIDEBAR -->
    <div class="w-1/4 border-r border-gray-700 flex flex-col">
      <div class="p-4 border-b border-gray-700 bg-gray-800">
        <h2 class="text-lg font-bold text-white mb-2">Stílusok</h2>
        <div class="flex gap-2">
          <input v-model="newStyleName" placeholder="Új stílus neve..."
            class="w-full bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
            @keyup.enter="createStyle" />
          <button @click="createStyle"
            class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white text-sm">+</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div v-for="style in configStore.styles" :key="style.id" @click="selectedStyleId = style.id"
          class="p-3 rounded cursor-pointer transition-colors flex justify-between items-center group"
          :class="selectedStyleId === style.id ? 'bg-blue-900/40 border border-blue-500/50' : 'hover:bg-gray-800 border border-transparent'">
          <span class="font-medium">{{ style.name }}</span>
          <span class="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded-full">
            {{allComponents.filter(c => c.styleId === style.id).length}}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. MAIN -->
    <div class="flex-1 flex flex-col" v-if="selectedStyleId">
      <div class="p-4 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
        <div>
          <h3 class="text-xl font-bold text-white"><span class="text-gray-400">Szerkesztés:</span> {{ activeStyle?.name
            }}</h3>
          <p class="text-xs text-gray-400 mt-1">Jelöld ki azokat az elemeket, amik ebbe a stílusba tartoznak.</p>
        </div>
        <div class="flex gap-2">
          <button @click="removeFromStyle" :disabled="selectedComponentIds.size === 0"
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm disabled:opacity-50">Leválasztás</button>
          <button @click="assignSelectedToStyle" :disabled="selectedComponentIds.size === 0"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold disabled:opacity-50">Hozzárendelés
            ({{ selectedComponentIds.size }})</button>
          <button @click="deleteActiveStyle"
            class="ml-4 text-red-400 hover:text-red-300 text-sm underline">Törlés</button>
        </div>
      </div>

      <div class="p-4 flex gap-4 bg-gray-900/50 border-b border-gray-700">
        <select v-model="filterType" class="bg-[#2a2a2a] border border-gray-600 rounded px-3 py-1 text-sm">
          <option value="all">Minden Típus</option>
          <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
        </select>
        <input v-model="searchQuery" placeholder="Keresés..."
          class="flex-1 bg-[#2a2a2a] border border-gray-600 rounded px-3 py-1 text-sm" />
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <table class="w-full text-left text-sm border-collapse">
          <thead class="text-gray-500 border-b border-gray-700">
            <tr>
              <th class="p-2 w-10"></th>
              <th class="p-2">Név / ID</th>
              <th class="p-2">Típus</th>
              <th class="p-2">Méretek</th>
              <th class="p-2">Stílus</th>
              <th class="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="comp in filteredComponents" :key="comp.id"
              class="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer" @click="toggleSelection(comp.id)">
              <td class="p-2 text-center"><input type="checkbox" :checked="selectedComponentIds.has(comp.id)"
                  class="cursor-pointer" @click.stop="toggleSelection(comp.id)" /></td>
              <td class="p-2">
                <div class="font-bold text-gray-300">{{ comp.name }}</div>
                <div class="text-[10px] text-gray-500 font-mono">{{ comp.id }}</div>
              </td>
              <td class="p-2 text-gray-400">{{ comp.componentType }}</td>
              <td class="p-2 text-gray-400 font-mono">{{ comp.properties?.width || '?' }} x {{ comp.properties?.height
                || '?' }}</td>
              <td class="p-2"><span class="px-2 py-1 rounded text-xs"
                  :class="comp.styleId ? (comp.styleId === selectedStyleId ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400') : 'text-gray-600 italic'">{{
                    getStyleName(comp.styleId) }}</span></td>
              <td class="p-2 text-right"><span v-if="comp.styleId === selectedStyleId"
                  class="text-green-500 font-bold">✓</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-gray-500">
      <div class="text-center">
        <p class="text-lg">⬅️ Válassz vagy hozz létre egy stílust.</p>
      </div>
    </div>
  </div>
</template>
