<script setup lang="ts">
import { } from 'vue';

const emit = defineEmits<{
    (e: 'select', type: 'front' | 'shelf' | 'drawer'): void;
    (e: 'cancel'): void;
}>();

const options = [
    { id: 'front', name: 'Ajtó', icon: '🚪', description: 'Frontok hozzáadása (pl. ajtók, fiókelőlapok)' },
    { id: 'shelf', name: 'Polc', icon: 'bookshelf', description: 'Belső polcok elhelyezése' }, // Using text/emoji for now if icon not avail
    { id: 'drawer', name: 'Fiók', icon: '🗄️', description: 'Fiókdobozok és sínek' },
];

</script>

<template>
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <h2 class="text-xl font-bold text-white mb-6 text-center">Válassz Elrendezés Típust</h2>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button v-for="opt in options" :key="opt.id" @click="emit('select', opt.id as any)"
                    class="flex flex-col items-center p-6 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 hover:border-blue-500 rounded-lg transition-all group text-center">
                    <div class="text-4xl mb-4 group-hover:scale-110 transition-transform">{{ opt.icon }}</div>
                    <h3 class="text-lg font-bold text-white mb-2">{{ opt.name }}</h3>
                    <p class="text-sm text-gray-400">{{ opt.description }}</p>
                </button>
            </div>

            <div class="flex justify-center">
                <button @click="emit('cancel')" class="text-gray-400 hover:text-white text-sm underline">Mégse</button>
            </div>
        </div>
    </div>
</template>
