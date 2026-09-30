/**
 * 生产环境「内容目录汇总」实测校验（post-deploy live check）
 *
 * 目的：把 W5C 的 Home 组合（catalogSummary → "词库 18 · 9388 词"）在
 * **真实 Cloudflare Pages 生产域名**上做独立实测，作为 P1.7 Production
 * Deployment CLOSED 的实证（而非仅 CI 部署 job success）。
 *
 * 与 prod-smoke.mjs 互补：prod-smoke 断言 HTTP 指纹 / SW 升级链路，
 * 本脚本断言**业务内容确实渲染到了线上**。
 *
 * 用法：
 *   node tests/prod-catalog-check.mjs                       # 默认打生产
 *   E2E_BASE=<url> node tests/prod-catalog-check.mjs        # 指定目标
 *
 * 退出码：断言通过 0，否则 1（供 CI / 人工复跑判红）。
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
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

  check(
    '生产环境 home-catalog-summary 渲染（词库 18 · 9388 词）',
    text.includes('18') && text.includes('9388') && text.includes('词库') && text.includes('词'),
    `text="${text}"`,
  )
  check('生产环境无 console / page 运行时错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

console.log(`\n生产实测：共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
if (failures > 0) process.exitCode = 1
