/**
 * e2e 直接读 MySQL 的工具。共用给 verify.mjs / offline.mjs。
 *
 * 为什么不走 /api/schedules 读：被测对象不能同时当测量工具。
 * 读接口一坏，所有断言会一起红，定位难度飙升；直接查库还能顺带验证
 * 「数据真的落进 MySQL 了」这条最终事实，与 UI 断言形成交叉验证。
 *
 * 依赖用 web/node_modules 里已有的 mysql2，不给前端加依赖。
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')

/** 读 web/.env.e2e（不存在则退回 web/.env）里的 DB_* 与 API_PORT */
export function loadE2EConfig() {
  const file = ['.env.e2e', '.env'].map((n) => join(WEB_DIR, n)).find((p) => existsSync(p))
  const env = {}
  if (file) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].trim()
    }
  }
  return {
    host: process.env.DB_HOST || env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || env.DB_PORT || 3306),
    user: process.env.DB_USER || env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || env.DB_NAME || '',
    apiPort: Number(process.env.API_PORT || env.API_PORT || 8010),
  }
}

/**
 * 库名闸门。**这是防止误删真实排期的唯一屏障**，不要为了跑通而放宽。
 * 本脚本会 DELETE FROM schedule，库名不对时的代价是不可逆的。
 */
export function guardTestDb(cfg) {
  const name = cfg.database || ''
  if (!/_e2e$/i.test(name)) {
    console.error('='.repeat(56))
    console.error(`[拒绝执行] DB_NAME 必须是 *_e2e 测试库，当前是 ${name || '(空)'}`)
    console.error('本脚本会清空 schedule 表，为避免误删你的真实排期，只允许跑在测试库上。')
    console.error('请复制 web/.env.e2e.example 为 web/.env.e2e 并填好，然后重跑。')
    console.error('='.repeat(56))
    process.exit(1)
  }
  return cfg
}

export async function openMysql(cfg) {
  const mysql = require('mysql2/promise')
  // multipleStatements：只给 migrate 用（schema.sql 里是多条语句）。
  // 这里保持关闭，e2e 只跑单条查询/删除。
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
  })
  const [[row]] = await conn.query('SELECT DATABASE() AS db')
  console.log(`[e2e] 库连接成功：${row.db}（${cfg.user}@${cfg.host}:${cfg.port}）`)
  return conn
}

/** 清空 schedule 表；顺带把自增归零，让 id 相关断言稳定 */
export async function clearSchedules(conn) {
  const [[meta]] = await conn.query('SELECT DATABASE() AS db')
  const [before] = await conn.query('SELECT COUNT(*) AS n FROM `schedule`')
  // 先打印"在哪个库、要删几行"，万一闸门有漏，日志里也留得下证据
  console.log(`[e2e] 清空 ${before[0].n} 行：库 ${meta.db} 表 schedule`)
  await conn.query('DELETE FROM `schedule`')
  await conn.query('ALTER TABLE `schedule` AUTO_INCREMENT = 1')
}

/**
 * 读全部日程。列名用 AS 别名对齐前端字段，
 * 这样调用方的 s.title / s.startDay 断言一行都不用改。
 */
export async function readSchedules(conn) {
  const [rows] = await conn.query(
    // 列名是 start_date/end_date（DDL 见 sql/schema.sql）；别名对齐前端字段，
    // 这样调用方的 s.startDay 断言一行都不用改
    'SELECT title, start_date AS startDay, end_date AS endDay, color, status FROM `schedule` ORDER BY start_date, end_date, id'
  )
  return rows
}
