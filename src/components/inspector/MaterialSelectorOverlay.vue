<script setup lang="ts">
import type { InspectorControl } from '@/composables/inspector/useInspectorGrouping'

defineProps<{
    activeControl: InspectorControl
    availableMaterials: any[]
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'select', id: string): void
}>()
</script>

<template>
    <div class="absolute inset-0 z-[70] bg-[#1e1e1e] flex flex-col transition-all duration-300">
        <!-- Fejléc -->
        <div class="p-3 border-b border-gray-700 flex items-center gap-3 bg-gray-800 shadow-md">
            <button @click="emit('close')"
                class="text-gray-400 hover:text-white p-1.5 hover:bg-gray-700 rounded-full transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            <div>
                <h3 class="text-xs font-bold text-gray-200 uppercase tracking-wide">Anyag választása</h3>
                <p class="text-[10px] text-gray-500 truncate w-48">{{ activeControl.label }}</p>
            </div>
        </div>

        <!-- Lista -->
        <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">

            <div v-if="availableMaterials.length === 0" class="text-center text-gray-500 text-xs mt-10">
                Nincs elérhető anyag ehhez az elemhez.
            </div>

            <div class="grid grid-cols-2 gap-2">
                <button v-for="mat in availableMaterials" :key="mat.id" @click="emit('select', mat.id)"
                    class="group flex flex-col text-left bg-[#252525] hover:bg-[#333] rounded-lg p-2 transition-all">
                    <!-- Téglalap alakú előnézet (Keskenyebb: h-14) -->
                    <div
                        class="w-full h-14 rounded-md shadow-sm border border-gray-600 group-hover:border-gray-400 relative overflow-hidden mb-2">
                        <div v-if="mat.type === 'color'" class="w-full h-full" :style="{ backgroundColor: mat.value }">
                        </div>

                        <img v-else :src="(mat as any).thumbnail || mat.value"
                            class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
                    </div>

                    <!-- Infó szekció -->
                    <div class="w-full px-1">
                        <span class="block text-xs font-bold text-gray-300 group-hover:text-white leading-tight mb-0.5">
                            {{ mat.name }}
                        </span>
                        <span class="block text-[9px] text-gray-500 group-hover:text-gray-400">
                            {{ Array.isArray(mat.category) ? mat.category.join(', ') : mat.category }}
                        </span>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
