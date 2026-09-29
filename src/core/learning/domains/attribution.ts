/* P1.7 Wave 2-B · 职责域：归属解析（ContentId 归因，C4「不猜」） */
import { wordContentId, type LearningSourceCtx } from '../../../lib/learning/attribute'

/** 解析词的归属 ContentId（ctx.contentId 优先，其次 wordContentId(bankId, word)，再无则 ''），
 *  与 lib 内部 resolveContentId 同口径，供 Practice Engine 计算去重键。 */
export function resolveContentId(word: string, ctx: LearningSourceCtx): string {
  if (ctx.contentId) return ctx.contentId
  if (ctx.bankId) return wordContentId(ctx.bankId, word)
  return ''
}
