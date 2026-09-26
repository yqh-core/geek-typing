/**
 * 词级错题本 + 艾宾浩斯复习调度：localStorage key 'gt.review.v1'
 * schema: { [word]: { wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx } }
 *
 * 间隔表 [1, 2, 4, 7, 15]（天）：
 * - 敲错 → intervalIdx 归 0，1 天后到期
 * - 复习敲对 → intervalIdx+1，按下一档间隔排期
 * - 走完最后一档（15 天）再敲对 → 毕业，条目移除
 *
 * 排期加 ±10% 随机抖动（jitter）：同批词不会同刻到期，抗复习雪崩；
 * 写入遇 QuotaExceededError 时熔断清洗（intervalIdx 高者优先丢）重试，详见 save。
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

/**
 * save 结果：ok=false 表示熔断后仍写不进去（数据只留在内存，下次操作会重试） */
export interface SaveResult {
  ok: boolean
  /** Quota 熔断时被清洗掉的条目数（为可观测性服务） */
  evicted: number
}

/** Quota 熔断参数：每轮清 1/4、最多 3 轮（约清掉 58% 仍有空间不足则放弃） */
const QUOTA_ROUNDS = 3

function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/**
 * QuotaExceeded 熔断写入：
 * 按 intervalIdx 从高到低清洗（优先丢接近毕业的低风险条目），每轮清 1/4，最多 3 轮。
 * 全失败返回 { ok: false } 不抛出；每次清洗 console.warn 一条保证可观测。
 */
function save(store: ReviewStore): SaveResult {
  const json = JSON.stringify(store)
  try {
    localStorage.setItem(KEY, json)
    return { ok: true, evicted: 0 }
  } catch (e) {
    if (!isQuotaError(e)) return { ok: false, evicted: 0 }
  }

  // 熔断：副本上做清洗，避免污染调用方持有的 state
  const working: ReviewStore = { ...store }
  let evicted = 0
  for (let round = 1; round <= QUOTA_ROUNDS; round++) {
    const entries = Object.entries(working)
    // 清洗数量：至少 1 条；排除本轮正在写入的词条以外按 intervalIdx 降序丢
    const victims = entries
      .sort((a, b) => (b[1]?.intervalIdx ?? 0) - (a[1]?.intervalIdx ?? 0))
      .slice(0, Math.max(1, Math.ceil(entries.length / 4)))
    for (const [k] of victims) delete working[k]
    evicted += victims.length
    console.warn(
      `[reviewStore] localStorage 配额不足，熔断清洗第 ${round} 轮：清理 ${victims.length} 条接近毕业的错题（累计 ${evicted}）`,
    )
    try {
      localStorage.setItem(KEY, JSON.stringify(working))
      return { ok: true, evicted }
    } catch (e) {
      if (!isQuotaError(e)) return { ok: false, evicted }
    }
  }
  console.warn(`[reviewStore] 熔断清洗 ${QUOTA_ROUNDS} 轮后仍写入失败，本轮变更仅保留在内存`)
  return { ok: false, evicted }
}

/** ±10% 抖动：错峰到期，避免同批词同刻集中复习（雪崩） */
function jitter(intervalDays: number): number {
  return intervalDays * DAY * (1 + (Math.random() * 0.2 - 0.1))
}

/** 记一次错：wrongCount+1、correctStreak 清零、间隔归 0，明天（±10% 抖动）到期 */
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
      nextReviewAt: now + jitter(INTERVALS_DAYS[0]),
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
      nextReviewAt: now + jitter(INTERVALS_DAYS[nextIdx]),
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
