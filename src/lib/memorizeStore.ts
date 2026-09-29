/**
 * 背单词进度持久化。
 *
 * ⚠️ P1.5-S4 存储模式状态机（同 `reviewStore.ts` 文件头）：
 *   State A（迁移未落地且有 v1 数据）→ 'gt.memorize.v1'（升级前行为）
 *   State B（迁移已落地，或无 v1 数据）→ 'gt.learning.v2' 的 memorize 子记录，主键 (词, 包)
 *
 * memorizeView(bankId) 返回**本包视图**（Record<word, MemRecord>）：跨包同名互不可见 ——
 * 旧模型全局一张表按词撞键导致的「A 库标记认识、B 库也算认识」进度污染被结构性消灭。
 *
 * ⚠️ API 变更（S4）：recordMemorize 从 `(store, word, status)` 改为
 * `(word, status, bankId?)` —— 状态自持从「调用方持有全表」改为「存储层按归属读写」，
 * 调用方只拿回自己包的视图。
 */

import { legacyStoreChannel } from '../core/persistence/channels'
import { loadLearningV2, saveLearningV2 } from './learning/storage'
import { isLearningRecord, isLegacyKey, type LearningRecord } from './learning/types'
import { isV2Store } from './learning/upgrade'
import {
  learningNamespaceOf,
  packageInfoOfNamespace,
  wordContentId,
  wordOfContentId,
} from './learning/attribute'

export type MemStatus = 'known' | 'fuzzy' | 'unknown'

export interface MemRecord {
  status: MemStatus
  reviews: number
  lastAt: number
}

export type MemStore = Record<string, MemRecord>

const KEY = 'gt.memorize.v1'

/** v1 全表读取（State A 路径；损坏/隐私模式返回空表） */
export function loadMemorize(): MemStore {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（learning 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const raw = legacyStoreChannel.read(KEY)
    return raw ? (JSON.parse(raw) as MemStore) : {}
  } catch (e) {
    // G4-3 零静默失败：读取失败按空表处理但留痕（State B 由 learning/storage 的
    // codec + diag 接管；本路径仅在迁移未落地时存活）
    console.warn('[memorizeStore] 读取失败，按空表处理', e)
    return {}
  }
}

/** 进度视图：State B = 指定包的 (词 → MemRecord)（bankId 缺省 = 全部正式记录）；
 *  State A = v1 全表（升级前行为，bankId 忽略） */
export function memorizeView(bankId?: string): MemStore {
  if (!isV2Store()) return loadMemorize()
  const ns = bankId ? learningNamespaceOf(bankId) : null
  const view: MemStore = {}
  for (const [contentId, entry] of Object.entries(loadLearningV2())) {
    if (isLegacyKey(contentId) || !isLearningRecord(entry) || !entry.memorize) continue
    const w = wordOfContentId(contentId)
    if (!w) continue
    if (ns && w.namespace !== ns) continue
    view[w.word] = entry.memorize
  }
  return view
}

/** 记录一次作答：reviews+1、更新状态与时间戳；返回调用方应持有的新视图。
 *  State A：全表读写（升级前行为，bankId 忽略）；State B：按 (词,包) 精确落盘。 */
export function recordMemorize(word: string, status: MemStatus, bankId?: string): MemStore {
  if (!isV2Store()) {
    const store = loadMemorize()
    const prev = store[word]
    const next: MemStore = {
      ...store,
      [word]: { status, reviews: (prev?.reviews ?? 0) + 1, lastAt: Date.now() },
    }
    try {
      legacyStoreChannel.write(KEY, JSON.stringify(next))
    } catch (e) {
      // G4-3 零静默失败：隐私模式 / 配额不足的写入失败必须可观测（State B 由 saveLearningV2 接管）
      console.warn('[memorizeStore] 写入失败，本次变更仅保留在内存', e)
    }
    return next
  }
  if (!bankId) {
    // C4「不猜」：归属不明宁可丢一次打点并留痕（所有真实调用点都传 bankId）
    console.warn('[memorizeStore] recordMemorize 缺少 bankId，拒绝写入（C4 不猜）', word)
    return memorizeView()
  }
  const contentId = wordContentId(bankId, word)
  const store = loadLearningV2()
  const existing = store[contentId]
  const prev = existing && isLearningRecord(existing) ? existing.memorize : undefined
  const record: LearningRecord = {
    ...(existing && isLearningRecord(existing) ? existing : {}),
    contentId,
    memorize: { status, reviews: (prev?.reviews ?? 0) + 1, lastAt: Date.now() },
  }
  // 版本三元组（§1.4 freshness）：内置包才写得出，自建库省略（freshness=unknown，诚实）
  const info = packageInfoOfNamespace(learningNamespaceOf(bankId))
  if (info) {
    record.contentVersion = info.contentVersion
    record.contentChecksum = info.contentChecksum
  }
  store[contentId] = record
  const r = saveLearningV2(store, contentId)
  if (!r.ok) {
    console.warn('[memorizeStore] 落盘失败（reason=' + r.reason + '）')
    // 「内存态兜底」与 v1 路径同语义（e2e 13.4 行为锁）：写失败时返回值仍带上本次
    // 记录，UI 照常推进；下次作答会重试落盘。
    const m = record.memorize
    return m ? { ...memorizeView(bankId), [word]: m } : memorizeView(bankId)
  }
  return memorizeView(bankId)
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

/** 统计：今日新学 / 复习 / 本库已掌握（入参为 memorizeView 的返回值） */
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
