/**
 * 日程后端的唯一出口 —— 对齐 qa-workbench 的单一 api 模块约定（BASE + 手写 fetch）。
 *
 * 两条纪律：
 * 1. **不依赖具体 HTTP 状态码**。后端没起时，vite 的 proxy 返回什么状态码与
 *    内容类型都不保证，所以「非 2xx」和「body 不是 JSON」一律归为连接失败。
 * 2. **区分「连不上」与「业务错误」**。fetch 本身 reject = 连不上；
 *    有响应但 ok:false = 业务错误，用后端给的中文文案。
 */

const BASE = '/api'

/** 后端没起 / 连不上时统一用这句，前端告警条直接显示它 */
export const OFFLINE_MESSAGE = '后端未连接，请确认服务已启动'

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch reject：DNS/端口不通/被中断
    throw new Error(OFFLINE_MESSAGE)
  }

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // proxy 转发失败时会返回 HTML 或纯文本，这里不能让它冒成 SyntaxError
    throw new Error(res.ok ? '后端返回了无法解析的内容' : OFFLINE_MESSAGE)
  }

  if (!payload || typeof payload !== 'object') throw new Error(OFFLINE_MESSAGE)
  if (payload.ok !== true) {
    throw new Error(payload.error || `请求失败（HTTP ${res.status}）`)
  }
  return payload.data
}

/** 健康检查：返回 { db, database, version } */
export function checkHealth() {
  return request('/health')
}

/** 全量读取：返回 { schedules, skipped } */
export function fetchSchedules() {
  return request('/schedules')
}

export function createSchedule(schedule) {
  return request('/schedules', { method: 'POST', body: schedule })
}

export function updateSchedule(id, schedule) {
  return request(`/schedules/${id}`, { method: 'PUT', body: schedule })
}

/** 删不存在的 id 返回 false，不报错 */
export function deleteSchedule(id) {
  return request(`/schedules/${id}`, { method: 'DELETE' })
}

/** 覆盖式整批替换（清空后写入，后端单事务）→ { imported, skipped, schedules } */
export function replaceSchedules(list) {
  return request('/schedules', { method: 'PUT', body: { schedules: list } })
}

/** 只追加 → { imported, skipped, schedules } */
export function bulkInsertSchedules(list) {
  return request('/schedules/bulk', { method: 'POST', body: { schedules: list } })
}
