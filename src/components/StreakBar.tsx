import { Flame } from 'lucide-react'
import { DAILY_GOAL, getStreakDays, getRecentDays, type History } from '../lib/streak'
import type { ThemeConfig } from '../lib/theme'

interface StreakBarProps {
  theme: ThemeConfig
  history: History
  todayCount: number
}

/** 根据当天词数返回热力等级 0-4 */
function level(words: number): number {
  if (words === 0) return 0
  if (words < DAILY_GOAL * 0.25) return 1
  if (words < DAILY_GOAL * 0.5) return 2
  if (words < DAILY_GOAL) return 3
  return 4
}

const LEVEL_CLASS = [
  'bg-black/10',
  'bg-emerald-500/25',
  'bg-emerald-500/45',
  'bg-emerald-500/70',
  'bg-emerald-500',
]

export default function StreakBar({ theme, history, todayCount }: StreakBarProps) {
  const streak = getStreakDays(history)
  const recent = getRecentDays(history, 14)
  const percent = Math.min(100, Math.round((todayCount / DAILY_GOAL) * 100))

  return (
    <div className={`w-full max-w-4xl ${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={15} className={theme.accent} />
          <span className="text-sm font-semibold">连续打卡 {streak} 天</span>
          <span className={`text-xs ${theme.sub}`}>
            今日 {todayCount} / {DAILY_GOAL} 词（{percent}%）
          </span>
        </div>
        <span className={`text-[11px] ${theme.sub}`}>数据保存在本机 localStorage</span>
      </div>

      {/* 目标进度条 */}
      <div className="w-full h-1.5 rounded-full bg-black/15 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: 'currentColor' }}
        />
      </div>

      {/* 14 天热力图 */}
      <div className="flex gap-1.5">
        {recent.map((d) => (
          <div
            key={d.date}
            title={`${d.date} · ${d.words} 词`}
            className={`flex-1 h-6 rounded ${LEVEL_CLASS[level(d.words)]} ${
              theme.id === 'ink' ? '' : 'ring-1 ring-white/5'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
