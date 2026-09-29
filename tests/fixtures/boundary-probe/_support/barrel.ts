/**
 * 合成夹具（非探针）：再导出链中间层。
 * 自身位于消费者域（路径不含 /core/、/lib/），从 `/lib/reviewStore` 再导出 → 自己也是一条违规
 * （链源头），探针 P5 经它再导出 → 触发 export-from-chain 判定。
 */
export { listReviews } from '../lib/reviewStore'
export type { ReviewItem } from '../lib/reviewStore'

export const chainMarker = 'p5-chain'
