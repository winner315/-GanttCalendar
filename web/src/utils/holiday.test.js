import { describe, expect, it } from 'vitest'
import builtInRaw from '../data/holidays.json'
import { parseDay, toDayNumber } from './date.js'
import {
  HOLIDAY,
  WEEKEND,
  WORKDAY,
  badgeColorVar,
  isRest,
  badgeText,
  badges,
  badgesInRange,
  clearDownloaded,
  coveredYears,
  forYear,
  inRange,
  parse,
  setDownloaded,
} from './holiday.js'

const D = (text) => parseDay(text)

// 断言移植自 Android 版 app/src/test/java/com/gather/ganttcalendar/data/HolidayDataTest.kt
describe('parse', () => {
  it('区分放假日与补班日', () => {
    const map = parse(
      JSON.stringify({
        year: 2026,
        days: [
          { name: '元旦', date: '2026-01-01', isOffDay: true },
          { name: '春节', date: '2026-02-14', isOffDay: false },
        ],
      })
    )
    expect(map.size).toBe(2)
    expect(map.get(D('2026-01-01'))).toEqual({ dayNumber: D('2026-01-01'), name: '元旦', isWorkday: false })
    expect(map.get(D('2026-02-14'))).toEqual({ dayNumber: D('2026-02-14'), name: '春节', isWorkday: true })
  })

  it('遇到坏数据返回空表而不抛异常', () => {
    expect(parse('不是 JSON').size).toBe(0)
    expect(parse('{"year":2026}').size).toBe(0)
    expect(parse('{"days":[]}').size).toBe(0)
    expect(parse(null).size).toBe(0)
    expect(parse(undefined).size).toBe(0)
    expect(parse({ days: 'nonsense' }).size).toBe(0)
    expect(parse({ days: [null, 'x', 1] }).size).toBe(0)
  })

  it('跳过日期非法的记录', () => {
    const map = parse(
      JSON.stringify({
        days: [
          { name: '瞎写', date: '2026-13-45', isOffDay: true },
          { name: '元旦', date: '2026-01-01', isOffDay: true },
        ],
      })
    )
    expect(map.size).toBe(1)
    expect(map.has(D('2026-01-01'))).toBe(true)
  })

  it('缺 isOffDay 时按休息处理', () => {
    const map = parse(JSON.stringify({ days: [{ name: '元旦', date: '2026-01-01' }] }))
    expect(map.get(D('2026-01-01')).isWorkday).toBe(false)
  })

  it('缺 name 时留空而不崩', () => {
    const map = parse(JSON.stringify({ days: [{ date: '2026-01-01', isOffDay: true }] }))
    expect(map.get(D('2026-01-01')).name).toBe('')
  })
})

describe('badges', () => {
  it('标出法定假日与补班日', () => {
    // 2026-10-01 周四（休）、10-04 周日（法定假）、10-10 周六（补班）、10-12 周一（普通工作日）
    const data = parse(
      JSON.stringify({
        days: [
          { name: '国庆节', date: '2026-10-01', isOffDay: true },
          { name: '国庆节', date: '2026-10-04', isOffDay: true },
          { name: '国庆节', date: '2026-10-10', isOffDay: false },
        ],
      })
    )
    const result = badges(data, new Set([2026]), D('2026-10-01'), D('2026-10-12'))
    expect(result.get(D('2026-10-01'))).toBe(HOLIDAY)
    // 10-04 是周日，但数据说它是法定假 —— 数据优先，标法定假而不是普通周末
    expect(result.get(D('2026-10-04'))).toBe(HOLIDAY)
    expect(result.get(D('2026-10-10'))).toBe(WORKDAY)
    expect(result.has(D('2026-10-12'))).toBe(false)
  })

  it('在数据覆盖的年份里把普通周末标成休息', () => {
    // 2026-10-11 周日、10-17/18 周六日，10-19 周一
    const result = badges(new Map(), new Set([2026]), D('2026-10-11'), D('2026-10-31'))
    expect(result.get(D('2026-10-11'))).toBe(WEEKEND)
    expect(result.get(D('2026-10-17'))).toBe(WEEKEND)
    expect(result.get(D('2026-10-18'))).toBe(WEEKEND)
    expect(result.has(D('2026-10-19'))).toBe(false)
  })

  it('对没有数据的年份不猜', () => {
    // 2027 年数据还没发布：周末也不标，免得把补班的周六错标成休息
    const result = badges(new Map(), new Set([2025, 2026]), D('2027-01-02'), D('2027-01-31'))
    expect(result.size).toBe(0)
  })

  it('跨年区间两年都各自按自己的覆盖情况标注', () => {
    const data = parse(JSON.stringify({ days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }))
    const result = badges(data, new Set([2026]), D('2026-12-31'), D('2027-01-03'))
    // 2026 有数据 → 12-31 是周四不标；2027 没数据 → 周末也不标
    expect(result.has(D('2026-12-31'))).toBe(false)
    expect(result.get(D('2027-01-01'))).toBe(HOLIDAY)
    expect(result.has(D('2027-01-02'))).toBe(false)
  })
})

describe('内置数据自检（防止手抄/合并时把日期写错）', () => {
  it('覆盖 2025-2026 两年', () => {
    expect(builtInRaw.years).toEqual([2025, 2026])
    const years = new Set([...parse(builtInRaw).keys()].map((d) => new Date(d * 86400000).getUTCFullYear()))
    expect([...years].sort()).toEqual([2025, 2026])
  })

  it('2026 国庆：10/1~10/7 放假，10/10 补班', () => {
    const map = parse(builtInRaw)
    expect(map.get(D('2026-10-01')).isWorkday).toBe(false)
    expect(map.get(D('2026-10-07')).isWorkday).toBe(false)
    expect(map.get(D('2026-10-10')).isWorkday).toBe(true)
    expect(map.get(D('2026-10-01')).name).toBe('国庆节')
  })

  it('2026 春节：2/15~2/23 放假，2/14 与 2/28 补班', () => {
    const map = parse(builtInRaw)
    expect(map.get(D('2026-02-15')).isWorkday).toBe(false)
    expect(map.get(D('2026-02-14')).isWorkday).toBe(true)
    expect(map.get(D('2026-02-28')).isWorkday).toBe(true)
  })

  it('2025 元旦只放 1 天，1/26 是春节前的补班日', () => {
    const map = parse(builtInRaw)
    expect(map.get(D('2025-01-01')).isWorkday).toBe(false)
    expect(map.get(D('2025-01-26')).isWorkday).toBe(true)
  })

  it('节假日的 name 字段都有值', () => {
    for (const [, holiday] of parse(builtInRaw)) {
      expect(holiday.name.length, `${holiday.dayNumber} 缺名称`).toBeGreaterThan(0)
    }
  })
})

describe('forYear / coveredYears / inRange', () => {
  it('内置数据按年可取', () => {
    expect(forYear(2026).size).toBeGreaterThan(0)
    expect(forYear(2027).size).toBe(0)
  })

  it('coveredYears 只包含真正有数据的年份', () => {
    expect([...coveredYears(D('2025-12-01'), D('2027-01-31'))].sort()).toEqual([2025, 2026])
  })

  it('inRange 只保留区间内的日子', () => {
    const got = inRange(D('2026-10-01'), D('2026-10-03'))
    expect(got.size).toBe(3)
    expect(got.has(D('2026-10-07'))).toBe(false)
  })

  it('setDownloaded 对无效数据不缓存', () => {
    clearDownloaded()
    expect(setDownloaded(2030, '不是 JSON')).toBe(false)
    expect(forYear(2030).size).toBe(0)
  })

  it('下载的数据优先于内置数据', () => {
    clearDownloaded()
    // 假设 2027 年安排发布：下载后 2027 就有数据了，普通周末才会被标注
    const ok = setDownloaded(
      2027,
      JSON.stringify({ days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] })
    )
    expect(ok).toBe(true)
    const result = badgesInRange(D('2027-01-01'), D('2027-01-03'))
    expect(result.get(D('2027-01-01'))).toBe(HOLIDAY)
    // 有数据了 → 2027-01-02 周六标普通周末
    expect(result.get(D('2027-01-02'))).toBe(WEEKEND)
    clearDownloaded()
    expect(badgesInRange(D('2027-01-01'), D('2027-01-03')).size).toBe(0)
  })
})

describe('badgesInRange 端到端（走内置数据）', () => {
  it('2026-10 整月：法定假红、普通周末灰、补班蓝三类都能出现', () => {
    const result = badgesInRange(toDayNumber(2026, 10, 1), toDayNumber(2026, 10, 31))
    expect(result.get(D('2026-10-01'))).toBe(HOLIDAY)
    expect(result.get(D('2026-10-07'))).toBe(HOLIDAY)
    expect(result.get(D('2026-10-10'))).toBe(WORKDAY)
    expect(result.get(D('2026-10-11'))).toBe(WEEKEND)
    expect(result.has(D('2026-10-12'))).toBe(false)
  })

  it('2027 年（无数据）整月不产生任何角标', () => {
    expect(badgesInRange(toDayNumber(2027, 3, 1), toDayNumber(2027, 3, 31)).size).toBe(0)
  })
})

describe('角标文案与颜色', () => {
  it('休 / 班 两种文案', () => {
    expect(badgeText(HOLIDAY)).toBe('休')
    expect(badgeText(WEEKEND)).toBe('休')
    expect(badgeText(WORKDAY)).toBe('班')
    expect(badgeText(undefined)).toBe('')
  })

  it('休息的两态共用一种默认色，补班单独一色', () => {
    expect(badgeColorVar(HOLIDAY)).toBe('--rest-badge-text')
    expect(badgeColorVar(WEEKEND)).toBe('--rest-badge-text')
    expect(badgeColorVar(WORKDAY)).toBe('--workday-badge-text')
  })

  it('无法识别的值按休息色处理（不返回 undefined 变量名）', () => {
    expect(badgeColorVar(undefined)).toBe('--rest-badge-text')
  })
})

describe('isRest', () => {
  it('法定假与普通周末都算休息', () => {
    expect(isRest(HOLIDAY)).toBe(true)
    expect(isRest(WEEKEND)).toBe(true)
  })

  it('补班不算休息，无角标也不算', () => {
    expect(isRest(WORKDAY)).toBe(false)
    expect(isRest(undefined)).toBe(false)
  })
})
