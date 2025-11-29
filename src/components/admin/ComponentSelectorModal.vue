<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useConfigStore } from '@/stores/config';
import type { ComponentConfig } from '@/config/furniture';

const props = defineProps<{
    allowedTypes: string[];
    currentValue?: string | null;
    multiple?: boolean; // NEW: Multi-select mode
    selectedValues?: string[]; // NEW: For multi-select
}>();

const emit = defineEmits<{
    (e: 'select', componentId: string): void;
    (e: 'select-multiple', componentIds: string[]): void; // NEW
    (e: 'close'): void;
}>();

const configStore = useConfigStore();
const searchQuery = ref('');
const internalSelected = ref<string[]>([]);

// Initialize internal selection
watch(() => props.selectedValues, (newVal) => {
    if (props.multiple) {
        internalSelected.value = [...(newVal || [])];
    }
}, { immediate: true });

// Flatten available components based on allowed types
const availableComponents = computed(() => {
    const all = configStore.components || {};
    let options: ComponentConfig[] = [];
    props.allowedTypes.forEach(type => {
        if (all[type]) {
            options = options.concat(all[type]);
        }
    });

    // Filter by search query
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        options = options.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.id.toLowerCase().includes(query)
        );
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
});

function handleCardClick(id: string) {
    if (props.multiple) {
        toggleCheckbox(id);
    } else {
        emit('select', id);
        emit('close');
    }
}

function toggleCheckbox(id: string) {
    const idx = internalSelected.value.indexOf(id);
    if (idx >= 0) {
        internalSelected.value.splice(idx, 1);
    } else {
        internalSelected.value.push(id);
    }
    // Removed immediate emit to prevent premature recompilation
}

function saveMultiple() {
    emit('select-multiple', internalSelected.value);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
        <div
            class="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl flex flex-col max-h-[80vh]">

            <!-- HEADER -->
            <div class="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
                <h3 class="text-lg font-bold text-white">
                    {{ multiple ? 'Elemek Kiválasztása' : 'Komponens Kiválasztása' }}
                </h3>
                <button @click="emit('close')" class="text-gray-400 hover:text-white">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12">
                        </path>
                    </svg>
                </button>
            </div>

            <!-- SEARCH -->
            <div class="p-4 bg-gray-800 border-b border-gray-700">
                <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </span>
                    <input type="text" v-model="searchQuery" placeholder="Keresés név vagy ID alapján..."
                        class="w-full bg-gray-900 border border-gray-600 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        autofocus />
                </div>
            </div>

            <!-- LIST -->
            <div class="flex-1 overflow-y-auto p-4 bg-gray-800">
                <div v-if="availableComponents.length === 0" class="text-center py-10 text-gray-500">
                    Nincs találat a keresési feltételekre.
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <!-- Empty Option (Single Select Only) -->
                    <button v-if="!multiple" @click="handleCardClick('')"
                        class="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-red-500 hover:bg-gray-700/50 transition-all text-left group">
                        <div
                            class="w-10 h-10 rounded bg-gray-900 flex items-center justify-center text-gray-500 group-hover:text-red-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </div>
                        <div>
                            <div class="font-bold text-gray-300 group-hover:text-red-300">Nincs Kiválasztva</div>
                            <div class="text-xs text-gray-500">Üres slot</div>
                        </div>
                    </button>

                    <!-- Components -->
                    <button v-for="comp in availableComponents" :key="comp.id" @click="handleCardClick(comp.id)"
                        class="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-all text-left group relative"
                        :class="{
                            'ring-2 ring-blue-500 bg-blue-900/20': currentValue === comp.id,
                            'ring-1 ring-green-500/50': multiple && internalSelected.includes(comp.id)
                        }">

                        <!-- Checkbox for Multi-select -->
                        <div v-if="multiple" class="absolute bottom-2 right-2 z-10"
                            @click.stop="toggleCheckbox(comp.id)">
                            <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm"
                                :class="internalSelected.includes(comp.id) ? 'bg-green-500 border-green-500' : 'border-gray-500 bg-gray-800 hover:border-gray-400'">
                                <svg v-if="internalSelected.includes(comp.id)" class="w-3.5 h-3.5 text-white"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                        d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                        </div>

                        <!-- Placeholder Icon (or Image if available) -->
                        <div
                            class="w-10 h-10 rounded bg-gray-900 flex items-center justify-center text-gray-500 group-hover:text-blue-400">
                            <span class="text-lg font-bold">{{ comp.name.charAt(0).toUpperCase() }}</span>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-gray-200 truncate group-hover:text-blue-300">{{ comp.name }}
                            </div>
                            <div class="text-xs text-gray-500 truncate">{{ comp.id }}</div>
                            <div v-if="comp.properties?.width" class="text-xs text-gray-400 mt-1">{{
                                comp.properties.width }} cm</div>
                        </div>
                    </button>
                </div>
            </div>

            <!-- FOOTER -->
            <div class="p-4 border-t border-gray-700 bg-gray-900 rounded-b-lg flex justify-end gap-2">
                <button @click="emit('close')"
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">Mégse</button>
                <button v-if="multiple" @click="saveMultiple"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-bold">
                    Kiválasztás Mentése ({{ internalSelected.length }})
                </button>
            </div>

        </div>
    </div>
</template>
