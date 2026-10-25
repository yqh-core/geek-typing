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

/**
 * 被测对象绑定守卫（2026-10-23 加）：preview-server.mjs 只 spawn `vite preview`、**不构建**，
 * 所以它服务的是「磁盘上现有的 dist」。dist 若比源码旧，本测试读到的就是**旧代码**，
 * 完全可能给出一个真机 PASS —— 这是假绿里最贵的一类（比假红贵，因为它看起来像验收过了）。
 *
 * 判据用「有没有源码比 dist/index.html 更新」，而不是记 dist 的绝对时间：
 * 绝对时间会随每次正常构建漂移（写死就是易失抄写位），相对新旧关系才是稳定判据。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function newestMtime(dir, skip = new Set(['node_modules', '.git', 'dist'])) {
  let newest = 0
  let walked = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(join(d, e.name))
        continue
      }
      if (!e.isFile()) continue
      walked++
      try {
        const m = statSync(join(d, e.name)).mtimeMs
        if (m > newest) newest = m
      } catch {
        /* 并发删除：跳过，不影响判据 */
      }
    }
  }
  return { newest, walked }
}

/** 返回 null = 绑定可信；返回字符串 = 不可信原因（调用方必须据此判 UNDECIDED，不得判 PASS） */
function staleDistReason(root = process.cwd()) {
  const distHtml = join(root, 'dist', 'index.html')
  if (!existsSync(distHtml)) return 'dist/index.html 不存在，preview 无被测对象'
  const distM = statSync(distHtml).mtimeMs
  const srcDir = join(root, 'src')
  if (!existsSync(srcDir)) return 'src 目录不存在，无法自证被测对象绑定'
  const { newest, walked } = newestMtime(srcDir)
  if (walked === 0) return 'src 扫描到 0 个文件（扫描覆盖自证失败，不得当成「没有更新的源码」）'
  if (newest > distM) {
    const lag = ((newest - distM) / 1000).toFixed(0)
    return `src 里有文件比 dist/index.html 新 ${lag}s —— dist 是旧构建，本轮真机结果绑定的是旧代码，需先构建（扫描 ${walked} 个源文件）`
  }
  return null
}

// --falsify-stale：自带证伪，证明上面这条守卫不是摆设（用临时夹具，绝不改真实 src 的时间）
if (process.argv.includes('--falsify-stale')) {
  const { mkdtempSync, writeFileSync, utimesSync, mkdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const fake = mkdtempSync(join(tmpdir(), 'stale-dist-'))
  mkdirSync(join(fake, 'dist'), { recursive: true })
  mkdirSync(join(fake, 'src'), { recursive: true })
  writeFileSync(join(fake, 'dist', 'index.html'), '<html><body>old</body></html>')
  writeFileSync(join(fake, 'src', 'a.ts'), 'export const a = 1')
  const old = new Date(Date.now() - 60_000)
  utimesSync(join(fake, 'dist', 'index.html'), old, old)
  const caught = staleDistReason(fake)
  const greenControl = (() => {
    const fresh = new Date()
    utimesSync(join(fake, 'dist', 'index.html'), fresh, fresh)
    return staleDistReason(fake)
  })()
  console.log(`  反例（dist 旧于 src）→ ${caught ? '判红：' + caught.slice(0, 60) : 'BAD 未拦住，守卫是摆设'}`)
  console.log(`  对照（dist 新于 src）→ ${greenControl === null ? '判绿（正确）' : 'BAD 恒真，守卫会一直拦红'}`)
  if (!caught || greenControl !== null) {
    console.error('\nFAIL：stale-dist 守卫未同时满足「能判红」与「能判绿」')
    process.exit(1)
  }
  console.log('\nOK：stale-dist 守卫正反例均符合预期')
  process.exit(0)
}

const stale = staleDistReason()
if (stale) fatal(`被测对象绑定不可信：${stale}`)
console.log(`  · 被测对象绑定自证：dist/index.html 不早于 src 内任何源文件（扫描 ${newestMtime(join(process.cwd(), 'src')).walked} 个）`)

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
  // 关键非恒真设计：用 en-US locale 的 context 打开。旧实现（探测浏览器语言）在这里
  // 会直接渲染英文 UI 并露出 lang-en 按钮 → 本门禁必然判红；新实现钉死中文 → 判绿。
  const ctx = await browser.newContext({ locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, null, { timeout: 15000 })

  const readLang = () => page.evaluate(() => document.documentElement.lang)
  const toggleCount = () => page.locator('[data-testid="lang-en"], [data-testid="lang-zh"]').count()
  const bodyText = () => page.evaluate(() => document.body.innerText)

  expect('英文浏览器下语言切换按钮数', await toggleCount(), 0)
  expect('英文浏览器下 html lang', await readLang(), 'zh-CN')
  // 非空白页对照：钉死中文必须真的渲染出中文导航（防「UI 全删也绿」）
  const zhBody = await bodyText()
  expect('应用区中文导航在场', ['练习', '词库', '设置'].every((k) => zhBody.includes(k)), true)

  // 伪造历史英文偏好 → 刷新后仍中文（钉死语义）
  await page.evaluate(() => { try { localStorage.setItem('gt.lang', 'en') } catch {} })
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, null, { timeout: 15000 })
  expect('注入 gt.lang=en 刷新后 html lang 仍', await readLang(), 'zh-CN')
  expect('注入后按钮仍不存在', await toggleCount(), 0)
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
console.log('\ni18n lang 真机验收：PASS —— 语言切换 UI 已按产品裁定移除，英文浏览器/伪造偏好/刷新下均钉死中文（lang=zh-CN、按钮=0）')
process.exit(0)
