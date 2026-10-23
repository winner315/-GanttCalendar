/**
 * 日程 store：内存 reactive 列表 + IndexedDB 落盘。
 *
 * 不引 Pinia —— 与 qa-workbench 的既有约定一致，一个 reactive 单例就够。
 * 所有写操作都是「先改内存、再落库」，落库失败不回滚内存（内存里已生效的操作
 * 用户已经看到了，回滚反而更困惑），但会把 storageAvailable 置 false 让界面提示。
 */
import { reactive, readonly } from 'vue'
import { STORE_SCHEDULES, add as idbAdd, clearStore, deleteById, getAll, put, getBackend, storageAvailable } from '../utils/idb.js'
import { sanitizeAll, sanitizeSchedule } from '../utils/schedule.js'

const state = reactive({
  schedules: [],
  loaded: false,
  /** 加载过程中被判为脏数据而跳过的条数 */
  skippedOnLoad: 0,
  /** 存储是否真的落盘；false 表示只在内存，刷新即丢 */
  persistent: true,
})

/**
 * 加载全部日程。脏数据跳过并计数，不抛异常。
 * 每次进入页面调用一次即可（数据量小，全量读）。
 */
export async function load() {
  await getBackend()
  state.persistent = storageAvailable()
  let raw = []
  try {
    raw = await getAll(STORE_SCHEDULES)
  } catch {
    state.persistent = false
    raw = []
  }
  const { valid, skipped } = sanitizeAll(raw)
  valid.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
  state.schedules = valid
  state.skippedOnLoad = skipped
  state.loaded = true
  return state.schedules
}

function sortInPlace() {
  state.schedules.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
}

/** 新增一条日程，返回带 id 的记录 */
export async function addSchedule(input) {
  const cleaned = sanitizeSchedule(input)
  if (!cleaned) throw new Error('日程数据不合法')
  delete cleaned.id
  let saved = cleaned
  try {
    saved = await idbAdd(STORE_SCHEDULES, cleaned)
  } catch {
    // 落库失败：给个临时 id 让界面能继续用，并标记为非持久
    state.persistent = false
    saved = { ...cleaned, id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  }
  state.schedules.push(saved)
  sortInPlace()
  return saved
}

/** 更新一条日程（按 id 覆盖） */
export async function updateSchedule(input) {
  const cleaned = sanitizeSchedule(input)
  if (!cleaned || cleaned.id === undefined) throw new Error('日程数据不合法')
  const index = state.schedules.findIndex((s) => s.id === cleaned.id)
  if (index === -1) return null
  try {
    if (typeof cleaned.id === 'number') await put(STORE_SCHEDULES, cleaned)
  } catch {
    state.persistent = false
  }
  state.schedules[index] = cleaned
  sortInPlace()
  return cleaned
}

/** 删除一条日程 */
export async function removeSchedule(id) {
  const index = state.schedules.findIndex((s) => s.id === id)
  if (index === -1) return false
  try {
    if (typeof id === 'number') await deleteById(STORE_SCHEDULES, id)
  } catch {
    state.persistent = false
  }
  state.schedules.splice(index, 1)
  return true
}

/**
 * 用给定列表替换全部数据。
 * 注意：这是不可逆操作，调用方必须先向用户确认（导入备份的「覆盖」分支）。
 */
export async function replaceAll(list) {
  const { valid, skipped } = sanitizeAll(list)
  try {
    await clearStore(STORE_SCHEDULES)
  } catch {
    state.persistent = false
  }
  state.schedules = []
  for (const item of valid) {
    const cleaned = { ...item }
    delete cleaned.id
    try {
      state.schedules.push(await idbAdd(STORE_SCHEDULES, cleaned))
    } catch {
      state.persistent = false
      state.schedules.push({ ...cleaned, id: `mem-${Math.random().toString(36).slice(2, 8)}` })
    }
  }
  sortInPlace()
  return { imported: state.schedules.length, skipped }
}

/** 追加导入（合并分支）：按「标题 + 起止」去重，重复的不再插入 */
export async function mergeAll(list) {
  const { valid, skipped } = sanitizeAll(list)
  let skippedCount = skipped
  const keyOf = (s) => `${s.title}|${s.startDay}|${s.endDay}`
  const existing = new Set(state.schedules.map(keyOf))
  let imported = 0
  for (const item of valid) {
    if (existing.has(keyOf(item))) {
      skippedCount++
      continue
    }
    const cleaned = { ...item }
    delete cleaned.id
    await addSchedule(cleaned)
    existing.add(keyOf(cleaned))
    imported++
  }
  return { imported, skipped: skippedCount }
}

/** 只读状态，供组件使用 */
export const scheduleState = readonly(state)
