/**
 * 不需要数据库的验收：后端**根本不存在**时，页面必须明着报错。
 *
 * 跑法：node e2e/probe-offline.mjs http://localhost:5194
 * （先起一个指向死端口的 vite）
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5194'
mkdirSync('e2e/shots', { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// 先看看 proxy 在 target 未监听时到底返回什么 —— 决定 api 模块能否依赖状态码
for (const path of ['/api/health', '/api/schedules']) {
  try {
    const res = await fetch(`${BASE}${path}`)
    const text = await res.text()
    console.log(
      `[probe] ${path} -> HTTP ${res.status}, content-type=${res.headers.get('content-type')}, body=${JSON.stringify(text.slice(0, 120))}`
    )
  } catch (e) {
    console.log(`[probe] ${path} -> fetch 直接失败: ${e.message}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.month', { timeout: 15000 })

check('后端不存在时页面仍然渲染出网格', await page.locator('.month').isVisible())

await page.waitForTimeout(1500)
const alert = page.locator('.backend-alert')
check('出现红色「后端未连接」告警', await alert.isVisible())
const alertText = (await alert.textContent()) ?? ''
check('告警文案正确', alertText.includes('后端未连接'))
check('告警带上了失败原因', alertText.length > '后端未连接'.length + 10)
check('告警里有重试按钮', (await alert.locator('button').count()) > 0)
check('明说不降级', alertText.includes('没有在本地兜底') || alertText.includes('不显示任何日程'))
check('不显示任何日程', (await page.locator('.seg').count()) === 0)
check('显示空态', await page.locator('.empty').isVisible())

await page.screenshot({ path: 'e2e/shots/probe-后端不存在.png' })

// 列表页也要报错，且不能白屏
await page.locator('.nav-item', { hasText: '列表' }).click()
await page.waitForTimeout(1200)
check('列表页也显示告警', await page.locator('.backend-alert').isVisible())
check('列表页没崩', await page.locator('.table').count() > 0)
check('页面无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) console.log(failed.map((f) => ` - ${f.name}`).join('\n'))
process.exit(failed.length ? 1 : 0)
