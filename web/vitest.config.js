import { defineConfig } from 'vitest/config'

// 单测只覆盖 utils/ 与 store/ 的纯逻辑，node 环境足够；
// IndexedDB 用 fake-indexeddb 在用例里注入
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
