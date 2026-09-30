/* P18-C · manifest runtime 投影 —— 白名单的唯一事实源。
 *
 * 目的：18 份 content/**\/manifest.json 里有一批字段**仅供构建期/审计**使用，
 * 在 src/ 内零运行时读取。它们被 registry.ts 静态导入后全额进主 chunk，
 * 是主 chunk 贴着预算悬崖（余量 0.3%）的主要可裁项。
 * 本模块定义「runtime 到底该看见哪些字段」，由 scripts/vite-plugin-manifest-runtime.mjs
 * 在构建期对 `manifest.json?runtime` 导入做投影（不落中间文件）。
 *
 * ⚠️ 这是**白名单式**投影，不是黑名单：
 *   黑名单只裁「今天已知无用」的字段，**新增字段会默认进 runtime** —— 体积会随时间无声回涨。
 *   白名单相反：新增字段默认**不进** runtime，必须显式登记到这里才会暴露给运行时。
 *   代价是白名单可能落后于 schema，故由门禁判据（J1：白名单 ⊆ PackageManifest 字段集）兜底。
 *
 * 自洽约束（RUNTIME ∪ DROPPED == PackageManifest 的全部字段，且二者不交叠）：
 *   - RUNTIME_MANIFEST_FIELDS ∩ DROPPED_MANIFEST_FIELDS == ∅
 *   - 二者并集 == src/core/content/schema.ts 的 PackageManifest 键全集
 *
 * ⚠️ 为什么 `contentChecksum` / `contentVersion` 必须在保留集里（别按「名字像构建期数据」就裁）：
 *   它们被学习层 runtime 消费 —— src/lib/learning/attribute.ts:58、
 *   src/lib/learning/upgrade.ts:104-105。裁掉会静默破坏学习记录的内容契约追踪。
 *   保留集一律以 grep 证据判定，不按字段名的「看起来像什么」推断。
 *
 * 见 docs/p18/P1.8-DESIGN-RULINGS-v1.0.md §⑦（P18-C 体积落点）。
 */

/** runtime 消费的字段（保留集）。**顺序即投影后的键顺序**，便于人读比对。 */
export const RUNTIME_MANIFEST_FIELDS = Object.freeze([
  'id', 'type', 'version', 'title', 'titleEn', 'description', 'descriptionEn', 'language',
  'exam', 'tags', 'icon', 'features', 'stats', 'offline', 'packageId', 'namespace',
  'contentVersion', 'contentRevision', 'contentChecksum', 'contentPublishedAt', 'schemaVersion',
  'normalize', 'licenses', 'provenance', 'assets',
])

/** 构建期/审计专用字段（裁剪集）。三者合计 12.04 KiB，在 src/ 内零运行时读取。 */
export const DROPPED_MANIFEST_FIELDS = Object.freeze(['sources', 'contentHistory', 'build'])

/**
 * 按 RUNTIME_MANIFEST_FIELDS 的顺序挑键，源对象缺失的键跳过。
 * 纯投影，不做任何派生/校验（schema 合法性由 content:validate 负责）。
 */
export function projectManifest(obj) {
  const out = {}
  for (const key of RUNTIME_MANIFEST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key]
  }
  return out
}
