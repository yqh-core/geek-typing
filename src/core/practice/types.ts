/* P1.6-A · Practice 领域类型 —— Practice Engine 的最小数据契约（P1.6-C 会扩展更多 mode）

 * 设计依据：用户 P1.6 设计（第六阶段）的 PracticeSession / PracticeItem / PracticeAnswer /
 * PracticeResult 第一版。本文件只定义数据形状，不含任何行为（行为在 LearningService
 * 与未来的 Practice Engine 里）。
 *
 * 关键边界（与 Learning 解耦）：
 *   PracticeResult 描述「用户刚刚做了什么」；
 *   Learning 层（LearningService.recordPractice）再决定这对长期学习意味着什么
 *   （mastery / review interval / streak）。两者分离才能让听写 / 跟读 / 阅读 / 考试共用学习层。
 */
export type PracticeMode =
  | 'typing'
  | 'memorize'
  | 'review'
  | 'dictation'
  | 'choice'
  | 'fillblank'
  | 'speaking'
  | 'exam'

export interface PracticeAnswer {
  /** 展示词形（原词形优先，大小写不敏感兜底由底层处理） */
  word: string
  /** 当前词库（内置 id 或自建库 id）—— 写入归属上下文 */
  bankId?: string
  /** 精确 ContentId（复习轮到期词自带）—— 优先于 bankId */
  contentId?: string
  /** 本次作答是否正确 */
  correct: boolean
  /** memorize 三档状态（known/fuzzy/unknown）；缺省由 correct 推导 */
  memStatus?: 'known' | 'fuzzy' | 'unknown'
  /** 耗时（ms） */
  durationMs?: number
  /** 扩展元数据（未来听写 / 选择题的答案细节，不影响当前写入） */
  metadata?: Record<string, unknown>
}

export interface PracticeResult {
  /** 本轮会话 id */
  sessionId: string
  mode: PracticeMode
  /** 本轮涉及的 ContentId 集合（用于批量预取 / 归因，不强制逐一对应 answers） */
  contentIds: string[]
  startedAt: number
  completedAt: number
  results: PracticeAnswer[]
}
