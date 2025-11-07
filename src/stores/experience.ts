// src/stores/experience.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type Experience from '@/three/Experience';

export const useExperienceStore = defineStore('experience', () => {
  const instance = ref<Experience | null>(null);

  function setExperience(experienceInstance: Experience | null) {
    instance.value = experienceInstance;
  }

  return { instance, setExperience };
});