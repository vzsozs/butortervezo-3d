<!-- views/HomeView.vue -->
<template>
  <!-- A dupla ref-et és id-t javítottam egyre -->
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

// Az 'async' kulcsszó már nem kell, mert az getInstance szinkron
onMounted(() => {
  if (sceneContainer.value) {
    
    experience = Experience.getInstance(sceneContainer.value);

    experienceStore.setExperience(experience);

    // Ez a logika maradhat, az állapot betöltése a 3D inicializálása után történik
    persistenceStore.loadStateFromLocalStorage();
  }
});

onUnmounted(() => {
  if (experience) {
    experience.destroy();
    experienceStore.setExperience(null);
    // Fontos: a destroy metódusunk már nullázza a belső singleton
    // példányt, így a rendszer tiszta marad.
  }
});
</script>