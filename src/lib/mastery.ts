/**
 * 掌握度分级（V3-P0a）：从错题本条目推导四级掌握度，纯派生、无存储变更。
 *
 * 毕业生（走完 15 天最后一档再答对）已从 reviewStore 移除，天然属于「mastered」，
 * 仅在 UI 文案体现，不加 schema 字段。
 */
import type { ReviewEntry, ReviewStore } from './reviewStore'

export type MasteryLevel = 'struggling' | 'learning' | 'familiar' | 'strong'

/**
 * 条目 → 掌握度：
 * - correctStreak === 0 → struggling（挣扎中：刚记错还没复习对过）
 * - intervalIdx <= 1   → learning（入门：1~2 天档）
 * - intervalIdx === 2  → familiar（熟悉：4 天档）
 * - intervalIdx >= 3   → strong（巩固：7/15 天档）
 */
export function masteryOf(entry: ReviewEntry): MasteryLevel {
  if (!entry || entry.correctStreak === 0) return 'struggling'
  if (entry.intervalIdx <= 1) return 'learning'
  if (entry.intervalIdx === 2) return 'familiar'
  return 'strong'
}

/** 全表掌握度分布（四级计数） */
export function masteryDistribution(store: ReviewStore): Record<MasteryLevel, number> {
  const dist: Record<MasteryLevel, number> = { struggling: 0, learning: 0, familiar: 0, strong: 0 }
  for (const entry of Object.values(store)) {
    if (!entry) continue
    dist[masteryOf(entry)] += 1
  }
  return dist
}
