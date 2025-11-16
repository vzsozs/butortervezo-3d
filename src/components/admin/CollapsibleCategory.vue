<script setup lang="ts">
import { ref } from 'vue';
import IconChevronDown from '@/assets/icons/chevron-down.svg?component'; // Ezt az ikont majd létre kell hozni

const props = defineProps<{
  title: string;
  startOpen?: boolean; // Opcionális prop, hogy alapból nyitva legyen-e
}>();

const isOpen = ref(props.startOpen || false);
</script>

<template>
  <div>
    <button 
      @click="isOpen = !isOpen" 
      class="w-full flex justify-between items-center p-2 rounded-md hover:bg-gray-700/50 transition-colors"
    >
      <h3 class="text-sm font-semibold text-text-primary uppercase tracking-wider">{{ title }}</h3>
      <IconChevronDown 
        class="w-5 h-5 text-gray-400 transition-transform" 
        :class="{ 'rotate-180': isOpen }"
      />
    </button>
    
    <!-- A v-if helyett v-show-t használunk, hogy a tartalom ne tűnjön el a DOM-ból, csak elrejtsük.
         Ez jobban működik a belső állapotokkal. -->
    <div v-show="isOpen" class="pl-2 pt-2 space-y-2 border-l border-gray-700 ml-2">
      <!-- Ide kerül a kategória tartalma (a lista elemei) -->
      <slot></slot>
    </div>
  </div>
</template>