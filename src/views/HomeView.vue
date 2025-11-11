<!-- views/HomeView.vue -->
<template>
  <div ref="sceneContainer" class="absolute inset-0"></div>
  <div id="experience-canvas" ref="sceneContainer" class="absolute inset-0"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Experience from '@/three/Experience';
import { useExperienceStore } from '@/stores/experience';
// === ÚJ IMPORT A BETÖLTÉSHEZ ===
import { usePersistenceStore } from '@/stores/persistence';

const sceneContainer = ref<HTMLDivElement | null>(null);
let experience: Experience | null = null;

const experienceStore = useExperienceStore();
const persistenceStore = usePersistenceStore(); 

onMounted(async () => {
  if (sceneContainer.value) {
    experience = await Experience.create(sceneContainer.value);
    experienceStore.setExperience(experience);

    persistenceStore.loadStateFromLocalStorage();
  }
});

onUnmounted(() => {
  if (experience) {
    experience.destroy();
    experienceStore.setExperience(null);
  }
});
</script>