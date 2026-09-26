import { RotateCcw, Sparkles, BookMarked, Flame, Timer } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { DAILY_GOAL } from '../lib/streak'
import type { PracticeModeId } from '../lib/modes'
import { useT, useLang } from '../i18n'

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
  mode: PracticeModeId
  todayCount: number
  onRestart: () => void
  onReview: () => void
  reviewAvailable: boolean
}

export default function ResultOverlay({
  theme,
  stats,
  mode,
  todayCount,
  onRestart,
  onReview,
  reviewAvailable,
}: ResultProps) {
  const t = useT()
  const { lang } = useLang()
  const items = [
    { label: t('result.words'), value: String(stats.words) },
    { label: t('result.accuracy'), value: `${stats.accuracy}%` },
    { label: t('result.speed'), value: `${stats.wpm} WPM` },
    { label: t('result.bestCombo'), value: `x${stats.bestCombo}` },
    { label: t('result.seconds'), value: `${stats.seconds}s` },
  ]

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 z-30">
      <div className={`w-full max-w-lg ${theme.card} border ${theme.border} rounded-2xl p-8 shadow-2xl animate-popIn`}>
        <div className="flex items-center gap-2 mb-6">
          {mode === 'timed' ? (
            <Timer size={18} className={theme.accent} />
          ) : (
            <Sparkles size={18} className={theme.accent} />
          )}
          <h2 className={`text-lg font-bold tracking-wider ${theme.accent}`}>
            {mode === 'timed' ? t('result.timeUp') : t('result.complete')}
          </h2>
          <span className={`text-[11px] ${theme.sub}`}>{t(`mode.${mode}`)}</span>
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
            {t('result.today')} <span className="font-bold tabular-nums">{todayCount}</span> / {DAILY_GOAL}{' '}
            {t('result.wordsUnit')}
          </span>
          <span className={`text-xs ${theme.sub}`}>
            {todayCount >= DAILY_GOAL
              ? t('result.goalDone')
              : lang === 'en'
                ? `${Math.max(0, DAILY_GOAL - todayCount)} ${t('result.goalLeft')}`
                : `${t('result.goalLeft')} ${Math.max(0, DAILY_GOAL - todayCount)} ${t('result.goalLeftUnit')}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onRestart}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${theme.border} text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95`}
          >
            <RotateCcw size={14} />
            {t('result.restart')}
          </button>
          <button
            onClick={onReview}
            disabled={!reviewAvailable}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${theme.border} text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100`}
          >
            <BookMarked size={14} />
            {reviewAvailable ? `${t('result.review')} (${stats.wrongCount})` : t('result.perfect')}
          </button>
        </div>

        <p className={`mt-5 text-center text-xs ${theme.sub}`}>{t('result.enterHint')}</p>
      </div>
    </div>
  )
}
