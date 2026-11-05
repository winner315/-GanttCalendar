/**
 * JSON 备份：导出 / 解析导入文件。
 *
 * 导出的结构刻意与 Android 版的数据语义对齐（天数序号、颜色索引），
 * 以后两端可以互相导：`{version, exportedAt, schedules:[{title,startDay,endDay,color}]}`。
 *
 * 导入只负责「解析 + 校验」，不碰存储 —— 落库与「合并 / 覆盖」的选择交给调用方，
 * 覆盖是不可逆操作，必须先问人。
 */
import { MS_PER_DAY } from './date.js'
import { COLOR_COUNT, sanitizeAll } from './schedule.js'

/** 当前导出格式版本。以后结构变了要 +1，导入时据此判断兼容性 */
export const BACKUP_VERSION = 1

/** 序列化成一个可下载的 JSON 字符串 */
export function exportJson(schedules, exportedAt = new Date()) {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    schedules: schedules.map((s) => ({
      title: s.title,
      startDay: s.startDay,
      endDay: s.endDay,
      color: s.color,
      status: s.status,
    })),
  }
  return JSON.stringify(payload, null, 2)
}

/** 备份文件名：带日期，便于区分多份备份 */
export function backupFileName(exportedAt = new Date()) {
  const d = exportedAt
  const pad = (n) => String(n).padStart(2, '0')
  return `gantt-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

/** 触发浏览器下载。传入的是字符串内容（Blob 下载对本地文件最省事） */
export function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 撤得太快某些浏览器会取消下载，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 解析导入文件。
 * 返回 `{ ok, version, schedules, skipped, error }`，任何情况下都不抛异常 ——
 * 用户手工改过的 JSON、旧版本备份都会走到这里。
 *
 * 逐条校验（复用 schedule.js 的 sanitize 口径，避免两处规则不一致）：
 * 标题非空、日期为合法整数天数、endDay >= startDay、颜色 0..7。
 * 非法条目跳过并计数，不整份拒绝 —— 一份备份里坏一条不该让其余全部作废。
 */
export function parseBackup(text) {
  const empty = (error) => ({ ok: false, version: null, schedules: [], skipped: 0, error })

  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return empty('文件不是合法的 JSON')
  }
  if (!doc || typeof doc !== 'object') return empty('文件内容不是一个对象')

  if (doc.version === undefined) return empty('缺少 version 字段，可能不是本应用的备份文件')
  if (!Number.isInteger(doc.version)) return empty('version 字段不是整数')
  if (doc.version > BACKUP_VERSION) {
    return empty(`备份版本 ${doc.version} 高于当前支持的 ${BACKUP_VERSION}，请升级后再导入`)
  }
  if (!Array.isArray(doc.schedules)) return empty('缺少 schedules 数组')

  const { valid, skipped } = sanitizeAll(doc.schedules)
  if (valid.length === 0 && skipped > 0) {
    return { ok: false, version: doc.version, schedules: [], skipped, error: `${skipped} 条数据格式都不合法，没有可导入的内容` }
  }
  return { ok: true, version: doc.version, schedules: valid, skipped, error: '' }
}

/** 导出前给用户看的摘要，例如「3 条日程，2026-10-01 ~ 2026-12-31」 */
export function summarize(schedules) {
  if (!schedules.length) return '0 条日程'
  const starts = schedules.map((s) => s.startDay)
  const ends = schedules.map((s) => s.endDay)
  const from = new Date(Math.min(...starts) * MS_PER_DAY)
  const to = new Date(Math.max(...ends) * MS_PER_DAY)
  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return `${schedules.length} 条日程，${fmt(from)} ~ ${fmt(to)}`
}

export { COLOR_COUNT }
