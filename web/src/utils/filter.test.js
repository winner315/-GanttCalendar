import { describe, expect, it } from 'vitest'
import { filterSchedules, hasActiveFilter, matchesColors, matchesKeyword, matchesRange } from './filter.js'
import { toDayNumber } from './date.js'

const s = (title, start, end, color = 0) => ({ title, startDay: start, endDay: end, color })

const list = [
  s('国庆放假', toDayNumber(2026, 10, 1), toDayNumber(2026, 10, 7), 0),
  s('版本迭代', toDayNumber(2026, 10, 5), toDayNumber(2026, 10, 10), 1),
  s('跨月批次', toDayNumber(2026, 9, 28), toDayNumber(2026, 10, 3), 1),
  s('年度复盘', toDayNumber(2026, 12, 20), toDayNumber(2026, 12, 31), 4),
]

describe('matchesKeyword', () => {
  it('空关键词不过滤', () => {
    expect(matchesKeyword(list[0], '')).toBe(true)
    expect(matchesKeyword(list[0], '   ')).toBe(true)
    expect(matchesKeyword(list[0], null)).toBe(true)
  })

  it('子串命中', () => {
    expect(matchesKeyword(list[0], '国庆')).toBe(true)
    expect(matchesKeyword(list[0], '放假')).toBe(true)
    expect(matchesKeyword(list[0], '元旦')).toBe(false)
  })

  it('标题缺失时不抛异常', () => {
    expect(matchesKeyword({}, 'x')).toBe(false)
  })
})

describe('matchesColors', () => {
  it('空数组不过滤', () => {
    expect(matchesColors(list[0], [])).toBe(true)
    expect(matchesColors(list[0], undefined)).toBe(true)
  })

  it('多选命中任一即可', () => {
    expect(matchesColors(list[1], [1, 4])).toBe(true)
    expect(matchesColors(list[0], [1, 4])).toBe(false)
  })

  it('第 0 号色也能被选中（0 不等于「未设置」）', () => {
    expect(matchesColors(list[0], [0])).toBe(true)
  })
})

describe('matchesRange', () => {
  it('两端都不限时全通过', () => {
    expect(matchesRange(list[3], null, null)).toBe(true)
  })

  it('相交即命中，不是包含', () => {
    const from = toDayNumber(2026, 10, 1)
    const to = toDayNumber(2026, 10, 31)
    // 9/28~10/03 跨月，与 10 月有交集 → 保留
    expect(matchesRange(list[2], from, to)).toBe(true)
    // 12 月那条完全在范围外 → 剔除
    expect(matchesRange(list[3], from, to)).toBe(false)
  })

  it('边界当天算命中', () => {
    const day = toDayNumber(2026, 10, 1)
    expect(matchesRange(list[0], day, day)).toBe(true)
    expect(matchesRange(s('x', day - 3, day - 1), day, day)).toBe(false)
  })

  it('只给一端也能用', () => {
    const from = toDayNumber(2026, 10, 1)
    expect(matchesRange(list[3], from, null)).toBe(true)
    expect(matchesRange(list[2], null, toDayNumber(2026, 9, 30))).toBe(true)
  })
})

describe('filterSchedules', () => {
  it('无条件时原样返回', () => {
    expect(filterSchedules(list, {})).toHaveLength(4)
    expect(filterSchedules(list)).toHaveLength(4)
  })

  it('三个条件是「与」的关系', () => {
    const out = filterSchedules(list, {
      keyword: '版本',
      colors: [1],
      from: toDayNumber(2026, 10, 1),
      to: toDayNumber(2026, 10, 31),
    })
    expect(out.map((x) => x.title)).toEqual(['版本迭代'])
  })

  it('关键词与颜色同时给出时任一不中即剔除', () => {
    expect(filterSchedules(list, { keyword: '版本', colors: [0] })).toHaveLength(0)
  })
})

describe('hasActiveFilter', () => {
  it('无条件为 false', () => {
    expect(hasActiveFilter({})).toBe(false)
    expect(hasActiveFilter({ keyword: '  ', colors: [] })).toBe(false)
  })

  it('任一条件存在为 true', () => {
    expect(hasActiveFilter({ keyword: '国' })).toBe(true)
    expect(hasActiveFilter({ colors: [2] })).toBe(true)
    expect(hasActiveFilter({ from: 0 })).toBe(true)
    expect(hasActiveFilter({ to: 0 })).toBe(true)
  })
})
