/* P1.7 Wave 2-B · 职责域：Analytics v1 桥接（React 态管理 + 纯展示助手）
 * UI 不得直接 import lib/analytics（B02 边界门禁），本域是唯一薄桥接。 */
import {
  loadAnalytics,
  recordWordDone,
  recordKey,
  saveAnalytics,
  resetAnalytics,
  weakLetters,
  type Analytics,
} from '../../../lib/analytics'

export function getAnalytics(): Analytics {
  return loadAnalytics()
}

export function applyWordDone(analytics: Analytics, word: string, perfect: boolean, wpm: number): Analytics {
  return recordWordDone(analytics, word, perfect, wpm)
}

export function applyKey(analytics: Analytics, key: string, correct: boolean): Analytics {
  return recordKey(analytics, key, correct)
}

export function persistAnalytics(analytics: Analytics): void {
  saveAnalytics(analytics)
}

export function freshAnalytics(): Analytics {
  return resetAnalytics()
}

export function getWeakLetters(analytics: Analytics, n = 6) {
  return weakLetters(analytics, n)
}
