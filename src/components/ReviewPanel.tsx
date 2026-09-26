import { useMemo, useState } from 'react'
import { BookOpenCheck, ChevronDown, Crosshair } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { allLoadedWords, type WordBank, type WordItem } from '../data/wordBanks'
import type { Analytics } from '../lib/analytics'
import { dueWords, loadReview, type ReviewEntry } from '../lib/reviewStore'
import { masteryDistribution, masteryOf, type MasteryLevel } from '../lib/mastery'
import { useLang, useT } from '../i18n'

interface ReviewPanelProps {
  theme: ThemeConfig
  banks: WordBank[]
  /** 错题本版本号：变化时重建派生数据 */
  reviewVersion: number
  analytics: Analytics
  onReviewRound: () => void
  onReviewWord: (word: string) => void
}

const MASTERY_CLASS: Record<MasteryLevel, string> = {
  struggling: 'border-red-400/50 text-red-300 bg-red-400/10',
  learning: 'border-amber-400/50 text-amber-300 bg-amber-400/10',
  familiar: 'border-sky-400/50 text-sky-300 bg-sky-400/10',
  strong: 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10',
}

const LEVELS: MasteryLevel[] = ['struggling', 'learning', 'familiar', 'strong']

/** Review Dashboard（V3-P0a）：错题统计 + 掌握分布 + 到期词列表 + 轻量词条详情 */
export default function ReviewPanel({ theme, banks, reviewVersion, analytics, onReviewRound, onReviewWord }: ReviewPanelProps) {
  const t = useT()
  const { lang } = useLang()
  const [openWord, setOpenWord] = useState<string | null>(null)

  const store = useMemo(() => {
    void reviewVersion
    return loadReview()
  }, [reviewVersion])
  const dist = useMemo(() => masteryDistribution(store), [store])
  const due = useMemo(() => {
    void reviewVersion
    return dueWords()
  }, [reviewVersion])

  // 已加载词库建词映射；未加载词库的词给占位词条（与 startReviewRound 同模式）
  const itemMap = useMemo(() => new Map(allLoadedWords(banks).map((w) => [w.word, w])), [banks])
  const itemOf = (word: string): WordItem => itemMap.get(word) ?? { word, translation: '' }

  const now = Date.now()
  const entries = Object.entries(store)
    .filter(([, e]) => !!e)
    .map(([word, entry]) => ({ word, entry: entry as ReviewEntry }))
    .sort((a, b) => a.entry.nextReviewAt - b.entry.nextReviewAt)
  // 有到期 → 只列到期词；无到期 → 全量按 nextReviewAt 升序前 20
  const shown = due.length > 0 ? entries.filter((x) => x.entry.nextReviewAt <= now) : entries.slice(0, 20)
  const total = entries.length

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div data-testid="review-panel" className="w-full max-w-4xl flex flex-col gap-5">
      {/* 顶部：标题 + 错题总数 / 今日到期 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className={`text-2xl font-bold ${theme.accent}`}>{t('review.panelTitle')}</div>
        <div className="flex items-center gap-2">
          <div className={`rounded-xl border ${theme.border} px-3 py-1.5 text-center`}>
            <div className={`text-[11px] ${theme.sub}`}>{t('review.statsTotal')}</div>
            <div data-testid="review-stat-total" className="text-lg font-bold tabular-nums">
              {total}
            </div>
          </div>
          <div className={`rounded-xl border ${theme.border} px-3 py-1.5 text-center`}>
            <div className={`text-[11px] ${theme.sub}`}>{t('review.statsDue')}</div>
            <div data-testid="review-stat-due" className="text-lg font-bold tabular-nums">
              {due.length}
            </div>
          </div>
        </div>
      </div>

      {/* 到期主按钮 */}
      {due.length > 0 && (
        <button
          data-testid="review-start-btn"
          onClick={onReviewRound}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-sm font-semibold active:scale-95 transition-all text-emerald-400"
        >
          <BookOpenCheck size={15} />
          {t('review.start')}
          <span className="tabular-nums opacity-70">
            {lang === 'en' ? `(${due.length})` : `（${due.length} ${t('review.dueUnit')}）`}
          </span>
        </button>
      )}

      {/* Mastery 四级分布条形 */}
      <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
        <div className="text-sm font-semibold mb-3">{t('review.masteryDist')}</div>
        {total === 0 ? (
          <div className={`text-xs ${theme.sub}`}>{t('review.empty')}</div>
        ) : (
          <div data-testid="review-dist" className="flex h-6 rounded-lg overflow-hidden bg-black/15">
            {LEVELS.filter((l) => dist[l] > 0).map((l) => (
              <div
                key={l}
                data-testid={`review-dist-${l}`}
                style={{ width: `${(dist[l] / total) * 100}%` }}
                className={`flex items-center justify-center text-[11px] font-semibold tabular-nums ${MASTERY_CLASS[l]}`}
              >
                <span className="truncate px-1">
                  {t(`mastery.${l}`)} {dist[l]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 到期词列表（无到期时为全量升序前 20） */}
      <div className="flex flex-col gap-2">
        {total === 0 ? (
          <div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-6 text-center text-xs ${theme.sub}`}>
            {t('review.empty')}
          </div>
        ) : (
          shown.map(({ word, entry }) => {
            const item = itemOf(word)
            const level = masteryOf(entry)
            const open = openWord === word
            const stat = analytics.words[word.toLowerCase()]
            return (
              <div key={word} data-testid={`review-item-${word}`} className={`${theme.card} border ${theme.border} rounded-xl px-4 py-3`}>
                <div className="flex items-center gap-3">
                  <span
                    data-badge={level}
                    className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${MASTERY_CLASS[level]}`}
                  >
                    {t(`mastery.${level}`)}
                  </span>
                  <span className="font-mono font-bold truncate">{item.word}</span>
                  {item.phonetic && <span className={`text-xs font-mono truncate hidden sm:inline ${theme.sub}`}>{item.phonetic}</span>}
                  <span className={`ml-auto text-xs truncate hidden md:inline max-w-[14em] ${theme.sub}`}>{item.translation}</span>
                  <button
                    data-testid="review-item-detail"
                    onClick={() => setOpenWord(open ? null : word)}
                    title={t('review.detail')}
                    className={`shrink-0 p-1 rounded-md border ${theme.border} ${theme.sub} active:scale-95 transition-all`}
                  >
                    <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  <button
                    data-testid="review-item-drill"
                    onClick={() => onReviewWord(word)}
                    title={t('review.drill')}
                    className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold active:scale-95 transition-all ${theme.accent} ${theme.border}`}
                  >
                    <Crosshair size={11} />
                    {t('review.drill')}
                  </button>
                </div>

                {/* 轻量词条详情展开 */}
                {open && (
                  <div data-testid="review-detail" className={`mt-3 pt-3 border-t ${theme.border} flex flex-col gap-2`}>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-xl font-bold font-mono">{item.word}</span>
                      {item.phonetic && (
                        <span data-testid="review-detail-phonetic" className={`text-sm font-mono ${theme.sub}`}>
                          {item.phonetic}
                        </span>
                      )}
                    </div>
                    {item.translation && <div className="text-sm">{item.translation}</div>}
                    {item.definition && <div className={`text-xs ${theme.sub}`}>{item.definition}</div>}
                    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums ${theme.sub}`}>
                      <span>
                        {t('review.statDone')} ×{stat?.done ?? 0} · {t('review.statWrong')} ×{stat?.wrong ?? 0}
                      </span>
                      <span>
                        {t('review.wrongCountLabel')} ×{entry.wrongCount}
                      </span>
                      <span>
                        {t('review.correctStreakLabel')} ×{entry.correctStreak}
                      </span>
                      <span>
                        {t('review.nextReview')} {fmtTime(entry.nextReviewAt)}
                      </span>
                    </div>
                    <button
                      data-testid="review-detail-practice"
                      onClick={() => onReviewWord(word)}
                      className={`self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold active:scale-95 transition-all ${theme.accent}`}
                    >
                      <BookOpenCheck size={12} />
                      {t('review.practiceWord')}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
