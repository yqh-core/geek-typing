/**
 * 学习分析：记录每个字母的正确/错误次数、每个单词的掌握情况。
 * 数据落在本机存储（P1.7-W2C 起经 analytics 通道读写），纯前端；用于「错词分析面板」和「弱项专攻」出题。
 */

import { analyticsChannel } from '../core/persistence/channels'
import {
  loadLearningV2,
  loadLetterStats,
  loadTotals,
  saveLearningV2,
  saveLetterStats,
  saveTotals,
} from './learning/storage'
import {
  isLearningRecord,
  isLegacyKey,
  isLegacyRecord,
  type LearningRecord,
  type LearningStoreV2,
} from './learning/types'
import { isV2Store } from './learning/upgrade'
import {
  packageInfoOfNamespace,
  wordContentId,
  wordOfContentId,
  type LearningSourceCtx,
} from './learning/attribute'

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
  // P1.5-S4：State B（迁移已落地 / 无历史数据）从 v2 键族聚合；State A 保持 v1 读法
  if (isV2Store()) return loadAnalyticsV2()
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（analytics 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const raw = analyticsChannel.read(KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Analytics) } : EMPTY
  } catch (e) {
    // G4-3 零静默失败：读取失败（JSON 损坏 / 存储不可用）按空表处理，但必须留痕 ——
    // 静默丢弃意味着用户数据丢了却无从追查。P1.5-S4 State B 已并入 v2 键族，
    // 本路径仅在迁移未落地时存活。
    console.warn('[analytics] 读取失败，按空表处理', e)
    return EMPTY
  }
}

/** State B 聚合视图（P1.5-S4 拆分的读侧）：letters ← gt.letterStats.v1；四个全局标量
 *  ← gt.totals.v1；words ← gt.learning.v2（正式记录按 localId 归并跨包同名 + legacy
 *  占位按 word）。跨包同名在此**求和**是刻意的：Analytics 是「词级总账」视图，
 *  (词,包) 明细保留在 v2 表里，词级写路径（recordWordDoneV2）按明细精确落盘。 */
function loadAnalyticsV2(): Analytics {
  const words: Record<string, WordStat> = {}
  const store: LearningStoreV2 = loadLearningV2()
  for (const [key, entry] of Object.entries(store)) {
    let word: string | null = null
    let stat: { done: number; wrong: number } | undefined
    if (isLegacyKey(key)) {
      if (isLegacyRecord(entry)) {
        word = entry.word
        stat = entry.analytics
      }
    } else if (isLearningRecord(entry)) {
      word = wordOfContentId(key)?.word ?? null
      stat = entry.analytics
    }
    if (!word || !stat) continue
    const prev = words[word] ?? { done: 0, wrong: 0 }
    words[word] = { done: prev.done + stat.done, wrong: prev.wrong + stat.wrong }
  }
  return { letters: { ...loadLetterStats().letters }, words, ...loadTotals() }
}

export function saveAnalytics(a: Analytics) {
  // P1.5-S4：State B 只落 letters + 四个全局标量；words 的持久化在 recordWordDoneV2
  // （按 (词,包) 精确写 gt.learning.v2），词级总账不再整表序列化
  if (isV2Store()) {
    const rLetters = saveLetterStats({ letters: a.letters })
    const rTotals = saveTotals({
      totalKeys: a.totalKeys,
      totalCorrect: a.totalCorrect,
      totalWords: a.totalWords,
      bestWpm: a.bestWpm,
    })
    if (!rLetters.ok || !rTotals.ok) {
      console.warn(
        `[analytics] v2 持久化失败（letters ok=${rLetters.ok}, totals ok=${rTotals.ok}），本次变更仅保留在内存`,
      )
    }
    return
  }
  try {
    analyticsChannel.write(KEY, JSON.stringify(a))
  } catch (e) {
    // G4-3 零静默失败：隐私模式 / 配额不足的写入失败必须可观测
    console.warn('[analytics] 写入失败，本次变更仅保留在内存', e)
  }
}

export function resetAnalytics(): Analytics {
  if (isV2Store()) {
    // State B：letters/totals 归零 + 从 v2 记录上摘除 analytics 子记录。
    // 语义边界与旧版一致：只清学习分析，不动 review / memorize。
    const store = loadLearningV2()
    for (const [k, e] of Object.entries(store)) {
      if (isLearningRecord(e) && e.analytics) {
        const next: LearningRecord = { ...e }
        delete next.analytics
        store[k] = next
      }
    }
    saveLearningV2(store)
    saveLetterStats({ letters: {} })
    saveTotals({ totalKeys: 0, totalCorrect: 0, totalWords: 0, bestWpm: 0 })
    return EMPTY
  }
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

/**
 * P1.5-S1（G1-3）读取兼容：V1 历史 words 键是 lowercase（旧 recordWordDone 行为），
 * 新写入一律用**原词形**。读取时先查原词形、miss 才查 lowercase（只读，不回写）。
 * 历史 lowercase 键会在下次完成同词时被 absorbLegacyWordKey 并入原词形键后删除（写入时迁移）。
 */
export function wordStatOf(a: Analytics, word: string): WordStat {
  const hit = a.words[word]
  if (hit) return hit
  const lower = word.toLowerCase()
  return (lower !== word ? a.words[lower] : undefined) ?? { done: 0, wrong: 0 }
}

/**
 * P1.5-S1（G1-3）写入时迁移：同词的历史 lowercase 键计数并入原词形键后删除 lowercase 键。
 * 这里出现 `word.toLowerCase()` 是【读取历史数据】的兼容，不是身份键构造 —— G1-5 白名单单列。
 */
function absorbLegacyWordKey(words: Record<string, WordStat>, word: string): Record<string, WordStat> {
  const legacyKey = word.toLowerCase()
  if (legacyKey === word) return words
  const legacy = words[legacyKey]
  if (!legacy) return words
  const prev = words[word] ?? { done: 0, wrong: 0 }
  const next = { ...words }
  delete next[legacyKey]
  next[word] = { done: prev.done + legacy.done, wrong: prev.wrong + legacy.wrong }
  return next
}

/** 记录一个单词完成（P1.5-S1：身份键由 lowercase 改为原词形，与 review/memorize 同口径）
 *
 * P1.5-S4 起本函数只更新**内存聚合视图**；State B 的持久化由 recordWordDoneV2
 * 按 (词,包) 精确落 gt.learning.v2 —— 两者必须成对调用（App 的词完成打点处）。 */
export function recordWordDone(a: Analytics, word: string, perfect: boolean, wpm: number): Analytics {
  const merged = absorbLegacyWordKey(a.words, word)
  const prev = merged[word] ?? { done: 0, wrong: 0 }
  return {
    ...a,
    words: { ...merged, [word]: { done: prev.done + 1, wrong: prev.wrong + (perfect ? 0 : 1) } },
    totalWords: a.totalWords + 1,
    bestWpm: Math.max(a.bestWpm, wpm),
  }
}

/**
 * P1.5-S4 · State B 的词级打点落盘：按 (词, 包) 精确写入 gt.learning.v2 的 analytics 子记录。
 * 与 recordWordDone（内存聚合视图）成对调用 —— 聚合视图给 UI，本函数给存储；
 * 下次 loadAnalyticsV2 重建时两边自然对账。State A 为 no-op（v1 路径由 saveAnalytics 整表落盘）。
 */
export function recordWordDoneV2(word: string, perfect: boolean, ctx: LearningSourceCtx): void {
  if (!isV2Store()) return
  const contentId = ctx.contentId ?? (ctx.bankId ? wordContentId(ctx.bankId, word) : null)
  if (!contentId) {
    // C4「不猜」：归属不明宁可丢一条打点并留痕，也不编一个键（真实调用点都带 ctx，这里防漂移）
    console.warn('[analytics] 归属上下文缺失，跳过本次词级打点', word)
    return
  }
  const store = loadLearningV2()
  const existing = store[contentId]
  const prev = existing && isLearningRecord(existing) ? existing.analytics : undefined
  const record: LearningRecord = {
    ...(existing && isLearningRecord(existing) ? existing : {}),
    contentId,
    analytics: {
      done: (prev?.done ?? 0) + 1,
      wrong: (prev?.wrong ?? 0) + (perfect ? 0 : 1),
    },
  }
  // 版本三元组（§1.4 freshness 判定依据）：namespace 对得上内置包才写，写不出就省略
  const info = packageInfoOfNamespace(wordOfContentId(contentId)?.namespace ?? '')
  if (info) {
    record.contentVersion = info.contentVersion
    record.contentChecksum = info.contentChecksum
  }
  store[contentId] = record
  const r = saveLearningV2(store, contentId)
  if (!r.ok) console.warn('[analytics] 词级打点落盘失败（reason=' + r.reason + '）')
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
