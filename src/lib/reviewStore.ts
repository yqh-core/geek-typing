/**
 * 词级错题本 + 艾宾浩斯复习调度。
 *
 * ⚠️ P1.5-S4 存储模式状态机（`isV2Store()` 派发，见 `learning/upgrade.ts` 文件头）：
 *   State A（迁移未落地且有 v1 数据）→ 'gt.review.v1'（升级前行为，下方 v1 段逐字保留）
 *   State B（迁移已落地，或无 v1 数据）→ 'gt.learning.v2' 的 review 子记录
 *
 * State B 语义（设计文档 P1.5-LEARNING-MODEL §1.5）：主键从「裸词」变为
 * 「ContentId = (词, 包) 对」—— 同一个词在 IELTS / 考研是两条独立进度；旧模型下
 * 两包共享一个 key 互相覆盖的「进度污染」被结构性消灭。公开写入 API 因此带
 * ctx（LearningSourceCtx）标明归属；ctx 缺失时按 C4「不猜」拒绝写入并留痕
 * （所有真实调用点都带 ctx，这里只防未来调用漂移）。
 *
 * 间隔表 [1, 2, 4, 7, 15]（天）：敲错 → 归 0 明天到期；复习对 → +1 档；
 * 走完最后一档再对 → 毕业（State B = 摘除 review 子记录，memorize/analytics 不动）。
 * 排期 ±10% 抖动抗雪崩；Quota 熔断参数与 learning/storage.ts 同源。
 */

import { legacyStoreChannel } from '../core/persistence/channels'
import { getRecord, loadLearningV2, saveLearningV2 } from './learning/storage'
import { isLearningRecord, isLegacyKey, type LearningRecord } from './learning/types'
import { isV2Store } from './learning/upgrade'
import {
  packageInfoOfNamespace,
  wordContentId,
  wordOfContentId,
  type LearningSourceCtx,
} from './learning/attribute'

/* ============================================================
 * v1 段（State A：升级前行为）
 * ============================================================ */

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

/** 读取错题表（JSON 损坏 / 隐私模式返回空表）—— v1 路径；State B 由 gt.learning.v2 接管 */
export function loadReview(): ReviewStore {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（learning 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const raw = legacyStoreChannel.read(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as ReviewStore
  } catch (e) {
    // G4-3 零静默失败：读取失败（JSON 损坏）按空表处理但留痕 ——
    // 错题表损坏静默归零 = 用户的错题记录无声丢失。P1.5-S4 已收编进 gt.learning.v2（State B），
    // 本路径仅在迁移未落地时存活。
    console.warn('[reviewStore] 读取失败，按空表处理', e)
    return {}
  }
}

/** save 结果：ok=false 表示熔断后仍写不进去（数据只留在内存，下次操作会重试） */
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
 * QuotaExceeded 熔断写入（v1 路径）：
 * 按 intervalIdx 从高到低清洗（优先丢接近毕业的低风险条目），每轮清 1/4，最多 3 轮。
 * **本轮正在写入的词（protectedKey）永不清洗**。全失败返回 { ok: false } 不抛出。
 */
function saveV1(store: ReviewStore, protectedKey?: string): SaveResult {
  const json = JSON.stringify(store)
  try {
    legacyStoreChannel.write(KEY, json)
    return { ok: true, evicted: 0 }
  } catch (e) {
    if (!isQuotaError(e)) return { ok: false, evicted: 0 }
  }

  // 熔断：副本上做清洗，避免污染调用方持有的 state
  const working: ReviewStore = { ...store }
  let evicted = 0
  for (let round = 1; round <= QUOTA_ROUNDS; round++) {
    const entries = Object.entries(working)
    // 清洗数量：至少 1 条；**排除本轮正在写入的词条（protectedKey）**后按 intervalIdx 降序丢。
    // entries 极少时 Math.ceil(len/4) 会切到 protectedKey 所在区间，故过滤必须先于排序/切片。
    const candidates = protectedKey ? entries.filter(([k]) => k !== protectedKey) : entries
    const victims = candidates
      .sort((a, b) => (b[1]?.intervalIdx ?? 0) - (a[1]?.intervalIdx ?? 0))
      .slice(0, Math.max(1, Math.ceil(entries.length / 4)))
    // 候选被清空（只剩 protectedKey，或已无任何条目）：再清也腾不出空间，直接放弃
    if (!victims.length) break
    for (const [k] of victims) delete working[k]
    evicted += victims.length
    console.warn(
      `[reviewStore] 存储配额不足，熔断清洗第 ${round} 轮：清理 ${victims.length} 条接近毕业的错题（累计 ${evicted}）`,
    )
    try {
      legacyStoreChannel.write(KEY, JSON.stringify(working))
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

/** 记一次错（v1）：wrongCount+1、correctStreak 清零、间隔归 0，明天（±10% 抖动）到期 */
function recordWrongV1(word: string): void {
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
  saveV1(next, word)
}

/** 记一次对（v1，仅对复习中的词生效）：间隔推进一档；走完间隔表则毕业移除 */
function recordCorrectV1(word: string): void {
  const store = loadReview()
  const prev = store[word]
  if (!prev) return
  const nextIdx = prev.intervalIdx + 1
  if (nextIdx >= INTERVALS_DAYS.length) {
    // 毕业：从错题本移除（本轮写入的目标就是「移除」，故不保护 word，允许它被一并清洗）
    const rest: ReviewStore = {}
    for (const [k, v] of Object.entries(store)) {
      if (k !== word) rest[k] = v
    }
    saveV1(rest)
    return
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
  saveV1(next, word)
}

/** 已到期、且仍存在于有效词集合中的词（v1 路径；S4 后 UI 一律走 reviewItemViews） */
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

/** 统计（v1 路径）：错题总数 / 今日到期数 */
export function reviewStats(now = Date.now()): ReviewStats {
  const store = loadReview()
  let due = 0
  for (const e of Object.values(store)) {
    if (e?.nextReviewAt <= now) due++
  }
  return { total: Object.keys(store).length, due }
}

/* ============================================================
 * P1.5-S4 · State B（gt.learning.v2）
 * ============================================================ */

export interface ReviewItemView {
  /** State B = 精确 ContentId；State A 视图 = ''（词表时代没有包归属） */
  contentId: string
  /** 展示词形（localId 原词形） */
  word: string
  /** State B = 包 namespace；State A = '' */
  namespace: string
  entry: ReviewEntry
}

/** State B：全量复习条目（(词,包) 对）。legacy:* 天然不含 review 判定路径之外的语义，
 *  这里只取正式记录 —— 未归属分区由 insights.masteryDistributionV2 / dueWordsV2 单独展示。 */
function reviewEntriesV2(): ReviewItemView[] {
  const out: ReviewItemView[] = []
  for (const [contentId, entry] of Object.entries(loadLearningV2())) {
    if (isLegacyKey(contentId) || !isLearningRecord(entry) || !entry.review) continue
    const w = wordOfContentId(contentId)
    if (!w) continue
    out.push({ contentId, word: w.word, namespace: w.namespace, entry: entry.review })
  }
  return out
}

function resolveContentId(word: string, ctx?: LearningSourceCtx): string | null {
  if (ctx?.contentId) return ctx.contentId
  if (ctx?.bankId) return wordContentId(ctx.bankId, word)
  return null
}

/** 写入时补版本三元组（§1.4 freshness 判定依据）；namespace 对不上内置包（自建库）则省略 */
function stampVersion(record: LearningRecord, contentId: string): void {
  const ns = wordOfContentId(contentId)?.namespace
  const info = ns ? packageInfoOfNamespace(ns) : null
  if (info) {
    record.contentVersion = info.contentVersion
    record.contentChecksum = info.contentChecksum
  }
}

/* ---------------- 对外 API（两态派发） ---------------- */

/** 全量复习条目视图。State B = (词,包) 对；State A = 词表（contentId/namespace 为空串） */
export function reviewItemViews(): ReviewItemView[] {
  if (!isV2Store()) {
    const store = loadReview()
    return Object.entries(store)
      .filter(([, e]) => !!e)
      .map(([word, entry]) => ({ contentId: '', word, namespace: '', entry: entry as ReviewEntry }))
  }
  return reviewEntriesV2()
}

/** 今日到期条目视图（State A/B 双态；State B 含 contentId —— 复习轮精确归属的数据源） */
export function reviewDueViews(now = Date.now()): ReviewItemView[] {
  return reviewItemViews().filter((i) => i.entry.nextReviewAt <= now)
}

/** 今日到期条数（与旧 dueWords().length 同口径；legacy:* 不计入 —— 设计 §5.5） */
export function reviewDueCount(now = Date.now()): number {
  return reviewDueViews(now).length
}

/** 复习条目总数。State B 语义 = (词,包) 对数（§1.5：同词多包各算一条） */
export function reviewTotalCount(): number {
  return reviewItemViews().length
}

/** 该 (词, 归属) 是否在复习中 */
export function hasReviewRecord(word: string, ctx?: LearningSourceCtx): boolean {
  if (!isV2Store()) return !!loadReview()[word]
  const cid = resolveContentId(word, ctx)
  if (!cid) {
    console.warn('[reviewStore] hasReviewRecord 缺少归属上下文，按不存在处理（C4 不猜）', word)
    return false
  }
  return !!getRecord(cid)?.review
}

/** 记一次错：wrongCount+1、correctStreak 清零、间隔归 0，明天（±10% 抖动）到期 */
export function recordWrong(word: string, ctx?: LearningSourceCtx): void {
  if (!isV2Store()) {
    recordWrongV1(word)
    return
  }
  const cid = resolveContentId(word, ctx)
  if (!cid) {
    console.warn('[reviewStore] recordWrong 缺少归属上下文，拒绝写入（C4 不猜）', word)
    return
  }
  const store = loadLearningV2()
  const existing = store[cid]
  const prev = existing && isLearningRecord(existing) ? existing.review : undefined
  const now = Date.now()
  const record: LearningRecord = {
    ...(existing && isLearningRecord(existing) ? existing : {}),
    contentId: cid,
    review: {
      wrongCount: (prev?.wrongCount ?? 0) + 1,
      correctStreak: 0,
      lastWrongAt: now,
      nextReviewAt: now + jitter(INTERVALS_DAYS[0]),
      intervalIdx: 0,
    },
  }
  stampVersion(record, cid)
  store[cid] = record
  const r = saveLearningV2(store, cid)
  if (!r.ok) console.warn('[reviewStore] recordWrong 落盘失败（reason=' + r.reason + '）')
}

/** 记一次对（仅对复习中的词生效）：间隔推进一档；走完间隔表则毕业（摘除 review 子记录，
 *  memorize/analytics 子记录保留；三类子记录全空时整条记录移除） */
export function recordCorrect(word: string, ctx?: LearningSourceCtx): void {
  if (!isV2Store()) {
    recordCorrectV1(word)
    return
  }
  const cid = resolveContentId(word, ctx)
  if (!cid) {
    console.warn('[reviewStore] recordCorrect 缺少归属上下文，拒绝写入（C4 不猜）', word)
    return
  }
  const store = loadLearningV2()
  const existing = store[cid]
  if (!existing || !isLearningRecord(existing) || !existing.review) return
  const nextIdx = existing.review.intervalIdx + 1
  if (nextIdx >= INTERVALS_DAYS.length) {
    // 毕业：摘除 review 子记录；空壳记录整个移除
    const rest: LearningRecord = { ...existing }
    delete rest.review
    if (rest.memorize === undefined && rest.analytics === undefined) delete store[cid]
    else store[cid] = rest
  } else {
    const now = Date.now()
    const record: LearningRecord = {
      ...existing,
      review: {
        ...existing.review,
        correctStreak: existing.review.correctStreak + 1,
        intervalIdx: nextIdx,
        nextReviewAt: now + jitter(INTERVALS_DAYS[nextIdx]),
      },
    }
    stampVersion(record, cid)
    store[cid] = record
  }
  const r = saveLearningV2(store, cid)
  if (!r.ok) console.warn('[reviewStore] recordCorrect 落盘失败（reason=' + r.reason + '）')
}
