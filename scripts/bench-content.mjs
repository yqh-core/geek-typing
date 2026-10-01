#!/usr/bin/env node
/* P1.7-Wave5 · D-1 Content 基准（bench-content）
 *
 * 测什么：Node 侧内容查询三件套的真实耗时分布 ——
 *   ① searchWords（跨包检索，UI 搜索框路径）
 *   ② queryWord（单条寻址，Word Detail / 打字面板路径）
 *   ③ index 构建（invalidateIndex() 全清后 ensureIndex() 全量重建）
 *
 * 为什么是 P50/P95 × ≥200 而不是单次采样：本机（Windows 11）装有 Esafenet 透明加密
 * 驱动，文件 IO 与进程调度耗时波动极大（docs/audit-package/12-infrastructure/
 * PERFORMANCE.md 已记录）；单次采样会把「加密驱动抖动」当成「代码回归」。
 * 分位数口径：样本升序排序后取第 ⌈q×n⌉ 个（1-based，n = 样本数）；
 *   P50 = 排序后第 ⌈0.5×n⌉ 个，P95 = 排序后第 ⌈0.95×n⌉ 个。
 *
 * 关键口径：searchWords / queryWord 内部会先 ensureIndex（content-query.ts 查询入口
 * 统一走索引），所以「查询」与「构建」必须分离 —— 测查询前先建好索引（不计入样本），
 * 测构建时每次 invalidateIndex() 全清后再 ensureIndex()，否则第二次起测不到构建成本。
 *
 * 加载方式：vite ssrLoadModule（与 tests/content-query.mjs 同源）—— Node 不能直接
 * import TS，且内容模块用了 `?raw` 导入，只有 vite 能解析。
 *
 * 产出：docs/_generated/perf-baseline.json 的 `content` 字段
 * （read-modify-write：只更新自己这一节，不碰 boot / bundle 字段）。
 * ⚠️ 与本仓库的 bench-boot.mjs 写的是**同一个文件、各自一个字段节**（boot → `boot`，
 * 本脚本 → `content`）。两边都是整份 read-modify-write：**必须串行跑**。
 * 并行跑 = 后写的那个把先写的那一节读回来后覆盖掉，静默丢一次采样。
 * 该文件是 gate-perf 预算门的输入，随仓库提交；CI 里只做「当前产物 vs 已提交基线」
 * 的比较，不在 CI 里重测。
 *
 * 用法：node scripts/bench-content.mjs   （不进 CI；本机抖动大，CI 数字不可信）
 */
import { createServer } from 'vite'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 与 bench-boot 同源约定：可变基线落在 INV-1 冻结区之外，避免 bench 把冻结区改脏。
const OUT = resolve(root, 'docs', '_generated', 'perf-baseline.json')

const SAMPLES = 200          // 每组采样次数（≥200，见文件头「为什么」）
const WARMUP = 5             // 预热次数（不计入样本：JIT + 模块缓存 + 文件页缓存）

const now = () => performance.now()

/** 升序排序后取第 ⌈q×n⌉ 个（1-based）。q∈(0,1] */
function percentile(sorted, q) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length))) - 1
  return sorted[idx]
}

const r3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000)

function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    samples: samples.length,
    unit: 'ms',
    p50: r3(percentile(sorted, 0.5)),
    p95: r3(percentile(sorted, 0.95)),
    min: r3(sorted[0]),
    max: r3(sorted[sorted.length - 1]),
  }
}

/* ---------------- 环境元数据 ---------------- */

function gitShort() {
  // Windows 上 spawn 不做 PATHEXT 解析，'git' 可能 ENOENT，故按平台显式给 'git.exe'
  const exe = process.platform === 'win32' ? 'git.exe' : 'git'
  try {
    // stdio 必须显式 ignore stdin：本机沙箱下默认 stdio 会让 spawnSync 以 EBUSY 失败
    // （与 scripts/gate-architecture.mjs runGate 记录的是同一问题）
    return execFileSync(exe, ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

function meta() {
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    commit: gitShort(),
    machine:
      'Windows 11 + Esafenet 透明加密驱动（IO 抖动大，单次采样不可信 → P50/P95 × ' + SAMPLES + '）；本地测量值仅供趋势对照，不作为 CI 判据',
  }
}

/* ---------------- 基准本体 ---------------- */

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })

const q = await server.ssrLoadModule('/src/core/content/query/content-query.ts')
const idx = await server.ssrLoadModule('/src/core/content/index/content-index.ts')

/** 固定一组真实查询词：cet4 包前 20 个词形（真实用户会搜的词，不用合成串） */
function pickQueryWords() {
  const raw = JSON.parse(readFileSync(resolve(root, 'content/vocabulary/cet4/words.json'), 'utf8'))
  const words = (Array.isArray(raw) ? raw : raw.words).map((w) => String(w?.word ?? '')).filter(Boolean)
  if (words.length < 20) throw new Error(`cet4 词形不足 20 个（${words.length}），基准设计前提被破坏`)
  return words.slice(0, 20)
}

const queryWords = pickQueryWords()
console.log(`[bench-content] 查询词（cet4 前 20）：${queryWords.slice(0, 5).join(', ')} ...`)

/* ① searchWords：跨包检索。先建全量索引（不计样本），否则首轮样本混入构建成本 */
await idx.ensureIndex()
const searchSamples = []
for (let i = 0; i < WARMUP; i++) await q.searchWords({ query: queryWords[i % queryWords.length], limit: 20 })
for (let i = 0; i < SAMPLES; i++) {
  const word = queryWords[i % queryWords.length]
  const t0 = now()
  await q.searchWords({ query: word, limit: 20 })
  searchSamples.push(now() - t0)
}
console.log(`[bench-content] searchWords × ${SAMPLES}：P50 ${r3(percentile([...searchSamples].sort((a, b) => a - b), 0.5))} ms`)

/* ② queryWord：单包单条寻址（cet4）。索引已建，测的是寻址成本本身 */
const queryWordSamples = []
for (let i = 0; i < WARMUP; i++) await q.queryWord('cet4', queryWords[i % queryWords.length])
for (let i = 0; i < SAMPLES; i++) {
  const word = queryWords[i % queryWords.length]
  const t0 = now()
  await q.queryWord('cet4', word)
  queryWordSamples.push(now() - t0)
}
console.log(`[bench-content] queryWord × ${SAMPLES}：P50 ${r3(percentile([...queryWordSamples].sort((a, b) => a - b), 0.5))} ms`)

/* ③ index 构建：每次全清再全量重建（10 包 / 全库词条），与查询基准严格分离 */
const buildSamples = []
for (let i = 0; i < WARMUP; i++) {
  idx.invalidateIndex()
  await idx.ensureIndex()
}
for (let i = 0; i < SAMPLES; i++) {
  idx.invalidateIndex()
  const t0 = now()
  await idx.ensureIndex()
  buildSamples.push(now() - t0)
}
const stats = idx.getIndexStats()
if (stats.entries === 0) throw new Error('索引重建后 entries=0，基准有效性不成立')
console.log(`[bench-content] index 构建 × ${SAMPLES}：P50 ${r3(percentile([...buildSamples].sort((a, b) => a - b), 0.5))} ms（entries=${stats.entries}）`)

await server.close()

/* ---------------- 写出（read-modify-write，只更新本节） ---------------- */

const result = {
  content: {
    searchWords: { ...summary(searchSamples), method: 'searchWords({query:<cet4 前 20 词循环>, limit:20})，索引预先建好' },
    queryWord: { ...summary(queryWordSamples), method: "queryWord('cet4', <cet4 前 20 词循环>)，索引预先建好" },
    indexBuild: {
      ...summary(buildSamples),
      method: `invalidateIndex() 全清 → ensureIndex() 全量重建（${stats.packages} 包 / ${stats.entries} 条）`,
    },
    queryWords: queryWords,
  },
  meta: meta(),
}

let doc = {}
if (existsSync(OUT)) {
  try { doc = JSON.parse(readFileSync(OUT, 'utf8')) } catch { doc = {} }
}
doc.content = result.content
doc.meta = result.meta
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(`[bench-content] 已写出 ${OUT}`)
