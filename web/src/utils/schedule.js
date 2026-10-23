/**
 * 日程数据的校验与规范化（纯逻辑，便于单测）。
 *
 * 数据可能来自三处：本机 IndexedDB、手工改过的备份 JSON、将来从 Android 版导出的数据。
 * 一律先过 [sanitizeSchedule]：不合法的条目**跳过并计数**，而不是让整页崩掉。
 */
import { parseDay } from './date.js'

/** 调色板大小，与 Android 版 ScheduleAdapter.COLOR_RES 一致 */
export const COLOR_COUNT = 8

/** 天数序号的合理范围：1900-01-01 ~ 2200-01-01，超出基本可判定为脏数据 */
const MIN_DAY = -25567
const MAX_DAY = 84006

function isIntDay(value) {
  return Number.isInteger(value) && value >= MIN_DAY && value <= MAX_DAY
}

/**
 * 规范化一条日程。
 * 接受 `{title, startDay, endDay, color}`，也接受带 `startDate`/`endDate` 的日期字符串写法
 * （备份 JSON 里用 `2026-09-05` 更好读，导入时一并支持）。
 * @returns {object|null} 不合法返回 null，由调用方跳过
 */
export function sanitizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null

  const startDay = isIntDay(raw.startDay) ? raw.startDay : parseDay(raw.startDate)
  const endDay = isIntDay(raw.endDay) ? raw.endDay : parseDay(raw.endDate)
  if (startDay === null || endDay === null) return null
  if (endDay < startDay) return null

  const color = Number.isInteger(raw.color) ? Math.min(Math.max(raw.color, 0), COLOR_COUNT - 1) : 0

  const out = { title, startDay, endDay, color }
  // id 由存储层负责：合法正整数才保留，否则当作新增
  if (Number.isInteger(raw.id) && raw.id > 0) out.id = raw.id
  return out
}

/**
 * 批量规范化。
 * @returns {{valid: object[], skipped: number}} skipped 是被丢弃的条数，用于如实提示用户
 */
export function sanitizeAll(list) {
  const valid = []
  let skipped = 0
  for (const raw of Array.isArray(list) ? list : []) {
    const cleaned = sanitizeSchedule(raw)
    if (cleaned) valid.push(cleaned)
    else skipped++
  }
  return { valid, skipped }
}
