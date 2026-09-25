import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import PracticePanel from './components/PracticePanel'
import ResultOverlay from './components/ResultOverlay'
import StreakBar from './components/StreakBar'
import { DEFAULT_BANK_ID, WORD_BANKS, type WordItem } from './data/wordBanks'
import { sound, type SoundTheme } from './lib/sound'
import { THEMES, type ThemeId } from './lib/theme'
import { getTodayCount, loadHistory, recordSeconds, recordWord, type History } from './lib/streak'
import { Terminal } from 'lucide-react'

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
  const [bankId, setBankId] = useState<string>(() => readStorage('gt.bank', DEFAULT_BANK_ID))
  const [themeId, setThemeId] = useState<ThemeId>(() => readStorage('gt.theme', 'matrix'))
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStorage('gt.sound', true))
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => readStorage('gt.soundTheme', 'mech'))
  const [shuffled, setShuffled] = useState<boolean>(() => readStorage('gt.shuffle', true))

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

  const startedRef = useRef<number | null>(null)
  const lockRef = useRef(false)
  const milestoneTimer = useRef<number | null>(null)
  const statsRef = useRef<RoundStats>(EMPTY_STATS)
  const flashTimer = useRef<number | null>(null)

  const theme = THEMES[themeId]
  const bank = useMemo(
    () => WORD_BANKS.find((b) => b.id === bankId) ?? WORD_BANKS[0],
    [bankId],
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
    },
    [buildQueue],
  )

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'Enter' && finished) {
        e.preventDefault()
        sound.tap()
        startRound()
        return
      }
      if (finished) return

      // 只处理单字符按键，忽略 Shift / CapsLock / Tab 等功能键
      if (e.key.length !== 1) return
      e.preventDefault()
      if (lockRef.current || !current) return

      if (startedRef.current === null) startedRef.current = Date.now()

      const key = e.key.toLowerCase()
      const next = typed + key

      // ✅ 敲对了
      if (targetLower.startsWith(next)) {
        const nextCombo = statsRef.current.combo + 1
        sound.correct()
        setTyped(next)
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
          window.setTimeout(() => {
            lockRef.current = false
            setTyped('')
            if (wordIndex + 1 >= queue.length) {
              setFinished(true)
              const secs = startedRef.current ? Math.round((Date.now() - startedRef.current) / 1000) : 0
              setHistory(recordSeconds(secs))
              setElapsedMs(secs * 1000)
              sound.fanfare()
            } else {
              setWordIndex((i) => i + 1)
            }
          }, 220)
        }
        return
      }

      // ❌ 敲错了：不允许跳过，必须敲正确的下一个字母
      sound.error()
      setWrongKey(key)
      setErrorFlash(true)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setErrorFlash(false), 280)
      setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
      setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [typed, wordIndex, queue, targetLower, current, finished, startRound])

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
    () => WORD_BANKS.flatMap((b) => b.words).filter((w) => wrongWords.includes(w.word.toLowerCase())),
    [wrongWords],
  )

  const todayCount = getTodayCount(history)

  return (
    <div className={`min-h-screen ${theme.root} transition-colors duration-300`}>
      {/* 背景光晕 */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-[820px] h-[520px] rounded-full blur-3xl opacity-[0.07] bg-emerald-500" />
      </div>

      <div className="relative flex flex-col items-center gap-8 py-10 px-4 min-h-screen">
        <Header
          theme={theme}
          bankId={bankId}
          onBankChange={setBankId}
          onThemeChange={setThemeId}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled((v) => !v)}
          soundTheme={soundTheme}
          onSoundThemeChange={setSoundTheme}
          shuffled={shuffled}
          onShuffleToggle={() => setShuffled((v) => !v)}
          onRestart={() => {
            sound.tap()
            startRound()
          }}
        />

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

        <div className="flex-1 w-full flex items-center justify-center py-4 relative">
          {milestone && (
            <div
              className={`pointer-events-none absolute top-0 z-20 px-5 py-2 rounded-full border ${theme.border} ${theme.card} ${theme.accent} text-sm font-bold animate-popIn shadow-2xl`}
            >
              🔥 {milestone} 连击！手感来了
            </div>
          )}
          {current ? (
            <PracticePanel
              theme={theme}
              word={current.word}
              translation={current.translation}
              typed={typed}
              errorFlash={errorFlash}
              wrongKey={wrongKey}
              upcoming={upcoming}
            />
          ) : (
            <div className={theme.sub}>加载词库中…</div>
          )}
        </div>

        <footer className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs ${theme.sub} opacity-70`}>
          <span className="flex items-center gap-1.5">
            <Terminal size={13} />
            别找输入框，直接在键盘上敲字母即可
          </span>
          <span>敲错会被拦住，必须敲对当前字母</span>
          <span>Enter 结算后重来</span>
        </footer>

        <StreakBar theme={theme} history={history} todayCount={todayCount} />
      </div>

      {finished && (
        <ResultOverlay
          theme={theme}
          stats={{
            words: queue.length,
            accuracy,
            wpm,
            bestCombo: stats.bestCombo,
            seconds: Math.round(elapsedMs / 1000),
            wrongCount: wrongItems.length,
          }}
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
