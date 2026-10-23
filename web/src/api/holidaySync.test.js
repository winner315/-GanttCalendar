/**
 * 节假日联网同步的测试。
 * 关注三件事：24h 节流、拉到的数据被真的用上、任何失败都静默回退内置数据。
 * 用 fake-indexeddb 提供 meta 表，注入假 fetch 控制返回。
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forceRefresh, refreshIfStale, setFetchForTests } from './holidaySync.js'
import { clearDownloaded, forYear } from '../utils/holiday.js'
import { toDayNumber } from '../utils/date.js'
import { STORE_META, get, put, resetBackendForTests } from '../utils/idb.js'

const YEAR = new Date().getFullYear()

/** 造一份 holiday-cn 格式的响应 */
const doc = (year, days) => JSON.stringify({ year, days, papers: [] })

function okResponse(body) {
  return { ok: true, text: async () => body }
}

function badResponse(status = 404) {
  return { ok: false, status, text: async () => '' }
}

const DAYS = [
  { name: '国庆节', date: `${YEAR}-10-01`, isOffDay: true },
  { name: '国庆节后补班', date: `${YEAR}-10-10`, isOffDay: false },
]

beforeEach(async () => {
  resetBackendForTests()
  clearDownloaded()
  setFetchForTests(null)
  // 清掉节流时间戳，让每个用例都从「该刷新了」开始
  try {
    await put(STORE_META, { key: 'holidaySyncAt', value: 0 })
  } catch {
    /* 忽略 */
  }
})

describe('refreshIfStale', () => {
  it('拉到数据后当年表里有这一天（下载数据优先于内置）', async () => {
    const fetchImpl = vi.fn(async () => okResponse(doc(YEAR, DAYS)))
    setFetchForTests(fetchImpl)
    const changed = await refreshIfStale({ now: Date.now() })
    expect(changed).toBe(true)
    expect(fetchImpl).toHaveBeenCalled()
    const table = forYear(YEAR)
    expect(table.size).toBe(2)
    const oct10 = table.get(toDayNumber(YEAR, 10, 10))
    expect(oct10).toMatchObject({ name: '国庆节后补班', isWorkday: true })
    const oct1 = table.get(toDayNumber(YEAR, 10, 1))
    expect(oct1).toMatchObject({ name: '国庆节', isWorkday: false })
  })

  it('24h 内第二次调用直接跳过，不再发请求', async () => {
    const fetchImpl = vi.fn(async () => okResponse(doc(YEAR, DAYS)))
    setFetchForTests(fetchImpl)
    const now = Date.now()
    await refreshIfStale({ now })
    const callsAfterFirst = fetchImpl.mock.calls.length
    const changed = await refreshIfStale({ now: now + 60 * 60 * 1000 })
    expect(changed).toBe(false)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst)
  })

  it('超过 24h 会重新拉', async () => {
    const fetchImpl = vi.fn(async () => okResponse(doc(YEAR, DAYS)))
    setFetchForTests(fetchImpl)
    const now = Date.now()
    await refreshIfStale({ now })
    const callsAfterFirst = fetchImpl.mock.calls.length
    await refreshIfStale({ now: now + 25 * 60 * 60 * 1000 })
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('失败也要落时间戳：不能每次进页面都去请求', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    setFetchForTests(fetchImpl)
    const now = Date.now()
    const changed = await refreshIfStale({ now })
    expect(changed).toBe(false)
    const record = await get(STORE_META, 'holidaySyncAt')
    expect(record?.value).toBe(now)
  })

  it('断网时不抛异常，内置数据照常可用', async () => {
    setFetchForTests(async () => {
      throw new Error('offline')
    })
    await expect(refreshIfStale({ now: Date.now() })).resolves.toBe(false)
    // 内置数据覆盖 2025-2026，取 2026 应有内容
    expect(forYear(2026).size).toBeGreaterThan(0)
  })

  it('HTTP 非 200 视为失败', async () => {
    setFetchForTests(async () => badResponse(404))
    await expect(refreshIfStale({ now: Date.now() })).resolves.toBe(false)
  })

  it('响应不是 holiday-cn 结构（缺 days）视为失败，不污染已有数据', async () => {
    setFetchForTests(async () => okResponse('{"foo":1}'))
    await expect(refreshIfStale({ now: Date.now() })).resolves.toBe(false)
  })

  it('响应是坏 JSON 也不抛异常', async () => {
    setFetchForTests(async () => okResponse('不是 json'))
    await expect(refreshIfStale({ now: Date.now() })).resolves.toBe(false)
  })

  it('环境里没有 fetch 时静默返回 false', async () => {
    const original = globalThis.fetch
    // @ts-ignore 测试内故意摘掉
    globalThis.fetch = undefined
    try {
      await expect(refreshIfStale({ now: Date.now() })).resolves.toBe(false)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('forceRefresh', () => {
  it('绕过节流直接拉一次', async () => {
    const fetchImpl = vi.fn(async () => okResponse(doc(YEAR, DAYS)))
    setFetchForTests(fetchImpl)
    await expect(forceRefresh()).resolves.toBe(true)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(0)
  })

  it('全部失败时返回 false', async () => {
    setFetchForTests(async () => badResponse(500))
    await expect(forceRefresh()).resolves.toBe(false)
  })
})
