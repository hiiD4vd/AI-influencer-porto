import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import ShowcaseView from './views/ShowcaseView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          component: HomeView,     name: 'home' },
    { path: '/showcase',  component: ShowcaseView, name: 'showcase' },
  ],
})

createApp(App).use(router).mount('#app')
