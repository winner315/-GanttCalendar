import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 纯前端项目：没有后端，不需要 proxy。
// 端口避开 qa-workbench 的 5173，两个项目可以同时跑。
export default defineConfig({
  plugins: [vue()],
  // 相对路径：构建产物可以直接双击 dist/index.html 打开，不必依赖服务器
  base: './',
  server: {
    port: 5174,
    open: true,
  },
})
