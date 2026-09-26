/**
 * Geek Typing 生产 Smoke：CF Pages 真实环境专属指纹断言 + SW 升级路径
 *
 * 独立于 e2e / offline-audit：断言的是 vite preview 无法复现的生产行为
 * （308 canonical 重定向、_headers 生效、边缘压缩、真实 SW 升级链路）。
 *
 * 用法：
 *   node tests/prod-smoke.mjs                                # 默认打生产
 *   E2E_BASE=<url> node tests/prod-smoke.mjs                 # 指定目标
 *   需要先 npm run build（脚本从本地 dist 取 bundle/chunk 指纹做一致性比对）
 *
 * Part A HTTP 指纹：
 *   A1 /index.html → 308 重定向到 /（毒条目事故的源头环境特征，必须存在）
 *   A2 /sw.js → 200 + Cache-Control: no-cache（_headers 生效证明）+ 内容指纹
 *   A3 / → 200 + 引用的 bundle 名与本地 dist 一致（防劫持假站 + 部署一致性）
 *   A4 bundle → 200 + 边缘压缩（content-encoding gzip/br）+ immutable 强缓存
 *   A5 懒加载 chunk（kaoyan 与 toefl 词库）→ 200（部署在列）
 *
 * Part B SW 升级路径（真实浏览器）：
 *   B1 全新 context 首访 → v2 直接安装且 skipWaiting+claim 立即接管
 *   B2 连续 reload 两次 → 第二次断网走缓存（precache 完整可用）
 *   B3 模拟旧访客：注入 gt-shell-v1 残留缓存 → SW 重装激活 → activate 清理旧缓存
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.E2E_BASE ?? 'https://geek-typing.pages.dev'

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
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      const exe = join(pwRoot, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  return candidates.find((p) => existsSync(p))
}

const results = []
let failures = 0

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures++
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 从本地 dist 取 bundle / chunk 指纹 */
function localFingerprints() {
  if (!existsSync('dist')) throw new Error('本地 dist 不存在，先 npm run build')
  const html = readFileSync(join('dist', 'index.html'), 'utf8')
  const bundle = html.match(/\/assets\/index-[^"]+\.js/)?.[0] ?? null
  const assets = readdirSync(join('dist', 'assets'))
  // V4-P0：大词库 chunk 从模块名(kaoyan-*.js 等)变为 ?raw JSON 命名 words-*.js（共 3 个）
  const lazyChunks = assets.filter((f) => /^words-.+\.js$/.test(f)).map((f) => `/assets/${f}`)
  return { bundle, lazyChunks }
}

/** SW 注册态（ready + 等 claim 接管，带超时保护） */
const swState = (page, timeoutMs = 30000) =>
  page.evaluate(
    (ms) =>
      Promise.race([
        navigator.serviceWorker.ready.then(async (reg) => {
          for (let i = 0; i < 60; i++) {
            if (navigator.serviceWorker.controller) break
            await new Promise((r) => setTimeout(r, 250))
          }
          return {
            active: !!reg.active,
            script: reg.active?.scriptURL ?? '',
            controlling: !!navigator.serviceWorker.controller,
          }
        }),
        new Promise((resolve) => setTimeout(() => resolve({ active: false, script: 'timeout', controlling: false }), ms)),
      ]),
    timeoutMs,
  )

const consoleErrors = []

console.log(`🎯 目标：${BASE}`)

/* ==================== Part A：HTTP 指纹 ==================== */
console.log('\n【Part A】HTTP 指纹（CF Pages 真实行为）')

const { request } = await import('playwright-core')
const api = await request.newContext()

// A1 308 canonical 重定向
const r308 = await api.get(`${BASE}/index.html`, { maxRedirects: 0 })
const loc = r308.headers()['location'] ?? ''
const locPath = loc ? new URL(loc, BASE).pathname : ''
check(
  'A1: /index.html → 308 重定向到 /',
  r308.status() === 308 && locPath === '/',
  `status=${r308.status()} location=${loc || '(无)'}`,
)
await r308.dispose()

// A2 sw.js 的 no-cache 头 + 内容指纹
const rsw = await api.get(`${BASE}/sw.js`)
const swHeaders = rsw.headers()
const swBody = await rsw.text()
check(
  'A2: /sw.js → 200 + Cache-Control: no-cache（_headers 生效）',
  rsw.status() === 200 && (swHeaders['cache-control'] ?? '').includes('no-cache'),
  `status=${rsw.status()} cache-control=${swHeaders['cache-control'] ?? '(无)'}`,
)
check('A2: /sw.js 内容为 gt-shell-v2 版本', swBody.includes('gt-shell-v2'))
await rsw.dispose()

// A3 首页 bundle 指纹一致性
const { bundle, lazyChunks } = localFingerprints()
check(
  '前置: 本地 dist 可取指纹',
  !!bundle && lazyChunks.length >= 2,
  `bundle=${bundle ?? '(无)'} lazyChunks=[${lazyChunks.join(', ')}]`,
)
const rHome = await api.get(`${BASE}/`)
const homeBody = await rHome.text()
check(
  'A3: / → 200 且引用 bundle 与本地 dist 一致',
  rHome.status() === 200 && !!bundle && homeBody.includes(bundle),
  `status=${rHome.status()} 期望=${bundle ?? '(无)'}`,
)
check(
  'A3+: / HTML 边缘压缩',
  ['gzip', 'br'].includes(rHome.headers()['content-encoding'] ?? ''),
  `content-encoding=${rHome.headers()['content-encoding'] ?? '(无)'}`,
)
await rHome.dispose()

// A4 bundle 压缩 + 强缓存
if (bundle) {
  const rBundle = await api.get(`${BASE}${bundle}`)
  check(
    'A4: bundle → 200 + 边缘压缩（gzip/br）',
    rBundle.status() === 200 && ['gzip', 'br'].includes(rBundle.headers()['content-encoding'] ?? ''),
    `status=${rBundle.status()} content-encoding=${rBundle.headers()['content-encoding'] ?? '(无)'}`,
  )
  check(
    'A4: bundle Cache-Control immutable 强缓存',
    (rBundle.headers()['cache-control'] ?? '').includes('immutable'),
    `cache-control=${rBundle.headers()['cache-control'] ?? '(无)'}`,
  )
  await rBundle.dispose()
}

// A5 懒加载 chunk 可达
for (const chunk of lazyChunks) {
  const rChunk = await api.get(`${BASE}${chunk}`)
  check(`A5: 懒加载 chunk ${chunk} → 200`, rChunk.status() === 200, `status=${rChunk.status()}`)
  await rChunk.dispose()
}

await api.dispose()

/* ==================== Part B：SW 升级路径 ==================== */
console.log('\n【Part B】SW 升级路径（真实浏览器）')

const executablePath = findChrome()
if (!executablePath) {
  console.error('❌ 找不到 Chrome，请设置 CHROME_PATH')
  process.exit(1)
}
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })

try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // B1 全新 context 首访：v2 直接安装、立即接管
  console.log('\n【B1】全新访客首访：v2 安装与接管')
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const st1 = await swState(page)
  check('B1: SW 注册且 active（脚本为 sw.js）', st1.active && st1.script.includes('sw.js'), st1.script)
  check('B1: skipWaiting+clients.claim 下立即接管（首访无需二次导航）', st1.controlling)
  await page.waitForTimeout(800) // precache 收尾缓冲
  const names1 = await page.evaluate(() => caches.keys())
  check('B1: 全新访客仅有 gt-shell-v2 缓存', names1.includes('gt-shell-v2') && !names1.some((n) => n !== 'gt-shell-v2'), `caches=[${names1.join(', ')}]`)

  // B2 连续 reload 两次：第二次断网走缓存
  console.log('\n【B2】连续 reload：第二次断网走缓存')
  await page.reload({ waitUntil: 'load', timeout: 30000 })
  // V3-P0a：默认页签为 Home，切到打字页签（纯前端操作）后再断言练习面板
  await page.click('[data-testid="tab-typing"]', { timeout: 8000 })
  await page.waitForTimeout(300)
  check('B2: reload #1 SW 接管下导航成功', (await page.locator('[data-testid="word"]').count()) >= 1)
  await context.setOffline(true)
  let offlineOk = true
  try {
    await page.reload({ waitUntil: 'load', timeout: 30000 })
  } catch (e) {
    offlineOk = false
    check('B2: reload #2 断网走缓存成功', false, String(e).split('\n')[0])
  }
  if (offlineOk) {
    check('B2: reload #2 断网走缓存成功（无 ERR_FAILED）', true)
    // V3-P0a：断网 reload 落在 Home，切打字页签（纯前端操作）后断言练习面板
    await page.click('[data-testid="tab-typing"]', { timeout: 8000 })
    await page.waitForTimeout(300)
    const wordCount = await page.locator('[data-testid="word"]').count()
    check('B2: 断网页面主 UI 完整（切 typing 后练习面板可见）', wordCount >= 1, `word 面板数=${wordCount}`)
  }
  await context.setOffline(false)

  // B3 模拟旧访客升级：注入 gt-shell-v1 残留 → SW 重装激活 → 清理旧缓存
  console.log('\n【B3】模拟旧访客升级（gt-shell-v1 残留 → activate 清理）')
  await page.evaluate(async () => {
    const cache = await caches.open('gt-shell-v1')
    await cache.put('/__gt-v1-legacy', new Response('legacy shell v1'))
  })
  const namesWithV1 = await page.evaluate(() => caches.keys())
  check(
    'B3: 前置——v1 残留缓存已注入',
    namesWithV1.includes('gt-shell-v1'),
    `caches=[${namesWithV1.join(', ')}]`,
  )
  // unregister 后重新注册 → 新 SW 走完整 install(precache+skipWaiting) → activate(清理非 v2 + claim)
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg) await reg.unregister()
  })
  await page.reload({ waitUntil: 'load', timeout: 30000 })
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js'))
  const st3 = await swState(page)
  await page.waitForTimeout(800)
  check('B3: 重装后 SW active 且接管', st3.active && st3.controlling, st3.script)
  const names3 = await page.evaluate(() => caches.keys())
  check(
    'B3: activate 清理旧缓存（仅剩 gt-shell-v2）',
    !names3.includes('gt-shell-v1') && names3.includes('gt-shell-v2'),
    `caches=[${names3.join(', ')}]`,
  )
  // v2 内容完整性：升级路径收尾后断网仍可用
  await context.setOffline(true)
  let upgOfflineOk = true
  try {
    await page.reload({ waitUntil: 'load', timeout: 30000 })
  } catch (e) {
    upgOfflineOk = false
    check('B3: 升级后断网导航可用', false, String(e).split('\n')[0])
  }
  if (upgOfflineOk) {
    // V3-P0a：断网 reload 落在 Home，切打字页签（纯前端操作）后断言 precache 完整
    await page.click('[data-testid="tab-typing"]', { timeout: 8000 })
    await page.waitForTimeout(300)
    check('B3: 升级后断网导航可用（precache 已重建）', (await page.locator('[data-testid="word"]').count()) >= 1)
  }
  await context.setOffline(false)

  await context.close()
} finally {
  await browser.close()
}

/* ---------- 总结 ---------- */
console.log('\n【运行时报错】')
const realErrors = consoleErrors.filter((e) => !e.includes('favicon'))
check('全程无 console / page 运行时错误', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

console.log(`\n${'─'.repeat(54)}`)
console.log(`共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
console.log(`${'─'.repeat(54)}`)
process.exit(failures === 0 ? 0 : 1)
