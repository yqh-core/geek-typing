/**
 * Geek Typing 离线审计（批5）：真实断网五态验证 Service Worker 缜密化效果
 *
 * 独立于 tests/e2e.mjs（断网仿真会污染在线用例），勿并入主套件。
 *
 * 用法：
 *   npm run test:offline      # 一键：自举 vite preview（4173 已占用则复用）
 *   npm run test:prod         # 打生产 https://geek-typing.pages.dev（只读）
 *
 * 五态：
 *   态1 在线首访 → SW 注册并 active
 *   态2 断网 reload → 主 UI 渲染 + 打字推进
 *   态3 断网功能完整性 → 背单词 Space 翻面 + 三键打分 + 无新增 console error
 *   态4 缓存探针 → gt-shell-v3 全部条目无 redirected=true 毒条目，且 index 已缓存
 *   态4b MIME 投毒探针 → /assets/*.js 不得缓存 text/html（BUG-002 回归判据）
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
const CACHE_NAME = 'gt-shell-v3'

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

/**
 * 等待 body 文本包含全部 needle（带超时轮询）。
 *
 * 为什么不能「固定 waitForTimeout + 一次性抓 body」：
 *   React 切页签后是分帧渲染的 —— 单词面板（PracticePanel）先挂载，统计栏（StatsBar）
 *   在其子树的后续渲染帧里才出现。CI runner 比本地慢一个量级，300ms 固定等待在 CI 上
 *   只抓到「渲染中途」的快照 → 断言随机变红（本地快所以从未红过）。
 *   这里改成轮询等条件满足：断言本身不放宽，只消除取样时机竞态。
 *
 * @returns 命中时的 body 文本；超时则返回最后一次快照（供断言打印真实差异）
 */
async function waitForBodyText(page, needles, timeoutMs = 8000) {
  const read = async () => (await page.textContent('body').catch(() => '')) ?? ''
  const deadline = Date.now() + timeoutMs
  let body = await read()
  while (Date.now() < deadline) {
    if (needles.every((n) => body.includes(n))) return body
    await page.waitForTimeout(100)
    body = await read()
  }
  return body
}

/** 轮询等待「页面上出现该 testid 元素」（替代固定等待，供切页签后使用） */
async function waitForTestId(page, testId, timeoutMs = 8000) {
  try {
    await page.waitForSelector(`[data-testid="${testId}"]`, { state: 'attached', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

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
    // V3-P0a：默认页签为 Home，先断言落点，再切打字页签验证练习面板
    check('态1.5: reload 后落在 Home（推荐首页渲染）', (await page.locator('[data-testid="home-panel"]').count()) >= 1)
    await page.click('[data-testid="tab-typing"]', { timeout: 8000 })
    // 轮询等练习面板挂载，替代原 300ms 固定等待（同类竞态，见 waitForBodyText 注释）
    const wordReadyOnline = await waitForTestId(page, 'word')
    check(
      '态1.5: SW 接管后在线 reload 成功（切 typing 后练习面板可见）',
      wordReadyOnline && (await page.locator('[data-testid="word"]').count()) >= 1,
    )
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
    // V3-P0a：断网 reload 后落在 Home（推荐首页渲染，非空白错误页）
    check('态2: 断网 reload 后落在 Home（推荐首页渲染）', (await page.locator('[data-testid="home-panel"]').count()) >= 1)
    // 切到打字页签（纯前端操作，断网可用）后执行原打字核心断言
    await page.click('[data-testid="tab-typing"]', { timeout: 8000 })
    // 轮询等练习面板挂载（CI 慢 runner 上 300ms 固定等待不够）
    const wordReady = await waitForTestId(page, 'word')
    const wordCount = await page.locator('[data-testid="word"]').count()
    check('态2: 主 UI 渲染（练习单词面板可见）', wordReady && wordCount >= 1, `word 面板数=${wordCount}`)
    // 统计栏（StatsBar）在练习面板子树的后续渲染帧出现 → 轮询等「进度」+「正确率」同时就位。
    // 断言不放宽：仍要求两者都存在，只是不再用一次性快照赌渲染已完成。
    const body = await waitForBodyText(page, ['进度', '正确率'])
    check(
      '态2: 词库选择/统计栏可见（非空白错误页）',
      body.includes('进度') && body.includes('正确率'),
      `bodyLen=${body.length} 进度=${body.includes('进度')} 正确率=${body.includes('正确率')}`,
    )
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
    // 轮询等卡片挂载，替代原 300ms 固定等待（CI 慢 runner 上同样会读到渲染中途快照）
    await waitForTestId(page, 'memorize-card')
    check('态3: 背单词卡片出现', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
    await page.keyboard.press('Space')
    // 翻面 = React 状态更新 + 重渲染 → 轮询等释义面板出现
    await waitForTestId(page, 'memorize-translation', 5000)
    check('态3: Space 翻面显示释义', (await page.locator('[data-testid="memorize-translation"]').count()) === 1)
    await page.keyboard.press('1') // 认识 → 推进
    // 打分后进度文案从 0/20 变 1/20 → 轮询等文案就位，而非赌 250ms 够
    await waitForBodyText(page, ['1/'], 5000)
    const prog = (await page.textContent('[data-testid="memorize-progress"]').catch(() => '')) ?? ''
    check('态3: 打分键推进进度', prog.includes('1/'), prog.trim())
    check('态3: 无新增 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } catch (e) {
    check('态3: 背单词键盘流', false, String(e).split('\n')[0])
    check('态3: 无新增 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  }
  await context.setOffline(false)

  /* ---------- 态4 缓存探针 ---------- */
  console.log('\n【态4】缓存探针：无 redirected 毒条目 + 无 MIME 不匹配条目')
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
        entries.push({
          url: req.url,
          pathname,
          redirected: !!res?.redirected,
          status: res?.status ?? null,
          contentType: res?.headers.get('content-type') || '',
        })
      }
      return { exists: true, names, entries }
    }, CACHE_NAME)
  } catch (e) {
    check('态4: 缓存探针执行', false, String(e).split('\n')[0])
  }
  check('态4: 缓存 gt-shell-v3 存在', probe.exists, `caches=[${probe.names.join(', ')}]`)
  const poisoned = probe.entries.filter((e) => e.redirected)
  check(
    '态4: 全部条目无 redirected=true 毒条目',
    poisoned.length === 0,
    poisoned.length > 0 ? `毒条目：${poisoned.map((e) => e.url).join(', ')}` : `${probe.entries.length} 条全部干净`,
  )
  const hasIndex = probe.entries.some((e) => e.pathname === '/index.html' || e.pathname === '/')
  check('态4: /index.html 或 / 已缓存', hasIndex)
  probe.entries.forEach((e) => console.log(`    · [${e.status}] redirected=${e.redirected} ${e.pathname} (${e.contentType})`))

  /* ---------- 态4b MIME 投毒探针（BUG-002 回归，主动注入） ---------- */
  // 为什么必须「主动注入」而不是被动检查缓存：
  //   本地 vite preview 对缺失资源返回 404/502，而 Cloudflare Pages 返回 200 + text/html（软 404）。
  //   因此在本地，"SPA fallback 投毒"这一病态输入根本不会自然出现——
  //   被动探针会**空转通过**（air test），即使校验被删除也不会变红（已实测确认）。
  //   故本探针用 context.route 伪造一个「/assets/*.js 返回 200 + text/html」的软 404。
  //
  // 为什么用 context.route 而不是 CDP Fetch 域：
  //   Service Worker 发起的 fetch 运行在独立的 worker target 上，
  //   页面级 CDP 会话（newCDPSession(page) + Fetch.enable）**拦截不到**（已实测：routeHits=0）。
  //   而 playwright 的 context.route 覆盖 SW 请求（已实测：routeHits=1）。
  console.log('\n【态4b】MIME 投毒探针：伪造软 404，断言 SW 拒绝缓存（主动注入）')
  const TRAP = '/assets/__gt-trap-soft404.js'
  const FAKE_HTML = '<!doctype html><title>trap</title>'
  let trapResult = { intercepted: false, reqFailed: false, cached: false, cachedType: '', pageGotHtml: false }
  try {
    let routeHits = 0
    await context.route('**/__gt-trap-soft404.js*', async (route) => {
      routeHits++
      // 精确复刻 Cloudflare Pages 的软 404：200 + text/html
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: FAKE_HTML,
      })
    })

    // 在页面上下文发起请求，走 SW 的 fetch handler（同源 + /assets/ ⇒ 命中策略 A）
    const r = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url)
        const text = await res.text()
        return { status: res.status, contentType: res.headers.get('content-type') || '', text }
      } catch (e) {
        return { status: null, contentType: '', text: '', threw: String(e) }
      }
    }, TRAP)
    trapResult.intercepted = routeHits > 0
    trapResult.reqFailed = r.status === null || r.status >= 500
    trapResult.pageGotHtml = /<!doctype html>/i.test(r.text)

    // 关键断言：SW 不得把这条 HTML 写进缓存
    const look = await page.evaluate(
      async ({ cacheName, url }) => {
        const names = await caches.keys()
        if (!names.includes(cacheName)) return { cached: false, cachedType: '' }
        const cache = await caches.open(cacheName)
        const hit = await cache.match(url)
        return { cached: !!hit, cachedType: hit ? hit.headers.get('content-type') || '' : '' }
      },
      { cacheName: CACHE_NAME, url: TRAP },
    )
    trapResult.cached = look.cached
    trapResult.cachedType = look.cachedType

    check('态4b: 软 404 注入已生效（路由拦截命中）', trapResult.intercepted, `trap=${TRAP}`)
    check(
      '态4b: SW 未把 text/html 写入 /assets/*.js 缓存',
      !trapResult.cached,
      trapResult.cached ? `已投毒：cachedType=${trapResult.cachedType}` : '未缓存（正确拒绝）',
    )
    check(
      '态4b: SW 未把 HTML 交给页面（返回 5xx 或抛错，而非 200 HTML）',
      trapResult.reqFailed && !trapResult.pageGotHtml,
      `status=${trapResult.reqFailed ? '5xx/threw' : '200'} pageGotHtml=${trapResult.pageGotHtml}`,
    )

    await context.unroute('**/__gt-trap-soft404.js*').catch(() => {})
  } catch (e) {
    check('态4b: 主动注入探针执行', false, String(e).split('\n')[0])
  }

  await context.close()
} finally {
  await browser.close()
}

/* ---------- 总结论 + 证据落盘 ---------- */
console.log('\n========== 离线审计总结 ==========')
console.log(`结论：${failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项未通过`}`)

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
