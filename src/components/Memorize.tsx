import { useEffect, useMemo, useState } from 'react'
import { Volume2, Check, Eye, RotateCcw, Sparkles } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import type { WordBank } from '../data/wordBanks'
import { speak } from '../lib/speech'
import { sound } from '../lib/sound'
import {
  getMemorizeStats,
  loadMemorize,
  recordMemorize,
  type MemStatus,
  type MemStore,
} from '../lib/memorizeStore'
import { useT } from '../i18n'

interface MemorizeProps {
  theme: ThemeConfig
  /** 与打字模块共享的当前词库 */
  bank: WordBank
}

/** 每日新词计划：默认 20 个 */
const DAILY_NEW = 20

/**
 * 背单词卡片流：
 * 正面 = 单词 + 发音；翻面 = 释义；三键调度：unknown 追加 2 次、fuzzy 1 次、known 完成。
 * 进度存 localStorage，刷新不丢。
 */
export default function Memorize({ theme, bank }: MemorizeProps) {
  const t = useT()

  /** memorize 全量进度（本组件内自持，跨词库共享） */
  const [store, setStore] = useState<MemStore>(() => loadMemorize())

  /** 当前这组的队列：从词库里按顺序取进度中没有的词（不认识会追加到队尾） */
  const [deck, setDeck] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [session, setSession] = useState(0) // 「再来一组」的触发器

  // 从当前词库取进度里没有的词（word 字符串），按词库顺序前 20 个作为一组
  const freshWords = useMemo(() => {
    void session // 依赖 session：点「再来一组」时重算
    return bank.words
      .filter((w) => !store[w.word])
      .slice(0, DAILY_NEW)
      .map((w) => w.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, session])

  // deck 为空且还有新词时自动开一组（副作用移到 effect，避免渲染期 setState）
  useEffect(() => {
    if (deck.length === 0 && cursor === 0 && freshWords.length > 0) {
      setDeck(freshWords)
    }
  }, [deck.length, cursor, freshWords])

  const item = bank.words.find((w) => w.word === deck[cursor])
  const done = deck.length > 0 && cursor >= deck.length

  /** 三键调度：unknown → 追加 2 次，fuzzy → 1 次，known → 完成 */
  const answer = (status: MemStatus) => {
    if (!item) return
    setStore((s) => recordMemorize(s, item.word, status))
    const extra = status === 'unknown' ? 2 : status === 'fuzzy' ? 1 : 0
    if (extra > 0) setDeck((d) => [...d, ...Array.from({ length: extra }, () => item.word)])
    setFlipped(false)
    setCursor((c) => c + 1)
  }

  /** 再来一组：重新从词库取尚未学过的词 */
  const nextBatch = () => {
    setDeck([])
    setCursor(0)
    setFlipped(false)
    setSession((s) => s + 1)
  }

  const stats = useMemo(
    () => getMemorizeStats(store, bank.words.map((w) => w.word)),
    [store, bank],
  )

  const totalInDeck = deck.length
  const progress = totalInDeck > 0 ? Math.min(cursor, totalInDeck) : 0

  /* ---------- 词库为空 ---------- */
  if (bank.words.length === 0) {
    return <div className={`text-sm ${theme.sub}`}>{t('memorize.emptyBank')}</div>
  }

  /* ---------- 结算卡 ---------- */
  if (done) {
    const noFresh = freshWords.length === 0
    return (
      <div className={`w-full max-w-md mx-auto ${theme.card} border ${theme.border} rounded-2xl p-8 text-center shadow-2xl`}>
        <Sparkles size={28} className={`mx-auto mb-3 ${theme.accent}`} />
        <h2 className={`text-lg font-bold mb-1 ${theme.accent}`}>{t('memorize.done')}</h2>
        {noFresh && <p className={`text-xs mb-4 ${theme.sub}`}>{t('memorize.allDone')}</p>}
        <div className="grid grid-cols-3 gap-3 my-6">
          {[
            { label: t('memorize.newToday'), value: stats.learnedToday },
            { label: t('memorize.reviewed'), value: stats.reviewedToday },
            { label: t('memorize.mastered'), value: stats.masteredInBank },
          ].map((it) => (
            <div key={it.label} className={`rounded-xl border ${theme.border} px-2 py-3`}>
              <div className={`text-[11px] ${theme.sub}`}>{it.label}</div>
              <div className="text-xl font-bold tabular-nums mt-0.5">{it.value}</div>
            </div>
          ))}
        </div>
        <button
          data-testid="memorize-again"
          onClick={() => {
            sound.tap()
            nextBatch()
          }}
          className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border ${theme.border} text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95`}
        >
          <RotateCcw size={14} />
          {t('memorize.again')}
        </button>
      </div>
    )
  }

  /* ---------- 等待开组（不应长驻，兜底展示） ---------- */
  if (!item) {
    return (
      <div className="text-center">
        <p className={`text-sm ${theme.sub} mb-4`}>{t('memorize.allDone')}</p>
        <button
          onClick={() => {
            sound.tap()
            nextBatch()
          }}
          className={`px-4 py-2 rounded-xl border ${theme.border} text-sm`}
        >
          {t('memorize.again')}
        </button>
      </div>
    )
  }

  /* ---------- 卡片 ---------- */
  return (
    <div className="w-full max-w-md mx-auto">
      {/* 计划与进度 */}
      <div className={`flex items-center justify-between text-xs ${theme.sub} mb-3`}>
        <span>
          {t('memorize.plan')}：{freshWords.length}
        </span>
        <span data-testid="memorize-progress" className="tabular-nums">
          {t('memorize.progress')}：{progress}/{totalInDeck}
        </span>
      </div>

      <div className={`h-1.5 rounded-full bg-black/20 overflow-hidden mb-6 ${theme.accent}`}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${totalInDeck ? (progress / totalInDeck) * 100 : 0}%`, backgroundColor: 'currentColor' }}
        />
      </div>

      {/* 正面：单词 + 发音 / 翻面：释义 */}
      <div
        data-testid="memorize-card"
        className={`${theme.card} border ${theme.border} rounded-2xl px-6 py-12 text-center shadow-2xl min-h-[16rem] flex flex-col items-center justify-center gap-4`}
      >
        {!flipped ? (
          <>
            <div className="text-4xl font-bold tracking-[0.12em]">{item.word}</div>
            <div className="flex items-center gap-2">
              <button
                data-testid="memorize-speak"
                onClick={() => speak(item.word)}
                title={t('practice.speakTitle')}
                aria-label={t('practice.speakTitle')}
                className={`p-2 rounded-md border ${theme.border} hover:opacity-70 active:scale-95`}
              >
                <Volume2 size={15} />
              </button>
              <button
                data-testid="memorize-flip"
                onClick={() => setFlipped(true)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border ${theme.border} text-xs font-semibold active:scale-95`}
              >
                <Eye size={13} />
                {t('memorize.show')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-4xl font-bold tracking-[0.12em]">{item.word}</div>
            <div data-testid="memorize-translation" className={`text-lg ${theme.accent}`}>
              {item.translation}
            </div>
            {item.definition && (
              <div className={`text-xs ${theme.sub} max-w-sm`}>
                <span className="opacity-60">{t('memorize.definition')}: </span>
                {item.definition}
              </div>
            )}
          </>
        )}
      </div>

      {/* 三键：翻面后才可用 */}
      <div className={`grid grid-cols-3 gap-3 mt-6 ${flipped ? '' : 'opacity-40 pointer-events-none'}`}>
        {(
          [
            { id: 'known', label: t('memorize.known'), cls: 'text-emerald-400 border-emerald-500/50', icon: Check },
            { id: 'fuzzy', label: t('memorize.fuzzy'), cls: 'text-amber-400 border-amber-500/50', icon: Eye },
            { id: 'unknown', label: t('memorize.unknown'), cls: 'text-red-400 border-red-500/50', icon: RotateCcw },
          ] as { id: MemStatus; label: string; cls: string; icon: typeof Check }[]
        ).map((b) => (
          <button
            key={b.id}
            data-testid={`memorize-${b.id}`}
            onClick={() => answer(b.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold active:scale-95 ${b.cls}`}
          >
            <b.icon size={14} />
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
