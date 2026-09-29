/* P1.7 Wave 2-B · 职责域：复习（review）视图 + 单条复习判定写入 */
import {
  recordWrong,
  recordCorrect,
  hasReviewRecord,
  reviewItemViews,
  reviewDueViews,
  reviewDueCount,
  reviewTotalCount,
} from '../../../lib/reviewStore'

export function getReviewItems() {
  return reviewItemViews()
}

/** 到期条目的 ContentId 列表（不含 legacy:*，与 insights.dueWordsV2 同口径） */
export function getDueItems(now: number = Date.now()): string[] {
  return reviewDueViews(now).map((i) => i.contentId)
}

export function getReviewDueCount(now: number = Date.now()): number {
  return reviewDueCount(now)
}

export function getReviewTotalCount(): number {
  return reviewTotalCount()
}

export function getReviewDueViews(now: number = Date.now()) {
  return reviewDueViews(now)
}

/** 复习条目视图（(词,包) 对，含精确 contentId；State A = 词表） */
export function getReviewItemViews() {
  return reviewItemViews()
}

/** 单条复习判定：对 → 若已有复习记录则进间隔；错 → 记错。返回是否发生写入。 */
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
