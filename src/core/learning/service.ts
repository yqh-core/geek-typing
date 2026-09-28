/* P1.6-A · LearningService —— 学习层业务门面（UI 唯一允许直接访问的学习入口）

 * 设计依据：用户 P1.6 设计目标 L1 / L2 / L3 / L4。
 *   - L1  UI 不直接访问底层存储键族（storage 细节封装在 lib/learning 内部）
 *   - L2  UI 不直接访问 Legacy Store 的写 API（reviewStore / memorizeStore / analytics）
 *   - L3  LearningService 成为唯一业务入口
 *   - L4  Learning v2 成为唯一 State B 事实源
 *
 * ⚠️ 本文件**只做编排**：内部调用既有的 lib/learning 写函数（recordMemorize / recordWrong /
 * recordCorrect / recordWordDoneV2），不引入任何新的 localStorage 键、不重复写逻辑。
 * 因此：
 *   - G4-2（键族唯一入口在 storage.ts）不受影响 —— 本文件没有键族字面量，只 import 函数；
 *   - G4-1（lib/learning 恰 8 模块）不受影响 —— 本文件位于 src/core/learning/，不在 lib/learning/。
 *
 * 读取侧只转发既有的视图函数，写入侧按 PracticeMode 派发到既有写函数。这样 UI 无论
 * Typing / Memorize / Review 都通过本门面落到同一张 gt.learning.v2 表，归属语义（(词,包)）
 * 完全由底层 attribute.ts 保证（C4「不猜」）。
 */
import type { LearningRecord } from '../../lib/learning/types'
import { getRecord, loadLearningV2 } from '../../lib/learning/storage'
import { wordContentId, type LearningSourceCtx } from '../../lib/learning/attribute'
import {
  recordMemorize,
  memorizeView,
  getMemorizeStats as computeMemorizeStats,
  type MemStatus,
  type MemStore,
} from '../../lib/memorizeStore'
import {
  recordWrong,
  recordCorrect,
  hasReviewRecord,
  reviewItemViews,
  reviewDueViews,
  reviewDueCount,
  reviewTotalCount,
} from '../../lib/reviewStore'
import {
  recordWordDoneV2 as recordWordDoneV2Lib,
  loadAnalytics,
  recordWordDone,
  recordKey,
  saveAnalytics,
  resetAnalytics,
  weakLetters,
  rankByWeakness as rankByWeaknessLib,
  type Analytics,
} from '../../lib/analytics'
import { masteryDistributionV2, dueWordsV2 } from '../../lib/learning/insights'
import type { PracticeResult, PracticeAnswer, PracticeMode } from '../practice/types'

/* ---------------- 读取侧（仅转发既有视图，不引入新逻辑） ---------------- */

export interface LearningState {
  record: LearningRecord | null
  hasRecord: boolean
}

export function getState(contentId: string): LearningState {
  const record = getRecord(contentId)
  return { record, hasRecord: record !== null }
}

export function getMemorizeView(bankId?: string): MemStore {
  return memorizeView(bankId)
}

export function getMemorizeStats(store: MemStore, bankWords: string[]) {
  return computeMemorizeStats(store, bankWords)
}

export function getReviewItems() {
  return reviewItemViews()
}

/** 到期条目的 ContentId 列表（不含 legacy:*，与 insights.dueWordsV2 同口径） */
export function getDueItems(now: number = Date.now()): string[] {
  return reviewDueViews(now).map((i) => i.contentId)
}

export function getMastery() {
  return masteryDistributionV2(loadLearningV2())
}

export function getDuePartition(now: number = Date.now()) {
  return dueWordsV2(loadLearningV2(), now)
}

/* ---------------- Review 派生读数（仅转发 reviewStore 视图，不引入新逻辑） ---------------- */

export function getReviewDueCount(now: number = Date.now()): number {
  return reviewDueCount(now)
}

export function getReviewTotalCount(): number {
  return reviewTotalCount()
}

export function getReviewDueViews(now: number = Date.now()) {
  return reviewDueViews(now)
}

/* ---------------- Analytics v1 桥接（React 态管理 + 纯展示助手） ----------------
 * P1.6-B：UI 不得直接 import '../lib/analytics'（见 B02 边界门禁）。App 等组件持有 analytics
 * React 态、需要 v1 的 recordWordDone / recordKey / saveAnalytics / resetAnalytics 与纯展示助手
 * weakLetters，故在此做**薄桥接**——本文件仍不写任何新 localStorage 键，全部转发 lib/analytics。
 * 权威学习态仍是 learning.v2（见 recordPractice / recordReview）。 */
export function getAnalytics(): Analytics {
  return loadAnalytics()
}
export function applyWordDone(
  analytics: Analytics,
  word: string,
  perfect: boolean,
  wpm: number,
): Analytics {
  return recordWordDone(analytics, word, perfect, wpm)
}
export function applyKey(analytics: Analytics, key: string, correct: boolean): Analytics {
  return recordKey(analytics, key, correct)
}
export function persistAnalytics(analytics: Analytics): void {
  saveAnalytics(analytics)
}
export function freshAnalytics(): Analytics {
  return resetAnalytics()
}
export function getWeakLetters(analytics: Analytics, n = 6) {
  return weakLetters(analytics, n)
}

/** v2 词级打点直通（State B 落 gt.learning.v2）。App 的打字结算与「复习本决策」是两条独立输入
 *  （perfect 与 missed 不一定同向），故保留此直通，不并入 recordPractice 的合并派发。 */
export function recordWordDoneV2(word: string, perfect: boolean, ctx: { bankId?: string; contentId?: string }): void {
  recordWordDoneV2Lib(word, perfect, ctx)
}

/** 解析词的归属 ContentId（ctx.contentId 优先，其次 wordContentId(bankId, word)，再无则 ''）。
 *  与 lib 内部 resolveContentId 同口径（C4「不猜」），供 Practice Engine 计算去重键，避免引擎
 *  自行拼接导致与 lib 语义漂移。 */
export function resolveContentId(word: string, ctx: LearningSourceCtx): string {
  if (ctx.contentId) return ctx.contentId
  if (ctx.bankId) return wordContentId(ctx.bankId, word)
  return ''
}

/** 弱项排序纯函数桥接（无存储副作用），供 UI 弱项专攻轮排序。 */
export function rankByWeakness(words: string[], letters: string[]): string[] {
  return rankByWeaknessLib(words, letters)
}

/* ---------------- 写入侧（单一入口，按 mode 派发到既有写函数） ---------------- */

/** 单条复习判定：对 → 若已有复习记录则进间隔；错 → 记错。
 *  返回是否发生了写入（供调用方精确门控派生数据刷新，如 App 的 bumpReview）。 */
export function recordReview(
  word: string,
  correct: boolean,
  ctx: { bankId?: string; contentId?: string },
): boolean {
  if (correct) {
    if (hasReviewRecord(word, ctx)) {
      recordCorrect(word, ctx)
      return true
    }
    return false
  }
  recordWrong(word, ctx)
  return true
}

/**
 * 一次练习的完整结果 → 落盘。UI / 未来的 Practice Engine 只调用本函数，不再各自戳 legacy store。
 * 派发规则与既有 UI 行为逐字等价（与 Memorize.answer / App.tsx settleReview 一致）：
 *   - memorize：recordMemorize +（不熟/不认识 → recordWrong；认识且已复习中 → recordCorrect）
 *   - typing / review（及其它）：recordWordDoneV2（analytics）+（错 → recordWrong；对且已复习中 → recordCorrect）
 */
export function recordPractice(result: PracticeResult): void {
  for (const ans of result.results) {
    const ctx = { bankId: ans.bankId, contentId: ans.contentId }
    dispatchAnswer(result.mode, ans, ctx)
  }
}

function dispatchAnswer(
  mode: PracticeMode,
  ans: PracticeAnswer,
  ctx: { bankId?: string; contentId?: string },
): void {
  switch (mode) {
    case 'memorize': {
      const status: MemStatus = ans.memStatus ?? (ans.correct ? 'known' : 'unknown')
      recordMemorize(ans.word, status, ans.bankId)
      if (status === 'unknown' || status === 'fuzzy') {
        recordWrong(ans.word, ctx)
      } else if (hasReviewRecord(ans.word, ctx)) {
        recordCorrect(ans.word, ctx)
      }
      return
    }
    case 'typing':
    case 'review':
    default: {
      // 词级打点（analytics 子记录）；State A 下为 no-op
      recordWordDoneV2(ans.word, ans.correct, ctx)
      if (!ans.correct) {
        recordWrong(ans.word, ctx)
      } else if (hasReviewRecord(ans.word, ctx)) {
        recordCorrect(ans.word, ctx)
      }
      return
    }
  }
}

/** 门面单例：UI 一律 import { learningService } from '.../learning/service' */
export const learningService = {
  getState,
  getMemorizeView,
  getMemorizeStats,
  getReviewItems,
  getDueItems,
  getMastery,
  getDuePartition,
  getReviewDueCount,
  getReviewTotalCount,
  getReviewDueViews,
  getAnalytics,
  applyWordDone,
  applyKey,
  persistAnalytics,
  freshAnalytics,
  getWeakLetters,
  recordReview,
  recordPractice,
  recordWordDoneV2,
  resolveContentId,
  rankByWeakness,
}
