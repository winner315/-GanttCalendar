import { createRouter, createWebHashHistory } from 'vue-router'
import GanttView from '../views/GanttView.vue'
import ListView from '../views/ListView.vue'

// 用 hash 模式：构建产物可以直接双击 dist/index.html 打开，不依赖服务器 rewrite
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'gantt', component: GanttView },
    { path: '/list', name: 'list', component: ListView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
