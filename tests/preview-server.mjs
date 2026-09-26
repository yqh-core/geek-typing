/**
 * 测试自举：确保 vite preview 在 127.0.0.1:4173 就绪（一键化 test:e2e / test:offline）
 *
 * - 4173 已有 Geek Typing preview 在跑 → 复用，不重启也不杀
 * - 未占用 → spawn node.exe + vite.js 直起进程（Windows 下 kill 干净，不留 shell 树）
 * - stopPreview 只杀本模块自己启动的进程（owned），复用模式不动他人进程
 *
 * host 写死 127.0.0.1：IPv6 绑定在本机会导致 ERR_CONNECTION_REFUSED。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VITE_JS = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const HOST = '127.0.0.1'
const PORT = 4173
const URL_BASE = `http://${HOST}:${PORT}`

/** 探测 4173 是否已有本站 preview（首页含 root 挂载点才算） */
async function probeOnce(timeoutMs = 800) {
  try {
    const res = await fetch(URL_BASE + '/', { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status !== 200) return false
    const body = await res.text()
    return body.includes('<div id="root">')
  } catch {
    return false
  }
}

/** 轮询直到 preview 就绪（默认上限 30s） */
async function waitForReady(deadlineMs = 30000) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (await probeOnce(1200)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/**
 * 确保就绪：复用已有或新起 preview。
 * 返回 { owned, child } —— owned=true 表示本次 spawn，调用方 finally 里调 stopPreview。
 */
export async function ensurePreviewServer() {
  if (await probeOnce()) {
    console.log('♻️  127.0.0.1:4173 已有 preview 在跑，复用不重启')
    return { owned: false, child: null }
  }
  const child = spawn(
    process.execPath,
    [VITE_JS, 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  )
  child.on('error', (e) => console.error('preview 进程异常：', e))
  if (!(await waitForReady())) {
    stopPreview({ owned: true, child })
    throw new Error('vite preview 30s 内未就绪（127.0.0.1:4173）')
  }
  console.log('🚀 vite preview 已就绪（127.0.0.1:4173）')
  return { owned: true, child }
}

/** 杀掉本模块启动的 preview（Windows 下 taskkill 兜底保证进程树退出） */
export function stopPreview(server) {
  if (!server?.owned || !server.child) return
  const pid = server.child.pid
  try {
    server.child.kill()
  } catch {
    /* 已退出则忽略 */
  }
  if (process.platform === 'win32' && pid) {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } catch {
      /* taskkill 不可用则忽略（kill 已足够） */
    }
  }
}
