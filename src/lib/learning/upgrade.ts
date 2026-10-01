/* V4.1-P1.5-S4 · 启动迁移（设计文档 §3.5 的 **M 步**）+ 读/写模式状态机
 *
 * ⚠️ 本文件是 S4 原子包的「总开关」。设计文档 §3.5 的三个硬耦合：
 *   ① analytics 拆分 + review/memorize 迁移 + 迁移执行器（本文件）
 *   ② M 与读侧切换（各 store 的读在迁移落地后切 gt.learning.v2）
 *   ③ 迁移本身原子：先算全部 → 一次写全部 → **最后**写 gt.migration.v1 标记键
 *
 * 状态机（所有 store 的读/写一律经 isV2Store() 派发，杜绝「一半新一半旧」）：
 *   State A（marker 不存在 且 存在 v1 数据）→ 一切走 v1（= 升级前行为，逐字节兼容）
 *   State B（marker 存在，或 根本没有 v1 数据）→ 一切走 v2
 *
 * 为什么「没有 v1 数据」也归入 State B：新用户不该带着四条永远为空的旧键生活；
 * 空表上 v1 路径与 v2 路径语义等价，但 v2 是唯一有未来的那条。
 *
 * 失败设计（宁可不迁，不可迁坏）：
 *   - 内容包加载失败（离线首启）→ 整个迁移放弃，停留 State A，下次启动重试。
 *     绝不允许「一半包的词被归为 orphan」的半吊子迁移落盘。
 *   - 任何一个新键写失败 → 不写 marker，下次启动重算（迁移是幂等的：
 *     源指纹相同 ⇒ 覆盖写相同内容，无副作用）。
 */

import {
  IN_SCOPE_KEYS,
  KEY_BACKUP,
  loadMigrationMarker,
  saveLearningV2,
  saveLetterStats,
  saveMigrationMarker,
  saveTotals,
} from './storage'
/* ⚠️ migrate.ts（≈16.2 KiB）**不静态 import**：只需(S1)要迁移时才 `await import('./migrate')`，
 * 否则这份代码会整块进主 chunk。代价是「是否需要迁移」的判定必须留在同步路径 —— 见
 * isMigrated() / hasLegacyV1Data()，两者都只用 IN_SCOPE_KEYS（已在 storage.ts，同步可取），
 * 不 await 任何东西，首屏不会被拖慢。 */
import type { ContentProvider, MigrationReport, RawStoreDump } from './types'
import { getVocabularyPackages, loadPackage } from '../../core/content/registry'
import { readKeyRaw, writeKeyRaw } from '../../core/learning/storage-io'

/** 迁移源键 → 本机存储原始键名（与 IN_SCOPE_KEYS 同序同源，勿增勿删） */
const SOURCE_RAW_KEYS: readonly string[] = IN_SCOPE_KEYS

/* P1.7-W2B：迁移读写同样经 persistence Repository（namespace 注册校验 + owner 域匹配）。
 * 四个源键 gt.review.v1 / gt.memorize.v1 / gt.analytics.v1 / gt.customBanks.v1 与备份键
 * gt.learning.v2.backup 均已注册，域分别落在 learning/analytics/content —— 全在
 * learning 通道的允许域内，因此接线后不会把合法迁移写成判红。
 * 失败语义保持不变：抛（含 NamespaceError）→ 本次迁移放弃，停留 State A 下次重试。 */
function safeGetItem(key: string): string | null {
  try {
    return readKeyRaw(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    writeKeyRaw(key, value)
    return true
  } catch (e) {
    console.warn(`[learning/upgrade] ${key} 写入失败，本次迁移放弃（下次启动重试）`, e)
    return false
  }
}

/** State B 判据 ①：迁移标记存在（迁移已在本机完成过） */
export function isMigrated(): boolean {
  return loadMigrationMarker() !== null
}

/** State A 判据：四个迁移源键在本机存储里**一个字节的数据都没有**。
 *  键不存在 / 空串 = 没数据；`'{}'` 也按「有数据」处理（宁可多跑一次幂等迁移，
 *  不可误判新用户为老用户 —— 后者会让新用户的写入永远落在 v1 上）。 */
function hasLegacyV1Data(): boolean {
  return SOURCE_RAW_KEYS.some((k) => {
    const raw = safeGetItem(k)
    return raw !== null && raw !== ''
  })
}

/**
 * 读/写模式总派发。所有 Learning store 的读与写在动作前先问这个函数：
 *   true  → 走 gt.learning.v2 键族（State B）
 *   false → 走 v1 旧键（State A，升级前行为）
 */
export function isV2Store(): boolean {
  return isMigrated() || !hasLegacyV1Data()
}

/** 用真实 registry 构建迁移所需的 ContentProvider（types.ts:357-366 的形状）。
 *  任一内容包词条加载失败 ⇒ 返回 null（调用方放弃迁移）——
 *  用不完整的词表跑迁移会把「只是没加载出来的词」误判成 orphan，这是编造数据。 */
async function buildContentProvider(): Promise<ContentProvider | null> {
  const pkgs = getVocabularyPackages()
  const pkgInfoMap = new Map<string, { namespace: string; contentVersion?: number; contentChecksum?: string }>()
  const wordToPkgs = new Map<string, string[]>()
  const lowerToForms = new Map<string, Set<string>>()

  for (const pkg of pkgs) {
    let words: { word: string }[]
    try {
      words = await loadPackage(pkg.localId)
    } catch (e) {
      console.warn(`[learning/upgrade] 内容包 ${pkg.localId} 加载失败，迁移放弃（下次启动重试）`, e)
      return null
    }
    pkgInfoMap.set(pkg.localId, {
      namespace: pkg.manifest.namespace,
      contentVersion: pkg.manifest.contentVersion,
      contentChecksum: pkg.manifest.contentChecksum,
    })
    const seenInPkg = new Set<string>()
    for (const w of words) {
      const word = w?.word
      if (typeof word !== 'string' || word === '' || seenInPkg.has(word)) continue
      seenInPkg.add(word)
      const holders = wordToPkgs.get(word)
      if (holders) holders.push(pkg.localId)
      else wordToPkgs.set(word, [pkg.localId])
      const lower = word.toLowerCase()
      const forms = lowerToForms.get(lower)
      if (forms) forms.add(word)
      else lowerToForms.set(lower, new Set([word]))
    }
  }

  return {
    pkgInfo: (pkgId) => pkgInfoMap.get(pkgId) ?? null,
    wordToPkgs: (word) => wordToPkgs.get(word) ?? null,
    lowerToForms: (lower) => lowerToForms.get(lower) ?? null,
  }
}

export type UpgradeOutcome =
  | { kind: 'marker-present' }
  | { kind: 'no-legacy-data' }
  | { kind: 'applied'; report: MigrationReport }
  | { kind: 'aborted'; reason: string }

/** 收集迁移源快照（原始字符串形态；migrate.ts splitSnapshot 负责解析） */
function collectRawDump(): RawStoreDump {
  const dump: RawStoreDump = {}
  for (const k of SOURCE_RAW_KEYS) dump[k] = safeGetItem(k)
  return dump
}

/**
 * 启动迁移：首屏渲染**之前**调用一次（main.tsx）。
 * 契约顺序（migrate.ts 文件头 ③ + browser-migration-e2e 已验证的时序）：
 *   saveLearningV2 → saveLetterStats → saveTotals → backup setItem → **saveMigrationMarker 最后**
 */
export async function runStartupMigration(): Promise<UpgradeOutcome> {
  try {
    if (isMigrated()) return { kind: 'marker-present' }
    if (!hasLegacyV1Data()) return { kind: 'no-legacy-data' }

    const t0 = Date.now()
    const provider = await buildContentProvider()
    if (!provider) {
      return { kind: 'aborted', reason: 'content packages unavailable（离线首启？）——停留 State A，下次启动重试' }
    }

    const raw = collectRawDump()
    /* 只有走到这里（确实存在老格式快照、且内容包就绪）才拉取迁移器 ——
     * 新用户与已迁移用户在上面两道同步早退里就返回了，永远不碰这个 chunk。 */
    const { migrateV1toV2, splitSnapshot } = await import('./migrate')
    const split = splitSnapshot(raw)
    const run = migrateV1toV2(split.snapshot, provider, {
      runtime: 'browser',
      source: 'browser',
      sourceDetail: typeof location !== 'undefined' ? location.origin : 'browser',
      now: Date.now(),
      durationMs: Date.now() - t0,
      existingMarkerFingerprint: null,
      // S3 缺陷修复的配套：analytics 备份按原文键序还原（G3-6 逐字节回滚的前提）
      preserveBackupKeys: { analytics: raw['gt.analytics.v1'] ?? undefined },
    })
    if (run.skipped) return { kind: 'marker-present' } // 并发/竞态兜底：指纹已命中

    /* ---- 契约顺序落盘；任一失败即放弃（不写 marker，下次启动重算） ---- */
    const rLearning = saveLearningV2(run.next.learning)
    if (!rLearning.ok) return { kind: 'aborted', reason: `saveLearningV2 失败（reason=${rLearning.reason}）` }
    const rLetters = saveLetterStats(run.next.letterStats)
    const rTotals = saveTotals(run.next.totals)
    if (!rLetters.ok || !rTotals.ok) {
      return { kind: 'aborted', reason: `letterStats/totals 写入失败（letters=${rLetters.ok}, totals=${rTotals.ok}）` }
    }
    if (!safeSetItem(KEY_BACKUP, JSON.stringify(run.next.backup))) {
      return { kind: 'aborted', reason: 'backup 写入失败（无备份不迁移）' }
    }
    const rMarker = saveMigrationMarker(run.next.marker) // 最后写：崩溃自愈的前提
    if (!rMarker.ok) return { kind: 'aborted', reason: 'marker 写入失败' }

    const t = run.report.tiers
    console.info(
      `[learning/upgrade] v1→v2 迁移完成：resolved=${t.resolved} ambiguous=${t.ambiguous} orphan=${t.orphan} caseConflict=${t.caseConflict} invalid=${t.invalid}，耗时 ${run.report.durationMs}ms`,
    )
    return { kind: 'applied', report: run.report }
  } catch (e) {
    console.warn('[learning/upgrade] 启动迁移异常，停留 State A（下次启动重试）', e)
    return { kind: 'aborted', reason: `exception: ${e instanceof Error ? e.name : String(e)}` }
  }
}
