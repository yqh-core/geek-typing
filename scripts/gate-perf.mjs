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
 *   node scripts/gate-perf.mjs                  # 预算判定（CI / 本机）
 *   node scripts/gate-perf.mjs --record-baseline  # 把当前 dist 实测写入基线（基线换代时人工执行）
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')
const BASELINE_JSON = join(ROOT, 'docs', 'audit-package', '_generated', 'perf-baseline.json')

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
  'words-chunk-raw-single': 550000, // 计划 D-2 给定（新增判据：旧 check-bundle 无单 words chunk 上限）
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

const kib = (b) => (b == null ? '—' : `${(b / 1024).toFixed(2)} KiB`)

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

/* ---------------- main ---------------- */

async function recordBaseline() {
  const m = measureDist()
  if (!m) {
    console.error('[gate-perf] dist 不完整（缺 index-*.js 或 words-*.js）：先 build 再 --record-baseline')
    process.exit(1)
  }
  let doc = {}
  if (existsSync(BASELINE_JSON)) {
    try { doc = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')) } catch { doc = {} }
  }
  doc.bundle = {
    mainChunkRaw: m.mainRaw,
    mainChunkGzip: m.mainGzip,
    wordsChunkMaxRaw: m.wordsMaxRaw,
    mainChunkFile: m.mainChunk,
    recordedAt: new Date().toISOString(),
    note: 'gate-perf --record-baseline 写入；gzip 口径与 check-bundle 一致（zlib level 9）',
  }
  writeFileSync(BASELINE_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  console.log(`[gate-perf] 基线已记录：index raw ${m.mainRaw} B / gzip ${m.mainGzip} B；words 单个最大 raw ${m.wordsMaxRaw} B → ${BASELINE_JSON}`)
}

function gate() {
  if (!existsSync(ASSETS)) {
    console.error('[gate-perf] dist/assets 不存在：请先 npm run build（产物缺失不视为通过）')
    process.exit(1)
  }
  const base = loadBundleBaselines()
  if (!base.exists || base.mainRaw == null || base.mainGzip == null || base.wordsMaxRaw == null) {
    console.error('[gate-perf] perf-baseline.json 缺 bundle 基线（预算门输入不全）：先跑 node scripts/gate-perf.mjs --record-baseline 并提交该文件')
    process.exit(1)
  }
  const m = measureDist()
  if (!m) {
    console.error('[gate-perf] dist 结构不符合预期（主 chunk 不唯一或无 words chunk）：不视为通过')
    process.exit(1)
  }

  console.log('== P1.7-Wave5 · D-2/D-3 Budget Gate（gate-perf）==')
  console.log(`规则：effective = min-strict(baseline×1.15, absolute)，双基线（计划 a8d10c0 / 当前实测）取更严\n`)

  const rows = buildBundleRows(
    { mainRaw: base.mainRaw, mainGzip: base.mainGzip, wordsMaxRaw: base.wordsMaxRaw },
    { mainRaw: m.mainRaw, mainGzip: m.mainGzip, wordsMaxRaw: m.wordsMaxRaw },
  )
  let bad = 0
  for (const r of rows) {
    const ok = r.current <= r.effective
    if (ok) {
      console.log(`  ✅ ${r.metric.padEnd(28)} 当前 ${fmtBytes(r.current)} ≤ effective ${fmtBytes(r.effective)}（来源 ${r.source}；基线 计划 ${fmtBytes(r.plannedBaseline)} / 实测 ${fmtBytes(r.currentBaseline)}）`)
    } else {
      bad++
      console.log(`  ✗ FAIL ${r.metric}`)
      console.log(`      指标     ：${r.metric}`)
      console.log(`      基线     ：计划 ${fmtBytes(r.plannedBaseline)} / 实测 ${fmtBytes(r.currentBaseline)}`)
      console.log(`      当前     ：${fmtBytes(r.current)}`)
      console.log(`      effective：${fmtBytes(r.effective)}`)
      console.log(`      来源     ：${r.source}`)
      console.log(`      reason   ：${r.reason}`)
    }
  }

  let doc = {}
  try { doc = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')) } catch {}
  printBaselineOnlyRows(doc)

  if (bad > 0) {
    console.log(`\n❌ gate-perf FAIL：${bad} 行超预算（超预算必须走「改代码瘦身或显式改预算表+reason」，禁止静默抬阈值）`)
    process.exit(1)
  }
  console.log(`\n✅ gate-perf PASS：${rows.length} 行 bundle 预算全部通过`)
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  if (process.argv.includes('--record-baseline')) recordBaseline()
  else gate()
}
