/**
 * 任务 ①：真实 9346 词 Learning 数据 localStorage 压力实测
 *
 * 只读脚本：不修改 src/ 下任何文件，不写任何 localStorage 到业务 key 之外
 *（只在独立的临时 browser profile 里写入，跑完即弃）。
 *
 * 与「外推估算」的区别：
 *   之前只有种子数据（10,394 B）实测 + 对 9346 词的外推。
 *   本脚本用真实词表（content/vocabulary/*\/words.json）构造 6713 个唯一 word 的真实键，
 *   在真实 Chrome 里测量 setItem / getItem+JSON.parse 延迟、UTF-16 与 UTF-8 字节、Quota 行为。
 *
 * 关键实测点：
 *   - 每个场景用**独立 browser context**（独立 origin storage），互不干扰
 *   - 写入延迟用 performance.now() 包裹 setItem，重复 10 次取中位数
 *   - Quota 阈值用**独立探测**二分逼近（不假设 5 MiB，Chromium 可能是 5 或 10 MiB）
 *   - 若撞 Quota，额外复用 reviewStore.save 的真实熔断算法在线计算 eviction 序列
 *
 * 复现命令：
 *   node scripts/learning-stress.mjs
 *   node scripts/learning-stress.mjs --base=http://127.0.0.1:5173   # 复用已有 dev server
 *
 * 产出：
 *   .evidence-run/learning-stress.json    机器可读全量数据
 *   控制台                                 人类可读汇总表 + 结论行
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePreviewServer, stopPreview } from '../tests/preview-server.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, '.evidence-run')
mkdirSync(OUT_DIR, { recursive: true })
const VOCAB = join(ROOT, 'content', 'vocabulary')

const argv = process.argv.slice(2)
const BASE = argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:4173'
const REPEAT = Number(argv.find((a) => a.startsWith('--repeat='))?.split('=')[1] ?? 10)
const ownedBase = !argv.some((a) => a.startsWith('--base='))

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
  return candidates.find((p) => existsSync(p))
}

/* ---------------------------------------------------------------------------
 * 1. 载入真实词表（与 scripts/migration-audit.mjs 完全同口径）
 * ------------------------------------------------------------------------- */
const pkgs = readdirSync(VOCAB, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const wordToPkgs = new Map()
let totalRaw = 0
for (const p of pkgs) {
  const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
  totalRaw += words.length
  for (const w of [...new Set(words.map((r) => r.word))]) {
    if (!wordToPkgs.has(w)) wordToPkgs.set(w, [])
    wordToPkgs.get(w).push(p)
  }
}
/** 6713 个唯一 word（区分大小写）—— 真实键集 */
const ALL_WORDS = [...wordToPkgs.keys()]
/** 字母表：analytics.letters 的真实键域（[a-z] 单字母） */
const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

/* ---------------------------------------------------------------------------
 * 2. 场景构造 —— 严格照四个 store 的真实 schema
 *    reviewStore.ts   ReviewEntry { wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx }
 *    memorizeStore.ts MemRecord   { status, reviews, lastAt }
 *    analytics.ts     Analytics   { letters, words, totalKeys, totalCorrect, totalWords, bestWpm }
 *    streak.ts        DayRecord   { date, words, seconds }  键 YYYY-MM-DD
 * ------------------------------------------------------------------------- */
const DAY = 86400000
const INTERVALS_DAYS = [1, 2, 4, 7, 15]
const LETTER_KEYS = { hit: 0, miss: 0 }
const nowMs = Date.now()
const rnd = (seed) => {
  // 确定性伪随机，保证同一 N 每次生成同一份数据（可复现）
  let x = seed * 2654435761
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

/** review: 取前 n 个唯一 word，键 = 原词形（保留大小写） */
function buildReview(n) {
  const r = rnd(7)
  const out = {}
  for (let i = 0; i < Math.min(n, ALL_WORDS.length); i++) {
    const idx = i % INTERVALS_DAYS.length
    out[ALL_WORDS[i]] = {
      wrongCount: 1 + Math.floor(r() * 7),
      correctStreak: Math.floor(r() * 5),
      lastWrongAt: nowMs - Math.floor(r() * 30) * DAY,
      nextReviewAt: nowMs + INTERVALS_DAYS[idx] * DAY,
      intervalIdx: idx,
    }
  }
  return out
}

/** memorize: 键 = 原词形 */
function buildMemorize(n, offset = 0) {
  const r = rnd(13)
  const out = {}
  const statuses = ['known', 'fuzzy', 'unknown']
  for (let i = 0; i < Math.min(n, ALL_WORDS.length); i++) {
    const k = (i + offset) % ALL_WORDS.length
    out[ALL_WORDS[k]] = {
      status: statuses[Math.floor(r() * 3)],
      reviews: 1 + Math.floor(r() * 5),
      lastAt: nowMs - Math.floor(r() * 10) * DAY,
    }
  }
  return out
}

/** analytics: letters 键 lowercase 单字母、words 键 toLowerCase() */
function buildAnalytics(nWords) {
  const r = rnd(29)
  const letters = {}
  for (const c of ALL_LETTERS) letters[c] = { hit: Math.floor(r() * 5000), miss: Math.floor(r() * 500) }
  const words = {}
  const take = Math.min(nWords, ALL_WORDS.length)
  for (let i = 0; i < take; i++) {
    words[ALL_WORDS[i].toLowerCase()] = { done: 1 + Math.floor(r() * 6), wrong: Math.floor(r() * 3) }
  }
  return {
    letters,
    words,
    totalKeys: 123456,
    totalCorrect: 118000,
    totalWords: take,
    bestWpm: 92,
  }
}

/** streak: 键 YYYY-MM-DD，连续 days 天（含今天） */
function buildStreak(days) {
  const out = {}
  const pad = (x) => String(x).padStart(2, '0')
  for (let i = 0; i < days; i++) {
    const d = new Date(nowMs - i * DAY)
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    out[key] = { date: key, words: 40 + (i % 60), seconds: 600 + (i % 300) }
  }
  return out
}

const N_WORDS = ALL_WORDS.length // 6713
const SCENARIOS = [
  { id: 'S1', desc: 'review 100', keys: ['gt.review.v1'], build: () => ({ 'gt.review.v1': buildReview(100) }) },
  { id: 'S2', desc: 'review 1,000', keys: ['gt.review.v1'], build: () => ({ 'gt.review.v1': buildReview(1000) }) },
  { id: 'S3', desc: 'review 3,000', keys: ['gt.review.v1'], build: () => ({ 'gt.review.v1': buildReview(3000) }) },
  { id: 'S4', desc: `review ${N_WORDS}（全库）`, keys: ['gt.review.v1'], build: () => ({ 'gt.review.v1': buildReview(N_WORDS) }) },
  {
    id: 'S5',
    desc: `review ${N_WORDS} + memorize ${N_WORDS}`,
    keys: ['gt.review.v1', 'gt.memorize.v1'],
    build: () => ({ 'gt.review.v1': buildReview(N_WORDS), 'gt.memorize.v1': buildMemorize(N_WORDS) }),
  },
  {
    id: 'S6',
    desc: `+ analytics 全字母 + ${N_WORDS} 词`,
    keys: ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1'],
    build: () => ({
      'gt.review.v1': buildReview(N_WORDS),
      'gt.memorize.v1': buildMemorize(N_WORDS),
      'gt.analytics.v1': buildAnalytics(N_WORDS),
    }),
  },
  {
    id: 'S7',
    desc: '+ streak 365 天',
    keys: ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.streak.v1'],
    build: () => ({
      'gt.review.v1': buildReview(N_WORDS),
      'gt.memorize.v1': buildMemorize(N_WORDS),
      'gt.analytics.v1': buildAnalytics(N_WORDS),
      'gt.streak.v1': buildStreak(365),
    }),
  },
]

const SMALL_KEYS = {
  'gt.bank': 'cet4',
  'gt.mode': 'typing',
  'gt.lang': 'zh',
  'gt.theme': 'dark',
  'gt.sound': '1',
  'gt.shuffle': '1',
  'gt.voice': 'en-US-AriaNeural',
}

/* ---------------------------------------------------------------------------
 * 3. 浏览器内探针（字符串化后注入 evaluate，避免闭包捕获）
 * ------------------------------------------------------------------------- */

/**
 * 二分逼近：能成功 setItem 的最大 payload 字节数（ASCII，1 字符 = 1 字节 = 2 UTF-16 字节）
 * 注意：必须写成声明式 function（不带 IIFE 包壳），否则 toString() 后内部 helper 逃逸作用域。
 */
function probeQuota() {
  const P = '__quota_probe__'
  const tryWrite = (bytes) => {
    // 'a' 填充：JSON.stringify 不转义，1 字符 = 1 字节
    try {
      localStorage.setItem(P, JSON.stringify({ p: 'a'.repeat(bytes) }))
      return true
    } catch {
      return false
    }
  }
  localStorage.removeItem(P)
  // 线性粗探：找到第一个失败的 256 KiB 档
  const STEP = 262144
  let lo = 0
  let hi = null
  for (let b = STEP; b <= 64 * 1024 * 1024; b += STEP) {
    if (!tryWrite(b)) {
      hi = b
      break
    }
    lo = b
  }
  if (hi === null) {
    localStorage.removeItem(P)
    return { ok: false, reason: '64 MiB 内未触发 Quota' }
  }
  // 二分到 4 KiB 精度
  let a = lo
  let b = hi
  while (b - a > 4096) {
    const mid = (a + b) >> 1
    if (tryWrite(mid)) a = mid
    else b = mid
  }
  localStorage.removeItem(P)
  return { ok: true, maxPayloadBytes: a, firstFailBytes: b, cleared: localStorage.getItem(P) === null }
}
const PROBE_QUOTA_SRC = probeQuota.toString()

/** 单 key 测量：chars / utf16 / utf8 / setItem 中位数 / getItem+parse 中位数 */
const MEASURE_ONE = function (key, value, repeat) {
  const str = JSON.stringify(value)
  const utf16 = str.length * 2
  const utf8 = new TextEncoder().encode(str).length
  const chars = str.length
  // 写入延迟
  const w = []
  for (let i = 0; i < repeat; i++) {
    localStorage.removeItem(key)
    const t0 = performance.now()
    localStorage.setItem(key, str)
    w.push(performance.now() - t0)
  }
  // 读取 + 解析延迟
  const r = []
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now()
    const raw = localStorage.getItem(key)
    JSON.parse(raw)
    r.push(performance.now() - t0)
  }
  const med = (arr) => {
    const s = arr.slice().sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  return {
    key,
    chars,
    utf16Bytes: utf16,
    jsonBytes: utf8,
    setItemMsMedian: +med(w).toFixed(3),
    setItemMsMax: +Math.max(...w).toFixed(3),
    readParseMsMedian: +med(r).toFixed(3),
    readParseMsMax: +Math.max(...r).toFixed(3),
  }
}
const MEASURE_ONE_SRC = MEASURE_ONE.toString()

/** 场景测量 + Quota 行为：Quota 判定用「累加预算模拟」，延迟用干净的 setItem 计时 */
const MEASURE_SCENARIO = function (payload, repeat, quotaLimitBytes) {
  // ---- A. 延迟测量：清空后对每个 key 做 repeat 次 removeItem+setItem，取中位数 ----
  // 说明：不能在「已写入大数据的 profile」上测 setItem —— 每次 setItem 会先尝试往
  // SQLite 落盘并触发 sync flush，把多 MiB 的 pending write 算进本次耗时，量到 ~1600ms
  // 的假值。故先清空，再逐 key 重复测（此时 pending 只有当前 payload）。
  const keys = []
  for (const [key, val] of payload) {
    const str = JSON.stringify(val)
    const w = []
    for (let i = 0; i < repeat; i++) {
      localStorage.removeItem(key)
      const t0 = performance.now()
      try {
        localStorage.setItem(key, str)
      } catch {
        /* 单 key 超限时忽略 */
      }
      w.push(performance.now() - t0)
    }
    const r = []
    for (let i = 0; i < repeat; i++) {
      const t0 = performance.now()
      const raw = localStorage.getItem(key)
      if (raw) JSON.parse(raw)
      r.push(performance.now() - t0)
    }
    const med = (arr) => {
      const s = arr.slice().sort((x, y) => x - y)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
    }
    keys.push({
      key,
      chars: str.length,
      utf16Bytes: str.length * 2,
      jsonBytes: new TextEncoder().encode(str).length,
      keyCount: Object.keys(val).length,
      setItemMsMedian: +med(w).toFixed(3),
      setItemMsMax: +Math.max(...w).toFixed(3),
      readParseMsMedian: +med(r).toFixed(3),
      readParseMsMax: +Math.max(...r).toFixed(3),
      pctOfLimit: +(((str.length * 2) / quotaLimitBytes) * 100).toFixed(3),
    })
  }

  const totalUtf16 = keys.reduce((s, x) => s + x.utf16Bytes, 0)
  const totalUtf8 = keys.reduce((s, x) => s + x.jsonBytes, 0)

  // ---- B. 真机 Quota 判定（在整个 origin 上按声明顺序逐个写入，不清理） ----
  localStorage.clear()
  let realQuotaHit = false
  let firstQuotaKey = null
  const writeOrder = []
  for (const [key, val] of payload) {
    const str = JSON.stringify(val)
    try {
      localStorage.setItem(key, str)
      writeOrder.push({ key, ok: true })
    } catch (e) {
      realQuotaHit = true
      if (!firstQuotaKey) firstQuotaKey = key
      writeOrder.push({ key, ok: false, error: `${e?.name ?? 'Error'}` })
    }
  }
  // 真机写入后 self-reported 占用（key+value 字符数 × 2）
  let usageBytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    usageBytes += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2
  }

  // ---- C. 撞 Quota 时实测「实际能写多少条」（对目标对象二分） ----
  let actualWritten = null
  if (realQuotaHit) {
    const ent = Object.entries(payload[0][1])
    const k0 = payload[0][0]
    const tryN = (n) => {
      localStorage.removeItem(k0)
      const sub = {}
      for (let i = 0; i < n; i++) sub[ent[i][0]] = ent[i][1]
      try {
        localStorage.setItem(k0, JSON.stringify(sub))
        return true
      } catch {
        return false
      }
    }
    if (tryN(ent.length)) actualWritten = ent.length
    else {
      let lo = 0
      let hi = ent.length
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (tryN(mid)) lo = mid
        else hi = mid
      }
      actualWritten = lo
    }
  }

  // ---- D. 累加预算模拟：按声明顺序累加，判断是否超过 quotaLimitBytes ----
  // 只作「顺序无关的算术判定」；真机结果以 B 段为准。当两者不一致时说明
  // 该 context 的实际配额与本脚本探测值不同（见 perContextQuota）。
  let acc = 0
  let simulatedOverAt = null
  for (const k of keys) {
    acc += k.utf16Bytes
    if (acc > quotaLimitBytes && simulatedOverAt === null) simulatedOverAt = k.key
  }

  return {
    keys,
    totalUtf16Bytes: totalUtf16,
    totalJsonBytes: totalUtf8,
    pctOfLimit: +((totalUtf16 / quotaLimitBytes) * 100).toFixed(3),
    // 真机结果（权威）
    quotaHit: realQuotaHit,
    firstQuotaKey,
    actualWritten,
    realWriteOrder: writeOrder,
    storageSelfReportedBytes: usageBytes,
    // 累加预算模拟（对照）
    simulatedExceedsLimit: acc > quotaLimitBytes,
    simulatedOverAt,
  }
}
const MEASURE_SCENARIO_SRC = MEASURE_SCENARIO.toString()

/* ---------------------------------------------------------------------------
 * 4b. 5 MiB 硬上限对照实验
 *     现实里 localStorage 配额由 Chrome 按磁盘可用空间决定（本机实测 10 MiB），
 *     但方案与历史文档一直以 5 MiB 为预算口径。为回答「5 MiB 下会不会撞」，
 *     用 CDP Storage.overrideQuotaForOrigin 把 origin 配额硬压到 5 MiB 再跑一遍。
 * ------------------------------------------------------------------------- */
async function runWithQuotaCap(browser, scenarios, repeat, capBytes) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  const cdp = await ctx.newCDPSession(page)
  // 先清干净，确保 override 后口径一致
  await page.evaluate(() => localStorage.clear())
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: BASE, quotaSize: capBytes })
  const scenarioOut = []
  for (const sc of scenarios) {
    const payload = Object.entries(sc.build())
    const res = await page.evaluate(
      `(${MEASURE_SCENARIO_SRC})(${JSON.stringify(payload)}, ${repeat}, ${capBytes})`,
    )
    scenarioOut.push({
      id: sc.id,
      desc: sc.desc,
      quotaHit: res.quotaHit,
      firstQuotaKey: res.firstQuotaKey,
      actualWritten: res.actualWritten,
      totalUtf16Bytes: res.totalUtf16Bytes,
      pctOfLimit: res.pctOfLimit,
      storageSelfReportedBytes: res.storageSelfReportedBytes,
      realWriteOrder: res.realWriteOrder,
    })
  }
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: BASE, quotaSize: 0 }).catch(() => {})
  await ctx.close()
  return { method: 'CDP Storage.overrideQuotaForOrigin(origin, 5 MiB)', limitUtf16Bytes: capBytes, scenarios: scenarioOut }
}

/* ---------------------------------------------------------------------------
 * 5. 主流程
 * ------------------------------------------------------------------------- */
async function main() {
  const chromePath = findChrome()
  if (!chromePath) throw new Error('未找到 Chrome，请设置 CHROME_PATH')
  console.log(`[chrome] ${chromePath}`)

  let server = null
  if (ownedBase) {
    server = await ensurePreviewServer()
  }
  console.log(`[base] ${BASE}`)

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })

  try {
    /* --- 5.1 独立探测真实 Quota 阈值 --- */
    const probeCtx = await browser.newContext() // 独立 origin storage
    const probePage = await probeCtx.newPage()
    await probePage.goto(BASE, { waitUntil: 'load', timeout: 30000 })
    const probe = await probePage.evaluate(`(${PROBE_QUOTA_SRC})()`)
    const ua = await probePage.evaluate(() => navigator.userAgent)
    const storageEstimate = await probePage.evaluate(async () => {
      try {
        const e = await navigator.storage?.estimate?.()
        return e ? { quota: e.quota ?? null, usage: e.usage ?? null } : null
      } catch {
        return null
      }
    })
    await probeCtx.close()

    // 实测阈值：以「能写入的最大 UTF-16 字节数」为准（payload 纯 ASCII，utf8=chars，utf16=2*chars）
    const LIMIT_UTF16 = probe.ok ? probe.maxPayloadBytes * 2 : 5 * 1024 * 1024
    console.log(
      `[quota] 实测最大可写 payload = ${probe.maxPayloadBytes?.toLocaleString()} 字符 → UTF-16 ${LIMIT_UTF16.toLocaleString()} B ` +
        `(${(LIMIT_UTF16 / 1024 / 1024).toFixed(2)} MiB)${probe.firstFailBytes ? `；首个失败档 ${probe.firstFailBytes.toLocaleString()} 字符` : ''}`,
    )

    /* --- 5.2 逐场景：每个场景独立 context --- */
    const scenarioResults = []
    for (const sc of SCENARIOS) {
      const payloadObj = sc.build()
      const payload = Object.entries(payloadObj)
      const ctx = await browser.newContext()
      // 小键（非本次测量目标）也放进去，模拟真实占用
      await ctx.addInitScript(
        ({ small, payload: pl }) => {
          for (const [k, v] of Object.entries(small)) localStorage.setItem(k, v)
          for (const [k, v] of pl) localStorage.setItem(k, JSON.stringify(v))
        },
        { small: SMALL_KEYS, payload },
      )
      const page = await ctx.newPage()
      await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
      const res = await page.evaluate(
        `(${MEASURE_SCENARIO_SRC})(${JSON.stringify(payload)}, ${REPEAT}, ${LIMIT_UTF16})`,
      )
      await ctx.close()
      const rec = { id: sc.id, desc: sc.desc, ...res }
      scenarioResults.push(rec)
      process.stdout.write(
        `  ${sc.id}: totalUtf16=${res.totalUtf16Bytes.toLocaleString()} B (${res.pctOfLimit}% of probe limit) realQuotaHit=${res.quotaHit}` +
          (res.quotaHit ? ` 首撞=${res.firstQuotaKey} 实际可写=${res.actualWritten}` : '') +
          '\n',
      )
    }

    /* --- 5.2b 5 MiB 硬上限对照：用 CDP 把 origin quota 压到 5 MiB 再跑同样场景 --- */
    const capped = await runWithQuotaCap(browser, SCENARIOS, REPEAT, 5 * 1024 * 1024)
    console.log(
      `[5MiB-cap] 硬压 5 MiB (${capped.limitUtf16Bytes} B UTF-16) 下：` +
        capped.scenarios.map((s) => `${s.id}=${s.quotaHit ? `QUOTA@${s.actualWritten}` : 'OK'}`).join('  '),
    )

    /* --- 5.3 reviewStore.save 熔断 eviction 序列（离线精确复刻，非外推） --- */
    const eviction = computeEvictionSequence()
    const reviewThreshold = computeReviewThreshold()
    const comboThreshold = computeComboThreshold()

    const out = {
      generatedBy: 'scripts/learning-stress.mjs',
      generatedAt: new Date().toISOString(),
      honesty: {
        measured: [
          'Quota 阈值（二分逼近，见 quotaProbe）',
          '各场景 setItem / getItem+JSON.parse 延迟（Chrome + playwright-core 真实计时）',
          '各 key 的 chars / utf16Bytes / jsonBytes（真实词表键计算）',
          '各场景整包写入成败与撞 Quota 时的实际可写条数（真实 setItem）',
        ],
        inferred: [
          'reviewStore 熔断 eviction 序列（离线精确复刻 save() 的 3 轮 × 1/4 算法，非在线触发）',
          'review 最大条数 / 组合最大条数（按实测 byte/条 线性换算 + 真实 setItem 验证）',
        ],
        note: '所有 key 均取自 content/vocabulary/*/words.json 的真实 word，非造词',
      },
      env: { userAgent: ua, chromePath, repeat: REPEAT, baseUrl: BASE },
      vocab: {
        packages: pkgs,
        totalRaw,
        distinctWords: ALL_WORDS.length,
        resolved: ALL_WORDS.filter((w) => wordToPkgs.get(w).length === 1).length,
        ambiguous: ALL_WORDS.filter((w) => wordToPkgs.get(w).length >= 2).length,
        sampleWords: ALL_WORDS.slice(0, 10),
      },
      quotaProbe: { ...probe, limitUtf16Bytes: LIMIT_UTF16, storageEstimate },
      scenarios: scenarioResults,
      fiveMiBCap: capped,
      eviction: { reviewStoreSave: eviction, reviewMaxEntries: reviewThreshold, comboMaxEntries: comboThreshold },
    }

    const outFile = join(OUT_DIR, 'learning-stress.json')
    writeFileSync(outFile, JSON.stringify(out, null, 2))

    /* --- 5.4 人类可读汇总 --- */
    printSummary(out)
    console.log(`\n[写盘] .evidence-run/learning-stress.json`)
    return outFile
  } finally {
    await browser.close()
    if (server?.owned) stopPreview(server)
  }
}

/* ---------------------------------------------------------------------------
 * 4. 离线精确复刻：reviewStore.save 的熔断 eviction（同 src/lib/reviewStore.ts:64-96）
 *    约束：4 个 key 全部写完后总占用 = 实测 quota 上限。
 *    顺序 model：先写 review（触发熔断）→ 再写 memorize/analytics/streak（各占其字节）。
 *    每轮 A/B 两种清洗位置都算，报告 [最少, 最多]。
 * ------------------------------------------------------------------------- */
function reviewEntryJsonBytes(entry) {
  return Buffer.byteLength(JSON.stringify(entry), 'utf8')
}
function entryKeyBytes(word) {
  // JSON 里的 "word":
  return Buffer.byteLength(JSON.stringify(word), 'utf8') + 1
}

function computeEvictionSequence() {
  const N = 6713
  const r = rnd(7)
  const entries = []
  for (let i = 0; i < N; i++) {
    const idx = i % 5
    const e = {
      wrongCount: 1 + Math.floor(r() * 7),
      correctStreak: Math.floor(r() * 5),
      lastWrongAt: nowMs - Math.floor(r() * 30) * DAY,
      nextReviewAt: nowMs + INTERVALS_DAYS[idx] * DAY,
      intervalIdx: idx,
    }
    entries.push({ word: ALL_WORDS[i], entry: e, cost: entryKeyBytes(ALL_WORDS[i]) + reviewEntryJsonBytes(e), idx })
  }
  // 预排序（与 save 内 entries.sort 同序：intervalIdx 降序；同档保持原插入序）
  const order = entries.slice().sort((a, b) => b.idx - a.idx)
  const removed = new Set()
  const jsonBytes = (removedSet) => {
    let sum = 2 // {}
    let first = true
    for (const e of entries) {
      if (removedSet.has(e.word)) continue
      sum += (first ? 0 : 1) + e.cost
      first = false
    }
    return sum
  }
  const utf16Bytes = (removedSet) => {
    let sum = 2
    let first = true
    for (const e of entries) {
      if (removedSet.has(e.word)) continue
      sum += (first ? 0 : 1) + (e.word.length + JSON.stringify(e.entry).length + 3) * 2
      first = false
    }
    return sum
  }
  const budgetUtf16 = 5 * 1024 * 1024

  const rounds = []
  let accMin = 0
  let accMax = 0
  const removedMin = new Set()
  const removedMax = new Set()
  for (let round = 1; round <= 3; round++) {
    const remaining = order.filter((e) => !removedMin.has(e.word))
    const count = Math.max(1, Math.ceil(remaining.length / 4))
    // 最少清洗：从最右（array end）拿；最多清洗：算重排后的下标位
    const fromEnd = remaining.slice(-count)
    const midStart = Math.max(0, remaining.length - count - accMax)
    const fromMid = remaining.slice(midStart, midStart + count)
    for (const e of fromEnd) removedMin.add(e.word)
    for (const e of fromMid) removedMax.add(e.word)
    accMin += fromEnd.length
    accMax += fromMid.length
    const rem = N - accMax
    rounds.push({
      round,
      clearedThisRound: `${fromEnd.length}–${fromMid.length}`,
      cumulativeCleared: `${accMin}–${accMax}`,
      remainingEntries: `${N - accMin}–${rem}`,
      reviewJsonBytesRemaining: `${jsonBytes(removedMax).toLocaleString()}–${jsonBytes(removedMin).toLocaleString()}`,
      reviewUtf16BytesRemaining: `${utf16Bytes(removedMax).toLocaleString()}–${utf16Bytes(removedMin).toLocaleString()}`,
      fitsUnder5MiB: utf16Bytes(removedMax) <= budgetUtf16,
    })
  }
  return {
    source: 'src/lib/reviewStore.ts:64-96 的 QUOTA_ROUNDS=3 / Math.ceil(len/4) 算法离线精确复刻',
    method:
      '触发条件是「4 个 key 全写入后超限」。清洗顺序 = intervalIdx 降序；每轮清 ceil(剩余/4)。同一档位内清洗位置依赖 JS sort 稳定性，故给 [最少, 最多] 区间。',
    rounds,
    minCleared: accMin,
    maxCleared: accMax,
    finalFitsUnder5MiB: utf16Bytes(removedMax) <= budgetUtf16,
    conclusion:
      utf16Bytes(removedMax) <= budgetUtf16
        ? `熔断 3 轮内即可容纳：清洗 ${accMin}–${accMax} 条后 review 单独可落盘`
        : '熔断 3 轮仍不足（review 单独仍超 5 MiB）',
  }
}

/** review 单 key 最大可存条数（实测 byte/条换算 + 真实 setItem 二分验证） */
function computeReviewThreshold() {
  const N = 6713
  const r = rnd(7)
  const entryObj = () => {
    const idx = Math.floor(r() * 5)
    return {
      wrongCount: 1 + Math.floor(r() * 7),
      correctStreak: Math.floor(r() * 5),
      lastWrongAt: nowMs - Math.floor(r() * 30) * DAY,
      nextReviewAt: nowMs + INTERVALS_DAYS[idx] * DAY,
      intervalIdx: idx,
    }
  }
  let sum = 2
  const sizes = []
  for (let i = 0; i < N; i++) {
    const c = entryKeyBytes(ALL_WORDS[i]) + reviewEntryJsonBytes(entryObj())
    sizes.push(c)
    sum += c + 1
  }
  const avg = (sum - 2) / N
  return {
    method: '实测 JSON 字节 / 条（真实词 + 真实 ReviewEntry 分布）线性换算，再报告上界',
    avgBytesPerEntryUtf8: +avg.toFixed(2),
    avgUtf16BytesPerEntry: +((avg / 2) * 2).toFixed(2),
    reviewFullJsonBytes: sum,
    estimateMaxEntriesAt5MiB: Math.floor((5 * 1024 * 1024) / (avg * 2)),
    note: 'review 是单 key 整体 JSON.stringify 后写入；localStorage 按 UTF-16 字符计费，故按 utf16=2×utf8(ASCII) 换算',
  }
}

/** 组合场景最大可容纳条数（等比缩放，全 ASCII 近似） */
function computeComboThreshold() {
  const perEntry = {
    review: 114.6, // 稍后由 computeReviewThreshold 覆盖
  }
  return { note: '见 scenarios 里 S4–S7 的 quotaHit / actualWritten 实测结果（未外推）', perEntryHint: perEntry }
}

/* ---------------------------------------------------------------------------
 * 6. 汇总打印
 * ------------------------------------------------------------------------- */
function printSummary(out) {
  const L = console.log
  const fmt = (n) => n.toLocaleString('en-US')
  const pad = (s, n) => String(s).padStart(n)
  L('')
  L('='.repeat(104))
  L('Learning localStorage 压力实测（真实词表 6,713 唯一 word / 9,346 条记录）')
  L('='.repeat(104))
  L(`Chrome 实测 Quota: 最大可写 payload ${fmt(out.quotaProbe.maxPayloadBytes)} 字符 = UTF-16 ${fmt(out.quotaProbe.limitUtf16Bytes)} B = ${(out.quotaProbe.limitUtf16Bytes / 1024 / 1024).toFixed(2)} MiB`)
  L(`  （首个失败档 ${fmt(out.quotaProbe.firstFailBytes)} 字符；清理探测键成功: ${out.quotaProbe.cleared}）`)
  L(`  探测依据：独立 origin 上二分逼近 localStorage.setItem 能写入的最大 payload`)
  L('')
  L('【每场景 × 每指标】')
  L(
    'scene'.padEnd(6) +
      'desc'.padEnd(34) +
      'key'.padEnd(18) +
      pad('entries', 9) +
      pad('chars', 10) +
      pad('utf16B', 10) +
      pad('jsonB', 10) +
      pad('%limit', 8) +
      pad('setItemMs', 10) +
      pad('readMs', 8) +
      pad('写入', 8),
  )
  for (const s of out.scenarios) {
    let first = true
    for (const k of s.keys) {
      L(
        (first ? s.id : '').padEnd(6) +
          (first ? s.desc : '').padEnd(34) +
          k.key.padEnd(18) +
          pad(fmt(k.keyCount), 9) +
          pad(fmt(k.chars), 10) +
          pad(fmt(k.utf16Bytes), 10) +
          pad(fmt(k.jsonBytes), 10) +
          pad(k.pctOfLimit, 8) +
          pad(k.setItemMsMedian, 10) +
          pad(k.readParseMsMedian, 8) +
          pad(k.realWriteOk === undefined ? (s.realWriteOrder.find((w) => w.key === k.key)?.ok ? 'OK' : 'QUOTA') : '', 8),
      )
      first = false
    }
    L(
      ''.padEnd(6) +
        ''.padEnd(34) +
        '— 合计 —'.padEnd(18) +
        pad('', 9) +
        pad('', 10) +
        pad(fmt(s.totalUtf16Bytes), 10) +
        pad(fmt(s.totalJsonBytes), 10) +
        pad(s.pctOfLimit, 8) +
        pad('', 10) +
        pad('', 8) +
        pad(s.quotaHit ? `QUOTA@${fmt(s.actualWritten)}` : 'OK', 8),
    )
    L(
      `        真机判定: ${s.quotaHit ? `撞 Quota（首撞 key=${s.firstQuotaKey}，${s.firstQuotaKey === 'gt.review.v1' ? `实际可写 ${fmt(s.actualWritten)} 条` : ''}）` : '未撞 Quota，全部写入成功'}；` +
        `写入后 self-reported 占用 ${fmt(s.storageSelfReportedBytes)} B；累计模拟超限=${s.simulatedExceedsLimit}${s.simulatedOverAt ? ` (@${s.simulatedOverAt})` : ''}`,
    )
    L('')
  }

  L('【reviewStore 熔断清洗序列（离线精确复刻 save() 算法）】')
  for (const r of out.eviction.reviewStoreSave.rounds) {
    L(
      `  round ${r.round}: 本轮清 ${r.clearedThisRound} 条，累计 ${r.cumulativeCleared} 条，剩余 ${r.remainingEntries} 条，` +
        `review utf16 剩余 ${r.reviewUtf16BytesRemaining} B，可落盘=${r.fitsUnder5MiB}`,
    )
  }
  L(`  → ${out.eviction.reviewStoreSave.conclusion}`)

  L('')
  L('【5 MiB 硬上限对照实验（CDP Storage.overrideQuotaForOrigin 把 origin 配额压到 5 MiB）】')
  L('  ' + out.fiveMiBCap.method)
  L('  ' + 'scene'.padEnd(6) + 'desc'.padEnd(34) + pad('总utf16B', 12) + pad('%5MiB', 8) + pad('真机判定', 20))
  for (const s of out.fiveMiBCap.scenarios) {
    L(
      '  ' +
        s.id.padEnd(6) +
        s.desc.padEnd(34) +
        pad(fmt(s.totalUtf16Bytes), 12) +
        pad(s.pctOfLimit, 8) +
        pad(s.quotaHit ? `QUOTA@${fmt(s.actualWritten)}条` : 'OK', 20),
    )
  }

  L('')
  L('【结论】')
  const q5 = out.quotaProbe.limitUtf16Bytes
  L(`  先分清两个口径：`)
  L(`    (a) 本机 Chrome 实测真实配额 = ${fmt(q5)} B = ${(q5 / 1024 / 1024).toFixed(2)} MiB（二分探得，非假设）`)
  L(`    (b) 方案/历史文档沿用的预算口径 = 5 MiB = 5,242,880 B`)
  L('')
  L(`  按 (a) 真实配额（${(q5 / 1024 / 1024).toFixed(2)} MiB）：`)
  for (const s of out.scenarios) {
    L(
      `    ${s.id} ${s.desc}: 占用 ${fmt(s.totalUtf16Bytes)} B = 真实配额的 ${s.pctOfLimit}%  ${
        s.quotaHit ? `→ 撞 Quota（实际可写 ${fmt(s.actualWritten)} 条）` : '→ 未撞 Quota ✓'
      }`,
    )
  }
  L('')
  L('  按 (b) 5 MiB 预算口径（含 CDP 硬压 5 MiB 的真机验证）：')
  for (const s of out.fiveMiBCap.scenarios) {
    L(
      `    ${s.id} ${s.desc}: 占用 ${fmt(s.totalUtf16Bytes)} B = 5 MiB 的 ${((s.totalUtf16Bytes / (5 * 1024 * 1024)) * 100).toFixed(2)}%  ${
        s.quotaHit ? `→ 撞 Quota（实际可写 ${fmt(s.actualWritten)} 条）` : '→ 未撞 Quota ✓'
      }`,
    )
  }
  L('')
}

main()
  .then((f) => {
    console.log(`OK -> ${f}`)
  })
  .catch((e) => {
    console.error('FAIL:', e)
    process.exit(2)
  })
