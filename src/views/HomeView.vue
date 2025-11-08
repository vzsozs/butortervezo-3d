<!-- views/HomeView.vue -->
<template>
  <div ref="sceneContainer" class="absolute inset-0"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Experience from '@/three/Experience'
import { useExperienceStore } from '@/stores/experience';

const sceneContainer = ref<HTMLDivElement | null>(null)
let experience: Experience | null = null

const experienceStore = useExperienceStore();

// JAVÍTÁS: Az onMounted most már egy async függvény
onMounted(async () => {
  if (sceneContainer.value) {
    // JAVÍTÁS: Az új, aszinkron create metódust hívjuk
    experience = await Experience.create(sceneContainer.value);
    experienceStore.setExperience(experience);
  }
})

onUnmounted(() => {
  if (experience) {
    experience.destroy()
    experienceStore.setExperience(null);
  }
})
</script>