/* P1.7 Wave 2-B · 职责域：练习结果落盘（按 mode 派发到既有写函数）
 * 派发规则与既有 UI 行为逐字等价（Memorize.answer / App.tsx settleReview）。 */
import { hasReviewRecord, recordWrong, recordCorrect } from '../../../lib/reviewStore'
import { recordMemorize, type MemStatus } from '../../../lib/memorizeStore'
import { recordWordDoneV2 as recordWordDoneV2Lib } from '../../../lib/analytics'
import type { PracticeResult, PracticeAnswer, PracticeMode } from '../../practice/types'

/** v2 词级打点直通（State B 落 gt.learning.v2）。打字结算与「复习本决策」是两条独立输入，
 *  故保留直通，不并入 recordPractice 的合并派发。 */
export function recordWordDoneV2(word: string, perfect: boolean, ctx: { bankId?: string; contentId?: string }): void {
  recordWordDoneV2Lib(word, perfect, ctx)
}

export function recordPractice(result: PracticeResult): void {
  for (const ans of result.results) {
    const ctx = { bankId: ans.bankId, contentId: ans.contentId }
    dispatchAnswer(result.mode, ans, ctx)
  }
}

export function dispatchAnswer(
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
