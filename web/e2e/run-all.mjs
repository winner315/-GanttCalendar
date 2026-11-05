/**
 * 一条命令跑完整套端到端验收：npm run e2e
 *
 * 自己拉起后端与前端（都用 .env.e2e 的配置 + 独占端口），跑完再收掉，
 * 这样 e2e 不依赖你手工起了什么服务，也不会撞上 5174 上正在跑的真实实例
 * （lessons.md 第 1 条：旧 vite 进程会缓存模块，必须用干净进程）。
 *
 * 三层防误伤真实数据：库名闸门（_db.mjs）→ 端口闸门（下面）→ 全程只碰测试库。
 */
import { spawn } from 'node:child_process'

import { loadE2EConfig, guardTestDb } from './_db.mjs'
import { startService, killAll, killTree, portBusy, waitPortFree } from './_proc.mjs'

const cfg = guardTestDb(loadE2EConfig())
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5184)

const children = []
const start = (cmd, args, env = {}) => startService(children, cmd, args, env)
const stopAll = () => killAll(children)

process.on('exit', stopAll)
process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url)
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return false
}

const PY = process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'

console.log(`[e2e] 测试库 ${cfg.database}，后端 :${cfg.apiPort}，前端 :${VITE_PORT}`)

// 前置闸门：端口必须干净。
// 否则 vite 会"复用不了就换端口"或直接连上**上一次遗留的旧进程**——
// 旧进程内存里是编辑前的模块图，会让你对着旧代码排查（tasks/lessons.md 第 1 条）。
for (const [name, port] of [
  ['后端', cfg.apiPort],
  ['前端', VITE_PORT],
]) {
  if (await portBusy(port)) {
    console.error('='.repeat(56))
    console.error(`[拒绝执行] ${name}端口 ${port} 已被占用，那里可能有上一次遗留的服务。`)
    console.error('它可能是旧代码，会让验收结果指向错误的结论。')
    console.error(`用 netstat -ano | findstr ":${port}" 找到 PID，关掉对应进程后重跑。`)
    console.error('='.repeat(56))
    process.exit(1)
  }
}

// 1. 建库建表（都幂等）。--create-db 让首次跑 e2e 不必手工建库；
// 库名闸门已经在前面过了，这里建的必然是 *_e2e 库。
const migrated = spawn(PY, ['-m', 'server.migrate', '--db', cfg.database, '--create-db'], {
  env: { ...process.env, GC_ENV_FILE: `${process.cwd()}/.env.e2e` },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
const migrateCode = await new Promise((r) => migrated.on('exit', r))
if (migrateCode !== 0) {
  console.error('[e2e] 建表失败，先修好数据库连接再重跑')
  process.exit(1)
}

// 2. 后端
const api = start(
  PY,
  ['-m', 'uvicorn', 'server.main:app', '--host', '127.0.0.1', '--port', String(cfg.apiPort)],
  { GC_ENV_FILE: `${process.cwd()}/.env.e2e` }
)
if (!(await waitHttp(`http://127.0.0.1:${cfg.apiPort}/api/health`))) {
  console.error('[e2e] 后端没起来')
  stopAll()
  process.exit(1)
}

// 3. 前端（自己拉一个干净进程，代理指向测试后端）
start('npm.cmd', ['run', 'dev', '--', '--port', String(VITE_PORT)], {
  API_TARGET: `http://127.0.0.1:${cfg.apiPort}`,
  VITE_PORT: String(VITE_PORT),
  VITE_NO_OPEN: '1',
})
if (!(await waitHttp(`http://localhost:${VITE_PORT}/`))) {
  console.error('[e2e] 前端没起来')
  stopAll()
  process.exit(1)
}

// 4. 依次跑两个验收脚本
const env = { E2E_BASE: `http://localhost:${VITE_PORT}` }
let failed = 0
for (const script of ['e2e/verify.mjs', 'e2e/offline.mjs']) {
  // offline 脚本要靠"起/杀后端"制造断连，所以它必须自己拥有那个端口。
  // 不把这个后端让出去的话，两个脚本会抢同一个端口：offline 起的后端绑不上，
  // 它"杀"的是自己刚起的空壳，端口上真正在跑的仍是这一个 ——
  // "停掉后端"这一步根本没发生，验收会以"后端没能停下"失败（实测踩过）。
  if (script.includes('offline')) {
    killTree(api)
    if (!(await waitPortFree(cfg.apiPort))) {
      console.error(`[e2e] 后端端口 ${cfg.apiPort} 没能空出来，断连验收无法进行`)
      stopAll()
      process.exit(1)
    }
  }
  console.log(`\n[e2e] === ${script} ===`)
  const code = await new Promise((r) => start('node', [script], env).on('exit', r))
  if (code !== 0) failed++
}

stopAll()
console.log(failed ? `\n[e2e] 有 ${failed} 个脚本失败` : '\n[e2e] 全部通过')
process.exit(failed ? 1 : 0)
