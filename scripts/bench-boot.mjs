#!/usr/bin/env node
/* P1.7-Wave5 · D-1 Boot 基准（bench-boot）
 *
 * 测什么：构建产物（dist）在真实 Chrome 里的「整页导航 → 首页面板可交互」耗时，
 * 双档（计划 D-1：桌面数字不外推手机）：
 *   Desktop：1280×800，无 CPU 节流
 *   Mobile ：412×915 设备仿真 + Emulation.setCPUThrottlingRate(4)（中端手机近似）
 *
 * 口径（重要，写清楚避免误读）：
 *   boot = performance.now() 在 [data-testid="home-panel"] 首次出现那一刻的读数，
 *   即「导航起点 → React 挂载首页面板」的毫秒数。时间戳由
 *   Page.addScriptToEvaluateOnNewDocument 注入的 MutationObserver 记录
 *   （微任务粒度，误差 < 1ms），显式轮询 window.__gt_boot 读取 —— **绝不用
 *   networkidle**（tests/e2e.mjs:72-84 实测它会因 SW precache + warmUpVocabulary
 *   预拉 1.4MB 而卡死 25 分钟）。
 *   测量条件：同一 Chrome 实例、同一 profile，首轮预热样本丢弃（SW precache 与
 *   chunk 磁盘缓存落定）后连续采样 —— 度量的是应用启动执行/渲染成本，本地
 *   preview 无网络方差，故这是可复现的口径，不是「用户首次到访」口径。
 *
 * 为什么不进 CI：① 本机 Esafenet 透明加密驱动让 IO/调度抖动大（见 bench-content
 * 文件头），CI runner 也没有 Chrome 保证；② boot 数字随 runner 硬件漂移，做 CI
 * 判据会假红/假绿。因此本脚本只在本机出基线数字，perf-baseline.json 的 boot 字段
 * 仅作趋势对照，gate-perf 不对 boot 做 CI 判红（预算表中 boot 行标记 baseline-only）。
 *
 * 基建复用：preview 复用 tests/preview-server.mjs（端口 4182 避让 e2e 4173 /
 * offline 4174 / a11y 4181）；CDP 原始 WebSocket 会话照抄
 * scripts/audit-capture-full.mjs:96-173（spawn chrome + /json/version 探活 +
 * Session + connect）；设备仿真照抄同文件 202-207。setCPUThrottlingRate 为本脚本
 * 新增用法（仓库首例）。
 *
 * 用法：先 build（git clean -xdf dist && CODEBUDDY_SAFE_DELETE_ENABLED=0 npx vite build），
 * 再 node scripts/bench-boot.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ensurePreviewServer, stopPreview } from '../tests/preview-server.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'docs', 'audit-package', '_generated', 'perf-baseline.json')

const PORT = 4182          // preview 端口（避让 4173/4174/4181）
const CDP_PORT = 9223      // chrome remote-debugging 端口
const WARMUP = 2           // 预热样本（丢弃：SW precache + 磁盘缓存落定）
const SAMPLES = 12         // 每档采样次数（≥10）
const WAIT_TIMEOUT_MS = 60000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 找 Chrome（与 tests/e2e.mjs findChrome 同源） ---------------- */

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const dir of readdirSync(agents)) {
      const exe = join(agents, dir, 'chrome.exe')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      for (const sub of ['chrome-linux', 'chrome-win', 'chrome-win64']) {
        const exe = join(pwRoot, dir, sub, sub === 'chrome-linux' ? 'chrome' : 'chrome.exe')
        if (existsSync(exe)) candidates.unshift(exe)
      }
    }
  }
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('找不到 Chrome：设 CHROME_PATH 或安装系统 Chrome')
  return found
}

/* ---------------- CDP 原始会话（照抄 audit-capture-full.mjs） ---------------- */

class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('timeout ' + method))
        }
      }, 30000)
    })
  }
}

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  return new Session(ws)
}

/** 注入到每个新文档：记录 home-panel 首次出现的 performance.now()（微任务粒度） */
const BOOT_PROBE = `(function () {
  window.__gt_boot = 0;
  function check() {
    if (!window.__gt_boot && document.querySelector('[data-testid="home-panel"]')) {
      window.__gt_boot = performance.now();
    }
  }
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
  check();
})()`

/** 显式等待 __gt_boot（轮询读取，不依赖 networkidle 这类假信号） */
const BOOT_WAIT = `(async () => {
  while (!window.__gt_boot) {
    await new Promise((r) => setTimeout(r, 25));
    if (performance.now() > ${WAIT_TIMEOUT_MS}) return -1;
  }
  return window.__gt_boot;
})()`

async function sampleBoot(base, tab) {
  const s = await connect(tab.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT_PROBE })
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: tab.vp.w,
    height: tab.vp.h,
    deviceScaleFactor: tab.vp.dsf,
    mobile: tab.vp.mobile,
  })
  if (tab.vp.cpu > 0) await s.send('Emulation.setCPUThrottlingRate', { rate: tab.vp.cpu })
  await s.send('Page.navigate', { url: base + '/' })
  const r = await s.send('Runtime.evaluate', {
    expression: BOOT_WAIT,
    awaitPromise: true,
    returnByValue: true,
  })
  const boot = r.result?.value
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`, { method: 'GET' }) } catch {}
  if (typeof boot !== 'number' || boot < 0) throw new Error('boot 探针超时：60s 内 home-panel 未出现')
  return boot
}

function percentile(sorted, q) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length))) - 1
  return sorted[idx]
}
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100)

function gitShort() {
  const exe = process.platform === 'win32' ? 'git.exe' : 'git'
  try {
    return execFileSync(exe, ['rev-parse', '--short', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

/* ---------------- main ---------------- */

const distIndex = resolve(root, 'dist', 'index.html')
if (!existsSync(distIndex)) {
  console.error('[bench-boot] dist 不存在：先 git clean -xdf dist && CODEBUDDY_SAFE_DELETE_ENABLED=0 npx vite build')
  process.exit(1)
}

const preview = await ensurePreviewServer({ port: PORT })
const base = `http://127.0.0.1:${PORT}`

const chrome = findChrome()
const profile = join(tmpdir(), `gt-bench-boot-${Date.now()}`)
const proc = spawn(
  chrome,
  [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-proxy-server',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let version = null
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
    if (r.ok) { version = await r.json(); break }
  } catch {}
  await sleep(300)
}
if (!version) {
  proc.kill()
  stopPreview(preview)
  throw new Error('CDP 未就绪')
}
console.log(`[bench-boot] CDP：${version['Browser']}`)

const TIERS = [
  { key: 'desktop', label: 'Desktop 1280×800', vp: { w: 1280, h: 800, dsf: 1, mobile: false, cpu: 0 } },
  { key: 'mobile', label: 'Mobile 412×915 CPU×4', vp: { w: 412, h: 915, dsf: 2, mobile: true, cpu: 4 } },
]

const boot = {}
try {
  for (const tier of TIERS) {
    const samples = []
    console.log(`[bench-boot] ${tier.label}：预热 ${WARMUP} 次（丢弃）+ 采样 ${SAMPLES} 次`)
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })
      const tab = { ...await r.json(), vp: tier.vp }
      const ms = await sampleBoot(base, tab)
      if (i >= WARMUP) samples.push(ms)
    }
    const sorted = [...samples].sort((a, b) => a - b)
    boot[tier.key] = {
      samples: samples.length,
      unit: 'ms',
      p50: r2(percentile(sorted, 0.5)),
      p95: r2(percentile(sorted, 0.95)),
      min: r2(sorted[0]),
      max: r2(sorted[sorted.length - 1]),
      viewport: `${tier.vp.w}x${tier.vp.h}`,
      cpuThrottle: tier.vp.cpu || null,
      method:
        '整页冷导航（每次新 tab）→ [data-testid="home-panel"] 首现的 performance.now()；' +
        '同 profile 预热后采样（SW precache 与 chunk 缓存落定），度量启动执行/渲染成本，非「首次到访」口径；' +
        '探针经 Page.addScriptToEvaluateOnNewDocument 注入 MutationObserver，显式轮询读取，不用 networkidle',
    }
    console.log(`[bench-boot] ${tier.label}：P50 ${boot[tier.key].p50} ms / P95 ${boot[tier.key].p95} ms`)
  }
} finally {
  proc.kill()
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
  stopPreview(preview)
}

/* ---------------- 写出（read-modify-write，只更新 boot 节） ---------------- */

const outFile = OUT
let doc = {}
if (existsSync(outFile)) {
  try { doc = JSON.parse(readFileSync(outFile, 'utf8')) } catch { doc = {} }
}
doc.boot = boot
doc.meta = {
  ...(doc.meta ?? {}),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  commit: gitShort(),
  machine:
    'Windows 11 + Esafenet 透明加密驱动（IO 抖动大，单次采样不可信）；本地测量值仅供趋势对照，不作为 CI 判据',
}
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(`[bench-boot] 已写出 ${outFile}`)
