<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'; // watch importálása
import type { FurnitureConfig } from '@/config/furniture';
import AdminExperience from '@/three/AdminExperience';

const props = defineProps<{
  furnitureConfig: Partial<FurnitureConfig> | null;
}>();

const emit = defineEmits(['slot-clicked']);
const canvas = ref<HTMLDivElement | null>(null);
let experience: AdminExperience | null = null;

// --- KÖZPONTI FRISSÍTŐ FÜGGVÉNY ---
// Kiemeltük a logikát, hogy ne kelljen ismételni
function updateCanvas(config: Partial<FurnitureConfig> | null) {
  if (!experience) return;

  const hasDrawableRoot = config?.componentSlots?.some(slot => !slot.attachToSlot && slot.defaultComponent);
    
  if (config && hasDrawableRoot) {
    console.log('   -> Új config valid, 3D objektum frissítése...');
    experience.updateObject(config as FurnitureConfig);
  } else {
    console.log('   -> Új config invalid, vászon törlése.');
    experience.clearCanvas();
  }
}

// --- A HIÁNYZÓ WATCH BLOKK ---
watch(() => props.furnitureConfig, (newConfig) => {
  console.log('📥 LOG D: [AdminPreviewCanvas] A "furnitureConfig" PROP megváltozott, frissítés indul...');
  updateCanvas(newConfig);
}, { deep: true });


onMounted(() => {
  console.log('%c[Canvas] 4. onMounted lefutott. A kapott config:', 'color: #32CD32;', JSON.parse(JSON.stringify(props.furnitureConfig)));
  
  if (canvas.value) {
    experience = new AdminExperience(canvas.value);
    experience.addEventListener('slotClicked', handleSlotClickFrom3D);

    // Az induláskor is a központi frissítő függvényt hívjuk
    updateCanvas(props.furnitureConfig);
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