/**
 * 测试自举：确保 vite preview 在指定端口就绪（一键化 test:e2e / test:offline）
 *
 * 所有权模型（修复 EVIDENCE-INDEX §9.4 的 flaky：复用 4173 上任何已存在的 preview）
 * ---------------------------------------------------------------------------
 * preview 起来后本模块会写一个 marker 文件 `.preview-<port>.pid`，内含：
 *   { pid, port, startedAt, nonce }
 * 复用前必须**同时**满足三个条件，缺一不可：
 *   1. marker 文件存在且 JSON 合法，port 字段与本次请求端口一致（排除手工放错的文件）
 *   2. marker 里的 pid 仍然活着（process.kill(pid, 0) 探活）
 *   3. 该 pid 确实是当前正在监听该端口的那个进程（netstat / lsof 反查）
 * 三者全中 ⇒ 这是「本项目某次调用启动、且进程仍存活」的 preview，可安全复用，但会打 warn
 * 说明本次并非独占（跨调用共享，仍有资源竞争风险）。
 *
 * 只要有一条不满足 ⇒ 一律视为**不可复用**：
 *   - 端口空着 ⇒ 自举新 preview
 *   - 端口被占但不是自己人 ⇒ **直接报错退出**，绝不静默复用
 *     （旧实现在这种情况下会复用陌生进程，正是 flaky 的根因；宁可红得明白也不要假绿）
 *
 * 残留处理：进程已死但 marker 文件残留（上次没走干净 cleanup）⇒ 探活失败 ⇒ 删掉陈旧 marker
 * 后按「端口空着」处理。端口释放到 marker 清理之间仍有极短窗口，故 [2] 的探活是必需的。
 *   marker 的**兜底自愈**就落在这条路径上：陈旧 marker 不会累积，下次启动顺手清掉。
 *
 * marker 清理的时机（这是本模块最容易写错的地方）
 * ---------------------------------------------------------------------------
 * 旧实现的问题：spawn('taskkill') 之后**立即** rmSync marker。但 taskkill 是异步子进程，
 * 此时 preview 还没真正退出，紧接着 child 的 'exit' 事件会把 marker 重新写回来，
 * 于是端口已释放、marker 却留下来（.preview-4173.pid / .preview-4174.pid 残留）。
 *
 * 现在分三条路径，各用各的正确同步性：
 *   - clearMarkerInExitHook：给 process.on('exit') 用。exit 时 event loop 已停，
 *     **只能同步删**（unlinkSync + try/catch），绝不能在这儿去 taskkill / await。
 *     其余路径都可能来不及执行，这条是「标记不残留」的最后保障。
 *   - stopPreview：同步杀掉并同步删 marker（先杀进程再删，顺序反了会被 'exit' 重写）。
 *   - killPreviewTree：异步等 taskkill 真正退出后再删 marker（需要等待时用）。
 *
 * 端口隔离：e2e 用 4173、offline 用 4174，避免两个套件抢同一端口（见各自调用处）。
 *
 * host 写死 127.0.0.1：IPv6 绑定在本机会导致 ERR_CONNECTION_REFUSED。
 */
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VITE_JS = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const HOST = '127.0.0.1'
const DEFAULT_PORT = 4173
const READY_TIMEOUT_MS = 30000

/** marker 文件路径：每个端口一个，放在仓库根（与 vite preview 的 cwd 一致） */
const markerPath = (port) => join(ROOT, `.preview-${port}.pid`)

/** 读 marker；不存在 / 损坏 / 端口不符 一律返回 null */
function readMarker(port) {
  try {
    const raw = JSON.parse(readFileSync(markerPath(port), 'utf8'))
    if (!raw || typeof raw.pid !== 'number' || raw.port !== port) return null
    return raw
  } catch {
    return null
  }
}

/** 进程是否活着（跨平台；EPERM 说明进程存在但无权限，仍算活着） */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === 'EPERM'
  }
}

/**
 * 当前监听的端口：优先 netstat（无依赖），失败回退 lsof。
 * 返回 'busy'（被占但查不到 pid）/ pid / null（空闲）。
 */
function listenPid(port) {
  const netstat = (cmd, args, parse) => {
    try {
      return parse(execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    } catch {
      return null
    }
  }

  const viaNetstat = netstat('netstat', ['-ano', '-p', 'tcp'], (out) => {
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/)
      // TCP 127.0.0.1:4173 0.0.0.0:0 LISTENING 39884
      if (cols[0] !== 'TCP' || cols[3] !== 'LISTENING') continue
      const local = cols[1] ?? ''
      const m = local.match(/:(\d+)$/)
      if (!m || Number(m[1]) !== port) continue
      const pid = Number(cols[4])
      return Number.isFinite(pid) && pid > 0 ? pid : 'busy'
    }
    return null
  })
  if (viaNetstat !== null) return viaNetstat

  return netstat('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], (out) => {
    const pid = Number(out.trim().split(/\s+/)[0])
    return Number.isFinite(pid) && pid > 0 ? pid : 'busy'
  })
}

/** 探测该端口是否已经能提供本站首页（不判所有权，只判「有没有东西在服务」） */
async function probeHttp(port, timeoutMs = 1200) {
  try {
    const res = await fetch(`http://${HOST}:${port}/`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status !== 200) return false
    const body = await res.text()
    return body.includes('<div id="root">')
  } catch {
    return false
  }
}

/** 轮询直到 preview 就绪（默认上限 30s） */
async function waitForReady(port, deadlineMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (await probeHttp(port)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/**
 * 确保就绪：端口空着 ⇒ 自举；确认是自己人 ⇒ 复用（warn）；被陌生人占 ⇒ 抛错。
 *
 * @param {{ port?: number }} [opts]
 * @returns {Promise<{ owned: boolean, child: import('node:child_process').ChildProcess|null, port: number }>}
 */
export async function ensurePreviewServer({ port = DEFAULT_PORT } = {}) {
  const marker = readMarker(port)
  const listener = listenPid(port)

  // ---- 判定复用 ----
  if (marker && isAlive(marker.pid)) {
    // marker 说这个 pid 是我们的，还要确认它确实在监听本端口（防 pid 复用/错配）
    const matches = listener === marker.pid || listener === 'busy' || listener === null
    if (matches && (await probeHttp(port))) {
      console.log(
        `♻️  127.0.0.1:${port} 已有 preview（pid ${marker.pid}，本模块启动于 ${marker.startedAt}），复用不重启`,
      )
      console.warn(
        `⚠️  复用非本次调用所启动的 preview（pid ${marker.pid}）—— 若与其它套件并发则会资源竞争；` +
          `本次不会杀掉它。需要独占请换端口（ensurePreviewServer({ port })）。`,
      )
      return { owned: false, child: null, port }
    }
  }

  // ---- 残留 marker 自愈：进程已死或端口已易主 ⇒ 顺手删掉，不让它累积 ----
  if (marker) {
    console.warn(`🧹 发现陈旧 marker（pid ${marker.pid} 已退出），清理 ${markerPath(port)}`)
    clearMarker(port, marker.pid)
  }

  // ---- 端口被占用但不是自己人：绝不静默复用 ----
  if (listener !== null) {
    const who = listener === 'busy' ? '未知进程' : `pid ${listener}`
    throw new Error(
      `端口 ${port} 已被 ${who} 占用，但它不是本模块启动的 preview（无有效 marker：${markerPath(port)}）。\n` +
        `为避免复用陌生进程导致假失败，这里直接失败。请先释放该端口（taskkill /pid <pid> /t /f），` +
        `或给本次调用换端口：ensurePreviewServer({ port: 4174 })。`,
    )
  }

  // ---- 自举 ----
  const child = spawn(
    process.execPath,
    [VITE_JS, 'preview', '--host', HOST, '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  )
  child.on('error', (e) => console.error('preview 进程异常：', e))

  // 先写 marker 再等就绪：vite 启动很慢，marker 让「同端口并发启动」能被后来的调用识别为
  // 「已被占用」，而不是两个进程一起挤 --strictPort 后互相踢。
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36)
  writeMarker(port, { pid: child.pid, port, startedAt: new Date().toISOString(), nonce })

  if (!(await waitForReady(port))) {
    await stopPreviewAsync({ owned: true, child, port }) // 内含 clearMarker
    throw new Error(`vite preview ${READY_TIMEOUT_MS / 1000}s 内未就绪（${HOST}:${port}）`)
  }
  console.log(`🚀 vite preview 已就绪（${HOST}:${port}，pid ${child.pid}）`)
  return { owned: true, child, port }
}

function writeMarker(port, data) {
  try {
    writeFileSync(markerPath(port), JSON.stringify(data, null, 2) + '\n', 'utf8')
  } catch (e) {
    console.warn(`⚠️  写 marker 失败（${markerPath(port)}）：${e?.message ?? e}`)
  }
}

/** 删 marker，但只在它确实属于本次调用时删（防误删他人的） */
function clearMarker(port, expectPid) {
  try {
    if (expectPid !== undefined) {
      const cur = readMarker(port)
      if (cur && cur.pid !== expectPid) return
    }
    unlinkSync(markerPath(port))
  } catch {
    /* 不存在 / 清不掉都留给下次的探活兜底（ensurePreviewServer 会自愈） */
  }
}

/**
 * process.on('exit') 专用：**同步**删 marker，不等待任何异步操作。
 * exit 时 event loop 已停，这里只能干同步活；任何 spawn/await 都不会被调度。
 */
export function clearMarkerInExitHook(port) {
  clearMarker(port)
}

/**
 * 同步杀掉 preview 及其子进程树，并同步清 marker。
 * 顺序很重要：先杀进程、再删 marker —— 反过来进程退出时 'exit' 事件会把 marker 写回来。
 * @returns {Promise<void>} 「进程树已确实退出」的 Promise（Windows 下等 taskkill 收尾）
 */
function killPreviewTree(pid, port) {
  if (!pid) {
    clearMarker(port)
    return Promise.resolve()
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* 已退出 */
    }
    clearMarker(port)
    return Promise.resolve()
  }

  // Windows：进程是异步退出的。先删一次 marker 让状态立即干净，再等 taskkill 真正结束
  // 后删第二次 —— 因为 preview 进程 'exit' 时会重写 marker，只删一次仍会留下残留。
  clearMarker(port)
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } catch {
      clearMarker(port)
      resolve()
      return
    }
    const done = () => {
      clearMarker(port)
      resolve()
    }
    child.on('exit', done)
    child.on('error', done)
  })
}

/**
 * 杀掉本模块启动的 preview 并清理 marker。
 *
 * 同步返回（不返回 Promise）：调用方既有 `finally { stopPreview(x) }` 也有
 * `process.on('exit', () => stopPreview(x))` —— exit 钩子里 Promise 不会被 await，
 * 所以这里必须是「一调用就把进程杀掉、把 marker 删掉」的同步语义。
 *
 * 需要确定「进程树真的退完了」时用 stopPreviewAsync。
 */
export function stopPreview(server) {
  const info = serverInfo(server)
  if (!info) return

  try {
    server.child.kill()
  } catch {
    /* 已退出则忽略 */
  }
  // 同步杀整棵树（含隐藏子进程），不等待 —— marker 已在 killPreviewTree 内同步清掉
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(info.pid), '/t', '/f'], { stdio: 'ignore' })
    } catch {
      /* taskkill 不可用则忽略（child.kill 已足够） */
    }
  }
  clearMarker(info.port, info.pid)
}

/** 同 stopPreview，但等进程树确实退出、marker 确实清干净后才 resolve */
export async function stopPreviewAsync(server) {
  const info = serverInfo(server)
  if (!info) return

  try {
    server.child.kill()
  } catch {
    /* 已退出则忽略 */
  }
  await killPreviewTree(info.pid, info.port)
}

/** 从 ensurePreviewServer 的返回值里抽出 { pid, port }；非本次调用所有则返回 null */
function serverInfo(server) {
  if (!server?.owned || !server.child?.pid) return null
  return { pid: server.child.pid, port: server.port ?? DEFAULT_PORT }
}
