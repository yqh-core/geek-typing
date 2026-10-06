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
 *
 * ── 铁律 ──
 *   · checksum 一律走 license-policy.mjs 的 checksumPayload（唯一实现，禁止手搓）
 *   · --check 只校验不写盘，用于证明「现有包能被同一份源重现」（幂等 / 无漂移）
 *   · **落盘形态一律走 canonical.mjs 的 canonicalFile()**（唯一实现，禁止 JSON.stringify 直写）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checksumPayload, PROVIDER_ORIGINAL } from './license-policy.mjs'
import { canonicalFile } from './canonical.mjs'

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
  "license": {                // 可缺省；**按内容类型**分别指定，缺省 = 自有专有 + 不可再分发
    "vocabulary": { "name": "MIT License", "spdx": "MIT", "url": "https://opensource.org/licenses/MIT",
                    "commercialUse": true, "attributionRequired": false, "redistributable": true }
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
const origin = src.origin ?? 'original authored content'
const builtAt = `${publishedAt}T00:00:00.000Z`

/* ── license：按内容类型分别取，默认「自有专有 + 不可再分发」──
 * 为什么必须**分段**而不是整个 unit 一个值：本 unit 的 vocabulary 包已改标 MIT（可开源），
 * 而同 unit 的 reading / exercise 仍是 Proprietary（不可再分发）。
 * 脚手架若写死单一许可，产出的 manifest 就与仓库现状漂移 ⇒ D 组「反向源可重现」幂等判据判红
 *   （实测：加 redistributable 后 D-1/D-2 由 72 PASS 掉到 70 PASS / 2 FAIL —— 真回归，已修）。
 * 故许可随内容类型走：`src.license.<vocabulary|reading|exercise>`，缺省用 DEFAULT_LICENSE。
 *
 * `redistributable` 是**必填**显式声明（license-policy:decideLicense 第三维，缺失即判红），
 * 故默认值也必须带上它，不能省。 */
const DEFAULT_LICENSE = { name: 'Proprietary (self-curated)', commercialUse: true, attributionRequired: false, redistributable: false }
/** 取某类型的许可：源里显式给了就用（逐字段合并，缺字段回落默认），否则整块用默认。 */
const licenseFor = (type) => {
  const override = src.license?.[type]
  if (!override || typeof override !== 'object' || Array.isArray(override)) return { ...DEFAULT_LICENSE }
  return { ...DEFAULT_LICENSE, ...override }
}

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
if (problems.length) {
  console.error('[scaffold-unit] 源校验失败：')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

/* ── 渲染 ── */
/** 造一条 source：许可按**内容类型**取（见上方 licenseFor）——
 *  vocabulary 可能已是 MIT（可开源），reading / exercise 仍为专有（不可再分发）。
 *  `redistributable` 必填（license-policy:decideLicense 第三维，缺失即判红）⇒ 默认值也必须带。 */
const sourceOf = (type) => ({
  checksum: null, // 占位，下面按包填入
  origin,
  provider: PROVIDER_ORIGINAL,
  importedAt: publishedAt,
  license: licenseFor(type),
})

/** 造一个包：payload 落盘 + manifest（checksum 走唯一实现）。返回 {dir, payloadPath, manifestPath, payload, manifest} */
function buildPackage(type, id, payload, title, description, icon, extraManifest = {}) {
  const dir = join(OUT_ROOT, type, id)
  const payloadName = type === 'vocabulary' ? 'words.json' : 'items.json'
  const checksum = checksumPayload(payload)
  const namespace = `curated-${id}`
  const s = { ...sourceOf(type), checksum }
  const manifest = {
    schemaVersion: 4,
    packageId: id,
    namespace,
    contentRevision: 1,
    contentVersion: 1,
    contentChecksum: checksum,
    contentPublishedAt: publishedAt,
    contentHistory: [{ revision: 1, version: 1, checksum, publishedAt }],
    build: { toolVersion: 'scaffold-unit/1.0', builtAt, sourceChecksum: checksum },
    id: `content:${type}:${namespace}:${id}`,
    type,
    version: '1.0.0',
    title,
    description,
    language: 'en',
    icon,
    tags: TAGS,
    features: {},
    // stats 三个类型的包都有（实测 reading/exercise 磁盘上是 {items:1}），
    // 只给 vocabulary 传会让另外两类渲染出「没有 stats」的 manifest ⇒ --check 假红
    stats: { items: payload.length },
    sources: [s],
    offline: { policy: 'lazy', supported: true },
    ...extraManifest,
  }
  return {
    dir,
    payloadPath: join(dir, payloadName),
    manifestPath: join(dir, 'manifest.json'),
    /* ⚠️ **manifest 与 payload 的落盘形态不是同一套**，别图省事一起 canonicalFile：
     *   · manifest → canonicalFile()（递归键序归一 + 尾随换行）。仓库里**每一个** manifest 都是这个形态
     *     （实测 27/27：canonicalFile(JSON.parse(磁盘)) === 磁盘），因为 content:build 用它落盘。
     *   · payload  → JSON.stringify(payload) + 尾随换行（**保留字面插入序，不排序键**）。
     *     实测 reading/exercise 的 items.json **不是** canonical 形态：磁盘键序是
     *     `id,title,body,paragraphs`（插入序），而 canonicalize 会排成 `body,id,paragraphs,title`。
     *     载荷是**内容本体**，键序带阅读语义（先 id 再 title 再 body），不该被构建器重排。
     *   · 两者都补尾随换行：canonical.mjs:88 明确写了这是 POSIX 文本文件惯例
     *     （避免 diff 出现 "\ No newline at end of file"）。
     *     ⚠️ 实测既有 items.json **缺**这个换行（末字节 `5d`），而 content:build 写的 words.json 有（`0a`）
     *     —— 同一仓两套排版约定。补齐的理由不是「-disk 上就该这样」，而是 canonical.mjs 已把它写成
     *     全仓文本文件约定，且 git diff 的 "\ No newline at end of file" 标记本身就会污染 review：
     *     任何一次触碰该文件都会显示「最后一行被改」，而实际只差一个换行。
     *
     *   实测踩过的坑：本脚本原先对两者都直写 JSON.stringify（无换行、manifest 按插入序），
     *   产出与仓库既有形态不一致 ⇒ 重跑一次就在 git 里留下一批「只有键序和换行不同」的脏改动，
     *   而内容其实零变化 —— 那种形态让 review 无法区分真漂移与假漂移。
     *   而 npm run content:build 只归一 content/vocabulary/（build.mjs:105-113 显式跳过其它类型），
     *   所以 reading / exercise 的错形态不会被后续步骤自动修回来。
     *   ⚠️ canonicalFile 与 checksum 同源（checksum 只对 canonicalize 结果算、不含尾随换行），
     *   故改落盘形态**不会**改动任何 contentChecksum / sources[].checksum。 */
    payloadText: `${JSON.stringify(payload)}\n`,
    manifestText: canonicalFile(manifest),
    statsItems: payload.length,
  }
}

const TAGS = Array.isArray(src.tags) ? src.tags : ['ielts', 'academic']
const out = []
if (has('vocabulary')) {
  const words = vocabItems.map((v) => {
    const o = { word: v.word, translation: v.translation }
    if (v.phonetic) o.phonetic = v.phonetic
    if (v.definition) o.definition = v.definition
    return o
  })
  const vTitle = src.vocabulary?.title ?? `${prefix} — Core Vocabulary`
  const vDesc = src.vocabulary?.description ?? `单元核心词汇 ${words.length} 词`
  out.push(buildPackage('vocabulary', `${prefix}-vocab`, words, vTitle, vDesc, 'GraduationCap',
    // vocabulary 包的 stats 由 content:build 派生（含 phonetic/definition 计数），这里先给 items
    { stats: { items: words.length, phonetic: words.filter((w) => w.phonetic).length, definition: words.filter((w) => w.definition).length } }))
}
if (has('reading')) {
  const paras = src.reading.paragraphs
  out.push(buildPackage('reading', `${prefix}-reading`,
    [{ id: `${prefix}-passage`, title: src.reading.itemTitle ?? src.reading.title ?? 'Reading passage', body: paras.join('\n\n'), paragraphs: paras }],
    src.reading.title ?? `${prefix} — Reading`, src.reading.description ?? '单元阅读篇章', 'BookOpen'))
}
if (has('exercise')) {
  out.push(buildPackage('exercise', `${prefix}-exercise`,
    [{
      id: `${prefix}-practice`,
      title: src.exercise.itemTitle ?? src.exercise.title ?? `${prefix} — Practice Set`,
      questions: { items: src.exercise.questions, collocations: src.exercise.collocations ?? [] },
    }],
    src.exercise.title ?? `${prefix} — Practice`, src.exercise.description ?? '单元练习题（含答案与解析）', 'Dumbbell'))
}

/* ── --check：逐字节比对，证明「现有包能被同一份源重现」── */
if (CHECK) {
  let bad = 0
  /** 去掉 `build` 后按 JSON 语义比 —— `build` 是**构建戳**（toolVersion / builtAt / sourceChecksum），
   *  记的是「谁在什么时候构建」，不同构建器本就该不同（实测三个包分别是
   *  content-build/1.1、hand-authored/1.0、scaffold-unit/1.0）。拿它判漂移只会造出假红。
   *  内容身份（id / type / contentChecksum / sources[].checksum）仍逐项比对。 */
  const withoutBuild = (m) => {
    const c = { ...m }
    delete c.build
    return stable(c)
  }
  /** 键序无关的递归稳定序列化 —— manifest 的 stats 键序因构建器而异
   *  （实测 {phonetic,definition,items} vs {items,phonetic,definition}），
   *  直接 JSON.stringify 会把「键序不同」误判成内容漂移。 */
  const stable = (v) => {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    }
    return JSON.stringify(v)
  }
  const canon = (s) => JSON.stringify(JSON.parse(s))
  /** 路径统一成仓库相对、正斜杠 —— Windows 下直接 replace 根会留下前导反斜杠，
   *  打印出来是 `\content\...`，读着像另一个目录。 */
  const rel = (p) => p.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '')
  /** 全字段递归 diff，返回人类可读的差异行。
   *  ⚠️ 不能只 diff 一个「重要的键」白名单：实测 reading/exercise 的差异是 stats，
   *  压根不在白名单里 ⇒ 报红但不打印任何细节，等于让人猜。要 diff 就全 diff。 */
  const kindOf = (v) => (Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'object' : 'primitive')
  const diffPaths = (disk, gen, path = '', acc = []) => {
    const at = path || '(root)'
    const ka = kindOf(disk)
    const kb = kindOf(gen)
    if (ka !== kb) {
      acc.push(`${at}: 类型不同（磁盘=${ka} / 源渲染=${kb}）`)
      return acc
    }
    if (ka === 'primitive') {
      if (disk !== gen) acc.push(`${at}: 磁盘=${JSON.stringify(disk)} / 源渲染=${JSON.stringify(gen)}`)
      return acc
    }
    if (ka === 'array') {
      if (disk.length !== gen.length) acc.push(`${at}: 数组长度 磁盘=${disk.length} / 源渲染=${gen.length}`)
      for (let i = 0; i < Math.min(disk.length, gen.length); i++) diffPaths(disk[i], gen[i], `${path}[${i}]`, acc)
      return acc
    }
    for (const k of [...new Set([...Object.keys(disk), ...Object.keys(gen)])].sort()) {
      const p = path ? `${path}.${k}` : k
      const inDisk = Object.prototype.hasOwnProperty.call(disk, k)
      const inGen = Object.prototype.hasOwnProperty.call(gen, k)
      if (!inGen) acc.push(`${p}: 源渲染缺少此键（磁盘=${JSON.stringify(disk[k])}）`)
      else if (!inDisk) acc.push(`${p}: 磁盘缺少此键（源渲染=${JSON.stringify(gen[k])}）`)
      else diffPaths(disk[k], gen[k], p, acc)
    }
    return acc
  }

  for (const p of out) {
    if (!existsSync(p.payloadPath)) {
      console.log(`  ✗ 载荷不存在：${rel(p.payloadPath)}`)
      bad++
      continue
    }
    // ① 载荷：内容本体，允许排版差异，但 JSON 语义必须一致
    const diskPayload = readFileSync(p.payloadPath, 'utf8')
    const byteSame = diskPayload === p.payloadText
    const payloadSame = byteSame || canon(diskPayload) === canon(p.payloadText)
    // 文案必须区分三种状态：逐字节 / JSON 语义一致（排版不同）/ 不一致。
    // 早先只在「非逐字节」时统一打印「JSON 语义一致」，语义其实也不一致时会误导。
    const how = byteSame ? '逐字节一致' : payloadSame ? 'JSON 语义一致（排版不同）' : '不一致'
    console.log(`  ${payloadSame ? '✓' : '✗'} 载荷 ${how}：${rel(p.payloadPath)}`)
    if (!payloadSame) bad++

    if (!existsSync(p.manifestPath)) {
      console.log(`  ✗ manifest 不存在：${rel(p.manifestPath)}`)
      bad++
      continue
    }
    const diskM = JSON.parse(readFileSync(p.manifestPath, 'utf8'))
    const genM = JSON.parse(p.manifestText)
    const mSame = withoutBuild(diskM) === withoutBuild(genM)
    console.log(`  ${mSame ? '✓' : '✗'} manifest 除 build 戳外全部一致：${rel(p.manifestPath)}`)
    if (!mSame) {
      for (const d of diffPaths(diskM, genM)) console.log(`      · ${d}`)
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
