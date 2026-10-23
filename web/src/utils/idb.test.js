import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { STORE_SCHEDULES, clearStore, getAll, getBackend, resetBackendForTests, storageAvailable } from './idb.js'
import { toDayNumber } from './date.js'

beforeEach(async () => {
  resetBackendForTests()
  await getBackend()
  await clearStore(STORE_SCHEDULES)
})

describe('idb 基本往返', () => {
  it('写入后能读回，且自动分配 id', async () => {
    const { add } = await import('./idb.js')
    const saved = await add(STORE_SCHEDULES, { title: 'A', startDay: 1, endDay: 2, color: 0 })
    expect(saved.id).toBeGreaterThan(0)
    const all = await getAll(STORE_SCHEDULES)
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('A')
  })

  it('put 按 id 覆盖而不是新增', async () => {
    const { add, put } = await import('./idb.js')
    const saved = await add(STORE_SCHEDULES, { title: 'A', startDay: 1, endDay: 2, color: 0 })
    await put(STORE_SCHEDULES, { ...saved, title: 'A2' })
    const all = await getAll(STORE_SCHEDULES)
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('A2')
  })

  it('deleteById 删除指定记录', async () => {
    const { add, deleteById } = await import('./idb.js')
    const a = await add(STORE_SCHEDULES, { title: 'A', startDay: 1, endDay: 2, color: 0 })
    await add(STORE_SCHEDULES, { title: 'B', startDay: 3, endDay: 4, color: 1 })
    await deleteById(STORE_SCHEDULES, a.id)
    const all = await getAll(STORE_SCHEDULES)
    expect(all.map((s) => s.title)).toEqual(['B'])
  })

  it('clearStore 清空', async () => {
    const { add } = await import('./idb.js')
    await add(STORE_SCHEDULES, { title: 'A', startDay: 1, endDay: 2, color: 0 })
    await clearStore(STORE_SCHEDULES)
    expect(await getAll(STORE_SCHEDULES)).toHaveLength(0)
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
      const { add } = await import('./idb.js')
      await add(STORE_SCHEDULES, { title: '内存里的', startDay: 1, endDay: 2, color: 0 })
      expect(await getAll(STORE_SCHEDULES)).toHaveLength(1)
    } finally {
      globalThis.indexedDB = original
      resetBackendForTests()
    }
  })
})

describe('idb 存储的是天数序号，与 Android 同构', () => {
  it('startDay 存整数天数序号', async () => {
    const { add } = await import('./idb.js')
    const day = toDayNumber(2026, 9, 5)
    const saved = await add(STORE_SCHEDULES, { title: 'A', startDay: day, endDay: day + 5, color: 2 })
    const [read] = await getAll(STORE_SCHEDULES)
    expect(read.startDay).toBe(saved.startDay)
    expect(Number.isInteger(read.startDay)).toBe(true)
  })
})
