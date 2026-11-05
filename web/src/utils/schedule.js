/**
 * 日程数据的校验与规范化（纯逻辑，便于单测）。
 *
 * 数据可能来自三处：本机 IndexedDB、手工改过的备份 JSON、将来从 Android 版导出的数据。
 * 一律先过 [sanitizeSchedule]：不合法的条目**跳过并计数**，而不是让整页崩掉。
 */
import { parseDay } from './date.js'

/** 调色板大小，与 Android 版 ScheduleAdapter.COLOR_RES 一致 */
export const COLOR_COUNT = 8

/**
 * 任务状态四态。后端 server/schedule/mapper.py 里有一份同样的取值，
 * 两边必须保持一致（DB 用 VARCHAR 存，取值范围只在这两处校验）。
 * 界面上已提供四态选择（编辑框）与按状态筛选；本文件是前端取值权威点。
 */
export const STATUS_TODO = 'todo'
export const STATUS_DOING = 'doing'
export const STATUS_DONE = 'done'
export const STATUS_PAUSED = 'paused'
export const STATUSES = [STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_PAUSED]
export const STATUS_LABELS = {
  [STATUS_TODO]: '待办',
  [STATUS_DOING]: '进行中',
  [STATUS_DONE]: '已完成',
  [STATUS_PAUSED]: '已暂停',
}

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

  // 状态是附加信息：非法/缺失一律归「待办」，不让整条日程被判脏丢掉
  const status = STATUSES.includes(raw.status) ? raw.status : STATUS_TODO

  // 备注是选填文本：非字符串归空串，字符串去掉首尾空白（长度由输入框 maxlength 限制）
  const note = typeof raw.note === 'string' ? raw.note.trim() : ''

  const out = { title, startDay, endDay, color, status, note }
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
