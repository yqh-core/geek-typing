/**
 * P1.5 · Learning v2 的派生指标（G6-2 / G6-3）
 *
 * 依据：`docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` G6-2 / G6-3，
 * 以及 `P1.5-LEARNING-MODEL.md` §2.4.3（legacy:* 分开展示，不进自动复习轮）。
 *
 * 为什么这是**纯函数**且现在（UI 仍挂在旧 `gt.review.v1` 上时）就实现：
 *   - G6-2/G6-3 的语义对象是 **gt.learning.v2 的 LearningStoreV2**（legacy:* 键只存在于
 *     v2 键族）。它们是**迁移设计的一部分**（§2.4.3），必须在 ⑰ 正式迁移**之前**实现并
 *     用机器证据锁住 —— 否则 ⑰ 上线时 legacy:* 会混进复习轮，而第 ⑧ 步已消灭空释义占位，
 *     legacy:* 混入 = 拿不到释义 = 直接开不了轮或整片跳过。
 *   - 与 `migrateV1toV2` 同一模式：纯函数先行 + 单测锁语义，UI 接线随 ⑰ 切换（冻结中）。
 *
 * ⚠️ 口径说明（与旧 `mastery.ts` 的一个**有意差异**）：
 *   旧 `masteryDistribution(store)` 遍历的是 `gt.review.v1` —— 那张表**每一条**都是错题记录；
 *   v2 表是混合表（review / memorize / analytics 三种子记录 + legacy 占位），因此：
 *   - `attributed` 只统计**带 `review` 子记录**的正式记录（分布的主题 = 错题本，与旧口径等价）；
 *   - `unattributed` 统计**全部** `legacy:*` 键（= `countLegacy()` 的「未归属」badge 口径）；
 *   - 两边都不会把 memorize-only / analytics-only 记录算进分布。
 *   `masteryOf` 复用旧实现（`../mastery`）—— 只依赖 `correctStreak` / `intervalIdx` 两个字段
 *   （G2 测试已锁 LearningReview 与 ReviewEntry 逐字段相同），不复制映射逻辑，避免判据漂移。
 */

import { isLegacyKey, type LearningStoreV2 } from './types'
import { masteryOf, type MasteryLevel } from '../mastery'

export interface MasteryDistributionV2 {
  /** 正式记录（`content:` 键）的四档分布 —— 只统计带 `review` 子记录的条目 */
  attributed: Record<MasteryLevel, number>
  /** `legacy:*` 键总数 —— **不进**四档分布，单独展示（G6-2 的核心断言） */
  unattributed: number
}

/**
 * v2 掌握度分布：`legacy:*` 记录**不得**混进四档计数（G6-2）。
 *
 * 为什么过滤放在函数内部而不是调用方（判据原文的理由）：
 * `[读码]` 全仓只有一处调用方（ReviewPanel），放在函数内 = 一处修复覆盖全部；
 * 放在调用方 = 下一个调用方必然忘记（§2.4.3）。
 */
export function masteryDistributionV2(store: LearningStoreV2): MasteryDistributionV2 {
  const attributed: Record<MasteryLevel, number> = { struggling: 0, learning: 0, familiar: 0, strong: 0 }
  let unattributed = 0
  for (const [key, entry] of Object.entries(store)) {
    if (isLegacyKey(key)) {
      unattributed += 1
      continue
    }
    if (!entry.review) continue
    attributed[masteryOf(entry.review)] += 1
  }
  return { attributed, unattributed }
}

export interface DuePartition {
  /** 到期的正式记录 contentId 列表 —— **恒不含** `legacy:` 前缀（G6-3 的核心断言）。
   *  为什么：复习轮需要 `WordItem`（释义 / 发音），`legacy:*` 不知道属于哪个包；
   *  且第 ⑧ 步已消灭空释义占位 —— legacy:* 混入 = 拿不到释义，别在这里制造这个场景。 */
  attributed: string[]
  /** `legacy:*` 里到期的条数 —— **分开展示**（「未归属」分区的到期数），不进复习轮 */
  unattributed: number
  /** `attributed.length + unattributed` —— 对照组断言「两个数相加 = 总数」的锚点 */
  total: number
}

/** 到期判定与旧 `reviewStore.dueWords` 同口径：`review.nextReviewAt <= now` */
export function dueWordsV2(store: LearningStoreV2, now = Date.now()): DuePartition {
  const attributed: string[] = []
  let unattributed = 0
  for (const [key, entry] of Object.entries(store)) {
    const due = entry.review !== undefined && entry.review.nextReviewAt <= now
    if (!due) continue
    if (isLegacyKey(key)) unattributed += 1
    else attributed.push(key)
  }
  return { attributed, unattributed, total: attributed.length + unattributed }
}
