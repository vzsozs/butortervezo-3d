<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import AdminExperience from '@/three/AdminExperience';

const props = defineProps<{
  furnitureConfig: Partial<FurnitureConfig> | null;
}>();

const emit = defineEmits(['slot-clicked']);
const canvas = ref<HTMLDivElement | null>(null);
let experience: AdminExperience | null = null;

onMounted(() => {
  console.log('%c[Canvas] 4. onMounted lefutott. A kapott config:', 'color: #32CD32;', JSON.parse(JSON.stringify(props.furnitureConfig)));
  
  if (canvas.value) {
    experience = new AdminExperience(canvas.value);
    experience.addEventListener('slotClicked', handleSlotClickFrom3D);

    const config = props.furnitureConfig;
    
    // JAVÍTOTT FELTÉTEL:
    // Van gyökér slot (nincs attachToSlot) ÉS van neki defaultComponent-je is.
    const hasDrawableRoot = config?.componentSlots?.some(slot => !slot.attachToSlot && slot.defaultComponent);
    
    if (config && hasDrawableRoot) {
      console.log('%c[Canvas] 5. Config valid ÉS RAJZOLHATÓ, 3D objektum frissítése...', 'color: #32CD32;');
      experience.updateObject(config as FurnitureConfig);
    } else {
      console.log('%c[Canvas] 5. Config invalid vagy nem rajzolható, vászon törlése.', 'color: #FFA500;');
      experience.clearCanvas(); // Biztonság kedvéért ürítsük a vásznat
    }
  }
});

function handleSlotClickFrom3D(event: Event) {
  const customEvent = event as CustomEvent;
  if (customEvent.detail.slotId) {
    emit('slot-clicked', customEvent.detail.slotId);
  }
}

onUnmounted(() => {
  experience?.removeEventListener('slotClicked', handleSlotClickFrom3D);
  experience?.destroy();
});

</script>

<template>
  <div ref="canvas" class="w-full h-full rounded-lg bg-gray-800 cursor-pointer"></div>
</template>