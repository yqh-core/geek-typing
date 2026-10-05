/**
 * 生产环境「内容目录汇总」实测校验（post-deploy live check）
 *
 * 目的：把 Home 组合（catalogSummary → "词库 N · M 词"）在
 * **真实 Cloudflare Pages 生产域名**上做独立实测，作为 Production
 * Deployment CLOSED 的实证（而非仅 CI 部署 job success）。
 *
 * 与 prod-smoke.mjs 互补：prod-smoke 断言 HTTP 指纹 / SW 升级链路，
 * 本脚本断言**业务内容确实渲染到了线上**。
 *
 * ⚠️ N / M 一律**按 content/ 现算**（tests/helpers/catalog-totals.mjs，与 e2e.mjs 共用）：
 *    写死数字必然随内容包增长而腐坏，本文件就因此假红过（详见 check 调用处注释）。
 *
 * 用法：
 *   node tests/prod-catalog-check.mjs                       # 默认打生产
 *   E2E_BASE=<url> node tests/prod-catalog-check.mjs        # 指定目标
 *
 * 退出码：断言通过 0，否则 1（供 CI / 人工复跑判红）。
 */
import { chromium } from 'playwright-core'
import { catalogTotals } from './helpers/catalog-totals.mjs'
// Chromium/Chrome 可执行文件的查找已抽成共享模块（tests/helpers/chrome.mjs）。
// 本文件原来持有一份与 tests/e2e.mjs 逐字重复的副本；第三份（scripts/verify-learning-unit.mjs）
// 是同一段逻辑的**更差**版本（无 CHROME_PATH 兜底、无 Linux 路径 ⇒ ubuntu CI 上必然找不到）。
// ⚠️ 连带效应：本文件原有的 node:fs / node:path import 只服务于那份本地副本，已随之删除 ——
//    留着就是 lint 棘轮上的一条新增 warning。
import { findChrome } from './helpers/chrome.mjs'

const BASE = process.env.E2E_BASE ?? 'https://geek-typing.pages.dev'

const exe = findChrome()
if (!exe) {
  console.error('❌ 找不到 Chrome 可执行文件')
  process.exit(1)
}

const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures++
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: exe })
try {
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // 先访问一次以便写入 localStorage（强制中文，对齐 W5C 断言文案）
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await page.evaluate(() => window.localStorage.setItem('gt.lang', 'zh'))
  await page.reload({ waitUntil: 'load', timeout: 30000 })

  // 等首页默认 Home 页签渲染出目录汇总
  await page.waitForSelector('[data-testid="home-catalog-summary"]', { timeout: 30000 })
  const text = (await page.textContent('[data-testid="home-catalog-summary"]')).trim()

  /* 期望值按 content/ 现算（tests/helpers/catalog-totals.mjs，与 e2e.mjs 共用同一实现）。
   * ⚠️ 本文件原来硬钉「18 词库 · 9388 词」—— 那是 P1.7 的值。A1-E 起连加三套内容包，
   *    线上早已是 27 / 9486，而这个不在 CI 里的检查一直在腐坏：2026-10-05 手工跑第一次
   *    看到的就是「断言说 18、线上是 27」。同一处硬编码在 e2e.mjs 里 A1-E 已经改成派生，
   *    这里被漏掉 ⇒ 两份各自为政的副本就是这样分叉的，故抽成共享模块而不是再抄一份。 */
  const expected = catalogTotals()
  /* ⚠️ N4：`expected.allTypesItems` 是 **all-types 口径**（含48 条非词汇条目），
   *    而线上 UI 文案沿用产品口径「M 词」—— UI 文案属产品口径，超边界不改。
   *    这里只让**测试内部标签**说清口径，避免「标签写词、实际全类型」的歧义。 */
  check(
    `生产环境 home-catalog-summary 渲染（词库 ${expected.packages} · ${expected.allTypesItems} 词；数值取自 all-types 口径 allTypesItems）`,
    text.includes(String(expected.packages))
      && text.includes(String(expected.allTypesItems))
      && text.includes('词库')
      && text.includes('词'),
    `text="${text}" / 期望 词库 ${expected.packages} · ${expected.allTypesItems} 词（all-types 口径）`,
  )
  check('生产环境无 console / page 运行时错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

console.log(`\n生产实测：共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
if (failures > 0) process.exitCode = 1
