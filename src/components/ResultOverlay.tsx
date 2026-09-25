import { RotateCcw, Sparkles, BookMarked, Flame } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { DAILY_GOAL } from '../lib/streak'

interface ResultProps {
  theme: ThemeConfig
  stats: {
    words: number
    accuracy: number
    wpm: number
    bestCombo: number
    seconds: number
    wrongCount: number
  }
  todayCount: number
  onRestart: () => void
  onReview: () => void
  reviewAvailable: boolean
}

export default function ResultOverlay({
  theme,
  stats,
  todayCount,
  onRestart,
  onReview,
  reviewAvailable,
}: ResultProps) {
  const items = [
    { label: '完成词数', value: String(stats.words) },
    { label: '正确率', value: `${stats.accuracy}%` },
    { label: '速度', value: `${stats.wpm} WPM` },
    { label: '最高连击', value: `x${stats.bestCombo}` },
    { label: '用时', value: `${stats.seconds}s` },
  ]

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 z-30">
      <div className={`w-full max-w-lg ${theme.card} border ${theme.border} rounded-2xl p-8 shadow-2xl animate-popIn`}>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles size={18} className={theme.accent} />
          <h2 className={`text-lg font-bold tracking-wider ${theme.accent}`}>Round Complete</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-7">
          {items.map((it) => (
            <div key={it.label} className={`rounded-xl border ${theme.border} px-3 py-3`}>
              <div className={`text-[11px] ${theme.sub}`}>{it.label}</div>
              <div className="text-xl font-bold tabular-nums mt-0.5">{it.value}</div>
            </div>
          ))}
        </div>

        <div
          className={`flex items-center justify-center gap-2 mb-6 text-sm rounded-xl border ${theme.border} px-3 py-2.5`}
        >
          <Flame size={14} className={theme.accent} />
          <span>
            今日累计 <span className="font-bold tabular-nums">{todayCount}</span> / {DAILY_GOAL} 词
          </span>
          <span className={`text-xs ${theme.sub}`}>
            {todayCount >= DAILY_GOAL ? '今日目标已达成 🎉' : `还差 ${Math.max(0, DAILY_GOAL - todayCount)} 词达标`}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onRestart}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${theme.border} text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95`}
          >
            <RotateCcw size={14} />
            再来一轮
          </button>
          <button
            onClick={onReview}
            disabled={!reviewAvailable}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${theme.border} text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100`}
          >
            <BookMarked size={14} />
            {reviewAvailable ? `复习错词 (${stats.wrongCount})` : '没有错词，完美'}
          </button>
        </div>

        <p className={`mt-5 text-center text-xs ${theme.sub}`}>按 Enter 直接开始下一轮</p>
      </div>
    </div>
  )
}
