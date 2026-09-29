#!/usr/bin/env node
/**
 * P1.7 Wave 1-A · Migration Lock 协议测试（Node 侧）
 *
 * 覆盖用户验收清单：acquire / renew / release / expired / stale owner / CAS race /
 * fencing token / double writer / old writer rejected。
 * 实现：vite ssrLoadModule 加载真实 TS（src/core/persistence/migration-lock.ts），
 * 内存串行事务存储模拟 IDB readwrite 串行化语义（与 createIdbLockStore 同构）。
 * 真 IDB 并发在 tests/migration-lock-browser.mjs。
 *
 * 用法：node tests/migration-lock.mjs
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const server = await createServer({
  root: ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
})
const mod = await server.ssrLoadModule('/src/core/persistence/migration-lock.ts')
const {
  canAcquire, canRenew, canRelease, isExpired,
  MigrationLock, createMemoryLockStore,
} = mod

const NOW = 1_000_000_000
const lease = 30_000

/* ---------------- 1. 纯决策函数 ---------------- */
console.log('== 1. 纯决策函数 ==')
const rec = { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 7 }
ok('isExpired: leaseUntil < now → 过期', isExpired({ ...rec, leaseUntil: NOW - 1 }, NOW))
ok('isExpired: leaseUntil === now → 过期（边界含等号）', isExpired({ ...rec, leaseUntil: NOW }, NOW))
ok('isExpired: 未过期 → false', !isExpired(rec, NOW + lease - 1))
ok('canAcquire: 无锁 → true', canAcquire(null, NOW))
ok('canAcquire: 已过期 → true', canAcquire({ ...rec, leaseUntil: NOW }, NOW))
ok('canAcquire: 未过期持有中 → false', !canAcquire(rec, NOW + lease - 1))
ok('canRenew: 三元组精确匹配且未过期 → true', canRenew(rec, { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 7 }, NOW))
ok('canRenew: owner 不符 → false', !canRenew(rec, { ownerId: 'B', leaseUntil: NOW + lease, fencingToken: 7 }, NOW))
ok('canRenew: token 不符 → false', !canRenew(rec, { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 8 }, NOW))
ok('canRenew: leaseUntil 不符 → false', !canRenew(rec, { ownerId: 'A', leaseUntil: NOW + 1, fencingToken: 7 }, NOW))
ok('canRenew: 已过期 → false', !canRenew(rec, { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 7 }, NOW + lease))
ok('canRelease: owner+token 匹配 → true（过期锁本人可释放）', canRelease({ ...rec, leaseUntil: NOW }, { ownerId: 'A', fencingToken: 7 }))
ok('canRelease: token 不符 → false', !canRelease(rec, { ownerId: 'A', fencingToken: 8 }))
ok('canRelease: owner 不符 → false', !canRelease(rec, { ownerId: 'B', fencingToken: 7 }))
ok('canRelease: 无锁 → false', !canRelease(null, { ownerId: 'A', fencingToken: 7 }))

/* ---------------- 2. acquire ---------------- */
console.log('== 2. acquire ==')
{
  const store = createMemoryLockStore()
  const lock = new MigrationLock(store)
  const r1 = await lock.acquire('A', { leaseMs: lease, now: NOW })
  ok('空锁 acquire → 成功，fencingToken=1', r1.ok && r1.record.fencingToken === 1)
  ok('leaseUntil = now + lease', r1.ok && r1.record.leaseUntil === NOW + lease)
  const r2 = await lock.acquire('B', { leaseMs: lease, now: NOW + 1 })
  ok('未过期持有中 acquire → FAIL(held)', !r2.ok && r2.reason === 'held')
  const r3 = await lock.acquire('B', { leaseMs: lease, now: NOW + lease })
  ok('过期后 acquire → 成功，fencingToken=旧+1', r3.ok && r3.record.fencingToken === 2)
}

/* ---------------- 3. renew / release ---------------- */
console.log('== 3. renew / release ==')
{
  const store = createMemoryLockStore()
  const lock = new MigrationLock(store)
  const a = await lock.acquire('A', { leaseMs: lease, now: NOW })
  const exp = { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 1 }
  const rn = await lock.renew(exp, { leaseMs: lease, now: NOW + 1 })
  ok('renew 三元组匹配 → 成功且 token 不变', rn.ok && rn.record.fencingToken === 1)
  ok('renew 后 leaseUntil 顺延', rn.ok && rn.record.leaseUntil === NOW + 1 + lease)
  const rnBad = await lock.renew(exp, { leaseMs: lease, now: NOW + 2 })
  ok('renew 用旧 leaseUntil（journal 值过期）→ FAIL', !rnBad.ok)
  const rl = await lock.release({ ownerId: 'A', fencingToken: 1 })
  ok('release owner+token 匹配 → 成功', rl.ok)
  ok('release 后留墓碑（ownerId 清空、token 保留）', (() => {
    const t = store.peek()
    return t !== null && t.ownerId === '' && t.leaseUntil === 0 && t.fencingToken === 1
  })())
  const rl2 = await lock.release({ ownerId: 'A', fencingToken: 1 })
  ok('重复 release（墓碑 ownerId 不匹配）→ FAIL', !rl2.ok)
}

/* ---------------- 4. stale owner / fencing（double writer） ---------------- */
console.log('== 4. stale owner / fencing ==')
{
  const store = createMemoryLockStore()
  const lock = new MigrationLock(store)
  await lock.acquire('A', { leaseMs: lease, now: NOW })
  // A 租约过期，B 抢占（token 2）
  const b = await lock.acquire('B', { leaseMs: lease, now: NOW + lease })
  ok('过期抢占 → B 成功 token=2', b.ok && b.record.fencingToken === 2)
  // A 复活，以为自己还是 owner（token 1）——renew / release / 再次 acquire 必须全部失败
  const aRenew = await lock.renew({ ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 1 }, { leaseMs: lease, now: NOW + lease + 1 })
  ok('stale owner renew → FAIL（token/owner 不符）', !aRenew.ok)
  const aRelease = await lock.release({ ownerId: 'A', fencingToken: 1 })
  ok('stale owner release → FAIL', !aRelease.ok)
  const aAcquire = await lock.acquire('A', { leaseMs: lease, now: NOW + lease + 1 })
  ok('stale owner 正常 acquire（未过期持有中）→ FAIL(held)', !aAcquire.ok && aAcquire.reason === 'held')
  ok('B 的锁未被 A 破坏（owner 仍为 B）', store.peek().ownerId === 'B' && store.peek().fencingToken === 2)
  // B 释放后 A 重新 acquire → token 继续单调（3）
  await lock.release({ ownerId: 'B', fencingToken: 2 })
  const c = await lock.acquire('C', { leaseMs: lease, now: NOW + lease + 2 })
  ok('token 严格单调递增（跨 owner 持续 +1）', c.ok && c.record.fencingToken === 3)
}

/* ---------------- 5. CAS race：20 并发 acquire ---------------- */
console.log('== 5. CAS race（20 并发） ==')
{
  const store = createMemoryLockStore()
  const lock = new MigrationLock(store)
  const owners = Array.from({ length: 20 }, (_, i) => `owner-${i}`)
  const results = await Promise.all(owners.map((o) => lock.acquire(o, { leaseMs: lease, now: NOW })))
  const winners = results.filter((r) => r.ok)
  ok('20 并发 acquire → 恰好 1 个成功', winners.length === 1)
  ok('胜者 token=1', winners[0]?.record.fencingToken === 1)
  ok('19 个失败 reason=held', results.filter((r) => !r.ok && r.reason === 'held').length === 19)
}
{
  // 过期锁上的 20 并发抢占：恰 1 个成功，token = 旧+1
  const store = createMemoryLockStore()
  const lock = new MigrationLock(store)
  await lock.acquire('OLD', { leaseMs: 10, now: NOW }) // token 1，NOW+10 过期
  const owners = Array.from({ length: 20 }, (_, i) => `owner-${i}`)
  const results = await Promise.all(owners.map((o) => lock.acquire(o, { leaseMs: lease, now: NOW + 10 })))
  const winners = results.filter((r) => r.ok)
  ok('过期锁上 20 并发抢占 → 恰好 1 个成功', winners.length === 1)
  ok('胜者 fencingToken = 旧+1 = 2', winners[0]?.record.fencingToken === 2)
}

/* ---------------- 6. 双实例 double writer ---------------- */
console.log('== 6. 双实例 double writer ==')
{
  const store = createMemoryLockStore()
  const lockA = new MigrationLock(store)
  const lockB = new MigrationLock(store)
  await lockA.acquire('A', { leaseMs: lease, now: NOW })
  const bTry = await lockB.acquire('B', { leaseMs: lease, now: NOW + 1 })
  ok('实例 B acquire → FAIL（跨实例共享存储）', !bTry.ok)
  await lockA.release({ ownerId: 'A', fencingToken: 1 })
  const bOk = await lockB.acquire('B', { leaseMs: lease, now: NOW + 2 })
  ok('A 释放后 B acquire → 成功 token=2', bOk.ok && bOk.record.fencingToken === 2)
  // A（stale，token1）在 B 持有期 renew/release 全部失败
  const aStaleRenew = await lockA.renew({ ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 1 }, { now: NOW + 3 })
  const aStaleRelease = await lockA.release({ ownerId: 'A', fencingToken: 1 })
  ok('stale A 的 renew 与 release 均 FAIL', !aStaleRenew.ok && !aStaleRelease.ok)
}

/* ---------------- 汇总 ---------------- */
console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
if (fail > 0) { console.log('失败项：', failuresText(fail, pass)) }
console.log('──────────────────────────────────────────────────────')
function failuresText() { return '见上方 ❌' }
await server.close()
process.exit(fail > 0 ? 1 : 0)
