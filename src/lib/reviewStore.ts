/**
 * 词级错题本 + 艾宾浩斯复习调度：localStorage key 'gt.review.v1'
 * schema: { [word]: { wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx } }
 *
 * 间隔表 [1, 2, 4, 7, 15]（天）：
 * - 敲错 → intervalIdx 归 0，1 天后到期
 * - 复习敲对 → intervalIdx+1，按下一档间隔排期
 * - 走完最后一档（15 天）再敲对 → 毕业，条目移除
 */

export interface ReviewEntry {
  wrongCount: number
  correctStreak: number
  lastWrongAt: number
  nextReviewAt: number
  intervalIdx: number
}

export type ReviewStore = Record<string, ReviewEntry>

/** 艾宾浩斯间隔（天） */
export const INTERVALS_DAYS = [1, 2, 4, 7, 15]

const KEY = 'gt.review.v1'
const DAY = 24 * 60 * 60 * 1000

/** 读取错题表（JSON 损坏 / 隐私模式返回空表） */
export function loadReview(): ReviewStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as ReviewStore
  } catch {
    return {}
  }
}

function save(store: ReviewStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* 隐私模式下忽略 */
  }
}

/** 记一次错：wrongCount+1、correctStreak 清零、间隔归 0，1 天后到期 */
export function recordWrong(word: string): ReviewStore {
  const store = loadReview()
  const prev = store[word]
  const now = Date.now()
  const next: ReviewStore = {
    ...store,
    [word]: {
      wrongCount: (prev?.wrongCount ?? 0) + 1,
      correctStreak: 0,
      lastWrongAt: now,
      nextReviewAt: now + INTERVALS_DAYS[0] * DAY,
      intervalIdx: 0,
    },
  }
  save(next)
  return next
}

/** 记一次对（仅对复习中的词生效）：间隔推进一档；走完间隔表则毕业移除 */
export function recordCorrect(word: string): ReviewStore {
  const store = loadReview()
  const prev = store[word]
  if (!prev) return store
  const nextIdx = prev.intervalIdx + 1
  if (nextIdx >= INTERVALS_DAYS.length) {
    // 毕业：从错题本移除
    const rest: ReviewStore = {}
    for (const [k, v] of Object.entries(store)) {
      if (k !== word) rest[k] = v
    }
    save(rest)
    return rest
  }
  const now = Date.now()
  const next: ReviewStore = {
    ...store,
    [word]: {
      ...prev,
      correctStreak: prev.correctStreak + 1,
      intervalIdx: nextIdx,
      nextReviewAt: now + INTERVALS_DAYS[nextIdx] * DAY,
    },
  }
  save(next)
  return next
}

/** 已到期、且仍存在于有效词集合中的词；validWords 缺省时不过滤（存储里的词本身即历史上练过的词） */
export function dueWords(validWords?: string[], now = Date.now()): string[] {
  const store = loadReview()
  if (!validWords) {
    return Object.keys(store).filter((w) => store[w]?.nextReviewAt <= now)
  }
  const valid = new Set(validWords)
  return Object.keys(store).filter((w) => valid.has(w) && store[w]?.nextReviewAt <= now)
}

export interface ReviewStats {
  /** 错题总数 */
  total: number
  /** 今日到期数 */
  due: number
}

/** 统计：错题总数 / 今日到期数 */
export function reviewStats(now = Date.now()): ReviewStats {
  const store = loadReview()
  let due = 0
  for (const e of Object.values(store)) {
    if (e?.nextReviewAt <= now) due++
  }
  return { total: Object.keys(store).length, due }
}
