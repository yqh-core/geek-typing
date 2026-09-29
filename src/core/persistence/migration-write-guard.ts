/* P1.7 Wave 1-B · FencedWrite —— MigrationWriteGuard（v2.3.2 §4 / §19-3、§19-4、§19-5）
 *
 * 解决的问题：IDB 的锁校验与 localStorage 的写入不是同一原子域 ——
 * 「verify token → setItem」之间存在 TOCTOU：verify 后另一 tab 抢锁，旧 tab 仍可 setItem。
 *
 * 方案 A（冻结）：迁移期间写入全部走 IDB staging，最终切换一次完成：
 *
 *   旧 localStorage（只读）
 *         ↓ Migration（TRANSFORM）
 *   IndexedDB staging（与 lock 同一 IDB 域，guard 单事务内校验 fencing）
 *         ↓ VERIFY（R5 断言跑在 staging 上，Wave 1-C 接入）
 *   commit marker（单一 IDB readwrite 事务内完成「commit 前四项确认」：
 *     ① token 再确认 ② lease 有效 ③ renew 覆盖切换窗口（与许可授予同事务原子）
 *     ④ 无 await 同步段（applySwitch 由调用方在拿到 marker 后同一同步流执行））
 *         ↓ 单次同步切换 applySwitch（无 await，幂等，可整表重放）
 *   新 localStorage + REMOVE OLD（entry value=null，按调用序在写入之后）+ finalize committed
 *
 * fencing chain 闭合：acquire → owner+lease+token；renew → owner+lease+token；
 * release → owner+token；**write/commit → token（本模块）**。
 *
 * 存储布局（与 migration-lock.ts 共库同 store，键空间约定）：
 *   'lock'      → LockRecord（migration-lock 域的唯一锁记录，guard 直接在同事务读写）
 *   'phase'     → FencePhase
 *   'marker'    → CommitMarker（仅 committing 期间存在；finalize 后删除）
 *   'stage:<k>' → string（staging 数据；entry value=null 表示 remove，staging 中不落键）
 *
 * 本模块不引入任何 localStorage 键；IDB 使用点 = persistence 域内部（与 lock 同库）。
 */

import type { LockRecord } from './migration-lock'

/** 迁移写入条目：value=null 表示 REMOVE OLD（必须在全部新键写入之后，§19-5） */
export interface StagingEntry {
  key: string
  value: string | null
}

/** 迁移写入凭证：所有对目标数据的写入必须携带（§19-3） */
export interface WriteExpectation {
  ownerId: string
  fencingToken: number
}

/** Fence journal 相位（W1-B 最小集；W1-C 全量 Recovery journal 由 MIGRATION_PHASES 枚举驱动） */
export type FencePhase = 'idle' | 'staged' | 'verified' | 'committing' | 'committed'

/** commit 许可记录：授予后成为持久化的「决策事实」，redo 重放以此为唯一依据 */
export interface CommitMarker {
  entries: StagingEntry[]
  ownerId: string
  fencingToken: number
  grantedAt: number
}

/* ---------------- 纯决策函数（单独导出，Node 侧逐条单测） ---------------- */

export type WriteDenyReason = 'no-lock' | 'not-owner' | 'stale-token' | 'expired'
export type WriteCheck = { ok: true } | { ok: false; reason: WriteDenyReason }

/**
 * 写入许可 = 锁存在 + owner 匹配 + token 为当前值 + 未过期。
 * 「token 为当前最大值」在本模型中即 exp.fencingToken === cur.fencingToken：
 * token 只在 acquire 时 +1，当前锁记录上的 token 恒为全库最大；旧 owner 持旧 token 必不等。
 */
export function checkWrite(cur: LockRecord | null, exp: WriteExpectation, now: number): WriteCheck {
  if (cur === null) return { ok: false, reason: 'no-lock' }
  if (cur.ownerId !== exp.ownerId) return { ok: false, reason: 'not-owner' }
  if (cur.fencingToken !== exp.fencingToken) return { ok: false, reason: 'stale-token' }
  if (cur.leaseUntil <= now) return { ok: false, reason: 'expired' } // 过期边界含等号（与 §3 一致）
  return { ok: true }
}

/** kill-page 恢复决策（total function：5 相位穷举，永不 undefined） */
export type KillRecoveryAction = 'RERUN' | 'RESUME' | 'REDO_SWITCH' | 'NOOP'

export function decideKillRecovery(phase: FencePhase): KillRecoveryAction {
  switch (phase) {
    case 'idle':
      return 'RERUN' // 未开始（或已 reset）：旧 localStorage 完整，清理后重跑迁移
    case 'staged':
      return 'RESUME' // staging 完整、localStorage 未动：续走 verify → commit
    case 'verified':
      return 'RESUME' // 同上，从 commit 请求续走
    case 'committing':
      return 'REDO_SWITCH' // marker 已授予：同步段幂等重放 marker.entries → finalize
    case 'committed':
      return 'NOOP' // 已完成
  }
}

/* ---------------- 事务视图（与 lock 同库同 store，单事务内可同时触达锁与 staging） ---------------- */

export interface FenceTxnView {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  /** 前缀查询（IDB getAllKeys + filter / 内存实现 filter） */
  keys(prefix: string): Promise<string[]>
}

export interface FenceTxnStore {
  runTxn<T>(fn: (txn: FenceTxnView) => Promise<T>): Promise<T>
}

/* ---------------- 键空间常量 ---------------- */

export const FENCE_LOCK_KEY = 'lock'
const PHASE_KEY = 'phase'
const MARKER_KEY = 'marker'
const STAGE_PREFIX = 'stage:'

export function stagingKey(key: string): string {
  return STAGE_PREFIX + key
}

/* staging 值编码：写入与移除都落显式记录（移除 ≠ 键不存在）——
 * requestCommit 从 staging keys 收集 marker.entries，若用「无键」表示移除，
 * 移除条目将永远进不了 marker，REDO_SWITCH 重放后旧键不会被移除（浏览器 kill-page
 * 测试抓到的真缺陷）。JSON 包一层类型标签，同时杜绝业务值与哨兵串撞车。 */
const STAGE_REMOVE_RAW = JSON.stringify({ r: 1 })

/** staging 值编码（导出供测试与编排层构造断言） */
export function encodeStagedValue(value: string | null): string {
  return value === null ? STAGE_REMOVE_RAW : JSON.stringify({ v: value })
}

/** staging 值解码 */
export function decodeStagedValue(raw: string): string | null {
  return raw === STAGE_REMOVE_RAW ? null : (JSON.parse(raw).v as string)
}

/* ---------------- Guard 结果类型 ---------------- */

export type GuardResult = { ok: true } | { ok: false; reason: WriteDenyReason | 'no-marker' | 'committing-locked' }
export type CommitRequestResult =
  | { ok: true; marker: CommitMarker }
  | { ok: false; reason: WriteDenyReason }

/* ---------------- MigrationWriteGuard 门面 ---------------- */

export class MigrationWriteGuard {
  private readonly store: FenceTxnStore

  constructor(store: FenceTxnStore) {
    this.store = store
  }

  /** 读取当前相位（编排层/恢复层用） */
  async getPhase(): Promise<FencePhase> {
    return this.store.runTxn(async (txn) => {
      const p = await txn.get(PHASE_KEY)
      return (p as FencePhase | undefined) ?? 'idle'
    })
  }

  /** 读取 commit marker（恢复层用：REDO_SWITCH 的重放依据） */
  async getMarker(): Promise<CommitMarker | null> {
    return this.store.runTxn(async (txn) => ((await txn.get(MARKER_KEY)) as CommitMarker | undefined) ?? null)
  }

  /**
   * staging 写入：单一 IDB readwrite 事务内 checkWrite + 批量落 staging + 相位推进。
   * 旧 token / 非 owner / 过期 → FAIL 且 journal（phase）与 staging 完全不动（§4 验收③）。
   */
  async stage(entries: StagingEntry[], exp: WriteExpectation, now = Date.now()): Promise<GuardResult> {
    return this.store.runTxn(async (txn) => {
      const cur = (await txn.get(FENCE_LOCK_KEY)) as LockRecord | null
      const v = checkWrite(cur, exp, now)
      if (!v.ok) return { ok: false as const, reason: v.reason }
      for (const e of entries) {
        await txn.put(stagingKey(e.key), encodeStagedValue(e.value))
      }
      await txn.put(PHASE_KEY, 'staged')
      return { ok: true as const }
    })
  }

  /** VERIFY 通过后推进相位（verify 本体 = R5 断言跑在 staging 上，Wave 1-C 接入） */
  async markVerified(exp: WriteExpectation, now = Date.now()): Promise<GuardResult> {
    return this.store.runTxn(async (txn) => {
      const cur = (await txn.get(FENCE_LOCK_KEY)) as LockRecord | null
      const v = checkWrite(cur, exp, now)
      if (!v.ok) return { ok: false as const, reason: v.reason }
      await txn.put(PHASE_KEY, 'verified')
      return { ok: true as const }
    })
  }

  /**
   * commit 请求：**单一 IDB readwrite 事务内**完成 commit 前四项确认中的 ①②③ 并原子落 marker：
   *   ① token 再确认（checkWrite 内 exp.fencingToken === cur.fencingToken）
   *   ② lease 有效（checkWrite 内 cur.leaseUntil > now）
   *   ③ renew 覆盖切换窗口：同事务把 leaseUntil 续到 now + leaseMs —— 续期与许可授予原子，
   *      切换窗口必然被有效 lease 覆盖，跨 tab 竞争者无法在窗口内取得锁
   *   ④ 无 await 同步段：本方法只授予许可；调用方拿到 marker.entries 后在同一同步执行流内
   *      调用 applySwitch（测试以「返回时全部条目已生效」+ 结构检查双证明）
   */
  async requestCommit(
    exp: WriteExpectation,
    opts?: { leaseMs?: number; now?: number },
  ): Promise<CommitRequestResult> {
    const now = opts?.now ?? Date.now()
    const leaseMs = opts?.leaseMs ?? 30_000
    return this.store.runTxn(async (txn) => {
      const cur = (await txn.get(FENCE_LOCK_KEY)) as LockRecord | null
      const v = checkWrite(cur, exp, now)
      if (!v.ok) return { ok: false as const, reason: v.reason }
      const renewed: LockRecord = { ...cur!, leaseUntil: now + leaseMs }
      await txn.put(FENCE_LOCK_KEY, renewed)
      const stageKeys = await txn.keys(STAGE_PREFIX)
      const entries: StagingEntry[] = []
      for (const sk of stageKeys) {
        const raw = (await txn.get(sk)) as string
        entries.push({ key: sk.slice(STAGE_PREFIX.length), value: decodeStagedValue(raw) })
      }
      const marker: CommitMarker = {
        entries,
        ownerId: exp.ownerId,
        fencingToken: exp.fencingToken,
        grantedAt: now,
      }
      await txn.put(MARKER_KEY, marker)
      await txn.put(PHASE_KEY, 'committing')
      return { ok: true as const, marker }
    })
  }

  /** finalize：清 staging + 删 marker + 相位=committed（幂等：已 committed 直接 ok） */
  async finalizeCommit(): Promise<GuardResult> {
    return this.store.runTxn(async (txn) => {
      const phase = ((await txn.get(PHASE_KEY)) as FencePhase | undefined) ?? 'idle'
      if (phase === 'committed') return { ok: true as const }
      if (phase !== 'committing') return { ok: false as const, reason: 'no-marker' }
      const stageKeys = await txn.keys(STAGE_PREFIX)
      for (const sk of stageKeys) await txn.del(sk)
      await txn.del(MARKER_KEY)
      await txn.put(PHASE_KEY, 'committed')
      return { ok: true as const }
    })
  }

  /**
   * REDO_SWITCH 恢复动作：重放已授予的 marker（幂等整表重放）→ finalize。
   * 不再要求旧 token 仍持锁 —— marker 是已固化的决策事实；崩溃后重启的编排者
   * 以新 token 重新 acquire 后凭 marker 完成重放（重放内容 = marker.entries，非活 staging）。
   * 仅 phase === 'committing' 且 marker 存在时执行。
   */
  async redoSwitch(apply: (entries: StagingEntry[]) => void): Promise<GuardResult> {
    return this.store.runTxn(async (txn) => {
      const phase = ((await txn.get(PHASE_KEY)) as FencePhase | undefined) ?? 'idle'
      if (phase !== 'committing') return { ok: false as const, reason: 'no-marker' }
      const marker = (await txn.get(MARKER_KEY)) as CommitMarker | undefined
      if (!marker) return { ok: false as const, reason: 'no-marker' }
      apply(marker.entries) // 同步重放，无 await（幂等：重复应用结果不变）
      return { ok: true as const }
    })
  }

  /**
   * RERUN 恢复动作：清理 staging/marker 并复位 phase=idle。
   * **committing 期间拒绝清理** —— 该相位必须 REDO_SWITCH（丢弃 marker = 可能丢已授予的提交）。
   */
  async reset(): Promise<GuardResult> {
    return this.store.runTxn(async (txn) => {
      const phase = ((await txn.get(PHASE_KEY)) as FencePhase | undefined) ?? 'idle'
      if (phase === 'committing') return { ok: false as const, reason: 'committing-locked' }
      const stageKeys = await txn.keys(STAGE_PREFIX)
      for (const sk of stageKeys) await txn.del(sk)
      await txn.del(MARKER_KEY)
      await txn.put(PHASE_KEY, 'idle')
      return { ok: true as const }
    })
  }
}

/* ---------------- 单次同步切换（localStorage 侧，唯一写入口） ---------------- */

/**
 * 单次同步切换：全部 setItem/removeItem 在同一同步执行流内完成，无 await（§4 规则 3）。
 * - JS 单线程 + localStorage 同步 API：期间本 tab 无其他代码可插入；
 * - 幂等：整表重放安全（kill-page REDO_SWITCH 的基础）；
 * - 顺序契约：entries 必须先新键写入、后旧键移除（REMOVE OLD 在 COMMIT 后，§19-5）；
 * - 调用契约：调用方拿到 requestCommit 的 marker 后**立即**同步调用本函数，
 *   不得插入任何 await —— 该性质由测试双证明（行为 + 结构）。
 */
export function applySwitch(entries: StagingEntry[]): void {
  for (const e of entries) {
    if (e.value === null) localStorage.removeItem(e.key)
    else localStorage.setItem(e.key, e.value)
  }
}

/* ---------------- IndexedDB 事务存储（浏览器侧；与 migration-lock 共库同 store） ---------------- */

/**
 * 打开与 migration-lock 相同的数据库/对象仓库，返回泛化 KV 事务视图。
 * 同库 readwrite 事务在 IDB 层天然串行化：guard 事务内 get(lock) → 决策 → put 与
 * MigrationLock 的事务互斥，CAS 语义跨模块成立。
 */
export function createIdbFenceStore(
  dbName: string,
  storeName = 'migration-lock',
): Promise<FenceTxnStore> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName)
    }
    req.onsuccess = () => res(wrapIdbFence(req.result, storeName))
    req.onerror = () => rej(req.error ?? new Error('indexedDB.open failed'))
  })
}

function wrapIdbFence(db: IDBDatabase, storeName: string): FenceTxnStore {
  return {
    runTxn<T>(fn: (txn: FenceTxnView) => Promise<T>): Promise<T> {
      return new Promise<T>((res, rej) => {
        const tx = db.transaction(storeName, 'readwrite')
        const os = tx.objectStore(storeName)
        const view: FenceTxnView = {
          get: (key) =>
            new Promise((r, j) => {
              const q = os.get(key)
              q.onsuccess = () => r(q.result ?? null)
              q.onerror = () => j(q.error)
            }),
          put: (key, value) =>
            new Promise((r, j) => {
              const q = os.put(value, key)
              q.onsuccess = () => r()
              q.onerror = () => j(q.error)
            }),
          del: (key) =>
            new Promise((r, j) => {
              const q = os.delete(key)
              q.onsuccess = () => r()
              q.onerror = () => j(q.error)
            }),
          keys: (prefix) =>
            new Promise((r, j) => {
              const q = os.getAllKeys()
              q.onsuccess = () => r((q.result as IDBValidKey[]).map(String).filter((k) => k.startsWith(prefix)))
              q.onerror = () => j(q.error)
            }),
        }
        let result: T
        fn(view)
          .then((r) => { result = r })
          .catch((e) => { try { tx.abort() } catch { /* already done */ } rej(e) })
        tx.oncomplete = () => res(result!)
        tx.onerror = () => rej(tx.error ?? new Error('fence txn failed'))
        tx.onabort = () => rej(tx.error ?? new Error('fence txn aborted'))
      })
    },
  }
}

/* ---------------- 内存事务存储（Node 测试用，与 createMemoryLockStore 同构） ---------------- */

/** Map 后备 + chain 串行化（模拟 IDB readwrite 串行化语义） */
export function createMemoryFenceStore(): FenceTxnStore & { peek(key: string): unknown } {
  const map = new Map<string, unknown>()
  let chain: Promise<unknown> = Promise.resolve()
  return {
    peek: (key) => map.get(key) ?? null,
    runTxn<T>(fn: (txn: FenceTxnView) => Promise<T>): Promise<T> {
      const p = chain.then(() =>
        fn({
          get: async (key) => map.get(key) ?? null,
          put: async (key, value) => { map.set(key, value) },
          del: async (key) => { map.delete(key) },
          keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
        }),
      )
      chain = p.catch(() => {})
      return p as Promise<T>
    },
  }
}
