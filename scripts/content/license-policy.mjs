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
 * License Policy Matrix（版本化 license-policy-1，由 ingest 程序输出，禁止手填）：
 *  MIT / Apache*            → allowed
 *  CC-BY-*（非 SA/NC）      → allowed+attribution
 *  CC-BY-SA* / GPL*        → review_required
 *  CC-BY-NC*               → rejected
 *  NOASSERTION             → review_required
 *  其它显式 SPDX（矩阵外）   → rejected（unknown）
 *  外部来源无 SPDX（缺失）   → rejected（unknown，无 license 判红）
 *  自有内容（provider 哨兵） → allowed（license 自主）
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

const ROOT = path.resolve(process.cwd())
const CONTENT_DIR = path.join(ROOT, 'content')

/**
 * 发现并解析 content/ 下全部内容包。
 * @returns {Promise<Array<{type,id,dir,manifest,payloadName,payloadExists,payload}>>}
 */
export async function loadPackages() {
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

  // 自有内容：license 自主，恒 allowed（不依赖 SPDX 措辞）
  if (provider === PROVIDER_ORIGINAL) {
    return { decision: 'allowed', reason: `provider=${PROVIDER_ORIGINAL} ⇒ 自有内容，license 自主` }
  }

  // 结构化 license 缺失 → 无 license（判红）
  if (!lic || typeof lic !== 'object' || !lic.name) {
    return { decision: 'rejected', reason: 'source 无结构化 license（无 license ⇒ 判红）' }
  }

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
