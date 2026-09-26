import { Flame } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { accuracyOf, weakLetters, wrongWords, type Analytics } from '../lib/analytics'
import { DAILY_GOAL, getRecentDays, type History } from '../lib/streak'
import { useT } from '../i18n'

interface ProgressPanelProps {
  theme: ThemeConfig
  history: History
  analytics: Analytics
  streakDays: number
}

/** 根据当天词数返回热力等级 0-4（与 StreakBar 同口径） */
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

/** Progress Dashboard（V3-P0a）：14 天热力图 + 累计统计 + 弱项 Top5 */
export default function ProgressPanel({ theme, history, analytics, streakDays }: ProgressPanelProps) {
  const t = useT()
  const recent = getRecentDays(history, 14)
  const weak = weakLetters(analytics, 5)
  const wrong = wrongWords(analytics, 5)

  const stats = [
    { id: 'totalWords', label: t('panel.totalWords'), value: analytics.totalWords },
    { id: 'totalKeys', label: t('panel.totalKeys'), value: analytics.totalKeys },
    { id: 'accuracy', label: t('panel.accuracyAll'), value: `${accuracyOf(analytics)}%` },
    { id: 'bestWpm', label: t('panel.bestWpm'), value: analytics.bestWpm },
    { id: 'streak', label: t('streak.title'), value: streakDays },
  ]

  return (
    <div data-testid="progress-panel" className="w-full max-w-4xl flex flex-col gap-5">
      <div className={`text-2xl font-bold ${theme.accent}`}>{t('progress.title')}</div>

      {/* 14 天热力图 */}
      <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
        <div className="text-sm font-semibold mb-3">{t('progress.heatmap')}</div>
        <div data-testid="progress-heatmap" className="flex gap-1.5">
          {recent.map((d) => (
            <div
              key={d.date}
              title={`${d.date} · ${d.words}`}
              className={`flex-1 h-6 rounded ${LEVEL_CLASS[level(d.words)]} ${theme.id === 'ink' ? '' : 'ring-1 ring-white/5'}`}
            />
          ))}
        </div>
      </div>

      {/* 累计统计卡 */}
      <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
        <div className="text-sm font-semibold mb-3">{t('progress.stats')}</div>
        <div data-testid="progress-stats" className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map((s) => (
            <div key={s.id} data-testid={`progress-stat-${s.id}`} className={`rounded-xl border ${theme.border} px-3 py-3`}>
              <div className={`text-[11px] ${theme.sub}`}>{s.label}</div>
              <div className="text-xl font-bold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 弱项 Top5 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Flame size={14} className="text-red-400" />
            {t('progress.weakLetters')}
          </div>
          <div data-testid="progress-weak-letters" className="flex flex-wrap gap-2">
            {weak.length === 0
              ? <span className={`text-xs ${theme.sub}`}>{t('panel.noData')}</span>
              : weak.map((w) => (
                  <span
                    key={w.letter}
                    data-testid={`progress-weak-letter-${w.letter}`}
                    className="px-2 py-1 rounded-md border border-red-400/40 text-red-300 font-mono uppercase text-xs"
                  >
                    {w.letter} · {Math.round(w.rate * 100)}%
                  </span>
                ))}
          </div>
        </div>
        <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Flame size={14} className="text-amber-400" />
            {t('progress.wrongWordsTop')}
          </div>
          <div data-testid="progress-wrong-words" className="flex flex-wrap gap-2">
            {wrong.length === 0
              ? <span className={`text-xs ${theme.sub}`}>{t('panel.noWrong')}</span>
              : wrong.map((w) => (
                  <span
                    key={w.word}
                    data-testid={`progress-wrong-word-${w.word}`}
                    className="px-2 py-1 rounded-md border border-amber-400/40 text-amber-300 font-mono text-xs"
                  >
                    {w.word} ×{w.wrong}
                  </span>
                ))}
          </div>
        </div>
      </div>
    </div>
  )
}
