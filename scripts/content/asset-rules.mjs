/* P1.8-B · Asset Rules —— Node 侧**资产规则的唯一实现**（P1.8-DESIGN-RULINGS ③④-7）。
 *
 * 为什么单独一份：
 *   资产规则会被 `scripts/content/validate.mjs`（入库后校验，判据 7/12f/21）与
 *   后续的 `scripts/gate-license.mjs`（入库前置硬门）**共同使用**。两份手写实现 =
 *   下一场「12→14 白名单漂移」，只是这次漂的是资产规则。故：
 *     - 资产规则只允许存在于本文件；
 *     - 许可判定矩阵只允许存在于 `scripts/content/license-policy.mjs` 的 `decideLicense`，
 *       本文件**不得复制该矩阵，只调用它**；
 *     - `validate.mjs` 里不许出现资产规则逻辑（只 import 后调用）。
 *
 * 镜像来源（**逐行为一致**，改任一处必须同步另一处）：
 *   - `src/core/content/model/asset.ts:39-41`  makeAssetId —— `` `${host}#a:${local}` ``（本文件只读不构造）
 *   - `src/core/content/model/asset.ts:52-60`  parseAssetId —— 按**第一个** `#a:` 用 indexOf 切分；
 *                                              宿主段走 content.ts 的 parseContentId（此处用
 *                                              license-policy.mjs 已有的 CONTENT_ID_RE，同一正则）；
 *                                              本地段走 content.ts 的 isStableLocalId。
 *   - `src/core/content/model/asset.ts:64-66`  isAssetOwnedBy —— parseAssetId 的宿主段相等判定
 *   - `src/core/content/model/content.ts:66-70`  parseContentId（宿主段文法）
 *   - `src/core/content/model/content.ts:145-155` normalizeLocalId（本文件 normalizeLocalId 镜像它）
 *   - `src/core/content/model/content.ts:161-166` isStableLocalId（本文件 isStableLocalId 镜像它）
 *   一致性由 `gate:content-type-contract` 判据 **H3** 在语料上证明（同 H1/H2 手法：
 *   权威只有一处，一致性由机器证明，不靠注释）。
 *   本文件**不新造正则**：宿主段复用 CONTENT_ID_RE，本地段只搬 content.ts 的谓词。
 *
 * 每条规则返回**结构化判定**（不打印），供门与校验器复用：
 *   { ok: true } / { ok: false, code, message }
 */

import { CONTENT_ID_RE, decideLicense } from './license-policy.mjs'

/** assetId 中「宿主包 ContentId」与「本地键」的分隔符（与 asset.ts:34 的 ASSET_ID_SEP 同值） */
export const ASSET_SEPARATOR = '#a:'

/** asset 的 checksum 形态：`sha256:<64 位小写 hex>`（Plan §3.1「checksum 必填」） */
const CHECKSUM_RE = /^sha256:[0-9a-f]{64}$/

const pass = () => ({ ok: true })
const bad = (code, message) => ({ ok: false, code, message })
/** 违规条目（供 checkManifestAssets 汇总） */
const violation = (code, message) => ({ code, message })

/** 镜像 `src/core/content/model/content.ts:145-155` 的 normalizeLocalId（Node 无法 import TS） */
function normalizeLocalId(raw) {
  return String(raw)
    .normalize('NFC')
    .trim()
    // 连续空白（含不间断空格 \u00A0 / 制表 / 换行）折叠为单个空格
    .replace(/[\s\u00A0]+/g, ' ')
    // 控制字符一律删除（\u0000-\u001F、\u007F）
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // `:` 与 `/` 会破坏 4 段式 ContentId 解析，退化成 `-`
    .replace(/[:/]/g, '-')
}

/** 镜像 `src/core/content/model/content.ts:161-166` 的 isStableLocalId */
function isStableLocalId(id) {
  if (!id) return false
  if (id.includes(':') || id.includes('/')) return false
  if (/[\u0000-\u001F\u007F]/.test(id)) return false
  return normalizeLocalId(id) === id
}

/**
 * 解析 assetId —— 与 `asset.ts:52-60` 的 parseAssetId **逐行为一致**；不合法返回 null。
 * 按**第一个** `#a:` 切分（indexOf，不用贪婪正则去猜）：宿主段 → ContentId 文法，本地段 → 稳定 localId。
 * 于是以下都返回 null：无 `#a:` / 本地键为空 / `#A:`（大写不是分隔符）/ 出现两个 `#a:`
 * （第二个被并进本地键，其中含 `:` → 本地段校验不过）/ 前后空白 / 宿主段不是合法 ContentId。
 */
export function parseAssetId(id) {
  if (typeof id !== 'string') return null
  const at = id.indexOf(ASSET_SEPARATOR)
  if (at < 0) return null
  const hostContentId = id.slice(0, at)
  const assetLocalId = id.slice(at + ASSET_SEPARATOR.length)
  if (!CONTENT_ID_RE.test(hostContentId)) return null
  if (!isStableLocalId(assetLocalId)) return null
  return { hostContentId, assetLocalId }
}

/** 该 asset 是否属于指定宿主包（所有权规则 1「Asset 不可跨包引用」）—— 镜像 `asset.ts:64-66` */
export function isAssetOwnedBy(assetId, hostContentId) {
  return parseAssetId(assetId)?.hostContentId === hostContentId
}

/* ------------------------------ 单条规则 ------------------------------ */

/** assetId 语法 + 归属断言（asset 必须属于本包）。 */
export function checkAssetIdShape(assetId, hostContentId) {
  const parsed = parseAssetId(assetId)
  if (parsed === null) {
    return bad(
      'ASSET_ID_SHAPE',
      `assetId 非法：${JSON.stringify(assetId)}；应为 \`<宿主包 ContentId>#a:<assetLocalId>\`（宿主段须为合法 ContentId，本地段须为稳定 localId）`,
    )
  }
  if (parsed.hostContentId !== hostContentId) {
    return bad(
      'ASSET_NOT_OWNED',
      `归属失败：assetId 宿主为 ${parsed.hostContentId}，本包 ContentId 为 ${hostContentId}（Asset 不可跨包引用，生命周期严格随宿主包）`,
    )
  }
  return pass()
}

/** checksum 必须匹配 `sha256:<64 位小写 hex>`。 */
export function checkAssetChecksum(checksum) {
  if (typeof checksum !== 'string' || !CHECKSUM_RE.test(checksum)) {
    return bad(
      'ASSET_CHECKSUM_SHAPE',
      `checksum 非法：${JSON.stringify(checksum)}；须为 \`sha256:<64 位小写 hex>\``,
    )
  }
  return pass()
}

/** url 必须是 `https://` 绝对 URL（`http:` 明文 / 相对路径 / 协议相对 `//` 一律 FAIL）。 */
export function checkAssetUrl(url) {
  const fail = (why) => bad('ASSET_URL_NOT_HTTPS', `url 必须为 https:// 绝对 URL（${why}），实际 ${JSON.stringify(url)}`)
  if (typeof url !== 'string' || !url.startsWith('https://')) return fail('http: 明文 / 相对路径 / 协议相对 // 一律 FAIL')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return fail('不可解析为绝对 URL')
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return fail('缺少主机名')
  return pass()
}

/** asset 必须带 provenance，且 `provider` 非空（复用 Provenance，其必填字段是 provider）。 */
export function checkAssetProvenance(asset) {
  const p = asset?.provenance
  if (p === null || typeof p !== 'object' || Array.isArray(p)) {
    return bad('ASSET_PROVENANCE_MISSING', 'asset 缺 provenance（必填，复用 Provenance 类型，至少含非空 provider）')
  }
  if (typeof p.provider !== 'string' || p.provider.trim() === '') {
    return bad('ASSET_PROVENANCE_MISSING', 'asset.provenance.provider 缺失或为空（Provenance 的必填字段是 provider，不是 origin）')
  }
  return pass()
}

/**
 * asset 许可二选一（P1.8 裁定 ④-2 / ④-2b）：**内联 `license` XOR `licenseRef`**。
 * 两个都写 / 都不写 → FAIL；写 `licenseRef` 时必须解析到 `packageLicenses[ref]`，解析不到 → FAIL。
 * ⚠️ **绝不回退 `sources[].license`** —— 回退即隐式继承，正是本条要禁的。
 * 成功返回解析出的许可对象：`{ ok: true, license, via: 'inline' | 'ref' }`。
 */
export function checkAssetLicense(asset, packageLicenses) {
  const hasInline = asset?.license !== undefined && asset?.license !== null
  const hasRef = asset?.licenseRef !== undefined && asset?.licenseRef !== null
  if (hasInline && hasRef) {
    return bad('ASSET_LICENSE_XOR', 'asset 同时写了 license 与 licenseRef：二者互斥，只能其一（类型层 ?: never 已锁写法，此处运行时兜底）')
  }
  if (!hasInline && !hasRef) {
    return bad('ASSET_LICENSE_XOR', 'asset 既无 license 也无 licenseRef：许可必须显式声明，禁止隐式继承（缺 = FAIL）')
  }
  if (hasInline) return { ok: true, license: asset.license, via: 'inline' }

  const ref = asset?.licenseRef
  if (typeof ref !== 'string' || ref === '') {
    return bad('ASSET_LICENSE_REF_UNRESOLVED', `asset.licenseRef 必须为非空字符串，实际 ${JSON.stringify(ref)}`)
  }
  const table = packageLicenses
  if (table === null || typeof table !== 'object' || Array.isArray(table) || !Object.prototype.hasOwnProperty.call(table, ref)) {
    return bad(
      'ASSET_LICENSE_REF_UNRESOLVED',
      `asset.licenseRef="${ref}" 无法解析到包级 licenses（只解析 manifest.licenses，绝不回退 sources[].license）`,
    )
  }
  return { ok: true, license: table[ref], via: 'ref', ref }
}

/**
 * 把一份许可交给**唯一的许可判定矩阵** `license-policy.mjs` 的 `decideLicense`，
 * 把决策映射成门可用的判定（不复制矩阵，只调用）：
 *   allowed / allowed+attribution → PASS
 *   review_required               → FAIL（**取舍见下**）
 *   rejected                      → FAIL
 *
 * 为什么 review_required 判 FAIL：本仓对「未定的门」口径是 PENDING ⇒ 未通过
 * （与 release:gate 的整体状态同一语义：PENDING 不得记作 PASS，见 P1.8 裁定 ②）。资产许可是一条**入库前置硬门**的判据，"需人工复核"在无人值守的
 * 门/校验器里无法自动达成 —— 若判 PASS，等于让 CC-BY-SA / GPL 这类待复核许可静默入库。
 * 故在自动门语境下 review_required 与 rejected 同为 FAIL，只是 code 分开以便人工分诊。
 */
export function checkLicenseDecision({ provider, license }) {
  const { decision, reason } = decideLicense({ provider, license })
  if (decision === 'allowed' || decision === 'allowed+attribution') return { ok: true, decision, reason }
  if (decision === 'review_required') {
    return bad('LICENSE_REVIEW_REQUIRED', `${reason} ⇒ review_required 视为 FAIL：自动门不得把"待人工复核"当通过（PENDING 不粉饰为 PASS）`)
  }
  return bad('LICENSE_REJECTED', reason)
}

/** asset 许可判定 = 解析（presence/XOR/ref）成功后，把许可对象交给唯一矩阵。 */
export function checkAssetLicenseDecision(asset, packageLicenses) {
  const resolved = checkAssetLicense(asset, packageLicenses)
  if (!resolved.ok) return resolved
  return checkLicenseDecision({ provider: asset?.provenance?.provider, license: resolved.license })
}

/**
 * 包级两件套条件必填（P1.8 裁定 ④-3）：
 * **包级 `licenses`（非空对象）与包级 `provenance`（含非空 provider）必填 ⇔ 该包声明了非空 `assets[]`。**
 * 返回 `{ ok, required, violations: [] }`（required=false 即"无资产、条件不触发"）。
 */
export function checkPackageAssetDeclarations(manifest) {
  const assets = manifest?.assets
  const declared = Array.isArray(assets) && assets.length > 0
  if (!declared) return { ok: true, required: false, violations: [] }

  const violations = []
  const table = manifest?.licenses
  if (table === null || typeof table !== 'object' || Array.isArray(table) || Object.keys(table).length === 0) {
    violations.push(
      violation('PACKAGE_LICENSES_REQUIRED', '包声明了非空 assets[] ⇒ 包级 licenses（非空对象）必填（包级与 asset 级许可并存，互不替代）'),
    )
  }
  const p = manifest?.provenance
  if (p === null || typeof p !== 'object' || Array.isArray(p) || typeof p.provider !== 'string' || p.provider.trim() === '') {
    violations.push(violation('PACKAGE_PROVENANCE_REQUIRED', '包声明了非空 assets[] ⇒ 包级 provenance（含非空 provider）必填'))
  }
  return { ok: violations.length === 0, required: true, violations }
}

/**
 * **汇总入口**（validate.mjs 与后续 gate-license.mjs 共用）。返回分组结果，便于各判据只取自己那一组而不重复计数：
 *   - `assetViolations`       每条 asset 的**结构**规则：assetId 语法/归属 · checksum · url · provenance
 *   - `assetLicenseViolations` 每条 asset 的**许可**规则：presence/XOR · licenseRef 解析 · decideLicense 决策
 *   - `packageViolations`     包级条件必填（⇔ 非空 assets[]）
 *   - `violations`            以上三者之和（gate-license 用全量）
 */
export function checkManifestAssets(manifest) {
  const assetViolations = []
  const assetLicenseViolations = []
  const assets = manifest?.assets

  if (assets !== undefined && !Array.isArray(assets)) {
    assetViolations.push(violation('ASSETS_NOT_ARRAY', `manifest.assets 必须为数组，实际 ${assets === null ? 'null' : typeof assets}`))
  }
  const list = Array.isArray(assets) ? assets : []
  const hostContentId = manifest?.id

  list.forEach((asset, i) => {
    const label = `assets[${i}] ${asset?.assetId ?? '(无 assetId)'}`
    const collect = (r, bucket) => { if (!r.ok) bucket.push(violation(r.code, `${label}：${r.message}`)) }
    collect(checkAssetIdShape(asset?.assetId, hostContentId), assetViolations)
    collect(checkAssetChecksum(asset?.checksum), assetViolations)
    collect(checkAssetUrl(asset?.url), assetViolations)
    collect(checkAssetProvenance(asset), assetViolations)
    collect(checkAssetLicenseDecision(asset, manifest?.licenses), assetLicenseViolations)
  })

  const packageViolations = checkPackageAssetDeclarations(manifest).violations

  return {
    hasAssets: assets !== undefined,
    assetCount: list.length,
    assetViolations,
    assetLicenseViolations,
    packageViolations,
    violations: [...assetViolations, ...assetLicenseViolations, ...packageViolations],
  }
}
