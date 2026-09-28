#!/usr/bin/env node
/**
 * P1.5-S3 · browser-migration-e2e：**真实浏览器里**跑通迁移全生命周期
 *
 *   预置 V1 → apply（5 新键）→ reload 幂等（0 重复写入）→ rollback（逐字节恢复）
 *
 * 为什么需要它：G3 的幂等/回滚判据都是在 Node ssrLoadModule 里验证的 —— 浏览器的
 * localStorage 是**另一套实现**（Chrome LevelDB、UTF-16 键存储、逐页签共享）。迁移
 * 上线跑在浏览器里，判据就必须在浏览器里复验一次。
 *
 * 怎么加载 TS：起 **vite dev server**（非 preview —— 需要源模块的即时转译），浏览器内
 * `await import('/src/lib/learning/migrate.ts')` 加载**真实源码**。落盘组装严格按
 * §2.7.2 契约（与 tests/learning-storage.mjs G 段同一顺序）：saveLearningV2 →
 * saveLetterStats → saveTotals → backup setItem → saveMigrationMarker。
 * ⚠️ S4（UI 接线迁移）冻结中，页面自身不触发迁移 —— 本脚本的浏览器内胶水就是
 * S4 接线时应采用的顺序，接线后本脚本改调页面入口即可复用全部断言。
 *
 * 口径声明：
 *   - ContentProvider 用**内联微缩实现**（3 个词：treeShaking / useEffect / apple，
 *     analytics 预置 **legacy lowercase 键** 模拟 P1.5-S1 修复前历史形态）——本 e2e 验证
 *     的是浏览器 localStorage 语义（幂等 / reload / 逐字节回滚），不是内容真值解析
 *    （那由 G2/G3 的 SSR 门禁锁定）。
 *   - 干扰键 gt.streak.v1（NOT_IN_SCOPE）与 gt.junk.notinlist（清单外）必须原样幸存。
 *
 * 退出码：0=全部判据 PASS；1=有判据 FAIL；2=脚本自身错误。
 * 用法：node tests/browser-migration-e2e.mjs
 */
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4175 // e2e=4173 / offline+gen-snapshot=4174，错开

let pass = 0
let fail = 0
const failures = []
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

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

const V1_REVIEW = {
  treeShaking: { wrongCount: 2, correctStreak: 1, lastWrongAt: 1758900000000, nextReviewAt: 1758986400000, intervalIdx: 1 },
  useEffect: { wrongCount: 1, correctStreak: 0, lastWrongAt: 1758900000000, nextReviewAt: 1758986400000, intervalIdx: 0 },
  apple: { wrongCount: 0, correctStreak: 3, lastWrongAt: 0, nextReviewAt: 1759072800000, intervalIdx: 2 },
}
const V1_MEMORIZE = {
  treeShaking: { status: 'fuzzy', reviews: 4, lastAt: 1758900000000 },
  useEffect: { status: 'unknown', reviews: 2, lastAt: 1758900000000 },
}
// analytics words 键 = lowercase —— P1.5-S1 修复前 recordWordDone 的历史形态
const V1_ANALYTICS = {
  letters: { t: { hit: 30, miss: 4 }, e: { hit: 50, miss: 6 } },
  words: {
    treeshaking: { done: 5, wrong: 2 },
    useeffect: { done: 3, wrong: 1 },
    apple: { done: 8, wrong: 1 },
  },
  totalKeys: 900,
  totalCorrect: 810,
  totalWords: 16,
  bestWpm: 77,
}
const PRESET = {
  'gt.review.v1': JSON.stringify(V1_REVIEW),
  'gt.memorize.v1': JSON.stringify(V1_MEMORIZE),
  'gt.analytics.v1': JSON.stringify(V1_ANALYTICS),
  'gt.customBanks.v1': JSON.stringify([]),
  // 干扰键（必须原样幸存）
  'gt.streak.v1': JSON.stringify({ '2026-09-28': { date: '2026-09-28', words: 40, seconds: 600 } }),
  'gt.junk.notinlist': JSON.stringify({ keep: 'me' }),
}

/* 内联微缩 ContentProvider（口径见文件头）—— 数据表形态（playwright evaluate 只能传可序列化值，
   函数在浏览器内重建） */
const PROVIDER_DATA = {
  lowerToForms: { treeshaking: ['treeShaking'], useeffect: ['useEffect'], apple: ['apple'] },
  wordToPkgs: { treeShaking: ['frontend'], useEffect: ['ts-code'], apple: ['cet4'] },
  pkgInfo: { frontend: { namespace: 'frontend' }, 'ts-code': { namespace: 'ts-code' }, cet4: { namespace: 'cet4' } },
}
/** 浏览器内注入的 provider 构建源码（page.evaluate 顶部 eval 成函数组） */
const PROVIDER_SOURCE = `(function (PD) {
  return {
    lowerToForms: (l) => PD.lowerToForms[l] ?? null,
    wordToPkgs: (w) => PD.wordToPkgs[w] ?? null,
    pkgInfo: (p) => PD.pkgInfo[p] ?? null,
  }
})(${JSON.stringify(PROVIDER_DATA)})`

console.log('P1.5-S3 · browser-migration-e2e')
const chrome = findChrome()
if (!chrome) {
  console.error('FAIL(EXIT=2)：找不到 Chrome/Edge')
  process.exit(2)
}
console.log(`🌐 浏览器：${chrome}`)

const server = await createServer({ root: ROOT, server: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen() // createServer 不会自动监听 —— 必须显式 listen；host 显式 IPv4（vite 默认 localhost 会绑 ::1，Chrome 连 127.0.0.1 直接 refused）
const BASE = `http://127.0.0.1:${PORT}`
console.log(`🚀 vite dev 已就绪（${BASE}）`)

const browser = await chromium.launch({ executablePath: chrome, headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })

  /* ---------- 预置 V1（预置前先清场） ---------- */
  await page.evaluate((preset) => {
    localStorage.clear()
    for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v)
  }, PRESET)
  // 逐字节基线（预置态）
  const baseline = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))

  /* ---------- 浏览器内加载真实源码模块 ---------- */
  const loaded = await page.evaluate(async () => {
    const mod = await import('/src/lib/learning/migrate.ts')
    const sto = await import('/src/lib/learning/storage.ts')
    return { hasMigrate: typeof mod.migrateV1toV2 === 'function', hasRollback: typeof sto.rollbackLearningV1 === 'function' }
  })
  ok('浏览器内 import 真实 migrate.ts / storage.ts 成功', loaded.hasMigrate && loaded.hasRollback, JSON.stringify(loaded))

  /* ---------- apply：纯函数 + 契约顺序落盘 ---------- */
  const applyResult = await page.evaluate(async (providerSource) => {
    const mod = await import('/src/lib/learning/migrate.ts')
    const sto = await import('/src/lib/learning/storage.ts')
    const provider = eval(providerSource)
    const raw = Object.fromEntries(Object.entries(localStorage))
    const split = mod.splitSnapshot(raw)
    const run = mod.migrateV1toV2(split.snapshot, provider, {
      runtime: 'browser',
      now: 1759000000000,
      source: 'real-path',
      sourceDetail: 'browser-migration-e2e preset',
      // P1.5-S3 缝隙修复的注入点：analytics 原文保键序，回滚写回才能逐字节还原
      preserveBackupKeys: { analytics: raw['gt.analytics.v1'] },
    })
    if (run.skipped) return { skipped: true }
    // §2.7.2 落盘顺序（S4 接线应复用）
    sto.saveLearningV2(run.next.learning)
    sto.saveLetterStats(run.next.letterStats)
    sto.saveTotals(run.next.totals)
    localStorage.setItem('gt.learning.v2.backup', JSON.stringify(run.next.backup))
    sto.saveMigrationMarker(run.next.marker)
    return {
      skipped: run.skipped,
      pendingWrites: run.pendingWrites,
      tiers: run.report.tiers,
      marker: run.next.marker,
      learningKeys: Object.keys(run.next.learning).length,
    }
  }, PROVIDER_SOURCE)

  console.log(`\n【apply】迁移三档：resolved=${applyResult.tiers?.resolved} ambiguous=${applyResult.tiers?.ambiguous} orphan=${applyResult.tiers?.orphan} caseConflict=${applyResult.tiers?.caseConflict} invalid=${applyResult.tiers?.invalid}（learning ${applyResult.learningKeys} 条）`)

  const FIVE_KEYS = ['gt.learning.v2', 'gt.letterStats.v1', 'gt.totals.v1', 'gt.learning.v2.backup', 'gt.migration.v1']
  const LEGACY_KEYS = ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1']

  /* ① 5 新键全部落盘 */
  const afterApply = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  ok('① apply 后 5 个新键全部存在', FIVE_KEYS.every((k) => k in afterApply), FIVE_KEYS.filter((k) => !(k in afterApply)).join(',') || '5/5')
  ok('① pendingWrites === writtenKeys 五键', JSON.stringify([...(applyResult.pendingWrites ?? [])].sort()) === JSON.stringify([...FIVE_KEYS].sort()), JSON.stringify(applyResult.pendingWrites))

  /* ② legacy 四键保留（§2.7 legacyKeysRetained） */
  ok('② legacy 四键保留（迁移不清除旧键）', LEGACY_KEYS.every((k) => k in afterApply))
  ok('② legacy 键值逐字节未动', LEGACY_KEYS.every((k) => afterApply[k] === baseline[k]))

  /* ③ 迁移产物内容正确：V2 键是 **ContentId**（types.ts:54 口径），legacy lowercase 键
     被 lowerToForms 解析回原词形后再构造 ContentId —— 用裸词查键是断言错误，不是迁移错误 */
  const v2 = JSON.parse(afterApply['gt.learning.v2'])
  const v2Keys = Object.keys(v2)
  ok('③ gt.learning.v2 含 content:word:frontend:treeShaking（legacy treeshaking 解析成功）',
    v2Keys.includes('content:word:frontend:treeShaking'), v2Keys.join(','))
  ok('③ gt.learning.v2 含 content:word:ts-code:useEffect（legacy useeffect 解析成功）',
    v2Keys.includes('content:word:ts-code:useEffect'))
  ok('③ 不存在 legacy 小写裸词键', v2Keys.every((k) => k.startsWith('content:word:')))
  const totals = JSON.parse(afterApply['gt.totals.v1'])
  ok('③ gt.totals.v1 继承 analytics 标量（totalWords=16 / bestWpm=77）', totals.totalWords === 16 && totals.bestWpm === 77, JSON.stringify(totals))

  /* ---------- reload 幂等 ---------- */
  await page.reload({ waitUntil: 'load' })
  const afterReloadBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const rerun = await page.evaluate(async (providerSource) => {
    const mod = await import('/src/lib/learning/migrate.ts')
    const sto = await import('/src/lib/learning/storage.ts')
    const provider = eval(providerSource)
    const raw = Object.fromEntries(Object.entries(localStorage))
    const split = mod.splitSnapshot(raw)
    const marker = sto.loadMigrationMarker()
    const run = mod.migrateV1toV2(split.snapshot, provider, {
      runtime: 'browser',
      now: 1759000000001, // 故意用不同 now：幂等性应靠指纹而不是时间戳
      source: 'real-path',
      existingMarkerFingerprint: marker?.sourceFingerprint ?? null,
    })
    return { skipped: run.skipped, pendingWrites: run.pendingWrites ?? [], markerReadOk: marker !== null }
  }, PROVIDER_SOURCE)

  console.log(`\n【reload 幂等】marker 读取=${rerun.markerReadOk} skipped=${rerun.skipped} pendingWrites=${rerun.pendingWrites.length}`)
  ok('④ reload 后 marker 可读', rerun.markerReadOk)
  ok('④ 二次迁移命中指纹 → skipped=true', rerun.skipped === true)
  ok('④ 二次迁移 pendingWrites = 0（0 重复写入）', rerun.pendingWrites.length === 0)
  const afterRerun = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const keysUnion = [...new Set([...Object.keys(afterReloadBefore), ...Object.keys(afterRerun)])]
  ok('④ reload 前后 localStorage 逐字节一致（0 写入的直接证据）',
    keysUnion.every((k) => afterReloadBefore[k] === afterRerun[k]),
    keysUnion.filter((k) => afterReloadBefore[k] !== afterRerun[k]).join(',') || 'all identical')

  /* ---------- rollback 逐字节恢复 ----------
     ⚠️ 取证纪律（首跑揪出的真实现象）：reload 后**真实 App 会重新挂载并自写部分键**
     （gt.streak.v1 当日初始化等）—— 所以 rollback 后不能靠「事后再 dump 一次」取证：
     React 内存态随时可能把刚恢复的值覆写回去。恢复结果必须在**同一个 evaluate 的
     同步窗口内**读取并返回。 */
  const rb = await page.evaluate(async () => {
    const sto = await import('/src/lib/learning/storage.ts')
    const marker = sto.loadMigrationMarker()
    const token = marker?.rollbackToken
    if (!token) return { hasToken: false }
    const LEGACY = ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1']
    const FIVE = ['gt.learning.v2', 'gt.letterStats.v1', 'gt.totals.v1', 'gt.learning.v2.backup', 'gt.migration.v1']
    const outcome = sto.rollbackLearningV1(token)
    // 同步窗口内取证：恢复后的键值原样带出
    const restoredRaw = Object.fromEntries(LEGACY.map((k) => [k, localStorage.getItem(k)]))
    const fivePresent = Object.fromEntries(FIVE.map((k) => [k, localStorage.getItem(k) !== null]))
    return { hasToken: true, outcome, restoredRaw, fivePresent }
  })

  console.log(`\n【rollback】restored=${rb.outcome?.restored?.length ?? '?'} removed=${rb.outcome?.removed?.length ?? '?'} failed=${rb.outcome?.failed?.length ?? '?'} markerCleared=${rb.outcome?.markerCleared}`)
  ok('⑤ rollback 后 legacy 四键逐字节恢复（含历史 lowercase analytics 键）',
    rb.hasToken && LEGACY_KEYS.every((k) => rb.restoredRaw[k] === baseline[k]),
    LEGACY_KEYS.filter((k) => rb.restoredRaw?.[k] !== baseline[k])
      .map((k) => {
        const a = baseline[k] ?? ''
        const b = rb.restoredRaw[k] ?? ''
        // 找出第一个分歧点，打出两侧上下文 —— 拒绝只说「不相等」
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) i++
        return `${k} 分歧@${i} baseline=[${a.slice(Math.max(0, i - 40), i + 40)}] restored=[${b.slice(Math.max(0, i - 40), i + 40)}] len=${a.length}/${b.length}`
      })
      .join(' ; ') || 'byte-identical')
  ok('⑤ 5 个新键全部清除（writtenKeys 驱动，同步窗口取证）',
    rb.hasToken && FIVE_KEYS.every((k) => rb.fivePresent[k] === false),
    FIVE_KEYS.filter((k) => rb.fivePresent?.[k] === true).join(',') || '5/5 removed')
  // 幸存判据的比较对象 = rollback 前一刻（afterRerun）：app 自己改过的键 rollback 不许碰
  const afterRollback = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  ok('⑤ 干扰键幸存（streak NOT_IN_SCOPE + 清单外 junk，rollback 前后零变化）',
    ['gt.streak.v1', 'gt.junk.notinlist'].every((k) => afterRollback[k] === afterRerun[k]))
  ok('⑤ marker 已清（markerCleared=true）', rb.outcome?.markerCleared === true)
  ok('⑤ rollback 零失败（failed 空）', Array.isArray(rb.outcome?.failed) && rb.outcome.failed.length === 0)

  /* ---------- 页面健康 ---------- */
  ok('⑥ 全程无 console / page 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log('──────────────────────────────────────────────────────')
  console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  console.log('──────────────────────────────────────────────────────')
} catch (e) {
  console.error('FAIL(EXIT=2)：脚本自身错误 —', e?.stack ?? e)
  fail = 1
  process.exitCode = 2
} finally {
  await browser.close()
  await server.close()
}

if (fail > 0) {
  console.log('失败项：', failures.join(' / '))
  process.exit(1)
}
process.exit(0)
