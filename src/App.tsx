import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import PracticePanel from './components/PracticePanel'
import ResultOverlay from './components/ResultOverlay'
import StreakBar from './components/StreakBar'
import KeyMap from './components/KeyMap'
import Memorize from './components/Memorize'
import { DEFAULT_BANK_ID, WORD_BANKS, type WordBank, type WordItem } from './data/wordBanks'
import { sound, type SoundTheme } from './lib/sound'
import { THEMES, type ThemeId } from './lib/theme'
import { getMode, type PracticeModeId } from './lib/modes'
import { loadCustomBanks, type CustomBank } from './lib/customBanks'
import {
  loadAnalytics,
  rankByWeakness,
  recordKey,
  recordWordDone,
  resetAnalytics,
  saveAnalytics,
  weakLetters,
  type Analytics,
} from './lib/analytics'
import { speak, warmSpeech } from './lib/speech'
import { getTodayCount, loadHistory, recordSeconds, recordWord, type History } from './lib/streak'
import { Terminal } from 'lucide-react'
import { useT } from './i18n'

/** 顶部两个页签 */
type TabId = 'typing' | 'memorize'

/** 每一轮练习的词数 */
const CHAPTER_SIZE = 20

/** 连击里程碑阈值 */
const MILESTONES = [10, 20, 30, 50, 100]

interface RoundStats {
  keys: number
  correct: number
  errors: number
  combo: number
  bestCombo: number
}

const EMPTY_STATS: RoundStats = { keys: 0, correct: 0, errors: 0, combo: 0, bestCombo: 0 }

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式下忽略 */
  }
}

export default function App() {
  const t = useT()
  const [tab, setTab] = useState<TabId>('typing')
  const [bankId, setBankId] = useState<string>(() => readStorage('gt.bank', DEFAULT_BANK_ID))
  const [themeId, setThemeId] = useState<ThemeId>(() => readStorage('gt.theme', 'matrix'))
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStorage('gt.sound', true))
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => readStorage('gt.soundTheme', 'mech'))
  const [shuffled, setShuffled] = useState<boolean>(() => readStorage('gt.shuffle', true))
  const [mode, setMode] = useState<PracticeModeId>(() => readStorage('gt.mode', 'classic'))
  const [running, setRunning] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const [queue, setQueue] = useState<WordItem[]>([])
  const [wordIndex, setWordIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [errorFlash, setErrorFlash] = useState(false)
  const [wrongKey, setWrongKey] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const [stats, setStats] = useState<RoundStats>(EMPTY_STATS)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [wrongWords, setWrongWords] = useState<string[]>([])
  const [milestone, setMilestone] = useState<number | null>(null)

  const [history, setHistory] = useState<History>(() => loadHistory())
  const [customBanks, setCustomBanks] = useState<CustomBank[]>(() => loadCustomBanks())
  const [analytics, setAnalytics] = useState<Analytics>(() => loadAnalytics())
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => readStorage('gt.autoSpeak', false))

  const startedRef = useRef<number | null>(null)
  const lockRef = useRef(false)
  const milestoneTimer = useRef<number | null>(null)
  const statsRef = useRef<RoundStats>(EMPTY_STATS)
  const flashTimer = useRef<number | null>(null)

  const theme = THEMES[themeId]

  /** 内置词库 + 我的自定义词库 */
  const banks = useMemo<WordBank[]>(
    () => [
      ...WORD_BANKS,
      ...customBanks.map((c) => ({
        id: c.id,
        name: c.name,
        description: '我的自定义词库',
        icon: 'FileText',
        words: c.words,
      })),
    ],
    [customBanks],
  )

  // 切换词库时顺带刷新一次自定义词库列表（导入新词库后会触发这里）
  useEffect(() => {
    setCustomBanks(loadCustomBanks())
  }, [bankId])

  const bank = useMemo(
    () => banks.find((b) => b.id === bankId) ?? banks[0],
    [banks, bankId],
  )

  /* ---------------- 生成一轮练习队列 ---------------- */
  const buildQueue = useCallback(
    (source?: WordItem[]) => {
      const base = source && source.length > 0 ? source : bank.words
      const arr = [...base]
      if (shuffled) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
      }
      return arr.slice(0, CHAPTER_SIZE)
    },
    [bank, shuffled],
  )

  const startRound = useCallback(
    (source?: WordItem[]) => {
      setQueue(buildQueue(source))
      setWordIndex(0)
      setTyped('')
      setErrorFlash(false)
      setWrongKey(null)
      setFinished(false)
      setStats(EMPTY_STATS)
      setElapsedMs(0)
      setWrongWords([])
      startedRef.current = null
      lockRef.current = false
      setRunning(false)
      setCountdown(null)
    },
    [buildQueue],
  )

  /** 弱项专攻：优先出包含最常敲错字母的词 */
  const startWeakRound = useCallback(() => {
    const letters = weakLetters(analytics, 6).map((w) => w.letter)
    if (letters.length === 0) {
      startRound()
      return
    }
    const set = new Set(letters)
    const candidates = bank.words.filter((w) => w.word.toLowerCase().split('').some((c) => set.has(c)))
    const map = new Map(candidates.map((w) => [w.word, w]))
    const ranked = rankByWeakness(candidates.map((w) => w.word), letters)
    const picked = ranked.map((w) => map.get(w)).filter((w): w is WordItem => !!w)
    startRound(picked.length > 0 ? picked : undefined)
  }, [analytics, bank, startRound])

  /** 单挑一个错词反复练 */
  const reviewSingleWord = useCallback(
    (word: string) => {
      const item = bank.words.find((w) => w.word.toLowerCase() === word.toLowerCase())
      if (item) startRound(Array.from({ length: 10 }, () => item))
    },
    [bank, startRound],
  )

  /** 当前瞬时 WPM */
  const currentWpm = useCallback(() => {
    if (!startedRef.current) return 0
    const secs = (Date.now() - startedRef.current) / 1000
    if (secs <= 0) return 0
    return Math.round(statsRef.current.correct / 5 / (secs / 60))
  }, [])

  /** 结算本轮 */
  const finishRound = useCallback(() => {
    setFinished(true)
    const secs = startedRef.current ? Math.round((Date.now() - startedRef.current) / 1000) : 0
    setHistory(recordSeconds(secs))
    setElapsedMs(secs * 1000)
    sound.fanfare()
  }, [])

  /** 切下一个词，或本轮结束 */
  const advance = useCallback(() => {
    if (wordIndex + 1 >= queue.length) {
      finishRound()
    } else {
      setWordIndex((i) => i + 1)
    }
  }, [wordIndex, queue.length, finishRound])

  // 切换词库 / 切换排序方式 → 重开一轮
  useEffect(() => {
    startRound()
  }, [startRound])

  // 偏好持久化
  useEffect(() => writeStorage('gt.bank', bankId), [bankId])
  useEffect(() => writeStorage('gt.theme', themeId), [themeId])
  useEffect(() => writeStorage('gt.sound', soundEnabled), [soundEnabled])
  useEffect(() => writeStorage('gt.soundTheme', soundTheme), [soundTheme])
  useEffect(() => writeStorage('gt.shuffle', shuffled), [shuffled])
  useEffect(() => writeStorage('gt.mode', mode), [mode])
  useEffect(() => writeStorage('gt.autoSpeak', autoSpeak), [autoSpeak])

  // 预热语音引擎（某些浏览器首次 getVoices 为空）
  useEffect(() => {
    warmSpeech()
  }, [])

  // 分析数据落盘（节流，避免每次击键都写 localStorage）
  useEffect(() => {
    const t = window.setTimeout(() => saveAnalytics(analytics), 800)
    return () => window.clearTimeout(t)
  }, [analytics])

  /* ---------------- 限时模式倒计时 ---------------- */
  useEffect(() => {
    if (mode !== 'timed' || !running || finished) return
    const total = getMode('timed').duration ?? 60
    if (countdown === null) setCountdown(total)
    const id = window.setInterval(() => setCountdown((c) => (c === null ? c : Math.max(0, c - 1))), 1000)
    return () => window.clearInterval(id)
  }, [mode, running, finished, countdown])

  useEffect(() => {
    if (mode === 'timed' && countdown === 0 && running && !finished) finishRound()
  }, [countdown, running, finished, mode, finishRound])

  useEffect(() => {
    sound.enabled = soundEnabled
    sound.theme = soundTheme
  }, [soundEnabled, soundTheme])

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  /* ---------------- 计时器 ---------------- */
  useEffect(() => {
    if (finished || startedRef.current === null) return
    const timer = window.setInterval(() => {
      if (startedRef.current) setElapsedMs(Date.now() - startedRef.current)
    }, 250)
    return () => window.clearInterval(timer)
  }, [finished, wordIndex, typed])

  /* ---------------- 核心：全局键盘监听 ---------------- */
  const current = queue[wordIndex]
  const targetLower = (current?.word ?? '').toLowerCase()

  // 换词时自动发音（拼写模式默认发音，或手动开启自动发音；仅打字页签生效）
  useEffect(() => {
    if (tab !== 'typing') return
    if (!current) return
    if (mode === 'spell' || autoSpeak) speak(current.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.word, wordIndex, mode, autoSpeak, tab])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 背单词页签下禁用全局打字引擎，避免按键触发练习
      if (tab !== 'typing') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'Enter' && finished) {
        e.preventDefault()
        sound.tap()
        startRound()
        return
      }
      if (finished) return

      // 拼写模式的退格要在长度过滤之前处理
      if (mode === 'spell' && e.key === 'Backspace') {
        e.preventDefault()
        sound.tap()
        setTyped((t) => t.slice(0, -1))
        setErrorFlash(false)
        return
      }

      // 只处理单字符按键，忽略 Shift / CapsLock / Tab 等功能键
      if (e.key.length !== 1) return
      e.preventDefault()
      if (lockRef.current || !current) return

      if (startedRef.current === null) {
        startedRef.current = Date.now()
        setRunning(true)
      }

      const key = e.key.toLowerCase()

      /* ================= 拼写（默写）模式：允许自由输入 ================= */
      if (mode === 'spell') {
        const next = typed + key
        const pos = typed.length
        const good = next[pos] === targetLower[pos]
        setTyped(next)
        setAnalytics((a) => recordKey(a, key, good))
        sound.correctOrError(good)
        if (!good) {
          setWrongKey(key)
          setErrorFlash(true)
          if (flashTimer.current) window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setErrorFlash(false), 280)
          setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
          setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
          return
        }
        const nextCombo = statsRef.current.combo + 1
        setErrorFlash(false)
        setStats((s) => ({
          ...s,
          keys: s.keys + 1,
          correct: s.correct + 1,
          combo: s.combo + 1,
          bestCombo: Math.max(s.bestCombo, s.combo + 1),
        }))
        if (MILESTONES.includes(nextCombo)) {
          sound.milestone()
          setMilestone(nextCombo)
          if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
          milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1400)
        }
        if (next.length >= targetLower.length) {
          // 长度够但仍有错字母：不许过关，提示用退格修正
          const perfect = next === targetLower
          if (!perfect) {
            sound.error()
            setErrorFlash(true)
            if (flashTimer.current) window.clearTimeout(flashTimer.current)
            flashTimer.current = window.setTimeout(() => setErrorFlash(false), 400)
            return
          }
          lockRef.current = true
          sound.complete()
          setHistory(recordWord())
          setAnalytics((a) => recordWordDone(a, current.word, true, currentWpm()))
          window.setTimeout(() => {
            lockRef.current = false
            setTyped('')
            advance()
          }, 220)
        }
        return
      }

      /* ================= 经典 / 限时模式：严格纠错 ================= */
      const next = typed + key

      // ✅ 敲对了
      if (targetLower.startsWith(next)) {
        const nextCombo = statsRef.current.combo + 1
        sound.correct()
        setTyped(next)
        setAnalytics((a) => recordKey(a, key, true))
        setErrorFlash(false)
        setStats((s) => ({
          ...s,
          keys: s.keys + 1,
          correct: s.correct + 1,
          combo: s.combo + 1,
          bestCombo: Math.max(s.bestCombo, s.combo + 1),
        }))

        // 🎉 连击里程碑提示
        if (MILESTONES.includes(nextCombo)) {
          sound.milestone()
          setMilestone(nextCombo)
          if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
          milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1400)
        }

        // 整个单词敲完
        if (next === targetLower) {
          lockRef.current = true
          sound.complete()
          setHistory(recordWord())
          setAnalytics((a) => recordWordDone(a, current.word, statsRef.current.errors === 0, currentWpm()))
          window.setTimeout(() => {
            lockRef.current = false
            setTyped('')
            if (wordIndex + 1 >= queue.length) {
              finishRound()
            } else {
              setWordIndex((i) => i + 1)
            }
          }, 220)
        }
        return
      }

      // ❌ 敲错了：不允许跳过，必须敲正确的下一个字母
      sound.error()
      setAnalytics((a) => recordKey(a, key, false))
      setWrongKey(key)
      setErrorFlash(true)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setErrorFlash(false), 280)
      setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
      setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [typed, wordIndex, queue, targetLower, current, finished, startRound, mode, advance, finishRound, tab])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
    }
  }, [])

  /* ---------------- 派生数据 ---------------- */
  const accuracy = stats.keys === 0 ? 100 : Math.round((stats.correct / stats.keys) * 100)
  const minutes = elapsedMs / 60000
  const wpm = minutes > 0 ? Math.max(0, Math.round(stats.correct / 5 / minutes)) : 0
  const percent = queue.length ? Math.round((wordIndex / queue.length) * 100) : 0
  const upcoming = queue.slice(wordIndex + 1, wordIndex + 4)

  const wrongItems = useMemo(
    () => banks.flatMap((b) => b.words).filter((w) => wrongWords.includes(w.word.toLowerCase())),
    [banks, wrongWords],
  )

  const todayCount = getTodayCount(history)
  const nextKey = current ? current.word.toLowerCase()[typed.length] ?? null : null
  const completedWords = finished ? Math.min(wordIndex + (countdown === 0 ? 0 : 1), queue.length) : wordIndex

  return (
    <div className={`min-h-screen ${theme.root} transition-colors duration-300`}>
      {/* 背景光晕 */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-[820px] h-[520px] rounded-full blur-3xl opacity-[0.07] bg-emerald-500" />
      </div>

      <div className="relative flex flex-col items-center gap-8 py-10 px-4 min-h-screen">
        <Header
          theme={theme}
          banks={banks}
          bankId={bankId}
          onBankChange={setBankId}
          onThemeChange={setThemeId}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled((v) => !v)}
          soundTheme={soundTheme}
          onSoundThemeChange={setSoundTheme}
          shuffled={shuffled}
          onShuffleToggle={() => setShuffled((v) => !v)}
          autoSpeak={autoSpeak}
          onAutoSpeakToggle={() => setAutoSpeak((v) => !v)}
          currentMode={mode}
          onModeChange={(id) => {
            setMode(id)
            startRound()
          }}
          analytics={analytics}
          onWeakPractice={startWeakRound}
          onReviewWord={reviewSingleWord}
          onReset={() => setAnalytics(resetAnalytics())}
          onRestart={() => {
            sound.tap()
            startRound()
          }}
        />

        {/* 页签切换：打字练习 / 背单词 */}
        <div className={`flex items-center p-1 rounded-xl border ${theme.border} gap-1`}>
          {(
            [
              { id: 'typing', label: t('tab.typing') },
              { id: 'memorize', label: t('tab.memorize') },
            ] as { id: TabId; label: string }[]
          ).map((tb) => (
            <button
              key={tb.id}
              data-testid={`tab-${tb.id}`}
              onClick={() => {
                sound.tap()
                setTab(tb.id)
              }}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                tab === tb.id ? `${theme.accent} bg-white/10` : theme.sub
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {tab === 'typing' && (
          <div className="w-full max-w-4xl">
            <StatsBar
              accent={theme.accent}
              progress={{ current: Math.min(wordIndex + 1, queue.length), total: queue.length }}
              accuracy={`${accuracy}%`}
              wpm={String(wpm)}
              combo={stats.combo}
              percent={percent}
            />
          </div>
        )}

        {/* 限时模式倒计时（原模式行保留项） */}
        {tab === 'typing' && mode === 'timed' && countdown !== null && (
          <span
            data-testid="countdown"
            className={`text-sm font-bold tabular-nums ${countdown <= 10 ? 'text-red-400' : theme.accent}`}
          >
            ⏱ {countdown}s
          </span>
        )}
        {tab === 'typing' && mode === 'spell' && (
          <span className={`text-[11px] ${theme.sub}`}>{t('practice.spellFix')}</span>
        )}

        <div className="flex-1 w-full flex items-center justify-center py-4 relative">
          {tab === 'typing' && milestone && (
            <div
              className={`pointer-events-none absolute top-0 z-20 px-5 py-2 rounded-full border ${theme.border} ${theme.card} ${theme.accent} text-sm font-bold animate-popIn shadow-2xl`}
            >
              🔥 {milestone} {t('milestone.combo')}
            </div>
          )}
          {tab === 'memorize' ? (
            <Memorize theme={theme} bank={bank} />
          ) : current ? (
            <PracticePanel
              theme={theme}
              word={current.word}
              translation={current.translation}
              definition={current.definition}
              typed={typed}
              errorFlash={errorFlash}
              wrongKey={wrongKey}
              upcoming={upcoming}
              mode={mode}
              onSpeak={() => speak(current.word)}
            />
          ) : (
            <div className={theme.sub}>{t('footer.loading')}</div>
          )}
        </div>

        {/* 虚拟键盘：高亮下一个该敲的键（仅打字页签） */}
        {tab === 'typing' && <KeyMap theme={theme} nextKey={nextKey} wrongKey={errorFlash ? wrongKey : null} />}

        {tab === 'typing' && (
          <footer className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs ${theme.sub} opacity-70`}>
            <span className="flex items-center gap-1.5">
              <Terminal size={13} />
              {t('footer.hint1')}
            </span>
            <span>{mode === 'spell' ? t('footer.hintSpell') : t('footer.hintClassic')}</span>
            <span>{t('footer.hint3')}</span>
          </footer>
        )}

        <StreakBar theme={theme} history={history} todayCount={todayCount} />
      </div>

      {tab === 'typing' && finished && (
        <ResultOverlay
          theme={theme}
          stats={{
            words: mode === 'timed' ? completedWords : queue.length,
            accuracy,
            wpm,
            bestCombo: stats.bestCombo,
            seconds: Math.round(elapsedMs / 1000),
            wrongCount: wrongItems.length,
          }}
          mode={mode}
          todayCount={todayCount}
          onRestart={() => {
            sound.tap()
            startRound()
          }}
          onReview={() => {
            sound.tap()
            startRound(wrongItems.length > 0 ? wrongItems : undefined)
          }}
          reviewAvailable={wrongItems.length > 0}
        />
      )}
    </div>
  )
}
