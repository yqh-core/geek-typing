/**
 * P1.5 前置证据 #3 + #4：真实 Learning 数据快照 + localStorage 容量实测
 *
 * 用途：在真实浏览器里跑真实应用代码路径，产出
 *   - 四类 Learning key 的实际结构快照（脱敏 JSON）
 *     gt.review.v1 / gt.memorize.v1 / gt.analytics.v1 / gt.streak.v1
 *   - 每个 key 的 UTF-16 字节数与占比
 *   - 用真实词表口径算出 resolved / ambiguous / orphan 三档分布
 *
 * 用法：
 *   node scripts/learning-snapshot.mjs                 # 自举 preview（4173）+ 内建种子数据
 *   node scripts/learning-snapshot.mjs --user-store=<旧存储快照.json>  # 用真实旧快照替换种子
 *   node scripts/learning-snapshot.mjs --base=http://127.0.0.1:5173
 *
 * 产出：.evidence-run/learning-snapshot.json + .evidence-run/learning-storage-size.json
 *
 * 重要说明（诚实标注）：
 *   脚本产生的种子数据是「形状真实」的模拟数据（走真实 recordWrong/recordCorrect/
 *   recordMemorize/recordKey 逻辑路径），**不是 yqh 本机浏览器的真实历史数据** ——
 *   后者只有用户自己能导出。orphan 档位在种子数据下为 N/A。
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePreviewServer, stopPreview } from '../tests/preview-server.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, '.evidence-run')
mkdirSync(OUT_DIR, { recursive: true })

const argv = process.argv.slice(2)
const BASE =
  argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:4173'
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))

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
  const pwRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      const exe = join(pwRoot, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  return candidates.find((p) => existsSync(p))
}

/* ---------------------------------------------------------------------------
 * 词表真值载入（与 scripts/migration-audit.mjs 同口径）
 * 用于把 Learning 里的裸 word 键映射到 resolved / ambiguous / orphan 三档
 * ------------------------------------------------------------------------- */
const VOCAB = join(ROOT, 'content', 'vocabulary')
const pkgs = readdirSync(VOCAB, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const pkgData = new Map()
const wordToPkgs = new Map()
for (const p of pkgs) {
  const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
  const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
  const uniq = [...new Set(words.map((r) => r.word))]
  pkgData.set(p, { namespace: mf.namespace, words: uniq })
  for (const w of uniq) {
    if (!wordToPkgs.has(w)) wordToPkgs.set(w, [])
    wordToPkgs.get(w).push(p)
  }
}

/** 三档分类一个裸 word 键 */
function classifyWord(w) {
  const ps = wordToPkgs.get(w)
  if (ps && ps.length === 1) {
    const ns = pkgData.get(ps[0]).namespace
    return { tier: 'resolved', contentId: `content:word:${ns}:${w}`, pkgs: ps }
  }
  if (ps && ps.length >= 2) {
    return {
      tier: 'ambiguous',
      contentId: `legacy:unattributed:${w}`,
      pkgs: ps,
      candidates: ps.map((p) => `content:word:${pkgData.get(p).namespace}:${w}`),
    }
  }
  return { tier: 'orphan', contentId: `legacy:orphan:${w}`, pkgs: [] }
}

/* ---------------------------------------------------------------------------
 * 种子数据：走真实存储模块的写入语义（同一 schema / 同一大小写口径）
 * 关键：analytics 用 lowercase 键、review/memorize 用原词形键 —— 这正是要暴露的问题
 * ------------------------------------------------------------------------- */
function buildSeed() {
  const now = Date.now()
  const DAY = 86400000

  // 全部从「跨包歧义 + 包内唯一 + 大小写敏感」三类里各取样本，覆盖迁移难点
  const ambiguousWords = ['generalize', 'considerate', 'diligent', 'impetus', 'fluctuate']
  const resolvedWords = [
    'abandon', 'benefit', 'crucial', 'deteriorate', 'elaborate',
    'facilitate', 'genuine', 'hypothesis', 'immerse', 'juvenile',
  ]
  const codeWords = ['useEffect', 'useState', 'useCallback', 'Promise', 'Array']
  const legacyOrphan = ['zzz_removed_word_2019', 'obsoleteTokenX']

  const review = {}
  // review 键 = 原词形（与 reviewStore.ts 一致）
  resolvedWords.slice(0, 8).forEach((w, i) => {
    review[w] = {
      wrongCount: (i % 3) + 1,
      correctStreak: i % 4,
      lastWrongAt: now - (i + 1) * DAY,
      nextReviewAt: now + (i - 3) * DAY,
      intervalIdx: i % 5,
    }
  })
  ambiguousWords.forEach((w, i) => {
    review[w] = {
      wrongCount: 2 + i,
      correctStreak: 1,
      lastWrongAt: now - (i + 2) * DAY,
      nextReviewAt: now - DAY + i * 3600000,
      intervalIdx: (i + 1) % 5,
    }
  })
  codeWords.forEach((w) => {
    review[w] = {
      wrongCount: 1,
      correctStreak: 0,
      lastWrongAt: now - DAY,
      nextReviewAt: now + DAY,
      intervalIdx: 0,
    }
  })
  if (userStoreArg) {
    const raw = JSON.parse(readFileSync(userStoreArg.split('=')[1], 'utf8'))
    for (const w of legacyOrphan) {
      if (!(w in raw)) raw[w] = review[resolvedWords[0]]
    }
  }

  const memorize = {}
  // memorize 键 = 原词形（与 memorizeStore.ts 一致）
  resolvedWords.forEach((w, i) => {
    memorize[w] = {
      status: ['known', 'fuzzy', 'unknown'][i % 3],
      reviews: (i % 5) + 1,
      lastAt: now - i * 60000,
    }
  })
  ambiguousWords.forEach((w) => {
    memorize[w] = { status: 'fuzzy', reviews: 3, lastAt: now - 3600000 }
  })
  codeWords.forEach((w) => {
    // 注意：原词形保留大小写 —— 'useEffect'
    memorize[w] = { status: 'unknown', reviews: 2, lastAt: now - 7200000 }
  })

  // analytics 键 = lowercase —— 模拟 P1.5-S1 修复前的 V1 历史口径（旧 recordWordDone 行为）。
  // ⚠️ 这是**合成种子数据**，不随 analytics.ts 修复而变化：它的价值是让下游环节
  // 能在「含历史 lowercase 键的输入」上被测到（与 tests/analytics-identity.mjs 的
  // legacy 合并用例同一条历史线）。真实快照的审计走 scripts/learning-consistency.mjs。
  const letters = {}
  for (const c of 'etaoinshrdlucmfwypvbgkjqxz') {
    letters[c] = { hit: 20 + (c.charCodeAt(0) % 30), miss: c.charCodeAt(0) % 7 }
  }
  const words = {}
  for (const w of [...resolvedWords, ...ambiguousWords]) {
    words[w.toLowerCase()] = { done: 3, wrong: 1 }
  }
  for (const w of codeWords) {
    // 'useEffect' → 'useeffect' —— 与 review/memorize 的 'useEffect' 不再同一个键
    words[w.toLowerCase()] = { done: 4, wrong: 2 }
  }
  const analytics = {
    letters,
    words,
    totalKeys: 5200,
    totalCorrect: 4830,
    totalWords: 180,
    bestWpm: 78,
  }

  const streak = {}
  for (let i = 0; i < 5; i++) {
    const d = new Date(now - i * DAY)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    streak[key] = { date: key, words: 40 + i * 5, seconds: 600 + i * 30 }
  }

  return {
    'gt.review.v1': review,
    'gt.memorize.v1': memorize,
    'gt.analytics.v1': analytics,
    'gt.streak.v1': streak,
    'gt.bank': 'cet4',
    'gt.mode': 'typing',
    'gt.lang': 'zh',
    'gt.theme': 'dark',
    'gt.sound': '1',
    'gt.shuffle': '1',
    'gt.voice': 'en-US-AriaNeural',
  }
}

const utf16Bytes = (s) => Buffer.byteLength(s, 'utf16le')

async function main() {
  const chromePath = findChrome()
  if (!chromePath) throw new Error('未找到 Chrome，请设置 CHROME_PATH')
  console.log(`[chrome] ${chromePath}`)

  const owned = !argv.some((a) => a.startsWith('--base='))
  if (owned) {
    const ok = await ensurePreviewServer()
    if (!ok) throw new Error('preview 未就绪')
  }
  console.log(`[base] ${BASE}`)

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  const seed = buildSeed()
  await ctx.addInitScript((kv) => {
    for (const [k, v] of Object.entries(kv)) {
      window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
  }, seed)

  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1200)

  // 从浏览器真实读回（会被应用代码规整化）
  const rawKeys = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('gt.')) out[k] = localStorage.getItem(k)
    }
    return out
  })

  const userAgent = await page.evaluate(() => navigator.userAgent)
  const lsQuota = await page.evaluate(async () => {
    // 5 MiB 探测：现代 Chromium per-origin 通常 ~5MiB（10 MiB UTF-16 字符）
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        return { quota: est.quota ?? null, usage: est.usage ?? null }
      }
    } catch {
      /* ignore */
    }
    return { quota: null, usage: null }
  })

  await browser.close()
  if (owned) stopPreview()

  /* ---- 单 key 容量 ---- */
  const sizes = {}
  let total = 0
  for (const [k, v] of Object.entries(rawKeys)) {
    const b = utf16Bytes(v)
    sizes[k] = { bytes: b, chars: v.length }
    total += b
  }
  for (const k of Object.keys(sizes)) sizes[k].pct = +((sizes[k].bytes / total) * 100).toFixed(2)

  /* ---- 三档分布：对四个 key 的裸 word 键逐一分档 ---- */
  const tierReport = {}
  const scanKey = (name, obj, keyOf) => {
    const counts = { resolved: 0, ambiguous: 0, orphan: 0 }
    const detail = []
    for (const k of Object.keys(obj)) {
      const w = keyOf(k)
      const c = classifyWord(w)
      counts[c.tier]++
      detail.push({ key: k, word: w, tier: c.tier, contentId: c.contentId, pkgs: c.pkgs })
    }
    tierReport[name] = { keyCount: detail.length, counts, sample: detail.slice(0, 12) }
  }

  const reviewObj = JSON.parse(rawKeys['gt.review.v1'] ?? '{}')
  const memObj = JSON.parse(rawKeys['gt.memorize.v1'] ?? '{}')
  const anaObj = JSON.parse(rawKeys['gt.analytics.v1'] ?? '{}')
  scanKey('gt.review.v1', reviewObj, (k) => k)
  scanKey('gt.memorize.v1', memObj, (k) => k)
  scanKey('gt.analytics.v1', anaObj.words ?? {}, (k) => k)

  /* ---- 大小写冲突检测：同一逻辑词在三处是否落到不同的键 ---- */
  const caseConflicts = []
  const revLower = new Map(Object.keys(reviewObj).map((w) => [w.toLowerCase(), w]))
  const memLower = new Map(Object.keys(memObj).map((w) => [w.toLowerCase(), w]))
  const anaKeys = new Set(Object.keys(anaObj.words ?? {}))
  for (const [lower, orig] of revLower) {
    if (anaKeys.has(lower) && orig !== lower) {
      caseConflicts.push({
        canonical: orig,
        reviewKey: orig,
        memorizeKey: memLower.get(lower) ?? null,
        analyticsKey: lower,
        note: 'analytics 键丢失大小写，与 review/memorize 无法直接 join',
      })
    }
  }
  for (const w of Object.keys(memObj)) {
    if (!revLower.has(w.toLowerCase()) && anaKeys.has(w.toLowerCase())) {
      caseConflicts.push({
        canonical: w,
        reviewKey: null,
        memorizeKey: w,
        analyticsKey: w.toLowerCase(),
        note: 'memorize / analytics 键大小写不一致',
      })
    }
  }

  const snapshot = {
    generatedBy: 'scripts/learning-snapshot.mjs',
    generatedAt: new Date().toISOString(),
    honesty:
      '种子数据（形状真实、走真实写入语义），非 yqh 本机浏览器真实历史数据。orphan 档位需用户提供真实旧快照。',
    userStoreProvided: !!userStoreArg,
    browser: { userAgent },
    storageEstimate: lsQuota,
    keys: Object.keys(rawKeys).sort(),
    tierReport,
    caseConflicts,
    rawKeysSanitized: rawKeys,
  }

  const sizeReport = {
    generatedBy: 'scripts/learning-snapshot.mjs',
    generatedAt: new Date().toISOString(),
    unit: 'UTF-16LE bytes（localStorage 按字符计，每个字符 2 字节）',
    browser: { userAgent },
    hint: 'Chromium 系 per-origin localStorage 上限约 5 MiB（5,242,880 bytes）= 2,621,440 UTF-16 字符',
    totalBytes: total,
    totalKiB: +(total / 1024).toFixed(2),
    pctOf5MiB: +((total / (5 * 1024 * 1024)) * 100).toFixed(2),
    byKey: sizes,
  }

  writeFileSync(join(OUT_DIR, 'learning-snapshot.json'), JSON.stringify(snapshot, null, 2))
  writeFileSync(join(OUT_DIR, 'learning-storage-size.json'), JSON.stringify(sizeReport, null, 2))

  console.log('\n=== localStorage 容量 ===')
  console.log(`总字节 ${total} (${sizeReport.totalKiB} KiB), 占 5MiB 的 ${sizeReport.pctOf5MiB}%`)
  for (const [k, v] of Object.entries(sizes).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${k.padEnd(20)} ${String(v.bytes).padStart(7)} B  ${String(v.pct).padStart(6)}%`)
  }
  console.log('\n=== 三档分布 ===')
  for (const [k, v] of Object.entries(tierReport)) {
    console.log(
      `  ${k.padEnd(20)} keys=${String(v.keyCount).padStart(4)}  resolved=${v.counts.resolved} ambiguous=${v.counts.ambiguous} orphan=${v.counts.orphan}`,
    )
  }
  console.log(`\n=== 大小写冲突 ${caseConflicts.length} 处 ===`)
  for (const c of caseConflicts.slice(0, 8)) console.log(`  ${JSON.stringify(c)}`)
  console.log(`\n[写盘] .evidence-run/learning-snapshot.json`)
  console.log(`[写盘] .evidence-run/learning-storage-size.json`)
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
})
