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
 * 被裁字段在主 chunk 里的探测串（供构建后判据 J2 使用）。
 *
 * ⚠️ 探测串的**形态**由打包器的实际产出决定，不能凭直觉写。本仓 Vite 底层是 rolldown，
 *   实测（dist/assets/）：
 *     · **投影后的主 chunk**：manifest 是 JS 对象字面量，标识符安全的键名**被去掉引号** ——
 *       出现的是 `sources:`（裸键名 + 冒号），`"sources"` 在此世界恒为 0；字符串值用反引号模板字面量。
 *     · **`?raw` 的 JSON chunk**（如 dist/assets/words-*.js / items-*.js，同一打包器）：
 *       JSON 文本以**模板字面量**进 chunk，内层引号**不转义** —— 出现的是 `"word":` 这种带引号形态。
 *   ⇒ 两种形态各自对应一种真实故障，任一命中即判红（只写一种就是漏网）：
 *     · 裸键名（`sources:`）—— 抓「被裁字段进了投影对象」：有人把它写回 RUNTIME 白名单，
 *       或投影根本没裁掉它。
 *     · 带引号（`"sources"`）—— 抓「投影被撤销、manifest 退回 `?raw`」：回退后整段 JSON
 *       字符串进主 chunk，带引号形态即出现。
 *   ⚠️ J3 对照组**必须**用裸键名形态（`stats:`）：带引号形态在投影正确时恒为 0，
 *   照抄成 `"stats"` 会让 J3 恒假。
 *   `build` 不能用自身当探测串（在别处太常见），必须用其独有子字段名。
 */
export const DROPPED_MANIFEST_PROBES = Object.freeze({
  sources: ['sources:', '"sources"'],
  contentHistory: ['contentHistory:', '"contentHistory"'],
  build: ['toolVersion:', '"toolVersion"', 'builtAt:', '"builtAt"', 'sourceChecksum:', '"sourceChecksum"'],
})

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
