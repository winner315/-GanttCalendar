import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { STORE_SCHEDULES, clearStore, getBackend, put, resetBackendForTests } from '../utils/idb.js'
import { toDayNumber } from '../utils/date.js'
import { sanitizeAll, sanitizeSchedule } from '../utils/schedule.js'

beforeEach(async () => {
  resetBackendForTests()
  await getBackend()
  await clearStore(STORE_SCHEDULES)
  // store 是模块级单例，跨用例会残留；清完库再 load 一次把内存也归零
  const { load } = await import('./schedule.js')
  await load()
})

describe('schedule store 增删改查', () => {
  it('初始为空', async () => {
    const { scheduleState, load } = await import('./schedule.js')
    await load()
    expect(scheduleState.schedules).toHaveLength(0)
    expect(scheduleState.loaded).toBe(true)
  })

  it('新增后能读回，且按开始时间排序', async () => {
    const { addSchedule, load, scheduleState } = await import('./schedule.js')
    await load()
    await addSchedule({ title: '晚的', startDay: toDayNumber(2026, 9, 10), endDay: toDayNumber(2026, 9, 12), color: 1 })
    await addSchedule({ title: '早的', startDay: toDayNumber(2026, 9, 1), endDay: toDayNumber(2026, 9, 3), color: 0 })
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['早的', '晚的'])
  })

  it('更新后内存与存储层一致', async () => {
    const { addSchedule, updateSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    await updateSchedule({ ...saved, title: '改过了' })
    expect(scheduleState.schedules[0].title).toBe('改过了')
    const stored = await (await getBackend()).getAll(STORE_SCHEDULES)
    expect(stored[0].title).toBe('改过了')
  })

  it('删除后内存与存储层都不再有', async () => {
    const { addSchedule, removeSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    await removeSchedule(saved.id)
    expect(scheduleState.schedules).toHaveLength(0)
    expect(await (await getBackend()).getAll(STORE_SCHEDULES)).toHaveLength(0)
  })

  it('重新 load 能拿回上次写入的数据（模拟刷新页面）', async () => {
    const { addSchedule, load, scheduleState } = await import('./schedule.js')
    await addSchedule({ title: '持久化的', startDay: 5, endDay: 6, color: 3 })
    await load()
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['持久化的'])
  })

  it('删除不存在的 id 返回 false，不抛异常', async () => {
    const { removeSchedule } = await import('./schedule.js')
    expect(await removeSchedule(99999)).toBe(false)
  })

  it('更新不存在的 id 返回 null，不抛异常', async () => {
    const { updateSchedule } = await import('./schedule.js')
    expect(await updateSchedule({ id: 99999, title: 'X', startDay: 1, endDay: 2, color: 0 })).toBeNull()
  })

  it('非法数据被拒绝', async () => {
    const { addSchedule } = await import('./schedule.js')
    await expect(addSchedule({ title: '', startDay: 1, endDay: 2, color: 0 })).rejects.toThrow()
    await expect(addSchedule({ title: 'X', startDay: 5, endDay: 1, color: 0 })).rejects.toThrow()
  })
})

describe('脏数据与降级', () => {
  it('加载时跳过非法条目并计数，不崩溃', async () => {
    const { load, scheduleState } = await import('./schedule.js')
    await put(STORE_SCHEDULES, { id: 1, title: '好数据', startDay: 10, endDay: 12, color: 0 })
    await put(STORE_SCHEDULES, { id: 2, title: '', startDay: 1, endDay: 2, color: 0 })
    await put(STORE_SCHEDULES, { id: 3, title: '缺字段' })
    await put(STORE_SCHEDULES, { id: 4, title: '起止颠倒', startDay: 5, endDay: 1, color: 0 })
    await put(STORE_SCHEDULES, { id: 5, title: '日期离谱', startDay: 1e9, endDay: 1e9 + 1, color: 0 })
    await load()
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['好数据'])
    expect(scheduleState.skippedOnLoad).toBe(4)
  })

  it('超出调色板的 color 被钳到合法范围', async () => {
    const { load, scheduleState } = await import('./schedule.js')
    await put(STORE_SCHEDULES, { id: 1, title: '越界色', startDay: 1, endDay: 2, color: 99 })
    await load()
    expect(scheduleState.schedules[0].color).toBe(7)
  })
})

describe('导入的合并与覆盖', () => {
  it('replaceAll 清空后写入，并报告跳过的条数', async () => {
    const { addSchedule, replaceAll, scheduleState } = await import('./schedule.js')
    await addSchedule({ title: '旧的', startDay: 1, endDay: 2, color: 0 })
    const result = await replaceAll([
      { title: '新的', startDay: 10, endDay: 12, color: 1 },
      { title: '', startDay: 1, endDay: 2, color: 0 },
    ])
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['新的'])
  })

  it('mergeAll 按标题+起止去重', async () => {
    const { addSchedule, mergeAll, scheduleState } = await import('./schedule.js')
    await addSchedule({ title: '已有', startDay: 10, endDay: 12, color: 0 })
    const result = await mergeAll([
      { title: '已有', startDay: 10, endDay: 12, color: 0 },
      { title: '新的', startDay: 20, endDay: 22, color: 1 },
    ])
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(scheduleState.schedules).toHaveLength(2)
  })

  it('mergeAll 接受日期字符串写法', async () => {
    const { mergeAll, scheduleState } = await import('./schedule.js')
    const result = await mergeAll([{ title: '字符串日期', startDate: '2026-09-05', endDate: '2026-09-08', color: 2 }])
    expect(result.imported).toBe(1)
    const saved = scheduleState.schedules.find((s) => s.title === '字符串日期')
    expect(saved.startDay).toBe(toDayNumber(2026, 9, 5))
    expect(saved.endDay).toBe(toDayNumber(2026, 9, 8))
  })
})

describe('sanitizeSchedule', () => {
  it('接受合法数据', () => {
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })).toEqual({
      title: 'A',
      startDay: 1,
      endDay: 2,
      color: 0,
    })
  })

  it('标题两端空白被去掉', () => {
    expect(sanitizeSchedule({ title: '  A  ', startDay: 1, endDay: 2, color: 0 }).title).toBe('A')
  })

  it('同一天起止合法（1 天日程）', () => {
    expect(sanitizeSchedule({ title: 'A', startDay: 5, endDay: 5, color: 0 })).not.toBeNull()
  })

  it('各种坏数据返回 null', () => {
    expect(sanitizeSchedule(null)).toBeNull()
    expect(sanitizeSchedule('字符串')).toBeNull()
    expect(sanitizeSchedule({})).toBeNull()
    expect(sanitizeSchedule({ title: 'A', startDay: 5.5, endDay: 6, color: 0 })).toBeNull()
    expect(sanitizeSchedule({ title: 'A', startDay: '5', endDay: '6', color: 0 })).toBeNull()
    expect(sanitizeSchedule({ title: 'A', startDay: 1e9, endDay: 1e9, color: 0 })).toBeNull()
  })

  it('color 缺省为 0，负数钳到 0', () => {
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2 }).color).toBe(0)
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, color: -3 }).color).toBe(0)
  })

  it('sanitizeAll 统计跳过条数', () => {
    const { valid, skipped } = sanitizeAll([
      { title: 'A', startDay: 1, endDay: 2, color: 0 },
      null,
      { title: 'B', startDay: 3, endDay: 4, color: 1 },
    ])
    expect(valid).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  it('非数组输入当作空表', () => {
    expect(sanitizeAll(null)).toEqual({ valid: [], skipped: 0 })
  })
})
