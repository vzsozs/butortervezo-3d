<template>
  <div ref="sceneContainer" class="absolute inset-0"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Experience from '@/three/Experience' // Importáljuk az új osztályunkat

const sceneContainer = ref<HTMLDivElement | null>(null)
let experience: Experience | null = null

onMounted(() => {
  if (sceneContainer.value) {
    // Létrehozzuk az Experience egy példányát, és átadjuk neki a div-et, amibe rajzolnia kell.
    experience = new Experience(sceneContainer.value)
  }
})

onUnmounted(() => {
  // Amikor a komponens megszűnik, meghívjuk a takarító metódust.
  if (experience) {
    experience.destroy()
  }
})
</script>