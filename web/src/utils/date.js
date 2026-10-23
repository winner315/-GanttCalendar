/**
 * 日期工具 —— 移植自 Android 版 `util/DateUtils.kt`。
 *
 * 日期一律用「天数序号」（dayNumber）表示，与 Android 版的 `LocalDate.toEpochDay()`
 * 完全同构：1970-01-01 = 0，可正可负。这样导出的 JSON 两端通用，
 * 且避开日期对象在时区/夏令时上的漂移。
 *
 * 用 `Date.UTC` 而不是 `new Date(y, m, d)`：后者按本地时区构造，
 * 历史上存在「本地午夜因夏令时不存在」的地区，会算错一天。
 */

export const MS_PER_DAY = 86400000
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 某年某月某日 → 天数序号。month 从 1 起 */
export function toDayNumber(year, month, day) {
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/** 天数序号 → { year, month, day }，month 从 1 起 */
export function fromDayNumber(dayNumber) {
  const d = new Date(dayNumber * MS_PER_DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 该月天数 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function monthStart(year, month) {
  return toDayNumber(year, month, 1)
}

export function monthEnd(year, month) {
  return toDayNumber(year, month, daysInMonth(year, month))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 年份标题：「2026年9月」 */
export function monthTitle(year, month) {
  return `${year}年${month}月`
}

/** 天数序号 → 「2026-09-05」，用于导出 JSON 与日期输入框 */
export function formatDay(dayNumber) {
  const { year, month, day } = fromDayNumber(dayNumber)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 「2026-09-05」→ 天数序号；格式不对返回 null，不抛异常 */
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return toDayNumber(year, month, day)
}

/** 「9月5日」，列表与色带用 */
export function formatMonthDay(dayNumber) {
  const { month, day } = fromDayNumber(dayNumber)
  return `${month}月${day}日`
}

/** 月份偏移，返回 { year, month } */
export function shiftMonth(year, month, delta) {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/** 日期偏移 */
export function shiftDay(dayNumber, delta) {
  return dayNumber + delta
}

/** 周一为一周的第一天：0=周一 … 6=周日（与 Android 版 firstDayOffset 同口径） */
export function weekdayIndex(dayNumber) {
  return (new Date(dayNumber * MS_PER_DAY).getUTCDay() + 6) % 7
}

/** 当月 1 号在「周一起始」这一周里的位置，0=周一、6=周日 */
export function firstDayOffset(year, month) {
  return weekdayIndex(monthStart(year, month))
}

/** 包含该日的那一周的周一 */
export function weekStart(dayNumber) {
  return dayNumber - weekdayIndex(dayNumber)
}

/** 包含该日的那一周的周日 */
export function weekEnd(dayNumber) {
  return weekStart(dayNumber) + 6
}

export function todayDayNumber() {
  const now = new Date()
  return toDayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function todayYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** 两个天数序号之间的天数（含两端），最小 1 */
export function spanDays(startDay, endDay) {
  return Math.max(1, endDay - startDay + 1)
}
