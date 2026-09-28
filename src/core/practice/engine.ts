/* P1.6-C · Practice Engine v1 —— typing / memorize / review 三模式的语义中枢

 * 设计依据：用户 P1.6-C 设计（Practice Engine v1）。本模块把 App 里散落的「3 连调用语义中枢」
 * （analytics v1 applyWordDone + v2 标记 recordWordDoneV2 + 复习决策 recordReview）收拢为
 * 单一权威入口，用 ContentId 作身份、bankId/包作作用域，并内置 A06 四边界（同词不同包 /
 * ContentId 优先级 / 重复提交去重 / 空异常输入忽略）。
 *
 * 关键约束：
 *   - 本模块只编排 learningService 门面（不直连 lib/learning），符合 P1.6-A L3「唯一业务入口」。
 *   - 保留「打字增量写、背单词整批写」的非对称性：
 *       · typing / review 走 completeTypingWord（逐词 3 连：analytics 走 React 态、v2/review 落盘）；
 *       · memorize      走 recordMemorizeAnswer（一次 recordPractice 整批落 memorize + review）。
 *   - C4「不猜」：ctx 缺失（既无 contentId 也无 bankId）时拒绝写入并留痕，与底层 lib 一致。
 */

import { learningService } from '../learning/service'
import type { PracticeMode } from './types'

/** React 态里的 analytics（与 lib/analytics 的 Analytics 同形状，经门面取类型避免直连 lib） */
type Analytics = ReturnType<typeof learningService.getAnalytics>
/** memorize 本包视图（经门面取类型） */
type MemStore = ReturnType<typeof learningService.getMemorizeView>
/** 归属上下文（与 LearningSourceCtx 同形状，经门面取类型） */
type LearningSourceCtx = Parameters<typeof learningService.resolveContentId>[1]

/* ---------------- 会话（去重作用域） ---------------- */

export interface PracticeSession {
  id: string
  mode: PracticeMode
  contentIds: string[]
  /** 本轮已完成词的 ContentId 集合（去重键；跨包同名词按 contentId 区分，互不误判） */
  completed: Set<string>
}

export function createSession(mode: PracticeMode, contentIds: string[] = []): PracticeSession {
  return {
    id: `sess-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    contentIds,
    completed: new Set(),
  }
}

/* ---------------- typing / review 完成 ---------------- */

export interface CompleteTypingInput {
  /** 展示词形（原词形优先；引擎内部 trim，空白视为异常输入） */
  word: string
  /** 本词是否完美（无错字母）；驱动 analytics 聚合与复习决策 */
  perfect: boolean
  /** 本词瞬时 WPM（仅用于 analytics 聚合展示） */
  wpm?: number
}

export interface CompleteTypingResult {
  /** 新的 analytics 态（调用方写回 React 态） */
  analytics: Analytics
  /** 复习侧是否真的发生了写入（供调用方精确门控派生刷新，如 App 的 bumpReview） */
  reviewWritten: boolean
}

/**
 * 打字 / 复习整词完成：把「3 连调用语义中枢」收拢为单一出口。
 *   1. learningService.applyWordDone      → analytics v1 聚合（返回新 analytics，不落盘）
 *   2. learningService.recordWordDoneV2   → State B 词级打点（analytics 子记录落 gt.learning.v2）
 *   3. learningService.recordReview       → 错题本决策（错→记错；对且复习中→推进间隔），返回是否写入
 *
 * 边界（A06 内置）：
 *   - 空 / 纯空白词 → 忽略（不写、不动 analytics）；
 *   - ctx 无 contentId 也无 bankId → C4「不猜」拒绝写入并留痕；
 *   - 同一 ContentId 本轮已提交 → 去重，第二次直接返回 reviewWritten=false（防双击/重复事件双落）。
 */
export function completeTypingWord(
  session: PracticeSession,
  input: CompleteTypingInput,
  analytics: Analytics,
  ctx: LearningSourceCtx,
): CompleteTypingResult {
  const word = (input.word ?? '').trim()
  // 边界 D：空 / 异常输入忽略
  if (!word) {
    return { analytics, reviewWritten: false }
  }
  const cid = learningService.resolveContentId(word, ctx)
  // C4「不猜」：归属不明拒绝写入；analytics 也一并不动（避免半截状态）
  if (!cid) {
    console.warn('[practiceEngine] completeTypingWord 缺少归属上下文，拒绝写入（C4 不猜）', word)
    return { analytics, reviewWritten: false }
  }
  // 边界 C：重复提交去重（同一 contentId 本轮只落一次）
  if (session.completed.has(cid)) {
    return { analytics, reviewWritten: false }
  }
  session.completed.add(cid)

  const nextAnalytics = learningService.applyWordDone(analytics, word, input.perfect, input.wpm ?? 0)
  learningService.recordWordDoneV2(word, input.perfect, ctx)
  const reviewWritten = learningService.recordReview(word, input.perfect, ctx)
  return { analytics: nextAnalytics, reviewWritten }
}

/* ---------------- memorize 作答 ---------------- */

export interface MemorizeAnswerInput {
  word: string
  bankId?: string
}

export interface MemorizeAnswerResult {
  /** 刷新后的本包 memorize 视图（调用方写回 React 态） */
  view: MemStore
  /** 需追加到练习队列的次数（unknown=2 / fuzzy=1 / known=0） */
  repeat: number
}

/**
 * 背单词三键作答：整批经 learningService.recordPractice（mode='memorize'）一次落
 * memorize + review 子记录，返回刷新后的本包视图与队列追加次数。
 * 空词 → 不写，返回当前视图与 repeat=0（防误触）。
 */
export function recordMemorizeAnswer(
  input: MemorizeAnswerInput,
  status: 'known' | 'fuzzy' | 'unknown',
): MemorizeAnswerResult {
  const word = (input.word ?? '').trim()
  if (!word) {
    return { view: learningService.getMemorizeView(input.bankId), repeat: 0 }
  }
  const correct = status === 'known'
  learningService.recordPractice({
    sessionId: `mem-${input.bankId ?? 'x'}-${Date.now()}`,
    mode: 'memorize',
    contentIds: [word],
    startedAt: Date.now(),
    completedAt: Date.now(),
    results: [{ word, bankId: input.bankId, memStatus: status, correct }],
  })
  const view = learningService.getMemorizeView(input.bankId)
  const repeat = status === 'unknown' ? 2 : status === 'fuzzy' ? 1 : 0
  return { view, repeat }
}

/** 引擎单例：UI 一律 import { practiceEngine } from '.../core/practice' */
export const practiceEngine = {
  createSession,
  completeTypingWord,
  recordMemorizeAnswer,
}
