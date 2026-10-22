#!/usr/bin/env node
/**
 * 批次 4 · geek-typing —— 语言切换的 <html lang> 同步真机验收（i18n-lang.mjs）
 *
 * 评审第 2 步要求：不能只看源码里有 applyHtmlLang，要在**真实浏览器**里点语言按钮、
 * 读 documentElement.lang，证明「切换 → 文档根语言真的变」且「刷新 → 选择被持久化」。
 * 这是可访问性 + SEO 的语言声明正确性，源码静态匹配替代不了。
 *
 * 三态退出码（与全仓门禁一致）：
 *   0 = PASS；1 = FAIL（语言未按预期同步）；2 = Fatal/UNDECIDED（找不到 Chromium / preview 未就绪）
 *   —— 环境不具备时**明确判 2**，绝不把「没跑起来」偷记成「跑过了/通过」。
 *
 * 端口 4176：e2e 4173 / offline 4174 / learning-unit 4175 之外，独占避免并发抢端口。
 * 只打 127.0.0.1 本机 preview，绝不打生产域名（见 deploy.yml 末尾排除清单同纪律）。
 */
import { ensurePreviewServer, stopPreview, clearMarkerInExitHook } from './preview-server.mjs'
import { findChrome } from './helpers/chrome.mjs'
import { chromium } from 'playwright-core'

const PORT = 4176
const BASE = `http://127.0.0.1:${PORT}`
process.on('exit', () => clearMarkerInExitHook(PORT))

const fatal = (msg) => { console.error(`❌ EXIT=2 (UNDECIDED)：${msg}`); process.exit(2) }

const server = await ensurePreviewServer({ port: PORT }).catch((e) => fatal(`preview 未就绪：${e.message}`))
const executablePath = findChrome()
if (!executablePath) { stopPreview(server); fatal('找不到 Chromium/Chrome（设 CHROME_PATH 或装 Playwright chromium）；本轮不判过') }

let browser
const failures = []
const expect = (name, actual, want) => {
  if (actual === want) { console.log(`  ✓ ${name} = ${JSON.stringify(actual)}`) }
  else { failures.push(`${name}：期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(actual)}`); console.error(`  ✗ ${name}：期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(actual)}`) }
}

try {
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  // 等语言按钮挂载（React 首帧），否则点击会 race
  await page.waitForSelector('[data-testid="lang-en"], [data-testid="lang-zh"]', { timeout: 15000 })

  const readLang = () => page.evaluate(() => document.documentElement.lang)

  // 点击切英文 → <html lang> 必须是 en
  await page.click('[data-testid="lang-en"]')
  expect('切英文后 html lang', await readLang(), 'en')

  // 点击切中文 → <html lang> 必须是 zh-CN（与静态 index.html 初始值一致）
  await page.click('[data-testid="lang-zh"]')
  expect('切中文后 html lang', await readLang(), 'zh-CN')

  // 刷新 → 持久化的选择应还原成 zh-CN（证明同步覆盖了「探测/持久化」路径，不止点击那一刻）
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-testid="lang-en"], [data-testid="lang-zh"]', { timeout: 15000 })
  expect('刷新后持久化 html lang', await readLang(), 'zh-CN')

  // 反向：刷新后再切英文，仍须同步为 en（防止只有首帧生效）
  await page.click('[data-testid="lang-en"]')
  expect('刷新后再切英文 html lang', await readLang(), 'en')
}
catch (e) {
  stopPreview(server)
  fatal(`浏览器操作异常：${e.message}`)
}
finally {
  if (browser) await browser.close().catch(() => {})
  stopPreview(server)
}

if (failures.length) { console.error(`\ni18n lang 真机验收：FAIL（${failures.length} 项）`); process.exit(1) }
console.log('\ni18n lang 真机验收：PASS —— 切换与刷新后 <html lang> 均随语言同步（en / zh-CN）')
process.exit(0)
