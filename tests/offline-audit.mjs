/**
 * Geek Typing 离线审计（批5）：真实断网四态验证 Service Worker 缜密化效果
 *
 * 独立于 tests/e2e.mjs（断网仿真会污染在线用例），勿并入主套件。
 *
 * 用法：
 *   npm run test:offline      # 一键：自举 vite preview（4173 已占用则复用）
 *   npm run test:prod         # 打生产 https://geek-typing.pages.dev（只读）
 *
 * 四态：
 *   态1 在线首访 → SW 注册并 active
 *   态2 断网 reload → 主 UI 渲染 + 打字推进
 *   态3 断网功能完整性 → 背单词 Space 翻面 + 三键打分 + 无新增 console error
 *   态4 缓存探针 → gt-shell-v2 全部条目无 redirected=true 毒条目，且 index 已缓存
 *
 * 结果 JSON：tests/_evidence/offline-audit-result.json
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensurePreviewServer, stopPreview } from './preview-server.mjs'

const PROD_BASE = 'https://geek-typing.pages.dev'
const IS_PROD = process.argv.includes('--prod')
const BASE = process.env.E2E_BASE ?? (IS_PROD ? PROD_BASE : 'http://127.0.0.1:4173')
const CACHE_NAME = 'gt-shell-v2'

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
  // Playwright 下载的 Chromium（CI / Linux / macOS）
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

/** 光标所在字母 */
const readCursor = (page) =>
  page.evaluate(
    () => document.querySelector('[data-state="cursor"]')?.getAttribute('data-letter') ?? null,
  )

/** 当前完整单词（data-letter 拼接，避开嵌套 span） */
const readWord = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="word"] [data-letter]')]
      .map((s) => s.getAttribute('data-letter'))
      .join(''),
  )

/** SW 注册态（带超时保护，防 ready 永久 pending 挂死脚本；ready 后轮询等 claim 接管） */
const swState = (page, timeoutMs = 15000) =>
  page.evaluate(
    (ms) =>
      Promise.race([
        navigator.serviceWorker.ready.then(async (reg) => {
          for (let i = 0; i < 30; i++) {
            if (navigator.serviceWorker.controller) break
            await new Promise((r) => setTimeout(r, 100))
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

// 自举 preview（--prod 时跳过，直接打生产）；脚本末尾统一 stopPreview
let previewServer = null
if (!IS_PROD) {
  previewServer = await ensurePreviewServer()
  // 兜底：任何异常退出路径（browser launch 失败等）也杀掉自举的 preview
  process.on('exit', () => stopPreview(previewServer))
}

const executablePath = findChrome()
if (!executablePath) {
  console.error('❌ 找不到 Chrome，请设置 CHROME_PATH')
  process.exit(1)
}
console.log(`🌐 浏览器：${executablePath}`)
console.log(`🎯 目标：${BASE}（缓存 ${CACHE_NAME}）`)

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })

try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  /* ---------- 态1 在线首访 ---------- */
  console.log('\n【态1】在线首访：SW 注册与激活')
  await page.goto(BASE + '/', { waitUntil: 'load' })
  const st1 = await swState(page)
  check('态1: navigator.serviceWorker.ready 且 active', st1.active && st1.script.includes('sw.js'), st1.script)
  check('态1: SW 已接管页面（controller）', st1.controlling)
  await page.waitForTimeout(500) // 给 precacheShell 收尾留缓冲（skipWaiting 在 precache 完成后触发）

  /* 态1.5 在线 reload：SW 已接管下的在线导航（防 body 消费/响应重建类回归） */
  console.log('\n【态1.5】在线 reload：SW 接管下的在线导航')
  let reloadOnlineOk = true
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 })
  } catch (e) {
    reloadOnlineOk = false
    check('态1.5: SW 接管后在线 reload 成功', false, String(e).split('\n')[0])
  }
  if (reloadOnlineOk) {
    check('态1.5: SW 接管后在线 reload 成功', (await page.locator('[data-testid="word"]').count()) >= 1)
  }

  /* ---------- 态2 断网 reload ---------- */
  console.log('\n【态2】断网 reload：离线导航与打字核心')
  await context.setOffline(true)
  let reloadOk = true
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 })
  } catch (e) {
    reloadOk = false
    check('态2: 断网导航 reload 成功', false, String(e).split('\n')[0])
  }
  if (reloadOk) {
    check('态2: 断网导航 reload 成功（无 ERR_FAILED）', true)
    const wordCount = await page.locator('[data-testid="word"]').count()
    check('态2: 主 UI 渲染（练习单词面板可见）', wordCount >= 1, `word 面板数=${wordCount}`)
    const body = (await page.textContent('body').catch(() => '')) ?? ''
    check('态2: 词库选择/统计栏可见（非空白错误页）', body.includes('进度') && body.includes('正确率'))
    // 打字功能活：敲正确字母推进光标
    const w1 = await readWord(page)
    const c0 = await readCursor(page)
    check('态2: 可读出当前单词', w1.length > 0, `单词=${w1}`)
    if (w1.length > 0) {
      for (const ch of w1.slice(0, 3)) await page.keyboard.press(ch)
      await page.waitForTimeout(250)
      const c1 = await readCursor(page)
      check('态2: 断网下敲正确字母光标前进', c0 !== null && c1 !== null && c0 !== c1, `${c0 ?? 'null'} → ${c1 ?? 'null'}`)
    }
  }
  await context.setOffline(false)

  /* ---------- 态3 断网功能完整性 ---------- */
  console.log('\n【态3】断网功能完整性：背单词键盘流')
  await context.setOffline(true)
  consoleErrors.length = 0
  // 若态2 失败导致页面处于错误态，先恢复在线导航回可用页
  const pageUsable = (await page.locator('body').count()) === 1 && (await page.title()).includes('Geek Typing')
  if (!pageUsable) {
    await context.setOffline(false)
    await page.goto(BASE + '/', { waitUntil: 'load' })
    await swState(page)
    await context.setOffline(true)
  }
  try {
    await page.click('[data-testid="tab-memorize"]', { timeout: 8000 })
    await page.waitForTimeout(300)
    check('态3: 背单词卡片出现', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    check('态3: Space 翻面显示释义', (await page.locator('[data-testid="memorize-translation"]').count()) === 1)
    await page.keyboard.press('1') // 认识 → 推进
    await page.waitForTimeout(250)
    const prog = (await page.textContent('[data-testid="memorize-progress"]').catch(() => '')) ?? ''
    check('态3: 打分键推进进度', prog.includes('1/'), prog.trim())
    check('态3: 无新增 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } catch (e) {
    check('态3: 背单词键盘流', false, String(e).split('\n')[0])
    check('态3: 无新增 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  }
  await context.setOffline(false)

  /* ---------- 态4 缓存探针 ---------- */
  console.log('\n【态4】缓存探针：无 redirected 毒条目')
  // 在已成功加载的页面上下文 evaluate（错误页上下文 caches 不可用）
  let probe = { exists: false, names: [], entries: [] }
  try {
    probe = await page.evaluate(async (cacheName) => {
      const names = await caches.keys()
      if (!names.includes(cacheName)) return { exists: false, names, entries: [] }
      const cache = await caches.open(cacheName)
      const reqs = await cache.keys()
      const entries = []
      for (const req of reqs) {
        const res = await cache.match(req)
        let pathname = ''
        try {
          pathname = new URL(req.url).pathname
        } catch {
          pathname = req.url
        }
        entries.push({ url: req.url, pathname, redirected: !!res?.redirected, status: res?.status ?? null })
      }
      return { exists: true, names, entries }
    }, CACHE_NAME)
  } catch (e) {
    check('态4: 缓存探针执行', false, String(e).split('\n')[0])
  }
  check('态4: 缓存 gt-shell-v2 存在', probe.exists, `caches=[${probe.names.join(', ')}]`)
  const poisoned = probe.entries.filter((e) => e.redirected)
  check(
    '态4: 全部条目无 redirected=true 毒条目',
    poisoned.length === 0,
    poisoned.length > 0 ? `毒条目：${poisoned.map((e) => e.url).join(', ')}` : `${probe.entries.length} 条全部干净`,
  )
  const hasIndex = probe.entries.some((e) => e.pathname === '/index.html' || e.pathname === '/')
  check('态4: /index.html 或 / 已缓存', hasIndex)
  probe.entries.forEach((e) => console.log(`    · [${e.status}] redirected=${e.redirected} ${e.pathname}`))

  await context.close()
} finally {
  await browser.close()
}

/* ---------- 总结论 + 证据落盘 ---------- */
console.log('\n========== 离线审计总结 ==========')
console.log(`结论：${failures === 0 ? '✅ 四态全部通过' : `❌ ${failures} 项未通过`}`)

mkdirSync(join('tests', '_evidence'), { recursive: true })
writeFileSync(
  join('tests', '_evidence', 'offline-audit-result.json'),
  JSON.stringify(
    { base: BASE, cacheName: CACHE_NAME, time: new Date().toISOString(), passed: failures === 0, failures, results },
    null,
    2,
  ),
)
console.log('📄 证据：tests/_evidence/offline-audit-result.json')

stopPreview(previewServer)
process.exit(failures === 0 ? 0 : 1)
