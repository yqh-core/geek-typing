#!/usr/bin/env node
/**
 * P1.5 第 ⑩ 步的替代路径：**真实链路**生成 gt.* 快照。
 *
 * 背景（必须写清楚，否则容易被当成「用假数据糊弄门禁」）：
 *   [实测] 本机 Chrome / Edge 的 localStorage 里 gt.review.v1 / gt.memorize.v1 /
 *   gt.analytics.v1 / gt.customBanks.v1 **全部零命中**（扫描 17 个 LevelDB 文件 /
 *   3.51 MiB，UTF-16 与 UTF-8 双视图；见 `_user-snapshot/scan-ls.mjs`）——
 *   这台机器上**不存在 geek-typing 的真实历史学习数据**。
 *
 * 因此本脚本不做「编 fixture」，而是**驱动真实浏览器走真实代码路径**：
 *   启动 vite preview（真实产物） → CDP 驱动真实键盘输入 → UI 真实写入 localStorage
 *   → 导出 gt.*。产出的键结构 / ContentId / 时序都是代码真实产出的，**不是手写的**。
 *
 * 口径（务必随快照一起引用）：
 *   - **能证明**：真实 UI 链路写出的旧键格式正确、真实 ContentId 形态、迁移器与审计器
 *     在真实产物上的 orphan / caseConflict 判定是否成立。
 *   - **不能证明**：历史积累的脏数据形态（跨版本遗留、手改过的数据、真实的大小写分布）。
 *   所以它的 `source` 标注为 `real-path`（真实链路），**不是** `real-user`（用户历史）。
 *
 * 用法：node scripts/gen-real-snapshot.mjs [--words-per-bank=6] [--out=<path>]
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePreviewServer, stopPreviewAsync } from '../tests/preview-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.split('=')[1] : d
}
const WORDS_PER_BANK = Number(arg('words-per-bank', '6'))
const OUT = resolve(ROOT, arg('out', '_user-snapshot/real-path-snapshot.json'))
const PORT = 4174 // 与 e2e(4173) / offline(4174 已有) 错开；preview-server 会复用已在跑的实例

/* bank 用**数字索引**切换（`:bank N`），⚠️ 是 **1-based**（CommandPalette.tsx:202
   `n >= 1 ? banks[n - 1]`）：1=ai-core 2=cloud-native 3=frontend 4=cet4 5=cet6
   6=ielts 7=kaoyan 8=toefl 9=ts-code 10=go-code。首版写 [0..7] 是错误认知——
   `:bank 0` 是无效索引（红字 bankNotFound，停在当前库），实际只覆盖了
   ai-core/frontend/cet4/cet6/ielts/kaoyan 六个库，ts-code/go-code 从未被覆盖。
   G1-4 的驼峰词 `treeShaking` 只在 frontend 包（20 词中唯一大写词形，词表第 13 位）。
   配合 `:shuffle off`（词表序出词）+ 每库 20 词 = frontend 全量必含 treeShaking，
   自校验从「赌 shuffle 随机命中」变成确定性触发冲突路径。 */
const BANK_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const p of candidates) if (existsSync(p)) return p
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const dir of readdirSync(agents)) {
      const p = join(agents, dir, 'chrome.exe')
      if (existsSync(p)) return p
    }
  }
  return null
}

const readWord = (page) => page.locator('[data-testid="word"]').first().textContent().then((t) => (t ?? '').trim())
const waitWord = (page, ms = 4000) => page.waitForSelector('[data-testid="word"]', { state: 'attached', timeout: ms })

async function main() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error('找不到 Chromium，请设置 CHROME_PATH')
  console.log(`🌐 浏览器：${executablePath}`)

  const server = await ensurePreviewServer({ port: PORT })
  const BASE = `http://127.0.0.1:${PORT}`
  console.log(`🎯 目标：${BASE}`)

  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await page.locator('[data-testid="tab-typing"]').click()
  await waitWord(page)

  // classic 模式（严格纠错）—— 与 e2e 第 14.2 用例同一入口
  await page.keyboard.press('Escape')
  await page.keyboard.type(':mode classic', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  // 关 shuffle：按词表序出词 —— treeShaking 在 frontend 词表第 13 位，20 词全量必含
  await page.keyboard.type(':shuffle off', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')

  const typed = []
  for (const idx of BANK_INDEXES) {
    await page.keyboard.press('Escape')
    await page.keyboard.type(`:bank ${idx}`, { delay: 20 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    const words = []
    for (let i = 0; i < WORDS_PER_BANK; i++) {
      const word = await readWord(page)
      if (!word) break
      // 一半的词故意敲错一个字母再敲对 —— 复现 e2e「敲错 → 入库」的真实序列
      if (i % 2 === 0) {
        await page.keyboard.press(word[0] === 'z' ? 'x' : 'z')
        await page.waitForTimeout(120)
      }
      await page.keyboard.type(word.toLowerCase(), { delay: 18 })
      await page.waitForTimeout(320)
      typed.push({ bankIndex: idx, word, withWrongKey: i % 2 === 0 })
      words.push(word)
    }
    console.log(`  · bank[${idx}]: 真实打字 ${words.length} 词  ${words.slice(0, 4).join('/')}${words.length > 4 ? '…' : ''}`)
  }

  const snapshot = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('gt.'))),
  )
  await browser.close()
  await stopPreviewAsync(server)

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2))

  console.log(`\n📦 快照：${OUT}`)
  for (const [k, v] of Object.entries(snapshot)) {
    let n = ''
    try {
      const p = JSON.parse(v)
      n = Array.isArray(p) ? `数组 ${p.length} 项` : typeof p === 'object' && p ? `对象 ${Object.keys(p).length} 键` : `标量 ${String(p)}`
    } catch {
      n = '非 JSON'
    }
    console.log(`   ${k.padEnd(22)} ${String(v.length).padStart(8)} 字符   ${n}`)
  }
  /* 自校验：G1-4 的 case conflict 只在**含大写的词形**上才可能触发
     （analytics 写 lowercase 键，与 content 原词形对比）。样本里若一个大写词都没有，
     那个「Case conflict 0」就是**没触发路径的 0**（恒真假通过），必须显式告警。 */
  const camel = [...new Set(typed.map((t) => t.word))].filter((w) => /[A-Z]/.test(w))
  console.log(`\n打字共 ${typed.length} 词（其中 ${typed.filter((t) => t.withWrongKey).length} 词含故意敲错）`)
  console.log(
    camel.length > 0
      ? `✅ 自校验：样本含 ${camel.length} 个大写词形（${camel.slice(0, 8).join(', ')}）—— G1-4 的冲突路径**被真实触发过**`
      : `⚠️ 自校验失败：样本**没有任何**含大写的词 —— 此时的「Case conflict 0」是没触发路径的 0，不能作为 G1-4 的证据`,
  )
  console.log(`控制台错误：${errors.length} 条${errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''}`)
  console.log('\n⚠️ 口径：source=real-path（真实链路产出），**不是** real-user（用户历史积累）')
}

main().catch((e) => {
  console.error('❌ 生成失败：', e)
  process.exit(1)
})
