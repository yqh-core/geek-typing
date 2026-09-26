import { BookOpenCheck, CalendarDays, Crosshair, Flame, Play, Sparkles } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import type { TodayRecommendation } from '../lib/recommend'
import { useLang, useT } from '../i18n'

interface HomePanelProps {
  theme: ThemeConfig
  recommendation: TodayRecommendation
  /** 当前词库名（新词卡展示） */
  bankName: string
  /** 当前词库词数 */
  bankCount: number
  onReviewRound: () => void
  onWeakRound: () => void
  onNewRound: () => void
}

/** 今日练习推荐首页（V3-P0a）：问候 + Daily Goal + 复习/弱项/新词三卡 */
export default function HomePanel({
  theme,
  recommendation,
  bankName,
  bankCount,
  onReviewRound,
  onWeakRound,
  onNewRound,
}: HomePanelProps) {
  const t = useT()
  const { lang } = useLang()
  const { dueCount, dueTopWords, weakWords, weakLetters, todayCount, goal, streakDays } = recommendation

  const dateText = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const percent = goal === 0 ? 0 : Math.min(100, Math.round((todayCount / goal) * 100))
  const goalReached = todayCount >= goal

  const cardCls = `${theme.card} border ${theme.border}`
  const btnCls = `flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold active:scale-95 transition-all ${theme.accent}`

  return (
    <div data-testid="home-panel" className="w-full max-w-4xl flex flex-col gap-5">
      {/* 问候区：日期 + streak */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className={`text-2xl font-bold ${theme.accent}`}>{t('home.title')}</div>
          <div className={`mt-1 flex items-center gap-1.5 text-xs ${theme.sub}`}>
            <CalendarDays size={13} />
            {dateText}
          </div>
        </div>
        <div data-testid="home-streak" className="flex items-center gap-1.5 text-sm font-semibold">
          <Flame size={15} className="text-orange-400" />
          {t('streak.title')} {streakDays} {t('streak.dayUnit')}
        </div>
      </div>

      {/* Daily Goal 进度条 */}
      <div data-testid="home-goal" className={`${cardCls} rounded-2xl px-5 py-4`}>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-semibold">{t('home.goal')}</span>
          <span className={`tabular-nums ${goalReached ? 'font-bold text-emerald-400' : theme.sub}`}>
            {todayCount} / {goal} {t('bank.wordsUnit')}
            {goalReached && <span className="ml-2">{t('home.goalDone')}</span>}
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-black/15 overflow-hidden">
          <div
            data-testid="home-goal-bar"
            className={`h-full rounded-full transition-all duration-500 ${goalReached ? 'bg-emerald-400' : 'bg-emerald-500/70'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* 三张推荐卡 */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 复习卡 */}
        <div data-testid="home-review-card" className={`${cardCls} rounded-2xl p-5 flex flex-col gap-3`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpenCheck size={15} className={theme.accent} />
            {t('home.reviewTitle')}
          </div>
          {dueCount > 0 ? (
            <>
              <div className={`text-sm ${theme.sub}`}>
                <span className={`text-base font-bold tabular-nums ${theme.accent}`}>{dueCount}</span>{' '}
                {t('home.dueCount')}
              </div>
              <div className={`text-xs font-mono truncate ${theme.sub}`}>{dueTopWords.join(' · ')}</div>
              <button data-testid="home-review-start" onClick={onReviewRound} className={btnCls}>
                <Play size={13} />
                {t('home.startReview')}
              </button>
            </>
          ) : (
            <div data-testid="home-review-empty" className={`text-xs ${theme.sub}`}>
              {t('home.reviewEmpty')}
            </div>
          )}
        </div>

        {/* 弱项卡 */}
        <div data-testid="home-weak-card" className={`${cardCls} rounded-2xl p-5 flex flex-col gap-3`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crosshair size={15} className={theme.accent} />
            {t('home.weakTitle')}
          </div>
          {weakWords.length > 0 || weakLetters.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {weakLetters.map((w) => (
                  <span
                    key={`l-${w.letter}`}
                    className="px-2 py-0.5 rounded-md border border-red-400/40 text-red-300 text-xs font-mono uppercase"
                  >
                    {w.letter} {Math.round(w.rate * 100)}%
                  </span>
                ))}
                {weakWords.map((w) => (
                  <span
                    key={`w-${w.word}`}
                    className="px-2 py-0.5 rounded-md border border-amber-400/40 text-amber-300 text-xs font-mono"
                  >
                    {w.word} ×{w.wrong}
                  </span>
                ))}
              </div>
              <button data-testid="home-weak-start" onClick={onWeakRound} className={btnCls}>
                <Crosshair size={13} />
                {t('home.startWeak')}
              </button>
            </>
          ) : (
            <div data-testid="home-weak-empty" className={`text-xs ${theme.sub}`}>
              {t('home.weakEmpty')}
            </div>
          )}
        </div>

        {/* 新词卡 */}
        <div data-testid="home-new-card" className={`${cardCls} rounded-2xl p-5 flex flex-col gap-3`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className={theme.accent} />
            {t('home.newTitle')}
          </div>
          <div className={`text-sm ${theme.sub}`}>
            {bankName} · <span className="tabular-nums">{bankCount}</span> {t('bank.wordsUnit')}
          </div>
          <button data-testid="home-new-start" onClick={onNewRound} className={btnCls}>
            <Play size={13} />
            {t('home.startNew')}
          </button>
        </div>
      </div>
    </div>
  )
}
