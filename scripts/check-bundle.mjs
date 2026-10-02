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
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'
import { computeEffective, loadBundleBaselines, PLANNED_BASELINE, ABSOLUTE_BUDGET } from './gate-perf.mjs'
import {
  RUNTIME_MANIFEST_FIELDS,
  DROPPED_MANIFEST_FIELDS,
  DROPPED_MANIFEST_PROBES,
} from './content/manifest-runtime.mjs'
// 预热清单的解析实现与测试夹具共用（scripts/content/warmup-ids.mjs）：
// 判据与 e2e 探针若各写一套正则，口径迟早漂移 —— 事实源只有 registry.ts 一个。
import { parseWarmUpLiteral } from './content/warmup-ids.mjs'

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
  node scripts/check-bundle.mjs                    # 构建后体积门禁（需先 npm run build）
  node scripts/check-bundle.mjs --falsify          # 自带证伪自检（证明判据 4/5/6 各分支能判红）
  node scripts/check-bundle.mjs --record-baseline  # 重记预热清单长度棘轮基线（清单变长时拒绝）`

/** 预热阈值（字节）。预热预算不在 gate-perf 预算表管辖内，保留本文件常量 */
const WARM_GZIP_MAX = 600 * 1024

/** 读预热清单长度的棘轮基线（缺失返回 null ⇒ 判据 6 记 UNKNOWN，不视为通过） */
function loadWarmupBaseline() {
  try {
    const j = JSON.parse(readFileSync(WARMUP_BASELINE_JSON, 'utf8'))
    return Number.isInteger(j?.warmupIdsMax) ? j.warmupIdsMax : null
  } catch {
    return null
  }
}

/** 预热清单长度上限（门阈值）。预热是"离线可切大词库"的代价，扩词时代只许减不许增
 *  ⚠️ B 步 9.5 实测结论（别再试）：把 `frontend` / `cloud-native` 塞进 WARMUP_IDS 换不来任何
 *  首屏收益 —— 预热时机在 `window load` → `requestIdleCallback`（首屏之后），而这两个包改 lazy
 *  后走「切库按需加载 + 骨架屏」，本就在 idle 之后才可能被摸到；清单撑到 4 还会同时撞
 *  本上限与 warmup-ids-baseline.json 棘轮两道坎。详见 registry.ts 的 WARMUP_IDS 处注释。 */
const WARMUP_MAX_IDS = 2
/** 清单长度棘轮基线（由 `check-bundle --record-baseline` 落盘并随仓库提交）。
 *  ⚠️ 位置是踩过坑的：最初落在 `docs/audit-package/_generated/`（P1.7 **冻结区**），
 *  新写一个基线文件就被 INV-1 判「P1.8 不得触碰 P1.7 冻结区」⇒ P18-I 证据当场挂一条。
 *  本基线是 P1.8 之后（B 步）的产物，必须落在 P1.8 自己的证据树下，不许进冻结区。 */
const WARMUP_BASELINE_JSON = path.join(ROOT, 'docs', 'p18', '_generated', 'warmup-ids-baseline.json')

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

/** 解析 warmUpVocabulary 实际预热的包：读 registry.ts 的 WARMUP_IDS 常量数组（预热预算的唯一事实源）。
 *
 *  旧实现（抠 warmUpVocabulary 函数体里 `allSettled([...])` 的 `loadXxx()` 调用名 → 反查注册项）
 *  是**多一层的间接解析**：loader 名 → 包名。它埋着两个坑 ——
 *    ① 改造预热实现（改按需 / 清单化 / 数据驱动）会让判据**解析不到 ⇒ UNKNOWN ⇒ 不通过**；
 *    ② 若哪天把「候选池」写进 allSettled（而不是「实际加热的」），判据会算了错的数字还照样判绿（假通过）。
 *
 *  改后：数组字面量里的字符串**就是 localId**，与注册项 localId 直接比对，解析面更窄也更硬。
 *  解析不到（常量被删/改名/写成非字面量）⇒ 返回 null ⇒ 判据 3/6 记 UNKNOWN（**不视为通过**）。
 *
 *  实际解析由 scripts/content/warmup-ids.mjs 的 parseWarmUpLiteral 承担（本文件只多一层
 *  「是否都是已知 localId」的校验）—— 与 e2e 预热探针同一份实现，避免两套正则口径漂移。 */
function parseWarmUpIds(src, entries) {
  const ids = parseWarmUpLiteral(src)
  if (!ids) return null
  const known = new Set(entries.map((e) => e.id))
  return ids.every((id) => known.has(id)) ? ids : null
}

/** 预热清单长度判定（纯函数，供判据 6 与 --falsify 共用；warmIds 为 null ⇒ 解析不到，记 UNKNOWN） */
function evalWarmupIds(warmIds) {
  const base = loadWarmupBaseline()
  if (warmIds === null) {
    return { status: 'UNKNOWN', msg: ` 无法确定 registry.ts 的 WARMUP_IDS 预热清单 ⇒ 清单长度上限与棘轮无法核算（不视为通过）` }
  }
  if (warmIds.length > WARMUP_MAX_IDS) {
    return { status: 'FAIL', msg: ` 预热清单长度 ${warmIds.length} > 上限 ${WARMUP_MAX_IDS}（清单 [${warmIds.join(', ')}]）：扩词时代预热只许减不许增` }
  }
  if (base === null) {
    return { status: 'UNKNOWN', msg: ` 预热清单长度 ${warmIds.length}（[${warmIds.join(', ')}]）未超上限，但棘轮基线缺失 —— 先跑 node scripts/check-bundle.mjs --record-baseline 并提交该文件` }
  }
  if (base < warmIds.length) {
    return { status: 'FAIL', msg: ` 预热清单长度 ${warmIds.length} > 基线 ${base}（棘轮只许降不许升）：清单 [${warmIds.join(', ')}]` }
  }
  return { status: 'PASS', msg: ` 预热清单长度 ${warmIds.length} ≤ 上限 ${WARMUP_MAX_IDS} 且 ≤ 基线 ${base}（清单 [${warmIds.join(', ')}]）` }
}

/* ---------------- 归属探测 ---------------- */

/**
 * 取「该包独有」的词作为探测词：出现在目标包、且不出现在任何其它包、
 * **也不出现在主 chunk 里**（主 chunk 已有 ⇒ 这个串就算命中也解释不了「这个包被 inline 进来」，
 * 拿它当探测串只会让判据 5 恒定「部分命中 ⇒ UNKNOWN」）。
 * chunk hash 会随内容变化，所以**不能硬编码文件名**，只能用内容特征反查归属。
 * 只取纯字母且 ≥5 字符的词 —— chunk 里词表是以 JSON 转义后的字符串形式存在的，
 * 纯字母词才能与 chunk 文本字面量直接比对（带转义符的词会漏判/误判）。
 * 长词优先：越长越不可能是巧合命中。
 *
 * ⚠️ 这条「也排除主 chunk 已有」是 B 步 9.5 实测逼出来的（不是理论推演）：
 * `frontend` 是通用前端词库，`component` 在主 chunk 出现 50 次、`repository` 3 次
 * （都来自 App 代码本身，与 frontend 包无关），8 个探测串里必然混进这两个
 * ⇒ 判据 5 从「改 lazy 前不探这个包」变成**恒定 UNKNOWN**（UNKNOWN 视为不通过，门被焊死）。
 *
 * ⚠️ 过滤用的文本必须是「主 chunk 里**摘掉本包载荷**之后的残文」（见 stripOwnPayload），
 *    不能直接用 mainText —— 那是自指的：包一旦真泄漏，它的词同时出现在 mainText 里，
 *    过滤会把**要用的探测词自己洗掉**，判据 5 从「该 FAIL」退化成
 *    「只剩 1 个探测串 < PROBE_MIN ⇒ UNKNOWN」（注入 B 实测复现过）。
 *
 * 两级行为（注入 B：registry 保留 load: 却静态导入 frontend 词表后 rebuild 复现）：
 *   · 干净态：15 个 lazy 包探测串在主 chunk 命中 0 次 ⇒ 判据 5 PASS；
 *   · 泄漏态：frontend 部分命中 7/8 ⇒ 判据 5 UNKNOWN（**不视为通过**），
 *     同时判据 2（chunk 数 12 < lazy 包 15）判 FAIL ⇒ 整门 FAIL。
 * 即「泄漏 ⇒ 门红」成立，判据 5 不再被自己的探测集卡住 ⇒ 不再恒定 UNKNOWN。
 *
 * 代价说清楚：被过滤掉的词**失去泄漏分辨力**（只把这类通用词塞进主 chunk 的泄漏，
 * 判据 5 抓不到，由判据 1 主 chunk 体积 + 判据 2 chunk 计数兜底）。这是「归属歧义」
 * 与「检测力」之间必须做的取舍，不是把门调松绕过问题。
 */
function distinctProbes(pkgId, setsById, mainText) {
  const mine = setsById.get(pkgId)
  if (!mine || mine.size === 0) return []
  const others = new Set()
  for (const [id, set] of setsById) {
    if (id === pkgId) continue
    for (const w of set) others.add(w)
  }
  const uniq = [...mine].filter((w) => !others.has(w) && /^[a-z]{5,}$/i.test(w))
  const discriminative = mainText ? uniq.filter((w) => !mainText.includes(w)) : uniq
  discriminative.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return discriminative.slice(0, PROBE_COUNT)
}

const hitsAll = (text, probes) => probes.every((p) => text.includes(p))

/**
 * 把 mainText 里「本包载荷自身贡献的」带引号词条抹掉，得到过滤用残文。
 *
 * 为什么只抹**带引号**形态：词表是以 JSON 字符串数组形态进 chunk 的（`,"component",`），
 * 而 App 代码里同一个词通常以裸标识符形态出现（`"component"` 只 1 次、裸 component 50 次）——
 * 只抹带引号的，既不误伤 App 代码的裸用法，又能把「本包内容」干净摘除。
 */
function stripOwnPayload(mainText, ownWords) {
  if (!mainText || !ownWords || ownWords.size === 0) return mainText
  return [...ownWords].reduce((t, w) => (w.length >= 3 ? t.split(`"${w}"`).join('') : t), mainText)
}

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
 *
 * 两级过滤（都要说清楚，别当成普通清理）：
 *   · **排除含 `"` 的候选**（缺陷三）：词表是以 JSON 字面量形态进主 chunk 的，骨架内部的 `"`
 *     会被产物转义成 `\\\"`（实测产物片段 `… className=\\\"app\\\" …`）。⇒ `mainText.includes(probe)`
 *     对含 `"` 的候选**恒 false**：它既判不出 FAIL（永远少一条命中 ⇒ 天花板只有 UNKNOWN），
 *     又占着 PROBE_COUNT 的 8 个名额把真正能用的候选挤下去 ⇒ 排除它不是把门调松，是把门修好。
 *   · **excludeText 过滤「撞应用源码」的候选**（缺陷一）：候选串若在 `src/**` 源码全文里出现，
 *     干净态（构建正常）也会命中主 chunk ⇒ 判据 5 退化成「部分命中 ⇒ UNKNOWN ⇒ 门红」。
 *     ⚠️ 过滤基准只能是 `src/**` 源码全文：**主 chunk 原文和 stripOwnPayload 残文都不行** ——
 *     主 chunk 是自指的（包一旦泄漏，它的词同时出现在里面，过滤会把要用的探测串自己洗掉，
 *     实测 8 条被洗到样本不足 ⇒ UNKNOWN）；残文更差（剥不掉原始大小写，`useState` 这类剥不下来，
 *     实测 probes 8→4 半塌）。`src/**` 全文对干净态是空操作（实测 0/16 碰撞），对泄漏态分辨力不变。
 *
 * @param json json（items.json / words.json 解析后的对象）
 * @param otherPayloadTexts 其它 lazy 包的载荷文本（跨包去重用）
 * @param excludeText 「不该被探测」的禁用文本（= `src/**` 源码全文）；空/null ⇒ 不过滤
 * @param dropStats 可选出参：函数把「本次被 excludeText 踢掉几条候选」记进来。
 *   这条必须由**函数内部**报：调用点自己拿 excludeText 变量去重筛候选只会证明「调用点取到了源码全文」，
 *   证不出「真的把参数传了下去」—— 调用点传 '' 时那个自算值照样是 1（实测过，L5d 因此全绿）。
 */
/** 取「整串可打印 ASCII、≥5 字符」的候选（跨数组/对象递归；顺序无关，调用方自己排序） */
function asciiCandidates(json) {
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
  return cands
}

function asciiPhraseProbes(json, otherPayloadTexts, excludeText, dropStats) {
  const cands = asciiCandidates(json)
  const uniq = [...cands].filter((s) => {
    const hitQuote = s.includes('"')
    const hitExclude = !hitQuote && !!(excludeText && excludeText.includes(s))
    if (hitExclude && dropStats) dropStats.srcDropped++
    return !hitQuote && !hitExclude
  })
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return uniq.slice(0, PROBE_COUNT)
}

/**
 * 构造判据 5 的逐包探测集。
 * vocabulary lazy 包 → words.json 的独有词（复用 distinctProbes）；
 * 非 vocabulary lazy 包 → items.json 的独有 ASCII 短语（asciiPhraseProbes）。
 *
 * vocabulary 内部为什么还要再分「主路径 / 兜底路径」两条（这条是本函数唯一的两级结构）：
 *   · 主路径 distinctProbes 只挑 **纯字母且 ≥5 字符** 的词；
 *     **前端词汇类**包（kaoyan / toefl / cet4 / cet6 / ai-core / ielts …）的 `word` 就是
 *     真英文单词，独有词 ≥ PROBE_MIN，走主路径出串质量最高（单长词，几乎不可能巧合命中）。
 *   · **代码骨架类**包（ts-code / go-code 这一类）的 `word` 是整条代码骨架
 *     （形如 `const [state, setState] = useState(initialState);`）——
 *     整串含空格/括号/分号，`/^[a-z]{5,}$/i` 一条都匹配不上；
 *     而骨架里那些"看得见的字母片段"（useState / useState 之外的类型名、变量名、箭头函数体）
 *     又都是复用率极高的通用 token，拿单个 token 当探测串必然撞进 App 源码。
 *     ⇒ 这类包在主路径上独有候选恒为 0，若没有兜底，判据 5 会对它**恒记 UNKNOWN**
 *       （UNKNOWN 视为不通过 ⇒ 门红），而且报错只说「只找到 0 个独有探测串」，看代码的人
 *       根本不知道该修哪一条。这就是兜底存在的唯一理由。
 *   · 兜底直接复用 items 分支那套 asciiPhraseProbes：**整条骨架**作探测串
 *     （整串是该包独有的内容特征，跨包去重后不会与别的包重叠），
 *     探测路径与 kind 都会在报错信息里体现（kind = `vocabulary/load/ascii`，
 *     与 `vocabulary/load` / `items/loadData` 区分开）。
 *
 * 兜底的失效条件（说清楚，别指望它万能）：
 *   · 骨架串若**同时出现在 App 源码**里（如某个 helper 正好写了 `const sorted = [...list].sort(...)`），
 *     干净态也会命中 ⇒ 判据 5 退化成「部分命中 ⇒ UNKNOWN」；
 *     ⇒ 兜底分支**按 `src/**` 源码全文过滤**这类候选（缺陷一：ts-code 的 ASCII 候选池 50 条里有 1 条
 *     `export default function App() {` 实测撞 src/App.tsx:60）。这条过滤是"花了也不亏"的保险：
 *     过滤基准取 `src/**` 全文（不是主 chunk 原文、也不是 stripOwnPayload 残文，理由见 asciiPhraseProbes），
 *     干净态实测 0/16 碰撞 = 空操作，泄漏态分辨力不变。
 *   · 兜底**不做主 chunk 过滤**（与 items 分支一致）—— 它防的是「跨包重叠 + 撞应用源码」，不是「已在主 chunk」。
 *     「已在主 chunk」那条取舍只在 vocabulary 主路径的 distinctProbes 上（见其注释）。
 *   · 兜底**不做 `"` 的放行**：含 `"` 的候选在产物里被转义，恒匹配不上（缺陷三），留着只会把
 *     PROBE_COUNT 的 8 个名额占掉 ⇒ 见 asciiPhraseProbes。
 *
 * ⚠️ 兜底**今天是睡着的**：ts-code / go-code（registry.ts:107/108）仍是 inline（`words: parseWords(...)`），
 *    走兜底的包数实测 = 0。这里加固不是为了现在生效，是为了 **3a**（把它们改成 lazy）落地时兜底不会
 *    因为「撞源码 ⇒ 干净态也命中 ⇒ 恒定 UNKNOWN」把门焊死。改 registry 那一刀是独立事项，这里不动。
 */
function collectLazyProbes(entries, setsById, mainText) {
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
  const nonAscii = new Set()
  return lazy.map((e) => {
    let probes
    let kind = kindOf.get(e.id)
    let srcDropped = 0
    if (kind === 'vocabulary/load') {
      // 过滤用残文 = mainText 摘掉本包自己的词条（自指陷阱见 distinctProbes 注释）
      probes = distinctProbes(e.id, setsById, stripOwnPayload(mainText, setsById.get(e.id)))
      if (probes.length < PROBE_MIN) {
        // 主路径样本不足（典型：代码骨架类词库，word 是整条骨架而非单个英文词）⇒
        // 兜底走整串 ASCII 短语，与 items 分支同一套算法（内部已做跨包去重 + 长串优先 + 撞源码过滤）
        const txt = texts.get(e.id) ?? ''
        let json = null
        try { json = JSON.parse(txt) } catch { json = null }
        const others = [...texts].filter(([k]) => k !== e.id).map(([, v]) => v)
        // 兜底的过滤基准 = src/** 源码全文（缺陷一）；今天兜底睡着，这条是给 3a 之后兜底用的
        const excludeText = scanSrcText()
        const dropStats = { srcDropped: 0 }
        const ascii = json ? asciiPhraseProbes(json, others, excludeText, dropStats) : []
        /* srcDropped = 上一次 asciiPhraseProbes 调用里 excludeText **实际踢掉**了几条候选（接线证据）。
         * 只验 asciiPhraseProbes 内部那句 filter 是会被骗的（判据⑧ 那类病：锁住函数内部、锁不住调用点）：
         * 调用点要是传了 ''（过滤失效），filter 还在、一句不落，但踢掉 0 条 —— 下游探测集因此毫无变化。
         * 所以「踢掉几条」必须由调用点报出来，才能证明 :425 真的把源码全文传进去了。
         * （不能拿探测集反推：撞源码的候选只有 30 字符，长串优先的 top-8 永远挤不进它，
         *   即使过滤失效，"探测集里混进撞源码串"也压根不会发生 —— 实测过，见 L5d 的自检注释。） */
        // srcDropped 必须取**函数内部**报上来的数（dropStats），不能调用点自己再算一遍：
        // 调用点自算只会证明「我自己取到了源码全文」，证不出「真的传下去了」——
        // 改成自算后实测过：调用点传 '' 时它照样算出 1，L5d 依旧全绿（本届复核抓的就是这个）。
        srcDropped = dropStats.srcDropped
        // JSON 解析失败 ⇒ ascii 恒为空，此时保持原 kind 与空 probes（不抛错、不假装探测到了）
        if (ascii.length > probes.length) {
          probes = ascii
          kind = 'vocabulary/load/ascii'
        } else if (json && ascii.length === 0) {
          // 解析成功但候选池被清空 ⇒ Stage 2 的中文内容包会落到这里（纯非 ASCII ⇒ 判据 5 天生测不了）
          nonAscii.add(e.id)
        }
      }
    } else {
      const txt = texts.get(e.id) ?? ''
      let json = null
      try { json = JSON.parse(txt) } catch { json = null }
      const others = [...texts].filter(([k]) => k !== e.id).map(([, v]) => v)
      // items 分支**不**接 src 过滤：它是今天活着的路径（8 个包），源码过滤只对"将来 3a 落地才启用"的
      // 兜底分支做加固，把这条也打开了等于顺手改动线上判据 —— 超出本次范围，先不动。
      const ascii = json ? asciiPhraseProbes(json, others) : []
      probes = ascii
      if (json && ascii.length === 0) nonAscii.add(e.id)
    }
    return { id: e.id, kind, probes, nonAscii: nonAscii.has(e.id), srcDropped }
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

/**
 * 递归遍历 src/**\/*.ts|tsx，对每个文件调 cb(text, relPath)。
 * 返回扫描到的文件数（0 ⇒ src 不可读，调用方据此判 UNKNOWN，绝不假装"扫过且干净"）。
 * scanSrcManifestRaw（判据 J1 子判据）与兜底 ASCII 探测串的源码过滤共用这套遍历，
 * 避免两处各写一遍递归后口径漂移。
 */
function walkSrcTs(cb) {
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
      cb(text, path.relative(ROOT, p).split(path.sep).join('/'))
    }
  }
  walk(SRC_DIR)
  return scanned
}

/** 扫 src/**\/*.ts|tsx 里的 `manifest.json?raw` 回退导入；返回 ['rel:line', ...]；src 扫不到任何文件 ⇒ null */
function scanSrcManifestRaw() {
  const hits = []
  const scanned = walkSrcTs((text, rel) => {
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('manifest.json?raw')) hits.push(`${rel}:${i + 1}`)
    }
  })
  return scanned === 0 ? null : hits
}

/** src/**\/*.ts|tsx 的**全文**（判据 5 兜底分支的过滤基准）。src 扫不到任何文件 ⇒ null（= 不过滤） */
let srcTextCache = null
function scanSrcText() {
  if (srcTextCache === null) {
    const buf = []
    const scanned = walkSrcTs((text) => { buf.push(text) })
    srcTextCache = scanned === 0 ? null : buf.join('\n')
  }
  return srcTextCache
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
 *         探测数 < PROBE_MIN ⇒ UNKNOWN（样本不足，或纯非 ASCII 词库天生测不了 ⇒ 文案会点明是后者）；全不命中 ⇒ PASS。
 */
function checkLazyLeak(mainText, perPkg) {
  if (mainText == null) return { status: 'UNKNOWN', msg: '主 chunk 不可用，无法判定 lazy 包是否泄漏', lines: [] }
  if (!perPkg || perPkg.length === 0) return { status: 'UNKNOWN', msg: '无法解析 registry.ts 的 lazy 包清单（结构变化？）', lines: [] }
  const fails = []
  const unknowns = []
  const lines = []
  for (const { id, kind, probes, nonAscii } of perPkg) {
    if (!probes || probes.length < PROBE_MIN) {
      /* 「探测不到」必须一眼能分清根因，否则开发者只会看到一句「只找到 0 个」而不知道该修哪条：
       *   · 纯非 ASCII 词库（Stage 2 的中文内容包）⇒ 候选池恒为 ∅，判据 5 **天生测不了**；
       *     这是"测不了"不是"样本不够"，所以文案单独成类（≠ 下面的「真泄漏部分命中」），
       *     两者都不算通过（UNKNOWN），但前者一眼就该看出是词库语言属性问题，不是泄漏。
       *   · 其余情况 = 常规样本不足（候选池存在但去重/过滤后不够）。 */
      const why = nonAscii
        ? '该词库无非 ASCII 可探测内容（纯非 ASCII 词库 ⇒ 候选恒为空，判据 5 无法判定，不是"样本不足"）'
        : `只找到 ${probes ? probes.length : 0} 个独有探测串（< ${PROBE_MIN}）`
      unknowns.push(`${id} ${why}`)
      lines.push(
        `      · ${id} (${kind}) probes=${probes ? probes.length : 0} → ? UNKNOWN（${
          nonAscii ? '纯非 ASCII 词库，判据 5 无法判定' : '样本不足'
        }）`,
      )
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
  let warmIds = null
  try {
    const src = readFileSync(REGISTRY_TS, 'utf8')
    entries = parseRegistryEntries(src)
    if (!entries || entries.length === 0) entries = null
    // warmIds 一并在此解析（判据 6 与 --falsify 共用同一入口：注入改的就是这个字段）
    warmIds = entries ? parseWarmUpIds(src, entries) : null
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
    lazyProbes: entries ? collectLazyProbes(entries, setsById, mainText) : [],
    warmIds,
  }
}

/** 跑判据 4（J1/J2/J3）与判据 5，返回四个分支结果（供默认模式打印 / --falsify 断言） */
function runPureChecks(inp) {
  return {
    j1: checkJ1(inp),
    j2: checkJ2(inp.mainText, inp.droppedProbes),
    j3: checkJ3(inp.mainText, inp.retainedProbes, RETAINED_PROBE_MIN),
    lazy: checkLazyLeak(inp.mainText, inp.lazyProbes),
    warm: evalWarmupIds(inp.warmIds ?? null),
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

  /* —— 6. 预热清单长度上限 + 棘轮（B 步 9.2）——
   * 预热是「离线可切大词库」的代价，旧实现把三个库硬编码在函数体里且无上限 ⇒ 扩词即膨胀。
   * 现在「预热哪些包」由 registry.ts 的 WARMUP_IDS 常量决定，本判据守两件事：
   *   ① 长度不越过上限；② 长度不越过已落盘基线（棘轮，只许降不许升）。 */
  const warmRes = runPureChecks(inp).warm
  record(warmRes.status, 6, warmRes.msg)

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
  let recordBaseline = false
  for (const a of args) {
    if (a === '--falsify') { falsify = true; continue }
    if (a === '--record-baseline') { recordBaseline = true; continue }
    throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 本门不接受未知 flag，也不猜测其语义`)
  }
  return { falsify, recordBaseline }
}

/**
 * 写入预热清单长度棘轮基线（判据 6 的另一半）。
 * 与 gate-perf --record-baseline 同一心智模型：**基线换代时人工执行**，CI 里绝不重记。
 * 硬约束：清单**变长**时一律拒绝借记基线 —— 否则棘轮可以被「重记一次」顶破，
 * 这个口子一开，扩词时代预热预算就又回到「随包数线性膨胀」的老路。
 */
function recordWarmupBaseline() {
  const src = readFileSync(REGISTRY_TS, 'utf8')
  const entries = parseRegistryEntries(src)
  if (!entries || entries.length === 0) throw new Fatal('registry.ts 解析不到任何注册项，拒绝记基线')
  const ids = parseWarmUpIds(src, entries)
  if (ids === null) throw new Fatal('registry.ts 解析不到 WARMUP_IDS 预热清单，拒绝记基线（先让判据 6 在干净树上跑绿）')

  const prev = loadWarmupBaseline()
  if (prev !== null && prev < ids.length) {
    throw new Fatal(`预热清单长度从基线 ${prev} **变长**到 ${ids.length} —— 棘轮只许降不许升，禁止借记基线顶破（这是扩词膨胀的入口）`)
  }
  mkdirSync(path.dirname(WARMUP_BASELINE_JSON), { recursive: true })
  writeFileSync(
    WARMUP_BASELINE_JSON,
    `${JSON.stringify(
      {
        warmupIdsMax: ids.length,
        ids: [...ids],
        recorded: new Date().toISOString(),
        note: 'check-bundle --record-baseline 写入；清单只许降不许升，变长时重记会被拒绝',
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    `[check-bundle] 已记录预热清单长度基线：${ids.length}（${ids.join(', ')}）→ ${path.relative(ROOT, WARMUP_BASELINE_JSON)}`,
  )
}

/* ---------------- 证伪自检 ----------------
 * 证明判据 4（J1/J2/J3）与判据 5 **各自都能判红**：
 *   每条用例注入一个针对性故障 → 断言「对应分支恰好 FAIL，其余分支状态不变」→ 整门聚合必须非 PASS。
 * 两组基线对照：不加任何故障时四个分支必须全 PASS（证明这套断言不是恒红的）。
 * ------------------------------------------------------------------ */

const BRANCHES = ['j1', 'j2', 'j3', 'lazy', 'warm']

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
  {
    letter: 'L5b',
    name: '把「代码骨架类」lazy 包的整条骨架串塞进主 chunk（走 vocabulary ASCII 兜底路径）',
    why: '证明兜底路径不是死代码/恒空：先把 ts-code 以 lazy 身份重新喂给 collectLazyProbes（骨架类主路径独有候选恒 0 ⇒ 必走兜底），**断言兜底真产出了 ≥ PROBE_MIN 个串**，再把它们塞进主 chunk ⇒ 判据 5 必须判红',
    target: 'lazy',
    mutate: (inp) => {
      // ts-code 在 registry 里是 inline（words: parseWords(...)）；这里人为置成 lazy，
      // 让 collectLazyProbes 的 vocabulary 分支落到「主路径样本不足 ⇒ ASCII 兜底」这条路上。
      const entries = [
        { id: 'ts-code', loader: 'loadTsCode', mode: 'lazy' },
        ...parseRegistryEntries(readFileSync(REGISTRY_TS, 'utf8')),
      ]
      const perPkg = collectLazyProbes(entries, loadWordSets(), inp.mainText)
      const subject = perPkg.find((p) => p.kind === 'vocabulary/load/ascii')
      if (!subject) throw new Fatal('证伪用例 L5b 未走到兜底路径（没有 kind=vocabulary/load/ascii 的lazy包）⇒ 兜底是死代码或 kind 写错')
      if (subject.probes.length < PROBE_MIN) {
        throw new Fatal(`证伪用例 L5b 兜底只产出 ${subject.probes.length} 个探测串（要求 ≥ ${PROBE_MIN}）⇒ 兜底等于没兜，判据 5 对骨架类仍是瞎的`)
      }
      return { lazyProbes: perPkg, mainText: `${inp.mainText}\n/* ${subject.probes.join(' | ')} */\n` }
    },
  },
  {
    letter: 'L5c',
    name: '把 ts-code 整包按**产物转义形态**塞进主 chunk（真实 inline 泄漏形态，不靠 /*…*/ 注释绕开产物转义）',
    why: '缺陷三的机器判据：主 chunk 把 words.json 原文塞进 JS 字符串字面量，骨架内部的 `"` 被转义成 `\\\"` ⇒ 含 `"` 的候选**恒匹配不上**；不排除它的话（L5b 那种 `/* */` 注释形态看不出来）整包泄漏也只能判到「部分命中 ⇒ UNKNOWN」，永远到不了 FAIL ⇒ 判据 5 对这类包的天花板被焊死。本用例按产物形态注入 ⇒ 排除 `"` 后的探测串必须全部命中 ⇒ FAIL。',
    target: 'lazy',
    mutate: (inp) => {
      const entries = [
        { id: 'ts-code', loader: 'loadTsCode', mode: 'lazy' },
        ...parseRegistryEntries(readFileSync(REGISTRY_TS, 'utf8')),
      ]
      const perPkg = collectLazyProbes(entries, loadWordSets(), inp.mainText)
      const subject = perPkg.find((p) => p.kind === 'vocabulary/load/ascii')
      if (!subject) throw new Fatal('证伪用例 L5c 未走到兜底路径（没有 kind=vocabulary/load/ascii 的 lazy 包）⇒ 兜底是死代码或 kind 写错')
      if (subject.probes.length < PROBE_MIN) {
        throw new Fatal(`证伪用例 L5c 兜底只产出 ${subject.probes.length} 个探测串（要求 ≥ ${PROBE_MIN}）⇒ 兜底等于没兜`)
      }
      /* 自检一（缺陷三的物证，用真实产物）：ts-code 今天就是 inline 的（registry.ts:107），
       * 所以真实主 chunk 里**必然**带着它的转义形态 —— 含 `"` 的那条原串在产物里应当搜不到（被转义了）。
       * 若哪天原串搜得到，说明产物形态变了，本用例的前提要重估 ⇒ 直接判红，不许悄悄变成恒真。 */
      const words = JSON.parse(readFileSync(path.join(VOCAB_DIR, 'ts-code', 'words.json'), 'utf8'))
      const quoted = words.map((w) => String(w?.word ?? '')).filter((s) => s.includes('"'))
      if (!quoted.length) throw new Fatal('证伪用例 L5c 自检失败：ts-code 词表里没有含 `"` 的词 ⇒ 缺陷三在本语料不存在，用例失去意义')
      if (inp.mainText.includes(quoted[0])) {
        throw new Fatal('证伪用例 L5c 自检失败：ts-code 的整条 inline 词条在主 chunk 里以**原串**形态出现 ⇒ 产物转义形态变了，用例前提失效')
      }
      /* 自检二：探测集里不许再混进含 `"` 的候选（这就是缺陷三那一步修的东西） */
      const withQuote = subject.probes.filter((s) => s.includes('"'))
      if (withQuote.length) {
        throw new Fatal(`证伪用例 L5c 自检失败：探测集混进了含 \`"\` 的候选（${JSON.stringify(withQuote.slice(0, 2))}）⇒ 缺陷三没修（它们在产物里恒匹配不上，天花板只有 UNKNOWN）`)
      }
      // 产物形态的整包载荷：词表里每条例子以 `\"word\"` 形态出现（外层引号是 JSON 字面量自带的）
      const leaked = `["${subject.probes.join('","')}"]`
      return { lazyProbes: perPkg, mainText: `${inp.mainText}\n${leaked}\n` }
    },
  },
  {
    letter: 'L5d',
    name: '把兜底分支的 src/** 源码过滤关掉（模拟过滤失效）⇒ 撞源码的候选进探测集，干净态主 chunk 也会被拖成「部分命中」',
    why: '缺陷一的机器判据：兜底串若在 src/** 里也写了（ts-code 的 ASCII 候选池实测有 `export default function App() {` 撞 src/App.tsx:60），过滤失效 ⇒ 干净态也会命中 ⇒ 判据 5 退化成「部分命中 ⇒ UNKNOWN ⇒ 门红」。用例三层自检缺一不可：① 语料里确实存在撞源码的候选；② **调用点** `:425` 真把 src/** 全文传了进去（否则踢掉 0 条 ⇒ 判红）；③ **函数** `:351` 真的按 excludeText 过滤（撤销那句 filter ⇒ 判红）。② 是这次补的：只验函数内部的 filter 会被「调用点传空串」骗过去（那时 filter 还在但踢掉 0 条，探测集逐字节不变）。三层都过之后，再模拟过滤失效把撞源码的候选混进探测集、并让主 chunk 带上这段应用源码 ⇒ 判据 5 必须 NOT PASS（这里刻意是 UNKNOWN：干净态被自己的探测集拖红，正是缺陷一描述的退化）。任何一环失效 ⇒ 自检抛错 ⇒ 判红，不许写成恒绿死用例。',
    target: 'lazy',
    expect: 'UNKNOWN',
    mutate: (inp) => {
      const srcText = scanSrcText()
      if (!srcText) throw new Fatal('证伪用例 L5d 自检失败：src/** 读不到（scanSrcText 返回 null）⇒ 无法验证源码过滤')
      const entries = [
        { id: 'ts-code', loader: 'loadTsCode', mode: 'lazy' },
        ...parseRegistryEntries(readFileSync(REGISTRY_TS, 'utf8')),
      ]
      const guarded = collectLazyProbes(entries, loadWordSets(), inp.mainText)
      const subject = guarded.find((p) => p.kind === 'vocabulary/load/ascii')
      if (!subject) throw new Fatal('证伪用例 L5d 未走到兜底路径（没有 kind=vocabulary/load/ascii 的 lazy 包）⇒ 兜底是死代码或 kind 写错')
      /* 自检一（语料前提）：候选池里必须存在「同时写在 src/** 里」的候选，否则缺陷一在本语料不存在 */
      const json = JSON.parse(readFileSync(path.join(VOCAB_DIR, 'ts-code', 'words.json'), 'utf8'))
      const collisions = [...asciiCandidates(json)].filter((s) => srcText.includes(s))
      if (!collisions.length) {
        throw new Fatal('证伪用例 L5d 自检失败：ts-code 候选池里没有撞 src/** 源码的候选 ⇒ 缺陷一在本语料不存在，src 过滤是否多余要重新评估')
      }
      /* 自检二（**锁调用点** `:425` 的实参）：subject 是生产路径 collectLazyProbes 的真实产出，
       * 它的 srcDropped = 那一次调用里 src/** 全文实际踢掉的候选数。
       * `:425` 一旦传 ''（过滤失效）⇒ 踢掉 0 条 ⇒ 这里抛错 ⇒ L5d 判红。
       * 不能靠「探测集里有没有混进撞源码的串」来判（就是自检三 那条的另一种写法）：
       * 撞源码的那条候选只有 30 字符，长串优先的 top-8 永远挤不进它，传 '' 时探测集逐字节不变 ——
       * 实测（临时探针打印）`:425`→'' 时 subject.probes 与正常版完全一致、`leaked=[]`，那条判据必然空转。 */
      if (!(subject.srcDropped > 0)) {
        throw new Fatal(`证伪用例 L5d 自检失败：生产路径的源码过滤踢掉了 ${subject.srcDropped} 条候选（应 > 0）⇒ :425 没把 src/** 全文传进 asciiPhraseProbes，缺陷一的过滤是空转`)
      }
      /* 自检三（**锁函数内部** `:351` 的实现）：把生产探测集的第 1 条当 excludeText 喂回去 ⇒
       * 它**必须**从探测集里消失。撤销 `uniq.filter` 里那条 `!(excludeText && excludeText.includes(s))`
       * ⇒ 本自检抛错 ⇒ L5d 判红。与自检二 各锁一层：一条锁调用点的实参，一条锁函数里的过滤实现。 */
      const decoy = subject.probes[0]
      if (decoy == null) throw new Fatal('证伪用例 L5d 兜底没产出探测串，无法做函数层自检')
      const recheck = asciiPhraseProbes(json, [], decoy)
      if (recheck.includes(decoy)) {
        throw new Fatal(`证伪用例 L5d 自检失败：asciiPhraseProbes 内部没按 excludeText 过滤（${JSON.stringify(decoy)} 本应被踢掉却仍在探测集里）⇒ 缺陷一的源码过滤只写在注释里`)
      }
      /* 构造「3a 落地之后的干净态主包」：真实主 chunk 今天还 inline 着 ts-code（registry.ts:107），
       * 8 条探测串在**真实**主 chunk 里本来就命中 —— 直接拿它当干净态会让本用例恒红（假失败），
       * 所以先把这 8 条骨架串从主包里抹掉，才谈得上「干净态」。 */
      const cleanMain = subject.probes.reduce((t, s) => t.split(s).join(''), inp.mainText)
      const stillHit = subject.probes.filter((p) => cleanMain.includes(p))
      if (stillHit.length) {
        throw new Fatal(`证伪用例 L5d 自检失败：干净态主包里仍有 ${stillHit.length} 条探测串命中（${JSON.stringify(stillHit.slice(0, 2))}）⇒ "干净态"没构造出来，用例无意义`)
      }
      /* 注入：撞源码的候选混进探测集 + 干净主 chunk 里这段应用源码本来就在（App 源码一定会进产物）
       * ⇒ 8 条真探测串 0 命中、撞源码的那条 1 命中 ⇒ **部分命中 ⇒ UNKNOWN**：
       * 干净态被自己的探测集拖成门红，而根因一眼可见（探测串撞了应用源码，过滤没生效）。 */
      const perPkg = guarded.map((p) => (p.id === 'ts-code' ? { ...p, probes: [...p.probes, ...collisions] } : p))
      return { lazyProbes: perPkg, mainText: `${cleanMain}\n${collisions.join('\n')}\n` }
    },
  },
  {
    letter: 'W6a',
    name: '往 WARMUP_IDS 清单里塞第三个包（模拟扩词时手滑把新库加进预热）',
    why: '模拟「新增大词库进了预热清单」⇒ 判据 6 必须判红（长度超上限）；同时判据 3 的字节预算会被第 3 个共享分支不影响',
    target: 'warm',
    mutate: (inp) => ({ warmIds: [...(inp.warmIds ?? []), 'ielts'] }),
  },
  {
    letter: 'W6b',
    name: '把 WARMUP_IDS 清单抹掉（模拟改造实现时把常量改名/改成非字面量）',
    why: '证明「清单消失」不是悄悄放行而是 UNKNOWN（本项目：UNKNOWN 视为不通过）；若实现成「解析不到就当没预热」就是假通过',
    target: 'warm',
    expect: 'UNKNOWN',
    mutate: () => ({ warmIds: null }),
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

  /* —— 对照组：不加故障时全部分支必须全 PASS（否则后面「恰好判红」没有意义） —— */
  const baseNotPass = BRANCHES.filter((b) => base[b].status !== 'PASS')
  if (baseNotPass.length) {
    bad++
    lines.push(`  ✗ CTRL 基线对照未全绿：${baseNotPass.map((b) => `${b}=${base[b].status}`).join(', ')} —— 应先在干净树上跑通 npm run build && npm run check:bundle`)
  } else {
    lines.push(`  ✓ CTRL 基线对照：${BRANCHES.length} 分支 ${BRANCHES.join('/')} 全 PASS（断言非恒红）`)
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

    /* targetOk 的口径随用例而变：多数用例要求「判红(FAIL)」，
     * 但「输入缺失/清单消失」这类注入正确结果是 UNKNOWN（本项目 UNKNOWN 视为不通过，
     * 若实现成「解析不到就当没预热」就是假通过）—— 用 expect 区分，避免把 UNKNOWN 当失败。 */
    const targetOk = c.expect === 'UNKNOWN'
      ? res[c.target].status === 'UNKNOWN'
      : c.expect === 'nonpass'
        ? res[c.target].status !== 'PASS'
        : res[c.target].status === 'FAIL'
    const othersUnchanged = BRANCHES.filter((b) => b !== c.target).every((b) => res[b].status === base[b].status)
    const hitSet = BRANCHES.filter((b) => res[b].status !== 'PASS')
    const exact = hitSet.length === 1 && hitSet[0] === c.target
    const exitCode = BRANCHES.some((b) => res[b].status !== 'PASS') ? 1 : 0

    if (targetOk && othersUnchanged && exact && exitCode !== 0) {
      lines.push(`  ✓ ${c.letter} 目标分支 ${c.target} 恰好非 PASS（命中集 {${hitSet.join(',')}} = ${res[c.target].status}），其余分支状态不变，整门 exit=${exitCode}`)
      lines.push(`      ${c.name}`)
      lines.push(`      ${res[c.target].msg}`)
    } else {
      bad++
      lines.push(
        `  ✗ ${c.letter} 未达预期：target=${c.target} status=${res[c.target].status}（应为 ${c.expect === 'UNKNOWN' ? 'UNKNOWN' : 'FAIL'}）；` +
          `命中集 {${hitSet.join(',') || '∅'}}（应恰为 {${c.target}}）；其余分支${othersUnchanged ? '不变' : '被越界影响'}；exit=${exitCode}（应非 0）`,
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
  const { falsify: wantFalsify, recordBaseline: wantBaseline } = parseArgs(process.argv)
  if (wantBaseline) recordWarmupBaseline()
  else if (wantFalsify) falsify()
  else main()
} catch (e) {
  if (e instanceof Fatal) {
    console.error(`[check-bundle] ${e.message}`)
    console.error(USAGE)
    process.exit(2)
  }
  throw e
}
