/**
 * 偏好 store：视图模式、当前年月、筛选条件。
 *
 * 直接用 localStorage 而不是 IndexedDB —— 偏好是小字符串、每次交互都要读写，
 * 同步接口更省事；且 localStorage 不可用时（隐私模式）读写都被 try/catch 包住，
 * 退化成「本次会话有效」的内存值，不影响渲染。
 */
import { reactive, readonly } from 'vue'
import { fromDayNumber, todayDayNumber, todayYearMonth } from '../utils/date.js'

const KEY = 'gantt-prefs'

/** 视图模式：月 / 周 / 年 */
export const VIEW_MONTH = 'month'
export const VIEW_WEEK = 'week'
export const VIEW_YEAR = 'year'

const defaults = () => {
  const { year, month } = todayYearMonth()
  return {
    view: VIEW_MONTH,
    year,
    month,
    /** 当前周的任意一天（周视图用），null 表示跟随今天 */
    weekAnchor: null,
    keyword: '',
    colorFilter: [],
    /** 时间范围筛选（天数序号，null 表示该端不限）；甘特视图不用，列表页用 */
    rangeFrom: null,
    rangeTo: null,
    storageAvailable: true,
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return null
  }
}

const stored = readStored()
const state = reactive({ ...defaults(), ...(stored ?? {}), storageAvailable: stored !== null })

function persist() {
  try {
    const { storageAvailable, ...rest } = state
    localStorage.setItem(KEY, JSON.stringify(rest))
    state.storageAvailable = true
  } catch {
    state.storageAvailable = false
  }
}

export function setView(view) {
  state.view = view
  persist()
}

export function setYearMonth(year, month) {
  state.year = year
  state.month = month
  persist()
}

/** 月份偏移；同时清掉周锚点，避免周视图停在上次那个月 */
export function shiftMonthBy(delta) {
  const total = state.year * 12 + (state.month - 1) + delta
  state.year = Math.floor(total / 12)
  state.month = (total % 12) + 1
  state.weekAnchor = null
  persist()
}

/** 年份偏移（年视图用），月份保持不变 */
export function shiftYearBy(delta) {
  state.year += delta
  state.weekAnchor = null
  persist()
}

/** 周视图锚点：记的是本周的任意一天，null 表示跟随今天 */
export function setWeekAnchor(dayNumber) {
  state.weekAnchor = dayNumber
  // 标题上的年月跟着锚点走，否则翻周翻到下个月、标题还停在原来的月
  if (Number.isInteger(dayNumber)) {
    const { year, month } = fromDayNumber(dayNumber)
    state.year = year
    state.month = month
  }
  persist()
}

/** 周平移：一次挪 7 天 */
export function shiftWeekBy(delta) {
  const base = state.weekAnchor ?? todayDayNumber()
  setWeekAnchor(base + delta * 7)
}

export function setKeyword(keyword) {
  state.keyword = keyword
  persist()
}

export function setColorFilter(colors) {
  state.colorFilter = Array.isArray(colors) ? colors : []
  persist()
}

/** 时间范围筛选；两端都传 null 即为清除 */
export function setRangeFilter(from, to) {
  state.rangeFrom = Number.isInteger(from) ? from : null
  state.rangeTo = Number.isInteger(to) ? to : null
  persist()
}

/** 清空全部筛选条件（关键词 / 颜色 / 时间范围） */
export function clearFilters() {
  state.keyword = ''
  state.colorFilter = []
  state.rangeFrom = null
  state.rangeTo = null
  persist()
}

/** 回到今天 */
export function goToday() {
  const { year, month } = todayYearMonth()
  state.year = year
  state.month = month
  state.weekAnchor = null
  persist()
}

/** 仅供测试：重置为默认值 */
export function resetForTests() {
  Object.assign(state, defaults())
}

export const prefsState = readonly(state)
