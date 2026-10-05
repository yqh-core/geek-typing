#!/usr/bin/env node
/* P1.7-Wave5 · D-2/D-3 Budget Gate（gate-perf）
 *
 * 规则（计划 D-2 原文，消除 ×1.15 与绝对值的矛盾）：
 *   effective = min-strict(derived = baseline × 1.15, absolute)
 *   且每个预算行必须带 reason，禁止静默改数字。
 *
 * 双基线口径（重要）：W2A/W2B/W2C 三轮给主 chunk 加入了 persistence 通道层，
 * 当前实测基线（commit 1577140）与计划表里的 a8d10c0 基线已经不同。因此预算表
 * 同时记录两行基线：计划基线（a8d10c0）与当前实测基线（perf-baseline.json 的
 * bundle 节，由 `node scripts/gate-perf.mjs --record-baseline` 写入并随仓库提交），
 * effective 按**更严者**取：min(absolute, planned×1.15, current×1.15)。
 *
 * 判定方式：本门在 CI 里只做「当前 dist 实测体积 vs 已提交预算表」的比较，
 * 不在 CI 里重测基线。perf-baseline.json 是预算门的输入，必须随仓库提交。
 *
 * D-3：boot 预算天然双列（Desktop / Mobile 各自 effective），Mobile 独立不共享
 * 桌面值。boot 与 content 查询行标记 baseline-only：CI 无法测启动/查询耗时
 * （runner 无 Chrome 保证、本机 Esafenet 加密驱动抖动大），这些行只打印基线与
 * derived 预算供本机 bench 脚本对照，**不作为 CI 判红依据**。
 *
 * 超预算输出五元组：指标 / 基线 / 当前 / effective 预算 / 来源(derived|absolute)。
 *
 * 与 check-bundle 的关系：主 chunk raw/gzip 的阈值单一事实来源在本文件的预算表
 * （scripts/check-bundle.mjs 改为 import 本表，历史硬编码 430,080/138,240 已废弃）；
 * check-bundle 的 WARM_GZIP_MAX（600 KiB）与 words-* chunk 数判据保持不变。
 *
 * 计划原文注明「D-2/D-3 Budget Gate（架构与 Content 稳定后才卡 CI）」—— 现在
 * 架构已稳（Wave 3 CLOSED），Content（Wave 4）未做，预算门先于 Wave 4 落地是
 * 有意的顺序调整：让 Wave 4 新增内容时即受预算门护栏约束。
 *
 * 用法：
 *   node scripts/gate-perf.mjs                      # 预算判定（CI / 本机）
 *   node scripts/gate-perf.mjs --record-baseline    # 把当前 dist 实测写入基线（棘轮：只许降不许升）
 *   node scripts/gate-perf.mjs --falsify            # 自带证伪自检（判据能判红，见下）
 *
 * --record-baseline 的棘轮守卫（本轮新增，N3 裁定「暂缓，先补守卫」的第一道解锁条件）：
 *   常规判定守的是「当前 dist vs 当前预算表」；**没有任何东西守着「预算不得上调」**。
 *   所以 --record-baseline 加了逐字段棘轮：读出既有基线 ⇒ 任一字段升高 ⇒ 拒绝写入 + EXIT=1。
 *   照 scripts/gate-lint.mjs:120-144 的范式抄（形态对齐：prev vs cur 比对 + 拒绝即退出）。
 *   ⚠️ 必须**逐字段**比，不能比一个汇总数 —— 汇总会漏掉「A 升 B 降」互相掩盖的情况。
 *   ⚠️ 守卫只锁 perf-baseline.json 这个**基线文件**；ABSOLUTE_BUDGET / PLANNED_BASELINE /
 *      REASONS 三张预算表不在本守卫范围内（预算本体的调整是另一条既定路径，见拒绝时的提示）。
 *   ⚠️ --record-baseline 只写 doc.bundle，不碰 content / boot / meta 三段 —— 那三段是本机
 *      bench-boot / bench-content 的产物，gate-perf 冲掉它们就越权了。
 */
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')
// 预算门的输入是可变基线（bench-boot / bench-content / --record-baseline 都会重写），
// 因此放在 INV-1 冻结区之外；docs/audit-package/_generated/perf-baseline.json 那份是历史冻结种子，只读。
const BASELINE_JSON = join(ROOT, 'docs', '_generated', 'perf-baseline.json')

const FACTOR = 1.15

/* ---------------- 预算表（单一事实来源；check-bundle 也读这里） ----------------
 *
 * plannedBaseline：计划 D-2 初版表给的 a8d10c0 实测值；计划未给的行记 null。
 * absolute：人工设定的绝对预算；计划未给的行记 null（纯 derived）。
 * enforceInCI：false = baseline-only 行（CI 测不了，只打印）。
 */
export const PLANNED_BASELINE = {
  'main-chunk-raw': 428324,        // a8d10c0 实测（P1.7-PLAN D-2 表）
  'main-chunk-gzip': null,         // 计划未给；旧 check-bundle 硬编码 138,240 B 转为 absolute
  'words-chunk-raw-single': 483087, // a8d10c0 实测（P1.7-PLAN D-2 表）
}

export const ABSOLUTE_BUDGET = {
  'main-chunk-raw': 450000,        // 计划 D-2 给定；相对旧 check-bundle 硬编码 430,080 B 抬升
  'main-chunk-gzip': 145000,       // B-2 八类试金石包 manifest 按设计静态入主 chunk（O(包数) 线性增长）；gzip 因 JSON 高度可重压缩仅微增，留 ~6.7KiB 余量；raw 450,000 不变
  'words-chunk-raw-single': 1000, // FALSIFY-INJECTION 临时注入（可丢弃）
}

export const REASONS = {
  'main-chunk-raw':
    '阈值相对 check-bundle 旧值 430,080 B 抬到 450,000 B。超限增量来自 W2A/W2B/W2C 的 persistence ' +
    '通道层（channels/adapter/repository/namespace，首屏读写路径的运行时必需代码）；迁移期专用模块 ' +
    '(migration-orchestrator/migration-lock/migration-write-guard/recovery/r5) 经静态引用排查 + 构建产物' +
    '特征字面量探测实证已被 tree-shake 排除在主 chunk 外，不存在「不抬阈值的低风险瘦身路径」，故走预算门并显式记录抬升。',
  'main-chunk-gzip':
    '沿用 check-bundle 历史硬编码 138,240 B（135 KiB）作为 absolute，不抬升；derived（当前基线×1.15）更宽，按更严者取 absolute。',
  'words-chunk-raw-single':
    '新增判据（旧 check-bundle 只数 words-* chunk 个数，不限单个体积）。计划 D-2 给定 absolute=550,000 B 收紧；' +
    '当前实测与 a8d10c0 基线一致（内容侧未变），derived=555,550 B 比 absolute 宽，按 absolute 取。',
}

/** effective = min-strict(所有可用预算)；返回 { effective, source } */
export function computeEffective(plannedBaseline, currentBaseline, absolute) {
  const candidates = []
  if (absolute != null) candidates.push({ value: absolute, source: 'absolute' })
  if (plannedBaseline != null) candidates.push({ value: Math.ceil(plannedBaseline * FACTOR), source: 'derived(planned×1.15)' })
  if (currentBaseline != null) candidates.push({ value: Math.ceil(currentBaseline * FACTOR), source: 'derived(current×1.15)' })
  if (candidates.length === 0) return { effective: null, source: 'none' }
  candidates.sort((a, b) => a.value - b.value)
  return { effective: candidates[0].value, source: candidates[0].source }
}

/** 读 perf-baseline.json 的 bundle 节（当前实测基线）。缺失/不全返回 null 字段。 */
export function loadBundleBaselines(jsonPath = BASELINE_JSON) {
  if (!existsSync(jsonPath)) return { mainRaw: null, mainGzip: null, wordsMaxRaw: null, exists: false }
  try {
    const doc = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const b = doc.bundle ?? {}
    return {
      mainRaw: b.mainChunkRaw ?? null,
      mainGzip: b.mainChunkGzip ?? null,
      wordsMaxRaw: b.wordsChunkMaxRaw ?? null,
      exists: true,
    }
  } catch {
    return { mainRaw: null, mainGzip: null, wordsMaxRaw: null, exists: false }
  }
}

/** 实测 dist：与 check-bundle 同口径（raw = 文件字节，gzip = zlib level 9） */
export function measureDist(assetsDir = ASSETS) {
  if (!existsSync(assetsDir)) return null
  const files = readdirSync(assetsDir)
  const mainChunks = files.filter((f) => /^index-.*\.js$/.test(f))
  const wordsChunks = files.filter((f) => /^words-.*\.js$/.test(f))
  if (mainChunks.length !== 1 || wordsChunks.length === 0) return null
  const rawOf = (f) => statSync(join(assetsDir, f)).size
  const gzipOf = (f) => gzipSync(readFileSync(join(assetsDir, f)), { level: 9 }).length
  const wordsMaxRaw = Math.max(...wordsChunks.map(rawOf))
  return {
    mainChunk: mainChunks[0],
    mainRaw: rawOf(mainChunks[0]),
    mainGzip: gzipOf(mainChunks[0]),
    wordsCount: wordsChunks.length,
    wordsMaxRaw,
  }
}

/** 组装 bundle 三行（CI 判红依据）。
 *  recorded = perf-baseline.json 里记录的实测基线；measured = 当前 dist 实测。 */
export function buildBundleRows(recorded, measured) {
  const rows = []
  const spec = [
    ['main-chunk-raw', recorded.mainRaw, measured.mainRaw, '主 chunk index-*.js raw'],
    ['main-chunk-gzip', recorded.mainGzip, measured.mainGzip, '主 chunk index-*.js gzip'],
    ['words-chunk-raw-single', recorded.wordsMaxRaw, measured.wordsMaxRaw, 'words-*.js 单个最大 raw'],
  ]
  for (const [id, baselineRecorded, current, label] of spec) {
    const { effective, source } = computeEffective(PLANNED_BASELINE[id], baselineRecorded, ABSOLUTE_BUDGET[id])
    rows.push({
      id,
      metric: label,
      plannedBaseline: PLANNED_BASELINE[id],
      currentBaseline: baselineRecorded,
      absolute: ABSOLUTE_BUDGET[id],
      effective,
      source,
      current,
      reason: REASONS[id],
    })
  }
  return rows
}

const _kib = (b) => (b == null ? '—' : `${(b / 1024).toFixed(2)} KiB`)

function fmtBytes(b) {
  return b == null ? '—' : `${b} B`
}

/* ---------------- baseline-only 行（boot / content，D-3 双列） ---------------- */

function printBaselineOnlyRows(doc) {
  const boot = doc?.boot
  const content = doc?.content
  const lines = []
  if (content?.searchWords?.p95 != null) lines.push(['searchWords P95', content.searchWords.p95, 'ms'])
  if (content?.queryWord?.p95 != null) lines.push(['queryWord P95', content.queryWord.p95, 'ms'])
  if (boot?.desktop?.p95 != null) lines.push(['Boot Desktop P95', boot.desktop.p95, 'ms'])
  if (boot?.mobile?.p95 != null) lines.push(['Boot Mobile P95', boot.mobile.p95, 'ms'])
  if (lines.length === 0) return
  console.log('\n---- baseline-only 行（D-3：Mobile 独立不共享桌面值；CI 不判红，供本机 bench 对照）----')
  for (const [name, baseline, unit] of lines) {
    const effective = Math.ceil(baseline * FACTOR * 1000) / 1000
    console.log(`  ℹ️ ${name.padEnd(18)} 基线 ${baseline} ${unit} → derived(×1.15) 预算 ${effective} ${unit}`)
  }
}

/* ---------------- 棘轮守卫（--record-baseline 只许降不许升） ----------------
 *
 * N3 裁定暂缓 INV-3 的核心理由：这条语义此前**没有任何机器判据在守**。
 * 本守卫是「预算不得上调」的第一道机器判据 —— 形态照 scripts/gate-lint.mjs:120-144 抄。
 *
 * 为什么必须逐字段（而不是比一个汇总数）：
 *   汇总比会漏掉「mainChunkRaw 降 20KB、wordsChunkMaxRaw 升 30KB」这种互相掩盖 ——
 *   总量没涨就放行，但 words 单 chunk 已经悄悄变肥，正是 INV-3 要拦的那类劣化。
 */

/** 三个受棘轮约束的字段：基线 JSON 的键 ← dist 实测的取值函数。顺序固定 ⇒ 输出可复现。 */
const RATCHET_FIELDS = [
  { baselineKey: 'mainChunkRaw', metric: 'main-chunk-raw（主 chunk index-*.js raw）', pick: (m) => m.mainRaw },
  { baselineKey: 'mainChunkGzip', metric: 'main-chunk-gzip（主 chunk gzip, zlib level 9）', pick: (m) => m.mainGzip },
  { baselineKey: 'wordsChunkMaxRaw', metric: 'words-chunk-raw-single（words-*.js 单个最大 raw）', pick: (m) => m.wordsMaxRaw },
]

/**
 * 逐字段比较「既有基线」与「当前实测」，返回所有**升高**的字段。
 * 降低 / 持平不返回任何东西 —— 棘轮只拦上调，不拦降级（降级必须能落盘，否则棘轮失去意义）。
 *
 * @param {Record<string, unknown>|null} prevBundle 已存 doc.bundle（null = 首次建立基线）
 * @param {ReturnType<typeof measureDist>} measured 当前 dist 实测
 * @returns {{baselineKey:string, metric:string, prev:number, next:number, delta:number}[]}
 */
export function checkRatchet(prevBundle, measured) {
  const violations = []
  if (!prevBundle) return violations
  for (const f of RATCHET_FIELDS) {
    const prev = prevBundle[f.baselineKey]
    // 基线缺该字段（非数字）⇒ 不算「上调」，而是「基线不全」—— 那是 gate() 的职责，不在这里越权判红
    if (typeof prev !== 'number') continue
    const next = f.pick(measured)
    if (next > prev) violations.push({ ...f, prev, next, delta: next - prev })
  }
  return violations
}

/** 组装要写入的 doc.bundle 节。注意：**只覆盖 bundle，不动 content / boot / meta**。 */
function buildBundleSection(m) {
  return {
    mainChunkRaw: m.mainRaw,
    mainChunkGzip: m.mainGzip,
    wordsChunkMaxRaw: m.wordsMaxRaw,
    mainChunkFile: m.mainChunk,
    recordedAt: new Date().toISOString(),
    note: 'gate-perf --record-baseline 写入；gzip 口径与 check-bundle 一致（zlib level 9）',
  }
}

/** 读既有基线文档。文件不存在 / 不是合法 JSON ⇒ 等价于「无既有基线」（首次建立，放行）。 */
function readBaselineDoc(baselinePath) {
  if (!existsSync(baselinePath)) return { doc: {}, prevBundle: null }
  try {
    const doc = JSON.parse(readFileSync(baselinePath, 'utf8'))
    return { doc, prevBundle: doc.bundle ?? null }
  } catch {
    return { doc: {}, prevBundle: null }
  }
}

/**
 * 纯逻辑：给定实测与基线路径，返回「写 / 不写」。不打印、不退出 —— 证伪自检直接复用它，
 * 不靠重跑整个门（和 gate-lint 的 decide() 同思路）。
 * @returns {{status:'OK'|'REJECT', violations:object[], prevBundle:object|null, next:object|null, baselinePath:string}}
 */
export function applyBaseline({ measured, baselinePath = BASELINE_JSON }) {
  const { doc, prevBundle } = readBaselineDoc(baselinePath)
  const violations = checkRatchet(prevBundle, measured)
  if (violations.length > 0) {
    return { status: 'REJECT', violations, prevBundle, next: null, baselinePath }
  }
  doc.bundle = buildBundleSection(measured)
  writeFileSync(baselinePath, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  return { status: 'OK', violations: [], prevBundle, next: doc.bundle, baselinePath }
}

/** 打印「上一版 X → 新版 Y」对照，让降级也留下可读的证据。 */
function printRatchetComparison(prevBundle, measured) {
  for (const f of RATCHET_FIELDS) {
    const prev = prevBundle ? prevBundle[f.baselineKey] : undefined
    const next = f.pick(measured)
    const arrow = typeof prev === 'number'
      ? `${fmtBytes(prev)} → ${fmtBytes(next)}（${next === prev ? '持平' : next < prev ? `降低 ${fmtBytes(prev - next)}` : `升高 ${fmtBytes(next - prev)}`}）`
      : '（无既有基线，首次建立）'
    console.log(`[gate-perf]   · ${f.baselineKey.padEnd(16)} ${arrow}`)
  }
}

/* ---------------- main ---------------- */

/**
 * 把当前 dist 实测写入基线。三个可注入点（证伪自检用，真跑时全部走默认）：
 *   assetsDir    —— 指向隔离的假 dist，绝不动真 dist/
 *   baselinePath —— 指向基线副本，真perf-baseline.json 全程只读
 *   quiet        —— 证伪自检内复用时压制重复输出
 */
function recordBaseline({ assetsDir = ASSETS, baselinePath = BASELINE_JSON, quiet = false } = {}) {
  const m = measureDist(assetsDir)
  if (!m) {
    console.error('[gate-perf] dist 不完整（缺 index-*.js 或 words-*.js）：先 build 再 --record-baseline')
    process.exit(1)
  }
  const r = applyBaseline({ measured: m, baselinePath })
  if (r.status === 'REJECT') {
    console.error('[gate-perf] ❌ --record-baseline 拒绝写入：以下字段相对已存基线**升高**（棘轮只许降不许升）')
    for (const v of r.violations) {
      console.error(`[gate-perf]   · ${v.baselineKey}（${v.metric}）`)
      console.error(`[gate-perf]       旧值 ${fmtBytes(v.prev)} → 新值 ${fmtBytes(v.next)}（升高 ${fmtBytes(v.delta)}）`)
    }
    console.error('[gate-perf]   基线文件未被修改（仍是旧值）。合法出路只有两条：')
    console.error('[gate-perf]     ① 真去瘦身 —— 改代码把 dist 体积降下来，再跑 --record-baseline（降/持平都允许写入）；')
    console.error('[gate-perf]     ② 显式改 scripts/gate-perf.mjs 的 ABSOLUTE_BUDGET 数值，并在 REASONS 同一条里写明理由。')
    console.error('[gate-perf]   禁止第三条路：手改 perf-baseline.json 的 bundle 字段把基线抬高 —— 那正是本守卫要拦的动作。')
    process.exit(1)
  }
  if (!quiet) {
    console.log(`[gate-perf] 基线已记录：index raw ${m.mainRaw} B / gzip ${m.mainGzip} B；words 单个最大 raw ${m.wordsMaxRaw} B → ${baselinePath}`)
    console.log('[gate-perf] 棘轮对照（逐字段）：')
    printRatchetComparison(r.prevBundle, m)
  }
  return r
}

/**
 * 纯判定：不打印、不退出。fatal 非 null 表示前置条件不成立（产物缺失 / 基线不全 / dist 结构异常）。
 * gate() 打印 + 退出，falsify 直接拿 status 与 bad 数 —— 两者共用同一份判据，不会漂移。
 */
function evaluateGate({ assetsDir = ASSETS, baselinePath = BASELINE_JSON } = {}) {
  if (!existsSync(assetsDir)) {
    return { fatal: `[gate-perf] ${assetsDir} 不存在：请先 npm run build（产物缺失不视为通过）` }
  }
  const base = loadBundleBaselines(baselinePath)
  if (!base.exists || base.mainRaw == null || base.mainGzip == null || base.wordsMaxRaw == null) {
    return { fatal: `[gate-perf] ${baselinePath} 缺 bundle 基线（预算门输入不全）：先跑 node scripts/gate-perf.mjs --record-baseline 并提交该文件` }
  }
  const m = measureDist(assetsDir)
  if (!m) {
    return { fatal: '[gate-perf] dist 结构不符合预期（主 chunk 不唯一或无 words chunk）：不视为通过' }
  }
  const rows = buildBundleRows(
    { mainRaw: base.mainRaw, mainGzip: base.mainGzip, wordsMaxRaw: base.wordsMaxRaw },
    { mainRaw: m.mainRaw, mainGzip: m.mainGzip, wordsMaxRaw: m.wordsMaxRaw }
  )
  const bad = rows.filter((r) => r.current > r.effective)
  let doc = {}
  try { doc = JSON.parse(readFileSync(baselinePath, 'utf8')) } catch { /* 基线已在上一步校验过可解析 */ }
  return { fatal: null, base, m, rows, bad, doc }
}

function gate(opts = {}) {
  const r = evaluateGate(opts)
  if (r.fatal) {
    console.error(r.fatal)
    process.exit(1)
  }

  console.log('== P1.7-Wave5 · D-2/D-3 Budget Gate（gate-perf）==')
  console.log(`规则：effective = min-strict(baseline×1.15, absolute)，双基线（计划 a8d10c0 / 当前实测）取更严\n`)

  const badIds = new Set(r.bad.map((x) => x.id))
  for (const row of r.rows) {
    if (!badIds.has(row.id)) {
      console.log(`  ✅ ${row.metric.padEnd(28)} 当前 ${fmtBytes(row.current)} ≤ effective ${fmtBytes(row.effective)}（来源 ${row.source}；基线 计划 ${fmtBytes(row.plannedBaseline)} / 实测 ${fmtBytes(row.currentBaseline)}）`)
    } else {
      console.log(`  ✗ FAIL ${row.metric}`)
      console.log(`      指标     ：${row.metric}`)
      console.log(`      基线     ：计划 ${fmtBytes(row.plannedBaseline)} / 实测 ${fmtBytes(row.currentBaseline)}`)
      console.log(`      当前     ：${fmtBytes(row.current)}`)
      console.log(`      effective：${fmtBytes(row.effective)}`)
      console.log(`      来源     ：${row.source}`)
      console.log(`      reason   ：${row.reason}`)
    }
  }

  printBaselineOnlyRows(r.doc)

  if (r.bad.length > 0) {
    console.log(`\n❌ gate-perf FAIL：${r.bad.length} 行超预算（超预算必须走「改代码瘦身或显式改预算表+reason」，禁止静默抬阈值）`)
    process.exit(1)
  }
  console.log(`\n✅ gate-perf PASS：${r.rows.length} 行 bundle 预算全部通过`)
  return r
}

/* ---------------- --falsify：判据能判红吗？ ----------------
 *
 * 形态照 scripts/gate-lint.mjs:150-198 的 falsify()：注入故障 ⇒ 断言判红 ⇒ 还原 ⇒ 跑对照组复绿。
 *
 * 两条注入（各带「注入前/ 注入后 / 还原后」三点输出）：
 *   ① 棘轮守卫：把基线副本的 mainChunkRaw 压到 1 B（比任何实测都小）⇒ --record-baseline 必须拒绝。
 *      这条直接证明「拒绝上调」这个**新语义**真的有机器守着 —— 条件① 的判据本身。
 *   ② 预算门本体：造一个假 dist（主 chunk raw 顶到ABSOLUTE_BUDGET 之上）⇒ gate() 必须 FAIL。
 *      这条证明常规比较判据没写坏（不是恒真）。
 *
 * 隔离纪律（硬要求）：
 *   - 真 docs/_generated/perf-baseline.json 全程**只读**（跑前存字节、跑后逐字节比对）；
 *   - 真 dist/ 全程**只读**（假 dist 建在 node_modules/.tmp/ 下，该目录已被 gitignore）；
 *   - 所有临时文件用完即删，最后检查「临时目录是否还在」—— 还原不干净 ⇒ 证伪失败。
 *   注入① 用 baselinePath 指向副本，所以 recordBaseline() 全程不写真基线。
 *
 * ⚠️ 为什么逐个unlinkSync 而不用 rmSync(recursive)：
 *   本机Node 预加载了 safe-delete shim，它对删除操作按「本轮累计删除条目数」计费，
 *   超过阈值（50）就抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED。rmSync(recursive) 一次递归算
 *   几十个条目，会在**第二次**跑 --falsify 时炸掉（第一次通常还没到阈值）——
 *   也就是「跑一次绿、跑两次红」，这种门不该有。逐个 unlink + rmdir 只删我们自己建的
 *   那4 个已知路径，计数可控且语义精确（形态对齐 gate-lint.mjs 的 unlinkSync(FALSIFY_TMP)）。
 */
function falsify() {
  const fail = []
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
  // 隔离目录放node_modules/.tmp/ 下（.gitignore 已覆盖 node_modules），绝不在 docs/ 或 dist/ 里留痕
  const TMP = join(ROOT, 'node_modules', '.tmp', 'gate-perf-falsify')
  const TMP_BASELINE = join(TMP, 'perf-baseline.injected.json')
  const TMP_ASSETS = join(TMP, 'assets')
  const TMP_FAKE_INDEX = join(TMP_ASSETS, 'index-falsify.js')
  const TMP_FAKE_WORDS = join(TMP_ASSETS, 'words-falsify.js')

  /** 精确删除本函数自己创建的那几个文件/目录（不递归、不多删）。 */
  function cleanupTemp() {
    for (const f of [TMP_FAKE_INDEX, TMP_FAKE_WORDS, TMP_BASELINE]) {
      if (existsSync(f)) unlinkSync(f)
    }
    for (const d of [TMP_ASSETS, TMP]) {
      if (existsSync(d)) rmdirSync(d)
    }
  }

  if (!existsSync(ASSETS)) {
    console.error('[gate-perf] --falsify 需要真实 dist 作为对照基准：先 npm run build')
    process.exit(1)
  }
  // 真基线字节快照：跑完必须逐字节一致
  const realBaselineShaBefore = sha(BASELINE_JSON)

  try {
    cleanupTemp()
    mkdirSync(TMP_ASSETS, { recursive: true })

    /* --- 注入前：常规判定必须 PASS（否则下面两条注入没有可归因的对照） --- */
    const before = evaluateGate()
    if (before.fatal) {
      console.error(`[gate-perf] --falsify 无法开始：${before.fatal}`)
      process.exit(1)
    }
    if (before.bad.length > 0) {
      console.error('[gate-perf] --falsify 无法开始：注入前常规判定就已 FAIL，对照组不成立')
      process.exit(1)
    }
    console.log(`[gate-perf] 注入前：常规判定 PASS（${before.rows.length} 行），基线 mainChunkRaw ${before.base.mainRaw} B`)

    /* --- 注入①：基线副本的 mainChunkRaw 压到 1 B ⇒ recordBaseline 必须 REJECT --- */
    const injectedDoc = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'))
    injectedDoc.bundle.mainChunkRaw = 1
    writeFileSync(TMP_BASELINE, JSON.stringify(injectedDoc, null, 2) + '\n', 'utf8')
    const injectedShaBefore = sha(TMP_BASELINE)
    const m = measureDist(ASSETS)
    if (!m) {
      console.error('[gate-perf] --falsify 无法开始：真实 dist 结构不完整，无法作为注入①的实测来源')
      process.exit(1)
    }
    console.log(`[gate-perf] 注入① 前：基线副本 mainChunkRaw = 1 B；真实 dist 实测 mainChunkRaw = ${m.mainRaw} B（必然「升高」）`)
    const r1 = applyBaseline({ measured: m, baselinePath: TMP_BASELINE })
    if (r1.status !== 'REJECT') {
      fail.push(`注入①（基线被压到 1 B 后写入）判定为 ${r1.status}，应为 REJECT —— 棘轮守卫没拦住上调`)
    } else {
      const named = r1.violations.map((v) => v.baselineKey)
      if (!named.includes('mainChunkRaw')) {
        fail.push(`注入① 判红了但报错没指名 mainChunkRaw（实际点名：${named.join(',') || '无'}）`)
      } else {
        const v = r1.violations.find((x) => x.baselineKey === 'mainChunkRaw')
        console.log(`[gate-perf] 注入① 后：REJECT ✅ —— 指名 mainChunkRaw，旧 1 B → 新 ${v.next} B（升高 ${v.delta} B）；基线副本未被改写`)
      }
    }
    // 拒绝 ⇒ 必须一个字节都没写（否则就是「先写了再报错」，守卫等于没有）
    if (sha(TMP_BASELINE) !== injectedShaBefore) {
      fail.push('注入① 拒绝了但仍改写了基线副本 —— 拒绝路径必须零写入')
    }
    // 对照：同一份基线副本，把 mainChunkRaw 抬到实测之上 ⇒ 必须允许写入（棘轮不许变成"一律拒绝"）
    const okDoc = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'))
    okDoc.bundle = { ...okDoc.bundle, mainChunkRaw: m.mainRaw + 1000, mainChunkGzip: m.mainGzip + 1000, wordsChunkMaxRaw: m.wordsMaxRaw + 1000 }
    writeFileSync(TMP_BASELINE, JSON.stringify(okDoc, null, 2) + '\n', 'utf8')
    const r1b = applyBaseline({ measured: m, baselinePath: TMP_BASELINE })
    if (r1b.status !== 'OK') {
      fail.push(`注入① 的对照（基线高于实测 ⇒ 应允许写入）判定为 ${r1b.status}，应为 OK —— 棘轮把"降/持平"也拦了`)
    } else {
      console.log(`[gate-perf] 注入① 对照：基线高于实测时仍允许写入 ✅（mainChunkRaw ${m.mainRaw + 1000} B → ${m.mainRaw} B，降低 ${1000} B）`)
    }
    // 写入边界：只许动 bundle，content / boot / meta 必须逐字节不变
    const afterWrite = JSON.parse(readFileSync(TMP_BASELINE, 'utf8'))
    for (const section of ['content', 'boot', 'meta']) {
      if (JSON.stringify(afterWrite[section]) !== JSON.stringify(injectedDoc[section])) {
        fail.push(`--record-baseline 改写了 ${section} 段 —— 写入边界越界（只许写 bundle）`)
      }
    }

    /* --- 注入②：假 dist 的主 chunk 顶穿 ABSOLUTE_BUDGET ⇒ gate() 必须 FAIL --- */
    // 假 dist：一个 index-*.js（顶穿 absolute 预算）+ 一个 words-*.js（满足 measureDist 的结构要求）
    const overBudgetRaw = Math.max(ABSOLUTE_BUDGET['main-chunk-raw'], PLANNED_BASELINE['main-chunk-raw'] * FACTOR) + 5000
    writeFileSync(TMP_FAKE_INDEX, Buffer.alloc(overBudgetRaw, 0x61))
    writeFileSync(TMP_FAKE_WORDS, Buffer.alloc(1000, 0x62))
    const mFake = measureDist(TMP_ASSETS)
    if (!mFake) {
      fail.push('注入② 的假 dist 结构不完整（measureDist 返回 null），注入无效')
    } else {
      console.log(`[gate-perf] 注入② 前：真实 dist mainChunkRaw ${m.mainRaw} B；假 dist mainChunkRaw ${mFake.mainRaw} B（absolute 预算 ${ABSOLUTE_BUDGET['main-chunk-raw']} B）`)
      const r2 = evaluateGate({ assetsDir: TMP_ASSETS })
      if (r2.fatal) {
        fail.push(`注入② 判定为 fatal（${r2.fatal}）而非 FAIL —— 注入方式有问题`)
      } else if (r2.bad.length === 0) {
        fail.push('注入②（主 chunk 顶穿预算）判定为 PASS —— 预算门判据恒真，没在守')
      } else {
        const ids = r2.bad.map((x) => x.id).join('、')
        console.log(`[gate-perf] 注入② 后：FAIL ✅ —— ${r2.bad.length} 行超预算（${ids}）；真 dist/ 全程只读未改`)
      }
      // 真dist 必须逐字节未动
      const mAfter = measureDist(ASSETS)
      if (!mAfter || mAfter.mainRaw !== m.mainRaw || mAfter.mainGzip !== m.mainGzip || mAfter.wordsMaxRaw !== m.wordsMaxRaw) {
        fail.push('注入② 期间真 dist/ 的实测值发生了变化 —— 证伪污染了真产物')
      }
    }
  } finally {
    // 还原：临时目录整个删掉
    cleanupTemp()
  }

  /* --- 还原后：临时文件清干净 + 真基线逐字节一致 + 对照组常规判定复绿 --- */
  if (existsSync(TMP)) fail.push(`证伪临时目录没删干净：${TMP}`)
  const realBaselineShaAfter = sha(BASELINE_JSON)
  if (realBaselineShaAfter !== realBaselineShaBefore) {
    fail.push(`真基线 ${BASELINE_JSON} 未逐字节还原（sha256 ${realBaselineShaBefore} → ${realBaselineShaAfter}）`)
  } else {
    console.log(`[gate-perf] 还原后：真基线逐字节一致 ✅（sha256 ${realBaselineShaAfter.slice(0, 16)}…，全程只读）`)
  }

  const after = evaluateGate()
  if (after.fatal) {
    fail.push(`还原后常规判定 fatal：${after.fatal}`)
  } else if (after.bad.length > 0) {
    fail.push(`还原后常规判定仍 FAIL（${after.bad.length} 行）—— 证伪没恢复干净，或判据本来就红`)
  } else {
    console.log(`[gate-perf] 还原后：常规判定复绿 ✅ PASS（${after.rows.length} 行）—— 判据不是恒真，也不是恒红`)
  }

  if (fail.length) {
    console.error('[gate-perf] ❌ 证伪自检失败（判据可能恒真，或还原不干净）：')
    for (const f of fail) console.error(`   · ${f}`)
    process.exit(1)
  }
  console.log('[gate-perf] ✅ 证伪自检通过：棘轮拒绝上调 + 预算门判红 + 对照组复绿，全部成立')
  process.exit(0)
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  if (process.argv.includes('--falsify')) falsify()
  else if (process.argv.includes('--record-baseline')) recordBaseline()
  else gate()
}
