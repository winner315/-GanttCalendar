/**
 * schedule store 的测试。
 *
 * 存储层现在是后端 HTTP，所以用内存版假后端替换全局 fetch ——
 * 不起真实服务器、不需要数据库，测的仍是 store 的真实逻辑（校验、排序、去重、
 * 失败不降级）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toDayNumber } from '../utils/date.js'
import { sanitizeAll, sanitizeSchedule, STATUS_DOING } from '../utils/schedule.js'
import { createFakeServer, install } from './__fake-server.js'

let server

beforeEach(async () => {
  server = createFakeServer()
  vi.stubGlobal('fetch', (url, init) => {
    try {
      return Promise.resolve(server.fetch(url, init))
    } catch (e) {
      return Promise.reject(e)
    }
  })
  // store 是模块级单例，跨用例会残留；先清空假后端再 load 一次把内存归零
  const { load } = await import('./schedule.js')
  await load()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('schedule store 增删改查', () => {
  it('初始为空', async () => {
    const { scheduleState, load } = await import('./schedule.js')
    await load()
    expect(scheduleState.schedules).toHaveLength(0)
    expect(scheduleState.loaded).toBe(true)
    expect(scheduleState.persistent).toBe(true)
    expect(scheduleState.backendError).toBe('')
  })

  it('新增后能读回，且按开始时间排序', async () => {
    const { addSchedule, load, scheduleState } = await import('./schedule.js')
    await load()
    await addSchedule({ title: '晚的', startDay: toDayNumber(2026, 9, 10), endDay: toDayNumber(2026, 9, 12), color: 1 })
    await addSchedule({ title: '早的', startDay: toDayNumber(2026, 9, 1), endDay: toDayNumber(2026, 9, 3), color: 0 })
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['早的', '晚的'])
  })

  it('新增的 id 来自后端且是整数', async () => {
    const { addSchedule } = await import('./schedule.js')
    const saved = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    // 前端的改/删有 typeof id === 'number' 守卫，字符串 id 会让它们静默失效
    expect(Number.isInteger(saved.id)).toBe(true)
  })

  it('更新后内存与后端一致', async () => {
    const { addSchedule, updateSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    await updateSchedule({ ...saved, title: '改过了' })
    expect(scheduleState.schedules[0].title).toBe('改过了')
    expect(server.all()[0].title).toBe('改过了')
  })

  it('删除后内存与后端都不再有', async () => {
    const { addSchedule, removeSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    await removeSchedule(saved.id)
    expect(scheduleState.schedules).toHaveLength(0)
    expect(server.all()).toHaveLength(0)
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

  it('新增默认是「待办」，可以带状态写入', async () => {
    const { addSchedule, scheduleState } = await import('./schedule.js')
    const plain = await addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })
    expect(plain.status).toBe('todo')
    const doing = await addSchedule({ title: 'B', startDay: 3, endDay: 4, color: 0, status: STATUS_DOING })
    expect(doing.status).toBe('doing')
    expect(scheduleState.schedules.find((s) => s.title === 'B').status).toBe('doing')
  })
})

describe('后端不可用时不降级', () => {
  it('加载失败：不抛异常、清空列表、标记非持久并给出原因', async () => {
    const { addSchedule, load, scheduleState } = await import('./schedule.js')
    await addSchedule({ title: '先存一条', startDay: 1, endDay: 2, color: 0 })
    server.setDown(true)

    await expect(load()).resolves.toBeDefined() // 绝不抛：ListView 是 fire-and-forget 调用
    expect(scheduleState.persistent).toBe(false)
    expect(scheduleState.backendError).toBeTruthy()
    expect(scheduleState.schedules).toHaveLength(0)
    expect(scheduleState.loaded).toBe(true)
  })

  it('新增失败：抛错且内存不新增', async () => {
    const { addSchedule, scheduleState } = await import('./schedule.js')
    server.setDown(true)
    await expect(addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })).rejects.toThrow()
    expect(scheduleState.schedules).toHaveLength(0)
  })

  it('更新失败：抛错且内存保持旧值', async () => {
    const { addSchedule, updateSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: '旧值', startDay: 1, endDay: 2, color: 0 })
    server.setDown(true)
    await expect(updateSchedule({ ...saved, title: '新值' })).rejects.toThrow()
    expect(scheduleState.schedules[0].title).toBe('旧值')
  })

  it('删除失败：抛错且内存不变', async () => {
    const { addSchedule, removeSchedule, scheduleState } = await import('./schedule.js')
    const saved = await addSchedule({ title: '还在', startDay: 1, endDay: 2, color: 0 })
    server.setDown(true)
    await expect(removeSchedule(saved.id)).rejects.toThrow()
    expect(scheduleState.schedules).toHaveLength(1)
    expect(scheduleState.schedules[0].id).toBe(saved.id)
  })

  it('业务错误（ok:false）用后端给的中文文案', async () => {
    const { addSchedule } = await import('./schedule.js')
    server.setFailWith('日程数据不合法')
    await expect(addSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 })).rejects.toThrow(
      '日程数据不合法'
    )
  })

  it('恢复后重试能拿回数据', async () => {
    const { addSchedule, load, scheduleState } = await import('./schedule.js')
    await addSchedule({ title: '在的', startDay: 1, endDay: 2, color: 0 })
    server.setDown(true)
    await load()
    expect(scheduleState.persistent).toBe(false)
    server.setDown(false)
    await load()
    expect(scheduleState.persistent).toBe(true)
    expect(scheduleState.backendError).toBe('')
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['在的'])
  })
})

describe('脏数据', () => {
  it('加载时跳过非法条目并计数，不崩溃', async () => {
    const { load, scheduleState } = await import('./schedule.js')
    // 模拟别人手工 INSERT 进库的脏行
    server.seed([
      { id: 1, title: '好数据', startDay: 10, endDay: 12, color: 0 },
      { id: 2, title: '', startDay: 1, endDay: 2, color: 0 },
      { id: 3, title: '缺字段' },
      { id: 4, title: '起止颠倒', startDay: 5, endDay: 1, color: 0 },
      { id: 5, title: '日期离谱', startDay: 1e9, endDay: 1e9 + 1, color: 0 },
    ])
    await load()
    expect(scheduleState.schedules.map((s) => s.title)).toEqual(['好数据'])
    expect(scheduleState.skippedOnLoad).toBe(4)
  })

  it('超出调色板的 color 被钳到合法范围', async () => {
    const { load, scheduleState } = await import('./schedule.js')
    server.seed([{ id: 1, title: '越界色', startDay: 1, endDay: 2, color: 99 }])
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
    expect(server.all().map((s) => s.title)).toEqual(['新的'])
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

  it('mergeAll 只追加不清空', async () => {
    const { addSchedule, mergeAll } = await import('./schedule.js')
    await addSchedule({ title: '已有', startDay: 1, endDay: 2, color: 0 })
    await mergeAll([{ title: '追加', startDay: 5, endDay: 6, color: 0 }])
    expect(server.all().map((s) => s.title).sort()).toEqual(['已有', '追加'])
  })

  it('mergeAll 全是重复项时不发请求也不报错', async () => {
    const { addSchedule, mergeAll } = await import('./schedule.js')
    await addSchedule({ title: '已有', startDay: 1, endDay: 2, color: 0 })
    const result = await mergeAll([{ title: '已有', startDay: 1, endDay: 2, color: 0 }])
    expect(result).toEqual({ imported: 0, skipped: 1 })
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
      status: 'todo',
      note: '',
    })
  })

  it('备注缺失/非字符串归空串，字符串去空白', () => {
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0 }).note).toBe('')
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0, note: 3 }).note).toBe('')
    expect(
      sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, color: 0, note: '  客户催急  ' }).note
    ).toBe('客户催急')
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

  it('status 非法或缺省归 todo，不影响条目存活', () => {
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2 }).status).toBe('todo')
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, status: '???' }).status).toBe('todo')
    expect(sanitizeSchedule({ title: 'A', startDay: 1, endDay: 2, status: 'done' }).status).toBe('done')
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
