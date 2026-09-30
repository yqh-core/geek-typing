/* V4.1 · content:validate —— 内容层门禁（CI 与 build 前置）。
 *
 * 检查项：
 *  1. manifest.json / 载荷文件存在且 JSON 合法（载荷：vocabulary→words.json 必有；
 *     其余类型→items.json 可选 —— 无载荷包的 offline.policy 必须为合法值且 registry 侧可解释）
 *  2. manifest 必填字段完整（id/type/version/title/sources/offline...）
 *  3. ContentId 4 段式规范：content:<目录类型>:<namespace>:<目录名>（P1.7-Wave4 B-1 泛化：
 *     扫描 content/ 下全部类型子目录，目录名即类型，须在 ContentType 白名单内）
 *  4. 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常
 *     数据关系，是本平台刻意支持的能力，任何「跨包词唯一」规则都是错误的——见下方注释）
 *  5. stats.items 与 words 实际词数一致（漂移时跑 npm run content:build 自动同步）
 *  6. sources[].checksum 与 words.json 实际完整 SHA-256 一致
 *  7. License 门禁：每条 source 必须有结构化 license；外部来源须有 SPDX 标识
 *  8. 包 id 全局唯一（同一 ContentId 不得被两个包占用）
 *  9. namespace 每包唯一（词级 ContentId 全局唯一的充要条件，见代码内注释）
 * 10. schemaVersion 存在且 === SCHEMA_VERSION（结构版本，由 content:build 写入）
 * 11. contentVersion 存在且为正整数（对外学习契约版本，同一 checksum 复用同一 version）
 * 12. Duplicate Detection（分级，见代码内注释）：
 *     (a) 包内 duplicate localId —— 第 4 项已覆盖，此处只回显，不重复报错
 *     (b) 包内 duplicate normalized word（大小写/空白差异撞车）
 *     (c) 跨包 duplicate ContentId —— 全库兜底回归检测
 *     (d) duplicate source —— 同一 origin 在 sources[] 出现两次
 *     (e) invalid / orphan relation —— 仅当 relations.json 存在时校验，否则打印跳过
 *     (f) broken asset —— 仅当 manifest.assets 存在时校验，否则打印跳过
 *     (g) orphan learning record —— 运行时检查，由 Learning 层负责，脚本不校验
 * 13. packageId 存在且 === 目录名（一词三表：manifest.packageId / 目录 / ContentId 第 4 段）
 * 14. namespace 存在，且与从 manifest.id 解析出的第 3 段严格相等（两者必须同源；
 *     「每包唯一」由第 9 项兜底）
 * 15. contentChecksum === sha256Canonical(words)（**必须走 canonical**，不得用文件原文
 *     或 JSON.stringify 直算，否则文件排版一变就误判漂移）
 * 16. contentRevision / contentVersion 均为正整数；contentHistory 中存在
 *     checksum === contentChecksum 的条目，且该条目 version === contentVersion、
 *     revision <= contentRevision（回滚场景：version 回到历史值，revision 只增不减）
 * 17. build 存在且 toolVersion 非空、builtAt 为合法时间、sourceChecksum === contentChecksum
 * 18. manifest 体积：单包 < 8 KiB 且全库 < 40 KiB（manifest 常驻主 chunk，必须永远「轻」；
 *     包数增长时只允许 O(包数) 线性小步涨，不允许随词数涨）
 * 19. inline 预算：有载荷且 policy=inline 的包 Σ stats.items ≤ 1000 且 Σ 载荷 ≤ 64 KiB
 *     （实测 inline 词 1:1 全额传导进主 chunk：kaoyan 改 inline ⇒ 主 chunk +471.92 KiB，
 *      与 words.json 471.70 KiB 比值 1:1.0005，故 inline 是首屏体积的直通车，必须限量；
 *      无载荷却声明 inline 属语义矛盾，直接判红）
 * 20. 策略一致性：manifest.offline.policy 必须与 registry.ts 里该包的实际加载方式一致
 *     （inline ⇔ 静态 import 走 words:/data:；lazy ⇔ 动态 import 走 load:/loadData:）。
 *     未知策略只提示跳过，不伪造通过；无载荷包的未知策略判红（见第 1 项）
 *
 * 用法：node scripts/content/validate.mjs   → 全绿 exit 0，任一 FAIL exit 1
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { sha256Canonical } from './canonical.mjs'
/* 类型白名单**只从 license-policy.mjs 取**，本文件不再自建副本 ——
 * P1.8-A 之前这里是第二份手写镜像，注释写着"任一侧增删类型时两处同改"，
 * 而实际结果就是漂移：契约把 `ContentType` 扩到 14 时，两处 Node 白名单都停在 12。
 * 现在单一副本由 gate:content-type-contract 判据 H 对着契约上锁。 */
import { CONTENT_TYPES } from './license-policy.mjs'

const ROOT = path.resolve(process.cwd())
const CONTENT_DIR = path.join(ROOT, 'content')
/** 第 20 项比对对象：包的「实际加载方式」只在这里定义，Node 跑不了 TS，只能扫文本 */
const REGISTRY_TS = path.join(ROOT, 'src', 'core', 'content', 'registry.ts')

/** 载荷文件名：vocabulary 包固定 words.json；其余类型统一 items.json（可选） */
const payloadNameOf = (type) => (type === 'vocabulary' ? 'words.json' : 'items.json')

/* —— 第 18/19 项阈值：Package = manifest（永远轻、常驻）+ words（按需） —— */
/** 单包 manifest 字节上限。实测最大 1.40 KiB（ts-code），8 KiB 是「永远轻」的硬边界 */
const MANIFEST_MAX_BYTES = 8 * 1024
/** 全库 manifest 字节总和上限。实测 10 包 13.08 KiB；阈值按 40 包规模预留 */
const MANIFEST_TOTAL_MAX_BYTES = 40 * 1024
/** inline 包词条数上限。实测 7 包 346 词 */
const INLINE_MAX_ITEMS = 1000
/** inline 包 words.json 字节上限。实测 7 包 36.17 KiB */
const INLINE_MAX_BYTES = 64 * 1024
/** 已知可判定的策略；其余（runtime / on-demand 等）只提示跳过，不判通过也不判失败 */
const KNOWN_POLICIES = new Set(['inline', 'lazy'])

const kib = (b) => (b / 1024).toFixed(2)

/**
 * 第 20 项：从 registry.ts 文本里解析某个包的实际加载方式。
 * 先定位 `localId: '<id>'`，再在该注册对象块内找 `words:`/`data:`（静态 import ⇒ inline）
 * 或 `load:`/`loadData:`（动态 import ⇒ lazy）。
 * 注意：registry 里可能存在「已声明但未被注册项使用」的 `<id>Words` 静态 import（死代码），
 * 只扫 import 段会把 lazy 包误判成 inline，故必须以注册对象块为准。
 */
function registryLoadMode(src, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\{[^{}]*localId:\\s*['"\`]${esc}['"\`][^{}]*\\}`, 'g')
  const hits = [...src.matchAll(re)]
  if (hits.length === 0) return { mode: 'missing' }
  if (hits.length > 1) return { mode: 'ambiguous', count: hits.length }
  const block = hits[0][0]
  const hasWords = /\b(?:words|data)\s*:/.test(block)
  const hasLoad = /\bload(?:Data)?\s*:/.test(block)
  if (hasWords && hasLoad) return { mode: 'conflict' }
  if (hasWords) return { mode: 'inline' }
  if (hasLoad) return { mode: 'lazy' }
  return { mode: 'unknown' }
}

const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'sources', 'offline']

/** manifest 结构版本，须与 content:build 的 SCHEMA_VERSION 一致（结构破坏性变更时才递增） */
const SCHEMA_VERSION = 4

/** 重复检测 key：NFC + lowercase + 空白折叠（含 \u00A0）。
 *  与第 4 项（精确词形）互补：大小写 / 空格差异在这里会撞车。 */
const WS_RE = /[\s\u00A0]+/g
const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()

/** 端点 ContentId 解析：content:<type>:<namespace>:<localId> */
const CONTENT_ID_RE = /^content:([a-z]+):([a-z0-9-]+):(.+)$/

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  if (!existsSync(CONTENT_DIR)) { console.error('content/ 不存在'); process.exit(1) }
  /* —— B-1 泛化：扫描 content/ 下全部类型子目录，目录名即内容类型 —— */
  const typeDirs = (await readdir(CONTENT_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  for (const t of typeDirs) {
    if (!CONTENT_TYPES.has(t)) fail(`未知内容类型目录 content/${t}/：不在 ContentType 白名单（须与 src/core/content/model/content.ts 联合类型一致）`)
  }
  const knownTypes = typeDirs.filter((t) => CONTENT_TYPES.has(t))
  const pkgsByType = new Map() // type → 包目录 id 列表
  let totalPkgs = 0
  for (const type of knownTypes) {
    const ids = (await readdir(path.join(CONTENT_DIR, type), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    pkgsByType.set(type, ids)
    totalPkgs += ids.length
  }
  console.log(`[content:validate] ${knownTypes.length} 个类型目录 / ${totalPkgs} 个包：${knownTypes.map((t) => `${t}×${pkgsByType.get(t).length}`).join(' ')}`)

  // —— 预扫描：第 12 项 (c) 跨包 ContentId、(e) relation 端点存在性都需要「全库视角」，
  //     单包循环内部看不到其它包，故先静默建一次索引（不可解析的包由主循环报错）。——
  const registry = new Map() // 包目录 id → { type, ns, contentId, normWords:Set }
  for (const [type, ids] of pkgsByType) {
    for (const id of ids) {
      try {
        const mf = JSON.parse(await readFile(path.join(CONTENT_DIR, type, id, 'manifest.json'), 'utf8'))
        const pPath = path.join(CONTENT_DIR, type, id, payloadNameOf(type))
        const payload = existsSync(pPath) ? JSON.parse(await readFile(pPath, 'utf8')) : null
        const ns = new RegExp(`^content:${type}:([a-z0-9-]+):`).exec(mf.id ?? '')?.[1] ?? '?'
        // 词级端点可达性只认 vocabulary 包的词形集合（content:word:<ns>:<词形> 须落在某词表里）
        const normWords = new Set(type === 'vocabulary' && Array.isArray(payload) ? payload.map((w) => normKey(w?.word)) : [])
        registry.set(id, { type, ns, contentId: mf.id, normWords })
      } catch { /* 主循环会 FAIL，这里跳过 */ }
    }
  }

  // 第 20 项：registry.ts 只读一次（Node 无法 import TS）
  const registrySrc = existsSync(REGISTRY_TS) ? await readFile(REGISTRY_TS, 'utf8') : null
  if (registrySrc === null) fail(`registry.ts 不存在或不可读：${REGISTRY_TS}（第 20 项无法判定）`)

  // 第 18/19/20 项聚合容器（跨包结论，循环结束后统一判定）
  const manifestSizes = [] // { id, bytes }
  const inlinePkgs = [] // { id, items, bytes }
  const policyList = [] // { id, policy }

  const seenIds = new Map()
  const seenNs = new Map()
  const globalIds = new Map() // `${namespace}|${normalized word}` → Set<包 id>（12c 跨包兜底，仅 vocabulary 词级 id）
  let totalWords = 0
  for (const [type, ids] of pkgsByType) {
    for (const id of ids) {
      const dir = path.join(CONTENT_DIR, type, id)
      console.log(`▸ ${type}/${id}`)
      let manifest
      try {
        manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
      } catch (e) { fail(`manifest.json 不可解析：${e.message}`); continue }

      // 0. 类型一致性：manifest.type 必须与所在目录名一致（放错目录 = ContentId 类型段说谎）
      if (manifest.type !== type) fail(`manifest.type="${manifest.type}" 与所在目录类型 "${type}" 不一致 → 移到 content/${manifest.type}/ 或修正 type`)

      // 载荷：vocabulary 必有 words.json；其余类型 items.json 可选（无载荷包走 policy/registry 判据）
      const pName = payloadNameOf(type)
      const payloadPath = path.join(dir, pName)
      let payload = null
      if (existsSync(payloadPath)) {
        try { payload = JSON.parse(await readFile(payloadPath, 'utf8')) } catch (e) { fail(`${pName} 不可解析：${e.message}`); continue }
        if (!Array.isArray(payload)) { fail(`${pName} 必须为数组，实际 ${typeof payload}`); continue }
      } else if (type === 'vocabulary') {
        fail('words.json 缺失（vocabulary 包必须有词表载荷）'); continue
      } else {
        console.log(`  · 无 ${pName}（非 vocabulary 包允许无载荷：policy 须合法且 registry 侧可解释）`)
      }
      const dup = [] // 12(a) 包内重复 key（第 4 项判定后回显）
      const keyOf = (it) => (type === 'vocabulary' ? it?.word : it?.id ?? it?.word)

      // 18. manifest 体积取样（UTF-8 文件字节数，不是 JSON.stringify 长度）
      manifestSizes.push({ id, bytes: (await readFile(path.join(dir, 'manifest.json'))).length })

      // 19. inline 预算取样：只有 inline 包的载荷会 1:1 全额进主 chunk，lazy 包不占首屏
      const policy = manifest.offline?.policy
      policyList.push({ id, policy })
      if (policy === 'inline' && payload === null) {
        fail(`offline.policy=inline 但无 ${pName} 载荷：inline 语义是载荷静态进主 chunk，无载荷可进属语义矛盾`)
      } else if (policy === 'inline') {
        inlinePkgs.push({ id, items: manifest.stats?.items ?? 0, bytes: (await readFile(payloadPath)).length })
      }
      if (payload === null && !KNOWN_POLICIES.has(policy)) {
        fail(`无载荷包 offline.policy=${policy ?? '缺失'} 非法（须 inline/lazy，registry 侧才可解释）`)
      }

      // 内容指纹（第 6/15 项共用）：必须走 canonical —— 只取决于数据语义，与文件排版无关
      const canonicalSum = payload === null ? null : sha256Canonical(payload)

    // 2. 必填字段
    const missing = REQUIRED_FIELDS.filter((f) => manifest[f] === undefined)
    if (missing.length === 0) ok('必填字段完整')
    else fail(`manifest 缺字段：${missing.join(', ')}`)

    // 3. ContentId 4 段式（B-1 泛化：类型段 = 所在目录名；namespace 消歧来源族）
    const idOk = new RegExp(`^content:${type}:[a-z0-9-]+:.+$`).test(manifest.id ?? '') && manifest.id.endsWith(`:${id}`)
    if (idOk) ok(`ContentId 规范（${manifest.id}）`)
    else fail(`id 应为 content:${type}:<namespace>:${id}，实际 "${manifest.id}"`)

    // 4. 包内重复 key（vocabulary=词形；其余类型=条目 id。跨包同词刻意允许，不做跨包唯一性约束）
    if (payload !== null) {
      const seen = new Set()
      for (const it of payload) { const k = keyOf(it); if (seen.has(k)) dup.push(k); else seen.add(k) }
      if (dup.length === 0) ok(type === 'vocabulary' ? `无包内重复词条（${payload.length} 词）` : `无包内重复条目 id（${payload.length} 条）`)
      else fail(`包内重复 ${dup.length} 个：${dup.slice(0, 5).join(', ')}...`)
    } else {
      console.log('  · 无载荷，跳过包内重复检测')
    }

    // 5. stats 一致（漂移 → content:build 自动同步；仅 vocabulary 走构建器，其余类型手工保证）
    if (payload === null) console.log('  · 无载荷，跳过 stats 比对')
    else if (manifest.stats?.items === payload.length) ok(`stats.items 与实际一致（${payload.length}）`)
    else fail(`stats.items=${manifest.stats?.items} ≠ 实际 ${payload.length} → vocabulary 包运行 npm run content:build 同步`)

    // 6. checksum（第 6 项 = 来源原始数据指纹，走 canonical 序列化而非文件原文）
    const sources = manifest.sources ?? []
    if (sources.length === 0) fail('sources 为空（V4.1 起为数组，至少一条来源）')
    else if (payload === null) console.log('  · 无载荷，跳过 checksum 比对（无实测基准，不判通过）')
    else if (sources.every((s) => s.checksum === canonicalSum)) ok('checksum 一致（canonical SHA-256）')
    else fail('checksum 漂移：sources[].checksum 与载荷不符 → vocabulary 包运行 npm run content:build')

    // 7. License 门禁（结构化 + 外部来源须有 SPDX）
    let licenseOk = true
    for (const s of sources) {
      const lic = s.license
      if (!lic || typeof lic !== 'object') { fail(`source(${s.origin}) license 非结构化对象（需 {spdx,name,attributionRequired}）`); licenseOk = false; continue }
      if (!lic.name) { fail(`source(${s.origin}) license.name 缺失`); licenseOk = false }
      if (typeof lic.attributionRequired !== 'boolean') { fail(`source(${s.origin}) license.attributionRequired 必须为布尔`); licenseOk = false }
      // 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX。
      // P1.7-Wave4 B-4：判定依据从「origin 含 'curated'」的字符串巧合升级为语义字段
      // provider === 'geek-typing original'（哨兵值见 src/core/content/provenance.ts，
      // 本脚本是 Node 无法 import TS，按字面量镜像，两处同步修改）。
      // provider 缺失时回退旧 origin 规则 —— 兼容未补 provider 的历史 manifest，不是放宽。
      const isSelf = s.provider === 'geek-typing original'
        || (s.provider === undefined && String(s.origin).includes('curated'))
      if (!lic.spdx && !isSelf) {
        fail(`外部来源 ${s.origin}（provider=${s.provider ?? '缺失'}）缺 license.spdx（未知协议内容不得入库）`)
        licenseOk = false
      }
    }
    if (licenseOk && sources.length > 0) ok(`license 结构化（${sources.map((s) => s.license?.spdx ?? 'self').join(', ')}）`)

    // 8. 包 id 唯一（注意：这里校验的是包 ContentId，不是词——跨包同词合法）
    if (seenIds.has(manifest.id)) fail(`包 ContentId 与 ${seenIds.get(manifest.id)} 重复`)
    else seenIds.set(manifest.id, id)

    // 9. namespace 每包唯一 —— 词级 ContentId 全局唯一的**充要条件**。
    //    词级 id = content:word:<namespace>:<词形>，localId 只有词形，不含包 id；
    //    因此只要两个包共用 namespace，同名词的 ContentId 就必然撞车，无法作为学习记录主键。
    //    （曾踩坑：cet4/toefl/ielts 共用 namespace `ecdict` → abandon 三包同 id。
    //     由 V4.1 契约测试 tests/content-query.mjs 实测捕获，规则固化为 `${来源族}-${包 id}`。）
    const ns = new RegExp(`^content:${type}:([a-z0-9-]+):`).exec(manifest.id ?? '')?.[1]
    if (!ns) fail('无法从 id 解析 namespace')
    else if (seenNs.has(ns)) fail(`namespace "${ns}" 与包 ${seenNs.get(ns)} 重复：词级 ContentId 将撞车，namespace 必须每包唯一`)
    else { seenNs.set(ns, id); ok(`namespace 唯一（${ns}）`) }

    // 13. packageId —— 必须与目录名同名（UI / 持久化 / 目录三处指的是同一个包）
    if (manifest.packageId === id) ok(`packageId=${manifest.packageId}（与目录名一致）`)
    else fail(`packageId 应等于目录名 "${id}"，实际 ${manifest.packageId ?? '缺失'} → 运行 npm run content:build`)

    // 14. namespace —— 必须与 manifest.id 第 3 段同源（build 是从最终 ContentId 反解写入的）
    if (typeof manifest.namespace !== 'string' || !manifest.namespace) {
      fail(`namespace 缺失或非法（${manifest.namespace ?? 'undefined'}）→ 运行 npm run content:build`)
    } else if (!ns) {
      // 第 9 项已判 FAIL，此处不重复计数
    } else if (manifest.namespace !== ns) {
      fail(`namespace="${manifest.namespace}" ≠ id 解析出的 "${ns}"：两者必须同源 → 运行 npm run content:build`)
    } else ok(`namespace 与 id 同源（${manifest.namespace}）`)

    if (type === 'vocabulary' && payload !== null) totalWords += payload.length

    // 10. schemaVersion —— 结构版本，由 content:build 写入，改结构才递增
    if (manifest.schemaVersion === SCHEMA_VERSION) ok(`schemaVersion=${manifest.schemaVersion}`)
    else fail(`schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${manifest.schemaVersion ?? '缺失'} → 运行 npm run content:build`)

    // 11. contentVersion —— 内容版本，正整数，由 content:build 按 checksum 变化自增
    if (Number.isInteger(manifest.contentVersion) && manifest.contentVersion > 0) ok(`contentVersion=${manifest.contentVersion}`)
    else fail(`contentVersion 必须为正整数，实际 ${manifest.contentVersion ?? '缺失'} → 运行 npm run content:build`)

    // 15. contentChecksum —— 入库内容的 canonical 指纹（与文件排版无关）
    if (payload === null) console.log('  · 无载荷，跳过 contentChecksum 实测比对（三元组自洽由第 16 项覆盖）')
    else if (manifest.contentChecksum === canonicalSum) ok(`contentChecksum 一致（${canonicalSum.slice(7, 15)}…）`)
    else fail(`contentChecksum 漂移：manifest=${manifest.contentChecksum ?? '缺失'} ≠ 实际 ${canonicalSum} → 运行 npm run content:build`)

    // 16. 版本三元组自洽：revision / version 正整数，且能在 contentHistory 里找到
    //     checksum 命中的那条记录（取最近一条，与 build 的复用口径一致）。
    //     回滚场景：version 回到历史值 ⇒ 允许 revision > 命中条目的 revision（审计号只增不减）。
    const rev = manifest.contentRevision
    const ver = manifest.contentVersion
    const revOk = Number.isInteger(rev) && rev > 0
    const verOk = Number.isInteger(ver) && ver > 0
    if (!revOk) fail(`contentRevision 必须为正整数，实际 ${rev ?? '缺失'} → 运行 npm run content:build`)
    if (!verOk) fail(`contentVersion 必须为正整数，实际 ${ver ?? '缺失'} → 运行 npm run content:build`)
    const history = Array.isArray(manifest.contentHistory) ? manifest.contentHistory : []
    if (history.length === 0) {
      fail('contentHistory 缺失或为空 → 运行 npm run content:build')
    } else {
      const hitEntry = [...history].reverse().find((e) => e?.checksum === manifest.contentChecksum)
      if (!hitEntry) fail(`contentHistory 中不存在 checksum === contentChecksum 的条目 → 运行 npm run content:build`)
      else if (hitEntry.version !== ver) fail(`contentHistory 命中条目 version=${hitEntry.version} ≠ contentVersion=${ver} → 运行 npm run content:build`)
      else if (!(Number.isInteger(hitEntry.revision) && hitEntry.revision > 0 && hitEntry.revision <= rev)) fail(`contentHistory 命中条目 revision=${hitEntry.revision} 应 ≤ contentRevision=${rev}`)
      else if (revOk && verOk) ok(`版本三元组自洽（revision=${rev} version=${ver} history=${history.length} 条，命中 revision=${hitEntry.revision}）`)
    }

    // 17. build 溯源：谁、什么时候、用哪份源数据产出了这份 manifest
    const b = manifest.build
    if (!b || typeof b !== 'object') fail(`build 字段缺失（应为 {toolVersion,builtAt,sourceChecksum}）→ 运行 npm run content:build`)
    else {
      let buildOk = true
      if (typeof b.toolVersion !== 'string' || !b.toolVersion) { fail('build.toolVersion 缺失或为空'); buildOk = false }
      if (typeof b.builtAt !== 'string' || !b.builtAt || Number.isNaN(Date.parse(b.builtAt))) { fail(`build.builtAt 不是合法时间：${b.builtAt ?? '缺失'}`); buildOk = false }
      if (b.sourceChecksum !== manifest.contentChecksum) { fail(`build.sourceChecksum(${b.sourceChecksum ?? '缺失'}) ≠ contentChecksum(${manifest.contentChecksum ?? '缺失'})`); buildOk = false }
      if (buildOk) ok(`build 溯源完整（${b.toolVersion} @ ${b.builtAt}）`)
    }

    // 12. Duplicate Detection —— 按「可判定性」分级：能判的判死，判不了的如实说跳过，
    //     绝不用「假装通过」凑绿。
    //   (a) 包内 duplicate localId（精确词形）：第 4 项已覆盖并报错，此处只回显，避免重复计数
    //   (g) orphan learning record：学习记录挂在 ContentId 上、随用户练习产生，
    //       属运行时一致性问题，由 Learning 层（src/core/review/*）负责，脚本不校验。
    if (payload !== null && dup.length === 0) ok('duplicate localId：无（第 4 项已判定）')

    //   (b) 包内 duplicate normalized key：NFC+lowercase+空白折叠后同 key 即撞车
    if (payload !== null) {
      const normSeen = new Map()
      const normDup = []
      payload.forEach((it, i) => {
        const k = normKey(keyOf(it))
        if (!k) return
        if (normSeen.has(k)) normDup.push(`"${keyOf(it)}"（#${normSeen.get(k)} ↔ #${i}）`)
        else normSeen.set(k, i)
      })
      if (normDup.length === 0) ok('无 duplicate normalized key（大小写/空白差异已并入 key）')
      else fail(`duplicate normalized key ${normDup.length} 个：${normDup.slice(0, 5).join('；')}`)
    }

    //   (c) 跨包 duplicate ContentId：key = namespace + normalized localId。
    //       只统计「同一个 key 出现在 ≥2 个包」，包内重复由 12(b) 负责，不在这里重复计数。
    //       namespace 每包唯一（第 9 项）后理论上不可能撞车，这里作兜底回归检测，
    //       结果在所有包循环结束后统一判定。词级 id 只存在于 vocabulary 包，故只扫 vocabulary。
    if (type === 'vocabulary' && payload !== null) {
      for (const w of payload) {
        const k = normKey(w?.word)
        if (!k) continue
        const gk = `${ns ?? '?'}|${k}`
        if (!globalIds.has(gk)) globalIds.set(gk, new Set())
        globalIds.get(gk).add(id)
      }
    }

    //   (d) duplicate source：同一 origin 在 sources[] 里出现两次
    const origins = sources.map((s) => s?.origin)
    const dupOrigin = [...new Set(origins.filter((o, i) => origins.indexOf(o) !== i))]
    if (dupOrigin.length === 0) ok(`无 duplicate source（${origins.length} 条来源）`)
    else fail(`duplicate source origin：${dupOrigin.join(', ')}`)

    //   (e) invalid / orphan relation —— 只有 relations.json 存在才校验
    const relPath = path.join(dir, 'relations.json')
    if (!existsSync(relPath)) {
      console.log('  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）')
    } else {
      let raw
      try { raw = JSON.parse(await readFile(relPath, 'utf8')) } catch (e) { fail(`relations.json 不可解析：${e.message}`) }
      if (raw !== undefined) {
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.relations) ? raw.relations : null)
        if (!list) fail('relations.json 结构无法识别（期望数组或 { relations: [...] }）')
        else {
          const problems = []
          list.forEach((r, i) => {
            const ends = Array.isArray(r?.endpoints) ? r.endpoints : [r?.from ?? r?.source, r?.to ?? r?.target]
            for (const e of ends) {
              const m2 = typeof e === 'string' ? CONTENT_ID_RE.exec(e) : null
              if (!m2) { problems.push(`#${i} 端点非法：${JSON.stringify(e)}`); continue }
              const [, type, ns2, local] = m2
              const reachable = [...registry.values()].some(
                (p) => p.contentId === e || (type === 'word' && p.ns === ns2 && p.normWords.has(normKey(local))),
              )
              if (!reachable) problems.push(`#${i} 孤儿端点：${e}`)
            }
          })
          if (problems.length === 0) ok(`relations.json ${list.length} 条：端点合法且可达`)
          else fail(`relation 校验失败 ${problems.length} 处：${problems.slice(0, 3).join('；')}`)
        }
      }
    }

    //   (f) broken asset —— 只有 manifest 存在 assets 字段才校验
    if (manifest.assets === undefined) {
      console.log('  · manifest 无 assets 字段，跳过 asset 校验')
    } else if (!Array.isArray(manifest.assets)) {
      fail('manifest.assets 必须为数组')
    } else {
      const broken = manifest.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
      if (broken.length === 0) ok(`assets ${manifest.assets.length} 项 url 合法`)
      else fail(`broken asset ${broken.length} 项：${broken.slice(0, 3).map((a) => a?.url).join(', ')}`)
    }
    }
  }

  // 12(c) 跨包结论（全库扫描后统一判定）
  const crossDups = [...globalIds.entries()].filter(([, packs]) => packs.size > 1)
    .map(([k, packs]) => `${k.split('|')[1]}（${[...packs].join(' ↔ ')}）`)
  if (crossDups.length > 0) fail(`跨包 duplicate ContentId ${crossDups.length} 处：${crossDups.slice(0, 5).join('；')}`)
  else ok(`跨包无 duplicate ContentId（全库 ${totalWords} 词扫描，namespace 唯一 ⇒ 兜底回归）`)

  /* ===== 18. manifest 体积 =====
   * manifest 常驻主 chunk（registry 静态 import），是「包数」的函数而不是「词数」的函数。
   * 词库从 43 词涨到 3000 词时 manifest 只该多几十字节；越过 8 KiB 说明有人把词表/释义
   * 之类的重数据塞进了 manifest —— 那会 1:1 推高首屏。 */
  {
    const total = manifestSizes.reduce((a, s) => a + s.bytes, 0)
    const biggest = manifestSizes.reduce((a, s) => (a === null || s.bytes > a.bytes ? s : a), null)
    const over = manifestSizes.filter((s) => s.bytes >= MANIFEST_MAX_BYTES)
    if (over.length > 0) {
      fail(`manifest 单包体积越界 ${over.length} 个（须 < ${MANIFEST_MAX_BYTES} B）：${over.map((s) => `${s.id} ${s.bytes} B（${kib(s.bytes)} KiB）`).join('；')}`)
    } else if (total >= MANIFEST_TOTAL_MAX_BYTES) {
      fail(`manifest 全库体积越界：${total} B（${kib(total)} KiB）≥ ${MANIFEST_TOTAL_MAX_BYTES} B（${MANIFEST_TOTAL_MAX_BYTES / 1024} KiB）⇒ manifest 常驻主 chunk，总和膨胀直接推高首屏`)
    } else {
      ok(`manifest 体积（最大 ${kib(biggest.bytes)} KiB「${biggest.id}」，全库 ${kib(total)} KiB < ${MANIFEST_MAX_BYTES / 1024}/${MANIFEST_TOTAL_MAX_BYTES / 1024} KiB）`)
    }
  }

  /* ===== 19. inline 预算 =====
   * inline 包的 words.json 被静态 import 进主 chunk，实测传导比 1:1.0005（kaoyan 改 inline
   * ⇒ 主 chunk raw +471.92 KiB / gzip +166.41 KiB）。词库增长必须走 lazy，不能靠加 inline。 */
  {
    const items = inlinePkgs.reduce((a, p) => a + p.items, 0)
    const bytes = inlinePkgs.reduce((a, p) => a + p.bytes, 0)
    const ids = inlinePkgs.map((p) => `${p.id}(${p.items}词/${kib(p.bytes)}KiB)`).join(', ')
    const limit = `${INLINE_MAX_ITEMS} 词 / ${INLINE_MAX_BYTES / 1024} KiB`
    if (items > INLINE_MAX_ITEMS) {
      fail(`inline 词条数越界：${items} > ${INLINE_MAX_ITEMS}（${ids}）⇒ inline 词 1:1 进主 chunk，请改为 lazy`)
    } else if (bytes > INLINE_MAX_BYTES) {
      fail(`inline words 体积越界：${bytes} B（${kib(bytes)} KiB）> ${INLINE_MAX_BYTES} B（${INLINE_MAX_BYTES / 1024} KiB）（${ids}）⇒ 请改为 lazy`)
    } else {
      ok(`inline 预算（${inlinePkgs.length} 包：${ids} | Σ ${items} 词 / ${kib(bytes)} KiB ≤ ${limit}）`)
    }
  }

  /* ===== 20. 策略一致性：manifest.offline.policy ↔ registry 实际加载方式 =====
   * 两边任一处改漏都会静默破坏首屏体积契约：manifest 说 lazy、registry 却静态 import
   * ⇒ 大词库悄悄进主 chunk；反之则首屏该有的词库变成异步缺口。 */
  {
    const skipped = []
    let consistent = 0
    let policyFails = 0
    for (const { id, policy } of policyList) {
      if (!KNOWN_POLICIES.has(policy)) { skipped.push(`${id}（policy=${policy ?? '缺失'}）`); continue }
      if (registrySrc === null) { policyFails++; continue } // 第 20 项前置已 FAIL，此处不重复报错
      const r = registryLoadMode(registrySrc, id)
      if (r.mode === policy) { consistent++; continue }
      policyFails++
      if (r.mode === 'missing') fail(`策略不一致：${id} manifest policy=${policy}，但 registry.ts 中找不到 localId: '${id}' 的注册项`)
      else if (r.mode === 'ambiguous') fail(`策略不一致：${id} 在 registry.ts 中匹配到 ${r.count} 个注册项，无法判定实际加载方式`)
      else if (r.mode === 'conflict') fail(`策略不一致：${id} 在 registry.ts 中同时存在 words: 与 load:，无法判定实际加载方式`)
      else if (r.mode === 'unknown') fail(`策略不一致：${id} manifest policy=${policy}，但 registry.ts 注册项里既无 words:/data: 也无 load:/loadData:`)
      else fail(`策略不一致：${id} manifest policy=${policy}，registry.ts 实际为 ${r.mode}（${r.mode === 'inline' ? '静态 import ⇒ 进主 chunk' : '动态 import ⇒ 独立 chunk'}）：两边须同改`)
    }
    if (skipped.length > 0) {
      console.log(`  · 策略一致性跳过 ${skipped.length} 包（未知策略，不判通过也不判失败）：${skipped.join('；')}`)
    }
    if (policyFails === 0) {
      const nInline = policyList.filter((p) => p.policy === 'inline').length
      const nLazy = policyList.filter((p) => p.policy === 'lazy').length
      ok(`策略一致性（manifest ↔ registry）：${consistent} 包一致（inline ${nInline} / lazy ${nLazy}${skipped.length ? `，跳过 ${skipped.length}` : ''}）`)
    }
  }

  if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[content:validate] PASS：${totalPkgs} 包全部通过`)
}

main().catch((e) => { console.error('[content:validate] 异常：', e.message); process.exit(1) })
