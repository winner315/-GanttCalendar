import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 后端端口（.env 里 API_PORT 的默认值）。dev 与 preview 都要转发 /api，
// 否则 preview 下所有请求 404 —— preview **不会**继承 server.proxy。
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8010'
const proxy = { '/api': { target: API_TARGET, changeOrigin: true } }

// 端口避开 qa-workbench 的 5173，两个项目可以同时跑。
export default defineConfig({
  plugins: [vue()],
  // 相对路径：构建产物的资源引用不依赖部署路径
  base: './',
  server: {
    port: Number(process.env.VITE_PORT ?? 5174),
    strictPort: false,
    open: process.env.VITE_NO_OPEN !== '1',
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
})
