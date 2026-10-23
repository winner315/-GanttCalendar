/**
 * 甘特布局计算 —— 移植自 Android 版 `model/GanttLayoutCalculator.kt`。
 *
 * 与原版的区别只有两处，都是为了 web：
 *  1. 范围从「某年某月」泛化成任意 `[rangeStart, rangeEnd]` 天数序号区间，
 *     月视图、周视图、年视图共用同一套算法；
 *  2. bar 的 startDay / endDay 是**绝对天数序号**（不是「当月第几天」），
 *     由视图自己折算列偏移 —— 跨月拖动时绝对序号才不会因为换月而错位。
 *
 * 泳道分配沿用原版口径：按开始时间排序，找第一条「已经结束」的泳道复用，
 * 找不到就新开一条。相邻两天不算重叠（前一条 5 号结束、后一条 6 号开始，可同泳道）。
 */

/** 日程是否与给定区间有交集 */
export function overlaps(schedule, rangeStart, rangeEnd) {
  return schedule.startDay <= rangeEnd && schedule.endDay >= rangeStart
}

/**
 * 计算区间内的色带。
 * @returns {Array<{schedule, startDay, endDay, lane}>} startDay/endDay 已裁剪到区间内，且为绝对天数序号
 */
export function calculateBars(schedules, rangeStart, rangeEnd) {
  const sorted = schedules
    .filter((s) => overlaps(s, rangeStart, rangeEnd))
    .sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)

  /** 每条泳道当前已排到的最后一天 */
  const laneLastEnd = []
  const bars = []
  for (const s of sorted) {
    const startDay = Math.max(s.startDay, rangeStart)
    const endDay = Math.min(s.endDay, rangeEnd)
    let lane = laneLastEnd.findIndex((lastEnd) => lastEnd < startDay)
    if (lane === -1) {
      lane = laneLastEnd.length
      laneLastEnd.push(endDay)
    } else {
      laneLastEnd[lane] = endDay
    }
    bars.push({ schedule: s, startDay, endDay, lane })
  }
  return bars
}

/** 泳道总数（没有色带时为 0） */
export function laneCount(bars) {
  return bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0)
}

/** 整条平移：起止同时移动 [deltaDays]，可正可负 */
export function moveBy(schedule, deltaDays) {
  return {
    ...schedule,
    startDay: schedule.startDay + deltaDays,
    endDay: schedule.endDay + deltaDays,
  }
}

/** 拖右边缘改工期：只动结束日，且不能早于开始日（最少 1 天） */
export function resizeEnd(schedule, deltaDays) {
  return { ...schedule, endDay: Math.max(schedule.startDay, schedule.endDay + deltaDays) }
}

/**
 * 拖拽位移（像素）折算成天数。
 * 四舍五入而不是取整：拖过半天就换一天，手感更跟手。
 */
export function daysFromPixels(deltaPx, dayWidth) {
  if (!dayWidth || dayWidth <= 0) return 0
  return Math.round(deltaPx / dayWidth)
}
