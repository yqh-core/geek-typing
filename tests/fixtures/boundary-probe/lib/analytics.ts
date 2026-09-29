/**
 * 合成夹具：替身「学习模块」。

 * 相对仓库根路径含 `/lib/` → 按消费者定义被豁免（模拟真实 src/lib 内部互引区），
 * 自身不被判红，但**被消费者 import 时**会让消费者判红。
 */
export type AnalyticsSnapshot = { total: number; correct: number }

export function recordAttempt(correct: boolean): number {
  return correct ? 1 : 0
}

export function summarize(snapshot: AnalyticsSnapshot): number {
  return snapshot.total
}
