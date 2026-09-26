/* V4.1 · Content Relation —— Learning Graph 的数据模型（本轮只定模型，不建图）。
 *
 * 关系数据流：content/vocabulary/<id>/relations.json（可选）→ registry.getRelations()
 * 例：
 *   content:word:ecdict-ielts:abandon
 *     ├─ belongs_to → content:vocabulary:ecdict-ielts:ielts
 *     ├─ related_to → content:topic:ielts:environment
 *     └─ appears_in → content:audio:ielts:listening-test-01
 *
 * 当前（V4.1-P0）不产出任何 relations.json：无 topic/audio 内容前建关系是空数据。
 * 模型就位后，第一个新内容类型接入即可直接产出关系，无需再改架构。
 */
import type { ContentType } from '../model/content'

export type RelationType =
  /** 归属：词条属于某内容包 / 主题下的内容 */
  | 'belongs_to'
  /** 包含：包/主题包含某条内容 */
  | 'contains'
  /** 相关：主题相关、近义、同族 */
  | 'related_to'
  /** 前置：学习路径上的先修关系 */
  | 'prerequisite'
  /** 出现于：词条出现在某音频/阅读/文档中 */
  | 'appears_in'
  /** 同一实体：不同 namespace（即不同包）下的同一 lexical item
   *  （content:word:ecdict-ielts:abandon ≡ content:word:ecdict-cet4:abandon）——
   *  跨包同词合法，消歧靠 namespace，而不是禁止同词。 */
  | 'same_as'

export interface ContentRelation {
  /** 源 ContentId */
  from: string
  type: RelationType
  /** 目标 ContentId */
  to: string
}

/** 关系端点类型约束（校验用）：belongs_to 的 to 应为包，appears_in 的 to 应为资源 */
export const RELATION_TARGET_TYPES: Record<RelationType, ContentType[]> = {
  belongs_to: ['vocabulary', 'topic', 'collection'],
  contains: ['word', 'audio', 'document', 'exercise'],
  related_to: ['word', 'topic'],
  prerequisite: ['word', 'topic'],
  appears_in: ['audio', 'document', 'listening', 'reading'],
  same_as: ['word'],
}
