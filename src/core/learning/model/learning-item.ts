/* V4.1-P0.5 · Learning Model —— 用户与某条内容的互动状态（Learning 层）。
 *
 * 目录 `src/core/learning/` 是文档最终架构里的 Learning 层：它以 contentId 为键，
 * 与 Content 层（不随用户变）、User 层（profile/preferences）三分。
 *
 * ⚠️ 两条铁律：
 *
 * (a) SRS **不与 Vocabulary 绑定**。
 *     正确链路是 Content → LearningItem → SRS，而**不是** Vocabulary → VocabularySRS。
 *     因为除了 Word，Audio / Reading / Sentence / Grammar 同样需要有学习状态
 *     （练过哪段听力、某篇文章读到几遍、某个语法点掌握度）。一旦把 SRS 绑在
 *     Vocabulary 上，每接入一个新内容类型就要再造一套 SRS 表。
 *
 * (b) 学习状态**禁止**写回 `content/` 数据或 WordContent。
 *     Content 是共享的、可重新导入的、不随用户变的数据；把 mastery/复习时间写进去，
 *     一是导入新词库会污染/丢失用户进度，二是多用户场景下互相串数据。
 *     学习状态一律存在 Learning 层（本目录 / reviewStore 侧）。
 *
 * 本轮只定义模型，不改 `src/core/review/*` 的现有实现。
 */
import type { ContentRef } from '../../content/model/content'

export type LearningStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

/**
 * 一条学习记录：主键 = contentId（4 段式，含 namespace 消歧跨包同词）。
 *
 * ⚠️ 学习记录定位内容快照 = **contentId + contentVersion + contentChecksum 三元组**
 *   （三者均继承自 ContentRef，此处不再重复定义 —— 重复存快照字段会引入
 *    「两个真相」的一致性问题，快照比对请走 model/snapshot.ts 的 isSameSnapshot）。
 *   三者缺一不可：只记 contentVersion 会在「不同内容恰好同 version」时误判为同一快照；
 *   只记 checksum 无法区分是哪个实体的这份内容。
 */
export interface LearningItem extends ContentRef {
  status: LearningStatus
  /** 掌握度 0..1（跨内容类型统一口径，SRS 排期据此计算） */
  mastery: number
  attempts: number
  correct: number
  incorrect: number
  firstSeenAt?: string
  lastSeenAt?: string
  nextReviewAt?: string
  streak: number
  /** 产生这条学习记录的入口，便于按来源统计/回溯 */
  source?: 'typing' | 'memorize' | 'review' | 'import'
}
