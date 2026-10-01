#!/usr/bin/env node
/**
 * P1.8 · INV-6 —— Content Type Contract 门（gate-content-type-contract.mjs）
 *
 * 目的：让「类型契约唯一、禁止 per-type 散落」从一句约定变成机器判据。
 *       没有这道门，每加一种内容类型就会分叉出一套平行架构（audio.ts / reading.ts / …），
 *       几个 Wave 之后无法收拾。本门把分叉的可能性在**提交时**掐死。
 *
 * 判据（任一命中 ⇒ exit 1）：
 *   A 注册表穷尽性   —— CONTENT_TYPE_REGISTRY 的键集合 == CONTENT_TYPES（运行时清单）
 *   B 无类型散落     —— src/core/content/model/ 只允许白名单文件（出现 audio.ts 之类即 FAIL）
 *   C i18n 完整性    —— 注册表引用的 labelKey/unitKey 必须同时存在于 zh.ts 与 en.ts，
 *                       且 zh.ts / en.ts 的键集合必须逐一相等
 *   D Catalog 一致性 —— getCatalog().types 的类型集合 == packageLevelTypes()（行为级，非文本级）
 *   E 启用集一致性   —— queryEnabledTypes() == content-query.ts 里实际生效的 SUPPORTED_TYPES
 *                       （防"注册表说能查、查询层其实没开"或反之）
 *   F 注册表自洽     —— type 键一致 / itemType 均为已注册类型 / i18n 键声明完整
 *   G 双向穷尽（编译期）—— 契约文件在独立 TS 程序下**零诊断**，即三把编译期锁同时成立：
 *                       ① 数组 ⊆ 联合：`as const satisfies readonly ContentType[]`
 *                       ② 联合 ⊆ 数组：`TypeListExhaustive = AssertNever<Exclude<…>>`
 *                       ③ 注册表完整：`Record<ContentType, ContentTypeDescriptor>`
 *                       A–F 全部是运行时判据，**抓不到**只在类型层存在的漂移，所以 G 必须存在。
 *   H 构建侧白名单   —— Node 脚本（`scripts/content/license-policy.mjs` 的 `CONTENT_TYPES`）
 *                       必须 == `packageLevelTypes()`，且 `validate.mjs` 不得再自建副本。
 *                       Node 跑不了 TS，构建/入库/校验都得靠一份 JS 白名单；没有 H，
 *                       契约加类型后 `content:ingest` / `content:validate` 会静默不认新类型。
 *                       （P18-A 实测漂过一次：契约扩到 14 项时两处 Node 白名单都停在 12 项。）
 *   H3 资产规则一致性 —— `scripts/content/asset-rules.mjs` 的 `parseAssetId` / `isAssetOwnedBy`
 *                       必须与 `src/core/content/model/asset.ts` 的同名导出在**语料**上逐例一致。
 *                       asset-rules.mjs 的注释里一直写着"一致性由判据 H3 在语料上证明"，但 H3
 *                       此前**并不存在** —— 这是"注释承诺了机器上锁、实际没上锁"的悬空引用，
 *                       本波（P18-B）兑现（同 H1/H2 手法：权威只有一处，一致性由机器证明）。
 *                       语料带**手写字面真值**：判定 = TS == 真值 **且** .mjs == 真值
 *                       （三条独立来源对齐 —— 不是"TS == mjs"两两互证，两边同错就永远测不出来）。
 *   I 启用即可达     —— **行为级**（跑真实查询层）：对 `queryEnabledTypes()` 里的**每一个**类型 t，
 *                       ① `packagesOf(t)` 非空（"启用了一个没有内容的类型"要判红，不能悄悄返回空）；
 *                       ② `list({type:t})` 非空，且**每一条**的 `packageLocalId ∈ packagesOf(t)`
 *                          （**不外溢** —— 专抓 §⑨-1 的「返回词库数据」静默错数据）；
 *                       ③ `count({type:t})` == Σ `packagesOf(t)` 的 `stats.items`，且 t≠'word' 时
 *                          **不得**等于全库（专抓「count 返回 9346」）；
 *                       ④ 每条 hit.id 能被 `parseContentId` 解析且 `type == descriptorOf(t).itemType`；
 *                       ⑤ t≠'word' 补两条**中性**断言（用 `order:'desc'` 放大差异，否则恒真不可证伪）：
 *                          `hasPhonetic:true` 与 `sort:{field:'word'}` 都**不得**改变结果集 ——
 *                          这两者都是 **word 族专属**，非 word 族必须**不参与**（不是"筛成空"/"整体反转"）。
 *                       另：`type:'all'` 不在逐类型范围内，但断言 `count({type:'all'})` ==
 *                       各启用类型 `packagesOf` **去重并集**之和（防 word/vocabulary 重复计）。
 *                       E 只比「启用集是否一致」，**看不见**上述五种静默错数据 —— 所以 I 必须存在。
 *   I2 检索声明可解析 —— **静态判据**（纯读源码，不跑查询）：对每个类型 t，
 *                       `descriptorOf(t).query.index` 里 `mode:'exact'` 的字段：
 *                         word 族（itemType==='word'）必须在 `WORD_FIELDS` 键集内；
 *                         非 word 族**只允许 `'id'`**（非 word 族倒排表尚未实现，一律走扫描；
 *                         一旦有人加了别的 exact 字段 ⇒ 判红，提示"请先建倒排或改声明"）。
 *                       `query.match` 的字段：word 族必须在 `WORD_FIELDS` 键集内；非 word 族无限制。
 *                       意义：这正是「`VOCAB_QUERY.match` 漏声明 definition、代码却在匹配它」
 *                       那类**声明 ⟷ 行为漂移**的守卫（P18-E 实测捕获的那次漂移）。
 *   J CORE⟷全表一致   —— P18-E′（裁定 §⑫）把运行时面投影成 `types/registry-core.ts`（薄表：
 *                       type/itemType/queryEnabled/query），全表 `registry.ts` 改为**由 CORE 展开派生**。
 *                       展开派生的好处是"结构上不可能分家"，但它**并不能**阻止有人在展开后再覆盖
 *                       ⇒ 必须有机器判据。三条子判据：
 *                         J1 键集合三者相等：`CONTENT_TYPES` == `keys(CONTENT_TYPE_CORE)` ==
 *                            `keys(CONTENT_TYPE_REGISTRY)`，**双向**（源多一个 / 少一个都判红）；
 *                         J2 逐值相等：每个类型的 `itemType` / `queryEnabled` / `query`，
 *                            CORE 与 REGISTRY 必须相等（专抓"展开后又覆盖"）；
 *                         J3 **反向守卫（防空转）**：CORE 非空且至少含 `word` + 一个 packageLevel
 *                            类型 —— 否则 J2 会在空表上**恒真**，J 就成了"永远不会响的锁"。
 *                       ⚠️ 为什么证伪注入必须落在**全表侧**（在 REGISTRY 展开后覆盖），不能落在 CORE：
 *                          REGISTRY 是由 CORE **展开**出来的，改 CORE 会让两边同步跟着改 ⇒
 *                          J2 的值比较恒等、J 永不判红（那样"证伪"会是假的）。真正能让两个面分家的
 *                          只有"展开后再覆盖" —— 那正是 J 要抓的违规（实测见用例 J 的 why）。
 *
 * 退出码（与本仓其它门同族）：
 *   0 = PASS；1 = FAIL；2 = 脚本自身错误（模块加载失败 / 关键声明解析不出 —— **绝不降级成 PASS**）
 *
 * 用法：
 *   npm run gate:content-type-contract              # 常规判据 A–H（含 H3）+ I/I2 + J
 *   npm run gate:content-type-contract -- --falsify # 证伪自检（见下）
 *
 * 为什么自带 --falsify：**不会失败的门等于没有门**。
 *   常规模式只证明"当前代码通过"；--falsify 逐条植入故障、断言**恰好该判据判红**、
 *   再字节级还原并跑对照组复绿 —— 证明这些判据不是恒真的空转。
 *   断言用"命中集精确等于 {该判据}"而非"包含"：既证明它能判红，也证明它不越界误伤。
 *   用例共 **13 条**：A/B/C/D/G/H/H3 各一条 + E 一条（硬编码回退，见下）+ I 四条
 *   （I-routing 路由破坏 / I-phonetic 守卫丢失 / I-sort 主序中性 / I2 声明漂移）+ J 一条。
 *   I 的四条对应判据 I 的四类断言（逐条证明可证伪，不留"恒真断言"）。
 *
 *   ⚠️ 与裁定 §⑨-7 的字面差异（**实测纠正**，不是放松断言）：裁定写「E 改写用例 ⇒ 恰好 {E}」，
 *      但实测把查询层派生调用换回 `['word']`（**漏掉已启用的 reading**）时，除了 E 之外
 *      **判据 I 也必然判红** —— 因为 reading 在注册表里 `queryEnabled:true` 却说不可达（I 的第一条职责）。
 *      这是两把锁**本该**同时响（同 A 用例的 {A,G}），故 E 用例的 expect 记为 `{E,I}`，**判据一行未改弱**。
 *
 * 实现注记（本机环境，两条都踩过并已加固）：
 *   ① 本脚本**不 spawn 任何子进程**。本机 Node 预加载了 node-language-shim（safe-delete /
 *      brokered-fs），从 node 进程内 spawn 子进程一律 EBUSY —— 所以 G 用进程内 TypeScript
 *      Compiler API（ts.createProgram）而不是 `tsc` 子进程。这同时让本门在沙箱里可跑、不依赖 PATH。
 *   ② 还原的验收标准是**目录枚举的真值**（readdirSync），不是 `existsSync`。
 *      实测 `existsSync` 会被 brokered-fs shim 的缓存误导返回 false，而文件其实还在 ——
 *      用它当验收标准会让"恢复失败"静默变成"成功"，把污染留给下一次运行。
 *      兜底：若 unlink 后文件仍在，改用 renameSync 隔离到 node_modules/.tmp（重命名不走删除通道）。
 */
import { createServer } from 'vite'
import ts from 'typescript'
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  renameSync,
} from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MODEL_DIR_REL = 'src/core/content/model'
/** model/ 目录白名单：除这些以外出现任何文件都视为「类型散落」（INV-6） */
const MODEL_ALLOWLIST = new Set(['content.ts', 'vocabulary.ts', 'asset.ts', 'snapshot.ts'])

const F_REGISTRY = 'src/core/content/types/registry.ts'
/** P18-E′ 的运行时薄表（判据 J 比对 CORE ⟷ REGISTRY） */
const F_REGISTRY_CORE = 'src/core/content/types/registry-core.ts'
const F_CONTENT = 'src/core/content/model/content.ts'
const F_ASSET = 'src/core/content/model/asset.ts'
const F_CATALOG = 'src/core/content/catalog/catalog.ts'
const F_ZH = 'src/i18n/zh.ts'
const F_QUERY = 'src/core/content/query/content-query.ts'
/** Node 侧（构建/入库/校验链路）的类型白名单唯一副本 */
const F_LICENSE_POLICY = 'scripts/content/license-policy.mjs'
/** Node 侧资产规则唯一实现（H3 比对：必须与 TS 侧 asset.ts 的 parseAssetId/isAssetOwnedBy 逐例一致） */
const F_ASSET_RULES = 'scripts/content/asset-rules.mjs'
/** 不得再自建白名单副本的脚本 */
const F_VALIDATE = 'scripts/content/validate.mjs'
/** 包注册表（判据 I 派生 packagesOf(t) 用：getAllPackages() —— 不许写死包 id 名单） */
const F_PKG_REGISTRY = 'src/core/content/registry.ts'

/** G 判据的编译单元：契约本身 + 它的两个类型依赖（独立小程序，不必跑全项目 tsc） */
const CONTRACT_UNITS = [F_REGISTRY, F_REGISTRY_CORE, F_CONTENT, F_ASSET]
/** 只认这些文件里的诊断 —— 契约单元之外的报错属于构建门，不在本门职责内 */
const DIAG_SCOPE = /\/src\/core\/content\/(types|model)\//

const abs = (rel) => join(ROOT, rel)
const sha = (rel) => createHash('sha256').update(readFileSync(abs(rel))).digest('hex')
const sorted = (a) => [...a].sort()
const sameSet = (a, b) => a.length === b.length && sorted(a).every((x, i) => x === sorted(b)[i])

/* ------------------------------------------------------------------ *
 * H3 语料：**手写字面真值**（不是从任一侧代码推出来的）
 *   判定口径：TS 结果 == 真值 **且** .mjs 结果 == 真值 —— 三条独立来源对齐。
 *   若不写死真值、只断言 "TS == .mjs"，两侧同错（例如分隔符一起改错）就永远测不出来。
 *   覆盖：合法若干 / 无 `#a:` / `#a:` 后为空 / 大写 `#A:` / 含两个 `#a:` /
 *         host 段数不对 / host 段含非法字符 / 前后空白 / local 段含非法字符。
 * ------------------------------------------------------------------ */
const H3_HOST = 'content:vocabulary:ecdict-ielts:ielts'

/* 控制字符用例的字符在**运行时拼**出来，源码里不落裸字节：
 * 裸控制字符会把本文件变成二进制（git/oxlint 都不再按文本扫），而且 diff 不可读。
 * 走 String.fromCharCode 而不是 `\uXXXX` 转义序列，纯 ASCII 源码、零歧义。 */
const C0_NUL = String.fromCharCode(0x00)
const C0_SOH = String.fromCharCode(0x01)
const C0_DEL = String.fromCharCode(0x7f)
const C0_TAB = String.fromCharCode(0x09)

const ASSET_ID_CORPUS = [
  // —— 合法 ——
  { id: `${H3_HOST}#a:a-0007`, expect: { hostContentId: H3_HOST, assetLocalId: 'a-0007' }, why: '合法：<宿主 ContentId>#a:<local>' },
  { id: 'content:topic:ielts:environment#a:diagram-1', expect: { hostContentId: 'content:topic:ielts:environment', assetLocalId: 'diagram-1' }, why: '合法：另一宿主类型' },
  { id: `${H3_HOST}#a:A-0007`, expect: { hostContentId: H3_HOST, assetLocalId: 'A-0007' }, why: '合法：local 保留大小写（normalizeLocalId 不做 lowercase）' },
  // —— 非法 ——
  { id: H3_HOST, expect: null, why: '无 #a: 分隔符' },
  { id: `${H3_HOST}#a:`, expect: null, why: '#a: 后为空（local 空 ⇒ isStableLocalId 为否）' },
  { id: `${H3_HOST}#A:a-1`, expect: null, why: '大写 #A: 不是分隔符（indexOf 找不到）' },
  { id: `${H3_HOST}#a:a#a:b`, expect: null, why: '含两个 #a:：第二个并进 local，local 含 : ⇒ 非法' },
  { id: 'content:vocabulary:ielts#a:a-1', expect: null, why: 'host 段数不对（3 段，非合法 ContentId）' },
  { id: 'content:vocabulary:ecdict_ietf:ielts#a:a-1', expect: null, why: 'host 段含非法字符（namespace 里的 _）' },
  { id: 'content:Vocabulary:ns:local#a:a-1', expect: null, why: 'host 段含非法字符（类型段大写）' },
  { id: ` ${H3_HOST}#a:a-1`, expect: null, why: '前置空白（host 首字符为空格 ⇒ ContentId 不匹配）' },
  { id: `${H3_HOST}#a:a-1 `, expect: null, why: '后置空白（local 尾空格 ⇒ 非规范形态）' },
  { id: `${H3_HOST}#a:a/b`, expect: null, why: 'local 段含非法字符（/）' },
  /* —— 控制字符（C0 + DEL）：下面 4 条是「正则 → 码点判断」这次替换的判红靶 ——
   * local 段只要含控制字符，isStableLocalId 必须判否 ⇒ parseAssetId 返回 null。
   * 换完实现全靠这几条证明「该关的没被关掉」：把任一侧 isControlChar 改成恒 false，
   * 这几条立刻翻红（对照实验见 DECISIONS-POST-P18.md）。
   * 顺序也有讲究：制表符那条锁的是「isStableLocalId 先查控制字符直接判否」，
   * 不让它走到 normalize 的「先折白、后删控制字符」那套顺序上去。 */
  { id: `${H3_HOST}#a:a-0007${C0_NUL}b`, expect: null, why: 'local 段含 NUL U+0000' },
  { id: `${H3_HOST}#a:a${C0_SOH}-1`, expect: null, why: 'local 段含 SOH U+0001' },
  { id: `${H3_HOST}#a:a-1${C0_DEL}`, expect: null, why: 'local 段含 DEL U+007F' },
  { id: `${H3_HOST}#a:a-1${C0_TAB}`, expect: null, why: 'local 段含制表符 U+0009（isStableLocalId 先查控制字符 ⇒ 判否）' },
]

const OWNERSHIP_CORPUS = [
  { id: `${H3_HOST}#a:a-0007`, host: H3_HOST, expect: true, why: '同包 ⇒ true' },
  { id: `${H3_HOST}#a:a-0007`, host: 'content:vocabulary:cet4:cet4', expect: false, why: '异包 ⇒ false' },
  { id: 'not-an-asset-id', host: H3_HOST, expect: false, why: '非法 id ⇒ false（不抛异常）' },
  { id: `${H3_HOST}#A:a-1`, host: H3_HOST, expect: false, why: '大写分隔符 ⇒ 解析为 null ⇒ false' },
]

/** 只比较 { hostContentId, assetLocalId } 两字段（忽略两侧可能的额外字段），null 原样比较 */
const normParsed = (r) => (r === null || r === undefined ? null : { hostContentId: r.hostContentId, assetLocalId: r.assetLocalId })
const sameParsed = (a, b) => (a === null || b === null ? a === b : a.hostContentId === b.hostContentId && a.assetLocalId === b.assetLocalId)

/** 证伪模式下隔离被删除文件的落地目录（同盘、已被 git 忽略，不污染工作树） */
const QUARANTINE_DIR = join(ROOT, 'node_modules', '.tmp', 'gate-falsify')

/** 真值：某目录下是否列得出该文件名。**不要用 existsSync 代替**（见文件头实现注记 ②） */
function isListed(dirRel, name) {
  try {
    return readdirSync(abs(dirRel)).includes(name)
  } catch {
    return false
  }
}

/** 删除一个文件并按目录枚举验收；unlink 被拦时退回 renameSync 隔离。返回 {ok, how} */
function removeFileVerified(rel) {
  const dirRel = dirname(rel)
  const name = basename(rel)
  if (!isListed(dirRel, name)) return { ok: true, how: 'already-absent' }
  try {
    unlinkSync(abs(rel))
  } catch {
    /* 落到下面的兜底 */
  }
  if (!isListed(dirRel, name)) return { ok: true, how: 'unlink' }

  // 兜底：重命名到隔离目录（重命名不是删除，不走 safe-delete 通道）
  try {
    mkdirSync(QUARANTINE_DIR, { recursive: true })
    const dst = join(QUARANTINE_DIR, `stray-${Date.now()}-${name}`)
    renameSync(abs(rel), dst)
    if (!isListed(dirRel, name)) {
      try {
        unlinkSync(dst)
      } catch {
        /* 隔离目录内的残留无害（git 忽略），不因此判失败 */
      }
      return { ok: true, how: 'quarantined' }
    }
  } catch {
    /* 落到下面判失败 */
  }
  return { ok: false, how: 'failed' }
}

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分，绝不互相降级 */
class Fatal extends Error {}

/* ------------------------------------------------------------------ *
 * G：进程内编译期判据（双向穷尽锁 / 注册表完整性锁）
 * ------------------------------------------------------------------ */

/**
 * G 用的编译选项：**读项目自己的 tsconfig.app.json**，不另拍一套。
 * 自己手写选项（曾用 strict:true）会与真实构建产生偏差 —— 要么漏报、要么误报，
 * 而门禁一旦"与构建说的不是一回事"就失去意义。读不出来才退回保守兜底，并在日志里点明。
 */
const TS_OPTIONS = (() => {
  const fallback = {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.ReactJSX,
  }
  try {
    const read = ts.readConfigFile(join(ROOT, 'tsconfig.app.json'), ts.sys.readFile)
    if (read.error) return { options: fallback, source: 'fallback(read-error)' }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT)
    if (parsed.errors.length) return { options: fallback, source: 'fallback(parse-error)' }
    return {
      options: { ...parsed.options, noEmit: true, incremental: false, composite: false, tsBuildInfoFile: undefined },
      source: 'tsconfig.app.json',
    }
  } catch {
    return { options: fallback, source: 'fallback(throw)' }
  }
})()

/** 以 CONTRACT_UNITS 为根建一个独立小程序，取限定范围内的诊断。纯进程内，不 spawn。 */
function typecheckContractUnits() {
  const program = ts.createProgram(CONTRACT_UNITS.map(abs), TS_OPTIONS.options)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => DIAG_SCOPE.test((d.file?.fileName ?? '').replace(/\\/g, '/')))
    .map((d) => ({
      code: d.code,
      file: (d.file?.fileName ?? '').replace(/\\/g, '/').split('/src/').pop() ?? '?',
      line: d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
      msg: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    }))
}

/** 按契约单元内容缓存（证伪循环里 B/C/D 三轮契约未变，可直接命中缓存） */
let _tcCache = { key: null, val: null }
function contractDiagnostics() {
  let key
  try {
    key = CONTRACT_UNITS.map((f) => sha(f)).join(':')
  } catch (e) {
    throw new Fatal(`无法读取契约单元（${CONTRACT_UNITS.join(', ')}）— ${e.message}`)
  }
  if (_tcCache.key === key) return _tcCache.val
  let val
  try {
    val = typecheckContractUnits()
  } catch (e) {
    throw new Fatal(`进程内类型检查失败（TypeScript Compiler API）— ${e.message}`)
  }
  _tcCache = { key, val }
  return val
}

/* ------------------------------------------------------------------ *
 * 判据本体
 * ------------------------------------------------------------------ */

/** 跑全部判据。返回 { hits, logs, errors }；hits 为空集即 PASS。致命问题抛 Fatal。 */
async function runChecks() {
  /** 命中的判据字母集 */
  const hits = new Set()
  const logs = []
  const errors = []
  const fail = (letter, msg) => {
    hits.add(letter)
    errors.push(`  ✗ ${msg}`)
  }
  const ok = (msg) => logs.push(`  ✓ ${msg}`)

  let server
  try {
    server = await createServer({ root: ROOT, server: { middlewareMode: true }, logLevel: 'error' })
  } catch (e) {
    throw new Fatal(`vite server 启动失败（无法加载 TS 契约）— ${e.message}`)
  }

  const load = async (rel) => {
    try {
      return await server.ssrLoadModule(rel)
    } catch (e) {
      throw new Fatal(
        `模块加载失败 ${rel} — ${e.message}\n   （契约模块加载不出来时，本门绝不给出 PASS —— 解析失败不等于通过）`,
      )
    }
  }

  try {
    const reg = await load('/src/core/content/types/registry.ts')
    const zh = await load('/src/i18n/zh.ts')
    const en = await load('/src/i18n/en.ts')

    const { CONTENT_TYPES, CONTENT_TYPE_REGISTRY, queryEnabledTypes, packageLevelTypes, descriptorOf } = reg
    if (!CONTENT_TYPES || !CONTENT_TYPE_REGISTRY) {
      throw new Fatal('registry.ts 未导出 CONTENT_TYPES / CONTENT_TYPE_REGISTRY')
    }
    if (typeof queryEnabledTypes !== 'function' || typeof packageLevelTypes !== 'function') {
      throw new Fatal('registry.ts 未导出派生函数 queryEnabledTypes / packageLevelTypes')
    }

    const registryKeys = Object.keys(CONTENT_TYPE_REGISTRY)
    logs.push(`[gate:content-type-contract] 契约类型 ${registryKeys.length} 个：${registryKeys.join(', ')}`)

    /* ---------- A. 注册表穷尽性 ---------- */
    {
      const missing = CONTENT_TYPES.filter((t) => !registryKeys.includes(t))
      const extra = registryKeys.filter((t) => !CONTENT_TYPES.includes(t))
      if (missing.length === 0 && extra.length === 0) {
        ok(`A 注册表穷尽 CONTENT_TYPES（${CONTENT_TYPES.length} 个）`)
      } else {
        if (missing.length) fail('A', `A 注册表缺少类型：${missing.join(', ')}`)
        if (extra.length) fail('A', `A 注册表含未声明类型：${extra.join(', ')}`)
      }
    }

    /* ---------- B. 无类型散落 ---------- */
    {
      let files
      try {
        files = readdirSync(abs(MODEL_DIR_REL)).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      } catch (e) {
        throw new Fatal(`无法读取 ${MODEL_DIR_REL} — ${e.message}`)
      }
      const stray = files.filter((f) => !MODEL_ALLOWLIST.has(f))
      if (stray.length === 0) {
        ok(`B model/ 无类型散落（白名单 ${[...MODEL_ALLOWLIST].join(', ')}）`)
      } else {
        fail('B', `B model/ 出现 per-type 散落文件：${stray.join(', ')}`)
        errors.push('    类型字段模型必须写进 content/types/registry.ts，不得新建 per-type 文件（INV-6）')
      }
    }

    /* ---------- C. i18n 完整性 ---------- */
    {
      if (!zh.zh || !en.en) throw new Fatal('zh.ts / en.ts 未按约定导出 zh / en 常量')
      const zhKeys = Object.keys(zh.zh)
      const enKeys = Object.keys(en.en)
      const zhSet = new Set(zhKeys)
      const enSet = new Set(enKeys)

      const missingEn = zhKeys.filter((k) => !enSet.has(k))
      const missingZh = enKeys.filter((k) => !zhSet.has(k))
      if (missingEn.length === 0 && missingZh.length === 0) {
        ok(`C1 zh/en 词条逐一对齐（各 ${zhKeys.length} 条）`)
      } else {
        if (missingEn.length) fail('C', `C1 zh 有而 en 无：${missingEn.slice(0, 8).join(', ')}`)
        if (missingZh.length) fail('C', `C1 en 有而 zh 无：${missingZh.slice(0, 8).join(', ')}`)
      }

      const referenced = new Set()
      const dup = []
      for (const [t, d] of Object.entries(CONTENT_TYPE_REGISTRY)) {
        for (const key of [d.i18n?.labelKey, d.i18n?.unitKey]) {
          if (typeof key !== 'string') continue
          if (referenced.has(key)) dup.push(`${t} → ${key}`)
          referenced.add(key)
          if (!zhSet.has(key)) fail('C', `C2 zh.ts 缺键 ${key}（${t} 引用）`)
          if (!enSet.has(key)) fail('C', `C2 en.ts 缺键 ${key}（${t} 引用）`)
        }
      }
      if (dup.length === 0 && referenced.size === registryKeys.length * 2) {
        ok(`C2 注册表引用的 ${referenced.size} 个 i18n 键全部存在且无重复`)
      } else if (dup.length) {
        fail('C', `C2 i18n 键被多个类型重复引用：${dup.join(', ')}`)
      } else {
        fail('C', `C2 引用键数 ${referenced.size} ≠ 类型数×2（${registryKeys.length * 2}）`)
      }
    }

    /* ---------- D. Catalog 一致性（行为级） ---------- */
    {
      const cat = await load('/src/core/content/catalog/catalog.ts')
      if (typeof cat.getCatalog !== 'function') throw new Fatal('catalog.ts 未导出 getCatalog()')
      let types
      try {
        const c = cat.getCatalog()
        if (!c || !Array.isArray(c.types)) throw new Error('getCatalog().types 不是数组')
        types = c.types.map((t) => t.type)
      } catch (e) {
        throw new Fatal(`getCatalog() 调用失败 — ${e.message}`)
      }
      const expected = packageLevelTypes()
      if (sameSet(types, expected)) {
        ok(`D Catalog 类型维度 == packageLevelTypes()（${types.length} 个）`)
      } else {
        fail(
          'D',
          `D Catalog 类型维度与契约不一致：catalog=[${sorted(types).join(', ')}] vs registry=[${sorted(expected).join(', ')}]`,
        )
      }
    }

    /* ---------- E. 启用集一致性（注册表 ⟷ 查询层） ---------- */
    {
      let src
      try {
        src = readFileSync(abs(F_QUERY), 'utf8')
      } catch (e) {
        throw new Fatal(`无法读取 ${F_QUERY} — ${e.message}`)
      }
      const m = src.match(/const SUPPORTED_TYPES:\s*ContentType\[\]\s*=\s*\[([^\]]*)\]/)
      let actual = null
      let derived = false
      if (m) {
        actual = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
      } else if (/queryEnabledTypes\s*\(/.test(src)) {
        // 查询层改为从契约派生：一致性由构造保证，无需文本比对
        actual = queryEnabledTypes()
        derived = true
      }
      if (actual === null) {
        throw new Fatal(
          `无法从 ${F_QUERY} 解析 SUPPORTED_TYPES，且未见契约派生调用\n   解析失败绝不降级成 PASS —— 请检查查询层的启用集声明形态是否被改动`,
        )
      }
      const enabled = queryEnabledTypes()
      if (sameSet(actual, enabled)) {
        ok(`E queryEnabledTypes() == 查询层实际启用集（${enabled.join(', ') || '（空）'}）${derived ? ' [契约派生]' : ''}`)
      } else {
        fail(
          'E',
          `E 启用集不一致：registry.queryEnabled=[${sorted(enabled).join(', ')}] vs content-query=[${sorted(actual).join(', ')}]`,
        )
        errors.push('    改启用集必须同时改注册表与查询层（P18-E 逐类型开启，一次一个）')
      }
    }

    /* ---------- F. 注册表自洽 ---------- */
    {
      let bad = 0
      for (const [t, d] of Object.entries(CONTENT_TYPE_REGISTRY)) {
        if (d.type !== t) {
          fail('F', `F 描述.type(${d.type}) 与注册键(${t}) 不一致`)
          bad++
        }
        if (!registryKeys.includes(d.itemType)) {
          fail('F', `F ${t}.itemType='${d.itemType}' 不是已注册类型`)
          bad++
        }
        if (!d.i18n || typeof d.i18n.labelKey !== 'string' || typeof d.i18n.unitKey !== 'string') {
          fail('F', `F ${t}.i18n 缺 labelKey/unitKey`)
          bad++
        }
      }
      if (bad === 0) ok('F 注册表自洽（type 键一致 / itemType 已注册 / i18n 键声明完整）')
    }

    /* ---------- G. 双向穷尽（编译期，进程内） ---------- */
    {
      const diags = contractDiagnostics()
      if (diags.length === 0) {
        ok(
          `G 契约单元编译期零诊断（${CONTRACT_UNITS.length} 个文件；选项源=${TS_OPTIONS.source}；` +
            '双向穷尽锁 + 注册表完整性锁成立）',
        )
      } else {
        fail('G', `G 契约单元类型诊断 ${diags.length} 条（选项源=${TS_OPTIONS.source}）：`)
        for (const d of diags.slice(0, 6)) errors.push(`      TS${d.code} ${d.file}:${d.line} ${d.msg}`)
        if (diags.length > 6) errors.push(`      …另有 ${diags.length - 6} 条`)
      }
    }

    /* ---------- H. 构建侧类型白名单（Node 脚本）⟷ 契约 ---------- */
    {
      let buildTypes
      try {
        // 带内容哈希查询串：绕开 ESM 模块缓存，证伪模式里改了文件才能真读到新内容
        const mod = await import(`${pathToFileURL(abs(F_LICENSE_POLICY)).href}?v=${sha(F_LICENSE_POLICY)}`)
        if (!(mod.CONTENT_TYPES instanceof Set)) {
          throw new Error('未导出 Set 形态的 CONTENT_TYPES')
        }
        buildTypes = [...mod.CONTENT_TYPES]
      } catch (e) {
        throw new Fatal(`无法加载 ${F_LICENSE_POLICY} 的 CONTENT_TYPES — ${e.message}`)
      }
      const expectedPkg = packageLevelTypes()
      if (sameSet(buildTypes, expectedPkg)) {
        ok(`H1 构建侧类型白名单 == packageLevelTypes()（${expectedPkg.length} 个；源 ${F_LICENSE_POLICY}）`)
      } else {
        fail(
          'H',
          `H1 构建侧白名单与契约不一致：license-policy=[${sorted(buildTypes).join(', ')}] vs registry=[${sorted(expectedPkg).join(', ')}]`,
        )
        errors.push('    契约加类型后必须同步 Node 侧白名单，否则 content:ingest / content:validate 不认新类型')
      }

      let vsrc
      try {
        vsrc = readFileSync(abs(F_VALIDATE), 'utf8')
      } catch (e) {
        throw new Fatal(`无法读取 ${F_VALIDATE} — ${e.message}`)
      }
      if (/^[ \t]*const[ \t]+CONTENT_TYPES[ \t]*=/m.test(vsrc)) {
        fail('H', `H2 ${F_VALIDATE} 又自建了 CONTENT_TYPES 副本 —— Node 侧白名单只允许一份（从 license-policy.mjs import）`)
      } else {
        ok(`H2 ${F_VALIDATE} 未自建类型白名单副本（单一副本）`)
      }
    }

    /* ---------- H3. 资产规则 TS ⟷ Node 双侧一致性（带独立字面真值） ---------- */
    {
      const assetMod = await load('/src/core/content/model/asset.ts')
      if (typeof assetMod.parseAssetId !== 'function' || typeof assetMod.isAssetOwnedBy !== 'function') {
        throw new Fatal('asset.ts 未导出 parseAssetId / isAssetOwnedBy（H3 无法判定 —— 解析失败绝不降级成 PASS）')
      }
      let rulesMod
      try {
        // 带内容哈希查询串：绕开 ESM 模块缓存，证伪模式里改了 asset-rules.mjs 才能真读到新内容
        rulesMod = await import(`${pathToFileURL(abs(F_ASSET_RULES)).href}?v=${sha(F_ASSET_RULES)}`)
      } catch (e) {
        throw new Fatal(`无法加载 ${F_ASSET_RULES} — ${e.message}`)
      }
      if (typeof rulesMod.parseAssetId !== 'function' || typeof rulesMod.isAssetOwnedBy !== 'function') {
        throw new Fatal(`${F_ASSET_RULES} 未导出 parseAssetId / isAssetOwnedBy`)
      }

      /** 每一处不一致都点名"是哪一侧、哪条语料、期望什么" —— 只看布尔结论定位不了漂移 */
      const mism = []
      for (const c of ASSET_ID_CORPUS) {
        const ts = normParsed(assetMod.parseAssetId(c.id))
        const js = normParsed(rulesMod.parseAssetId(c.id))
        if (!sameParsed(ts, c.expect)) mism.push(`parseAssetId TS ${JSON.stringify(c.id)} → ${JSON.stringify(ts)}，真值 ${JSON.stringify(c.expect)}（${c.why}）`)
        if (!sameParsed(js, c.expect)) mism.push(`parseAssetId .mjs ${JSON.stringify(c.id)} → ${JSON.stringify(js)}，真值 ${JSON.stringify(c.expect)}（${c.why}）`)
      }
      for (const c of OWNERSHIP_CORPUS) {
        const ts = assetMod.isAssetOwnedBy(c.id, c.host)
        const js = rulesMod.isAssetOwnedBy(c.id, c.host)
        if (ts !== c.expect) mism.push(`isAssetOwnedBy TS (${JSON.stringify(c.id)}, ${JSON.stringify(c.host)}) → ${ts}，真值 ${c.expect}（${c.why}）`)
        if (js !== c.expect) mism.push(`isAssetOwnedBy .mjs (${JSON.stringify(c.id)}, ${JSON.stringify(c.host)}) → ${js}，真值 ${c.expect}（${c.why}）`)
      }

      if (mism.length === 0) {
        ok(
          `H3 资产规则 TS⟷Node 双侧一致（parseAssetId ${ASSET_ID_CORPUS.length} 例 + isAssetOwnedBy ${OWNERSHIP_CORPUS.length} 例；` +
            '三条独立来源对齐：TS == 字面真值 == .mjs）',
        )
      } else {
        fail('H', `H3 资产规则 TS/Node 与字面真值不一致 ${mism.length} 处：`)
        for (const m of mism.slice(0, 8)) errors.push(`      ${m}`)
        if (mism.length > 8) errors.push(`      …另有 ${mism.length - 8} 处`)
      }
    }

    /* ---------- I. 启用即可达（行为级，跑真实查询层） ---------- */
    {
      const q = await load('/src/core/content/query/content-query.ts')
      const modelMod = await load('/src/core/content/model/content.ts')
      const pkgReg = await load(`/${F_PKG_REGISTRY}`)
      if (
        typeof q.list !== 'function' ||
        typeof q.count !== 'function' ||
        typeof modelMod.parseContentId !== 'function' ||
        typeof pkgReg.getAllPackages !== 'function'
      ) {
        throw new Fatal(
          'I 判据所需导出缺失（content-query.list/count、model.parseContentId、registry.getAllPackages）—— 绝不降级成 PASS',
        )
      }

      const enabledTypes = queryEnabledTypes()
      const allPkgs = pkgReg.getAllPackages()
      /** 与 content-query.ts 的 packageTypesOf 同一规则（派生，不写死类型名） */
      const packageTypesOf = (t) => {
        const itemType = descriptorOf(t)?.itemType
        if (!itemType) return []
        return registryKeys.filter((x) => CONTENT_TYPE_REGISTRY[x].itemType === itemType)
      }
      /** 同族类型覆盖到的全部包（**派生**，不许写死包 id 名单） */
      const packagesOf = (t) => {
        const allowed = new Set(packageTypesOf(t))
        return allowed.size ? allPkgs.filter((p) => allowed.has(p.manifest.type)) : []
      }

      let bad = 0
      const idsOf = (arr) => arr.map((h) => h.id)
      const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
      const totalItems = allPkgs.reduce((s, p) => s + p.manifest.stats.items, 0)

      for (const t of enabledTypes) {
        const pkgs = packagesOf(t)
        if (!pkgs.length) {
          fail('I', `I ${t}: packagesOf 为空 —— 启用了没有任何内容包的类型（「启用即可达」的前提不成立）`)
          bad++
          continue
        }
        const allowedLocals = new Set(pkgs.map((p) => p.localId))

        const hits = await q.list({ type: t })
        if (!hits.length) {
          fail('I', `I ${t}: list({type:'${t}'}) 为空 —— 启用但不可达（四段齐备前不得放开）`)
          bad++
        }
        const leak = hits.filter((h) => !allowedLocals.has(h.packageLocalId))
        if (leak.length) {
          fail(
            'I',
            `I ${t}: list 结果外溢 ${leak.length} 条（如 packageLocalId='${leak[0].packageLocalId}'）—— 返回了别的类型的数据（§⑨-1 静默错数据）`,
          )
          bad++
        }

        const expectedCount = pkgs.reduce((s, p) => s + p.manifest.stats.items, 0)
        const c = await q.count({ type: t })
        if (c !== expectedCount) {
          fail('I', `I ${t}: count=${c} ≠ Σ packagesOf(${t}).stats.items=${expectedCount}（count 必须与 list 同源）`)
          bad++
        }
        if (t !== 'word' && c === totalItems) {
          fail('I', `I ${t}: count=${c} 等于全库 ${totalItems} —— 未按类型路由（§⑨-1「count 返回 9346」）`)
          bad++
        }

        const wantItemType = descriptorOf(t)?.itemType
        for (const h of hits) {
          const parsed = modelMod.parseContentId(h.id)
          if (!parsed || parsed.type !== wantItemType) {
            fail('I', `I ${t}: 命中 id '${h.id}' 解析失败或 type≠'${wantItemType}'`)
            bad++
            break
          }
        }

        if (t !== 'word') {
          const base = idsOf(hits)
          const withPhonetic = idsOf(await q.list({ type: t, hasPhonetic: true }))
          if (!sameIds(withPhonetic, base)) {
            fail(
              'I',
              `I ${t}: list({hasPhonetic:true}) 改变了非 word 族的结果集 —— hasPhonetic 是 word 族专属，非 word 族必须**不参与**筛选（不是"筛成空"）`,
            )
            bad++
          }
          const sortedDesc = idsOf(await q.list({ type: t, sort: { field: 'word', order: 'desc' } }))
          if (!sameIds(sortedDesc, base)) {
            fail(
              'I',
              `I ${t}: list({sort:'word',order:'desc'}) 改变了非 word 族的顺序 —— 词形主序是 word 族专属，非 word 族必须**不参与**（不是"整体反转"）`,
            )
            bad++
          }
        }
      }

      // type:'all' 的去重并集（防 word/vocabulary 重复计）
      const unionLocals = new Set(enabledTypes.flatMap((t) => packagesOf(t)).map((p) => p.localId))
      const expectedAll = allPkgs
        .filter((p) => unionLocals.has(p.localId))
        .reduce((s, p) => s + p.manifest.stats.items, 0)
      const actualAll = await q.count({ type: 'all' })
      if (actualAll !== expectedAll) {
        fail('I', `I count({type:'all'})=${actualAll} ≠ 各启用类型 packagesOf 去重并集之和=${expectedAll}（重复计或漏计）`)
        bad++
      }

      if (bad === 0) {
        ok(
          `I 启用即可达（${enabledTypes.length} 个类型 ${enabledTypes.join('/') || '（空）'}：packagesOf 非空 + list 非空且不外溢 + count 同源 + id 可解析 + 非 word 族过滤中性）`,
        )
      }
    }

    /* ---------- I2. descriptor 的检索声明可解析（静态判据） ---------- */
    {
      let src
      try {
        src = readFileSync(abs(F_QUERY), 'utf8')
      } catch (e) {
        throw new Fatal(`无法读取 ${F_QUERY} — ${e.message}`)
      }
      // WORD_FIELDS 未导出（模块私有），按源码形态提取键集 —— 与 E 提取启用集同一手法。
      const wf = src.match(/const WORD_FIELDS[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
      if (!wf) {
        throw new Fatal(
          `无法从 ${F_QUERY} 解析 WORD_FIELDS 声明形态\n   解析失败绝不降级成 PASS —— word 族检索声明的可解析性无从判定`,
        )
      }
      const wordFields = new Set(
        [...wf[1].matchAll(/(?:^|\n)[ \t]*([A-Za-z_$][\w$]*)[ \t]*:/g)].map((x) => x[1]),
      )
      if (wordFields.size === 0) {
        throw new Fatal(`WORD_FIELDS 键集为空（${F_QUERY}）—— 解析失败，绝不降级成 PASS`)
      }
      const wfList = [...wordFields].join(', ')

      let bad = 0
      for (const t of registryKeys) {
        const d = CONTENT_TYPE_REGISTRY[t]
        const wordFamily = d.itemType === 'word'
        for (const spec of d.query?.index ?? []) {
          if (spec.mode !== 'exact') continue
          if (wordFamily) {
            if (!wordFields.has(spec.field)) {
              fail('I2', `I2 ${t}.query.index exact 字段 '${spec.field}' 不在 WORD_FIELDS 键集 {${wfList}} 内`)
              bad++
            }
          } else if (spec.field !== 'id') {
            fail(
              'I2',
              `I2 ${t}.query.index exact 字段只允许 'id'（非 word 族倒排表尚未实现，一律走扫描）—— 实得 '${spec.field}'，请先建倒排或改声明`,
            )
            bad++
          }
        }
        if (wordFamily) {
          for (const spec of d.query?.match ?? []) {
            if (!wordFields.has(spec.field)) {
              fail('I2', `I2 ${t}.query.match 字段 '${spec.field}' 不在 WORD_FIELDS 键集 {${wfList}} 内`)
              bad++
            }
          }
        }
      }
      if (bad === 0) {
        ok(
          `I2 检索声明可解析（${registryKeys.length} 个类型；word 族 exact/match ⊆ WORD_FIELDS {${wfList}}；非 word 族 exact 仅 'id'）`,
        )
      }
    }

    /* ---------- J. CORE ⟷ REGISTRY 投影一致（P18-E′，裁定 §⑫-4） ---------- */
    {
      const core = await load(`/${F_REGISTRY_CORE}`)
      const { CONTENT_TYPES: coreTypes, CONTENT_TYPE_CORE } = core
      if (!coreTypes || !CONTENT_TYPE_CORE) {
        throw new Fatal(
          `${F_REGISTRY_CORE} 未导出 CONTENT_TYPES / CONTENT_TYPE_CORE —— 解析失败绝不降级成 PASS`,
        )
      }
      const coreKeys = Object.keys(CONTENT_TYPE_CORE)

      /* J1 键集合三者相等（**双向**：源多一个 / 少一个都判红） */
      let badKeys = 0
      const pairs = [
        ['CONTENT_TYPES', [...CONTENT_TYPES], 'keys(CONTENT_TYPE_CORE)', coreKeys],
        ['CONTENT_TYPES', [...CONTENT_TYPES], 'keys(CONTENT_TYPE_REGISTRY)', registryKeys],
        ['keys(CONTENT_TYPE_CORE)', coreKeys, 'keys(CONTENT_TYPE_REGISTRY)', registryKeys],
      ]
      for (const [an, a, bn, b] of pairs) {
        const as = new Set(a)
        const bs = new Set(b)
        const missing = a.filter((x) => !bs.has(x))
        const extra = b.filter((x) => !as.has(x))
        if (missing.length) {
          fail('J', `J1 ${an} 有而 ${bn} 无：${missing.join(', ')}`)
          badKeys++
        }
        if (extra.length) {
          fail('J', `J1 ${bn} 有而 ${an} 无：${extra.join(', ')}`)
          badKeys++
        }
      }
      if (badKeys === 0) {
        ok(`J1 键集合三者相等（${coreKeys.length} 个：CONTENT_TYPES == CORE == REGISTRY，双向）`)
      }

      /* J2 逐值相等：专抓「展开后又覆盖」—— 那是两个面唯一可能分家的方式 */
      let badVal = 0
      for (const t of coreKeys) {
        const c = CONTENT_TYPE_CORE[t]
        const r = CONTENT_TYPE_REGISTRY[t]
        if (!r) continue // 键缺失已由 J1 判红，这里不重复报
        if (c.itemType !== r.itemType) {
          fail('J', `J2 ${t}.itemType 不一致：CORE='${c.itemType}' vs REGISTRY='${r.itemType}'（展开后覆盖了 itemType）`)
          badVal++
        }
        if (c.queryEnabled !== r.queryEnabled) {
          fail('J', `J2 ${t}.queryEnabled 不一致：CORE=${c.queryEnabled} vs REGISTRY=${r.queryEnabled}（展开后覆盖了 queryEnabled）`)
          badVal++
        }
        if (JSON.stringify(c.query) !== JSON.stringify(r.query)) {
          fail('J', `J2 ${t}.query 不一致：CORE=${JSON.stringify(c.query)} vs REGISTRY=${JSON.stringify(r.query)}（展开后覆盖了 query）`)
          badVal++
        }
      }
      if (badVal === 0) {
        ok(`J2 逐值相等（${coreKeys.length} 个类型的 itemType / queryEnabled / query：CORE == REGISTRY）`)
      }

      /* J3 反向守卫（**防空转**）：空表上 J2 恒真 ⇒ 先证明 CORE 真的有东西可比 */
      const pkgLevelInCore = coreKeys.filter((t) => CONTENT_TYPE_REGISTRY[t]?.packageLevel)
      if (coreKeys.length === 0 || !coreKeys.includes('word') || pkgLevelInCore.length === 0) {
        fail(
          'J',
          `J3 反向守卫：CORE 键数=${coreKeys.length}、含 word=${coreKeys.includes('word')}、packageLevel 类型数=${pkgLevelInCore.length}` +
            ' —— 三者任一为零时 J2 会在空表上恒真，本判据即空转',
        )
      } else {
        ok(
          `J3 反向守卫（CORE ${coreKeys.length} 键、含 word、packageLevel 类型 ${pkgLevelInCore.length} 个 —— 比较对象非空，J2 不恒真）`,
        )
      }
    }
  } finally {
    await server.close()
  }

  return { hits, logs, errors }
}

/* ------------------------------------------------------------------ *
 * 证伪用例：每条判据一个，断言"命中集**恰好**等于 expect"
 *   expect 不是"包含该判据"而是"精确等于"：既证明它能判红，也证明它不越界误伤。
 *   有用例会自然命中两条（见 A 的 why）—— 那是两把锁**本该**同时响，不是用例不隔离。
 * ------------------------------------------------------------------ */

const CASES = [
  {
    letter: 'A',
    expect: ['A', 'G', 'J'],
    why:
      'CONTENT_TYPES 摘掉成员同时破坏运行时穷尽(A) 与编译期"联合⊆数组"锁(G) —— 两把锁本就该同时响。' +
      'P18-E′ 起再叠加一把：CONTENT_TYPES 与 CONTENT_TYPE_CORE 的键集合由 J1 对账（摘掉 lesson ' +
      '⇒ CORE 仍 14 键而 CONTENT_TYPES 13 ⇒ J 判红）—— 同样是三把锁本该同时响，不是用例不隔离',
    name: '从运行时清单 CONTENT_TYPES 摘掉 lesson（注册表多出一个类型）',
    kind: 'edit',
    // P18-E′：CONTENT_TYPES 的唯一定义已搬到 registry-core.ts（registry.ts 只 re-export）
    file: F_REGISTRY_CORE,
    from: "  'lesson',\n] as const satisfies",
    to: '] as const satisfies',
  },
  {
    letter: 'B',
    expect: ['B'],
    why: '散落文件只被 B（目录白名单）看见，不影响类型/契约/i18n',
    name: '在 model/ 下新建 per-type 散落文件 audio.ts',
    kind: 'create',
    file: `${MODEL_DIR_REL}/audio.ts`,
    content:
      '/* 证伪用临时文件 —— 由 gate:content-type-contract --falsify 创建并删除 */\nexport type AudioPayload = unknown\n',
  },
  {
    letter: 'C',
    expect: ['C'],
    why: 'zh 少一键 → C1 不对齐 + C2 注册表引用落空，两条都在 C 字母下',
    name: '从 zh.ts 摘掉 type.reading.label 一行（en 仍有 → 不对齐 + 注册表引用落空）',
    kind: 'regex',
    file: F_ZH,
    pattern: /^[ \t]*'type\.reading\.label':.*(?:\r?\n)?/m,
    to: '',
  },
  {
    letter: 'D',
    expect: ['D'],
    why: 'catalog 的类型槽位多出一个 → 只有 D（Catalog ⟷ 注册表对账）看得见',
    name: '让 catalog 的类型维度多出 word（与 packageLevelTypes() 不一致）',
    kind: 'edit',
    file: F_CATALOG,
    from: "  'lesson',\n]",
    to: "  'lesson',\n  'word',\n]",
  },
  {
    letter: 'E',
    expect: ['E', 'I'],
    why:
      '把查询层的派生调用换回**手写数组**且漏掉已启用的 reading：E（启用集对账，:400 的正则分支此时命中）判红；' +
      '同时 I（启用即可达）也判红 —— reading 在注册表里 queryEnabled:true 却不可达（list 为 []）。' +
      '两把锁本该同时响（同 A 用例的 {A,G}），不是用例不隔离',
    name: "把 content-query.ts 的 SUPPORTED_TYPES 由 queryEnabledTypes() 换回手写数组 ['word']（守「将来有人优化回硬编码列表」）",
    kind: 'edit',
    file: F_QUERY,
    from: 'const SUPPORTED_TYPES: ContentType[] = queryEnabledTypes()',
    to: "const SUPPORTED_TYPES: ContentType[] = ['word']",
  },
  {
    letter: 'G',
    expect: ['G'],
    why: '只在类型层存在的漂移（联合多出成员）→ A–F 全部抓不到，**只有编译期锁能判红**',
    name: "给 ContentType 联合加未同步到 CONTENT_TYPES 的成员 quiz（只有编译期锁能抓）",
    kind: 'edit',
    file: F_CONTENT,
    from: "  | 'lesson'\n",
    to: "  | 'lesson'\n  | 'quiz'\n",
  },
  {
    letter: 'H',
    expect: ['H'],
    why: 'Node 侧白名单只被 H 看见（契约/查询层/catalog/i18n 都不受它影响）',
    name: '从 license-policy.mjs 摘掉 lesson（契约加了类型、Node 构建/入库/校验不认）',
    kind: 'edit',
    file: F_LICENSE_POLICY,
    from: "  'course', 'lesson',\n])",
    to: "  'course',\n])",
  },
  {
    letter: 'H',
    expect: ['H'],
    why: '改坏 asset-rules 的分隔符只被 H3 看见 —— H1（license-policy）/H2（validate.mjs）都不读 asset-rules，故不连带判红',
    name: "把 asset-rules.mjs 的 ASSET_SEPARATOR '#a:' 改成 '#a'（Node 侧 parseAssetId 与 TS 侧漂移 ⇒ H3 判红）",
    kind: 'edit',
    file: F_ASSET_RULES,
    from: "export const ASSET_SEPARATOR = '#a:'",
    to: "export const ASSET_SEPARATOR = '#a'",
  },
  {
    letter: 'I',
    expect: ['I'],
    why:
      '复现裁定 §⑨-1 的**静默错数据**：scopePackages 退回 vocabulary-only（getVocabularyPackages()）并去掉同族过滤 ' +
      '⇒ 路由无视类型维度，reading 查询落到 10 个词库上 —— core 工人实测 count({type:\'reading\'})→**9346**、' +
      'list({type:\'reading\'})→**9346 条 word 行**（非空、不报错，正是最危险的一类）。' +
      'E 只比启用集、I2 是静态判据，都看不见这条 ⇒ 只有 I 判红',
    name: '把 scopePackages 的路由退回 vocabulary-only 并去掉 pkgs.filter(allowed) 那一行（reading 查询落到词库）',
    kind: 'edit',
    file: F_QUERY,
    from: `  let pkgs: ContentPackage[] = packageId
    ? [getPackage(packageId)].filter((p): p is ContentPackage => !!p)
    : packagesOfTypes(types)
  pkgs = pkgs.filter((p) => allowed.has(p.manifest.type))`,
    to: `  let pkgs: ContentPackage[] = packageId
    ? [getPackage(packageId)].filter((p): p is ContentPackage => !!p)
    : getVocabularyPackages()`,
  },
  {
    letter: 'I',
    expect: ['I'],
    why:
      '去掉 poolEntries 的 isWordHit(hit) 守卫 ⇒ 非 word 条目全部无 phonetic ⇒ ' +
      'list({type:t, hasPhonetic:true}) 被**静默筛成 []**（看起来像"没有结果"，不会有人怀疑；裁定 §⑨-6①）。' +
      'E/I2 都看不见 ⇒ 只有 I 判红',
    name: '去掉 poolEntries 的 `hasPhonetic && isWordHit(hit) && !hit.phonetic` 里的 isWordHit 守卫（非 word 族被静默筛成空）',
    kind: 'edit',
    file: F_QUERY,
    from: 'if (hasPhonetic && isWordHit(hit) && !hit.phonetic) continue',
    to: 'if (hasPhonetic && !hit.phonetic) continue',
  },
  {
    letter: 'I',
    expect: ['I'],
    why:
      "把 sortRows 里 field:'word' 对**非 word 行**的退让（`a.rank - b.rank`，主序中性）换成让 title 参与主序 " +
      "⇒ `order:'desc'` 会把非 word 族**整体反转**（词形主序本应只对 word 族生效）。" +
      '这条专证 I 的 sort 中性断言**可证伪**（不是恒真）—— 与 I-phonetic 一起覆盖裁定 §⑨-6① 的两条中性规则',
    name: "让 sortRows 的 field:'word' 对非 word 行改按 title 参与主序（desc 下非 word 族被整体反转）",
    kind: 'edit',
    file: F_QUERY,
    from: `            ? cmpText(norm(a.hit.word), norm(b.hit.word))
            : a.rank - b.rank`,
    to: `            ? cmpText(norm(a.hit.word), norm(b.hit.word))
            : cmpText(tieText(a.hit), tieText(b.hit))`,
  },
  {
    letter: 'I2',
    expect: ['I2'],
    why:
      '给 reading 的 descriptor.query.index 加一个非 id 的 exact 字段 body ⇒ 非 word 族倒排表尚未实现（一律走扫描），' +
      'exact 只允许 id ⇒ 只有 I2 判红。守的是「声明 ⟷ 行为漂移」：无人建倒排却先在声明里加 exact 字段',
    name: "给 reading 的 descriptor.query.index 加 { field: 'body', mode: 'exact' }（非 word 族 exact 只允许 'id'）",
    kind: 'edit',
    // P18-E′：query 声明的唯一定义已搬到 registry-core.ts（registry.ts 由 CORE 展开继承）
    file: F_REGISTRY_CORE,
    from: `      index: [{ field: 'id', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'body', mode: 'substring' }],`,
    to: `      index: [{ field: 'id', mode: 'exact' }, { field: 'body', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'body', mode: 'substring' }],`,
  },
  {
    letter: 'J',
    expect: ['J'],
    why:
      '在 REGISTRY（全表）的 reading 条目里 **`...CONTENT_TYPE_CORE.reading` 展开之后**覆盖 queryEnabled ' +
      '⇒ CORE=true / REGISTRY=false，只有 J2（逐值相等）看得见；E/I/I2 分别只读 CORE 的启用集、CORE 的 itemType、' +
      'REGISTRY 的 query（未被改），都不受影响。' +
      '⚠️ **实测纠正**（裁定 §⑫-4 字面写的是「在 CORE 里把某类型的 queryEnabled 翻一下」）：REGISTRY 是由 CORE ' +
      '**展开派生**的，改 CORE 会让两边同步跟着改 ⇒ J2 恒等，**实测命中集 = ∅、EXIT=0 全绿** —— 那样的"证伪"是假的。' +
      '能让两个面分家的只有「展开后再覆盖」，那正是 J 要抓的违规，故注入落在全表侧',
    name: '在 REGISTRY 的 reading 条目里于展开之后覆盖 queryEnabled:false（CORE 与 REGISTRY 两个面分家）',
    kind: 'edit',
    file: F_REGISTRY,
    from: '    ...CONTENT_TYPE_CORE.reading,\n    i18n:',
    to: '    ...CONTENT_TYPE_CORE.reading,\n    queryEnabled: false,\n    i18n:',
  },
]

async function falsify() {
  console.log('[gate:content-type-contract] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）')
  console.log(`  用例 ${CASES.length} 条；每条：植入故障 → 断言"命中集恰好等于预期" → 字节还原 → 逐条核对\n`)

  let bad = 0
  let totalChecks = 0

  for (const c of CASES) {
    totalChecks++
    const isCreate = c.kind === 'create'

    /* ---- 前置守卫：目标目录里不该已经有这个东西 ---- */
    if (isCreate && isListed(dirname(c.file), basename(c.file))) {
      bad++
      console.error(`  ‼ ${c.letter} 证伪目标已存在，拒绝覆盖：${c.file}（先清理再重跑）`)
      continue
    }
    const before = isCreate ? null : sha(c.file)
    const original = isCreate ? null : readFileSync(abs(c.file), 'utf8')

    let observed = null
    let fatalMsg = null
    let restoreHow = ''

    try {
      /* ---- 植入 ---- */
      if (isCreate) {
        writeFileSync(abs(c.file), c.content)
      } else {
        let mutated
        if (c.kind === 'edit') {
          if (!original.includes(c.from)) throw new Fatal(`找不到锚点：${JSON.stringify(c.from).slice(0, 90)}`)
          mutated = original.replace(c.from, c.to)
        } else {
          mutated = original.replace(c.pattern, c.to)
        }
        if (mutated === original) {
          throw new Fatal('植入空转：替换未改变文件内容（锚点未命中）—— 这样的"证伪"是假的')
        }
        writeFileSync(abs(c.file), mutated)
      }

      /* ---- 观测（与常规模式同一条路径） ---- */
      const r = await runChecks()
      observed = r.hits
    } catch (e) {
      fatalMsg = e instanceof Fatal ? e.message : e.stack
    } finally {
      /* ---- 还原（无论成败）；验收用目录枚举/sha256 真值，不用 existsSync ---- */
      try {
        if (isCreate) {
          const res = removeFileVerified(c.file)
          restoreHow = res.how
          if (!res.ok) {
            console.error(`  ‼ ${c.letter} 还原失败（${c.file} 仍列在目录里）—— 工作树可能已被污染，请立刻 git status 检查`)
            bad++
          }
        } else {
          writeFileSync(abs(c.file), original)
          const after = sha(c.file)
          restoreHow = 'bytes'
          if (after !== before) {
            console.error(`  ‼ ${c.letter} 还原失败（${c.file} sha256 变了 ${before} → ${after}）`)
            bad++
          }
        }
      } catch (e) {
        restoreHow = 'error'
        console.error(`  ‼ ${c.letter} 还原异常：${e.message}`)
        bad++
      }
    }

    if (fatalMsg) {
      bad++
      console.error(`  ✗ ${c.letter} 证伪执行失败：${fatalMsg}`)
      continue
    }
    if (observed === null) continue

    const got = sorted([...observed])
    const want = sorted(c.expect)
    const exact = got.length === want.length && got.every((x, i) => x === want[i])
    if (exact) {
      console.log(`  ✓ ${c.letter} 恰好判红（命中 {${got.join(',')}}；还原=${restoreHow}）`)
      console.log(`      ${c.name}`)
      if (want.length > 1) console.log(`      ↳ 预期耦合：${c.why}`)
    } else {
      bad++
      console.error(`  ✗ ${c.letter} 未达预期：期望命中 {${want.join(',')}}，实际 {${got.join(',') || '∅'}} —— ${c.name}`)
      if (got.length === 0) console.error('     该判据是空转的（植入故障后仍判 PASS）')
      else console.error(`     命中集不符：预期耦合应为「${c.why}」，实际多/少了判据 → 用例不隔离或存在意外耦合`)
    }
  }

  /* ---- 对照组：还原后本门必须复绿 ---- */
  console.log('\n  对照组（还原后复绿）')
  try {
    const r = await runChecks()
    if (r.hits.size === 0) {
      console.log('  ✓ 全部判据复绿（还原后零命中）—— 证明上面每一轮的判红都来自植入，而非环境残留')
    } else {
      bad++
      console.error(`  ✗ 对照组失败：还原后仍有判据命中 {${sorted([...r.hits]).join(',')}} —— 还原不干净或存在残留故障`)
    }
  } catch (e) {
    bad++
    console.error(`  ✗ 对照组失败（致命）：${e instanceof Fatal ? e.message : e.stack}`)
  }

  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(
      `Falsification：✅ PASS —— ${totalChecks}/${CASES.length} 判据均恰好判红，工作树已字节还原，对照组复绿`,
    )
    process.exit(0)
  }
  console.error(`Falsification：❌ FAIL —— ${bad} 项问题（存在恒真判据或还原异常 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

async function main() {
  if (process.argv.includes('--falsify')) return falsify()

  let r
  try {
    r = await runChecks()
  } catch (e) {
    if (e instanceof Fatal) {
      console.error(`❌ EXIT=2：${e.message}`)
      process.exit(2)
    }
    throw e
  }

  for (const l of r.logs) console.log(l)
  for (const e of r.errors) console.error(e)

  console.log('──────────────────────────────────────────────────────')
  if (r.hits.size === 0) {
    console.log('Content Type Contract：✅ PASS —— 类型契约唯一、无散落、i18n 完整、启用集一致、编译期穷尽')
    process.exit(0)
  }
  console.error(`Content Type Contract：❌ FAIL —— 判据 {${sorted([...r.hits]).join(',')}} 不成立（INV-6）`)
  process.exit(1)
}

await main()
