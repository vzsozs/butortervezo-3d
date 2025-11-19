<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { FurnitureConfig } from '@/config/furniture';
import AdminExperience from '@/three/AdminExperience';

const props = defineProps<{
  furnitureConfig: Partial<FurnitureConfig> | null;
}>();

const emit = defineEmits<{
  (e: 'slot-clicked', slotId: string): void;
}>();

const canvasContainer = ref<HTMLDivElement | null>(null);
let experience: AdminExperience | null = null;
let resizeObserver: ResizeObserver | null = null;

// --- KÖZPONTI FRISSÍTŐ ---
function updateCanvas(config: Partial<FurnitureConfig> | null, resetCamera: boolean) {
  if (!experience) return;

  // Ellenőrizzük, hogy van-e értelme kirajzolni valamit (van-e gyökér elem)
  const hasDrawableRoot = config?.componentSlots?.some(slot => !slot.attachToSlot && slot.defaultComponent);
    
  if (config && hasDrawableRoot) {
    // Type casting: Itt már biztosak vagyunk benne, hogy ez egy valid config
    experience.updateObject(config as FurnitureConfig, resetCamera);
  } else {
    experience.clearCanvas();
  }
}

// --- WATCHER ---
watch(() => props.furnitureConfig, (newConfig, oldConfig) => {
  // Védőháló: Ha nincs config, vagy üres, takarítunk
  if (!newConfig || !newConfig.id) {
    experience?.clearCanvas();
    return;
  }

  // Csak akkor resetelünk kamerát, ha teljesen új bútort töltöttünk be (más az ID).
  // Ha csak a nevét írja át vagy slotot állít, a kamera maradjon ott, ahol volt!
  const shouldResetCamera = !oldConfig || oldConfig.id !== newConfig.id;
  
  updateCanvas(newConfig, shouldResetCamera);
}, { deep: true });

// --- LIFECYCLE ---
onMounted(() => {
  if (canvasContainer.value) {
    // 1. Three.js indítása
    experience = new AdminExperience(canvasContainer.value);
    experience.addEventListener('slotClicked', handleSlotClickFrom3D);

    // 2. Kezdeti kirajzolás (ha van mit)
    if (props.furnitureConfig?.id) {
      updateCanvas(props.furnitureConfig, true);
    }

    // 3. ÚJ: Átméretezés figyelése (Reszponzivitás)
    resizeObserver = new ResizeObserver(() => {
      experience?.resize(); // Feltételezem, hogy van resize() metódusod az AdminExperience-ben!
    });
    resizeObserver.observe(canvasContainer.value);
  }
});

onUnmounted(() => {
  // Takarítás
  resizeObserver?.disconnect();
  experience?.removeEventListener('slotClicked', handleSlotClickFrom3D);
  experience?.destroy();
  experience = null;
});

// --- ESEMÉNYKEZELÉS ---
function handleSlotClickFrom3D(event: Event) {
  // Típusbiztosabb eseménykezelés
  const detail = (event as CustomEvent).detail;
  if (detail && typeof detail.slotId === 'string') {
    emit('slot-clicked', detail.slotId);
  }
}
</script>

<template>
  <!-- A ref nevét átírtam canvasContainer-re, hogy egyértelműbb legyen -->
  <div ref="canvasContainer" class="w-full h-full rounded-lg bg-gray-800 cursor-pointer overflow-hidden relative">
    <!-- Ide jöhetne pl. egy loading spinner, ha épp töltődik a modell -->
  </div>
</template>