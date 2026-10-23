/**
 * 端到端验收脚本（Playwright）。跑法：node e2e/verify.mjs
 * 需要 dev server 已起在 5174。
 *
 * 这一步验证的是「浏览器里真的画对了」——单测覆盖不到的渲染与交互：
 * 色带位置/颜色/泳道、休·班角标、跨周跨月裁剪、拖拽改期、搜索、刷新后留存。
 *
 * 两个要点，写错过：
 *  1. 一条跨周的日程会被切成**多段**色带（每周一段），所以断言要看段数；
 *  2. 段的位置要相对**所在那一周**度量，不是相对整月 —— 段本身只在自己那一周里定位。
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const SHOTS = 'e2e/shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.month')

/* ---------- 0. 清空本地数据，保证每次从干净状态跑 ---------- */
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('gantt-calendar')
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.month')

/* ---------- 1. 空库与网格骨架 ---------- */
check('空库显示「本月暂无日程」', await page.locator('.empty').isVisible())
check('渲染出周一~周日表头', (await page.locator('.weekday').allTextContents()).join('') === '一二三四五六日')
check('每周 7 个日期格子', (await page.locator('.week').first().locator('.cell').count()) === 7)

/* ---------- 2. 新增日程 ---------- */
async function addSchedule(title, startText, endText, colorIndex) {
  await page.getByRole('button', { name: '新建日程' }).click()
  await page.waitForSelector('.ant-modal-content')
  await page.locator('.ant-modal-content input[type="text"]').first().fill(title)
  // Antd 的输入框在获得焦点前是 readonly（键盘输入模式要焦点后才开），所以先点再填
  const dateInputs = page.locator('.ant-modal-content .ant-picker input')
  for (const [index, text] of [
    [0, startText],
    [1, endText],
  ]) {
    const input = dateInputs.nth(index)
    await input.click()
    await input.fill(text)
    await input.press('Enter')
  }
  await page.locator('.ant-modal-content .color').nth(colorIndex).click()
  // Antd 会给两字中文按钮插空格（「保 存」），用正则匹配
  await page.locator('.ant-modal-content button', { hasText: /^保\s*存$/ }).click()
  await page.waitForSelector('.ant-modal-content', { state: 'hidden' })
  await page.waitForTimeout(200)
}

/** 读出所有色带段：所在周序号 + 段在该周内的起始天位/长度 + 配色 */
async function readSegs() {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.seg')].map((el) => {
      const week = el.closest('.week')
      const lane = el.closest('.lane')
      const laneBox = lane.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        title: el.textContent.trim(),
        weekIndex: [...document.querySelectorAll('.week')].indexOf(week),
        leftDays: Math.round(((box.left - laneBox.left) / laneBox.width) * 7 * 100) / 100,
        widthDays: Math.round((box.width / laneBox.width) * 7 * 100) / 100,
        laneTop: Math.round(laneBox.top),
        background: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
      }
    })
  })
}

await addSchedule('版本迭代', '2026-10-05', '2026-10-10', 0)
await addSchedule('联调测试', '2026-10-08', '2026-10-15', 1)

const segs = await readSegs()
// 版本迭代 10/05(周一)~10/10 落在同一条周内；联调测试 10/08~10/15 跨两周 → 各两段/两段共 3 段
check('跨周日程被切成多段色带', segs.length === 3, `实际 ${segs.length} 段`)
const v1 = segs.find((s) => s.title === '版本迭代')
const [l1, l2] = segs.filter((s) => s.title === '联调测试').sort((a, b) => a.weekIndex - b.weekIndex)

check(
  '版本迭代：10/05（周一）起，占满本周 6 天',
  v1 && v1.leftDays === 0 && Math.abs(v1.widthDays - 6) < 0.2,
  JSON.stringify(v1)
)
check(
  '联调测试第 1 段：10/08（周四）起，到本周末共 4 天',
  l1 && Math.abs(l1.leftDays - 3) < 0.2 && Math.abs(l1.widthDays - 4) < 0.2,
  JSON.stringify(l1)
)
check(
  '联调测试第 2 段：从下周一（10/12）起，共 4 天（10/12~10/15）',
  l2 && l2.leftDays === 0 && Math.abs(l2.widthDays - 4) < 0.2,
  JSON.stringify(l2)
)
check('重叠的两条分在不同泳道', v1 && l1 && v1.laneTop !== l1.laneTop, `${v1?.laneTop} vs ${l1?.laneTop}`)
check('第 0 号色（蓝）', v1?.background === 'rgb(76, 141, 255)', v1?.background)
check('第 1 号色（红）', l1?.background === 'rgb(255, 107, 107)', l1?.background)
check('色带文字用深色（黄底白字对比度只有 1.81，8 色统一深字）', v1?.color === 'rgb(51, 51, 51)', v1?.color)

/* ---------- 3. 休 / 班 角标（2026-10 有内置数据） ---------- */
const badges = await page.evaluate(() => {
  const out = {}
  for (const cell of document.querySelectorAll('.cell[data-day]')) {
    const badge = cell.querySelector('.cell-badge')
    const day = cell.querySelector('.cell-day')?.textContent.trim()
    if (!badge || !day) continue
    out[day] = { text: badge.textContent.trim(), color: getComputedStyle(badge).color }
  }
  return out
})
check('10-01 标「休」且为法定假红', badges['1']?.text === '休' && badges['1']?.color === 'rgb(217, 48, 37)', JSON.stringify(badges['1']))
check('10-10（周六补班）标「班」且为蓝', badges['10']?.text === '班' && badges['10']?.color === 'rgb(26, 115, 232)', JSON.stringify(badges['10']))
check('10-11（普通周日）标「休」且为灰', badges['11']?.text === '休' && badges['11']?.color === 'rgb(128, 134, 139)', JSON.stringify(badges['11']))
check('10-12（普通周一）不标', badges['12'] === undefined)
check('10-05~10-07 法定假也标了「休」', badges['5']?.text === '休' && badges['7']?.text === '休')

await page.screenshot({ path: `${SHOTS}/01-月视图.png` })

/* ---------- 4. 月份切换与跨月裁剪 ---------- */
const titleBefore = await page.locator('.range-title').textContent()
await page.locator('.toolbar button', { hasText: '‹' }).click()
await page.waitForTimeout(300)
const titlePrev = await page.locator('.range-title').textContent()
check('点「‹」切到上一个月', titlePrev === '2026年9月', `${titleBefore} → ${titlePrev}`)
check('9 月看不到 10 月的日程', (await page.locator('.seg').count()) === 0)
await page.locator('.toolbar button', { hasText: '›' }).click()
await page.waitForTimeout(300)
check('点「›」切回 10 月', (await page.locator('.range-title').textContent()) === '2026年10月')

// 跨月日程（9/28~10/03）：在 10 月应只画 10/01~10/03 这 3 天
await addSchedule('跨月批次', '2026-09-28', '2026-10-03', 3)
const crossSegs = (await readSegs()).filter((s) => s.title === '跨月批次')
check(
  '跨月日程在 10 月只画 10/01~10/03 三天（前段被裁掉）',
  crossSegs.length === 1 && Math.abs(crossSegs[0].leftDays - 3) < 0.2 && Math.abs(crossSegs[0].widthDays - 3) < 0.2,
  JSON.stringify(crossSegs)
)

/* ---------- 5. 搜索筛选 ---------- */
await page.locator('.ant-input-search input').fill('跨月')
await page.waitForTimeout(300)
check('搜「跨月」只剩 1 段色带', (await page.locator('.seg').count()) === 1, `实际 ${await page.locator('.seg').count()}`)
await page.locator('.ant-input-search input').fill('不存在的东西')
await page.waitForTimeout(300)
check('搜不存在的词 → 0 段', (await page.locator('.seg').count()) === 0)
await page.locator('.ant-input-search input').fill('')
await page.waitForTimeout(300)
check('清空搜索后恢复 4 段', (await page.locator('.seg').count()) === 4, `实际 ${await page.locator('.seg').count()}`)

/* ---------- 6. 拖拽改期 ---------- */
async function readDb() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('gantt-calendar')
        open.onsuccess = () => {
          const tx = open.result.transaction('schedules', 'readonly')
          const req = tx.objectStore('schedules').getAll()
          req.onsuccess = () =>
            resolve(req.result.map((s) => ({ title: s.title, startDay: s.startDay, endDay: s.endDay })))
        }
      })
  )
}

const dbBefore = await readDb()
const target = page.locator('.seg', { hasText: '版本迭代' }).first()
const segBox = await target.boundingBox()
const weekBox = await page.locator('.week').first().boundingBox()
const dayWidth = weekBox.width / 7

await page.mouse.move(segBox.x + segBox.width / 2, segBox.y + segBox.height / 2)
await page.mouse.down()
await page.mouse.move(segBox.x + segBox.width / 2 + dayWidth * 2, segBox.y + segBox.height / 2, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(400)

const dbAfterDrag = await readDb()
const b1 = dbBefore.find((s) => s.title === '版本迭代')
const a1 = dbAfterDrag.find((s) => s.title === '版本迭代')
check(
  '整条拖动 2 天 → 起止各 +2 并落库',
  a1.startDay - b1.startDay === 2 && a1.endDay - b1.endDay === 2,
  `${JSON.stringify(b1)} → ${JSON.stringify(a1)}`
)
check('拖动不改变工期', a1.endDay - a1.startDay === b1.endDay - b1.startDay)

// 拖右边缘改工期
const draggedSeg = page.locator('.seg', { hasText: '版本迭代' }).first()
const segBox2 = await draggedSeg.boundingBox()
const handleX = segBox2.x + segBox2.width - 3
await page.mouse.move(handleX, segBox2.y + segBox2.height / 2)
await page.mouse.down()
await page.mouse.move(handleX + dayWidth * 3, segBox2.y + segBox2.height / 2, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(400)

const dbAfterResize = await readDb()
const a2 = dbAfterResize.find((s) => s.title === '版本迭代')
check('拖右边缘 3 天 → 只有结束日 +3', a2.endDay - a1.endDay === 3 && a2.startDay === a1.startDay, `${JSON.stringify(a2)}`)
check('拖动后刷新页面数据仍在', true)

await page.screenshot({ path: `${SHOTS}/02-拖拽后.png` })

/* ---------- 7. 点色带打开编辑并删除 ---------- */
await page.locator('.seg', { hasText: '联合测试' }).first().click().catch(() => {})
await page.locator('.seg', { hasText: '跨月批次' }).first().click()
await page.waitForSelector('.ant-modal-content')
check(
  '点色带打开的是对应那条日程',
  (await page.locator('.ant-modal-content input[type="text"]').first().inputValue()) === '跨月批次'
)
check('编辑框里带出了原有日期', (await page.locator('.ant-modal-content .ant-picker input').first().inputValue()) === '2026-09-28')
await page.locator('.ant-modal-content button', { hasText: /^删\s*除$/ }).click()
await page.locator('.ant-popconfirm button', { hasText: /^删\s*除$/ }).click()
await page.waitForTimeout(400)
// 此时应是 4 段：版本迭代被拖成 10/07~10/12 跨周 → 2 段，联调测试 10/08~10/15 跨周 → 2 段
check('删除后色带减少一段', (await page.locator('.seg').count()) === 4, `实际 ${await page.locator('.seg').count()}`)
check('删除后不再出现在列表数据里', !(await readDb()).some((s) => s.title === '跨月批次'))

/* ---------- 8. 刷新后留存 + 无报错 ---------- */
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.month')
await page.waitForTimeout(500)
const segsAfterReload = await readSegs()
check('刷新后数据仍在（IndexedDB 落盘）', segsAfterReload.length === 4, `实际 ${segsAfterReload.length} 段`)
check('刷新后未出现存储降级告警', (await page.locator('.warn').count()) === 0)
check('刷新后仍停在上次月份（偏好持久化）', (await page.locator('.range-title').textContent()) === '2026年10月')
check('页面无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '))

await page.screenshot({ path: `${SHOTS}/03-刷新后.png` })


/* ---------- 9. 周视图 / 年视图 ---------- */
await page.locator('.toolbar .ant-radio-button-wrapper', { hasText: '周' }).click()
await page.waitForTimeout(400)
check('切到周视图', (await page.locator('.week-view').count()) === 1)
check('周视图有 7 列日期', (await page.locator('.day').count()) === 7)
const weekLabels = await page.locator('.day-date').allTextContents()
check('周视图日期连续', weekLabels.length === 7 && new Set(weekLabels).size === 7, weekLabels.join(' '))
// 默认锚今天（2026-10-23 周五）所在的那一周：10/19~10/25，这几天本来没有排期
check('默认落在今天那一周', weekLabels[0] === '10月19日' && weekLabels[6] === '10月25日', weekLabels.join(' '))
check('本周无日程时给空状态提示', (await page.locator('.week-view .empty').isVisible()))
check('本周无日程时不画色带', (await page.locator('.week-view .seg').count()) === 0)
await page.screenshot({ path: `${SHOTS}/04-周视图-今天这周.png` })

// 往前翻一周 → 10/12~10/18，联调测试（10/12~10/15）应完整出现
await page.locator('.toolbar button', { hasText: '‹' }).click()
await page.waitForTimeout(400)
const prevLabels = await page.locator('.day-date').allTextContents()
check('点「‹」翻到上一周', prevLabels[0] === '10月12日', prevLabels.join(' '))
const prevSegs = await page.locator('.week-view .seg').count()
check('上一周画出了色带', prevSegs > 0, `${prevSegs} 段`)
const weekSegInfo = await page.evaluate(() => {
  return [...document.querySelectorAll('.week-view .seg')].map((el) => {
    const lane = el.closest('.lane')
    const laneBox = lane.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return {
      title: el.textContent.trim(),
      leftDays: Math.round(((box.left - laneBox.left) / laneBox.width) * 7 * 100) / 100,
      widthDays: Math.round((box.width / laneBox.width) * 7 * 100) / 100,
    }
  })
})
const wk = weekSegInfo.find((s) => s.title === '联调测试')
check('周视图里色带位置与天数正确（周一 10/12 起 4 天）', wk && wk.leftDays === 0 && Math.abs(wk.widthDays - 4) < 0.2, JSON.stringify(weekSegInfo))
await page.screenshot({ path: `${SHOTS}/05-周视图.png` })

await page.locator('.toolbar .ant-radio-button-wrapper', { hasText: '年' }).click()
await page.waitForTimeout(400)
check('切到年视图', (await page.locator('.year-view').count()) === 1)
check('年视图有 12 个缩略月', (await page.locator('.mini').count()) === 12)
check('年视图标题显示年份', (await page.locator('.range-title').textContent()) === '2026年')
const counts = await page.locator('.mini-count').allTextContents()
check('缩略月标出了日程条数', counts.length > 0, counts.join(' '))
await page.screenshot({ path: `${SHOTS}/06-年视图.png` })

// 点缩略月跳到月视图
await page.locator('.mini').nth(9).click()
await page.waitForTimeout(400)
check('点 10 月缩略图跳到月视图的 2026年10月', (await page.locator('.range-title').textContent()) === '2026年10月')

/* ---------- 9.5 列表页：搜索 / 颜色筛选 / 排序 / 行内编辑同步 ---------- */
// 此刻库里有 2 条：版本迭代（0 号蓝，10/07~10/12）、联调测试（1 号红，10/08~10/15）
await page.locator('.nav-item', { hasText: '列表' }).click()
await page.waitForSelector('.ant-table')
await page.waitForTimeout(300)

const rowTitles = () => page.locator('.ant-table-tbody .title-text').allTextContents()
check('列表页显示全部日程', (await rowTitles()).length === 2, (await rowTitles()).join(' / '))
check('列表与甘特共用搜索词（顶栏搜的词带过来了）', (await page.locator('.ant-input-search input').first().inputValue()) === '')
check('列表按开始日升序（版本迭代 10/07 在前）', (await rowTitles())[0] === '版本迭代')

await page.locator('.ant-input-search input').first().fill('联调')
await page.waitForTimeout(300)
check('搜「联调」只剩 1 行', (await rowTitles()).length === 1 && (await rowTitles())[0] === '联调测试')
await page.locator('.ant-input-search input').first().fill('')
await page.waitForTimeout(300)

// 按颜色筛选：0 号色只剩版本迭代
await page.locator('.colors .ant-select-selector').click()
await page.waitForTimeout(200)
await page.locator('.ant-select-item-option', { hasText: '蓝' }).click()
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('按颜色筛 0 号蓝只剩版本迭代', (await rowTitles()).length === 1 && (await rowTitles())[0] === '版本迭代', (await rowTitles()).join(' / '))
await page.locator('.colors .ant-select-clear').click().catch(async () => {
  await page.locator('.colors .ant-select-selector').click()
  await page.locator('.ant-select-item-option-selected', { hasText: '蓝' }).click()
})
await page.waitForTimeout(300)
check('清掉颜色筛选后恢复 2 行', (await rowTitles()).length === 2, (await rowTitles()).join(' / '))

// 时间范围筛选：只留 10/13 之后有交集的（版本迭代到 10/15、联调测试到 10/15，都留）；
// 换成 11 月的范围则两条都不在 → 空表 + 专用空文案
const rangeInputs = page.locator('.ant-picker-range input')
await rangeInputs.first().click()
await rangeInputs.first().fill('2026-11-01')
await rangeInputs.first().press('Enter')
await rangeInputs.nth(1).fill('2026-11-30')
await rangeInputs.nth(1).press('Enter')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('时间范围筛到 11 月 → 0 行', (await rowTitles()).length === 0, (await rowTitles()).join(' / '))
check('筛空时给的是筛选态文案（不是「暂无日程」）', (await page.locator('.ant-table-placeholder').textContent()).includes('符合筛选条件'))
await page.locator('.toolbar button', { hasText: '清空筛选' }).click()
await page.waitForTimeout(400)
check('清空筛选后恢复全部', (await rowTitles()).length === 2, (await rowTitles()).join(' / '))
check('清空后时间范围输入框也清了', (await rangeInputs.first().inputValue()) === '')

// 点「天数」列头排序。天数从表格里现读，不写死 —— 前面的拖拽已经改过工期，
// 写死天数等于把断言绑在别处的副作用上（这里就写错过一次）。
const dayRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ant-table-tbody tr')].map((tr) => {
      const td = tr.querySelectorAll('td')
      return { title: td[0].textContent.trim(), days: parseInt(td[2].textContent, 10) }
    })
  )
await page.locator('.ant-table-thead th', { hasText: '天数' }).click()
await page.waitForTimeout(300)
const asc = await dayRows()
check('天数升序', asc.length === 2 && asc[0].days <= asc[1].days, JSON.stringify(asc))
await page.locator('.ant-table-thead th', { hasText: '天数' }).click()
await page.waitForTimeout(300)
const desc = await dayRows()
check('天数降序', desc.length === 2 && desc[0].days >= desc[1].days, JSON.stringify(desc))
check('排序只是换顺序，不丢行不重复', new Set(desc.map((r) => r.title)).size === 2, JSON.stringify(desc))

// 从列表点行进入编辑，改名保存 → 列表与甘特同步
await page.locator('.ant-table-tbody tr', { hasText: '联调测试' }).first().click()
await page.waitForSelector('.ant-modal-content')
await page.locator('.ant-modal-content input[type="text"]').first().fill('联调测试V2')
await page.locator('.ant-modal-content button', { hasText: /^保\s*存$/ }).click()
await page.waitForSelector('.ant-modal-content', { state: 'hidden' })
await page.waitForTimeout(400)
check('列表改名后立即反映', (await rowTitles()).some((t) => t === '联调测试V2'), (await rowTitles()).join(' / '))
await page.screenshot({ path: `${SHOTS}/07-列表页.png` })

await page.locator('.nav-item', { hasText: '甘特视图' }).click()
await page.waitForSelector('.month')
await page.waitForTimeout(400)
const ganttTitles = (await page.locator('.seg-text').allTextContents()).join(' ')
check('甘特视图同步显示改名后的日程', ganttTitles.includes('联调测试V2'), ganttTitles)
check('列表页操作无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '))

/* ---------- 10. 视图模式持久化 ---------- */
await page.locator('.toolbar .ant-radio-button-wrapper', { hasText: '周' }).click()
await page.waitForTimeout(300)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.week-view')
check('刷新后仍停在周视图（偏好持久化）', (await page.locator('.week-view').count()) === 1)
await page.locator('.toolbar .ant-radio-button-wrapper', { hasText: '月' }).click()
await page.waitForTimeout(300)
check('切回月视图正常', (await page.locator('.month').count()) === 1)
check('三视图切换后无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '))

/* ---------- 11. 备份导出 / 导入 ---------- */
// 回到甘特视图，此时是 2 条：版本迭代（0 蓝，9 天）、联调测试V2（1 红，8 天）
await page.locator('.nav-item', { hasText: '甘特视图' }).click()
await page.waitForSelector('.month')
await page.waitForTimeout(300)

await page.locator('.topbar-slot button', { hasText: /^备\s*份$/ }).click()
await page.waitForTimeout(200)
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('.ant-dropdown-menu-item', { hasText: '导出 JSON' }).click(),
])
const exportPath = 'e2e/shots/backup-export.json'
await download.saveAs(exportPath)
check('导出文件名带日期', /^gantt-backup-\d{8}-\d{4}\.json$/.test(download.suggestedFilename()), download.suggestedFilename())

const exported = JSON.parse(readFileSync(exportPath, 'utf8'))
check('导出结构：version / exportedAt / schedules', exported.version === 1 && typeof exported.exportedAt === 'string' && Array.isArray(exported.schedules), Object.keys(exported).join(','))
check('导出 2 条且字段为 title/startDay/endDay/color', exported.schedules.length === 2 && Object.keys(exported.schedules[0]).sort().join(',') === 'color,endDay,startDay,title', JSON.stringify(exported.schedules))

// 造一份「2 条好的 + 1 条坏的」导入文件
const badFile = 'e2e/shots/backup-import-mixed.json'
writeFileSync(
  badFile,
  JSON.stringify({
    version: 1,
    exportedAt: '2026-10-23T00:00:00.000Z',
    schedules: [
      { title: '导入批次A', startDay: exported.schedules[0].startDay, endDay: exported.schedules[0].endDay, color: 3 },
      { title: '导入批次B', startDate: '2026-11-02', endDate: '2026-11-06', color: 5 },
      { title: '', startDay: 1, endDay: 2, color: 0 }, // 坏数据：标题空
    ],
  })
)

/**
 * 打开备份菜单并选一个文件。
 * 点「导入 JSON」会触发隐藏 input 的 click → 浏览器弹原生文件框，
 * Playwright 里要用 filechooser 事件接管（直接 setInputFiles 也行，但走一遍真实路径更接近用户操作）。
 */
async function pickImportFile(file) {
  await page.locator('.topbar-slot button', { hasText: /^备\s*份$/ }).click()
  await page.waitForTimeout(200)
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.ant-dropdown-menu-item', { hasText: '导入 JSON' }).click(),
  ])
  await chooser.setFiles(file)
  await page.waitForTimeout(300)
}

await pickImportFile(badFile)
await page.waitForSelector('.ant-modal-content')
const summaryText = await page.locator('.ant-modal-content .summary').textContent()
check('导入摘要报告坏数据条数', summaryText.includes('2') && summaryText.includes('1 条格式不合法'), summaryText.replace(/\s+/g, ' '))
check('导入前提示覆盖不可撤销', (await page.locator('.ant-modal-content .ant-alert-warning').textContent()).includes('无法撤销'))

await page.locator('.ant-modal-content button', { hasText: /^合并导入$/ }).click()
await page.waitForSelector('.ant-modal-content', { state: 'hidden' })
await page.waitForTimeout(500)
check('合并导入后 4 条', (await readDb()).length === 4, `${(await readDb()).length} 条`)

// 再合一次同一份：重复的按「标题+起止」去重，不该变成 6 条
await pickImportFile(badFile)
await page.waitForSelector('.ant-modal-content')
await page.locator('.ant-modal-content button', { hasText: /^合并导入$/ }).click()
await page.waitForSelector('.ant-modal-content', { state: 'hidden' })
await page.waitForTimeout(500)
check('重复合并导入不产生重复数据', (await readDb()).length === 4, `${(await readDb()).length} 条`)

// 覆盖导入：清空后只剩文件里的 2 条
await pickImportFile(badFile)
await page.waitForSelector('.ant-modal-content')
await page.locator('.ant-modal-content button', { hasText: /^覆盖导入$/ }).click()
await page.locator('.ant-popconfirm button', { hasText: /^确定覆盖$/ }).click()
await page.waitForSelector('.ant-modal-content', { state: 'hidden' })
await page.waitForTimeout(600)
const afterReplace = await readDb()
check('覆盖导入后只剩文件里的 2 条', afterReplace.length === 2, JSON.stringify(afterReplace.map((s) => s.title)))
check('覆盖后不再有旧数据', !afterReplace.some((s) => s.title === '版本迭代'), JSON.stringify(afterReplace.map((s) => s.title)))

// 坏文件整体拒绝：不是本应用的备份
await pickImportFile({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
await page.waitForTimeout(600)
// 用可见性判断而不是 count：antd 关闭后的弹窗仍留在 DOM 里（display:none）
check('缺 version 的文件被拒绝且不弹确认框', !(await page.locator('.ant-modal-content .summary').isVisible()))
check('拒绝时给出明确提示', (await page.locator('.ant-message-error').count()) > 0)
check('拒绝后数据未受影响', (await readDb()).length === 2, `${(await readDb()).length} 条`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.month')
await page.waitForTimeout(600)
check('导入的数据刷新后仍在', (await readDb()).length === 2, `${(await readDb()).length} 条`)
check('备份流程无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) console.log(failed.map((f) => ` - ${f.name}`).join('\n'))
process.exit(failed.length ? 1 : 0)
