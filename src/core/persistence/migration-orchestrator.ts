/* P1.7 Wave 1-D · Migration Orchestrator（Wave 1 出口整合）
 *
 * 把 W1A Lock / W1B FencedWrite / W1C Recovery+R5+Version 接成完整流水线（§2）：
 *
 *   Recovery gate → acquire Lock → journal running → READ → VALIDATE → TRANSFORM
 *     → guard.stage（staging，fencing）→ VERIFY（R5 五零跑在 staging 上，§9）
 *     → markVerified → journal verified → guard.requestCommit（四项确认）
 *     → applySwitch（单次同步切换）→ finalize → journal committed → release Lock
 *
 * 不变量（§19）：
 *   - 任何失败：journal=failed、旧 localStorage 未动（切换前零写入）、staging 留场供检视；
 *   - 重启编排：decideRecovery 驱动（total），COMMIT 行为在 fence marker 已存在时
 *     走 redoSwitch 幂等重放（W1B 语义），否则从 verified 续走；
 *   - CORRUPT_STATE / MANUAL_REVIEW → 终止并报告，绝不静默处理。
 *
 * journal 存于与 lock/staging 同一 IDB 域（键 `journal:<migrationId>`，§2 IDB 唯一使用点）。
 */

import type { LockTxnStore, LockRecord } from './migration-lock'
import { MigrationLock } from './migration-lock'
import type { FenceTxnStore, StagingEntry } from './migration-write-guard'
import { MigrationWriteGuard, applySwitch, FENCE_LOCK_KEY } from './migration-write-guard'
import {
  decideRecovery,
  type MigrationPhase,
  type OldState,
  type NewState,
  type RecoveryDecision,
} from './recovery'
import { r5Check, type R5Record, type R5Result, type R5Spec } from './r5'
import type { MigrationVersion } from './version'

/* ---------------- Journal ---------------- */

export interface JournalRecord {
  migrationId: string
  phase: MigrationPhase
  targetVersion: MigrationVersion
  sourceFingerprint: string
  startedAt: number
  updatedAt: number
  finishedAt: number | null
}

const journalKey = (id: string) => `journal:${id}`

/* ---------------- 迁移定义（域无关；域迁移在后续 Wave 注入） ---------------- */

export interface MigrationDefinition {
  migrationId: string
  targetVersion: MigrationVersion
  /** localStorage 快照读取（同步；测试注入桩，运行时读真 localStorage） */
  read: () => Record<string, string | null>
  /** 源键集合 */
  sourceKeys: readonly string[]
  /** 目标键判定（newState 观测用） */
  isTargetKey: (key: string) => boolean
  /** 期望目标键数量（newState complete 判定） */
  expectedTargetCount: number
  /** 源键在 COMMIT 后需移除的清单（REMOVE OLD 仅在 COMMIT 后，§19-5） */
  removalKeys: readonly string[]
  /** 校验单条源记录；抛错 = 结构非法 → journal failed */
  validate: (key: string, value: unknown) => void
  /** 变换：源键 → staging 条目（新键写入；旧键移除由 removalKeys 统一表达） */
  transform: (key: string, value: unknown) => StagingEntry[]
  /** 源 → R5 记录（VERIFY 的 before 侧） */
  toR5Records: (key: string, value: unknown) => R5Record[]
  /** staging 条目 → R5 记录（VERIFY 的 after 侧：解码 staging，而非复用源映射） */
  toR5RecordsFromStaging: (entries: StagingEntry[]) => R5Record[]
  r5Spec: R5Spec
  sourceFingerprint: string
}

/* ---------------- 观测与报告 ---------------- */

export interface Observation {
  oldState: OldState
  newState: NewState
  presentTargetCount: number
}

export interface MigrationRunReport {
  migrationId: string
  recovery: RecoveryDecision
  committed: boolean
  aborted: boolean
  reason?: string
  r5: R5Result | null
  startedAt: number
  finishedAt: number
}

function observe(def: MigrationDefinition, snapshot: Record<string, string | null>): Observation {
  let sourcePresent = 0
  let sourceCorrupt = 0
  for (const k of def.sourceKeys) {
    const raw = snapshot[k]
    if (raw === null || raw === undefined) continue
    sourcePresent++
    try { JSON.parse(raw) } catch { sourceCorrupt++ }
  }
  const oldState: OldState =
    sourceCorrupt > 0 ? 'corrupt' : sourcePresent === 0 ? 'missing' : 'complete'
  const presentTargetCount = Object.keys(snapshot).filter((k) => def.isTargetKey(k) && snapshot[k] !== null).length
  const newState: NewState =
    presentTargetCount === 0 ? 'missing' : presentTargetCount >= def.expectedTargetCount ? 'complete' : 'partial'
  return { oldState, newState, presentTargetCount }
}

/* ---------------- Orchestrator ---------------- */

export class MigrationOrchestrator {
  private readonly lock: MigrationLock
  private readonly guard: MigrationWriteGuard
  private readonly store: FenceTxnStore

  constructor(lockStore: LockTxnStore, fenceStore: FenceTxnStore) {
    this.lock = new MigrationLock(lockStore, 30_000)
    this.guard = new MigrationWriteGuard(fenceStore)
    this.store = fenceStore
  }

  async getJournal(migrationId: string): Promise<JournalRecord | null> {
    return this.store.runTxn(async (txn) => {
      const j = await txn.get(journalKey(migrationId))
      return (j as JournalRecord | undefined) ?? null
    })
  }

  private async putJournal(rec: JournalRecord, phase: MigrationPhase): Promise<JournalRecord> {
    const next: JournalRecord = { ...rec, phase, updatedAt: Date.now() }
    if (phase === 'committed' || phase === 'failed') next.finishedAt = Date.now()
    await this.store.runTxn(async (txn) => { await txn.put(journalKey(next.migrationId), next) })
    return next
  }

  /** 运行迁移（幂等：重启后按 journal + 观测态走 Recovery 决策） */
  async run(def: MigrationDefinition, opts?: { leaseMs?: number; now?: number }): Promise<MigrationRunReport> {
    const startedAt = opts?.now ?? Date.now()
    const snapshot = def.read()
    const obs = observe(def, snapshot)
    const journal = await this.getJournal(def.migrationId)
    const decision = decideRecovery(journal?.phase ?? 'pending', obs.oldState, obs.newState)
    const base = { migrationId: def.migrationId, recovery: decision, r5: null as R5Result | null, startedAt }

    // 终端决策：绝不静默（§19-1 兜底语义）
    if (decision.action === 'CORRUPT_STATE' || decision.action === 'MANUAL_REVIEW') {
      return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: `${decision.action}: ${obs.oldState}/${obs.newState} @ phase=${journal?.phase ?? 'pending'}` }
    }
    if (decision.action === 'COMPLETE') {
      return { ...base, finishedAt: Date.now(), committed: true, aborted: false, reason: 'journal committed 且数据完整' }
    }
    if (decision.action === 'CLEANUP_OLD') {
      // 切换已完成，仅 REMOVE OLD 未执行：重放移除（幂等）
      applySwitch(def.removalKeys.map((k) => ({ key: k, value: null })))
      return { ...base, finishedAt: Date.now(), committed: true, aborted: false, reason: 'CLEANUP_OLD 重放完成' }
    }

    // RERUN：清 staging 重跑（journal failed → fence reset 安全，committing 已被 guard 拒绝）
    if (decision.action === 'RERUN') {
      const r = await this.guard.reset()
      if (!r.ok) return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: `RERUN reset 被拒: ${r.reason}` }
    }

    // COMMIT 行为：fence marker 已存在（W1B committing 崩溃）→ 幂等重放；否则从 verified 续走
    if (decision.action === 'COMMIT') {
      const marker = await this.guard.getMarker()
      if (marker) {
        const rd = await this.guard.redoSwitch((es) => applySwitch(es))
        if (!rd.ok) return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: `redoSwitch 被拒: ${rd.reason}` }
        await this.guard.finalizeCommit()
        if (journal) await this.putJournal(journal, 'committed')
        return { ...base, finishedAt: Date.now(), committed: true, aborted: false, reason: 'marker 重放（W1B committing 崩溃恢复）' }
      }
      // 无 marker：verified 续走 → requestCommit → switch → finalize
      return this.finishCommittedPath(def, base, journal, opts)
    }

    // RUN / RESUME：完整流水线（RESUME 复用既有 journal 相位推进）
    return this.runFresh(def, base, journal, opts)
  }

  /** RUN / RESUME：READ → VALIDATE → TRANSFORM → STAGE → VERIFY → COMMIT */
  private async runFresh(
    def: MigrationDefinition,
    base: Omit<MigrationRunReport, 'committed' | 'aborted' | 'finishedAt'>,
    journal: JournalRecord | null,
    opts?: { leaseMs?: number; now?: number },
  ): Promise<MigrationRunReport> {
    const now = opts?.now ?? Date.now()
    const owner = `${def.migrationId}:${now}:${Math.floor(Math.random() * 1e6)}`
    const acq = await this.lock.acquire(owner, { leaseMs: opts?.leaseMs ?? 60_000, now })
    if (!acq.ok) {
      return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: 'lock-held：另一编排者持有锁' }
    }
    let j: JournalRecord =
      journal ?? {
        migrationId: def.migrationId, phase: 'pending', targetVersion: def.targetVersion,
        sourceFingerprint: def.sourceFingerprint, startedAt: now, updatedAt: now, finishedAt: null,
      }
    try {
      j = await this.putJournal(j, 'running')
      // READ
      const snapshot = def.read()
      const parsed = new Map<string, unknown>()
      for (const k of def.sourceKeys) {
        const raw = snapshot[k]
        if (raw === null || raw === undefined) continue
        parsed.set(k, JSON.parse(raw)) // corrupt 已被 observe 拦截，此处防御
      }
      // VALIDATE
      for (const [k, v] of parsed) def.validate(k, v)
      // TRANSFORM
      const entries: StagingEntry[] = []
      for (const [k, v] of parsed) entries.push(...def.transform(k, v))
      for (const k of def.removalKeys) entries.push({ key: k, value: null }) // REMOVE OLD 排尾（§19-5）
      // STAGE（fencing）
      const exp = { ownerId: acq.record.ownerId, fencingToken: acq.record.fencingToken }
      const st = await this.guard.stage(entries, exp, now)
      if (!st.ok) throw new Error(`guard.stage 被拒: ${st.reason}`)
      // VERIFY：R5 五零跑在 staging 上（§9）——before=源记录，after=staging 解码记录
      const beforeRecords: R5Record[] = []
      for (const [k, v] of parsed) beforeRecords.push(...def.toR5Records(k, v))
      const afterRecords = def.toR5RecordsFromStaging(entries)
      const r5 = r5Check(beforeRecords, afterRecords, def.r5Spec)
      if (!r5.ok) {
        await this.putJournal(j, 'failed')
        await this.lock.release({ ownerId: acq.record.ownerId, fencingToken: acq.record.fencingToken })
        return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: 'R5 违规：staging 未通过五零/identity 断言', r5 }
      }
      // markVerified → journal verified
      const mv = await this.guard.markVerified(exp, now)
      if (!mv.ok) throw new Error(`guard.markVerified 被拒: ${mv.reason}`)
      j = await this.putJournal(j, 'verified')
      return this.finishCommittedPath(def, base, j, opts, acq.record, exp, now)
    } catch (e) {
      // 失败路径：journal failed + 释放锁；旧 localStorage 未动（切换前零写入）
      await this.putJournal(j, 'failed').catch(() => {})
      await this.lock.release({ ownerId: acq.record.ownerId, fencingToken: acq.record.fencingToken }).catch(() => {})
      return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  /** verified → requestCommit → 同步切换 → finalize → journal committed → release */
  private async finishCommittedPath(
    def: MigrationDefinition,
    base: Omit<MigrationRunReport, 'committed' | 'aborted' | 'finishedAt'>,
    journal: JournalRecord | null,
    opts?: { leaseMs?: number; now?: number },
    acquired?: LockRecord,
    exp?: { ownerId: string; fencingToken: number },
    now?: number,
  ): Promise<MigrationRunReport> {
    const ts = now ?? Date.now()
    let owner = exp
    let lockRecord = acquired
    // 从 verified 续走（无活跃锁凭证时重新 acquire：RUN 分支已持有则直用）
    if (!owner || !lockRecord) {
      const o = `${def.migrationId}:${ts}:${Math.floor(Math.random() * 1e6)}`
      const acq = await this.lock.acquire(o, { leaseMs: opts?.leaseMs ?? 60_000, now: ts })
      if (!acq.ok) return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: 'lock-held：续走时无法取得锁' }
      owner = { ownerId: acq.record.ownerId, fencingToken: acq.record.fencingToken }
      lockRecord = acq.record
    }
    try {
      const cm = await this.guard.requestCommit(owner, { leaseMs: opts?.leaseMs ?? 60_000, now: ts })
      if (!cm.ok) throw new Error(`guard.requestCommit 被拒: ${cm.reason}`)
      applySwitch(cm.marker.entries) // 单次同步切换（无 await；幂等）
      const fn = await this.guard.finalizeCommit()
      if (!fn.ok) throw new Error(`guard.finalizeCommit 被拒: ${fn.reason}`)
      if (journal) await this.putJournal(journal, 'committed')
      await this.lock.release({ ownerId: lockRecord.ownerId, fencingToken: lockRecord.fencingToken })
      return { ...base, finishedAt: Date.now(), committed: true, aborted: false }
    } catch (e) {
      if (journal) await this.putJournal(journal, 'failed').catch(() => {})
      await this.lock.release({ ownerId: lockRecord.ownerId, fencingToken: lockRecord.fencingToken }).catch(() => {})
      return { ...base, finishedAt: Date.now(), committed: false, aborted: true, reason: e instanceof Error ? e.message : String(e) }
    }
  }
}

export { FENCE_LOCK_KEY }
