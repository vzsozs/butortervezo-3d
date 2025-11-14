// src/main.ts

import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import ConfigManager from '@/three/Managers/ConfigManager';

const app = createApp(App);

app.use(createPinia());

ConfigManager.loadData();

app.use(router);

app.mount('#app');