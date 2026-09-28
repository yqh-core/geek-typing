/* P1.6-D · 打卡/连续天数 hook —— 从 App.tsx 抽出（history 单一持有者）
 *
 * setHistory 由打字轮 hook 在「整词完成 / 本轮结算」时调用（recordWord / recordSeconds），
 * 派生数据（今日词数 / 连续天数）在此一并算出，App 只做展示。
 */
import { useMemo, useState } from 'react'
import { getStreakDays, getTodayCount, loadHistory, type History } from '../lib/streak'

export function useStreak() {
  const [history, setHistory] = useState<History>(() => loadHistory())

  const todayCount = useMemo(() => getTodayCount(history), [history])
  const streakDays = useMemo(() => getStreakDays(history), [history])

  return { history, setHistory, todayCount, streakDays }
}
