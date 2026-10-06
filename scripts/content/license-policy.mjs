/* V4.1 · License Policy —— 内容溯源与许可证决策（P1.7-Wave4 B-3/B-5 共享）。
 *
 * 两个职责：
 *  1. 内容包发现 + 解析（loadPackages）：ingest / gate 共用，避免两处各写一遍发现逻辑。
 *  2. License Policy Matrix（decideLicense）：把每条 source 的许可证映射成可机读决策。
 *
 * 设计约束（与 validate.mjs 同源但独立可跑）：
 *  - Node 无法 import TS，ContentType 白名单按字面量镜像 src/core/content/model/content.ts。
 *  - 自有内容哨兵值 'geek-typing original' 与 src/core/content/provenance.ts 的
 *    PROVIDER_ORIGINAL 常量同源（两处须同步修改）。
 *
 * License Policy Matrix（版本化 license-policy-1，由 ingest 程序输出，禁止手填）。
 * **判定优先级自上而下，首条命中即返回** —— 顺序本身就是契约的一部分，改顺序 = 改语义：
 *
 *  [0] 公开分发声明（冻结 Plan §4.1 门禁规则 `:157` / `:158`）—— **对自有内容同样适用**：
 *      · `license.commercialUse !== true`（**字段缺失也算「不 true」**）             → rejected（§4.1 :157）
 *      · `license.attributionRequired === true` 且 `license.attribution` 为空/仅空白 → rejected（§4.1 :158）
 *      · `license.redistributable` **缺失 / 非布尔**                → rejected（公开分发声明第三维，见下）
 *      为什么排在自有哨兵**之前**：自有内容的「license 自主」只意味着**不强制要求 SPDX**；
 *      而这两条是「公开分发声明」（能不能再分发 / 必须署名），属**分发**层面的事实，
 *      与内容是否自家整理无关 —— 故对自有内容**同样生效**，不能被哨兵短路掉。
 *      边界：结构化 `license` 对象整体缺失时本段跳过（无法评估），交给 [2]（外部 ⇒ rejected）
 *      或 [1]（自有 ⇒ allowed）按既有口径处置。
 *
 * ── 为什么新增 `redistributable`（本文件此前的公开分发声明只有两维）──
 *   本文件历史注释把「能不能再分发」与「是否必须署名」并列为**公开分发声明**的两条
 *   （见上方 [0] 与 `gate-license.mjs` 头部），但实际落地的机器判据只覆盖了
 *   `commercialUse`（能否商用，§4.1 :157）与 `attributionRequired`+`attribution`
 *   （是否必须署名且给了文本，§4.1 :158）—— **「可否再分发」从未有任何机器断言**，
 *   它只活在注释里。
 *   ⇒ 门禁对「一份声明了 commercialUse:true 却禁止再分发」的内容**照样全绿**，
 *      这正是本仓反复吃过的「门禁盲区 ⇒ 缺陷一路过 CI」同型病（假绿）。
 *   故新增第三维 `redistributable: boolean`，**显式声明**该来源是否允许再分发：
 *     · 字段**缺失**或**非布尔** ⇒ rejected（**fail-closed**：无声明 ≠ 允许再分发，
 *       与「缺失即视为允许」的假绿形态正好相反；沿用本项目「UNKNOWN 视为不通过」纪律）。
 *     · 显式 `false` ⇒ **合法且被如实记录**（内容确实不可再分发，如 Proprietary 自有内容）：
 *       判据只强制「必须表态」，不强制「必须为 true」—— 否则等于用门禁逼所有内容开源。
 *     · 显式 `true` ⇒ 允许再分发（本轮 13 个词库包即此档，构成机器可读的「可开源」白名单）。
 *   字段语义与 `commercialUse` 正交：NC 协议常`commercialUse:false` 但**允许**非商业再分发，
 *   两者不可互相推导，故必须各自显式声明。
 *  [1] 自有内容（provider 哨兵 PROVIDER_ORIGINAL） → allowed（license 自主：不强制要求 SPDX）
 *  [2] 结构化 license 缺失                        → rejected（无 license ⇒ 判红）
 *  [3] MIT / Apache*                              → allowed
 *  [4] CC-BY-*（非 SA/NC）                        → allowed+attribution
 *  [5] CC-BY-SA* / GPL*                           → review_required
 *  [6] CC-BY-NC*                                  → rejected
 *  [7] NOASSERTION                                → review_required
 *  [8] 其它显式 SPDX（矩阵外） / 外部来源无 SPDX    → rejected（unknown）
 *
 * 本矩阵是**唯一实现**：`asset-rules.mjs` / `gate-license.mjs` / `validate.mjs` 只调用不复制。
 *  §4.1 全表的「判据 ↔ 证伪用例」绑定见 `scripts/gate-license.mjs` 的 `PLAN_4_1_COVERAGE`。
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { sha256Canonical } from './canonical.mjs'

/** License Policy Matrix 版本（表版本化，ingest 输出文件名即此值） */
export const LICENSE_POLICY_VERSION = 'license-policy-1'
/** 自有内容哨兵值（与 provenance.ts 同源） */
export const PROVIDER_ORIGINAL = 'geek-typing original'

/** 内容**包级**类型白名单（= `content/<type>/` 合法目录名）。
 *
 *  权威是 `src/core/content/types/registry.ts` 的 `packageLevelTypes()`（13 项）。
 *  本文件是 Node 侧唯一的副本（`validate.mjs` 已改为从这里 import，不再各写一份），
 *  由 `gate:content-type-contract` 判据 H 对着契约逐项强制相等 —— 契约加类型而这里没跟上，
 *  门禁立刻判红（P18-A 实测确实漂过一次：契约扩到 14 项时两处 Node 白名单都停在 12 项）。
 *
 *  为什么不含 `word`：`word` 是**条目级**类型（packageLevel=false），其条目住在 vocabulary 包里，
 *  不存在 `content/word/` 目录。含它会让"未知类型目录"判据放过一个不该存在的目录。 */
export const CONTENT_TYPES = new Set([
  'vocabulary', 'listening', 'audio', 'reading', 'topic', 'exercise',
  'writing', 'speaking', 'grammar', 'document', 'collection',
  'course', 'lesson',
])

/** 载荷文件名：vocabulary 固定 words.json；其余类型统一 items.json（可选） */
export const payloadNameOf = (type) => (type === 'vocabulary' ? 'words.json' : 'items.json')

/** ContentId 端点解析：content:<type>:<namespace>:<localId> */
export const CONTENT_ID_RE = /^content:([a-z]+):([a-z0-9-]+):(.+)$/

const _ROOT = path.resolve(process.cwd())

/**
 * `--root=<dir>` 解析（P18-G0）：**仅**覆盖「内容包目录」，ROOT / registry.ts / i18n 等一律不变。
 *
 * 为什么需要它（不是为便利，是为可验证）：relations 端点判据必须对**隔离副本**做端到端验证
 * （往副本里注入合法 / 非法 relations.json，看判据能否分别判绿与判红）。而本机 node 进程内
 * spawn 一律 EBUSY ⇒ 测试脚本**起不了子进程去跑门** ⇒ 只能让门自己支持 `--root`，
 * 由人 / CI 指向临时副本跑一次并留档（见裁定 §⑪-4）。
 * 三种形态与 validate.mjs 原实现一致：`--root=<dir>` / `--root <dir>` / 缺省 ROOT/content。
 *
 * @param {string[]} argv
 * @param {string} root 仓库根（缺省 process.cwd()）
 * @returns {string} 内容包目录绝对路径
 */
export function resolveContentDir(argv = process.argv.slice(2), root = path.resolve(process.cwd())) {
  let raw = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--root=')) { raw = argv[i].slice('--root='.length); break }
    if (argv[i] === '--root') { raw = argv[i + 1] ?? null; break }
  }
  return raw === null || raw === '' ? path.join(root, 'content') : path.resolve(root, raw)
}

/**
 * 发现并解析内容包目录下全部包。
 * @param {string} contentDir 内容包目录（缺省 resolveContentDir()）
 * @returns {Promise<Array<{type,id,dir,manifest,payloadName,payloadExists,payload}>>}
 */
export async function loadPackages(contentDir = resolveContentDir()) {
  const CONTENT_DIR = contentDir
  if (!existsSync(CONTENT_DIR)) return []
  const out = []
  const typeDirs = (await readdir(CONTENT_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && CONTENT_TYPES.has(d.name))
    .map((d) => d.name)
    .sort()
  for (const type of typeDirs) {
    const base = path.join(CONTENT_DIR, type)
    const ids = (await readdir(base, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    for (const id of ids) {
      const dir = path.join(base, id)
      let manifest = null
      try { manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) } catch { continue }
      const payloadName = payloadNameOf(type)
      const payloadPath = path.join(dir, payloadName)
      const payloadExists = existsSync(payloadPath)
      let payload = null
      if (payloadExists) {
        try { payload = JSON.parse(await readFile(payloadPath, 'utf8')) } catch { payload = null }
      }
      out.push({ type, id, dir, manifest, payloadName, payloadExists, payload })
    }
  }
  return out
}

/**
 * 单条来源 → 许可证决策。返回 { decision, reason }。
 * decision ∈ 'allowed' | 'allowed+attribution' | 'review_required' | 'rejected'
 */
export function decideLicense(source) {
  const provider = source?.provider
  const lic = source?.license
  const structured = lic !== null && typeof lic === 'object' && !Array.isArray(lic)

  // [0] 公开分发声明（冻结 Plan §4.1 :157 / :158 + 本轮新增第三维）—— 对自有内容同样适用，
  //     故排在自有哨兵之前。「自有内容 license 自主」只豁免 SPDX；
  //     能否商用 / 能否再分发 / 是否必须署名都是**分发层面**的事实。
  if (structured) {
    // 第三维：可否再分发必须**显式**声明。缺失/非布尔 ⇒ 判红（fail-closed）：
    // 「没写」是 UNKNOWN，不是「允许」—— 那正是本文件此前注释里承诺、却无机器判据的假绿形态。
    if (typeof lic.redistributable !== 'boolean') {
      return {
        decision: 'rejected',
        reason: `license.redistributable=${JSON.stringify(lic.redistributable)} 不是布尔值（字段缺失同样不算声明）`
          + ' ⇒ rejected：可否再分发必须显式声明，UNKNOWN ≠ 允许（公开分发声明第三维）',
      }
    }
    if (lic.commercialUse !== true) {
      return {
        decision: 'rejected',
        reason: `license.commercialUse=${JSON.stringify(lic.commercialUse)} !== true（缺失也算不 true，不可假定允许商用）⇒ rejected（冻结 Plan §4.1 :157）`,
      }
    }
    if (lic.attributionRequired === true && String(lic.attribution ?? '').trim() === '') {
      return {
        decision: 'rejected',
        reason: 'license.attributionRequired === true 但 license.attribution 为空/仅空白（无署名文本 ⇒ 无法满足署名义务）⇒ rejected（冻结 Plan §4.1 :158）',
      }
    }
  }

  // [1] 自有内容：license 自主，恒 allowed（不依赖 SPDX 措辞）
  if (provider === PROVIDER_ORIGINAL) {
    return { decision: 'allowed', reason: `provider=${PROVIDER_ORIGINAL} ⇒ 自有内容，license 自主` }
  }

  // [2] 结构化 license 缺失 → 无 license（判红）
  if (!structured || !lic.name) {
    return { decision: 'rejected', reason: 'source 无结构化 license（无 license ⇒ 判红）' }
  }

  // [3]–[8] SPDX 矩阵
  const spdx = String(lic.spdx ?? '').trim()
  if (!spdx) {
    // 外部来源无 SPDX：未知协议，rejected
    return { decision: 'rejected', reason: '外部来源无 license.spdx（unknown ⇒ rejected）' }
  }
  const u = spdx.toUpperCase()
  if (u === 'NOASSERTION') return { decision: 'review_required', reason: 'SPDX=NOASSERTION ⇒ review_required' }
  if (u === 'MIT' || u.startsWith('APACHE')) return { decision: 'allowed', reason: `SPDX=${spdx} ⇒ allowed` }
  if (u.startsWith('CC-BY-') && !u.includes('SA') && !u.includes('NC')) {
    return { decision: 'allowed+attribution', reason: `SPDX=${spdx} ⇒ allowed+attribution` }
  }
  if (u.startsWith('CC-BY-SA') || u.startsWith('GPL')) {
    return { decision: 'review_required', reason: `SPDX=${spdx} ⇒ review_required` }
  }
  if (u.startsWith('CC-BY-NC')) return { decision: 'rejected', reason: `SPDX=${spdx} ⇒ rejected` }
  // 其它显式 SPDX 不在矩阵内 → unknown → rejected
  return { decision: 'rejected', reason: `SPDX=${spdx} 不在 License Policy Matrix（unknown ⇒ rejected）` }
}

/** 包级决策 = 其所有 source 决策里「最严格」的一个 */
export function decidePackage(sources = []) {
  const order = { allowed: 0, 'allowed+attribution': 1, review_required: 2, rejected: 3 }
  let worst = null
  const perSource = []
  for (const s of sources) {
    const d = decideLicense(s)
    perSource.push({ origin: s?.origin, provider: s?.provider, spdx: s?.license?.spdx ?? null, ...d })
    if (!worst || order[d.decision] > order[worst.decision]) worst = d
  }
  return { decision: worst?.decision ?? 'rejected', perSource, reason: worst?.reason ?? 'no sources' }
}

/** canonical 指纹（与 validate.mjs 同口径：只取决于数据语义，与排版无关） */
export const checksumPayload = (payload) => (payload == null ? null : sha256Canonical(payload))
