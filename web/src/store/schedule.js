/**
 * 日程 store：内存 reactive 列表，数据真身在 MySQL（经后端 HTTP 读写）。
 *
 * 不引 Pinia —— 与 qa-workbench 的既有约定一致，一个 reactive 单例就够。
 *
 * 写入一律 **server-first**：先请求后端，成功了才改内存。
 * （IndexedDB 时代是「先改内存再落库」——那时内存与落盘是同一份存储的两层视图；
 *  现在内存只是远端的缓存，提前展示未确认的写入等于对用户撒谎。）
 * 失败就抛，内存保持原样，由调用方弹错误提示。
 *
 * 后端不可用时**绝不降级回本地存储**：persistent 置 false + backendError 带原因，
 * 界面显示红色告警，数据一律不显示。
 */
import { reactive, readonly } from 'vue'
import {
  bulkInsertSchedules,
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  replaceSchedules,
  updateSchedule as updateScheduleApi,
} from '../api/schedules.js'
import { sanitizeAll, sanitizeSchedule } from '../utils/schedule.js'

const state = reactive({
  schedules: [],
  loaded: false,
  /** 被判为脏数据而跳过的条数（后端 + 本地二次校验合计） */
  skippedOnLoad: 0,
  /** 后端是否可用；false 表示当前拿不到数据，界面要明着报错 */
  persistent: true,
  /** 后端不可用时的原因（中文），供告警组件显示 */
  backendError: '',
})

function sortInPlace() {
  state.schedules.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
}

/**
 * 加载全部日程。
 * **不抛异常** —— ListView 是 fire-and-forget 调用（无 await 无 catch），
 * 抛出去就是 unhandled rejection，页面还会渲染不出来。
 * 失败状态一律通过 scheduleState 表达，由告警组件呈现。
 */
export async function load() {
  try {
    const { schedules, skipped } = await fetchSchedules()
    // 后端已校验过一遍；这里再校验一次，防手工 INSERT 进库的脏数据与后端漂移
    const { valid, skipped: localSkipped } = sanitizeAll(schedules)
    valid.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
    state.schedules = valid
    state.skippedOnLoad = (skipped ?? 0) + localSkipped
    state.persistent = true
    state.backendError = ''
  } catch (e) {
    state.persistent = false
    state.backendError = e?.message ?? String(e)
    state.schedules = []
    state.skippedOnLoad = 0
  } finally {
    state.loaded = true
  }
  return state.schedules
}

/** 新增一条日程，返回后端落库后的记录（含自增 id） */
export async function addSchedule(input) {
  const cleaned = sanitizeSchedule(input)
  if (!cleaned) throw new Error('日程数据不合法')
  delete cleaned.id
  const saved = await createSchedule(cleaned)
  state.schedules.push(saved)
  sortInPlace()
  return saved
}

/** 更新一条日程（按 id 覆盖）。内存里没有这个 id 时返回 null，不发请求 */
export async function updateSchedule(input) {
  const cleaned = sanitizeSchedule(input)
  if (!cleaned || cleaned.id === undefined) throw new Error('日程数据不合法')
  const index = state.schedules.findIndex((s) => s.id === cleaned.id)
  if (index === -1) return null
  const saved = await updateScheduleApi(cleaned.id, cleaned)
  state.schedules[index] = saved
  sortInPlace()
  return saved
}

/** 删除一条日程。内存里没有这个 id 时返回 false，不发请求 */
export async function removeSchedule(id) {
  const index = state.schedules.findIndex((s) => s.id === id)
  if (index === -1) return false
  await deleteSchedule(id)
  state.schedules.splice(index, 1)
  return true
}

/**
 * 用给定列表替换全部数据（后端单事务，失败整体回滚）。
 * 注意：这是不可逆操作，调用方必须先向用户确认（导入备份的「覆盖」分支）。
 */
export async function replaceAll(list) {
  const { valid, skipped } = sanitizeAll(list)
  // 后端会在一个事务里清空并写入，并把提交后的全量带回 —— 直接用它覆盖内存，
  // 不必猜 id，也不必二次请求
  const { imported, schedules } = await replaceSchedules(valid)
  const { valid: fresh, skipped: localSkipped } = sanitizeAll(schedules)
  fresh.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
  state.schedules = fresh
  return { imported, skipped: skipped + localSkipped }
}

/** 追加导入（合并分支）：按「标题 + 起止」去重，重复的不再插入 */
export async function mergeAll(list) {
  const { valid, skipped } = sanitizeAll(list)
  const keyOf = (s) => `${s.title}|${s.startDay}|${s.endDay}`
  const existing = new Set(state.schedules.map(keyOf))
  const fresh = []
  let skippedCount = skipped
  for (const item of valid) {
    if (existing.has(keyOf(item))) {
      skippedCount++
      continue
    }
    existing.add(keyOf(item))
    const cleaned = { ...item }
    delete cleaned.id
    fresh.push(cleaned)
  }
  if (!fresh.length) return { imported: 0, skipped: skippedCount }

  const { imported, schedules, skipped: serverSkipped } = await bulkInsertSchedules(fresh)
  state.schedules.push(...schedules)
  sortInPlace()
  return { imported, skipped: skippedCount + (serverSkipped ?? 0) }
}

/** 只读状态，供组件使用 */
export const scheduleState = readonly(state)
