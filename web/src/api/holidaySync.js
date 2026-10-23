/**
 * 节假日数据联网更新 —— 移植自 Android 版 `data/HolidaySync.kt`。
 *
 * 拉 holiday-cn 的按年 JSON，成功后放进内存（并可选落 IndexedDB），渲染优先用它。
 * 24 小时节流，先落时间戳再请求：这次失败也要等到下个周期再试，不能每次进页面都去请求。
 * 任何失败（断网、CORS、解析不出内容）都静默回退内置数据。
 */
import { STORE_META, get, put } from '../utils/idb.js'
import { forYear, setDownloaded } from '../utils/holiday.js'

const META_KEY = 'holidaySyncAt'
const INTERVAL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 15000
const BASE_URL = 'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/'

/** 测试用：注入假的 fetch，传 null 恢复全局 fetch */
let fetchImpl = null

export function setFetchForTests(impl) {
  fetchImpl = impl
}

function doFetch(url) {
  const fn = fetchImpl ?? globalThis.fetch
  if (typeof fn !== 'function') throw new Error('当前环境不支持 fetch')
  return fn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
}

/** 拉取某一年；[return] 是否拿到了有效数据 */
async function fetchYear(year) {
  try {
    const res = await doFetch(`${BASE_URL}${year}.json`)
    if (!res.ok) return false
    const text = await res.text()
    return setDownloaded(year, text)
  } catch {
    // 断网 / CORS / 超时：静默失败，继续用内置数据
    return false
  }
}

/**
 * 按 24h 节流刷新当年与次年的数据。
 * @returns {Promise<boolean>} 是否有新数据可用（调用方据此决定是否重渲染）
 */
export async function refreshIfStale({ now = Date.now() } = {}) {
  let last = 0
  try {
    const record = await get(STORE_META, META_KEY)
    last = Number(record?.value) || 0
  } catch {
    last = 0
  }
  if (now - last < INTERVAL_MS) return false

  try {
    await put(STORE_META, { key: META_KEY, value: now })
  } catch {
    // 落库失败不影响本次刷新，最多下次再拉一遍
  }

  const year = new Date(now).getFullYear()
  let changed = false
  // 下一年的安排通常 11 月才发布，顺带探测；拉不到空数据就当没有
  for (const y of [year, year + 1]) {
    if (await fetchYear(y)) changed = true
  }
  return changed
}

/** 测试与离线场景：不经过节流直接拉一次 */
export async function forceRefresh() {
  const year = new Date().getFullYear()
  let changed = false
  for (const y of [year, year + 1]) {
    if (await fetchYear(y)) changed = true
  }
  return changed
}

export { forYear }
