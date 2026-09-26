/* V4.1 · Relation —— 两类关系，永不合并（本轮只定模型，不建图）。
 *
 * ── 1. Content Relation（内容 ↔ 内容，本文件上半部分）────────────────────
 * 关系数据流：content/vocabulary/<id>/relations.json（可选）→ registry.getRelations()
 * 例：
 *   content:word:ecdict-ielts:abandon
 *     ├─ belongs_to → content:vocabulary:ecdict-ielts:ielts
 *     ├─ related_to → content:topic:ielts:environment
 *     └─ appears_in → content:audio:ielts:listening-test-01
 *
 * 当前（V4.1-P0）不产出任何 relations.json：无 topic/audio 内容前建关系是空数据。
 * 模型就位后，第一个新内容类型接入即可直接产出关系，无需再改架构。
 *
 * ── 2. Learning Relation（用户 ↔ 内容，本文件下半部分）───────────────────
 *   user:u-1 ──studied──▶ content:word:ecdict-ielts:abandon
 *   user:u-1 ──collected──▶ content:audio:ielts:listening-test-01
 *
 * ⚠️ 铁律：Content Relation 与 Learning Relation **永不合并进同一张 graph**。
 *   前者是内容之间的关系（随内容发布而存在，对所有用户一致，可进 `content/` 数据）；
 *   后者是用户与内容的关系（随用户行为而变，属于 **Learning 层**，禁止落进 `content/`）。
 *   合并的后果：导入新词库时用户数据被覆盖、多用户互相串进度、内容包体积随用户数膨胀。
 *   另外 `RELATION_TARGET_TYPES` **只约束 Content Relation**，不用于校验 Learning Relation。
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

/**
 * 关系端点类型约束（校验用）：belongs_to 的 to 应为包，appears_in 的 to 应为资源。
 * ⚠️ 只用于 **Content Relation**；Learning Relation 的端点不是内容类型，不适用本表。
 */
export const RELATION_TARGET_TYPES: Record<RelationType, ContentType[]> = {
  belongs_to: ['vocabulary', 'topic', 'collection'],
  contains: ['word', 'audio', 'document', 'exercise'],
  related_to: ['word', 'topic'],
  prerequisite: ['word', 'topic'],
  appears_in: ['audio', 'document', 'listening', 'reading'],
  same_as: ['word'],
}

/** 用户 ↔ 内容 的关系类型（Learning 层，不进 content/ 数据） */
export type LearningRelationType =
  /** 学过（至少练过一次） */
  | 'studied'
  /** 收藏/加入生词本 */
  | 'collected'
  /** 已掌握 */
  | 'mastered'
  /** 学习中（未掌握，仍在复习队列） */
  | 'in_progress'
  /** 是某目标的内容（目标 → 内容） */
  | 'goal_of'

/**
 * Learning Relation：**用户与内容**的关系，属于 Learning 层。
 *   from = 用户主体 / 用户集合（当前以 userId 携带用户身份）
 *   to   = ContentId
 *
 * ⚠️ 与 ContentRelation 永不合并进同一张 graph，也不落进 `content/` 数据。
 */
export interface LearningRelation {
  userId?: string
  from: string
  type: LearningRelationType
  to: string
  /** 关系发生时间（ISO 字符串） */
  at?: string
}
