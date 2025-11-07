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

onMounted(() => {
  if (sceneContainer.value) {
    experience = new Experience(sceneContainer.value)
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