/* P1.7 Wave 2-B · 职责域：弱项排序（纯函数，无存储副作用） */
import { rankByWeakness as rankByWeaknessLib } from '../../../lib/analytics'

export function rankByWeakness(words: string[], letters: string[]): string[] {
  return rankByWeaknessLib(words, letters)
}
