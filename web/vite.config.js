import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 纯前端项目：没有后端，不需要 proxy。
// 端口避开 qa-workbench 的 5173，两个项目可以同时跑。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    open: true,
  },
})
