/**
 * 断连行为的端到端验收。跑法：node e2e/offline.mjs
 *
 * 这是本次改造最重要的一条验收：后端连不上时**绝不降级回本地存储**，
 * 必须明着报错、不显示任何数据，恢复后点「重试」能自己回来。
 *
 * **本脚本自己管后端的生死**（起 → 杀 → 再起），所以跑之前该端口必须是空的：
 * 若那里已有后端在跑，它会拒绝启动 —— 否则"杀后端"杀的是自己刚起的空壳，
 * 端口上真正的那个还活着，"停掉后端"根本没发生（这个坑踩过一次，见下）。
 *
 * 前置：前端 dev server 已起，且 /api 指向 cfg.apiPort。
 * 库名从 .env.e2e 读，库名闸门同样生效。
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

import { loadE2EConfig, guardTestDb, openMysql, clearSchedules, readSchedules } from './_db.mjs'
import { startService, killTree } from './_proc.mjs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const SHOTS = 'e2e/shots'
mkdirSync(SHOTS, { recursive: true })

const cfg = guardTestDb(loadE2EConfig())
const db = await openMysql(cfg)
const API_URL = `http://127.0.0.1:${cfg.apiPort}/api/health`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

let api = null
const children = []

/** 起一个后端子进程（用 .env.e2e 的配置），返回句柄 */
function startApi() {
  const child = startService(
    children,
    process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python',
    ['-m', 'uvicorn', 'server.main:app', '--host', '127.0.0.1', '--port', String(cfg.apiPort)],
    { GC_ENV_FILE: `${process.cwd()}/.env.e2e` }
  )
  api = child
  return child
}

/** 后端是否在应答（健康检查 200） */
async function apiReachable() {
  try {
    return (await fetch(API_URL)).ok
  } catch {
    return false
  }
}

async function waitForApi(up = true, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if ((await apiReachable()) === up) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** 收尾：把本脚本起的后端连同它的子进程一起收掉 */
function stopApi() {
  killTree(api)
  api = null
}

/* ---------- 准备：先确认端口是空的，再由本脚本起后端 ---------- */
if (await apiReachable()) {
  console.error('='.repeat(56))
  console.error(`[拒绝执行] ${cfg.apiPort} 上已经有后端在跑。`)
  console.error('本脚本要自己起、自己杀后端，端口被占的话"停掉后端"这一步不会真的发生。')
  console.error('先把那个后端停掉（或让 run-all.mjs 统一调度），再重跑。')
  console.error('='.repeat(56))
  await db.end()
  process.exit(1)
}

startApi()
if (!(await waitForApi(true))) {
  console.error(`[e2e] 后端没能在 ${cfg.apiPort} 起来，检查 .env.e2e 与 MySQL`)
  stopApi()
  await db.end()
  process.exit(1)
}

await clearSchedules(db)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.month')

// 通过 UI 新建一条，确认后端写通
await page.locator('.toolbar button', { hasText: /新建日程/ }).click()
await page.waitForTimeout(400)
await page.locator('.ant-modal-content input').first().fill('断连测试条目')
await page.locator('.ant-modal-content button', { hasText: /^保\s*存$/ }).click()
await page.waitForTimeout(800)

check('后端正常时没有「后端未连接」告警', (await page.locator('.backend-alert').count()) === 0)
check('新建的数据落到了 MySQL', (await readSchedules(db)).some((s) => s.title === '断连测试条目'))

/* ---------- 1. 停掉后端 ---------- */
// 必须杀整棵进程树：api.pid 是 cmd.exe，只杀它的话 uvicorn 还活着、端口还占着，
// 后面"后端不可达"的等待会一直失败（见 _proc.mjs 的说明）
killTree(api)
// 等它真的不可达
if (!(await waitForApi(false))) {
  console.error('[e2e] 后端没能停下，无法验证断连行为')
  await browser.close()
  await db.end()
  process.exit(1)
}

/* ---------- 2. 刷新：必须明着报错，且不显示数据 ---------- */
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const alert = page.locator('.backend-alert')
check('后端停掉后出现「后端未连接」告警', await alert.isVisible())
check('告警里写了原因', (await alert.textContent()).includes('后端未连接'))
check('告警里有重试按钮', (await alert.locator('button', { hasText: /重\s*试/ }).count()) > 0)
check('断连时不显示任何日程', (await page.locator('.seg').count()) === 0)
check('断连时显示空态而不是白屏', await page.locator('.month').isVisible())
check('断连时没有静默降级（列表页也不该有数据）', (await page.locator('.seg').count()) === 0)

await page.screenshot({ path: `${SHOTS}/offline-断连告警.png` })

/* ---------- 3. 重启后端 + 点重试：自己回来 ---------- */
api = startApi()
if (!(await waitForApi(true))) {
  console.error('[e2e] 后端没能重启')
  await browser.close()
  await db.end()
  process.exit(1)
}

await alert.locator('button', { hasText: /重\s*试/ }).click()
await page.waitForTimeout(1200)

check('点重试后告警消失', (await page.locator('.backend-alert').count()) === 0)
check('点重试后数据回来了', (await page.locator('.seg').count()) > 0)
check('恢复后 MySQL 里的数据没被动过', (await readSchedules(db)).some((s) => s.title === '断连测试条目'))

await page.screenshot({ path: `${SHOTS}/offline-恢复后.png` })

await browser.close()
await db.end()
killTree(api)

const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) console.log(failed.map((f) => ` - ${f.name}`).join('\n'))
process.exit(failed.length ? 1 : 0)
