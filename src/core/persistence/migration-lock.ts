/* P1.7 Wave 1-A · Migration Lock —— 全协议 CAS + Owner Fencing（v2.3.2 §3）
 *
 * 设计依据：P1.7-PLAN-v2.3.2-FROZEN §3 / §19-2。
 *  - acquire / renew / release 三个操作**全部 CAS**，且每个操作在**单一 IDB readwrite
 *    transaction** 内完成条件读取 + 条件写入 + 条件复核（§19-2）；
 *  - fencing chain：acquire → owner+lease+token；renew → owner+lease+token；
 *    release → owner+token；write → token（write 侧 guard 在 Wave 1-B FencedWrite 落地）；
 *  - fencingToken 单调递增：每次成功 acquire = 旧 token + 1（空锁从 1 起）；
 *  - 过期定义：`leaseUntil <= now` 视为过期（边界含等号，测试锁定）；
 *  - 禁止实现拆成「await get() → if 过期 → await put()」两步（两个事务，有覆盖竞态）。
 *
 * 本模块不引入任何 localStorage 键（锁存 IndexedDB，persistence 域内唯一 IDB 使用点之一）。
 */

export interface LockRecord {
  ownerId: string
  leaseUntil: number
  fencingToken: number
}

/** 单个 readwrite 事务内的锁记录视图（get/put/del 都作用于同一条 lock 记录） */
export interface LockTxnView {
  get(): Promise<LockRecord | null>
  put(rec: LockRecord): Promise<void>
  del(): Promise<void>
}

/** 序列化事务存储：同一时刻至多一个 runTxn 在执行（与 IDB readwrite 串行化语义一致） */
export interface LockTxnStore {
  runTxn<T>(fn: (txn: LockTxnView) => Promise<T>): Promise<T>
}

export interface RenewExpectation {
  ownerId: string
  leaseUntil: number
  fencingToken: number
}
export interface ReleaseExpectation {
  ownerId: string
  fencingToken: number
}

/* ---------------- 纯决策函数（单独导出，Node 侧逐条单测） ---------------- */

/** 过期判定：leaseUntil <= now 即过期（边界含等号） */
export function isExpired(rec: LockRecord, now: number): boolean {
  return rec.leaseUntil <= now
}

/** acquire 条件：无锁，或锁已过期 */
export function canAcquire(cur: LockRecord | null, now: number): boolean {
  return cur === null || isExpired(cur, now)
}

/** renew 条件：owner + lease + token 三元组与期望完全一致，且尚未过期 */
export function canRenew(cur: LockRecord | null, exp: RenewExpectation, now: number): boolean {
  return (
    cur !== null &&
    cur.ownerId === exp.ownerId &&
    cur.leaseUntil === exp.leaseUntil &&
    cur.fencingToken === exp.fencingToken &&
    cur.leaseUntil > now
  )
}

/** release 条件：owner + token 与期望一致（lease 不参与：过期锁仍可被本人释放） */
export function canRelease(cur: LockRecord | null, exp: ReleaseExpectation): boolean {
  return cur !== null && cur.ownerId === exp.ownerId && cur.fencingToken === exp.fencingToken
}

/* ---------------- 门面 ---------------- */

export type AcquireResult =
  | { ok: true; record: LockRecord }
  | { ok: false; reason: 'held' }

export class MigrationLock {
  private readonly store: LockTxnStore
  private readonly defaultLeaseMs: number

  constructor(store: LockTxnStore, defaultLeaseMs = 30_000) {
    this.store = store
    this.defaultLeaseMs = defaultLeaseMs
  }

  /** 无锁或已过期 → 成功并令 fencingToken+1；否则 FAIL（reason: held） */
  async acquire(ownerId: string, opts?: { leaseMs?: number; now?: number }): Promise<AcquireResult> {
    const now = opts?.now ?? Date.now()
    const leaseMs = opts?.leaseMs ?? this.defaultLeaseMs
    return this.store.runTxn(async (txn) => {
      const cur = await txn.get()
      if (!canAcquire(cur, now)) return { ok: false as const, reason: 'held' as const }
      const record: LockRecord = {
        ownerId,
        leaseUntil: now + leaseMs,
        fencingToken: (cur?.fencingToken ?? 0) + 1,
      }
      await txn.put(record)
      return { ok: true as const, record }
    })
  }

  /** owner + lease + token 三元组 CAS；成功则顺延 leaseUntil，token 不变 */
  async renew(
    exp: RenewExpectation,
    opts?: { leaseMs?: number; now?: number },
  ): Promise<{ ok: boolean; record: LockRecord | null }> {
    const now = opts?.now ?? Date.now()
    const leaseMs = opts?.leaseMs ?? this.defaultLeaseMs
    return this.store.runTxn(async (txn) => {
      const cur = await txn.get()
      if (!canRenew(cur, exp, now)) return { ok: false, record: cur }
      const record: LockRecord = { ...cur!, leaseUntil: now + leaseMs }
      await txn.put(record)
      return { ok: true, record }
    })
  }

  /** owner + token CAS（过期锁本人仍可释放）；成功后留**墓碑记录**——
   *  保留 fencingToken、清空 ownerId、leaseUntil=0（立即可被重新 acquire），
   *  保证 token 跨 acquire/release 周期严格单调，绝不归零（§19-4 的基础） */
  async release(exp: ReleaseExpectation): Promise<{ ok: boolean }> {
    return this.store.runTxn(async (txn) => {
      const cur = await txn.get()
      if (!canRelease(cur, exp)) return { ok: false }
      const tombstone: LockRecord = { ownerId: '', leaseUntil: 0, fencingToken: cur!.fencingToken }
      await txn.put(tombstone)
      return { ok: true }
    })
  }
}

/* ---------------- IndexedDB 事务存储（浏览器侧唯一实现） ---------------- */

const LOCK_KEY = 'lock'

/**
 * 打开（或创建）锁数据库并返回序列化事务存储。
 * 每个 runTxn = 一个 IDB readwrite transaction；同一时刻 IDB 保证同库事务串行化，
 * 从而 get→decide→put 在事务内原子（§3 的 CAS 语义由该串行化保证）。
 */
export function createIdbLockStore(dbName: string, storeName = 'migration-lock'): Promise<LockTxnStore> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName)
    }
    req.onsuccess = () => res(wrapIdb(req.result, storeName))
    req.onerror = () => rej(req.error ?? new Error('indexedDB.open failed'))
  })
}

function wrapIdb(db: IDBDatabase, storeName: string): LockTxnStore {
  return {
    runTxn<T>(fn: (txn: LockTxnView) => Promise<T>): Promise<T> {
      return new Promise<T>((res, rej) => {
        const tx = db.transaction(storeName, 'readwrite')
        const os = tx.objectStore(storeName)
        const view: LockTxnView = {
          get: () =>
            new Promise<LockRecord | null>((r, j) => {
              const q = os.get(LOCK_KEY)
              q.onsuccess = () => r((q.result as LockRecord | undefined) ?? null)
              q.onerror = () => j(q.error)
            }),
          put: (rec) =>
            new Promise<void>((r, j) => {
              const q = os.put(rec, LOCK_KEY)
              q.onsuccess = () => r()
              q.onerror = () => j(q.error)
            }),
          del: () =>
            new Promise<void>((r, j) => {
              const q = os.delete(LOCK_KEY)
              q.onsuccess = () => r()
              q.onerror = () => j(q.error)
            }),
        }
        let result: T
        fn(view)
          .then((r) => { result = r })
          .catch((e) => { try { tx.abort() } catch { /* already done */ } rej(e) })
        tx.oncomplete = () => res(result!)
        tx.onerror = () => rej(tx.error ?? new Error('lock txn failed'))
        tx.onabort = () => rej(tx.error ?? new Error('lock txn aborted'))
      })
    },
  }
}

/* ---------------- 内存事务存储（Node 测试用，模拟 IDB readwrite 串行化） ---------------- */

/** 建一个 Map 后备的序列化事务存储；`chain` 保证并发 runTxn 逐个执行（与 IDB 串行化同构） */
export function createMemoryLockStore(): LockTxnStore & { peek(): LockRecord | null } {
  const map = new Map<string, LockRecord>()
  let chain: Promise<unknown> = Promise.resolve()
  return {
    peek: () => map.get(LOCK_KEY) ?? null,
    runTxn<T>(fn: (txn: LockTxnView) => Promise<T>): Promise<T> {
      const p = chain.then(() =>
        fn({
          get: async () => map.get(LOCK_KEY) ?? null,
          put: async (rec) => { map.set(LOCK_KEY, rec) },
          del: async () => { map.delete(LOCK_KEY) },
        }),
      )
      chain = p.catch(() => {})
      return p as Promise<T>
    },
  }
}
