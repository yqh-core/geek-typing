/* P1.6-D · Analytics 状态 hook —— 从 App.tsx 抽出
 *
 * 关键：analyticsRef 镜像态。打字完成段需**同步**读最新 analytics
 * （keydown 闭包里的 `analytics` 是 stale 的），故所有写一律经 updateAnalytics，
 * 保证 ref 与 state 始终一致。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { learningService } from '../core/learning/service'
import type { Analytics } from '../core/learning'

export function useAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics>(() => learningService.getAnalytics())
  const analyticsRef = useRef<Analytics>(analytics)

  const updateAnalytics = useCallback((fn: (a: Analytics) => Analytics) => {
    const next = fn(analyticsRef.current)
    analyticsRef.current = next
    setAnalytics(next)
  }, [])

  // 分析数据落盘（节流，避免每次击键都写 localStorage）
  useEffect(() => {
    const t = window.setTimeout(() => learningService.persistAnalytics(analytics), 800)
    return () => window.clearTimeout(t)
  }, [analytics])

  const reset = useCallback(() => {
    const f = learningService.freshAnalytics()
    analyticsRef.current = f
    setAnalytics(f)
  }, [])

  return { analytics, analyticsRef, updateAnalytics, reset }
}
