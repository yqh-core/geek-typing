/* unit-source-render.mjs —— 单元内容源 ⇄ 内容包 的**纯渲染与纯比对**（无副作用）
 *
 * ── 为什么存在（本轮抽它出来是为了治「同一事实两份实现」）──
 * 「源能不能还原出磁盘上现有的包」这件事，本仓库一度只有**一个**观测点：
 * `node scripts/content/scaffold-unit.mjs --src=<源> --check`。2026-10-07 起它在 CI 里成了一步，
 * 但它**只以「CI YAML 里存在某个 step」的形式生效** —— 有人把这一步删掉，比对能力就静默归零，
 * 而门禁里没有任何东西会发现（判据 24 只查 license 段声明，源里词条/段落被改它看不见）。
 *
 * ⇒ `content:validate` 的**判据 25** 要在门禁内部做同一件事。但它**绝不能 import
 *   `scaffold-unit.mjs`**：那是带 CLI 的脚本，顶层就会 `process.exit`（`--help`/无参/缺 `--src`/
 *   源非法），import 它等于让门禁在 CI 里跑 CLI —— 这正是本仓明令禁止的
 *   「测试/门禁绝不能 import 生成器」（import 即触发其 CLI 段的真写盘/真退出）。
 *
 * ⛔ **因此绝不能把渲染逻辑在 validate.mjs 里重写一遍**：那就是「同一事实两份互不感知的实现」，
 *   改一处忘另一处 ⇒ 脚手架能还原、门禁说能还原，而其实不能（或反之）—— 与本仓反复吃过的
 *   「真相同步两份」同型。故本模块把**渲染 + 比对**抽成纯函数：
 *
 *     scaffold-unit.mjs --check  ─┐
 *                                 ├─→ planUnitSource() / comparePackageToDisk()  ← 唯一实现
 *     content:validate 判据 25   ─┘
 *
 *   两个调用方**共用同一条实现**，因此不存在「记得同步两处」这回事。
 *   判据 25 的注释里再次写明两者关系（观测点不同、事实唯一）。
 *
 * ── 为什么本文件必须是纯的 ──
 *   · 不读文件（除 `localDay` 取当前时钟这一项，且允许注入 `today`）
 *   · 不写盘、**不 mkdir**
 *   · 不看 `process.argv`、不 `process.exit`、无任何顶层副作用
 *   —— 因为它被两条路径共用：一条是本机 CLI，一条是 CI 门禁。任何顶层副作用都会被门禁继承。
 *   `content:validate` 的证伪还会**真的 import 本模块**（传变异参数），若本文件有任何副作用，
 *   那条证伪就会污染真仓库。
 *
 * ── 铁律 ──
 *   · checksum 一律走 license-policy.mjs 的 checksumPayload（唯一实现，禁止手搓）
 *   · 落盘形态一律走 canonical.mjs 的 canonicalFile()（唯一实现，禁止 JSON.stringify 直写）
 *   · 包 id 一律走 license-policy.mjs 的 unitPackageIdOf()（唯一实现，判据 26 靠它连接源与包）
 *   · 载荷文件名一律走 license-policy.mjs 的 payloadNameOf()（唯一实现）
 *   · 段类型一律走 license-policy.mjs 的 UNIT_SOURCE_SEGMENTS（唯一实现，判据 27 上锁）
 *
 * ⚠️ **本模块的输出必须与磁盘上现有包逐字节一致**（判据 25 与脚手架 --check 都在比这件事）。
 *   故任何渲染改动都要先问：「磁盘上那 9 个包还能被这批源还原吗？」——
 *   判据 25 就是那道问句的机器化，它跑在 CI 里。
 */
import {
  checksumPayload,
  payloadNameOf,
  PROVIDER_ORIGINAL,
  UNIT_SOURCE_SEGMENTS,
  declaredUnitSourceTypes,
  unitSourceSegment,
  unitPackageIdOf,
} from './license-policy.mjs'
import { canonicalFile } from './canonical.mjs'

/* ── 本地日历日（格式 YYYY-MM-DD，d 缺省为当前时刻）──
 * ⚠️ 必须走 getFullYear/getMonth/getDate 拼**本地**日，**不能**用 toISOString().slice(0,10)：
 *   后者给的是 **UTC** 日历日，而「内容发布日期」的语义是**本地**日历日。
 *   在 GMT+8 的 00:00–08:00 窗口里，本地已经是新的一天、UTC 还停在前一天，
 *   UTC 口径会把 PM 按本地写的「今天」判成未来日期并被脚手架拒掉，当场挡住合法内容。
 *   这个窗口本仓库天天踩（南京的 PM 写内容 + 凌晨跑 CI 都在里面）。
 *   月/日要补零：getMonth() 从 0 起，且 1 月 9 日不补零会得到 "2026-1-9" ——
 *   既不是合法日期格式，也破坏「定长 ⇒ 字典序 == 时间序」这个前提。 */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* ── 许可缺省值 ──
 * `redistributable` 是 license-policy.mjs:decideLicense 的**第三维必填项**（缺失即 rejected），
 * 故合并默认值时也必须带上它，不能省。 */
const DEFAULT_LICENSE = { name: 'Proprietary (self-curated)', commercialUse: true, attributionRequired: false, redistributable: false }

/**
 * 取某类型的许可：源里的显式声明覆盖缺省。
 * ⚠️ 脚手架判据 ① / 判据 24 会在**更早的位置**挡住「声明了内容段却没声明该段 license」，
 *   所以这里保留缺省回落只是防御性兜底 —— 回落值是 `redistributable:false`（**更严**的一侧），
 *   不是「更宽」，故万一漏过校验也不会造成「静默放宽许可」。 */
export const licenseFor = (src, type) => {
  const override = src.license?.[type]
  if (!override || typeof override !== 'object' || Array.isArray(override)) return { ...DEFAULT_LICENSE }
  return { ...DEFAULT_LICENSE, ...override }
}

/** 造一条 source：许可按**内容类型**取（vocabulary 可能已是 MIT 可开源，reading/exercise 仍为专有）。 */
const sourceOf = (src, type, publishedAt, origin, checksum) => ({
  checksum,
  origin,
  provider: PROVIDER_ORIGINAL,
  importedAt: publishedAt,
  license: licenseFor(src, type),
})

/**
 * 把源渲染成「应当落成什么包」的**纯计划**（不含任何 I/O）。
 *
 * @param {object} src 解析后的单元源对象
 * @param {{outRoot: string, today?: string}} opts
 *   · outRoot —— 包根目录（脚手架传真实 content/ 或 --out-root；判据 25 传 content/）
 *   · today   —— 本地日历日 'YYYY-MM-DD'，仅在源**未给** publishedAt 时参与缺省。
 *                可注入是为了让判据 25 / 证伪的输出可复现（否则「缺 publishedAt 的源」判据会随时钟漂）。
 * @returns {{prefix: string, publishedAt: string, builtAt: string, origin: string,
 *            tags: string[], declared: string[], packages: object[]}}
 *   `declared` 是源实际声明了哪几段（唯一实现 declaredUnitSourceTypes，由调用方传入以免二次解析）。
 */
export function planUnitSource(src, { outRoot, today = localDay() } = {}) {
  const prefix = src.packagePrefix
  const publishedAt = src.publishedAt ?? today
  const builtAt = `${publishedAt}T00:00:00.000Z`
  const origin = src.origin ?? 'original authored content'
  const tags = Array.isArray(src.tags) ? src.tags : ['ielts', 'academic']

  const has = (k) => src[k] !== undefined && src[k] !== null
  // ⚠️ 「已声明哪几段」必须走唯一实现（license-policy.mjs），⛔ 不许在本文件再写一份字面量 ——
  //   本模块同时喂给脚手架与判据 25，它若自己持一份段表，就等于把「两份字面量」的病
  //   从两个文件搬进了「一个文件 + 一个门禁」，分叉风险原封不动。
  const declared = declaredUnitSourceTypes(src, UNIT_SOURCE_SEGMENTS)
  const packages = []

  /** 造一个包：payload 文本 + manifest 文本（checksum 走唯一实现）。 */
  const buildPackage = (type, id, payload, title, description, icon, extraManifest = {}) => {
    const checksum = checksumPayload(payload)
    const namespace = `curated-${id}`
    const s = sourceOf(src, type, publishedAt, origin, checksum)
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
      tags,
      features: {},
      // stats 三个类型的包都有（实测 reading/exercise 磁盘上是 {items:1}），
      // 只给 vocabulary 传会让另外两类渲染出「没有 stats」的 manifest ⇒ 比对假红
      stats: { items: payload.length },
      sources: [s],
      offline: { policy: 'lazy', supported: true },
      ...extraManifest,
    }
    return {
      type,
      packageId: id,
      dir: `${outRoot}/${type}/${id}`,
      payloadPath: `${outRoot}/${type}/${id}/${payloadNameOf(type)}`,
      manifestPath: `${outRoot}/${type}/${id}/manifest.json`,
      relDir: `${type}/${id}`,
      relPayloadPath: `${type}/${id}/${payloadNameOf(type)}`,
      relManifestPath: `${type}/${id}/manifest.json`,
      payload,
      checksum,
      /* ⚠️ **manifest 与 payload 的落盘形态不是同一套**，别图省事一起 canonicalFile：
       *   · manifest → canonicalFile()（递归键序归一 + 尾随换行）。仓库里**每一个** manifest 都是这个形态
       *     （实测 27/27：canonicalFile(JSON.parse(磁盘)) === 磁盘），因为 content:build 用它落盘。
       *   · payload  → JSON.stringify(payload) + 尾随换行（**保留字面插入序，不排序键**）。
       *     实测 reading/exercise 的 items.json **不是** canonical 形态：磁盘键序是
       *     `id,title,body,paragraphs`（插入序），而 canonicalize 会排成 `body,id,paragraphs,title`。
       *     载荷是**内容本体**，键序带阅读语义（先 id 再 title 再 body），不该被构建器重排。
       *   两者都补尾随换行：canonical.mjs 明确写了这是 POSIX 文本文件惯例
       *     （避免 diff 出现 "\ No newline at end of file"）。
       *     ⚠️ 实测既有 items.json **缺**这个换行（末字节 `5d`），而 content:build 写的 words.json 有（`0a`）
       *     —— 同一仓两套排版约定。补齐的理由不是「-disk 上就该这样」，而是 canonical.mjs 已把它写成
       *     全仓文本文件约定，且 git diff 的 "\ No newline at end of file" 标记本身就会污染 review。
       *
       *   ⚠️ canonicalFile 与 checksum 同源（checksum 只对 canonicalize 结果算、不含尾随换行），
       *     故改落盘形态**不会**改动任何 contentChecksum / sources[].checksum。 */
      payloadText: `${JSON.stringify(payload)}\n`,
      manifestText: canonicalFile(manifest),
      statsItems: payload.length,
    }
  }

  if (has('vocabulary')) {
    const items = Array.isArray(src.vocabulary) ? src.vocabulary : (src.vocabulary?.items ?? [])
    const words = items.map((v) => {
      const o = { word: v.word, translation: v.translation }
      if (v.phonetic) o.phonetic = v.phonetic
      if (v.definition) o.definition = v.definition
      return o
    })
    const vTitle = src.vocabulary?.title ?? `${prefix} — Core Vocabulary`
    const vDesc = src.vocabulary?.description ?? `单元核心词汇 ${words.length} 词`
    packages.push(buildPackage('vocabulary', unitPackageIdOf(prefix, 'vocabulary'), words, vTitle, vDesc, unitSourceSegment('vocabulary').icon,
      // vocabulary 包的 stats 由 content:build 派生（含 phonetic/definition 计数），这里先给 items
      { stats: { items: words.length, phonetic: words.filter((w) => w.phonetic).length, definition: words.filter((w) => w.definition).length } }))
  }
  if (has('reading')) {
    const paras = src.reading.paragraphs
    packages.push(buildPackage('reading', unitPackageIdOf(prefix, 'reading'),
      [{ id: `${prefix}-passage`, title: src.reading.itemTitle ?? src.reading.title ?? 'Reading passage', body: paras.join('\n\n'), paragraphs: paras }],
      src.reading.title ?? `${prefix} — Reading`, src.reading.description ?? '单元阅读篇章', unitSourceSegment('reading').icon))
  }
  if (has('exercise')) {
    packages.push(buildPackage('exercise', unitPackageIdOf(prefix, 'exercise'),
      [{
        id: `${prefix}-practice`,
        title: src.exercise.itemTitle ?? src.exercise.title ?? `${prefix} — Practice Set`,
        questions: { items: src.exercise.questions, collocations: src.exercise.collocations ?? [] },
      }],
      src.exercise.title ?? `${prefix} — Practice`, src.exercise.description ?? '单元练习题（含答案与解析）', unitSourceSegment('exercise').icon))
  }

  return { prefix, publishedAt, builtAt, origin, tags, declared, packages }
}

/* ── 比对用的纯工具 ── */

/** 键序无关的递归稳定序列化 —— manifest 的 stats 键序因构建器而异
 *  （实测 {phonetic,definition,items} vs {items,phonetic,definition}），
 *  直接 JSON.stringify 会把「键序不同」误判成内容漂移。 */
export const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** 去掉 `build` 后按 JSON 语义比 —— `build` 是**构建戳**（toolVersion / builtAt / sourceChecksum），
 *  记的是「谁在什么时候构建」，不同构建器本就该不同（实测三个包分别是
 *  content-build/1.1、hand-authored/1.0、scaffold-unit/1.0）。拿它判漂移只会造出假红。
 *  内容身份（id / type / contentChecksum / sources[].checksum）仍逐项比对。 */
export const withoutBuild = (m) => {
  const c = { ...m }
  delete c.build
  return stable(c)
}

/** 键序无关的载荷比较用：解析后重新序列化，消掉「排版不同 / 键序不同」。 */
export const canonJson = (s) => JSON.stringify(JSON.parse(s))

/** 全字段递归 diff，返回人类可读的差异行。
 *  ⚠️ 不能只 diff 一个「重要的键」白名单：实测 reading/exercise 的差异是 stats，
 *  压根不在白名单里 ⇒ 报红但不打印任何细节，等于让人猜。要 diff 就全 diff。 */
const kindOf = (v) => (Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'object' : 'primitive')
export function diffPaths(disk, gen, path = '', acc = []) {
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

/**
 * 把「渲染出的包」与「磁盘上的包」逐项比对 —— **纯函数**，I/O 由调用方注入。
 *
 * @param {object} pkg planUnitSource() 的一个包条目
 * @param {(p: string) => string|null} readText 读文本；返回 null 表示文件不存在
 * @returns {{ok: boolean, payload: object, manifest: object}}
 *   payload  = { exists, byteSame, semanticSame, ok, how }
 *   manifest = { exists, ok, diffs }
 *
 * 三态文案必须区分清楚（早期版本把「非逐字节」一律说成「JSON 语义一致」，
 * 语义其实不一致时会**误导** —— 那比假红更危险）：
 *   · '逐字节一致'      —— 文件与源渲染完全相同
 *   · 'JSON 语义一致（排版不同）' —— 键序/缩进不同但内容相同
 *   · '不一致'          —— 内容真的不同
 */
export function comparePackageToDisk(pkg, readText) {
  const diskPayload = readText(pkg.payloadPath)
  if (diskPayload === null) {
    return {
      ok: false,
      payload: { exists: false, byteSame: false, semanticSame: false, ok: false, how: '不存在' },
      manifest: { exists: false, ok: false, diffs: ['（载荷不存在，未继续比对 manifest）'] },
    }
  }
  const byteSame = diskPayload === pkg.payloadText
  const semanticSame = byteSame || canonJson(diskPayload) === canonJson(pkg.payloadText)
  const how = byteSame ? '逐字节一致' : semanticSame ? 'JSON 语义一致（排版不同）' : '不一致'

  const diskManifest = readText(pkg.manifestPath)
  if (diskManifest === null) {
    return {
      ok: false,
      payload: { exists: true, byteSame, semanticSame, ok: semanticSame, how },
      manifest: { exists: false, ok: false, diffs: [] },
    }
  }
  const mOk = withoutBuild(JSON.parse(diskManifest)) === withoutBuild(JSON.parse(pkg.manifestText))
  return {
    ok: semanticSame && mOk,
    payload: { exists: true, byteSame, semanticSame, ok: semanticSame, how },
    manifest: { exists: true, ok: mOk, diffs: mOk ? [] : diffPaths(JSON.parse(diskManifest), JSON.parse(pkg.manifestText)) },
  }
}
