/**
 * 测试用的内存版后端。
 *
 * 不是 .test.js 后缀 —— 别让 vitest 把它当测试文件收集。
 * 它模拟的是「后端 HTTP 契约」这一层：store 只依赖 fetch 的形状，
 * 所以单测替换全局 fetch 即可，不需要起真实服务器、也不需要数据库。
 *
 * 注意语义要对齐真后端：id 是自增**整数**、替换是整批的、删不存在返回 deleted:false。
 */

export function createFakeServer() {
  let rows = []
  let autoId = 1
  /** 置 true 后所有请求都失败，用来测「后端不可用」分支 */
  let down = false
  /** 置字符串后所有请求都返回 ok:false，模拟业务错误 */
  let failWith = ''

  function reset() {
    rows = []
    autoId = 1
    down = false
    failWith = ''
  }

  function nextId() {
    return autoId++
  }

  /** 测试里造假数据用 —— 模拟别人往库里手工 INSERT 的行 */
  function seed(list) {
    for (const item of list) {
      rows.push({ id: item.id ?? nextId(), ...item })
    }
    if (list.length) {
      autoId = Math.max(autoId, ...rows.map((r) => Number(r.id) || 0)) + 1
    }
  }

  function sorted() {
    return [...rows].sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay || a.id - b.id)
  }

  function body(obj, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => obj,
    }
  }

  function notJson(status = 502) {
    // proxy 转发失败时的形态：有响应但不是 JSON
    return { ok: false, status, json: async () => { throw new SyntaxError('not json') } }
  }

  const paths = (url) => String(url).replace(/^.*\/api/, '')

  function handle(url, init = {}) {
    if (down) throw new TypeError('fetch failed')
    const path = paths(url)
    const method = init.method ?? 'GET'
    const payload = init.body ? JSON.parse(init.body) : null

    if (failWith) return body({ ok: false, error: failWith }, 500)

    if (path === '/health' && method === 'GET') {
      return body({ ok: true, data: { db: true, database: 'fake', version: '8.0.0' } })
    }

    if (path === '/schedules' && method === 'GET') {
      return body({ ok: true, data: { schedules: sorted(), skipped: 0 } })
    }

    if (path === '/schedules' && method === 'POST') {
      const row = { id: nextId(), ...payload }
      rows.push(row)
      return body({ ok: true, data: row })
    }

    if (path === '/schedules' && method === 'PUT') {
      const incoming = payload?.schedules ?? []
      rows = incoming.map((s) => ({ id: nextId(), ...s }))
      return body({ ok: true, data: { imported: incoming.length, skipped: 0, schedules: sorted() } })
    }

    if (path === '/schedules/bulk' && method === 'POST') {
      const incoming = payload?.schedules ?? []
      const created = incoming.map((s) => {
        const row = { id: nextId(), ...s }
        rows.push(row)
        return row
      })
      return body({ ok: true, data: { imported: created.length, skipped: 0, schedules: created } })
    }

    const m = /^\/schedules\/(\d+)$/.exec(path)
    if (m) {
      const id = Number(m[1])
      const index = rows.findIndex((r) => r.id === id)
      if (method === 'PUT') {
        if (index === -1) return body({ ok: false, error: '日程不存在' }, 404)
        rows[index] = { id, ...payload }
        return body({ ok: true, data: rows[index] })
      }
      if (method === 'DELETE') {
        if (index === -1) return body({ ok: true, data: { deleted: false } })
        rows.splice(index, 1)
        return body({ ok: true, data: { deleted: true } })
      }
    }

    return body({ ok: false, error: '没有这个接口' }, 404)
  }

  return {
    fetch: (url, init) => handle(url, init),
    /** 模拟 proxy 转发失败：有响应但不是 JSON */
    fetchNotJson: () => notJson(),
    reset,
    seed,
    all: () => sorted(),
    setDown: (v = true) => { down = v },
    setFailWith: (msg) => { failWith = msg },
  }
}

/** 装到全局 fetch 上（配合 vi.stubGlobal 使用） */
export function install(server) {
  globalThis.fetch = (url, init) => {
    try {
      return Promise.resolve(server.fetch(url, init))
    } catch (e) {
      return Promise.reject(e)
    }
  }
}
