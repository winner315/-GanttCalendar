/**
 * IndexedDB 薄封装 —— 现在只剩两个用途：
 *  1. `meta` 表存节假日的同步时间戳（api/holidaySync.js 在用）
 *  2. `schedules` 表**不再被写**，但库定义必须留着 —— 它是老数据搬进 MySQL 的唯一来源
 *
 * 第 2 条是本文件最后那组用例存在的理由：谁要重构 idb.js，先看那里。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import {
  STORE_META,
  STORE_SCHEDULES,
  clearStore,
  getAll,
  get,
  getBackend,
  put,
  resetBackendForTests,
  storageAvailable,
} from './idb.js'
import { toDayNumber } from './date.js'

beforeEach(async () => {
  resetBackendForTests()
  await getBackend()
  // fake-indexeddb 的数据在同一文件内跨用例保留，每个用例从干净的库开始
  await clearStore(STORE_META)
  await clearStore(STORE_SCHEDULES)
})

describe('meta 表基本往返', () => {
  it('写入后能按 key 读回', async () => {
    await put(STORE_META, { key: 'holidaySyncAt', value: 123 })
    const record = await get(STORE_META, 'holidaySyncAt')
    expect(record.value).toBe(123)
  })

  it('同 key 再 put 是覆盖而不是新增', async () => {
    await put(STORE_META, { key: 'k', value: 1 })
    await put(STORE_META, { key: 'k', value: 2 })
    const all = await getAll(STORE_META)
    expect(all).toHaveLength(1)
    expect(all[0].value).toBe(2)
  })

  it('fake-indexeddb 环境下 storageAvailable 为 true', () => {
    expect(storageAvailable()).toBe(true)
  })
})

describe('idb 不可用时降级', () => {
  it('indexedDB 缺失时退回内存实现，读写仍然可用', async () => {
    const original = globalThis.indexedDB
    resetBackendForTests()
    // 模拟隐私模式：indexedDB 存在但 open 直接报错
    globalThis.indexedDB = {
      open() {
        const request = {}
        setTimeout(() => request.onerror?.(), 0)
        request.error = new Error('站点数据被禁用')
        return request
      },
    }
    try {
      const backend = await getBackend()
      expect(backend.kind).toBe('memory')
      expect(storageAvailable()).toBe(false)
      // 节假日缓存降级后仍要在本次会话内可用
      await put(STORE_META, { key: 'holidaySyncAt', value: 9 })
      expect((await get(STORE_META, 'holidaySyncAt')).value).toBe(9)
    } finally {
      globalThis.indexedDB = original
      resetBackendForTests()
    }
  })
})

describe('meta 存的是天数序号，与 Android 同构', () => {
  it('整数天数序号原样读写', async () => {
    const day = toDayNumber(2026, 9, 5)
    await put(STORE_META, { key: 'dayProbe', value: day })
    const record = await get(STORE_META, 'dayProbe')
    expect(record.value).toBe(day)
    expect(Number.isInteger(record.value)).toBe(true)
  })
})

describe('老数据迁移源必须保持可读（别删这个 store）', () => {
  it('schedules store 仍然存在，读空库返回空数组而不抛', async () => {
    // 这条不是凑数：idb.js 里的 DB_VERSION 与 STORES 一旦被"清理"掉，
    // 浏览器里那份老数据就变成孤儿对象仓库，没法再搬进 MySQL 了。
    const all = await getAll(STORE_SCHEDULES)
    expect(Array.isArray(all)).toBe(true)
  })

  it('老数据仍能原样读回', async () => {
    await put(STORE_SCHEDULES, { id: 1, title: '老数据', startDay: 20731, endDay: 20735, color: 2 })
    const all = await getAll(STORE_SCHEDULES)
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('老数据')
  })
})
