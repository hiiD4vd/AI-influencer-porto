import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'

const ShowcaseView = () => import('./views/ShowcaseView.vue')
const VibeView = () => import('./views/VibeView.vue')
const CabinTestView = () => import('./views/CabinTestView.vue')
const IronhillTestView = () => import('./views/IronhillTestView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          component: HomeView,     name: 'home' },
    { path: '/showcase',  component: ShowcaseView, name: 'showcase' },
    { path: '/vibe',      component: VibeView,     name: 'vibe' },
    { path: '/cabin-test', component: CabinTestView, name: 'cabin-test' },
    { path: '/transition-test', component: IronhillTestView, name: 'transition-test' },
  ],
})

createApp(App).use(router).mount('#app')
