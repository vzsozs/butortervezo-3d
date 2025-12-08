<script setup lang="ts">
import { useModalStore } from '@/stores/modal';
import { storeToRefs } from 'pinia';

const modalStore = useModalStore();
const { isOpen, title, message, actions } = storeToRefs(modalStore);

function handleAction(value: any) {
    modalStore.close(value);
}
</script>

<template>
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100"
        leave-to-class="opacity-0">
        <div v-if="isOpen"
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div class="bg-[#1e1e1e] border border-gray-700/50 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200"
                @click.stop>
                <h3 class="text-xl font-semibold text-white mb-2">{{ title }}</h3>
                <p class="text-gray-400 mb-6 text-sm whitespace-pre-line">{{ message }}</p>

                <div class="flex flex-col gap-3">
                    <button v-for="(action, index) in actions" :key="index" @click="handleAction(action.value)" :class="[
                        'w-full font-medium py-2 rounded-xl transition-all',
                        action.class || 'bg-gray-700 text-gray-200'
                    ]">
                        {{ action.label }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>
