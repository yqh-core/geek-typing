/* V4.1-P0.6.1 · check-bundle —— 构建后体积门禁（npm run build 之后跑）。
 *
 * 门禁的产品原则：
 *   Package = manifest.json（永远轻、常驻、O(包数)） + words.json（按需加载）
 *   ⇒ 首屏体积不随词库增长
 * 实测（10 包基线）：把 lazy 的 kaoyan 改成 inline ⇒ 主 chunk raw 381.06 → 852.97 KiB
 * （+471.92 KiB）、gzip 118.89 → 285.30 KiB（+166.41 KiB），增量与 kaoyan words.json
 * 471.70 KiB 的比值 1:1.0005 —— inline 是全额直通车，所以必须有一条「构建后」的红线。
 *
 * 阈值来源 = gate-perf 预算表（P1.7-Wave5 D-2，scripts/gate-perf.mjs，单一事实来源，
 * effective = min-strict(baseline×1.15, absolute)）；本文件的历史硬编码值
 * 430,080 B / 138,240 B 已废弃。WARM_GZIP_MAX 与懒加载数据 chunk（words/items）数判据保持不变。
 *
 * 检查项：
 *   1. 主 chunk dist/assets/index-*.js：raw 与 gzip ≤ gate-perf 预算表 effective
 *   2. dist/assets 懒加载数据 chunk（words-*.js / items-*.js，P1.7-Wave4 B-2 扩展）
 *      数量 ≥ registry.ts 里 lazy 包的数量（独立 chunk 没被打回主包）
 *   3. 预热预算：warmUpVocabulary 列入的包，其 words chunk gzip 总和 ≤ 600 KiB
 *   4. manifest runtime 投影有效性（P18-C）：
 *      J1 白名单/裁剪集自洽（静态；白名单 ∪ 裁剪集 == PackageManifest 字段集，
 *         二者不交叠，content 里出现的字段都被分类，src/ 无 manifest.json?raw 回退）
 *      J2 主 chunk 不得出现被裁字段的字面量（构建后）
 *      J3 防假绿对照组：主 chunk **必须**出现保留字段的字面量（否则 J2 在
 *         「manifest 压根没进主 chunk / 探测串写错」时会空转通过）
 *   5. lazy 包不得进主 chunk（补判据 2 的反向盲区：判据 2 只做正向计数，
 *      不查「声明 lazy 的包是否真没进主 chunk」）
 *
 * 三态判定：PASS / FAIL / UNKNOWN。**UNKNOWN 视为不通过**（exit 1）——
 * 测不出来绝不等于通过；产物缺失、结构变化、探测不到归属都必须是 UNKNOWN/FAIL。
 *
 * 退出码：0 = PASS / 1 = 判据不成立（含 UNKNOWN）/ 2 = 脚本自身错误（未知参数、缺 dist 等）。
 *
 * 依赖：node:fs / node:path / node:zlib；另用**进程内 TypeScript Compiler API**
 *   （gate-content-type-contract.mjs 同款，不开子进程 —— 本机预加载 safe-delete /
 *   brokered-fs shim，从 node 内 spawn 一律 EBUSY）读 `PackageManifest` 字段集。
 *
 * 用法：
 *   node scripts/check-bundle.mjs              # 默认：构建后体积门禁（需先 npm run build）
 *   node scripts/check-bundle.mjs --falsify    # 自带证伪自检（证明判据 4/5 各分支能判红）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'
import { computeEffective, loadBundleBaselines, PLANNED_BASELINE, ABSOLUTE_BUDGET } from './gate-perf.mjs'
import {
  RUNTIME_MANIFEST_FIELDS,
  DROPPED_MANIFEST_FIELDS,
  DROPPED_MANIFEST_PROBES,
} from './content/manifest-runtime.mjs'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const ASSETS = path.join(DIST, 'assets')
const CONTENT_DIR = path.join(ROOT, 'content')
const VOCAB_DIR = path.join(CONTENT_DIR, 'vocabulary')
const SRC_DIR = path.join(ROOT, 'src')
const REGISTRY_TS = path.join(SRC_DIR, 'core', 'content', 'registry.ts')
const SCHEMA_TS = path.join(SRC_DIR, 'core', 'content', 'schema.ts')

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分 */
class Fatal extends Error {}

const USAGE = `用法：
  node scripts/check-bundle.mjs              # 构建后体积门禁（需先 npm run build）
  node scripts/check-bundle.mjs --falsify    # 自带证伪自检（证明判据 4/5 各分支能判红）`

/** 预热阈值（字节）。预热预算不在 gate-perf 预算表管辖内，保留本文件常量 */
const WARM_GZIP_MAX = 600 * 1024

/** 主 chunk 阈值从 gate-perf 预算表读取（双基线取更严；输入缺失返回 null 由调用方判 UNKNOWN） */
function mainChunkBudgets() {
  const base = loadBundleBaselines()
  const raw = computeEffective(PLANNED_BASELINE['main-chunk-raw'], base.mainRaw, ABSOLUTE_BUDGET['main-chunk-raw'])
  const gzip = computeEffective(PLANNED_BASELINE['main-chunk-gzip'], base.mainGzip, ABSOLUTE_BUDGET['main-chunk-gzip'])
  return { rawMax: raw.effective, gzipMax: gzip.effective, source: { raw: raw.source, gzip: gzip.source } }
}

/** 归属探测用的「独有词」数量：越多越不容易误判，8 个足够压掉偶然命中 */
const PROBE_COUNT = 8
/** 低于这个数量的独有词不做判定（样本不足 ⇒ UNKNOWN） */
const PROBE_MIN = 3

/**
 * J3 防假绿对照组用的「保留字段」键名探测串。
 * ⚠️ 必须是**裸键名 + 冒号**形态（`stats:`），不是 `"stats"` —— 见 manifest-runtime.mjs
 *    中 DROPPED_MANIFEST_PROBES 的说明：rolldown 压缩后标识符安全的键名去引号，带引号形态
 *    在投影正确时**恒为 0**，照抄会让 J3 恒假。
 * 实测主 chunk（dist/assets/index-*.js）：stats: 22 / description: 20 / contentChecksum: 20 /
 * features: 19 / offline: 19。只要 ≥ RETAINED_PROBE_MIN 个命中，就证明「探测串形态正确 +
 * manifest 确实进了主 chunk」—— 这正是 J2「某物不存在」断言的对照组。
 */
const RETAINED_MANIFEST_PROBES = ['stats:', 'description:', 'contentChecksum:', 'features:', 'offline:']
const RETAINED_PROBE_MIN = 4

const kib = (b) => (b / 1024).toFixed(2)
const pct = (used, max) => `${(((max - used) / max) * 100).toFixed(1)}%`

const results = []
const mark = { PASS: '✓ PASS  ', FAIL: '✗ FAIL  ', UNKNOWN: '? UNKNOWN' }
const record = (status, no, msg) => {
  results.push({ status, no })
  console.log(`  ${no}. ${mark[status]}${msg}`)
}

/** PASS < UNKNOWN < FAIL：取最坏者作为复合判据的状态 */
const RANK = { PASS: 0, UNKNOWN: 1, FAIL: 2 }
const worstStatus = (list) => list.reduce((a, s) => (RANK[s] > RANK[a] ? s : a), 'PASS')

const countOccurrences = (haystack, needle) => {
  if (!needle) return 0
  let n = 0
  for (let i = 0; ; ) {
    const j = haystack.indexOf(needle, i)
    if (j < 0) return n
    n++
    i = j + needle.length
  }
}
/** 首次命中前后各 60 字符（压平空白），供人定位 */
const firstHitContext = (text, needle) => {
  const i = text.indexOf(needle)
  if (i < 0) return ''
  const s = Math.max(0, i - 60)
  const e = Math.min(text.length, i + needle.length + 60)
  return text.slice(s, e).replace(/\s+/g, ' ')
}
/** 文件是否存在（用 statSync 求真值 —— existsSync 会被 brokered-fs shim 缓存误导） */
const isFile = (p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/* ---------------- registry.ts 文本解析（Node 不能 import TS） ---------------- */

/**
 * 解析注册表里每个包的 localId 与加载方式。
 * 注册对象形如：{ manifest: parseManifest(ieltsManifest), localId: 'ielts', load: loadIelts }
 * 非 vocabulary 包（P1.7-Wave4 B-2）形如：{ ..., localId: 'demo-listening-01', loadData: loadListeningDemo }
 * 注意：只看 import 段会被「已声明但未使用的 <id>Words 静态 import」误导，必须以对象块为准。
 */
function parseRegistryEntries(src) {
  const out = []
  const re = /\{[^{}]*localId:\s*['"`]([^'"`]+)['"`][^{}]*\}/g
  for (const m of src.matchAll(re)) {
    const block = m[0]
    const id = /localId:\s*['"`]([^'"`]+)['"`]/.exec(block)?.[1]
    const loader = /\bload(?:Data)?:\s*([A-Za-z_$][\w$]*)/.exec(block)?.[1]
    const hasWords = /\b(?:words|data)\s*:/.test(block)
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

/* ---------------- 判据 5 用的非 vocabulary 探测串提取 ---------------- */

/** 在 content/<type>/<localId>/ 下找 items.json（用 statSync 求真值，不用 existsSync）。 */
function findItemsJson(localId) {
  let types
  try { types = readdirSync(CONTENT_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return null }
  for (const t of types) {
    const p = path.join(CONTENT_DIR, t, localId, 'items.json')
    if (isFile(p)) return p
  }
  return null
}

/**
 * 从 items.json 里取「该包独有」的 ASCII 串作探测串（长串优先，最多 PROBE_COUNT 个）。
 *
 * 为什么不学 vocabulary 用「单个词」：非 vocabulary 条目的标题是**自然语言短语**
 * （如 "Short conversation: booking a table"），拆成单词后大量与 App 自身 UI 文案重叠
 * （实测 number / environment / writing / definition / table 等均在主 chunk 出现）⇒ 单词探测会误判泄漏。
 * 整条短语（含空格/冒号）则是该包独有的内容特征：若该包被 inline，短语会整条出现在主 chunk。
 * 唯一性以「不出现在其它任何 lazy 包的载荷文本里」为准（跨包去重，避免同型短语互相干扰）。
 */
function asciiPhraseProbes(json, otherPayloadTexts) {
  const cands = new Set()
  const walk = (v) => {
    if (typeof v === 'string') {
      if (/^[\x20-\x7e]{5,}$/.test(v)) cands.add(v)
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk)
    }
  }
  walk(json)
  const uniq = [...cands].filter((s) => !otherPayloadTexts.some((t) => t.includes(s)))
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return uniq.slice(0, PROBE_COUNT)
}

/**
 * 构造判据 5 的逐包探测集。
 * vocabulary lazy 包 → words.json 的独有词（复用 distinctProbes）；
 * 非 vocabulary lazy 包 → items.json 的独有 ASCII 短语（asciiPhraseProbes）。
 */
function collectLazyProbes(entries, setsById) {
  const lazy = entries.filter((e) => e.mode === 'lazy')
  const texts = new Map()
  const kindOf = new Map()
  for (const e of lazy) {
    if (setsById.has(e.id)) {
      kindOf.set(e.id, 'vocabulary/load')
      const p = path.join(VOCAB_DIR, e.id, 'words.json')
      try { texts.set(e.id, readFileSync(p, 'utf8')) } catch { texts.set(e.id, '') }
    } else {
      kindOf.set(e.id, 'items/loadData')
      const p = findItemsJson(e.id)
      try { texts.set(e.id, p ? readFileSync(p, 'utf8') : '') } catch { texts.set(e.id, '') }
    }
  }
  return lazy.map((e) => {
    let probes
    if (kindOf.get(e.id) === 'vocabulary/load') {
      probes = distinctProbes(e.id, setsById)
    } else {
      const txt = texts.get(e.id) ?? ''
      let json = null
      try { json = JSON.parse(txt) } catch { json = null }
      const others = [...texts].filter(([k]) => k !== e.id).map(([, v]) => v)
      probes = json ? asciiPhraseProbes(json, others) : []
    }
    return { id: e.id, kind: kindOf.get(e.id), probes }
  })
}

/* ---------------- 判据 4 / 5 的纯检查函数（可被 --falsify 直接驱动） ---------------- */

/** 递归收集 content/**\/manifest.json 的键并集；任一文件读/解析失败 ⇒ 抛错（调用方判 UNKNOWN） */
function contentManifestKeyUnion() {
  const keys = new Set()
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (e.name !== 'manifest.json') continue
      const o = JSON.parse(readFileSync(p, 'utf8'))
      if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) keys.add(k)
    }
  }
  walk(CONTENT_DIR)
  return keys
}

/** 用进程内 TS Compiler API 读 `PackageManifest` 的字段集；不可用 ⇒ null（调用方判 UNKNOWN） */
function loadPackageManifestFields() {
  try {
    const program = ts.createProgram([SCHEMA_TS], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
      noEmit: true,
    })
    const checker = program.getTypeChecker()
    const sf = program.getSourceFile(SCHEMA_TS)
    if (!sf) return null
    let keys = null
    sf.forEachChild((n) => {
      if (ts.isInterfaceDeclaration(n) && n.name.text === 'PackageManifest') {
        keys = checker.getTypeAtLocation(n.name).getProperties().map((s) => s.getName())
      }
    })
    return keys ? new Set(keys) : null
  } catch {
    return null
  }
}

/** 扫 src/**\/*.ts|tsx 里的 `manifest.json?raw` 回退导入；返回 ['rel:line', ...]；src 扫不到任何文件 ⇒ null */
function scanSrcManifestRaw() {
  const hits = []
  let scanned = 0
  const walk = (dir) => {
    let ents
    try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(e.name)) continue
      scanned++
      let text
      try { text = readFileSync(p, 'utf8') } catch { continue }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('manifest.json?raw')) hits.push(`${path.relative(ROOT, p).split(path.sep).join('/')}:${i + 1}`)
      }
    }
  }
  walk(SRC_DIR)
  return scanned === 0 ? null : hits
}

/**
 * J1 —— 静态自洽（不需要 dist）。全部为确定性事实，命中即 FAIL；测不出来记 UNKNOWN。
 *   1. RUNTIME ∩ DROPPED 为空
 *   2. RUNTIME ∪ DROPPED == PackageManifest 字段集（防白名单写错字段名 / schema 新增字段被漏分类）
 *   3. content/**\/manifest.json 的键并集 ⊆ RUNTIME ∪ DROPPED（内容里出现的字段都被分类）
 *   4. src/ 下不存在 `manifest.json?raw`（防投影被撤销回退）
 */
function checkJ1(inp) {
  const hard = []
  const unknown = []

  const runtime = new Set(inp.runtimeFields)
  const dropped = new Set(inp.droppedFields)
  const union = new Set([...runtime, ...dropped])

  const inter = [...runtime].filter((f) => dropped.has(f))
  if (inter.length) hard.push(`RUNTIME ∩ DROPPED 非空（同一字段既保留又裁剪）：${inter.join(', ')}`)

  if (inp.schemaFields && inp.schemaFields.size > 0) {
    const extra = [...union].filter((f) => !inp.schemaFields.has(f))
    const missing = [...inp.schemaFields].filter((f) => !union.has(f))
    if (extra.length) hard.push(`白名单多出（不在 PackageManifest 字段集，疑似写错字段名）：${extra.join(', ')}`)
    if (missing.length) hard.push(`漏掉（PackageManifest 有但白名单未分类，schema 新增字段会被静默裁掉）：${missing.join(', ')}`)
  } else {
    unknown.push('无法从 src/core/content/schema.ts 解析 PackageManifest 字段集')
  }

  if (inp.contentKeys) {
    const orphan = [...inp.contentKeys].filter((k) => !union.has(k))
    if (orphan.length) hard.push(`content/**/manifest.json 出现但白名单未覆盖：${orphan.join(', ')}`)
  } else {
    unknown.push('无法收集 content/**/manifest.json 的键并集')
  }

  if (inp.srcRawHits === null) {
    unknown.push('无法扫描 src/ 下的 manifest.json?raw（src 目录不可读？）')
  } else if (inp.srcRawHits.length) {
    hard.push(`src/ 下仍有 manifest.json?raw 导入（投影被撤销的回退）：${inp.srcRawHits.join(', ')}`)
  }

  const detail = `白名单 ${runtime.size} 字段 ∪ 裁剪 ${dropped.size} 字段 = ${union.size}；PackageManifest ${
    inp.schemaFields ? inp.schemaFields.size : '?'
  } 字段；content 并集 ${inp.contentKeys ? inp.contentKeys.size : '?'} 字段`
  if (hard.length) return { status: 'FAIL', msg: `${detail} —— ${hard.join('；')}` }
  if (unknown.length) return { status: 'UNKNOWN', msg: `${detail} —— ${unknown.join('；')}（不视为通过）` }
  return { status: 'PASS', msg: `${detail}；src/ 无 manifest.json?raw 回退` }
}

/** J2 —— 构建后：被裁字段的探测串在主 chunk 命中数必须为 0（任一 > 0 即 FAIL） */
function checkJ2(mainText, probesByField) {
  if (mainText == null) return { status: 'UNKNOWN', msg: '主 chunk 不可用（未唯一确定 index-*.js），无法判定被裁字段是否泄漏' }
  const hits = []
  let total = 0
  for (const [field, probes] of Object.entries(probesByField)) {
    for (const p of probes) {
      total++
      const n = countOccurrences(mainText, p)
      if (n > 0) hits.push(`${field} 探测串 ${JSON.stringify(p)} 命中 ${n} 次（上下文 …${firstHitContext(mainText, p)}…）`)
    }
  }
  if (hits.length) return { status: 'FAIL', msg: `${hits.join('；')} —— 被裁字段不该出现在主 chunk（投影失效或字段被写回白名单）` }
  return { status: 'PASS', msg: `被裁字段 [${Object.keys(probesByField).join(', ')}] 的 ${total} 个探测串在主 chunk 命中 0 次` }
}

/** J3 —— 防假绿对照组：保留字段探测串必须在主 chunk 命中 ≥ min 个（否则 J2 是空断言） */
function checkJ3(mainText, probes, min) {
  if (mainText == null) return { status: 'UNKNOWN', msg: '主 chunk 不可用，无法跑对照组' }
  const detail = probes.map((p) => `${JSON.stringify(p)}=${countOccurrences(mainText, p)}`).join(', ')
  const present = probes.filter((p) => mainText.includes(p)).length
  if (present < min) {
    return {
      status: 'FAIL',
      msg: `保留字段探测串仅 ${present}/${probes.length} 命中（要求 ≥${min}）：${detail} —— 探测本身无效：manifest 可能没进主 chunk，或探测串形态写得不对（J2 的"不存在"断言会因此空转）`,
    }
  }
  return { status: 'PASS', msg: `保留字段探测串 ${present}/${probes.length} 命中（≥${min}，对照组有效）：${detail}` }
}

/**
 * 判据 5 —— 声明 lazy 的包不得进主 chunk（补判据 2 的反向盲区）。
 *   逐包：命中数 == 探测数 ⇒ FAIL（inline 泄漏）；0 < 命中数 < 探测数 ⇒ UNKNOWN（归属歧义，不假装通过）；
 *         探测数 < PROBE_MIN ⇒ UNKNOWN（样本不足）；全不命中 ⇒ PASS。
 */
function checkLazyLeak(mainText, perPkg) {
  if (mainText == null) return { status: 'UNKNOWN', msg: '主 chunk 不可用，无法判定 lazy 包是否泄漏', lines: [] }
  if (!perPkg || perPkg.length === 0) return { status: 'UNKNOWN', msg: '无法解析 registry.ts 的 lazy 包清单（结构变化？）', lines: [] }
  const fails = []
  const unknowns = []
  const lines = []
  for (const { id, kind, probes } of perPkg) {
    if (!probes || probes.length < PROBE_MIN) {
      unknowns.push(`${id} 只找到 ${probes ? probes.length : 0} 个独有探测串（< ${PROBE_MIN}）`)
      lines.push(`      · ${id} (${kind}) probes=${probes ? probes.length : 0} → ? UNKNOWN（样本不足）`)
      continue
    }
    const hit = probes.filter((p) => mainText.includes(p))
    if (hit.length === probes.length) {
      fails.push(`${id} 的 ${probes.length} 个探测串**全部**命中主 chunk（声明 lazy 却被 inline）`)
      lines.push(`      · ${id} (${kind}) probes=${probes.length} 命中 ${hit.length} → ✗ FAIL（全部命中主 chunk）`)
    } else if (hit.length > 0) {
      unknowns.push(`${id} 部分命中 ${hit.length}/${probes.length}：${JSON.stringify(hit.slice(0, 3))}`)
      lines.push(`      · ${id} (${kind}) probes=${probes.length} 命中 ${hit.length} → ? UNKNOWN（部分命中，归属歧义）`)
    } else {
      lines.push(`      · ${id} (${kind}) probes=${probes.length} → ✓ 未进主 chunk`)
    }
  }
  const status = fails.length ? 'FAIL' : unknowns.length ? 'UNKNOWN' : 'PASS'
  const msg = fails.length
    ? `${fails.join('；')}`
    : unknowns.length
      ? `${unknowns.join('；')}（不视为通过）`
      : `registry 全部 ${perPkg.length} 个 lazy 包的探测串在主 chunk 命中 0 次`
  return { status, msg, lines }
}

/* ---------------- 输入收集 + 纯检查编排（默认模式与 --falsify 共用） ---------------- */

/**
 * 收集 J1/J2/J3/判据 5 所需的**纯输入**。
 * 缺 dist / 缺 registry 时相应输入为 null，由各判据自行判 UNKNOWN（绝不静默通过）。
 */
function collectInputs() {
  let mainText = null
  if (existsSync(ASSETS)) {
    const files = readdirSync(ASSETS)
    const mainChunks = files.filter((f) => /^index-.*\.js$/.test(f))
    if (mainChunks.length === 1) mainText = readFileSync(path.join(ASSETS, mainChunks[0]), 'utf8')
  }

  let contentKeys = null
  try { contentKeys = contentManifestKeyUnion() } catch { contentKeys = null }

  let entries = null
  try {
    const src = readFileSync(REGISTRY_TS, 'utf8')
    entries = parseRegistryEntries(src)
    if (!entries || entries.length === 0) entries = null
  } catch { entries = null }

  const setsById = loadWordSets()

  return {
    runtimeFields: [...RUNTIME_MANIFEST_FIELDS],
    droppedFields: [...DROPPED_MANIFEST_FIELDS],
    schemaFields: loadPackageManifestFields(),
    contentKeys,
    srcRawHits: scanSrcManifestRaw(),
    mainText,
    droppedProbes: DROPPED_MANIFEST_PROBES,
    retainedProbes: RETAINED_MANIFEST_PROBES,
    lazyProbes: entries ? collectLazyProbes(entries, setsById) : [],
  }
}

/** 跑判据 4（J1/J2/J3）与判据 5，返回四个分支结果（供默认模式打印 / --falsify 断言） */
function runPureChecks(inp) {
  return {
    j1: checkJ1(inp),
    j2: checkJ2(inp.mainText, inp.droppedProbes),
    j3: checkJ3(inp.mainText, inp.retainedProbes, RETAINED_PROBE_MIN),
    lazy: checkLazyLeak(inp.mainText, inp.lazyProbes),
  }
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
  const itemsChunks = files.filter((f) => /^items-.*\.js$/.test(f))

  const readText = (f) => readFileSync(path.join(ASSETS, f), 'utf8')
  const gzipOf = (f) => gzipSync(readFileSync(path.join(ASSETS, f)), { level: 9 }).length
  const rawOf = (f) => statSync(path.join(ASSETS, f)).size

  /* —— 1. 主 chunk 体积（阈值来自 gate-perf 预算表） —— */
  const budget = mainChunkBudgets()
  if (budget.rawMax == null || budget.gzipMax == null) {
    record('UNKNOWN', 1, ` 无法确定主 chunk 预算（perf-baseline.json 缺 bundle 基线）：先跑 node scripts/gate-perf.mjs --record-baseline 并提交该文件`)
  } else if (mainChunks.length === 0) {
    record('FAIL', 1, ` dist/assets 下找不到 index-*.js：构建产物结构变了，门禁需要更新（比静默放行安全）`)
  } else if (mainChunks.length > 1) {
    record('UNKNOWN', 1, ` 主 chunk 不唯一（${mainChunks.join(', ')}）：无法确定首屏口径`)
  } else {
    const f = mainChunks[0]
    const raw = rawOf(f)
    const gz = gzipOf(f)
    const MAIN_RAW_MAX = budget.rawMax
    const MAIN_GZIP_MAX = budget.gzipMax
    if (raw > MAIN_RAW_MAX || gz > MAIN_GZIP_MAX) {
      const why = [raw > MAIN_RAW_MAX ? `raw ${kib(raw)} KiB > ${kib(MAIN_RAW_MAX)} KiB` : null, gz > MAIN_GZIP_MAX ? `gzip ${kib(gz)} KiB > ${kib(MAIN_GZIP_MAX)} KiB` : null].filter(Boolean).join('；')
      record('FAIL', 1, ` 主 chunk ${f}：${kib(raw)} KiB raw / ${kib(gz)} KiB gzip —— ${why}（很可能有人把 lazy 包写成了 inline：inline 词 1:1 全额进主 chunk）`)
    } else {
      record('PASS', 1, ` 主 chunk ${f}：${kib(raw)} KiB raw / ${kib(gz)} KiB gzip ≤ ${kib(MAIN_RAW_MAX)}/${kib(MAIN_GZIP_MAX)} KiB（余量 ${pct(raw, MAIN_RAW_MAX)} / ${pct(gz, MAIN_GZIP_MAX)}；来源 ${budget.source.raw} / ${budget.source.gzip}）`)
    }
  }

  /* —— registry 解析（第 2/3 项共同前置） —— */
  let entries = null
  let warmIds = null
  if (!existsSync(REGISTRY_TS)) {
    console.error(`[check-bundle] registry.ts 不存在：${REGISTRY_TS}`)
  } else {
    const src = readFileSync(REGISTRY_TS, 'utf8')
    entries = parseRegistryEntries(src)
    if (entries.length === 0) {
      console.error('[check-bundle] registry.ts 中解析不到任何注册项（结构变化？）')
      entries = null
    } else {
      warmIds = parseWarmUpIds(src, entries)
      if (warmIds === null) console.error('[check-bundle] 无法从 registry.ts 解析 warmUpVocabulary 的预热包列表')
    }
  }

  /* —— 2. 懒加载数据 chunk（words-* / items-*，P1.7-Wave4 B-2 扩展）数量 ≥ lazy 包数量 —— */
  const lazyCount = entries ? entries.filter((e) => e.mode === 'lazy').length : null
  const dataChunks = wordsChunks.length + itemsChunks.length
  if (lazyCount === null) {
    record('UNKNOWN', 2, ` 无法确定 registry 中 lazy 包数量，无法校验数据 chunk 数量（实测 ${dataChunks} 个：words ${wordsChunks.length} + items ${itemsChunks.length}）`)
  } else if (dataChunks < lazyCount) {
    record('FAIL', 2, ` 数据 chunk ${dataChunks} 个（words ${wordsChunks.length} + items ${itemsChunks.length}）< registry lazy 包 ${lazyCount} 个：有 lazy 包没产出独立 chunk（多半被写成 inline 并进了主 chunk）`)
  } else {
    record('PASS', 2, ` 数据 chunk ${dataChunks} 个（words ${wordsChunks.length} + items ${itemsChunks.length}）≥ registry lazy 包 ${lazyCount} 个`)
  }

  /* —— 3. 预热预算 —— */
  const setsById = loadWordSets()
  if (warmIds === null) {
    record('UNKNOWN', 3, ` 无法确定 warmUpVocabulary 预热了哪些包 ⇒ 预热预算无法核算（不视为通过）`)
  } else {
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

  /* —— 4. manifest runtime 投影有效性（J1 静态 / J2 构建后 / J3 防假绿对照组） —— */
  const inp = collectInputs()
  const { j1, j2, j3, lazy: lazyLeak } = runPureChecks(inp)
  record(worstStatus([j1.status, j2.status, j3.status]), 4, ` manifest runtime 投影（J1 ${j1.status} / J2 ${j2.status} / J3 ${j3.status}）`)
  console.log(`        J1 ${mark[j1.status]} ${j1.msg}`)
  console.log(`        J2 ${mark[j2.status]} ${j2.msg}`)
  console.log(`        J3 ${mark[j3.status]} ${j3.msg}`)

  /* —— 5. lazy 包不得进主 chunk（补判据 2 的反向盲区） —— */
  record(lazyLeak.status, 5, ` lazy 语义（registry 声明 lazy 的包不得 inline 进主 chunk）：${lazyLeak.msg}`)
  for (const l of lazyLeak.lines ?? []) console.log(l)

  const bad = results.filter((r) => r.status !== 'PASS')
  if (bad.length > 0) {
    console.error(`\n[check-bundle] ${bad.some((r) => r.status === 'FAIL') ? 'FAIL' : 'UNKNOWN'}：${bad.map((r) => `第 ${r.no} 项 ${r.status}`).join('；')}（UNKNOWN 视为不通过）`)
    process.exit(1)
  }
  console.log(`\n[check-bundle] PASS：${results.length} 项全部通过`)
}

/* ---------------- 参数 ---------------- */

/** 解析 CLI 参数。未知参数一律 Fatal（危险脚本不得带静默默认值 —— evidence-run 事故教训）。 */
function parseArgs(argv) {
  const args = argv.slice(2)
  let falsify = false
  for (const a of args) {
    if (a === '--falsify') { falsify = true; continue }
    throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 本门不接受未知 flag，也不猜测其语义`)
  }
  return { falsify }
}

/* ---------------- 证伪自检 ----------------
 * 证明判据 4（J1/J2/J3）与判据 5 **各自都能判红**：
 *   每条用例注入一个针对性故障 → 断言「对应分支恰好 FAIL，其余分支状态不变」→ 整门聚合必须非 PASS。
 * 两组基线对照：不加任何故障时四个分支必须全 PASS（证明这套断言不是恒红的）。
 * ------------------------------------------------------------------ */

const BRANCHES = ['j1', 'j2', 'j3', 'lazy']

const FALSIFY_CASES = [
  {
    letter: 'J1',
    name: 'RUNTIME_MANIFEST_FIELDS 多一个不存在的字段（__NO_SUCH_FIELD__）',
    why: '白名单写了 schema 里没有的字段名 ⇒ J1 判红（其余分支不受影响）',
    target: 'j1',
    mutate: (inp) => ({ runtimeFields: [...inp.runtimeFields, '__NO_SUCH_FIELD__'] }),
  },
  {
    letter: 'J1b',
    name: 'src/ 下存在 manifest.json?raw 导入（J1 防回退子判据）',
    why: '证明「有人把 ?runtime 改回 ?raw」这条回退会被 J1 抓到（该子判据不是摆设）',
    target: 'j1',
    mutate: () => ({ srcRawHits: ['src/core/content/registry.ts:41'] }),
  },
  {
    letter: 'J2',
    name: '把被裁字段的探测串换成必然存在的保留字段串（stats:）',
    why: '证明 J2 不是恒假的：探测串若真能命中主 chunk，J2 必须判红',
    target: 'j2',
    mutate: () => ({ droppedProbes: { sources: ['stats:'] } }),
  },
  {
    letter: 'J2b',
    name: '把 ?raw 形态的 manifest JSON 塞进主 chunk（模拟投影被撤销退回 ?raw）',
    why: '证明 DROPPED_MANIFEST_PROBES 的**带引号**形态确实能抓「退回 ?raw」—— 只写裸键名形态会漏掉这条真实回归',
    target: 'j2',
    mutate: (inp) => {
      const raw =
        'var raw=`[{"id":"x","sources":[],"contentHistory":[],"build":{"toolVersion":"content-build/1.1","builtAt":"2026-09-28T00:00:00.000Z","sourceChecksum":"sha256:00"}}]`;'
      return { mainText: `${inp.mainText}\n${raw}\n` }
    },
  },
  {
    letter: 'J3',
    name: '把保留字段探测串换成必然不存在的串（__NO_SUCH_FIELD__:）',
    why: '证明 J3 不是恒真的：探测本身无效（manifest 没进主 chunk / 串写错）时必须判红',
    target: 'j3',
    mutate: () => ({ retainedProbes: ['__NO_SUCH_FIELD__:'] }),
  },
  {
    letter: 'L5',
    name: '把某个 lazy 包的全部探测串塞进主 chunk 文本',
    why: '模拟「声明 lazy 却被 inline 进主 chunk」⇒ 判据 5 必须判红',
    target: 'lazy',
    mutate: (inp) => {
      const subject = inp.lazyProbes.find((p) => p.probes.length >= PROBE_MIN)
      if (!subject) throw new Fatal('证伪用例 L5 找不到可用样本（lazy 探测串为空）')
      return { mainText: `${inp.mainText}\n/* ${subject.probes.join(' | ')} */\n` }
    },
  },
]

function falsify() {
  if (!existsSync(ASSETS)) {
    throw new Fatal('--falsify 需要构建产物（J2/J3/判据 5 依赖主 chunk 文本）：请先 npm run build')
  }
  const inp = collectInputs()
  const base = runPureChecks(inp)

  console.log('[check-bundle] --falsify 自带证伪自检（不会失败的门等于没有门）')
  console.log(`  用例 ${FALSIFY_CASES.length} 条；每条：注入故障 → 断言「目标分支恰好 FAIL，其余分支状态不变」→ 整门必须非 PASS`)
  console.log('')

  let bad = 0
  const lines = []

  /* —— 对照组：不加故障时四分支必须全 PASS（否则后面「恰好判红」没有意义） —— */
  const baseNotPass = BRANCHES.filter((b) => base[b].status !== 'PASS')
  if (baseNotPass.length) {
    bad++
    lines.push(`  ✗ CTRL 基线对照未全绿：${baseNotPass.map((b) => `${b}=${base[b].status}`).join(', ')} —— 应先在干净树上跑通 npm run build && npm run check:bundle`)
  } else {
    lines.push('  ✓ CTRL 基线对照：四分支 J1/J2/J3/lazy 全 PASS（断言非恒红）')
  }

  for (const c of FALSIFY_CASES) {
    let res
    let err = null
    try {
      res = runPureChecks({ ...inp, ...c.mutate(inp) })
    } catch (e) {
      err = e
    }
    if (err) {
      bad++
      lines.push(`  ✗ ${c.letter} 注入失败：${err.message}`)
      continue
    }

    const targetOk = res[c.target].status === 'FAIL'
    const othersUnchanged = BRANCHES.filter((b) => b !== c.target).every((b) => res[b].status === base[b].status)
    const failedSet = BRANCHES.filter((b) => res[b].status === 'FAIL')
    const exact = failedSet.length === 1 && failedSet[0] === c.target
    const exitCode = BRANCHES.some((b) => res[b].status !== 'PASS') ? 1 : 0

    if (targetOk && othersUnchanged && exact && exitCode !== 0) {
      lines.push(`  ✓ ${c.letter} 目标分支 ${c.target} 恰好判红（命中集 {${failedSet.join(',')}}），其余分支状态不变，整门 exit=${exitCode}`)
      lines.push(`      ${c.name}`)
      lines.push(`      ${res[c.target].msg}`)
    } else {
      bad++
      lines.push(
        `  ✗ ${c.letter} 未达预期：target=${c.target} status=${res[c.target].status}（应为 FAIL）；` +
          `命中集 {${failedSet.join(',') || '∅'}}（应恰为 {${c.target}}）；其余分支${othersUnchanged ? '不变' : '被越界影响'}；exit=${exitCode}（应非 0）`,
      )
    }
  }

  for (const l of lines) console.log(l)
  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(`✓ falsify: ${FALSIFY_CASES.length}/${FALSIFY_CASES.length} 恰好判红（含 1 条全 PASS 基线对照）`)
    process.exit(0)
  }
  console.error(`✗ falsify: FAIL —— ${bad} 项问题（存在恒真/恒红判据或越界误伤 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ---------------- 入口 ---------------- */

try {
  const { falsify: wantFalsify } = parseArgs(process.argv)
  if (wantFalsify) falsify()
  else main()
} catch (e) {
  if (e instanceof Fatal) {
    console.error(`[check-bundle] ${e.message}`)
    console.error(USAGE)
    process.exit(2)
  }
  throw e
}
