/**
 * 每日打卡 / 学习热力图数据
 * 全部落在 localStorage，纯前端零后端；后续想同步可以平滑迁移到 Cloudflare D1。
 */

const KEY = 'gt.streak.v1'

/** 每日目标词数 */
export const DAILY_GOAL = 50

export interface DayRecord {
  date: string // YYYY-MM-DD
  words: number
  seconds: number
}

export type History = Record<string, DayRecord>

function todayKey(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function loadHistory(): History {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as History) : {}
  } catch {
    return {}
  }
}

function saveHistory(h: History) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h))
  } catch {
    /* 忽略隐私模式写入失败 */
  }
}

/** 记录一次"打完一个单词" */
export function recordWord(): History {
  const h = loadHistory()
  const key = todayKey()
  const cur = h[key] ?? { date: key, words: 0, seconds: 0 }
  h[key] = { ...cur, words: cur.words + 1 }
  saveHistory(h)
  return h
}

/** 记录一轮耗时（秒） */
export function recordSeconds(seconds: number): History {
  const h = loadHistory()
  const key = todayKey()
  const cur = h[key] ?? { date: key, words: 0, seconds: 0 }
  h[key] = { ...cur, seconds: cur.seconds + seconds }
  saveHistory(h)
  return h
}

export function getTodayCount(h: History): number {
  return h[todayKey()]?.words ?? 0
}

/** 连续打卡天数（含今天；今天没练则从昨天往前数） */
export function getStreakDays(h: History): number {
  const pad = (n: number) => String(n).padStart(2, '0')
  const cursor = new Date()
  let days = 0
  for (let i = 0; i < 400; i++) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    if (h[key] && h[key].words > 0) {
      days += 1
    } else if (i > 0) {
      break
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

/** 最近 14 天的数据，用于热力图 */
export function getRecentDays(h: History, days = 14): DayRecord[] {
  const pad = (n: number) => String(n).padStart(2, '0')
  const list: DayRecord[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    list.push(h[key] ?? { date: key, words: 0, seconds: 0 })
  }
  return list
}
