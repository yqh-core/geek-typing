/* A1-E 之后 · content:scaffold-unit —— 单元内容脚手架（把「加第 N+1 个单元」从手工活变成一条命令）
 *
 * ── 为什么要有它 ──
 * A1-E 交付 Unit-03 时，除了内容本身，还有 **4 处手工代码改动**：
 *   1. scripts/content/generate-registry.mjs 的 ORDER_IMPORT
 *   2. 同上文件的 ORDER_REGISTRY（两张表**内容必须不同**）
 *   3. scripts/content/provider-rules.mjs 的 PROVIDER（不登记会被写成 provider:'unknown'，
 *      且旧版这里指 build.mjs —— 表已搬到 provider-rules.mjs，指针得跟着走，否则提示指向空处）
 *   4. src/data/learningUnits.ts 新增单元 + src/i18n/{zh,en}.ts 新增文案键
 * 只加一两个单元时手工没问题；要「产品化内容包扩展」时，这四处就是每次必踩的坑。
 * 本脚本负责 1–3 中能自动化的部分（内容包落盘 + checksum + 顺序表 + PROVIDER），
 * 第 4 项（单元编排条目 + i18n）**打印出来让人改**，不自动改：
 * 编排表和文案是产品决策（挂哪些包、什么标题），塞进生成器只会让它变成第二个事实源。
 *
 * ── 输入契约（PM 内容侧交付物）──
 *   node scripts/content/scaffold-unit.mjs --src=<unit-source.json> [--check] [--out-root=<dir>]
 * 源文件形状见 USAGE_TEXT。vocabulary / reading / exercise 三段都可缺省（缺哪段就不建哪个包）。
 * ⚠️ 但**声明了哪段，就必须显式声明该段的 `license.<段>`**（判据 23 · fail-closed）——
 *   「缺失」不等于「默认允许」，理由见下方 DEFAULT_LICENSE 处的注释。
 *
 * ── 源文件在哪（2026-10-07 起在仓库内）──
 *   三套单元源已入库到 `content-source/unit-source-ielts-{edu-01,env-02,tech-03}.json`。
 *   此前它们只存在于仓库外的 `D:/work/_ops/`，**CI 的任何 step 都不读那个目录** ——
 *   于是判据 ①（源缺 license 段即拒跑）只在「有人手动跑本脚本」时才触发，
 *   在 PR 阶段是**形同虚设**的（源侧的病，CI 看不见）。
 *   入库后判据 ① 的等价检查已由 `content:validate` 的**判据 24**在 CI 里常驻执行
 *   （读同一批 `content-source/*.json`）；
 *   本文件仍是「真正落盘/校验时」的最后一道闸，两层方向相同、职责不同。
 *   ⚠️ 两层的**段类型口径不再各写一份**：都取 `license-policy.mjs` 的 `declaredUnitSourceTypes()`
 *   （唯一副本 + `content:validate` 判据 27 机器上锁；此前是两份字面量靠注释互指，改一处忘
 *   另一处就会让两层口径分叉 —— 判据 24 假红或假绿，且没有任何机器判据会发现）。
 *   ⚠️ `content-source/` **不是**内容包根：它不在 `content/` 下，故不会被
 *   `content:validate` / `content:ingest` 当作包扫描（实测把同类目录放进 content/ 会判红）。
 *   ⚠️ 该目录在 .gitattributes 里是 `-text`：源必须逐字节原样入库，不许 git 改写换行
 *   （tech-03 实际带 CRLF；被归一后本地与 CI 拿到的就不是同一份字节）。
 *
 * ── 铁律 ──
 *   · checksum 一律走 license-policy.mjs 的 checksumPayload（唯一实现，禁止手搓）
 *   · --check 只校验不写盘，用于证明「现有包能被同一份源重现」（幂等 / 无漂移）
 *   · **落盘形态一律走 canonical.mjs 的 canonicalFile()**（唯一实现，禁止 JSON.stringify 直写）
 *   · **可声明的段类型一律走 license-policy.mjs 的 UNIT_SOURCE_SEGMENTS**（唯一实现）
 *   · ⛔ **import 本模块不得触发写盘**：本文件是**带 CLI 的脚本**，顶层就会 `process.exit`
 *     （`--help`/无参/缺 `--src`/源非法 四种情形）。因此**门禁与测试绝不能 import 本模块** ——
 *     要复用段类型口径请 import `license-policy.mjs` 的 `declaredUnitSourceTypes()`。
 *     （`content:validate` 判据 25 因此**不能**靠 import 本模块来做源↔盘比对，
 *       它调用的是同一批纯函数 `checksumPayload` / `canonicalFile` / `declaredUnitSourceTypes`，
 *       详见 validate.mjs 判据 25 区块的「两个观测点」说明。）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  declaredUnitSourceTypes,
} from './license-policy.mjs'
import { planUnitSource, comparePackageToDisk } from './unit-source-render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CONTENT = join(ROOT, 'content')
const GEN_REG = join(HERE, 'generate-registry.mjs')
/** PROVIDER 登记表现在住在 provider-rules.mjs（build.mjs 不再持表，见该文件的单一实现注释）。
 *  ⚠️ 待办打印必须指向这里：指针指向 build.mjs 会让人在已经搬空的文件里找表。 */
const PROVIDER_RULES = join(HERE, 'provider-rules.mjs')

/** 本地日历日，格式为 YYYY-MM-DD（d 缺省为当前时刻）。
 *  ⚠️ 必须走 getFullYear/getMonth/getDate 拼本地日，**不能**用 toISOString().slice(0,10)：
 *  后者给的是 **UTC** 日历日，而「内容发布日期」的语义是**本地**日历日。
 *  在 GMT+8 的 00:00–08:00 窗口里，本地已经是新的一天、UTC 还停在前一天，
 *  UTC 口径会把 PM 按本地写的「今天」判成未来日期并 process.exit(2)，
 *  当场挡住合法内容（2026-10-05 01:12 本地 / 01:12 UTC 前一天，实测复现）。
 *  这个窗口本仓库天天踩（南京的 PM 写内容 + 凌晨跑 CI 都在里面）。
 *  月/日要补零：getMonth() 从 0 起，且 1 月 9 日不补零会得到 "2026-1-9" ——
 *  既不是合法日期格式，也破坏「定长 ⇒ 字典序 == 时间序」这个前提。
 *  补零后 YYYY-MM-DD 定长，字符串 > 比较 == 时间先后比较，故比较方式不用改。 */
const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const USAGE_TEXT = `用法：
  node scripts/content/scaffold-unit.mjs --src=<unit-source.json> [--check] [--out-root=<dir>]
  --check      只校验：把源渲染出的内容与磁盘上已有包逐字节比对（不写盘）
  --out-root   把内容包写到另一个 content/ 根（默认仓库 content/），仅供 --check 的隔离副本用

源文件形状（unit-source.json）：
{
  "packagePrefix": "ielts-edu-01",          // 三个包的前缀：<prefix>-vocab / -reading / -exercise
  "publishedAt": "2026-10-04",              // 内容发布日期（不得是未来日期）
  "origin": "original authored content …",  // 溯源说明，写进每条 source.origin
  "license": {                // ⚠️ **必填**（判据 23）：声明了哪段内容，就必须显式声明该段的许可；
                              //   **缺段不再回落默认值** —— 「缺失」≠ 默认允许（见下方 DEFAULT_LICENSE 注释）
    "vocabulary": { "name": "MIT License", "spdx": "MIT", "url": "https://opensource.org/licenses/MIT",
                    "commercialUse": true, "attributionRequired": false, "redistributable": true },
    "reading":    { "name": "Proprietary (self-curated)",
                    "commercialUse": true, "attributionRequired": false, "redistributable": false },
    "exercise":   { "name": "Proprietary (self-curated)",
                    "commercialUse": true, "attributionRequired": false, "redistributable": false }
  }
  "tags": ["ielts", "academic", "education"],   // 可选，进三个包 manifest.tags
  "vocabulary": {                           // 可缺省；也接受直接给数组（那就是 items）
    "title": "…", "description": "…",
    "items": [ { "word": "academic", "translation": "学术的；学业的", "definition": "…", "phonetic": "…" } ]
  },
  "reading": {                              // 可缺省
    "title": "…",                           // **包**标题（进 manifest.title）
    "itemTitle": "The Changing Role of Education",  // **条目**标题（进 items.json 的 title）
                                            // ⚠️ 两者不是一回事：A1-E 实测包叫「…: Reading」、
                                            //    条目叫「The Changing Role of Education」，混用会静默改内容
    "description": "…",                     // 可选
    "paragraphs": ["…", "…"]                // 按段给；body 由 paragraphs 拼出
  },
  "exercise": {                             // 可缺省
    "title": "…", "description": "…",       // 可选（包标题）
    "itemTitle": "…",                       // 可选（条目标题，缺省同 title）
    "questions": [
      { "id": "q01", "type": "mcq"|"tfng", "prompt": "…",
        "options": [{ "key": "A", "text": "…" }], "answer": "B",
        "explanation": "…", "skill": "Main idea" }
    ],
    "collocations": ["higher education", "…"]
  }
}`

/* ── CLI ── */
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.length === 0) {
  console.log(USAGE_TEXT)
  process.exit(0)
}
/** 支持 `--name=value` 与 `--name value` 两种写法（validate.mjs 同口径）。 */
const argOf = (n) => {
  const eq = argv.find((a) => a.startsWith(`${n}=`))
  if (eq) return eq.slice(n.length + 1)
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : null
}
const SRC = argOf('--src')
const CHECK = argv.includes('--check')
const OUT_ROOT = argOf('--out-root') ?? CONTENT
if (!SRC) {
  console.error('缺少 --src=<unit-source.json>')
  process.exit(2)
}

const src = JSON.parse(readFileSync(SRC, 'utf8'))
const prefix = src.packagePrefix
if (typeof prefix !== 'string' || !/^[a-z0-9-]+$/.test(prefix)) {
  console.error(`packagePrefix 非法：${JSON.stringify(prefix)}（只允许小写字母/数字/连字符）`)
  process.exit(2)
}
// 缺省值与未来判定**必须同一口径**（都是 localDay）：混用会让缺省值永远等于参照日，
// 判据直接失效（UTC 口径 + UTC 参照 = 永远判绿）。
const publishedAt = src.publishedAt ?? localDay()
if (publishedAt > localDay()) {
  console.error(`publishedAt 是未来日期：${publishedAt} —— 内容发布日期不能提前（按本地日历日比较；A1-E 实测踩过）`)
  process.exit(2)
}
// ⚠️ `origin` / `builtAt` 已随渲染抽取搬到 `unit-source-render.mjs` 的 planUnitSource()
//   （它们只被渲染 manifest 用到）。本文件**不再持有第二份推导** ——
//   同一段推导写两处，改一处就会让「源渲染出的 manifest」与「落盘的 manifest」分叉。

/* ── 判据 23 · 许可段 fail-closed（**缺失 ≠ 默认允许**）──
 * 为什么必须**分段**而不是整个 unit 一个值：本 unit 的 vocabulary 包已改标 MIT（可开源），
 * 而同 unit 的 reading / exercise 仍是 Proprietary（不可再分发）。
 * 脚手架若写死单一许可，产出的 manifest 就与仓库现状漂移 ⇒ D 组「反向源可重现」幂等判据判红
 *   （实测：加 redistributable 后 D-1/D-2 由 72 PASS 掉到 70 PASS / 2 FAIL —— 真回归，已修）。
 * 故许可随内容类型走：`src.license.<vocabulary|reading|exercise>`。
 *
 * ⛔ **为什么「缺段」必须判红、而不是回落 DEFAULT_LICENSE（本刀的核心）**：
 *   旧实现在 `licenseFor` 里静默 `return { ...DEFAULT_LICENSE }`，而 DEFAULT_LICENSE 的
 *   `redistributable: false`。后果是**静默降级**：
 *     · 磁盘上三个 vocab 包是 `MIT License | redistributable = true`（13 个可开源词库）
 *     · 任何人拿现成源跑一次 scaffold-unit，vocab 包就变成 `redistributable: false`
 *     ·⇒ 13 个可开源词库掉到 12 个，而**没有任何门会红** ——
 *       因为 `gate:license` 判的是「声明了什么」，不是「声明相对现状有没有被降级」。
 *   这正是本项目反复吃过的那类病：**门只校验「现状合法」，不校验「不该悄悄变」**。
 *   fail-closed 的口径与 license-policy.mjs:159 对 `redistributable` 的口径**逐字一致**
 *   （「字段缺失同样不算声明」）—— 同一仓同一件事只有一种判法。
 *
 * `redistributable` 是**必填**显式声明（license-policy:decideLicense 第三维，缺失即判红），
 * 故合并默认值时也必须带上它，不能省。
 *
 * ⚠️ `DEFAULT_LICENSE` 与 `licenseFor()` 已随渲染抽取搬到 `unit-source-render.mjs`
 *   （它们只被渲染 manifest 的 `sources[].license` 用到）。本文件**不再持有第二份** ——
 *   许可缺省值若在这里和那里各写一份，改一处就会让「无声明时的回落值」分叉，
 *   而那正是判据 23 当初要治的「静默降级」的同一个位置。 */

/** 源里声明了内容段的类型集合（与下方 problems 校验同口径，缺哪段就不建哪个包）。
 *  ⚠️ **唯一实现是 `license-policy.mjs` 的 `declaredUnitSourceTypes()`**（含 `UNIT_SOURCE_SEGMENTS` 表）：
 *     本行此前是一份字面量 `['vocabulary','reading','exercise'].filter(...)`，与 `validate.mjs` 的
 *     `UNIT_SOURCE_TYPES` 构成「同一事实两份」—— 靠注释互指维持同步，改一处忘另一处就会让
 *     判据 ①（这里）与判据 24（门禁）口径分叉，且**没有任何机器判据会发现**。
 *     现改为调用共享纯函数，并由 `content:validate` 判据 27 机器上锁「无人自建副本」。 */
const DECLARED_TYPES = declaredUnitSourceTypes(src)

/* ── 校验（写盘前先把内容问题挡住，别让门禁去发现）── */
const problems = []
const has = (k) => src[k] !== undefined && src[k] !== null

/** vocabulary 段接受两种写法：直接给数组（= items），或 {title, description, items}。 */
const vocabItems = Array.isArray(src.vocabulary) ? src.vocabulary : (src.vocabulary?.items ?? null)

if (has('vocabulary')) {
  if (!Array.isArray(vocabItems) || vocabItems.length === 0) problems.push('vocabulary 必须是非空数组（或 {items:[…]}）')
  else {
    const seen = new Set()
    for (const v of vocabItems) {
      if (typeof v?.word !== 'string' || !v.word) problems.push('vocabulary 有条目缺 word')
      if (!v.word) continue
      if (seen.has(v.word)) problems.push(`vocabulary 重复词：${v.word}`)
      seen.add(v.word)
      // translation 是 VOCAB_ITEM_FIELDS 的必填字段；实测既有 9346 词零缺失 ⇒ 这是硬要求
      if (typeof v.translation !== 'string' || !v.translation.trim()) {
        problems.push(`vocabulary「${v.word}」缺 translation（必填；既有 9346 词零缺失）`)
      }
    }
  }
}
if (has('reading')) {
  const ps = src.reading?.paragraphs
  if (!Array.isArray(ps) || ps.length === 0) problems.push('reading.paragraphs 必须是非空数组')
  else if (!ps.every((p) => typeof p === 'string' && p.trim())) problems.push('reading.paragraphs 有非字符串或空段')
}
if (has('exercise')) {
  const qs = src.exercise?.questions
  if (!Array.isArray(qs) || qs.length === 0) problems.push('exercise.questions 必须是非空数组')
  else {
    for (const q of qs) {
      if (typeof q?.id !== 'string') problems.push('exercise 有题目缺 id')
      if (q.type !== 'mcq' && q.type !== 'tfng') problems.push(`${q.id} type 必须是 mcq 或 tfng（实得 ${q.type}）`)
      if (!Array.isArray(q.options) || q.options.length === 0) problems.push(`${q.id} 缺 options`)
      else if (!q.options.some((o) => o.key === q.answer)) problems.push(`${q.id} answer「${q.answer}」不在 options 里`)
      if (typeof q.explanation !== 'string' || !q.explanation.trim()) problems.push(`${q.id} 缺 explanation`)
    }
  }
}
if (!has('vocabulary') && !has('reading') && !has('exercise')) {
  problems.push('vocabulary / reading / exercise 至少要有一段')
}

/* 判据 23 · 许可段 fail-closed —— 「源里声明了某段内容」⇒「源里必须显式声明该段的 license」。
 *
 * 刻意用 `DECLARED_TYPES`（源里实际声明了哪几段）而不是「三段全都必须给」：
 *   只给 vocabulary 的源不必声明 reading/exercise 的许可（那两段根本不会建包），
 *   硬要求三段全给会把「合法的小源」判红 —— 那是假红，比漏判更伤。
 * 反过来，**声明了内容却没声明许可 ⇒ 一律判红**，不给「默认专有」留后门。
 *
 * ⚠️ 这一段挡在**写盘之前**（与 A 组同位置）：降级必须在源这一侧就被拦住，
 *   而不是等落盘后再让下游门禁去发现 —— 落盘即既成事实。 */
for (const type of DECLARED_TYPES) {
  const seg = src.license?.[type]
  if (!seg || typeof seg !== 'object' || Array.isArray(seg)) {
    problems.push(
      `license.${type} 缺段（本源声明了 ${type} 内容）—— 「缺失」≠ 默认允许：`
      + `缺段会静默回落成 redistributable:false，把该包从可再分发降级为不可再分发，且无门会红`,
    )
  }
}
if (problems.length) {
  console.error('[scaffold-unit] 源校验失败：')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

/* ── 渲染（**唯一实现**在 unit-source-render.mjs 的 planUnitSource）──
 * ⚠️ 渲染与比对已抽到 `unit-source-render.mjs`，因为 `content:validate` 的**判据 25**
 *   要做同一件事（源 ↔ 磁盘一致性）却**绝不能 import 本文件** ——
 *   本文件是带 CLI 的脚本，顶层就会 `process.exit`（`--help` / 无参 / 缺 `--src` / 源非法），
 *   import 它 = 让门禁在 CI 里跑 CLI，正是本仓明令禁止的「测试与门禁绝不能 import 生成器」。
 *   两边共用那**一个纯函数** ⇒ 同一事实一份实现，不存在「记得同步两处」。
 *   本文件保留的只是 CLI 外壳：参数解析、写盘、待办打印、把比对结果渲染成人看的文字。
 * ⚠️ 抽取时逐字保留了原有渲染口径（键序、尾随换行、stats 派生、build 戳不参与比对）；
 *   `test:scaffold-unit` 81 条断言全绿即其回归证据。 */
const { packages: out } = planUnitSource(src, { outRoot: OUT_ROOT })

/* ── --check：逐字节比对，证明「现有包能被同一份源重现」── */
if (CHECK) {
  let bad = 0
  /** 路径统一成仓库相对、正斜杠 —— Windows 下直接 replace 根会留下前导反斜杠，
   * 打印出来是 `\content\...`，读着像另一个目录。 */
  const rel = (p) => p.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '')
  /** I/O 注入点：把「读盘」交给调用方，使共享实现 comparePackageToDisk 保持纯函数。 */
  const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)

  for (const p of out) {
    const cmp = comparePackageToDisk(p, readText)
    if (!cmp.payload.exists) {
      console.log(`  ✗ 载荷不存在：${rel(p.payloadPath)}`)
      bad++
      continue
    }
    // ① 载荷：内容本体，允许排版差异，但 JSON 语义必须一致。
    //    三态文案（逐字节一致 / 排版不同 / 不一致）由共享实现给出 —— 本文件不再自述一套，
    //    否则「文案口径」也会变成两份（早期版本就因此在语义真不一致时误导过）。
    console.log(`  ${cmp.payload.ok ? '✓' : '✗'} 载荷 ${cmp.payload.how}：${rel(p.payloadPath)}`)
    if (!cmp.payload.ok) bad++

    if (!cmp.manifest.exists) {
      console.log(`  ✗ manifest 不存在：${rel(p.manifestPath)}`)
      bad++
      continue
    }
    console.log(`  ${cmp.manifest.ok ? '✓' : '✗'} manifest 除 build 戳外全部一致：${rel(p.manifestPath)}`)
    if (!cmp.manifest.ok) {
      for (const d of cmp.manifest.diffs) console.log(`      · ${d}`)
      bad++
    }
  }
  console.log(bad === 0 ? '\n[scaffold-unit] PASS：源与磁盘内容一致（无漂移；build 戳不参与比对）' : `\n[scaffold-unit] FAIL：${bad} 处不一致`)
  process.exit(bad === 0 ? 0 : 1)
}

/* ── 写盘 ── */
for (const p of out) {
  mkdirSync(p.dir, { recursive: true })
  writeFileSync(p.payloadPath, p.payloadText, 'utf8')
  writeFileSync(p.manifestPath, p.manifestText, 'utf8')
  console.log(`✓ 写出 content/${p.dir.replace(OUT_ROOT, '').replace(/^[\\/]/, '')}`)
}

/* ── 顺序表 + PROVIDER：只提示，不自动改 ──
 * 自动改这两个文件会让「生成器」和「脚手架」变成两个都能写它们的入口，
 * 而 ORDER_* 是**契约**（目录有但表没收 = 漏注册，会被门判红）。
 * 这里精确打印要加什么，由人改一次；改完跑 content:generate-registry / content:build 即可。 */
const genSrc = readFileSync(GEN_REG, 'utf8')
// PROVIDER 表已搬到 provider-rules.mjs：待办的「表里有没有这一项」只能查它
const providerRulesSrc = readFileSync(PROVIDER_RULES, 'utf8')
const todo = []
for (const p of out) {
  const { packageId: id, type } = JSON.parse(p.manifestText)
  // ⚠️ 两张表的**形态不同**：vocabulary 只写包名；其余类型是 `'<type>/<dir>'` 形态。
  //    早先统一提示「加 '${id}'」——照着改 ORDER_NONVOCAB 会匹配不上，白改一轮。
  const needle = type === 'vocabulary' ? `'${id}'` : `'${type}/${id}'`
  if (!genSrc.includes(needle)) {
    const where = type === 'vocabulary'
      ? `ORDER_IMPORT 与 ORDER_REGISTRY 加 ${needle}（两张表内容必须不同，追加同一项不会让它俩相等）`
      : `ORDER_NONVOCAB 加 ${needle}（import 段与注册表段共用这一张表，形态是 type/dir）`
    todo.push(`  · scripts/content/generate-registry.mjs：${where}`)
  }
  if (type === 'vocabulary' && !providerRulesSrc.includes(`'${id}': PROVIDER_ORIGINAL`)) {
    todo.push(`  · scripts/content/provider-rules.mjs：PROVIDER 表加 '${id}': PROVIDER_ORIGINAL（不登记会被写成 provider:'unknown'，由 gate:provider 判据 A 硬拦）`)
  }
}
todo.push('  · src/data/learningUnits.ts：新增单元（bankId = 词汇包 id，attached 指向 reading / exercise）')
todo.push('  · src/i18n/{zh,en}.ts：新增 unit.<NN>.title / unit.<NN>.summary')
todo.push('  · npm run content:generate-registry && npm run content:build && npm run content:validate')

console.log('\n[scaffold-unit] 内容包已写出。剩余手工步骤（产品决策，不自动改）：')
for (const t of todo) console.log(t)
