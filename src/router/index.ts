import { createRouter, createWebHistory } from 'vue-router'
// Valószínűleg van itt egy import, ami egy nem létező HomeView-ra mutat.
// Ezt kell majd javítanunk.

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      // Itt a component sor a lényeg
      component: () => import('../views/HomeView.vue') // VAGY valami hasonló
    },
    // ... lehet itt más útvonal is, pl. /about
  ]
})

export default router