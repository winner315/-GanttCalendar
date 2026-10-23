/**
 * IndexedDB 薄封装（Promise 化）。
 *
 * 只在需要时打开连接，且**任何一步失败都降级到内存实现**，而不是抛异常 ——
 * 隐私模式、浏览器禁用站点数据、用户手动清库都会让 indexedDB 打不开或请求失败，
 * 那种情况下页面仍然要能渲染（数据只在本次会话内有效），并如实告知用户。
 *
 * 对象仓库：
 *  - `schedules`：日程，自增主键 id
 *  - `meta`：偏好设置与节假日缓存，主键 key
 */

export const DB_NAME = 'gantt-calendar'
export const DB_VERSION = 1
export const STORE_SCHEDULES = 'schedules'
export const STORE_META = 'meta'

const STORES = [STORE_SCHEDULES, STORE_META]

/** 内存兜底实现，接口与 IndexedDB 版一致 */
function createMemoryBackend() {
  const tables = new Map(STORES.map((name) => [name, new Map()]))
  let autoId = 1
  return {
    kind: 'memory',
    async getAll(store) {
      return [...tables.get(store).values()]
    },
    async get(store, key) {
      return tables.get(store).get(key)
    },
    async put(store, value) {
      tables.get(store).set(value.key ?? value.id, value)
      return value
    },
    async add(store, value) {
      const id = autoId++
      const record = { ...value, id }
      tables.get(store).set(id, record)
      return record
    },
    async delete(store, key) {
      return tables.get(store).delete(key)
    },
    async clear(store) {
      tables.get(store).clear()
    },
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function createIdbBackend(db) {
  return {
    kind: 'indexeddb',
    async getAll(store) {
      const tx = db.transaction(store, 'readonly')
      return requestToPromise(tx.objectStore(store).getAll())
    },
    async get(store, key) {
      const tx = db.transaction(store, 'readonly')
      return requestToPromise(tx.objectStore(store).get(key))
    },
    async put(store, value) {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      await txDone(tx)
      return value
    },
    async add(store, value) {
      const tx = db.transaction(store, 'readwrite')
      const storeRef = tx.objectStore(store)
      const key = await requestToPromise(storeRef.add(value))
      await txDone(tx)
      return { ...value, id: key }
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      await txDone(tx)
    },
    async clear(store) {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      await txDone(tx)
    },
  }
}

let backendPromise = null
let backendKind = 'unknown'
/** 上一次打不开的原因，供界面如实提示 */
let lastError = null

function openIdb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          // schedules 用自增 id；meta 用显式的 key
          db.createObjectStore(name, name === STORE_META ? { keyPath: 'key' } : { keyPath: 'id', autoIncrement: true })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'))
  })
}

/** 取后端（首次调用时打开；失败则永久降级为内存实现） */
export function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('当前环境不支持 IndexedDB')
        const db = await openIdb()
        backendKind = 'indexeddb'
        return createIdbBackend(db)
      } catch (e) {
        lastError = e?.message ?? String(e)
        backendKind = 'memory'
        return createMemoryBackend()
      }
    })()
  }
  return backendPromise
}

/** 存储是否真的落盘（false 表示只在内存里，刷新即丢） */
export function storageAvailable() {
  return backendKind === 'indexeddb'
}

export function storageError() {
  return lastError
}

/** 仅供测试：丢弃连接与降级状态，下次调用重新打开 */
export function resetBackendForTests() {
  backendPromise = null
  backendKind = 'unknown'
  lastError = null
}

export async function getAll(store) {
  return (await getBackend()).getAll(store)
}

export async function get(store, key) {
  return (await getBackend()).get(store, key)
}

export async function put(store, value) {
  return (await getBackend()).put(store, value)
}

export async function add(store, value) {
  return (await getBackend()).add(store, value)
}

export async function deleteById(store, key) {
  return (await getBackend()).delete(store, key)
}

export async function clearStore(store) {
  return (await getBackend()).clear(store)
}
