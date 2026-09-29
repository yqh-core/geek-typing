/* P1.7 Wave 2-B · 职责域：派生读数（掌握度 / 到期分区） */
import { loadLearningV2 } from '../../../lib/learning/storage'
import { isV2Store } from '../../../lib/learning/upgrade'
import { masteryDistribution as masteryDistributionV1 } from '../../../lib/mastery'
import { loadReview } from '../../../lib/reviewStore'
import { masteryDistributionV2, dueWordsV2 } from '../../../lib/learning/insights'

export function getMastery() {
  return masteryDistributionV2(loadLearningV2())
}

export function getDuePartition(now: number = Date.now()) {
  return dueWordsV2(loadLearningV2(), now)
}

/** 掌握度分布。State B 走 insights.masteryDistributionV2（legacy:* 不混入四档，G6-2 语义）；
 *  State A（升级前）仍按 v1 表计算，行为逐字节兼容。 */
export function getMasteryDistribution() {
  return isV2Store()
    ? masteryDistributionV2(loadLearningV2()).attributed
    : masteryDistributionV1(loadReview())
}
