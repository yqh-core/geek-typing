import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, ChevronDown, Crosshair } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { type WordBank, type WordItem } from '../data/wordBanks'
import { buildLoadedMap, resolveReviewWord } from '../lib/wordResolve'
import { learningService, wordStatOf, type Analytics, type ReviewItemView } from '../core/learning'
import { masteryOf, type MasteryLevel } from '../lib/mastery'
import { useLang, useT } from '../i18n/hooks'

interface ReviewPanelProps {
  theme: ThemeConfig
  banks: WordBank[]
  /** 错题本版本号：变化时重建派生数据 */
  reviewVersion: number
  analytics: Analytics
  onReviewRound: () => void
  /** contentId 存在 = 跨包精确单挑（S4 §3.5 硬耦合③）；缺省回落当前词库归属 */
  onReviewWord: (word: string, contentId?: string) => void
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

  /** 复习条目视图（P1.5-S4：State B = (词,包) 对，含精确 contentId；State A = 词表） */
  const views = useMemo(() => {
    void reviewVersion
    return learningService.getReviewItemViews()
  }, [reviewVersion])

  /** 掌握度分布。S4：State B 走 insights.masteryDistributionV2（legacy:* 不混入四档 ——
   *  G6-2 语义；UI → core/learning 门面 → insights → learning/storage 证据链）；
   *  State A（升级前）仍按 v1 表计算，行为逐字节兼容。v2/legacy 分支下沉在门面。 */
  const dist = useMemo(() => {
    void reviewVersion
    return learningService.getMasteryDistribution()
  }, [reviewVersion])

  const due = useMemo(() => views.filter((v) => v.entry.nextReviewAt <= Date.now()), [views])

  // ① 已加载词条映射（含用户自定义词库）：同步命中，零 await —— 与旧行为等价
  const itemMap = useMemo(() => buildLoadedMap(banks), [banks])

  const now = Date.now()
  const entries = useMemo(() => [...views].sort((a, b) => a.entry.nextReviewAt - b.entry.nextReviewAt), [views])
  // 有到期 → 只列到期词；无到期 → 全量按 nextReviewAt 升序前 20
  const shown = due.length > 0 ? entries.filter((x) => x.entry.nextReviewAt <= now) : entries.slice(0, 20)
  const total = entries.length

  /** State B：同一词可能在多个包各有复习条目 —— DOM key / testid 需消歧；
   *  State A / 词形唯一时恒为裸词形（e2e 选择器不受影响） */
  const dupWords = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of views) m.set(v.word, (m.get(v.word) ?? 0) + 1)
    return m
  }, [views])
  const domKeyOf = useCallback(
    (v: ReviewItemView) => ((dupWords.get(v.word) ?? 0) > 1 ? `${v.word}--${v.namespace}` : v.word),
    [dupWords],
  )

  /* ② ①未命中的词：异步去 Query 层按词形精确取回（lazy 包在此被按需载入）。
   *
   * ⚠️ 关键区别：取不到时**不再**塞 `?? { word, translation: '' }` 空释义占位 ——
   * 那是 CONTENT_CONTRACT §735-739 点名的 🔴 缺陷（静默空释义，用户以为词条就是空的）。
   * 这里把未命中记进 `missing`，由下方渲染显式标注「释义不可用」，把静默变成可见。 */
  const [remoteItems, setRemoteItems] = useState<Record<string, WordItem>>({})
  const [missing, setMissing] = useState<Record<string, true>>({})
  const shownKey = shown.map((x) => x.word).join('\u0000')
  useEffect(() => {
    // ⚠️ 依赖里用 **shownKey（字符串）而不是 shown（数组）**：shown 每次渲染都是新数组，
    //    放进依赖会让本 effect 每次渲染都重跑 ⇒ setRemoteItems 又造新对象 ⇒ 触发再渲染
    //    ⇒ **无限渲染环**。用字符串做稳定投影，词形序列不变就不重跑。
    const todo = (shownKey ? shownKey.split('\u0000') : []).filter((w) => !itemMap.has(w))
    // 全都在已加载词库里命中：什么都不做。**刻意不在这里 setState** ——
    // effect 体内同步 setState 会触发级联渲染（oxlint react/set-state-in-effect）。
    if (todo.length === 0) return
    let alive = true
    void Promise.all(todo.map(async (w) => [w, await resolveReviewWord(w, banks, itemMap)] as const)).then((pairs) => {
      if (!alive) return
      const hits: Record<string, WordItem> = {}
      const misses: Record<string, true> = {}
      for (const [w, item] of pairs) {
        if (item) hits[w] = item
        else misses[w] = true
      }
      setRemoteItems(hits)
      setMissing(misses)
    })
    return () => {
      alive = false
    }
  }, [shownKey, banks, itemMap])

  /** 命中返回词条；未命中返回 **null**（不是空释义对象） */
  const itemOf = (word: string): WordItem | null => itemMap.get(word) ?? remoteItems[word] ?? null
  /** true = 异步解析已结束且确认取不到释义（区别于「还在解析中」） */
  const isMissing = (word: string): boolean => itemOf(word) === null && missing[word] === true

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
          shown.map((v) => {
            const { word, entry, contentId } = v
            const domKey = domKeyOf(v)
            const item = itemOf(word)
            const missed = isMissing(word)
            const level = masteryOf(entry)
            const open = openWord === domKey
            const stat = wordStatOf(analytics, word)
            return (
              <div key={domKey} data-testid={`review-item-${domKey}`} className={`${theme.card} border ${theme.border} rounded-xl px-4 py-3`}>
                <div className="flex items-center gap-3">
                  <span
                    data-badge={level}
                    className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${MASTERY_CLASS[level]}`}
                  >
                    {t(`mastery.${level}`)}
                  </span>
                  <span className="font-mono font-bold truncate">{word}</span>
                  {item?.phonetic && <span className={`text-xs font-mono truncate hidden sm:inline ${theme.sub}`}>{item.phonetic}</span>}
                  {item ? (
                    <span className={`ml-auto text-xs truncate hidden md:inline max-w-[14em] ${theme.sub}`}>{item.translation}</span>
                  ) : missed ? (
                    // 显式标注取代静默空串：用户看得见「这条取不到释义」，而不是以为词条本身为空
                    <span
                      data-testid="review-item-meaning-missing"
                      title={t('review.noTranslationHint')}
                      className="ml-auto shrink-0 text-xs text-amber-400"
                    >
                      ⚠ {t('review.noTranslation')}
                    </span>
                  ) : null}
                  <button
                    data-testid="review-item-detail"
                    onClick={() => setOpenWord(open ? null : domKey)}
                    title={t('review.detail')}
                    className={`shrink-0 p-1 rounded-md border ${theme.border} ${theme.sub} active:scale-95 transition-all`}
                  >
                    <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  <button
                    data-testid="review-item-drill"
                    onClick={() => onReviewWord(word, contentId || undefined)}
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
                      <span className="text-xl font-bold font-mono">{word}</span>
                      {item?.phonetic && (
                        <span data-testid="review-detail-phonetic" className={`text-sm font-mono ${theme.sub}`}>
                          {item.phonetic}
                        </span>
                      )}
                    </div>
                    {item ? (
                      <>
                        {item.translation && <div className="text-sm">{item.translation}</div>}
                        {item.definition && <div className={`text-xs ${theme.sub}`}>{item.definition}</div>}
                      </>
                    ) : missed ? (
                      <div data-testid="review-detail-meaning-missing" className="text-sm text-amber-400">
                        ⚠ {t('review.noTranslation')}
                      </div>
                    ) : null}
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
                      onClick={() => onReviewWord(word, contentId || undefined)}
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
