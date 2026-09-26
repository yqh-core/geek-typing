/**
 * 学习分析：记录每个字母的正确/错误次数、每个单词的掌握情况。
 * 数据落在 localStorage，纯前端；用于「错词分析面板」和「弱项专攻」出题。
 */

const KEY = 'gt.analytics.v1'

export interface LetterStat {
  hit: number
  miss: number
}

export interface WordStat {
  done: number
  wrong: number
}

export interface Analytics {
  letters: Record<string, LetterStat>
  words: Record<string, WordStat>
  totalKeys: number
  totalCorrect: number
  totalWords: number
  bestWpm: number
}

const EMPTY: Analytics = {
  letters: {},
  words: {},
  totalKeys: 0,
  totalCorrect: 0,
  totalWords: 0,
  bestWpm: 0,
}

export function loadAnalytics(): Analytics {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Analytics) } : EMPTY
  } catch {
    return EMPTY
  }
}

export function saveAnalytics(a: Analytics) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* 忽略 */
  }
}

export function resetAnalytics(): Analytics {
  saveAnalytics(EMPTY)
  return EMPTY
}

/** 记录一次击键（只统计纯字母，code 模式的符号键不进字母弱项） */
export function recordKey(a: Analytics, letter: string, ok: boolean): Analytics {
  const key = letter.toLowerCase()
  if (!/^[a-z]$/.test(key)) return a
  const prev = a.letters[key] ?? { hit: 0, miss: 0 }
  return {
    ...a,
    letters: { ...a.letters, [key]: ok ? { ...prev, hit: prev.hit + 1 } : { ...prev, miss: prev.miss + 1 } },
    totalKeys: a.totalKeys + 1,
    totalCorrect: a.totalCorrect + (ok ? 1 : 0),
  }
}

/** 记录一个单词完成 */
export function recordWordDone(a: Analytics, word: string, perfect: boolean, wpm: number): Analytics {
  const k = word.toLowerCase()
  const prev = a.words[k] ?? { done: 0, wrong: 0 }
  return {
    ...a,
    words: { ...a.words, [k]: { done: prev.done + 1, wrong: prev.wrong + (perfect ? 0 : 1) } },
    totalWords: a.totalWords + 1,
    bestWpm: Math.max(a.bestWpm, wpm),
  }
}

export function accuracyOf(a: Analytics): number {
  return a.totalKeys === 0 ? 100 : Math.round((a.totalCorrect / a.totalKeys) * 100)
}

/** 错误率最高的前 n 个字母 */
export function weakLetters(a: Analytics, n = 8): { letter: string; miss: number; rate: number }[] {
  return Object.entries(a.letters)
    .map(([letter, s]) => ({
      letter,
      miss: s.miss,
      rate: s.hit + s.miss === 0 ? 0 : s.miss / (s.hit + s.miss),
    }))
    .sort((x, y) => y.miss - x.miss || y.rate - x.rate)
    .slice(0, n)
}

/** 错得最多的单词 */
export function wrongWords(a: Analytics, n = 10): { word: string; wrong: number; done: number }[] {
  return Object.entries(a.words)
    .map(([word, s]) => ({ word, wrong: s.wrong, done: s.done }))
    .filter((w) => w.wrong > 0)
    .sort((x, y) => y.wrong - x.wrong || y.done - x.done)
    .slice(0, n)
}

/** 按弱字母给单词打分，用于「弱项专攻」出题 */
export function rankByWeakness(words: string[], letters: string[]): string[] {
  const set = new Set(letters)
  return [...words].sort((w1, w2) => {
    const s1 = w1.toLowerCase().split('').filter((c) => set.has(c)).length
    const s2 = w2.toLowerCase().split('').filter((c) => set.has(c)).length
    return s2 - s1
  })
}
