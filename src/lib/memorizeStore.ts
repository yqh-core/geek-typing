/**
 * 背单词进度持久化：localStorage key 'gt.memorize.v1'
 * schema: { [word]: { status, reviews, lastAt } }
 */

export type MemStatus = 'known' | 'fuzzy' | 'unknown'

export interface MemRecord {
  status: MemStatus
  reviews: number
  lastAt: number
}

export type MemStore = Record<string, MemRecord>

const KEY = 'gt.memorize.v1'

/** 读取进度（损坏/隐私模式返回空表） */
export function loadMemorize(): MemStore {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as MemStore) : {}
  } catch {
    return {}
  }
}

/** 记录一次作答：reviews+1、更新状态与时间戳，落盘并返回新表 */
export function recordMemorize(store: MemStore, word: string, status: MemStatus): MemStore {
  const prev = store[word]
  const next: MemStore = {
    ...store,
    [word]: { status, reviews: (prev?.reviews ?? 0) + 1, lastAt: Date.now() },
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下忽略 */
  }
  return next
}

/** 今天 0 点的时间戳 */
export function todayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface MemStats {
  /** 今日记录过的新词数（首次作答算新学） */
  learnedToday: number
  /** 今日作答中复习过的词数（reviews > 1） */
  reviewedToday: number
  /** 给定词表内已掌握（known）的词数 */
  masteredInBank: number
}

/** 统计：今日新学 / 复习 / 本库已掌握 */
export function getMemorizeStats(store: MemStore, bankWords: string[]): MemStats {
  const start = todayStart()
  let learnedToday = 0
  let reviewedToday = 0
  for (const w of bankWords) {
    const r = store[w]
    if (!r || r.lastAt < start) continue
    if (r.reviews > 1) reviewedToday++
    else learnedToday++
  }
  const masteredInBank = bankWords.filter((w) => store[w]?.status === 'known').length
  return { learnedToday, reviewedToday, masteredInBank }
}
