/* P1.7 Wave 2-B · 职责域：记忆（memorize）视图与统计 */
import { memorizeView, getMemorizeStats as computeMemorizeStats, type MemStore } from '../../../lib/memorizeStore'

export function getMemorizeView(bankId?: string): MemStore {
  return memorizeView(bankId)
}

export function getMemorizeStats(store: MemStore, bankWords: string[]) {
  return computeMemorizeStats(store, bankWords)
}
