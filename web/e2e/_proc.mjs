/**
 * e2e 起/停服务进程的公共部分。
 *
 * 为什么不能只用 child.kill()：Windows 上我们用 shell 起命令，
 * `child.pid` 是 **cmd.exe** 的 pid，kill 它不会连带杀掉它拉起的
 * uvicorn / vite —— 孙进程会活下来继续占着端口。
 * 后果很实在：offline.mjs 会"停不掉后端"而失败，
 * 残留的 vite 还会让下一次 e2e 撞上旧代码（tasks/lessons.md 第 1 条）。
 * 所以统一走 taskkill /T（整棵进程树）。
 */
import { spawn, spawnSync } from 'node:child_process'

/** 起一个子进程并把句柄记到 children 里，方便统一收尾 */
export function startService(children, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  children.push(child)
  return child
}

/** 杀掉整棵进程树；进程已退出时静默 */
export function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* 已经退了 */
    }
    return
  }
  try {
    child.kill()
  } catch {
    /* 已经退了 */
  }
}

/** 批量收尾 */
export function killAll(children) {
  for (const child of children) killTree(child)
}

/** 端口上是否已有服务在应答 —— 用来挡住"复用旧进程"这个坑 */
export async function portBusy(port) {
  for (const host of ['127.0.0.1', 'localhost']) {
    try {
      await fetch(`http://${host}:${port}/`)
      return true
    } catch {
      /* 这个 host 不通，试下一个 */
    }
  }
  return false
}

/** 等端口空出来（杀进程后要等操作系统真的释放） */
export async function waitPortFree(port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (!(await portBusy(port))) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/** 等端口上有服务应答 */
export async function waitPortBusy(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await portBusy(port)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}
