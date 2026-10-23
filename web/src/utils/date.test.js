import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  firstDayOffset,
  formatDay,
  formatMonthDay,
  fromDayNumber,
  monthEnd,
  monthStart,
  monthTitle,
  parseDay,
  shiftDay,
  shiftMonth,
  spanDays,
  toDayNumber,
  todayDayNumber,
  weekEnd,
  weekStart,
  weekdayIndex,
} from './date.js'

// 断言移植自 Android 版 app/src/test/java/com/gather/ganttcalendar/util/DateUtilsTest.kt
describe('DateUtils 移植断言', () => {
  it('daysInMonth 普通月是 30 天', () => {
    expect(daysInMonth(2026, 9)).toBe(30)
  })

  it('daysInMonth 闰年二月是 29 天', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })

  it('daysInMonth 平年二月是 28 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('monthStart 是 1 号', () => {
    expect(monthStart(2026, 9)).toBe(toDayNumber(2026, 9, 1))
  })

  it('monthEnd 是最后一天', () => {
    expect(monthEnd(2026, 9)).toBe(toDayNumber(2026, 9, 30))
  })

  it('monthTitle 格式为 2026年9月', () => {
    expect(monthTitle(2026, 9)).toBe('2026年9月')
  })

  it('shiftMonth 前进跨年', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('shiftMonth 后退跨年', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })

  it('shiftMonth 多个月份偏移', () => {
    expect(shiftMonth(2026, 3, 13)).toEqual({ year: 2027, month: 4 })
    expect(shiftMonth(2026, 3, -13)).toEqual({ year: 2025, month: 2 })
  })
})

describe('天数序号与公历互转', () => {
  it('1970-01-01 是 0', () => {
    expect(toDayNumber(1970, 1, 1)).toBe(0)
  })

  it('互转可往返', () => {
    const day = toDayNumber(2026, 10, 23)
    expect(fromDayNumber(day)).toEqual({ year: 2026, month: 10, day: 23 })
  })

  it('晚于 1970 的日期为正数，早于为负数', () => {
    expect(toDayNumber(2026, 1, 1)).toBeGreaterThan(0)
    expect(toDayNumber(1969, 12, 31)).toBe(-1)
  })

  it('跨年连续：12-31 的下一天是次年 1-1', () => {
    expect(shiftDay(toDayNumber(2026, 12, 31), 1)).toBe(toDayNumber(2027, 1, 1))
  })

  it('不受本地时区影响（与 UTC 基准一致）', () => {
    // 无论 TZ 设成什么，dayNumber 都由 Date.UTC 决定
    expect(toDayNumber(2026, 3, 1)).toBe(Date.UTC(2026, 2, 1) / 86400000)
  })

  it('todayDayNumber 等于本地今天', () => {
    const now = new Date()
    expect(todayDayNumber()).toBe(toDayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate()))
  })
})

describe('周边界（周一起始）', () => {
  // 2026-08-31 是周一，2026-09-06 是周日
  it('weekdayIndex 周一为 0、周日为 6', () => {
    expect(weekdayIndex(toDayNumber(2026, 8, 31))).toBe(0)
    expect(weekdayIndex(toDayNumber(2026, 9, 6))).toBe(6)
    expect(weekdayIndex(toDayNumber(2026, 9, 5))).toBe(5)
  })

  it('firstDayOffset：2026-09-01 是周二', () => {
    expect(firstDayOffset(2026, 9)).toBe(1)
  })

  it('同一周的任意一天得到同一个周起点', () => {
    const monday = toDayNumber(2026, 8, 31)
    const sunday = toDayNumber(2026, 9, 6)
    expect(weekStart(sunday)).toBe(monday)
    expect(weekEnd(monday)).toBe(sunday)
  })

  it('跨月周：9-01（周二）所在周从 8-31 起', () => {
    expect(weekStart(toDayNumber(2026, 9, 1))).toBe(toDayNumber(2026, 8, 31))
  })

  it('跨年周：2027-01-01（周五）所在周从 2026-12-28 起', () => {
    expect(weekStart(toDayNumber(2027, 1, 1))).toBe(toDayNumber(2026, 12, 28))
  })
})

describe('格式化与解析', () => {
  it('formatDay 补零', () => {
    expect(formatDay(toDayNumber(2026, 9, 5))).toBe('2026-09-05')
  })

  it('formatMonthDay 不补零', () => {
    expect(formatMonthDay(toDayNumber(2026, 9, 5))).toBe('9月5日')
  })

  it('parseDay 往返一致', () => {
    expect(parseDay('2026-09-05')).toBe(toDayNumber(2026, 9, 5))
  })

  it('parseDay 对坏数据返回 null 而不抛异常', () => {
    expect(parseDay('2026-9-5')).toBeNull()
    expect(parseDay('2026-13-01')).toBeNull()
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('')).toBeNull()
    expect(parseDay(null)).toBeNull()
    expect(parseDay(undefined)).toBeNull()
    expect(parseDay('随便写的')).toBeNull()
  })

  it('parseDay 接受闰年 2-29', () => {
    expect(parseDay('2024-02-29')).toBe(toDayNumber(2024, 2, 29))
  })
})

describe('spanDays', () => {
  it('同一天算 1 天', () => {
    expect(spanDays(toDayNumber(2026, 9, 5), toDayNumber(2026, 9, 5))).toBe(1)
  })

  it('跨月正确', () => {
    expect(spanDays(toDayNumber(2026, 8, 28), toDayNumber(2026, 9, 3))).toBe(7)
  })

  it('起止颠倒时兜底为 1，不返回负数', () => {
    expect(spanDays(toDayNumber(2026, 9, 10), toDayNumber(2026, 9, 5))).toBe(1)
  })
})
