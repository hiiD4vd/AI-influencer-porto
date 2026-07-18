import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import ShowcaseView from './views/ShowcaseView.vue'
import VibeView from './views/VibeView.vue'
import CabinTestView from './views/CabinTestView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          component: HomeView,     name: 'home' },
    { path: '/showcase',  component: ShowcaseView, name: 'showcase' },
    { path: '/vibe',      component: VibeView,     name: 'vibe' },
    { path: '/cabin-test', component: CabinTestView, name: 'cabin-test' },
  ],
})

createApp(App).use(router).mount('#app')
