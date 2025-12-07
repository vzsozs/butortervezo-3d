<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
    title: string
    dimensions: { width: number; height: number; depth: number } | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const rootElement = ref<HTMLElement | null>(null)

defineExpose({
    rootElement
})
</script>

<template>
    <div ref="rootElement"
        class="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-800/50 to-transparent cursor-move select-none hover:bg-gray-800/30 transition-colors">
        <div class="flex justify-between items-start">
            <h2 class="font-bold text-white text-md leading-tight">{{ title }}</h2>
            <button @mousedown.stop @click="emit('close')" class="text-gray-500 hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12">
                    </path>
                </svg>
            </button>
        </div>
        <div v-if="dimensions" class="mt-2 text-[11px] text-blue-400 font-mono flex flex-wrap gap-x-3">
            <span>Szél.: <span class="text-gray-300">{{ dimensions.width }}mm</span></span>
            <span>Mag.: <span class="text-gray-300">{{ dimensions.height }}mm</span></span>
            <span>Mély.: <span class="text-gray-300">{{ dimensions.depth }}mm</span></span>
        </div>
    </div>
</template>
