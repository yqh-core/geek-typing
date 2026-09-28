#!/usr/bin/env node
/**
 * 任务 ②：Learning 数据一致性审计器（Content inventory × Learning inventory）
 *
 * 退出码约定（为将来接 CI）：
 *   EXIT=0  全部干净（orphan === 0 且 caseConflict === 0 且 invalid === 0）
 *   EXIT=1  存在 orphan > 0 或 caseConflict > 0 或 invalid > 0
 *   EXIT=2  脚本自身错误（读文件失败 / JSON 解析失败 / 参数错误 / Chrome 启动失败等）
 *
 * ⚠️ synthetic 特例：无真实数据来源时会用词表合成数据，并**故意注入** orphan /
 *    caseConflict / invalid 样本以验证各分支可达。此时若按上面的规则判红，CI 在
 *    「未提供 --user-store」时会永久红。故：
 *      - source=synthetic 且未显式加 --allow-synthetic ⇒ 退出码**降级为 0**，且表内明确警示
 *      - 想强制按脏数据判红（纯结构自检）⇒ 加 --allow-synthetic
 *    这样「绿」不会把「其实没测真实数据」冒充成「真实数据干净」。
 *
 * 只读脚本：不修改 src/ 下任何文件。
 *
 * 用法：
 *   node scripts/learning-consistency.mjs                        # 从 Chrome 真实 localStorage 读
 *   node scripts/learning-consistency.mjs --user-store=<旧快照.json>   # 从快照文件读
 *   node scripts/learning-consistency.mjs --json                 # 机器可读 JSON（同时保留人类表到 stderr）
 *   node scripts/learning-consistency.mjs --base=http://127.0.0.1:5173
 *   node scripts/learning-consistency.mjs --no-browser           # 禁用浏览器（无 user-store 时退化为纯合成）
 *   node scripts/learning-consistency.mjs --allow-synthetic      # synthetic 也按脏数据判红（结构自检）
 *
 * 数据来源（source 字段，绝不混淆）：
 *   "user-store"  —— 来自 --user-store=<file>，真实用户旧快照
 *   "browser"     —— 来自真实浏览器 localStorage（该 profile 可能是新 profile，通常为空）
 *   "synthetic"   —— 无任何真实数据来源时，用词表本身合成（**必须显式标注，绝不能冒充真实数据**）
 *
 * 内容侧口径完全复用 scripts/migration-audit.mjs：
 *   contentRecords = 9,346 / contentDistinct = 6,713 / resolved = 4,390 / ambiguous = 2,323
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePreviewServer, stopPreview } from '../tests/preview-server.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VOCAB = join(ROOT, 'content', 'vocabulary')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const noBrowser = argv.includes('--no-browser')
const allowSynthetic = argv.includes('--allow-synthetic')
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))
const BASE = argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:4173'
const ownedBase = !argv.some((a) => a.startsWith('--base='))

/* ===========================================================================
 * 1. 内容侧真值（与 migration-audit.mjs 同口径）
 * ========================================================================= */
function loadContent() {
  const pkgs = readdirSync(VOCAB, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const pkgInfo = new Map()
  const wordToPkgs = new Map()
  const lowerToPkgs = new Map() // lowercase 归并 → 包集合
  const lowerToForms = new Map() // lowercase 归并 → 原始词形集合（检测「跨包大小写形态不一致」）
  let contentRecords = 0

  for (const p of pkgs) {
    const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
    const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
    contentRecords += words.length
    // 包内去重（与 migration-audit 一致：同包同 word 会让 ContentId 撞车）
    const uniq = [...new Set(words.map((r) => r.word))]
    pkgInfo.set(p, { pkg: p, namespace: mf.namespace, manifestId: mf.id, uniqueCount: uniq.length })
    for (const w of uniq) {
      if (!wordToPkgs.has(w)) wordToPkgs.set(w, [])
      wordToPkgs.get(w).push(p)
      const l = w.toLowerCase()
      if (!lowerToPkgs.has(l)) lowerToPkgs.set(l, new Set())
      lowerToPkgs.get(l).add(p)
      if (!lowerToForms.has(l)) lowerToForms.set(l, new Set())
      lowerToForms.get(l).add(w)
    }
  }
  return { pkgs, pkgInfo, wordToPkgs, lowerToPkgs, lowerToForms, contentRecords }
}

/* ===========================================================================
 * 2. 键合法性判据
 * ========================================================================= */
const MAX_WORD_LEN = 512

/** 合法 word：非空字符串、非纯空白、长度 <= MAX_WORD_LEN、且至少含一个字母或数字 */
function isValidWordKey(k) {
  if (typeof k !== 'string') return false
  if (k.length === 0) return false
  if (k.length > MAX_WORD_LEN) return false
  if (/^\s*$/.test(k)) return false
  if (!/[A-Za-z0-9]/.test(k)) return false
  return true
}

/**
 * 逐键分类。
 * 注意 caseConflict 与 ambiguous 可能同时成立（键小写能命中但精确不能，且跨包）——
 * 因此两者是「非互斥谓词」，本审计器只要求各项**独立计数**，不要求互斥求和。
 */
function classifyKey(k, content) {
  if (!isValidWordKey(k)) return { kind: 'invalid', reason: '非法键（空/非字符串/纯空白/超长/无字母数字）' }
  const exact = content.wordToPkgs.get(k)
  const lower = content.lowerToPkgs.get(k.toLowerCase())
  if (!exact && !lower) return { kind: 'orphan', reason: '精确与小写归并在内容侧均不存在' }
  if (!exact && lower) return { kind: 'caseConflict', reason: '小写能命中但精确不能（大小写口径不一致）' }
  // exact 命中
  if (exact.length >= 2) return { kind: 'ambiguous', pkgs: exact, reason: `跨 ${exact.length} 个包，裸 word 无法反推包` }
  return { kind: 'matched', pkg: exact[0] }
}

/* ===========================================================================
 * 3. 学习侧数据来源
 * ========================================================================= */
const STORE_KEYS = {
  review: 'gt.review.v1',
  memorize: 'gt.memorize.v1',
  analytics: 'gt.analytics.v1',
}

const EMPTY_LEARNING = { review: {}, memorize: {}, analytics: {} }

/**
 * 从 store 对象里抽出「word 键集」。
 * analytics 的真实 schema 是 { letters, words, totalKeys, ... }，word 在 obj.words 下；
 * 但旧快照 / 手工导出的单 store 转储可能是裸 map（直接 word → stat）。
 * 两种形状都支持：有 .words 对象则取它，否则取顶层键。
 */
function keysOf(storeName, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  if (storeName === 'analytics' && obj.words && typeof obj.words === 'object' && !Array.isArray(obj.words)) {
    return Object.keys(obj.words)
  }
  return Object.keys(obj)
}

function loadFromUserStore(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const out = { review: {}, memorize: {}, analytics: {} }
  for (const [name, key] of Object.entries(STORE_KEYS)) {
    const v = raw[key]
    // 浏览器导出的快照里，localStorage 的值**必然是 JSON 字符串**（localStorage 只存字符串）。
    // 首版只认 object ⇒ 用户按标准方式（`Object.fromEntries(Object.entries(localStorage))`）
    // 导出的快照被静默跳过：三个 store 全空、Orphan/Case conflict 全 0、**EXIT 还是 0** —— 假通过。
    // 故这里必须解一层字符串；解析失败要显式炸，不许回落成空表（静默降级比 FAIL 更贵）。
    if (typeof v === 'string') {
      try {
        out[name] = JSON.parse(v)
      } catch (e) {
        throw new Error(`--user-store=${file} 的 ${key} 不是合法 JSON：${e.message}`)
      }
    } else if (v && typeof v === 'object') {
      // 旧快照可能是「单 store 转储」（顶层就是 word 映射）或「多 store 包」（带 gt.* 键）
      out[name] = v
    } else if (name === 'review' && !Object.keys(raw).some((k) => k.startsWith('gt.'))) {
      out[name] = raw
    }
  }
  return out
}

function loadFromBrowserSnapshot(snap) {
  const out = { review: {}, memorize: {}, analytics: {} }
  for (const [name, key] of Object.entries(STORE_KEYS)) {
    const str = snap[key]
    if (!str) continue
    try {
      out[name] = JSON.parse(str)
    } catch {
      out[name] = {}
    }
  }
  return out
}

/**
 * 合成数据：从真实词表取键，**仅用于结构自检**。
 * 报告里 source="synthetic"，且 synthetic 混合大小写并注入非法键，
 * 目的是让审计器的各分类分支都被真实执行到（不是在冒充真实数据）。
 */
function buildSynthetic(content) {
  const words = [...content.wordToPkgs.keys()]
  const review = {}
  const memorize = {}
  // analytics 走真实 Analytics schema：letters + words + 汇总标量
  const letters = {}
  for (const c of 'etaoinshrdlucmfwypvbgkjqxz') letters[c] = { hit: 20 + (c.charCodeAt(0) % 30), miss: c.charCodeAt(0) % 7 }
  const analyticsWords = {}
  // review/memorize 用原词形
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    review[w] = { wrongCount: 1 + (i % 5), correctStreak: i % 4, lastWrongAt: i, nextReviewAt: i + 1, intervalIdx: i % 5 }
    memorize[w] = { status: ['known', 'fuzzy', 'unknown'][i % 3], reviews: 1 + (i % 6), lastAt: i }
  }
  // analytics words 键故意用 lowercase —— 模拟 V1 旧 recordWordDone 的历史口径
  //（P1.5-S1 已修复为原词形 + legacy 兼容；此处保留 lowercase 以让 conflict 分类分支被执行到）
  for (const w of words) analyticsWords[w.toLowerCase()] = { done: 1 + (w.length % 5), wrong: w.length % 3 }
  // 注入非法键（空串 / 纯空白 / 超长 / 无字母数字）
  review[''] = { wrongCount: 0, correctStreak: 0, lastWrongAt: 0, nextReviewAt: 0, intervalIdx: 0 }
  review['   '] = { wrongCount: 0, correctStreak: 0, lastWrongAt: 0, nextReviewAt: 0, intervalIdx: 0 }
  review['x'.repeat(MAX_WORD_LEN + 1)] = { wrongCount: 0, correctStreak: 0, lastWrongAt: 0, nextReviewAt: 0, intervalIdx: 0 }
  memorize['---'] = { status: 'known', reviews: 0, lastAt: 0 }
  analyticsWords['@@@'] = { done: 0, wrong: 0 }
  // 注入 orphan（内容侧不存在的词）
  review['zzz_not_in_content_2026'] = { wrongCount: 1, correctStreak: 0, lastWrongAt: 0, nextReviewAt: 0, intervalIdx: 0 }
  memorize['zzz_not_in_content_2026'] = { status: 'fuzzy', reviews: 1, lastAt: 0 }
  analyticsWords['zzz_not_in_content_2026'] = { done: 1, wrong: 0 }

  const analytics = {
    letters,
    words: analyticsWords,
    totalKeys: 123456,
    totalCorrect: 118000,
    totalWords: Object.keys(analyticsWords).length,
    bestWpm: 92,
  }
  return { review, memorize, analytics }
}

/* ===========================================================================
 * 4. 审计核心
 * ========================================================================= */
function audit(content, learning, source, sourceDetail) {
  const perStore = {}
  const allKeys = { matched: [], orphan: [], caseConflict: [], ambiguous: [], invalid: [] }
  const seenLowerByStore = {}

  for (const [name, obj] of Object.entries(learning)) {
    const keys = keysOf(name, obj)
    const counts = { matched: 0, orphan: 0, caseConflict: 0, ambiguous: 0, invalid: 0 }
    const detail = { matched: [], orphan: [], caseConflict: [], ambiguous: [], invalid: [] }
    for (const k of keys) {
      const c = classifyKey(k, content)
      counts[c.kind]++
      const rec = { key: k, ...(c.pkgs ? { pkgs: c.pkgs } : {}), ...(c.pkg ? { pkg: c.pkg } : {}), ...(c.reason ? { reason: c.reason } : {}) }
      detail[c.kind].push(rec)
      allKeys[c.kind].push({ store: name, ...rec })
    }
    // duplicate：同一 lowercase 归并键对应多种原词形（键内视角）
    const lowerForms = new Map()
    for (const k of keys) {
      if (!isValidWordKey(k)) continue
      const l = k.toLowerCase()
      if (!lowerForms.has(l)) lowerForms.set(l, new Set())
      lowerForms.get(l).add(k)
    }
    const duplicate = [...lowerForms.entries()].filter(([, s]) => s.size > 1)
    seenLowerByStore[name] = lowerForms

    perStore[name] = {
      localStorageKey: STORE_KEYS[name],
      keyCount: keys.length,
      counts,
      duplicate: duplicate.length,
      duplicateSample: duplicate.slice(0, 10).map(([lower, forms]) => ({ lower, forms: [...forms] })),
      samples: {
        orphan: detail.orphan.slice(0, 10),
        caseConflict: detail.caseConflict.slice(0, 10),
        ambiguous: detail.ambiguous.slice(0, 10),
        invalid: detail.invalid.slice(0, 10),
        matched: detail.matched.slice(0, 5),
      },
    }
  }

  // duplicate（内容侧视角）：语料里同一 lowercase 对应多个原词形 —— 会导致
  // analytics 的 lowercase 键无法回推唯一原词
  const contentCaseCollisions = [...content.lowerToForms.entries()]
    .filter(([, forms]) => forms.size > 1)
    .map(([lower, forms]) => ({ lower, forms: [...forms] }))

  const totals = {
    matched: allKeys.matched.length,
    orphan: allKeys.orphan.length,
    caseConflict: allKeys.caseConflict.length,
    ambiguous: allKeys.ambiguous.length,
    invalid: allKeys.invalid.length,
    duplicate: Object.values(perStore).reduce((s, x) => s + x.duplicate, 0),
  }

  return {
    generatedBy: 'scripts/learning-consistency.mjs',
    generatedAt: new Date().toISOString(),
    source,
    sourceDetail,
    content: {
      contentRecords: content.contentRecords,
      contentDistinct: content.wordToPkgs.size,
      contentDistinctLower: content.lowerToPkgs.size,
      packages: content.pkgs.length,
      resolved: [...content.wordToPkgs.values()].filter((p) => p.length === 1).length,
      ambiguous: [...content.wordToPkgs.values()].filter((p) => p.length >= 2).length,
      contentCaseCollisions: contentCaseCollisions.length,
      contentCaseCollisionSample: contentCaseCollisions.slice(0, 10),
    },
    reviewRecords: perStore.review.keyCount,
    memorizeRecords: perStore.memorize.keyCount,
    analyticsRecords: perStore.analytics.keyCount,
    totals,
    perStore,
    samples: {
      orphan: allKeys.orphan.slice(0, 10),
      caseConflict: allKeys.caseConflict.slice(0, 10),
      ambiguous: allKeys.ambiguous.slice(0, 10),
      invalid: allKeys.invalid.slice(0, 10),
      matched: allKeys.matched.slice(0, 5),
    },
  }
}

/* ===========================================================================
 * 5. 输出
 * ========================================================================= */
function printTable(report) {
  const L = console.log
  const fmt = (n) => Number(n).toLocaleString('en-US')
  const row = (label, value, width = 22) => L(label.padEnd(width) + fmt(value))
  L('Learning Consistency Audit')
  L('────────────────────────────')
  L(`source                ${report.source}`)
  L(`source detail         ${report.sourceDetail}`)
  L('')
  row('Content records', report.content.contentRecords)
  row('Content distinct', report.content.contentDistinct)
  row('Review records', report.reviewRecords)
  row('Memorize records', report.memorizeRecords)
  row('Analytics records', report.analyticsRecords)
  row('Matched', report.totals.matched)
  row('Orphan', report.totals.orphan)
  row('Case conflict', report.totals.caseConflict)
  row('Ambiguous', report.totals.ambiguous)
  row('Duplicate', report.totals.duplicate)
  row('Invalid', report.totals.invalid)
  const dirty = report.totals.orphan > 0 || report.totals.caseConflict > 0 || report.totals.invalid > 0
  const syntheticDowngrade = report.source === 'synthetic' && !allowSynthetic && dirty
  L(`EXIT=${syntheticDowngrade ? 0 : dirty ? 1 : 0}`)
  if (syntheticDowngrade) {
    L('')
    L('⚠️  source=synthetic：以上 orphan / caseConflict / invalid 是**故意注入的样本**，')
    L('    用于验证各分支可达，不代表真实数据有问题。故退出码降级为 0。')
    L('    要测真实数据请传 --user-store=<真实快照.json>；')
    L('    要强制按脏数据判红（结构自检），传 --allow-synthetic。')
  }
  L('')
  L('【抽样明细】')
  const show = (name, arr, render) => {
    if (!arr.length) {
      L(`  ${name}: 0`)
      return
    }
    L(`  ${name} (${arr.length}${arr.length === 10 ? '+' : ''}):`)
    for (const x of arr) L(`    ${render(x)}`)
  }
  show('orphan', report.samples.orphan, (x) => `${x.store}  "${x.key}"`)
  show('caseConflict', report.samples.caseConflict, (x) => `${x.store}  "${x.key}"`)
  show('ambiguous', report.samples.ambiguous, (x) => `${x.store}  "${x.key}"  → ${(x.pkgs ?? []).join(', ')}`)
  show('invalid', report.samples.invalid, (x) => `${x.store}  ${JSON.stringify(x.key)}`)
  show('matched', report.samples.matched, (x) => `${x.store}  "${x.key}"  ⊂ ${x.pkg}`)
  L('')
  L('【内容侧大小写冲突（same lowercase, multiple original forms）】')
  L(`  count = ${report.content.contentCaseCollisions}`)
  for (const c of report.content.contentCaseCollisionSample) {
    L(`    ${c.lower} → ${c.forms.join(' | ')}`)
  }
}

/* ===========================================================================
 * 6. 主流程
 * ========================================================================= */
async function main() {
  const content = loadContent()

  let learning
  let source
  let sourceDetail

  if (userStoreArg) {
    const file = userStoreArg.split('=')[1]
    learning = loadFromUserStore(file)
    source = 'user-store'
    sourceDetail = `来自 --user-store=${file}`
  } else if (!noBrowser) {
    // 真实浏览器 localStorage
    const chromePath = findChrome()
    if (!chromePath) {
      learning = null
    } else {
      let server = null
      let browser = null
      try {
        if (ownedBase) server = await ensurePreviewServer()
        const { chromium } = await import('playwright-core')
        browser = await chromium.launch({ executablePath: chromePath, headless: true })
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
        const snap = await page.evaluate((ks) => {
          const out = {}
          for (const k of ks) out[k] = localStorage.getItem(k)
          return out
        }, Object.values(STORE_KEYS))
        learning = loadFromBrowserSnapshot(snap)
        const total = Object.entries(learning).reduce((s, [name, o]) => s + keysOf(name, o).length, 0)
        if (total === 0) {
          // 浏览器 profile 里根本没有 Learning 数据 → 退化为合成，严格标注
          source = 'synthetic'
          sourceDetail = `本地 Chrome profile 的 gt.review/memorize/analytics 全为空（无真实 Learning 数据），已退化为 synthetic（键取自真实词表，含注入的非法/orphan 样本用于结构自检）`
          learning = buildSynthetic(content)
        } else {
          source = 'browser'
          sourceDetail = `来自真实浏览器 localStorage（${BASE}，profile 非持久化，word 键数合计 ${total}）`
        }
      } finally {
        if (browser) await browser.close()
        if (server?.owned) stopPreview(server)
      }
    }
  }

  if (!learning) {
    source = 'synthetic'
    sourceDetail = '未提供 --user-store 且浏览器不可用，退化为 synthetic（键取自真实词表，含注入的非法/orphan 样本用于结构自检）'
    learning = buildSynthetic(content)
  }

  /* 防假通过：`--user-store` 却一条记录都没读到 ⇒ 是「输入没吃到」，**不是**「数据干净」。
     首版会输出全 0 且 EXIT=0 —— 这种静默降级比 FAIL 更贵（绿了但其实什么都没测）。
     注意别误伤：synthetic / browser 来源的正常空表不在此列。 */
  if (source === 'user-store') {
    const got = ['review', 'memorize', 'analytics'].reduce((s, n) => s + keysOf(n, learning[n]).length, 0)
    if (got === 0) {
      console.error(
        `\n❌ FAIL(EXIT=2)：--user-store=${userStoreArg.split('=')[1]} 没读到任何 Learning 记录（三 store 键数合计 0）。\n` +
          `   这**不是**「数据干净」，而是「输入没吃到」—— 请确认快照是 localStorage 导出的 gt.* 键值形态。\n` +
          `   （本判定是 2026-09-28 用真实链路快照首跑时补上的：首版把字符串值当不存在，全 0 仍 EXIT=0。）`,
      )
      process.exit(2)
    }
  }

  const report = audit(content, learning, source, sourceDetail)

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    // 人类表打到 stderr，保证 --json 的 stdout 是纯 JSON
    const orig = console.log
    console.log = (...a) => console.error(...a)
    printTable(report)
    console.log = orig
  } else {
    printTable(report)
  }

  const dirty = report.totals.orphan > 0 || report.totals.caseConflict > 0 || report.totals.invalid > 0
  // synthetic 是「为自检而注入脏样本」的数据，它的 orphan/caseConflict/invalid 是**故意造的**，
  // 不代表真实数据有问题。若默认把它判红，接进 CI 会永久红（--user-store 未提供时就必然红）。
  // 因此：synthetic + 未显式 --allow-synthetic ⇒ 降级为 EXIT=0（只做结构自检），
  // 并在表里明确提示，避免「绿了但其实没测真实数据」被误读成「真实数据干净」。
  const syntheticDowngrade = report.source === 'synthetic' && !allowSynthetic && dirty
  const exitCode = syntheticDowngrade ? 0 : dirty ? 1 : 0
  process.exit(exitCode)
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find((p) => existsSync(p))
}

main().catch((e) => {
  console.error('FAIL(EXIT=2):', e?.stack ?? e)
  process.exit(2)
})
