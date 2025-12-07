<script setup lang="ts">
import { useInspectorData } from '@/composables/inspector/useInspectorLogic'

const { currentState } = useInspectorData()
</script>

<template>
  <div
    class="p-3 bg-black/80 text-[10px] font-mono text-gray-400 border-t border-gray-800 overflow-x-auto max-h-40 custom-scrollbar"
    @mousedown.stop>
    <div class="font-bold mb-2 text-white flex justify-between">
      <span>📦 BÚTOR SZERKEZET</span>
      <span class="text-gray-500">{{ Object.keys(currentState).length }} slot</span>
    </div>
    <div v-for="(val, key) in currentState" :key="key"
      class="flex justify-between items-center hover:bg-white/10 py-0.5 px-1 rounded border-b border-white/5 last:border-0">
      <span class="text-blue-400 truncate w-1/2 pr-2" :title="String(key)">{{ key }}</span>
      <span class="text-green-400 truncate w-1/2 text-right" :title="String(val)">{{ val }}</span>
    </div>
  </div>
</template>
