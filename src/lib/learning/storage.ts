/* V4.1-P1.5 · Learning v2 持久化层
 *
 * 设计依据：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md` §3。
 * 本文件只负责「三个新键 + 迁移标记键」的读写，**不做任何业务逻辑**。
 *
 * 三个必须统一的策略（§3.4）：
 *  1. **不静默 catch** —— 所有写操作返回 `SaveResult { ok, evicted }`，让失败可被观测。
 *     对照：`analytics.ts:48` / `memorizeStore.ts:37` / `streak.ts:38` 的旧写法是
 *     捕获异常后什么都不做（注释写着「忽略」），出了问题没有任何痕迹。
 *  2. **Quota 熔断** —— 复用 `reviewStore.ts` 已独立复核过的算法
 *     （victims 先过滤 protectedKey 再排序切片；候选为空则 break）。
 *  3. **损坏数据可观测** —— JSON 损坏 / 非对象 / 是数组一律返回空表并 console.warn，
 *     不静默返回 {}。
 *
 * G4-3② 接线说明：上述所有失败路径**同时**走 `diagnostics.ts` 的
 * `reportDiag()`（ring buffer）与 `emitSaveFailure()`（全局订阅）——
 * 「失败可观测」不只是 console.warn，还要可编程消费。这也是 codec.ts /
 * diagnostics.ts 从死代码变为真实依赖的那一步。
 */

import type {
  GlobalTotals,
  LearningEntry,
  LearningRecord,
  LearningStoreV2,
  LegacyRecord,
  LetterStats,
  MigrationMarker,
  RollbackToken,
} from './types'
import { isLearningRecord, isLegacyKey, isLegacyRecord } from './types'
import { mapCodec } from './codec'
import { reportDiag, emitSaveFailure, errorNameOf, isQuotaError, checkQuotaPressure } from './diagnostics'
// P1.7-W2B：原生存储读写收口到 persistence 层 Repository（namespace 注册校验 + owner 域匹配）。
// 只走 getRaw/setRaw，写入字节与改造前完全一致，配额熔断 / 损坏告警 / diag 逻辑零改动。
import { readKeyRaw, writeKeyRaw, removeKeyRaw } from '../../core/learning/storage-io'

export const KEY_LEARNING_V2 = 'gt.learning.v2'
export const KEY_LETTER_STATS = 'gt.letterStats.v1'
export const KEY_TOTALS = 'gt.totals.v1'
export const KEY_MIGRATION = 'gt.migration.v1'
export const KEY_BACKUP = 'gt.learning.v2.backup'

/** 迁移源键族（参与 v1→v2 迁移的四个源键）。
 *  ⚠️ 归属说明：迁移执行器（upgrade.ts）要在**同步**路径上判断「是否需要迁移」
 *  （hasLegacyV1Data），而 upgrade.ts 一旦静态 import migrate.ts，migrate.ts 的
 *  16.2 KiB 就会整块进主 chunk。因此本常量落在 storage.ts（upgrade.ts 本来就静态
 *  依赖它）而非 migrate.ts —— 键常量的唯一事实源不变，migrate.ts 仍 re-export 本名，
 *  外部（tests/learning-storage.mjs 的 M('IN_SCOPE_KEYS')）取用方式不变。
 *  同序同源勿增勿删：migrate.ts §2.7 的 IN_SCOPE_KEYS 使用点依赖这个顺序。 */
export const IN_SCOPE_KEYS = ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1'] as const

/** 写结果：ok=false 表示熔断后仍写不进去（数据只留在内存，下次操作会重试） */
export interface SaveResult {
  ok: boolean
  /** Quota 熔断时被清洗掉的条目数（可观测性用） */
  evicted: number
  /** 失败原因分类，便于 diagnostics 归集 */
  reason?: 'quota' | 'unavailable' | 'serialize'
}

/** Quota 熔断参数：每轮清 1/4、最多 3 轮（§3.4 第 2 条，与 reviewStore 同参） */
const QUOTA_ROUNDS = 3

/**
 * 写失败的上报收敛点（G4-3②）。
 * console.warn 给人看，reportDiag / emitSaveFailure 给程序看 —— 三者必须同时发生，
 * 缺任何一路都算「半静默」。
 */
function failWrite(key: string, result: SaveResult, e: unknown): SaveResult {
  console.warn(
    `[learning/storage] ${key} 写入失败（reason=${result.reason ?? 'other'}，evicted=${result.evicted}），本轮变更仅保留在内存`,
    e,
  )
  reportDiag({ code: 'STORAGE_WRITE_FAILED', key, errorName: errorNameOf(e) })
  emitSaveFailure(key, { ok: result.ok, evicted: result.evicted, reason: result.reason ?? 'other', error: e })
  return result
}

/* ---------------- 通用读写原语 ---------------- */

/**
 * 读取并反序列化。
 *
 * ⚠️ 为什么必须区分「键不存在」与「值损坏」：两者都返回默认值，但**只有后者需要告警**。
 *    键不存在是正常的首次启动；值损坏意味着用户丢了数据（或别处写坏了），必须留痕。
 */
function readRaw<T>(key: string, fallback: T, guard: (v: unknown) => v is T): { value: T; corrupted: boolean } {
  let raw: string | null
  try {
    raw = readKeyRaw(key) // P1.7-W2B：经 persistence Repository（namespace 校验 + owner 域匹配）
  } catch {
    // 隐私模式 / 存储不可用 —— 这是**环境不支持**，不是数据损坏
    return { value: fallback, corrupted: false }
  }
  if (raw === null) return { value: fallback, corrupted: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!guard(parsed)) {
      console.warn(`[learning/storage] ${key} 结构非法，已按空表处理（原值被丢弃）`)
      reportDiag({ code: 'STORAGE_READ_CORRUPT', key })
      return { value: fallback, corrupted: true }
    }
    return { value: parsed, corrupted: false }
  } catch {
    console.warn(`[learning/storage] ${key} JSON 解析失败，已按空表处理（原值被丢弃）`)
    reportDiag({ code: 'STORAGE_READ_CORRUPT', key })
    return { value: fallback, corrupted: true }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/* ---------------- LearningStoreV2 ---------------- */

/**
 * 单条条目的合法性判据（G4-5 的「合法项保留、非法项丢弃」就发生在这里）：
 *  - 正式记录：`contentId` 是 string（types.ts isLearningRecord 同口径）
 *  - legacy 占位：`word` 是 string（LegacyRecord 的最小必要字段）
 * 两者都不是的条目 = 损坏 / 外来写入的垃圾，丢弃 + diag。
 */
function isValidEntry(v: unknown): v is LearningEntry {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return typeof o.contentId === 'string' || typeof o.word === 'string'
}

const learningStoreCodec = mapCodec<LearningEntry>(isValidEntry, (droppedKeys) => {
  reportDiag({ code: 'STORAGE_ENTRY_DROPPED', key: KEY_LEARNING_V2, count: droppedKeys.length })
  console.warn(`[learning/storage] ${KEY_LEARNING_V2} 丢弃 ${droppedKeys.length} 条非法条目：${droppedKeys.join(', ')}`)
})

export function loadLearningV2(): LearningStoreV2 {
  let raw: string | null
  try {
    raw = readKeyRaw(KEY_LEARNING_V2)
  } catch {
    // 隐私模式 / 存储不可用 —— 环境问题，不是数据损坏：返回空表、**不打 diag**
    return {}
  }
  if (raw === null) return {}
  const decoded = learningStoreCodec.decode(raw)
  if (decoded === null) {
    // 整表非法（数组 / 标量 / 坏 JSON）：mapCodec 返回 null
    console.warn(`[learning/storage] ${KEY_LEARNING_V2} 整表非法，已按空表处理（原值被丢弃）`)
    reportDiag({ code: 'STORAGE_READ_CORRUPT', key: KEY_LEARNING_V2 })
    return {}
  }
  return decoded as LearningStoreV2
}

/**
 * QuotaExceeded 熔断写入（复用 reviewStore 的已验证算法）。
 *
 * @param protectedKey 本轮正在写入的键 —— **永不清洗**。它是刚答错/刚复习的词，
 *   丢了就是本轮变更静默消失。这是 §9.2 已复核过的修复，此处等价实现。
 */
export function saveLearningV2(store: LearningStoreV2, protectedKey?: string): SaveResult {
  const json = JSON.stringify(store)
  try {
    writeKeyRaw(KEY_LEARNING_V2, json)
    checkQuotaPressure()
    return { ok: true, evicted: 0 }
  } catch (e) {
    if (!isQuotaError(e)) return failWrite(KEY_LEARNING_V2, { ok: false, evicted: 0, reason: 'unavailable' }, e)
  }

  // 熔断：副本上做清洗，避免污染调用方持有的 state
  const working: LearningStoreV2 = { ...store }
  let evicted = 0
  for (let round = 1; round <= QUOTA_ROUNDS; round++) {
    const entries = Object.entries(working)
    // 先排除受保护键，再排序切片 —— 顺序反了会让 protectedKey 落进 victims
    const candidates = protectedKey ? entries.filter(([k]) => k !== protectedKey) : entries
    const victims = candidates
      // LearningRecord 没有 intervalIdx 顶层字段，退化为按「是否有 review + 其 intervalIdx」
      .sort((a, b) => (b[1]?.review?.intervalIdx ?? 0) - (a[1]?.review?.intervalIdx ?? 0))
      .slice(0, Math.max(1, Math.ceil(entries.length / 4)))
    // 候选被清空：再清也腾不出空间，不再空跑剩余轮次做必然失败的 setItem
    if (!victims.length) break
    for (const [k] of victims) delete working[k]
    evicted += victims.length
    console.warn(
      `[learning/storage] 存储配额不足，熔断清洗第 ${round} 轮：清理 ${victims.length} 条（累计 ${evicted}）`,
    )
    try {
      writeKeyRaw(KEY_LEARNING_V2, JSON.stringify(working))
      reportDiag({ code: 'QUOTA_EVICTED', key: KEY_LEARNING_V2, count: evicted })
      checkQuotaPressure()
      return { ok: true, evicted }
    } catch (e) {
      if (!isQuotaError(e)) return failWrite(KEY_LEARNING_V2, { ok: false, evicted, reason: 'unavailable' }, e)
    }
  }
  // 最终失败的可观测（warn / diag / 事件三路）统一在 failWrite 里
  return failWrite(KEY_LEARNING_V2, { ok: false, evicted, reason: 'quota' }, undefined)
}

/**
 * 取单条**正式**学习记录；不存在则返回 null（不做任何兜底构造 —— 静默兜底是本次要消灭的东西）。
 *
 * ⚠️ 为什么显式排除 `legacy:*` 键：`LearningStoreV2` 的值是联合类型（types.ts:70 附近），
 *    `legacy:` 键下躺着没归属的占位记录。按 ContentId 取却拿回占位记录，
 *    调用方会在毫无察觉的情况下把 ` word ` 当词去显示/发音。
 *    这里返回 null 是**收窄**，不是兜底 —— 占位记录另有 `getLegacyRecord()` 取。
 */
export function getRecord(contentId: string): LearningRecord | null {
  if (isLegacyKey(contentId)) return null
  const entry = loadLearningV2()[contentId]
  if (!entry) return null
  return isLearningRecord(entry) ? entry : null
}

/** 取单条 legacy 占位记录（「未归属」分区用）；键不以 `legacy:` 开头或不存在则返回 null */
export function getLegacyRecord(key: string): LegacyRecord | null {
  if (!isLegacyKey(key)) return null
  const entry = loadLearningV2()[key]
  if (!entry) return null
  return isLegacyRecord(entry) ? entry : null
}

/** 「未归属」记录条数 —— 不加载全表的轻量口径（UI badge / 诊断用） */
export function countLegacy(): number {
  return Object.keys(loadLearningV2()).filter(isLegacyKey).length
}

/** 写入单条；返回新的 store 与落盘结果 */
export function putRecord(record: LearningRecord): { store: LearningStoreV2; result: SaveResult } {
  const store = loadLearningV2()
  const next: LearningStoreV2 = { ...store, [record.contentId]: record }
  return { store: next, result: saveLearningV2(next, record.contentId) }
}

/* ---------------- LetterStats（独立键，§1.3） ---------------- */

const EMPTY_LETTERS: LetterStats = { letters: {} }

export function loadLetterStats(): LetterStats {
  // 用 `Record<string, unknown>` 的下标访问取值再判形状，而不是把 v 断言成目标类型：
  // `Record<string, unknown>` 与 `LetterStats` 互不重叠，断言会被 TS 拦下（TS2352）。
  // 更重要的是语义：断言等于**先假设它合法**再取值；这里要的是先取值再验证，顺序反了就失去校验意义。
  const { value } = readRaw<LetterStats>(KEY_LETTER_STATS, EMPTY_LETTERS, (v): v is LetterStats =>
    isRecord(v) && isRecord(v.letters),
  )
  return { letters: { ...value.letters } }
}

/**
 * letters 是 **26 个固定键**的全局统计，不随 content 增删 ⇒ **不做熔断清洗**
 * （清洗它会让「字母弱项」指标无端归零，比写失败更糟）。写失败如实返回 ok=false。
 */
export function saveLetterStats(stats: LetterStats): SaveResult {
  try {
    writeKeyRaw(KEY_LETTER_STATS, JSON.stringify(stats))
    checkQuotaPressure()
    return { ok: true, evicted: 0 }
  } catch (e) {
    return failWrite(KEY_LETTER_STATS, { ok: false, evicted: 0, reason: isQuotaError(e) ? 'quota' : 'unavailable' }, e)
  }
}

/* ---------------- GlobalTotals（独立键，§1.3） ---------------- */

const EMPTY_TOTALS: GlobalTotals = { totalKeys: 0, totalCorrect: 0, totalWords: 0, bestWpm: 0 }

export function loadTotals(): GlobalTotals {
  const { value } = readRaw<GlobalTotals>(KEY_TOTALS, EMPTY_TOTALS, (v): v is GlobalTotals =>
    // 同 letters：只判形状，不断言。四个字段缺任一 → 整份作废回落到 EMPTY_TOTALS（记账 justifiably 归零）
    isRecord(v) &&
    typeof v.totalKeys === 'number' &&
    typeof v.totalCorrect === 'number' &&
    typeof v.totalWords === 'number' &&
    typeof v.bestWpm === 'number',
  )
  return { ...EMPTY_TOTALS, ...value }
}

/** 同 letters：跨 content 的累加量，不做熔断清洗 */
export function saveTotals(totals: GlobalTotals): SaveResult {
  try {
    writeKeyRaw(KEY_TOTALS, JSON.stringify(totals))
    checkQuotaPressure()
    return { ok: true, evicted: 0 }
  } catch (e) {
    return failWrite(KEY_TOTALS, { ok: false, evicted: 0, reason: isQuotaError(e) ? 'quota' : 'unavailable' }, e)
  }
}

/* ---------------- MigrationMarker（幂等 + 回滚的依据） ---------------- */

export function loadMigrationMarker(): MigrationMarker | null {
  const { value, corrupted } = readRaw<MigrationMarker | null>(KEY_MIGRATION, null, (v): v is MigrationMarker | null =>
    // marker 是「幂等 + 回滚」的唯一依据，校验必须比其它键更严：
    // sourceFingerprint 决定第二次是否跳过，rollbackToken 决定能否恢复 ——
    // 任一残缺都必须判 code 为损坏（corrupted=true ⇒ 调用方不得据此跳过迁移）。
    v === null ||
    (isRecord(v) &&
      typeof v.sourceFingerprint === 'string' &&
      typeof v.migratorVersion === 'string' &&
      isRecord(v.rollbackToken) &&
      typeof v.rollbackToken.backupKey === 'string' &&
      Array.isArray(v.rollbackToken.writtenKeys)),
  )
  if (corrupted) return null
  return value
}

export function saveMigrationMarker(marker: MigrationMarker): SaveResult {
  try {
    writeKeyRaw(KEY_MIGRATION, JSON.stringify(marker))
    return { ok: true, evicted: 0 }
  } catch (e) {
    return failWrite(KEY_MIGRATION, { ok: false, evicted: 0, reason: isQuotaError(e) ? 'quota' : 'unavailable' }, e)
  }
}

/** 删除迁移标记（回滚路径用：让下次启动重新走迁移） */
export function clearMigrationMarker(): SaveResult {
  try {
    removeKeyRaw(KEY_MIGRATION)
    return { ok: true, evicted: 0 }
  } catch (e) {
    return failWrite(KEY_MIGRATION, { ok: false, evicted: 0, reason: 'unavailable' }, e)
  }
}

/* ---------------- §2.7 回滚的一键封装（G3-6 补上的那层封装） ---------------- */

/**
 * backup 字段名 → 旧键名。与 `migrate.ts` §2.7 ⑥ 的 backup 构造（`{review, memorize,
 * analytics, customBanks}` 四字段）**同源**；值序与 `migrate.ts` 的 `IN_SCOPE_KEYS` 相同。
 * 单测（test:storage G 段）用「Object.values(mapping) 逐项 === IN_SCOPE_KEYS」锁死漂移。
 *
 * 职责边界（G 段单测钉死）：本映射**只**负责「legacy 键名 ↔ backup 字段名」的换算；
 * 恢复循环由 `token.backedUpKeys` 驱动（§2.7.2 一句话算法原文），**不得**由本映射全集驱动
 * —— 映射驱动会触碰不在 backedUpKeys 里的键（G 段 G-2 用「其余键放 junk 必须原样幸存」锁死）。
 */
export const BACKUP_FIELD_TO_LEGACY_KEY: Readonly<Record<string, string>> = {
  review: 'gt.review.v1',
  memorize: 'gt.memorize.v1',
  analytics: 'gt.analytics.v1',
  customBanks: 'gt.customBanks.v1',
}

export interface RollbackOutcome {
  /** 成功写回（或恢复为「不存在」）的旧键 */
  restored: string[]
  /** 成功清除的迁移新键（含 backup 与 marker —— G3-6 判据：5 个新键不存在） */
  cleared: string[]
  /** 失败清单（不抛 —— 回滚本身是失败路径的兜底，再抛就没有退路了） */
  failed: { key: string; reason: string }[]
  /** marker 是否确认清除（回滚后下次启动会重新迁移 —— 这是预期行为，不是回滚被撤销） */
  markerCleared: boolean
}

/**
 * 一键回滚到 v1（G3-6 的一句话算法：**删掉迁移写入的新键 + 从 backup 原样写回旧键**）。
 *
 * 语义钉在两处已验证的事实上：
 *  - `tests/migration-guards.mjs` G3-6 段：migrate.ts 的 backup **四字段恒在**
 *    （迁移前不存在的键以 `{}` / `[]` 占位，「备份包含全部 4 个迁移源键」已锁），
 *    因此对真实迁移产物，恢复恒走 `setItem`（缺键占位会被原样写回 —— 这是 backup
 *    忠实性的一部分：占位 `{}` 与「真实存在过的空表」不可区分，宁可原样）；
 *  - `P1.5-LEARNING-MODEL.md` §2.7.2 一句话算法原文：恢复循环由 **`token.backedUpKeys`
 *    驱动**（迁移器实际备份的清单），本映射只做键名↔字段名换算。
 *    `removeItem` 分支只对「字段真缺失」的残缺/手工 backup 兜底 —— 真实产物走不到。
 *
 * 所有失败都进 `outcome.failed` 并 reportDiag，**不抛** —— 回滚是失败路径的兜底，
 * 自己再抛就把用户推向没有退路的境地。
 */
export function rollbackLearningV1(token: RollbackToken): RollbackOutcome {
  const outcome: RollbackOutcome = { restored: [], cleared: [], failed: [], markerCleared: false }

  /* ① 取备份 */
  let backup: Record<string, unknown> | null = null
  try {
    const raw = readKeyRaw(token.backupKey)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (isRecord(parsed)) backup = parsed
    else outcome.failed.push({ key: token.backupKey, reason: 'backup missing or not an object' })
  } catch (e) {
    outcome.failed.push({ key: token.backupKey, reason: `backup unreadable: ${errorNameOf(e) ?? 'unknown'}` })
  }

  /* ② 旧键恢复 —— 由 token.backedUpKeys 驱动（§2.7.2）；backup 可用才做，
     backup 坏了仍继续清新键（新键是坏状态，必须走）。 */
  if (backup) {
    if (!Array.isArray(token.backedUpKeys)) {
      outcome.failed.push({ key: token.backupKey, reason: 'backedUpKeys is not an array' })
    }
    for (const legacyKey of Array.isArray(token.backedUpKeys) ? token.backedUpKeys : []) {
      const field = Object.entries(BACKUP_FIELD_TO_LEGACY_KEY).find(([, k]) => k === legacyKey)?.[0]
      if (field === undefined) {
        outcome.failed.push({ key: legacyKey, reason: 'no backup field mapping for this key' })
        continue
      }
      try {
        if (field in backup) writeKeyRaw(legacyKey, JSON.stringify(backup[field]))
        else removeKeyRaw(legacyKey)
        outcome.restored.push(legacyKey)
      } catch (e) {
        outcome.failed.push({ key: legacyKey, reason: errorNameOf(e) ?? 'write failed' })
        reportDiag({ code: 'STORAGE_WRITE_FAILED', key: legacyKey, errorName: errorNameOf(e) })
      }
    }
  }

  /* ③ 清除迁移写入的全部新键（token.writtenKeys 由迁移器生成，含 backup 与 marker 自身） */
  for (const key of token.writtenKeys) {
    try {
      removeKeyRaw(key)
      outcome.cleared.push(key)
    } catch (e) {
      outcome.failed.push({ key, reason: errorNameOf(e) ?? 'remove failed' })
    }
  }
  outcome.markerCleared = loadMigrationMarker() === null

  if (outcome.failed.length > 0) {
    console.warn(`[learning/storage] 回滚有 ${outcome.failed.length} 项失败`, outcome.failed)
    reportDiag({ code: 'MIGRATION_WARNING', key: token.backupKey, count: outcome.failed.length })
  }
  return outcome
}

/* ---------------- diagnostics（§3.4 第 4 条） ---------------- */

export interface LearningDiagnostics {
  /** 已用 UTF-16 字节（本机存储按字符 ×2 计费） */
  bytesUtf16: number
  learningRecords: number
  legacyRecords: number
  markerPresent: boolean
}

export function diagnostics(): LearningDiagnostics {
  const store = loadLearningV2()
  const keys = Object.keys(store)
  const raw = safeGet(KEY_LEARNING_V2)
  return {
    bytesUtf16: raw === null ? 0 : raw.length * 2,
    learningRecords: keys.filter((k) => k.startsWith('content:')).length,
    legacyRecords: keys.filter((k) => k.startsWith('legacy:')).length,
    markerPresent: loadMigrationMarker() !== null,
  }
}

function safeGet(key: string): string | null {
  try {
    return readKeyRaw(key)
  } catch {
    return null
  }
}
