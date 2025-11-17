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
function updateCanvas(config: Partial<FurnitureConfig> | null, resetCamera: boolean) {
  if (!experience) return;

  const hasDrawableRoot = config?.componentSlots?.some(slot => !slot.attachToSlot && slot.defaultComponent);
    
  if (config && hasDrawableRoot) {
    console.log(`   -> 3D objektum frissítése... (resetCamera: ${resetCamera})`);
    experience.updateObject(config as FurnitureConfig, resetCamera);
  } else {
    console.log('   -> Config invalid, vászon törlése.');
    experience.clearCanvas();
  }
}

watch(() => props.furnitureConfig, (newConfig, oldConfig) => {
  console.log('📥 [AdminPreviewCanvas] A "furnitureConfig" PROP megváltozott...');
  
  // Kiszámoljuk, hogy kell-e a kamerát resetelni
  const shouldResetCamera = !oldConfig || oldConfig.id !== newConfig?.id;
  
  // Átadjuk a második argumentumot is!
  updateCanvas(newConfig, shouldResetCamera);
}, { deep: true });


onMounted(() => {
  console.log('%c[Canvas] 4. onMounted lefutott. A kapott config:', 'color: #32CD32;', JSON.parse(JSON.stringify(props.furnitureConfig)));
  
  if (canvas.value) {
    experience = new AdminExperience(canvas.value);
    experience.addEventListener('slotClicked', handleSlotClickFrom3D);

    // Az induláskor is a központi frissítő függvényt hívjuk
    updateCanvas(props.furnitureConfig, false);
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