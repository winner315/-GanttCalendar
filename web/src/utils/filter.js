/**
 * 日程筛选 —— 甘特视图与列表页共用同一套口径。
 *
 * 条件是「与」的关系：
 *  - 关键词：标题包含（不做大小写/拼音转换，中文场景够用）
 *  - 颜色：命中任一选中色即保留（多选）
 *  - 状态：命中任一选中状态即保留（多选）
 *  - 时间范围：与日程区间**有交集**即保留，不是「完全落在范围内」——
 *    只筛 10 月却把 9/28~10/03 这条藏掉，与直觉不符。
 */

/** 关键词是否命中（空关键词视为不筛选） */
export function matchesKeyword(schedule, keyword) {
  const word = String(keyword ?? '').trim()
  if (!word) return true
  return String(schedule?.title ?? '').includes(word)
}

/** 颜色是否命中（空数组视为不筛选） */
export function matchesColors(schedule, colors) {
  if (!Array.isArray(colors) || colors.length === 0) return true
  return colors.includes(schedule?.color)
}

/** 状态是否命中（空数组视为不筛选）；与颜色同一套多选口径 */
export function matchesStatus(schedule, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return true
  return statuses.includes(schedule?.status)
}

/**
 * 时间范围是否命中（任一端为 null 视为该端不限制）。
 * 用区间相交判断，边界当天算命中。
 */
export function matchesRange(schedule, from, to) {
  if (Number.isInteger(from) && schedule.endDay < from) return false
  if (Number.isInteger(to) && schedule.startDay > to) return false
  return true
}

/** 组合筛选 */
export function filterSchedules(schedules, criteria = {}) {
  const { keyword = '', colors = [], statuses = [], from = null, to = null } = criteria
  return schedules.filter(
    (s) =>
      matchesKeyword(s, keyword) &&
      matchesColors(s, colors) &&
      matchesStatus(s, statuses) &&
      matchesRange(s, from, to)
  )
}

/** 是否处于「有筛选条件」状态（用来给空列表加一句说明） */
export function hasActiveFilter(criteria = {}) {
  const { keyword = '', colors = [], statuses = [], from = null, to = null } = criteria
  return (
    String(keyword).trim() !== '' ||
    colors.length > 0 ||
    statuses.length > 0 ||
    Number.isInteger(from) ||
    Number.isInteger(to)
  )
}
