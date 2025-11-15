<!-- src/components/admin/AdminPreviewCanvas.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import AdminExperience from '@/three/AdminExperience';

const props = defineProps<{
  furnitureConfig: Partial<FurnitureConfig> | null; // A null-t is fogadnia kell
}>();

const emit = defineEmits(['slot-clicked']);

const canvas = ref<HTMLDivElement | null>(null);
let experience: AdminExperience | null = null;

// Egy segédfüggvény, hogy ne ismételjük a kódot
function updateExperienceObject(config: Partial<FurnitureConfig> | null) {
  if (!experience) return;

  // A "gyökér elem" az a slot, aminek nincs 'attachToSlot' tulajdonsága.
  const hasRootElement = config?.componentSlots?.some(slot => !slot.attachToSlot);

  // Csak akkor frissítjük a 3D objektumot, ha a config valid ÉS van benne gyökér elem.
  if (config && hasRootElement) {
    const plainConfig = JSON.parse(JSON.stringify(config));
    experience.updateObject(plainConfig as FurnitureConfig);
  } else {
    // Ha nincs mit mutatni (pl. új, üres bútor), akkor ürítsük ki a vásznat.
    experience.clearCanvas();
  }
}

function handleSlotClickFrom3D(event: Event) {
  const customEvent = event as CustomEvent;
  if (customEvent.detail.slotId) {
    emit('slot-clicked', customEvent.detail.slotId);
  }
}

onMounted(() => {
  if (canvas.value) {
    experience = new AdminExperience(canvas.value);
    experience.addEventListener('slotClicked', handleSlotClickFrom3D);

    // MOST, hogy az experience létezik, beállítjuk a kezdeti állapotot
    // a props.furnitureConfig aktuális értékével.
    updateExperienceObject(props.furnitureConfig);
  }
});

onUnmounted(() => {
  experience?.removeEventListener('slot-clicked', handleSlotClickFrom3D);
  experience?.destroy();
});

// A watch most már NEM fut le azonnal (nincs 'immediate: true')
// Csak a props.furnitureConfig KÉSŐBBI változásaira reagál.
watch(() => props.furnitureConfig, (newConfig) => {
  updateExperienceObject(newConfig);
}, { 
  deep: true
}); 
</script>

<template>
  <div ref="canvas" class="w-full h-full rounded-lg bg-gray-800 cursor-pointer"></div>
</template>