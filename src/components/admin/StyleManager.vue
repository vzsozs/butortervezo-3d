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
  <div class="grid grid-cols-12 gap-6 h-full">
    <!-- 1. SIDEBAR: STÍLUSOK LISTÁJA -->
    <div class="col-span-4 bg-gray-900 rounded-lg p-4 flex flex-col h-full border border-gray-700">
      <div class="mb-4 border-b border-gray-700 pb-4">
        <h2 class="text-lg font-bold text-white mb-2">Stílusok</h2>
        <div class="flex gap-2">
          <input v-model="newStyleName" placeholder="Új stílus neve..." class="admin-input"
            @keyup.enter="createStyle" />
          <button @click="createStyle"
            class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white text-sm font-bold transition-colors">+</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1">
        <div v-for="style in configStore.styles" :key="style.id" @click="selectedStyleId = style.id"
          class="p-3 rounded cursor-pointer transition-colors flex justify-between items-center group border border-transparent"
          :class="selectedStyleId === style.id ? 'bg-gray-800 border-blue-500' : 'hover:bg-gray-800'">
          <span class="font-medium text-gray-200">{{ style.name }}</span>
          <span class="text-xs text-gray-500 bg-gray-950 px-2 py-0.5 rounded-full">
            {{allComponents.filter(c => c.styleId === style.id).length}}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. MAIN: SZERKESZTŐ -->
    <div class="col-span-8 bg-gray-900 rounded-lg p-6 border border-gray-700 h-full flex flex-col">
      <div v-if="selectedStyleId" class="flex flex-col h-full">
        <!-- HEADER -->
        <div class="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
          <div>
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="text-gray-500 font-normal text-base">Szerkesztés:</span>
              {{ activeStyle?.name }}
            </h3>
            <p class="text-xs text-gray-400 mt-1">Jelöld ki azokat az elemeket, amik ebbe a stílusba tartoznak.</p>
          </div>
          <div class="flex gap-2">
            <button @click="deleteActiveStyle" class="admin-btn-danger text-xs px-3 py-1">Törlés</button>
          </div>
        </div>

        <!-- FILTERS & ACTIONS -->
        <div class="flex gap-4 mb-4 items-center bg-gray-800/50 p-3 rounded border border-gray-700">
          <select v-model="filterType" class="admin-select w-40">
            <option value="all">Minden Típus</option>
            <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
          </select>
          <input v-model="searchQuery" placeholder="Keresés..." class="admin-input flex-1" />

          <div class="flex gap-2 border-l border-gray-600 pl-4">
            <button @click="removeFromStyle" :disabled="selectedComponentIds.size === 0"
              class="admin-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">Leválasztás</button>
            <button @click="assignSelectedToStyle" :disabled="selectedComponentIds.size === 0"
              class="admin-btn disabled:opacity-50 disabled:cursor-not-allowed">
              Hozzárendelés ({{ selectedComponentIds.size }})
            </button>
          </div>
        </div>

        <!-- TABLE -->
        <div class="flex-1 overflow-y-auto custom-scrollbar border border-gray-700 rounded bg-gray-800">
          <table class="w-full text-left text-sm border-collapse">
            <thead class="text-gray-400 bg-gray-900 sticky top-0 z-10">
              <tr>
                <th class="p-3 w-10 border-b border-gray-700"></th>
                <th class="p-3 border-b border-gray-700">Név / ID</th>
                <th class="p-3 border-b border-gray-700">Típus</th>
                <th class="p-3 border-b border-gray-700">Méretek</th>
                <th class="p-3 border-b border-gray-700">Jelenlegi Stílus</th>
                <th class="p-3 border-b border-gray-700 text-right"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-700">
              <tr v-for="comp in filteredComponents" :key="comp.id"
                class="hover:bg-gray-700/50 cursor-pointer transition-colors"
                :class="{ 'bg-blue-900/20': selectedComponentIds.has(comp.id) }" @click="toggleSelection(comp.id)">
                <td class="p-3 text-center">
                  <input type="checkbox" :checked="selectedComponentIds.has(comp.id)" class="checkbox-styled"
                    @click.stop="toggleSelection(comp.id)" />
                </td>
                <td class="p-3">
                  <div class="font-bold text-gray-200">{{ comp.name }}</div>
                  <div class="text-[10px] text-gray-500 font-mono">{{ comp.id }}</div>
                </td>
                <td class="p-3 text-gray-400">{{ comp.componentType }}</td>
                <td class="p-3 text-gray-500 font-mono text-xs">
                  {{ comp.properties?.width || '?' }} x {{ comp.properties?.height || '?' }}
                </td>
                <td class="p-3">
                  <span class="px-2 py-1 rounded text-xs border"
                    :class="comp.styleId ? (comp.styleId === selectedStyleId ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-gray-700 text-gray-400 border-gray-600') : 'text-gray-600 italic border-transparent'">
                    {{ getStyleName(comp.styleId) }}
                  </span>
                </td>
                <td class="p-3 text-right">
                  <span v-if="comp.styleId === selectedStyleId" class="text-green-500 font-bold">✓</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div class="text-4xl mb-4">🎨</div>
        <p class="text-lg">Válassz vagy hozz létre egy stílust a bal oldalon.</p>
      </div>
    </div>
  </div>
</template>
