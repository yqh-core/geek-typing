/* V4.1-P0.6.1 · check-bundle —— 构建后体积门禁（npm run build 之后跑）。
 *
 * 门禁的产品原则：
 *   Package = manifest.json（永远轻、常驻、O(包数)） + words.json（按需加载）
 *   ⇒ 首屏体积不随词库增长
 * 实测（10 包基线）：把 lazy 的 kaoyan 改成 inline ⇒ 主 chunk raw 381.06 → 852.97 KiB
 * （+471.92 KiB）、gzip 118.89 → 285.30 KiB（+166.41 KiB），增量与 kaoyan words.json
 * 471.70 KiB 的比值 1:1.0005 —— inline 是全额直通车，所以必须有一条「构建后」的红线。
 *
 * 检查项：
 *   1. 主 chunk dist/assets/index-*.js：raw ≤ 420 KiB 且 gzip ≤ 135 KiB
 *   2. dist/assets/words-*.js chunk 数量 ≥ registry.ts 里 lazy 包的数量（独立 chunk 没被打回主包）
 *   3. 预热预算：warmUpVocabulary 列入的包，其 words chunk gzip 总和 ≤ 600 KiB
 *
 * 三态判定：PASS / FAIL / UNKNOWN。**UNKNOWN 视为不通过**（exit 1）——
 * 测不出来绝不等于通过；产物缺失、结构变化、探测不到归属都必须是 UNKNOWN/FAIL。
 *
 * 零依赖：只用 node:fs / node:path / node:zlib。
 * 用法：node scripts/check-bundle.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const ASSETS = path.join(DIST, 'assets')
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')
const REGISTRY_TS = path.join(ROOT, 'src', 'core', 'content', 'registry.ts')

/** 阈值（字节）。余量按 10 包基线留：主 chunk 10.2% / 12.0%，预热 17.2% */
const MAIN_RAW_MAX = 420 * 1024
const MAIN_GZIP_MAX = 135 * 1024
const WARM_GZIP_MAX = 600 * 1024

/** 归属探测用的「独有词」数量：越多越不容易误判，8 个足够压掉偶然命中 */
const PROBE_COUNT = 8
/** 低于这个数量的独有词不做判定（样本不足 ⇒ UNKNOWN） */
const PROBE_MIN = 3

const kib = (b) => (b / 1024).toFixed(2)
const pct = (used, max) => `${(((max - used) / max) * 100).toFixed(1)}%`

const results = []
const mark = { PASS: '✓ PASS  ', FAIL: '✗ FAIL  ', UNKNOWN: '? UNKNOWN' }
const record = (status, no, msg) => {
  results.push({ status, no })
  console.log(`  ${no}. ${mark[status]}${msg}`)
}

/* ---------------- registry.ts 文本解析（Node 不能 import TS） ---------------- */

/**
 * 解析注册表里每个包的 localId 与加载方式。
 * 注册对象形如：{ manifest: parseManifest(ieltsManifest), localId: 'ielts', load: loadIelts }
 * 注意：只看 import 段会被「已声明但未使用的 <id>Words 静态 import」误导，必须以对象块为准。
 */
function parseRegistryEntries(src) {
  const out = []
  const re = /\{[^{}]*localId:\s*['"`]([^'"`]+)['"`][^{}]*\}/g
  for (const m of src.matchAll(re)) {
    const block = m[0]
    const id = /localId:\s*['"`]([^'"`]+)['"`]/.exec(block)?.[1]
    const loader = /\bload:\s*([A-Za-z_$][\w$]*)/.exec(block)?.[1]
    const hasWords = /\bwords\s*:/.test(block)
    if (!id) continue
    out.push({ id, loader: loader ?? null, mode: loader ? 'lazy' : hasWords ? 'inline' : 'unknown' })
  }
  return out
}

/** 解析 warmUpVocabulary 里被预热的包：loadXxx() 调用 → 反查注册项。
 *  用 lastIndexOf 锚定到函数**定义**（registry.ts 里首个 warmUpVocabulary 命中是
 *  第 6 行注释，截不到 allSettled([...])，会误判成「无预热」⇒ UNKNOWN；函数定义才是真身）。 */
function parseWarmUpIds(src, entries) {
  const at = src.lastIndexOf('function warmUpVocabulary')
  if (at < 0) {
    // 兜底：直接找调用点 void warmUpVocabulary() / 任意 warmUpVocabulary(...)，从其后取 allSettled
    const callAt = src.indexOf('warmUpVocabulary(')
    if (callAt < 0) return null
  }
  const anchor = at >= 0 ? at : src.indexOf('warmUpVocabulary(')
  const body = src.slice(anchor, anchor + 600)
  const inner = /allSettled\(\[([\s\S]*?)\]\)/.exec(body)?.[1] ?? body
  const calls = new Set([...inner.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(\s*\)/g)].map((m) => m[1]))
  const ids = entries.filter((e) => e.loader && calls.has(e.loader)).map((e) => e.id)
  return ids.length > 0 ? ids : null
}

/* ---------------- 归属探测 ---------------- */

/**
 * 取「该包独有」的词作为探测词：出现在目标包、且不出现在任何其它包。
 * chunk hash 会随内容变化，所以**不能硬编码文件名**，只能用内容特征反查归属。
 * 只取纯字母且 ≥5 字符的词 —— chunk 里词表是以 JSON 转义后的字符串形式存在的，
 * 纯字母词才能与 chunk 文本字面量直接比对（带转义符的词会漏判/误判）。
 * 长词优先：越长越不可能是巧合命中。
 */
function distinctProbes(pkgId, setsById) {
  const mine = setsById.get(pkgId)
  if (!mine || mine.size === 0) return []
  const others = new Set()
  for (const [id, set] of setsById) {
    if (id === pkgId) continue
    for (const w of set) others.add(w)
  }
  const uniq = [...mine].filter((w) => !others.has(w) && /^[a-z]{5,}$/i.test(w))
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return uniq.slice(0, PROBE_COUNT)
}

const hitsAll = (text, probes) => probes.every((p) => text.includes(p))

function loadWordSets() {
  const dirs = readdirSync(VOCAB_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  const sets = new Map()
  for (const id of dirs) {
    const p = path.join(VOCAB_DIR, id, 'words.json')
    if (!existsSync(p)) { sets.set(id, new Set()); continue }
    let words
    try { words = JSON.parse(readFileSync(p, 'utf8')) } catch { sets.set(id, new Set()); continue }
    sets.set(id, new Set(words.map((w) => String(w?.word ?? '').toLowerCase()).filter(Boolean)))
  }
  return sets
}

/* ---------------- main ---------------- */

function main() {
  if (!existsSync(DIST)) {
    console.error('[check-bundle] dist 不存在：请先 npm run build（产物缺失本身就是问题，不假装通过）')
    process.exit(1)
  }
  if (!existsSync(ASSETS)) {
    console.error('[check-bundle] dist/assets 不存在：构建产物结构不符合预期，门禁拒绝放行')
    process.exit(1)
  }

  const files = readdirSync(ASSETS)
  console.log(`[check-bundle] dist/assets：${files.length} 个文件`)

  const mainChunks = files.filter((f) => /^index-.*\.js$/.test(f))
  const wordsChunks = files.filter((f) => /^words-.*\.js$/.test(f))

  const readText = (f) => readFileSync(path.join(ASSETS, f), 'utf8')
  const gzipOf = (f) => gzipSync(readFileSync(path.join(ASSETS, f)), { level: 9 }).length
  const rawOf = (f) => statSync(path.join(ASSETS, f)).size

  /* —— 1. 主 chunk 体积 —— */
  if (mainChunks.length === 0) {
    record('FAIL', 1, ` dist/assets 下找不到 index-*.js：构建产物结构变了，门禁需要更新（比静默放行安全）`)
  } else if (mainChunks.length > 1) {
    record('UNKNOWN', 1, ` 主 chunk 不唯一（${mainChunks.join(', ')}）：无法确定首屏口径`)
  } else {
    const f = mainChunks[0]
    const raw = rawOf(f)
    const gz = gzipOf(f)
    if (raw > MAIN_RAW_MAX || gz > MAIN_GZIP_MAX) {
      const why = [raw > MAIN_RAW_MAX ? `raw ${kib(raw)} KiB > ${MAIN_RAW_MAX / 1024} KiB` : null, gz > MAIN_GZIP_MAX ? `gzip ${kib(gz)} KiB > ${MAIN_GZIP_MAX / 1024} KiB` : null].filter(Boolean).join('；')
      record('FAIL', 1, ` 主 chunk ${f}：${kib(raw)} KiB raw / ${kib(gz)} KiB gzip —— ${why}（很可能有人把 lazy 包写成了 inline：inline 词 1:1 全额进主 chunk）`)
    } else {
      record('PASS', 1, ` 主 chunk ${f}：${kib(raw)} KiB raw / ${kib(gz)} KiB gzip ≤ ${MAIN_RAW_MAX / 1024}/${MAIN_GZIP_MAX / 1024} KiB（余量 ${pct(raw, MAIN_RAW_MAX)} / ${pct(gz, MAIN_GZIP_MAX)}）`)
    }
  }

  /* —— registry 解析（第 2/3 项共同前置） —— */
  let entries = null
  let warmIds = null
  if (!existsSync(REGISTRY_TS)) {
    console.error(`[check-bundle] registry.ts 不存在：${REGISTRY_TS}`)
  } else {
    const src = readText === null ? '' : readFileSync(REGISTRY_TS, 'utf8')
    entries = parseRegistryEntries(src)
    if (entries.length === 0) {
      console.error('[check-bundle] registry.ts 中解析不到任何注册项（结构变化？）')
      entries = null
    } else {
      warmIds = parseWarmUpIds(src, entries)
      if (warmIds === null) console.error('[check-bundle] 无法从 registry.ts 解析 warmUpVocabulary 的预热包列表')
    }
  }

  /* —— 2. words chunk 数量 ≥ lazy 包数量 —— */
  const lazyCount = entries ? entries.filter((e) => e.mode === 'lazy').length : null
  if (lazyCount === null) {
    record('UNKNOWN', 2, ` 无法确定 registry 中 lazy 包数量，无法校验 words-* chunk 数量（实测 ${wordsChunks.length} 个）`)
  } else if (wordsChunks.length < lazyCount) {
    record('FAIL', 2, ` words-* chunk ${wordsChunks.length} 个 < registry lazy 包 ${lazyCount} 个：有 lazy 包没产出独立 chunk（多半被写成 inline 并进了主 chunk）`)
  } else {
    record('PASS', 2, ` words-* chunk ${wordsChunks.length} 个 ≥ registry lazy 包 ${lazyCount} 个（${wordsChunks.join(', ')}）`)
  }

  /* —— 3. 预热预算 —— */
  if (warmIds === null) {
    record('UNKNOWN', 3, ` 无法确定 warmUpVocabulary 预热了哪些包 ⇒ 预热预算无法核算（不视为通过）`)
  } else {
    const setsById = loadWordSets()
    const mainText = mainChunks.length === 1 ? readText(mainChunks[0]) : ''
    const chunkTexts = new Map(wordsChunks.map((f) => [f, readText(f)]))

    const assigned = new Map() // pkgId → chunk
    const ownerOf = new Map() // chunk → pkgId
    const problems = []
    for (const id of warmIds) {
      const probes = distinctProbes(id, setsById)
      if (probes.length < PROBE_MIN) {
        problems.push(`UNKNOWN:${id} 只找到 ${probes.length} 个独有探测词（< ${PROBE_MIN}），无法判定归属`)
        continue
      }
      // inline 泄漏：lazy 包的词出现在主 chunk 里 —— 这正是本门禁要抓的回归
      if (mainText && hitsAll(mainText, probes)) {
        problems.push(`FAIL:${id} 的词出现在主 chunk 中（inline 泄漏）：该包应为 lazy 独立 chunk`)
        continue
      }
      const cands = wordsChunks.filter((f) => hitsAll(chunkTexts.get(f), probes))
      if (cands.length === 0) {
        problems.push(`UNKNOWN:${id} 探测不到所属 words chunk（样本 ${probes.length} 词：${probes.slice(0, 3).join('/')}）`)
      } else if (cands.length > 1) {
        problems.push(`UNKNOWN:${id} 同时命中 ${cands.length} 个 chunk（${cands.join(', ')}），归属歧义`)
      } else if (ownerOf.has(cands[0])) {
        problems.push(`UNKNOWN:chunk ${cands[0]} 同时被 ${ownerOf.get(cands[0])} 与 ${id} 命中，归属歧义`)
      } else {
        assigned.set(id, cands[0])
        ownerOf.set(cands[0], id)
      }
    }

    if (problems.length > 0) {
      const worst = problems.some((p) => p.startsWith('FAIL:')) ? 'FAIL' : 'UNKNOWN'
      record(worst, 3, ` 预热包 [${warmIds.join(', ')}] 归属/泄漏探测：${problems.join('；')}`)
    } else {
      const parts = [...assigned.entries()].map(([id, f]) => `${id}→${f}(${kib(gzipOf(f))} KiB)`)
      const sum = [...assigned.values()].reduce((a, f) => a + gzipOf(f), 0)
      if (sum > WARM_GZIP_MAX) {
        record('FAIL', 3, ` 预热 gzip 合计 ${kib(sum)} KiB > ${WARM_GZIP_MAX / 1024} KiB（${parts.join('，')}）`)
      } else {
        record('PASS', 3, ` 预热预算（${parts.join('，')}）：gzip 合计 ${kib(sum)} KiB ≤ ${WARM_GZIP_MAX / 1024} KiB（余量 ${pct(sum, WARM_GZIP_MAX)}）`)
      }
    }
  }

  const bad = results.filter((r) => r.status !== 'PASS')
  if (bad.length > 0) {
    console.error(`\n[check-bundle] ${bad.some((r) => r.status === 'FAIL') ? 'FAIL' : 'UNKNOWN'}：${bad.map((r) => `第 ${r.no} 项 ${r.status}`).join('；')}（UNKNOWN 视为不通过）`)
    process.exit(1)
  }
  console.log(`\n[check-bundle] PASS：${results.length} 项全部通过`)
}

main()
