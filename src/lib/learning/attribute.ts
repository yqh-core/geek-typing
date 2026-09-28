/* V4.1-P1.5-S4 · Learning 归属层 —— (词, 包) → ContentId 的唯一出口
 *
 * 设计依据：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md` §1.5 ——
 * 同一 word 在 N 个包 = N 条 LearningRecord；**新写入的归属由「发生学习的包」
 * （当前 bank 上下文）唯一确定**。
 *
 * 为什么必须存在这个模块（而不是每个 store 自己拼 id）：
 *   内置包的 namespace 是 `${来源族}-${包 id}`（manifest.json 字段，见
 *   model/content.ts:16-23 的 namespace 唯一性契约），自建库是 `custom-<bankId>`
 *   （与迁移器 §2.1.1，migrate.ts:572 同源）—— 两套规则若在各写入点各写一遍，
 *   迟早漂移。唯一出口 = 唯一判据。所有 Learning 写入侧（reviewStore /
 *   memorizeStore / analytics）一律经本模块构造 ContentId，禁止自行拼接。
 */

import { makeContentId, parseContentId } from '../../core/content/model/content'
import { getVocabularyPackage, getVocabularyPackages } from '../../core/content/registry'

/** Learning 写入的来源上下文：优先用精确 contentId（复习轮的到期词自带），
 *  否则用 bankId（打字/背单词的当前词库）现场构造。两者都缺 = 归属不明，
 *  按 C4「不猜」原则调用方必须拒绝写入而不是编一个键。 */
export interface LearningSourceCtx {
  /** 复习轮：到期词条目自带的精确 ContentId（跨包正确归属的唯一途径） */
  contentId?: string
  /** 打字/背单词：当前词库（内置 id 或自建库 id） */
  bankId?: string
}

/** bank 上下文（内置词库 id 或自建库 id）→ Learning namespace */
export function learningNamespaceOf(bankId: string): string {
  const manifest = getVocabularyPackage(bankId)?.manifest
  if (manifest?.namespace) return manifest.namespace
  // 自建库：与迁移器 §2.1.1（migrate.ts:572 `custom-${b.id.replace(/^custom-/, '')}`）同源
  return `custom-${bankId.replace(/^custom-/, '')}`
}

/** (bank, word) → 词条 ContentId。写入归属的唯一构造点；原词形一字不 lowercase
 *  （model/content.ts:69-80 的口径铁律）。 */
export function wordContentId(bankId: string, word: string): string {
  return makeContentId('word', learningNamespaceOf(bankId), word)
}

/** ContentId → { 展示词形, namespace }；非 word 类型或非法 id 返回 null。
 *  localId 即原词形（4 段式第 4 段），可直接用于 UI 展示。 */
export function wordOfContentId(contentId: string): { word: string; namespace: string } | null {
  const parsed = parseContentId(contentId)
  if (!parsed || parsed.type !== 'word') return null
  return { word: parsed.localId, namespace: parsed.namespace }
}

/** namespace → 该包的版本三元组（写入 LearningRecord 的 contentVersion/contentChecksum 用，
 *  供 §1.4 的 freshness 判定）。namespace 不对应任何内置包（如自建库）返回 null ——
 *  调用方省略版本字段即可（freshness 为 unknown，诚实表达「无从判定」）。 */
export function packageInfoOfNamespace(
  namespace: string,
): { contentVersion: number; contentChecksum: string } | null {
  const pkg = getVocabularyPackages().find((p) => p.manifest.namespace === namespace)
  if (!pkg) return null
  return { contentVersion: pkg.manifest.contentVersion, contentChecksum: pkg.manifest.contentChecksum }
}
