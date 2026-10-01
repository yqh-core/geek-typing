/* P1.6-D · 打字轮状态机 hook —— 从 App.tsx 抽出（原 447–633 行整段搬家，语义逐字保持）
 *
 * 边界：
 *   - 本 hook **不认识学习语义**：整词完成只回调 onCompleteWord(word, perfect, wpm)，
 *     由 App 组合 practiceEngine + analytics + 错题本刷新（P1.6-C 收拢的语义中枢）。
 *     这样 hook 与 Learning 层解耦，也天然满足 practice-engine 门禁。
 *   - 逐键打点仍走 learningService.applyKey（不在「完成三连」门禁范围）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { learningService } from '../core/learning/service'
import { getMode, type PracticeModeId } from '../lib/modes'
import { sound } from '../lib/sound'
import { speak } from '../lib/speech'
import { recordWord, recordSeconds, type History } from '../lib/streak'
import type { Analytics } from '../core/learning'
import type { WordItem } from '../data/wordBanks'
import type { TabId } from './useTabNav'

/** 每一轮练习的词数 */
const CHAPTER_SIZE = 20

/** 连击里程碑阈值 */
const MILESTONES = [10, 20, 30, 50, 100]

export interface RoundStats {
  keys: number
  correct: number
  errors: number
  combo: number
  bestCombo: number
}

const EMPTY_STATS: RoundStats = { keys: 0, correct: 0, errors: 0, combo: 0, bestCombo: 0 }

interface UseTypingRoundParams {
  bankWords: WordItem[]
  shuffled: boolean
  mode: PracticeModeId
  tab: TabId
  /** 命令态打开时打字引擎完全让位 */
  commandMode: boolean
  autoSpeak: boolean
  /** 弱项排序用（弱项专攻轮） */
  analytics: Analytics
  /** analytics 镜像态写入口（由 useAnalytics 提供） */
  updateAnalytics: (fn: (a: Analytics) => Analytics) => void
  setHistory: Dispatch<SetStateAction<History>>
  /** 整词完成回调：App 负责接 practiceEngine（学习语义中枢） */
  onCompleteWord: (word: string, perfect: boolean, wpm: number) => void
  /** 开轮钩子：App 在此重建引擎会话/清空归属映射（学习语义不进本 hook） */
  onRoundStart: () => void
}

export function useTypingRound({
  bankWords,
  shuffled,
  mode,
  tab,
  commandMode,
  autoSpeak,
  analytics,
  updateAnalytics,
  setHistory,
  onCompleteWord,
  onRoundStart,
}: UseTypingRoundParams) {
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
  const [running, setRunning] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const startedRef = useRef<number | null>(null)
  const lockRef = useRef(false)
  const milestoneTimer = useRef<number | null>(null)
  const statsRef = useRef<RoundStats>(EMPTY_STATS)
  const flashTimer = useRef<number | null>(null)

  /* ---------------- 生成一轮练习队列 ---------------- */
  const buildQueue = useCallback(
    (source?: WordItem[]) => {
      const base = source && source.length > 0 ? source : bankWords
      const arr = [...base]
      if (shuffled) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
      }
      return arr.slice(0, CHAPTER_SIZE)
    },
    [bankWords, shuffled],
  )

  const startRound = useCallback(
    (source?: WordItem[]) => {
      // 开轮钩子先跑：清空归属映射 + 重建引擎会话（复习轮/单挑轮随后自行覆盖映射）
      onRoundStart()
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
    [buildQueue, onRoundStart],
  )

  /** 弱项专攻：优先出包含最常敲错字母的词 */
  const startWeakRound = useCallback(() => {
    const letters = learningService.getWeakLetters(analytics, 6).map((w) => w.letter)
    if (letters.length === 0) {
      startRound()
      return
    }
    const set = new Set(letters)
    const candidates = bankWords.filter((w) => w.word.toLowerCase().split('').some((c) => set.has(c)))
    const map = new Map(candidates.map((w) => [w.word, w]))
    const ranked = learningService.rankByWeakness(
      candidates.map((w) => w.word),
      letters,
    )
    const picked = ranked.map((w) => map.get(w)).filter((w): w is WordItem => !!w)
    startRound(picked.length > 0 ? picked : undefined)
  }, [analytics, bankWords, startRound])

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
  }, [setHistory])

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

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
    }
  }, [])

  /* ---------------- 当前词与目标串 ---------------- */
  const current = queue[wordIndex]
  const targetLower = (current?.word ?? '').toLowerCase()
  // code 模式大小写敏感：target 用原文比较；其余模式保持小写比较
  const target = mode === 'code' ? (current?.word ?? '') : targetLower

  // 换词时自动发音（拼写模式默认发音，或手动开启自动发音；仅打字页签生效）
  // code 模式朗读代码行无意义，禁用自动发音
  useEffect(() => {
    if (tab !== 'typing') return
    if (mode === 'code') return
    if (!current) return
    if (mode === 'spell' || autoSpeak) speak(current.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.word, wordIndex, mode, autoSpeak, tab])

  /* ---------------- 核心：全局键盘监听 ---------------- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 命令态下打字引擎完全让位，键全给命令行
      if (commandMode) return
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

      // code 模式保持按键原文（大小写敏感）；其余模式统一小写比较
      const key = mode === 'code' ? e.key : e.key.toLowerCase()

      /* ================= 拼写（默写）模式：允许自由输入 ================= */
      if (mode === 'spell') {
        const next = typed + key
        const pos = typed.length
        const good = next[pos] === targetLower[pos]
        setTyped(next)
        updateAnalytics((a) => learningService.applyKey(a, key, good))
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
        // 拼对立即清红闪：拼写模式允许自由输入，错后继续敲对时红闪应即时消退，
        // 而不是等满 280ms 定时器。P1.6-D 搬家时曾漏抄此行（旧 App.tsx:519），
        // tests/e2e.mjs【6】有锁定用例：无此行消退耗时 ≈162ms，有此行 ≈12ms。
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
          // P1.6-C：完成段交给 App 接 Practice Engine（学习语义中枢）
          onCompleteWord(current.word, true, currentWpm())
          window.setTimeout(() => {
            lockRef.current = false
            setTyped('')
            advance()
          }, 220)
        }
        return
      }

      /* ================= 经典 / 限时 / 代码模式：严格纠错 ================= */
      const next = typed + key

      // ✅ 敲对了（code 模式为原文比较，大小写敏感）
      if (target.startsWith(next)) {
        const nextCombo = statsRef.current.combo + 1
        sound.correct()
        setTyped(next)
        updateAnalytics((a) => learningService.applyKey(a, key, true))
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
        if (next === target) {
          lockRef.current = true
          sound.complete()
          setHistory(recordWord())
          // P1.6-C：完成段交给 App 接 Practice Engine（学习语义中枢）
          const perfect = statsRef.current.errors === 0
          onCompleteWord(current.word, perfect, currentWpm())
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
      updateAnalytics((a) => learningService.applyKey(a, key, false))
      setWrongKey(key)
      setErrorFlash(true)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setErrorFlash(false), 280)
      setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
      setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    typed,
    wordIndex,
    queue,
    targetLower,
    target,
    current,
    currentWpm,
    finished,
    startRound,
    mode,
    advance,
    finishRound,
    tab,
    commandMode,
    wrongWords,
    updateAnalytics,
    onCompleteWord,
    setHistory,
  ])

  /* ---------------- 派生数据 ---------------- */
  const accuracy = stats.keys === 0 ? 100 : Math.round((stats.correct / stats.keys) * 100)
  const minutes = elapsedMs / 60000
  const wpm = minutes > 0 ? Math.max(0, Math.round(stats.correct / 5 / minutes)) : 0
  const percent = queue.length ? Math.round((wordIndex / queue.length) * 100) : 0
  const upcoming = queue.slice(wordIndex + 1, wordIndex + 4)

  const wrongItems = useMemo(
    () => queue.filter((w) => wrongWords.includes(w.word.toLowerCase())),
    [queue, wrongWords],
  )

  const nextKey = current ? current.word.toLowerCase()[typed.length] ?? null : null
  const completedWords = finished ? Math.min(wordIndex + (countdown === 0 ? 0 : 1), queue.length) : wordIndex

  return {
    queue,
    wordIndex,
    typed,
    errorFlash,
    wrongKey,
    finished,
    stats,
    elapsedMs,
    wrongWords,
    milestone,
    running,
    countdown,
    current,
    target,
    targetLower,
    startRound,
    startWeakRound,
    accuracy,
    wpm,
    percent,
    upcoming,
    wrongItems,
    nextKey,
    completedWords,
  }
}
