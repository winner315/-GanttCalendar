/**
 * 国家法定节假日与调休（补班）数据 —— 移植自 Android 版 `data/HolidayData.kt`。
 *
 * 数据源是 [holiday-cn](https://github.com/NateScarlet/holiday-cn)（MIT），schema 只有
 * `name` / `date` / `isOffDay` 三个字段 —— `isOffDay=false` 即调休补班日，没有单独的调休字段。
 *
 * 取值优先级：联网下载到 IndexedDB 的当年数据 > 随前端打包的内置数据。
 * 标注口径：节假日数据优先，其次才是「普通周末算休息」——
 * 且后者只在数据覆盖到的年份生效，没数据的年份留空，不猜。
 */
import builtInRaw from '../data/holidays.json'
import { fromDayNumber, parseDay } from './date.js'

/** 法定节假日（含调休连休出来的那几天）—— 标「休」 */
export const HOLIDAY = 'holiday'
/** 数据覆盖到的年份里的普通周六日 —— 标「休」 */
export const WEEKEND = 'weekend'
/** 调休补班日，通常是本该休息的周末 —— 标「班」 */
export const WORKDAY = 'workday'

/** 内置数据整份解析一次后常驻内存 —— 每次渲染都要查表，不必反复解析 */
let builtInByYear = null

/** 联网下载的数据按年缓存；写入后清掉对应年份 */
const downloadedByYear = new Map()

/**
 * 解析 holiday-cn 格式的 JSON，只读 `days[]`。
 * 数据坏了（JSON 非法、日期解析失败）就跳过该条，不抛异常 —— 调用方拿到空表即可回退。
 * @returns {Map<number, {dayNumber:number, name:string, isWorkday:boolean}>}
 */
export function parse(json) {
  const out = new Map()
  const doc = typeof json === 'string' ? safeParse(json) : json
  const days = doc?.days
  if (!Array.isArray(days)) return out
  for (const o of days) {
    if (!o || typeof o !== 'object') continue
    const dayNumber = parseDay(o.date)
    if (dayNumber === null) continue
    // days[] 里出现的都是特殊日子，缺 isOffDay 时按「休息」处理更接近直觉
    const isOffDay = o.isOffDay === undefined ? true : o.isOffDay !== false
    out.set(dayNumber, { dayNumber, name: typeof o.name === 'string' ? o.name : '', isWorkday: !isOffDay })
  }
  return out
}

function safeParse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** 按年分组：{ 2026: Map<dayNumber, Holiday> } */
function groupByYear(byDay) {
  const out = new Map()
  for (const [dayNumber, holiday] of byDay) {
    const { year } = fromDayNumber(dayNumber)
    if (!out.has(year)) out.set(year, new Map())
    out.get(year).set(dayNumber, holiday)
  }
  return out
}

/** 内置数据（惰性解析一次） */
export function builtIn() {
  if (!builtInByYear) builtInByYear = groupByYear(parse(builtInRaw))
  return builtInByYear
}

/** 写入联网下载的数据；解析不出内容则视为无效、不缓存。[return] 是否写入成功 */
export function setDownloaded(year, json) {
  const byDay = parse(json)
  if (byDay.size === 0) return false
  downloadedByYear.set(year, byDay)
  return true
}

/** 覆盖掉已缓存的下载数据（测试与导入备份后清空用） */
export function clearDownloaded() {
  downloadedByYear.clear()
}

/** 某年的数据：下载的优先，其次内置，都没有则空表 */
export function forYear(year) {
  const cached = downloadedByYear.get(year)
  if (cached) return cached
  return builtIn().get(year) ?? new Map()
}

function yearsBetween(startDay, endDay) {
  const years = []
  for (let y = fromDayNumber(startDay).year; y <= fromDayNumber(endDay).year; y++) years.push(y)
  return years
}

/** 区间命中的节假日；[startDay]/[endDay] 含端点 */
export function inRange(startDay, endDay) {
  const out = new Map()
  for (const year of yearsBetween(startDay, endDay)) {
    for (const [dayNumber, holiday] of forYear(year)) {
      if (dayNumber >= startDay && dayNumber <= endDay) out.set(dayNumber, holiday)
    }
  }
  return out
}

/** 有数据（内置或已下载）的年份集合 —— 只有这些年份才敢把普通周末当休息 */
export function coveredYears(startDay, endDay) {
  const out = new Set()
  for (const year of yearsBetween(startDay, endDay)) {
    if (forYear(year).size > 0) out.add(year)
  }
  return out
}

function isWeekend(dayNumber) {
  // getUTCDay: 0=周日、6=周六
  const d = new Date(dayNumber * 86400000).getUTCDay()
  return d === 0 || d === 6
}

/**
 * 纯计算部分，便于单测。
 * 优先级：节假日数据 > 普通周末（仅在 [years] 覆盖到的年份适用）。
 * @returns {Map<number, 'holiday'|'weekend'|'workday'>} 没被标注的日子（普通工作日）不在表里
 */
export function badges(data, years, startDay, endDay) {
  const out = new Map()
  for (let dayNumber = startDay; dayNumber <= endDay; dayNumber++) {
    const holiday = data.get(dayNumber)
    if (holiday) {
      out.set(dayNumber, holiday.isWorkday ? WORKDAY : HOLIDAY)
    } else if (years.has(fromDayNumber(dayNumber).year) && isWeekend(dayNumber)) {
      out.set(dayNumber, WEEKEND)
    }
  }
  return out
}

/** 区间的「休 / 班」标注：key 是 dayNumber，value 是三种状态之一 */
export function badgesInRange(startDay, endDay) {
  return badges(inRange(startDay, endDay), coveredYears(startDay, endDay), startDay, endDay)
}

/** 角标文案 */
export function badgeText(badge) {
  if (!badge) return ''
  return badge === WORKDAY ? '班' : '休'
}

/**
 * 角标对应的 CSS 颜色变量名。
 * 休息的两态（法定假 HOLIDAY / 普通周末 WEEKEND）**用同一种默认色**：
 * 使用者关心的是「这天休不休」，法定假还是周末是次要信息，
 * 分成红灰两色反而让人以为红色那几天有别的含义。
 * 补班 WORKDAY 仍单独用蓝色 —— 它和休息是相反的语义，混色会误导。
 */
export function badgeColorVar(badge) {
  if (badge === WORKDAY) return '--workday-badge-text'
  return '--rest-badge-text'
}

/** 是否算休息日（法定假与普通周末同口径），用来铺格子底色 */
export function isRest(badge) {
  return badge === HOLIDAY || badge === WEEKEND
}
