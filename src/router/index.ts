// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AdminView from '../views/AdminView.vue' // Győződj meg róla, hogy importálva van

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      // =================================================================
      // === EZT A META BLOKKOT ADD HOZZÁ ================================
      // =================================================================
      meta: {
        hideDesignerUI: true
      }
    }
  ]
})

export default router