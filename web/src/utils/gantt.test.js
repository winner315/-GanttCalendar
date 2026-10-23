import { describe, expect, it } from 'vitest'
import { toDayNumber } from './date.js'
import { calculateBars, daysFromPixels, laneCount, moveBy, overlaps, resizeEnd } from './gantt.js'

function s(title, y1, m1, d1, y2, m2, d2, color = 0) {
  return {
    id: title,
    title,
    startDay: toDayNumber(y1, m1, d1),
    endDay: toDayNumber(y2, m2, d2),
    color,
  }
}

const SEP = { start: toDayNumber(2026, 9, 1), end: toDayNumber(2026, 9, 30) }

// 断言移植自 Android 版 GanttLayoutCalculatorTest.kt
describe('GanttLayoutCalculator 移植断言', () => {
  it('跨月日程裁剪到本月', () => {
    const bars = calculateBars([s('跨月', 2026, 8, 28, 2026, 9, 3)], SEP.start, SEP.end)
    expect(bars).toHaveLength(1)
    expect(bars[0].startDay).toBe(toDayNumber(2026, 9, 1))
    expect(bars[0].endDay).toBe(toDayNumber(2026, 9, 3))
  })

  it('重叠的日程分到不同泳道', () => {
    const bars = calculateBars(
      [s('A', 2026, 9, 1, 2026, 9, 10), s('B', 2026, 9, 5, 2026, 9, 15)],
      SEP.start,
      SEP.end
    )
    expect(bars.find((b) => b.schedule.title === 'A').lane).toBe(0)
    expect(bars.find((b) => b.schedule.title === 'B').lane).toBe(1)
  })

  it('不重叠的日程复用同一泳道', () => {
    const bars = calculateBars(
      [s('A', 2026, 9, 1, 2026, 9, 3), s('B', 2026, 9, 4, 2026, 9, 6)],
      SEP.start,
      SEP.end
    )
    expect(bars.find((b) => b.schedule.title === 'B').lane).toBe(0)
    expect(laneCount(bars)).toBe(1)
  })

  it('区间外的日程被排除', () => {
    expect(calculateBars([s('旧', 2026, 7, 1, 2026, 7, 5)], SEP.start, SEP.end)).toHaveLength(0)
  })
})

describe('泳道分配的边界情形', () => {
  it('相邻两天不算重叠：5 号结束、6 号开始可同泳道', () => {
    const bars = calculateBars(
      [s('A', 2026, 9, 1, 2026, 9, 5), s('B', 2026, 9, 6, 2026, 9, 8)],
      SEP.start,
      SEP.end
    )
    expect(laneCount(bars)).toBe(1)
  })

  it('同一天开始的多条日程各占一条泳道', () => {
    const bars = calculateBars(
      [s('A', 2026, 9, 1, 2026, 9, 3), s('B', 2026, 9, 1, 2026, 9, 3), s('C', 2026, 9, 1, 2026, 9, 3)],
      SEP.start,
      SEP.end
    )
    expect(laneCount(bars)).toBe(3)
  })

  it('同一天 20 条日程 → 20 条泳道（web 版不设 3 条上限）', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`N${i}`, 2026, 9, 10, 2026, 9, 12))
    expect(laneCount(calculateBars(many, SEP.start, SEP.end))).toBe(20)
  })

  it('首尾相接的链式排列压回一条泳道', () => {
    const chain = Array.from({ length: 10 }, (_, i) => {
      const d = i * 3 + 1
      return s(`C${i}`, 2026, 9, d, 2026, 9, d + 1)
    })
    expect(laneCount(calculateBars(chain, SEP.start, SEP.end))).toBe(1)
  })

  it('跨年日程（365 天）在年区间内不裁剪', () => {
    const bars = calculateBars(
      [s('全年', 2026, 1, 1, 2026, 12, 31)],
      toDayNumber(2026, 1, 1),
      toDayNumber(2026, 12, 31)
    )
    expect(bars[0].startDay).toBe(toDayNumber(2026, 1, 1))
    expect(bars[0].endDay).toBe(toDayNumber(2026, 12, 31))
  })

  it('周区间：跨月那周两侧都能裁到', () => {
    // 2026-08-31 周一 ~ 2026-09-06 周日
    const ws = toDayNumber(2026, 8, 31)
    const we = toDayNumber(2026, 9, 6)
    const bars = calculateBars([s('跨月周', 2026, 8, 28, 2026, 9, 3)], ws, we)
    expect(bars[0].startDay).toBe(ws)
    expect(bars[0].endDay).toBe(toDayNumber(2026, 9, 3))
  })
})

describe('overlaps', () => {
  it('完全在外的不相交', () => {
    expect(overlaps(s('x', 2026, 7, 1, 2026, 7, 5), SEP.start, SEP.end)).toBe(false)
  })

  it('端点相接算相交', () => {
    expect(overlaps(s('x', 2026, 8, 1, 2026, 9, 1), SEP.start, SEP.end)).toBe(true)
  })
})

describe('拖拽改期的钳制', () => {
  const base = s('拖我', 2026, 9, 5, 2026, 9, 10)

  it('平移同时改起止', () => {
    expect(moveBy(base, 2)).toMatchObject({
      startDay: toDayNumber(2026, 9, 7),
      endDay: toDayNumber(2026, 9, 12),
    })
  })

  it('负向平移同样有效', () => {
    expect(moveBy(base, -4)).toMatchObject({
      startDay: toDayNumber(2026, 9, 1),
      endDay: toDayNumber(2026, 9, 6),
    })
  })

  it('平移不改变工期', () => {
    const moved = moveBy(base, 30)
    expect(moved.endDay - moved.startDay).toBe(base.endDay - base.startDay)
  })

  it('拖右边缘只改结束日', () => {
    const resized = resizeEnd(base, 3)
    expect(resized.startDay).toBe(base.startDay)
    expect(resized.endDay).toBe(toDayNumber(2026, 9, 13))
  })

  it('结束日不能早于开始日', () => {
    const resized = resizeEnd(base, -100)
    expect(resized.endDay).toBe(base.startDay)
  })

  it('拖到只剩 1 天仍合法', () => {
    const resized = resizeEnd(base, -5)
    expect(resized.endDay).toBe(resized.startDay)
  })

  it('平移不钳制——越界由视图决定是否允许', () => {
    // 拖出本月仍然是合法的数据，只是视图中会被裁掉；截断数据才是错的
    const moved = moveBy(base, 40)
    expect(moved.startDay).toBe(toDayNumber(2026, 10, 15))
  })
})

describe('daysFromPixels', () => {
  it('按天宽折算并四舍五入', () => {
    expect(daysFromPixels(100, 50)).toBe(2)
    expect(daysFromPixels(74, 50)).toBe(1)
    expect(daysFromPixels(76, 50)).toBe(2)
  })

  it('负位移得到负天数', () => {
    expect(daysFromPixels(-100, 50)).toBe(-2)
  })

  it('天宽为 0 或非法时返回 0，不做除零', () => {
    expect(daysFromPixels(100, 0)).toBe(0)
    expect(daysFromPixels(100, -1)).toBe(0)
    expect(daysFromPixels(100, undefined)).toBe(0)
  })
})
