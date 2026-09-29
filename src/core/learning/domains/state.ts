/* P1.7 Wave 2-B · 职责域：学习态单点读取
 * 从 service.ts 逐字拆分（行为零改动），service.ts 仍做门面聚合。 */
import type { LearningRecord } from '../../../lib/learning/types'
import { getRecord } from '../../../lib/learning/storage'

export interface LearningState {
  record: LearningRecord | null
  hasRecord: boolean
}

export function getState(contentId: string): LearningState {
  const record = getRecord(contentId)
  return { record, hasRecord: record !== null }
}
