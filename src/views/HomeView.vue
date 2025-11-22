<template>
  <!-- Csak EGY konténer kell -->
  <div id="experience-canvas" ref="sceneContainer" class="absolute inset-0"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Experience from '@/three/Experience';
import { useExperienceStore } from '@/stores/experience';
import { usePersistenceStore } from '@/stores/persistence';

const sceneContainer = ref<HTMLDivElement | null>(null);
let experience: Experience | null = null;

const experienceStore = useExperienceStore();
const persistenceStore = usePersistenceStore(); 

onMounted(() => {
  if (sceneContainer.value) {
    // Singleton példányosítás
    experience = Experience.getInstance(sceneContainer.value);
    
    // Store bekötése
    experienceStore.setExperience(experience);

    // Állapot betöltése (ez már az Experience-en keresztül fogja építeni a scene-t)
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