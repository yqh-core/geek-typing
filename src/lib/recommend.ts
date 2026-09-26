/**
 * Today's Practice 推荐（V3-P0a）：聚合错题本 / 学习分析 / 打卡数据，生成首页推荐快照。
 * 纯读取 localStorage 派生、无副作用；调用方在 reviewVersion 变化（及切回页签）时重建。
 */
import { loadAnalytics, weakLetters, wrongWords } from './analytics'
import { dueWords } from './reviewStore'
import { DAILY_GOAL, getStreakDays, getTodayCount, loadHistory } from './streak'

export interface TodayRecommendation {
  /** 今日到期错词数 */
  dueCount: number
  /** 到期词预览（最多 5 个） */
  dueTopWords: string[]
  /** 错得最多的词（最多 3 个） */
  weakWords: { word: string; wrong: number }[]
  /** 错误率最高的字母（最多 3 个） */
  weakLetters: { letter: string; rate: number }[]
  /** 今日已完成词数 */
  todayCount: number
  /** 每日目标词数 */
  goal: number
  /** 连续打卡天数 */
  streakDays: number
}

export function buildRecommendation(): TodayRecommendation {
  const analytics = loadAnalytics()
  const history = loadHistory()
  const due = dueWords()
  return {
    dueCount: due.length,
    dueTopWords: due.slice(0, 5),
    weakWords: wrongWords(analytics, 3).map((w) => ({ word: w.word, wrong: w.wrong })),
    weakLetters: weakLetters(analytics, 3).map((w) => ({ letter: w.letter, rate: w.rate })),
    todayCount: getTodayCount(history),
    goal: DAILY_GOAL,
    streakDays: getStreakDays(history),
  }
}
