#!/usr/bin/env node
/**
 * P1.7 Wave 1-B · FencedWrite / MigrationWriteGuard 测试（Node 侧）
 *
 * 覆盖 v2.3.2 §4 验收判据：
 *   ② 过期 owner 的 staging 写入与 commit 请求 → 全部 FAIL；
 *   ③ 旧 token 的 staging 写入与 commit 请求 → guard FAIL + journal（phase/staging）不变；
 *   ④ kill-page：六位置崩溃模拟 → 恢复决策正确 + 恢复后状态一致。
 * （① 20 并发 acquire 属 Lock 协议，已在 W1A tests/migration-lock*.mjs 验收。）
 *
 * applySwitch 的「无 await 同步段」双证明：
 *   - 行为：函数返回时全部条目已生效（若有 await，返回时必然只应用了一部分）；
 *   - 结构：非 AsyncFunction + 源码无 'await'。
 *
 * 实现：vite ssrLoadModule 加载真实 TS；localStorage 用 Map 桩；
 * 内存串行事务存储模拟 IDB readwrite 串行化（与 createIdbFenceStore 同构）。
 * 真 IDB + 真 localStorage + 跨页签 kill-page 在 tests/fenced-write-browser.mjs。
 *
 * 用法：node tests/fenced-write.mjs
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

/* localStorage Map 桩（applySwitch 直接触达 globalThis.localStorage） */
const lsBacking = new Map()
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
  clear: () => lsBacking.clear(),
}
const lsSet = (k, v) => lsBacking.set(k, String(v))
const lsHas = (k) => lsBacking.has(k)
const lsGet = (k) => (lsBacking.has(k) ? lsBacking.get(k) : null)
const lsKeys = () => [...lsBacking.keys()].sort()

const server = await createServer({
  root: ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
})
const mod = await server.ssrLoadModule('/src/core/persistence/migration-write-guard.ts')
const {
  checkWrite, decideKillRecovery, MigrationWriteGuard, applySwitch,
  createMemoryFenceStore, FENCE_LOCK_KEY, stagingKey,
  decodeStagedValue,
} = mod

const NOW = 1_000_000_000
const LEASE = 30_000
const rec = (owner, token, leaseUntil) => ({ ownerId: owner, leaseUntil, fencingToken: token })
const exp = (owner, token) => ({ ownerId: owner, fencingToken: token })

function freshGuard() {
  lsBacking.clear()
  const store = createMemoryFenceStore()
  return { store, guard: new MigrationWriteGuard(store) }
}

/** 在 store 里直接放置锁记录（等价于 MigrationLock.acquire 的结果；本套件聚焦 guard 语义） */
async function putLock(store, owner, token, leaseUntil) {
  await store.runTxn(async (txn) => { await txn.put(FENCE_LOCK_KEY, rec(owner, token, leaseUntil)) })
}

/* ---------------- 1. checkWrite 纯决策 ---------------- */
console.log('== 1. checkWrite 纯决策函数 ==')
ok('无锁 → no-lock', checkWrite(null, exp('A', 1), NOW).reason === 'no-lock')
ok('owner 不符 → not-owner', checkWrite(rec('B', 1, NOW + LEASE), exp('A', 1), NOW).reason === 'not-owner')
ok('token 不符（旧 token）→ stale-token', checkWrite(rec('A', 6, NOW + LEASE), exp('A', 5), NOW).reason === 'stale-token')
ok('token 超前（伪造）→ stale-token', checkWrite(rec('A', 6, NOW + LEASE), exp('A', 7), NOW).reason === 'stale-token')
ok('leaseUntil < now → expired', checkWrite(rec('A', 1, NOW - 1), exp('A', 1), NOW).reason === 'expired')
ok('leaseUntil === now → expired（边界含等号，与 §3 一致）', checkWrite(rec('A', 1, NOW), exp('A', 1), NOW).reason === 'expired')
ok('owner+token+未过期 → ok', checkWrite(rec('A', 5, NOW + LEASE), exp('A', 5), NOW).ok === true)
ok('恰好未过期（leaseUntil = now+1）→ ok', checkWrite(rec('A', 5, NOW + 1), exp('A', 5), NOW).ok === true)

/* ---------------- 2. decideKillRecovery：5 相位穷举 total ---------------- */
console.log('== 2. decideKillRecovery total（穷举相位枚举） ==')
const PHASES = ['idle', 'staged', 'verified', 'committing', 'committed']
const EXPECT = { idle: 'RERUN', staged: 'RESUME', verified: 'RESUME', committing: 'REDO_SWITCH', committed: 'NOOP' }
let undefinedCount = 0
for (const phase of PHASES) {
  const action = decideKillRecovery(phase)
  if (action === undefined) undefinedCount++
  ok(`decideKillRecovery(${phase}) = ${EXPECT[phase]}`, action === EXPECT[phase], `got=${action}`)
}
ok('穷举 5 相位 → undefined=0（total）', undefinedCount === 0, 'phases=5 undefined=0')

/* ---------------- 3. guard.stage：fencing 拒绝 + journal 不变（验收②③） ---------------- */
console.log('== 3. guard.stage：fencing ==')
{
  const { store, guard } = freshGuard()
  await putLock(store, 'A', 5, NOW + LEASE)
  const entries = [{ key: 'gt.new', value: 'v1' }]
  const r1 = await guard.stage(entries, exp('A', 5), NOW)
  ok('合法 owner+token staging → ok', r1.ok === true)
  ok('staging 落库（编码后解码 = 原值）', decodeStagedValue(await store.runTxn(async (t) => t.get(stagingKey('gt.new')))) === 'v1')
  ok('phase → staged', (await guard.getPhase()) === 'staged')

  // 旧 token 写入 → FAIL + staging/phase 完全不变（验收③）
  const r2 = await guard.stage([{ key: 'gt.evil', value: 'x' }], exp('A', 4), NOW)
  ok('旧 token（4 < 5）staging → FAIL stale-token', !r2.ok && r2.reason === 'stale-token')
  ok('拒绝后 staging 无新增（gt.evil 未落库）', (await store.runTxn(async (t) => t.keys(stagingKey('')))).length === 1)
  ok('拒绝后 phase 不变（仍 staged）', (await guard.getPhase()) === 'staged')

  // 非 owner → FAIL
  const r3 = await guard.stage(entries, exp('B', 5), NOW)
  ok('非 owner staging → FAIL not-owner', !r3.ok && r3.reason === 'not-owner')
  // token 超前伪造 → FAIL
  const r4 = await guard.stage(entries, exp('A', 6), NOW)
  ok('伪造超前 token staging → FAIL stale-token', !r4.ok && r4.reason === 'stale-token')
}

/* ---------------- 4. 过期 owner：staging / markVerified / requestCommit 全 FAIL（验收②） ---------------- */
console.log('== 4. 过期 owner 全链 FAIL ==')
{
  const { store, guard } = freshGuard()
  await putLock(store, 'A', 5, NOW + 10) // 即将过期
  const e = exp('A', 5)
  ok('过期前 markVerified → ok', (await guard.markVerified(e, NOW)).ok === true)
  const rStage = await guard.stage([{ key: 'k', value: 'v' }], e, NOW + 10) // leaseUntil === now → 过期
  ok('过期后 staging → FAIL expired', !rStage.ok && rStage.reason === 'expired')
  const rVerify = await guard.markVerified(e, NOW + 10)
  ok('过期后 markVerified → FAIL expired', !rVerify.ok && rVerify.reason === 'expired')
  const rCommit = await guard.requestCommit(e, { now: NOW + 10 })
  ok('过期后 requestCommit → FAIL expired', !rCommit.ok && rCommit.reason === 'expired')
  ok('全部拒绝后 phase 不变（仍 verified）', (await guard.getPhase()) === 'verified')
  ok('全部拒绝后 marker 不存在', (await guard.getMarker()) === null)
}

/* ---------------- 5. requestCommit：四项确认 + renew 同事务覆盖窗口 ---------------- */
console.log('== 5. requestCommit 四项确认 ==')
{
  const { store, guard } = freshGuard()
  await putLock(store, 'A', 5, NOW + 5) // lease 只剩 5ms，checkWrite 仍通过（>now）
  const entries = [{ key: 'gt.a', value: '1' }, { key: 'gt.b', value: '2' }]
  await guard.stage(entries, exp('A', 5), NOW)
  const r = await guard.requestCommit(exp('A', 5), { now: NOW + 3, leaseMs: LEASE })
  ok('① token 再确认 + ② lease 有效 → 授予 ok', r.ok === true)
  ok('marker.entries 完整（2 条，来自 staging）', r.ok && r.marker.entries.length === 2)
  ok('③ renew 同事务：leaseUntil = now + leaseMs（覆盖切换窗口）', r.ok && (await store.runTxn(async (t) => t.get(FENCE_LOCK_KEY))).leaseUntil === NOW + 3 + LEASE)
  ok('marker 持有授予时身份', r.ok && r.marker.ownerId === 'A' && r.marker.fencingToken === 5)
  ok('phase → committing', (await guard.getPhase()) === 'committing')
  // 旧 token commit 请求 → FAIL + 无 marker（验收③ commit 侧）
  {
    const { store: s2, guard: g2 } = freshGuard()
    await putLock(s2, 'A', 6, NOW + LEASE)
    await g2.stage(entries, exp('A', 6), NOW)
    const rOld = await g2.requestCommit(exp('A', 5), { now: NOW })
    ok('旧 token commit 请求 → FAIL stale-token', !rOld.ok && rOld.reason === 'stale-token')
    ok('拒绝后无 marker', (await g2.getMarker()) === null)
    ok('拒绝后 phase 不变（仍 staged）', (await g2.getPhase()) === 'staged')
  }
}

/* ---------------- 6. applySwitch：同步段双证明 + 幂等 + REMOVE OLD 顺序 ---------------- */
console.log('== 6. applySwitch 同步切换 ==')
{
  lsBacking.clear()
  lsSet('gt.old', 'legacy') // 旧键待 REMOVE
  const entries = [{ key: 'gt.new1', value: 'a' }, { key: 'gt.new2', value: 'b' }, { key: 'gt.old', value: null }]
  applySwitch(entries)
  // 行为证明：返回时全部生效（若函数内部有 await，返回时只有第一条生效）
  ok('行为证明：返回时全部条目已生效（同步段）', lsGet('gt.new1') === 'a' && lsGet('gt.new2') === 'b' && !lsHas('gt.old'))
  // 结构证明：非 AsyncFunction + 源码无 await
  ok('结构证明：applySwitch 非 AsyncFunction', applySwitch.constructor.name === 'Function')
  ok('结构证明：源码无 await', !applySwitch.toString().includes('await'))
  // 幂等
  applySwitch(entries)
  ok('幂等：整表重放结果不变', lsGet('gt.new1') === 'a' && lsGet('gt.new2') === 'b' && !lsHas('gt.old'))
  // REMOVE OLD 顺序契约：removal 条目排在写入之后生效（重放含 re-remove 不复活旧键）
  ok('REMOVE OLD 生效（旧键已移除）', !lsHas('gt.old'))
  lsSet('gt.old', 'resurrected') // 模拟异常复活
  applySwitch(entries)
  ok('重放再次清除复活旧键', !lsHas('gt.old'))
}

/* ---------------- 7. finalize / redo / reset ---------------- */
console.log('== 7. finalize / redoSwitch / reset ==')
{
  const { store, guard } = freshGuard()
  await putLock(store, 'A', 5, NOW + LEASE)
  const r0 = await guard.finalizeCommit()
  ok('非 committing 相位 finalize → FAIL no-marker', !r0.ok && r0.reason === 'no-marker')
  const entries = [{ key: 'gt.x', value: '1' }]
  await guard.stage(entries, exp('A', 5), NOW)
  const r = await guard.requestCommit(exp('A', 5), { now: NOW })
  ok('requestCommit → ok', r.ok === true)
  const rd = await guard.redoSwitch((es) => applySwitch(es))
  ok('redoSwitch（committing 中）→ ok 且重放生效', rd.ok === true && lsGet('gt.x') === '1')
  const rf = await guard.finalizeCommit()
  ok('finalize → ok，phase=committed', rf.ok === true && (await guard.getPhase()) === 'committed')
  ok('finalize 后 staging 已清', (await store.runTxn(async (t) => t.keys(stagingKey('')))).length === 0)
  ok('finalize 后 marker 已删', (await guard.getMarker()) === null)
  const rf2 = await guard.finalizeCommit()
  ok('finalize 幂等（committed 再 finalize → ok）', rf2.ok === true)
  const rr = await guard.reset()
  ok('committed 相位 reset → ok（清理重跑合法）', rr.ok === true && (await guard.getPhase()) === 'idle')
  // committing 期间 reset 必须拒绝（REDO 而非丢弃）
  {
    const { store: s2, guard: g2 } = freshGuard()
    await putLock(s2, 'A', 5, NOW + LEASE)
    await g2.stage(entries, exp('A', 5), NOW)
    await g2.requestCommit(exp('A', 5), { now: NOW })
    const rReset = await g2.reset()
    ok('committing 相位 reset → 拒绝（committing-locked，防丢已授予提交）', !rReset.ok && rReset.reason === 'committing-locked')
    ok('拒绝后 marker 仍在', (await g2.getMarker()) !== null)
  }
}

/* ---------------- 8. kill-page 六位置（Node 模拟；真 IDB 版在 browser 套件） ---------------- */
console.log('== 8. kill-page 六位置模拟 ==')
const OLD_DATA = { 'gt.learning.v2': 'old-payload', 'gt.settings': 'old-settings' }
const EXPECT_DECISION = {
  'P1-before-stage': 'RERUN',
  'P2-after-stage': 'RESUME',
  'P3-after-verify': 'RESUME',
  'P4-after-marker': 'REDO_SWITCH',
  'P5-mid-setItem': 'REDO_SWITCH',
  'P6-after-removeItem': 'REDO_SWITCH',
}
ok('六位置决策映射表自校验（恰 6 位置）', Object.keys(EXPECT_DECISION).length === 6)

async function killAt(position) {
  // 每个位置独立沙箱：旧 localStorage 数据 + 新迁移流程推进到 position 后「进程死亡」
  const { store, guard } = freshGuard()
  lsBacking.clear()
  for (const [k, v] of Object.entries(OLD_DATA)) lsSet(k, v)
  await putLock(store, 'A', 5, NOW + LEASE)
  const e = exp('A', 5)
  const entries = [{ key: 'gt.learning.v2', value: 'new-payload' }, { key: 'gt.settings', value: 'new-settings' }]
  const step = async () => {
    if (position === 'P1-before-stage') return // 死于 staging 前
    await guard.stage(entries, e, NOW)
    if (position === 'P2-after-stage') return
    await guard.markVerified(e, NOW)
    if (position === 'P3-after-verify') return
    const r = await guard.requestCommit(e, { now: NOW, leaseMs: LEASE })
    if (!r.ok) throw new Error('requestCommit unexpectedly failed')
    if (position === 'P4-after-marker') return // 死于 marker 后、同步切换前
    if (position === 'P5-mid-setItem') {
      // 死于同步切换中途：只应用了前 1 条（真实世界 = 同步块被页面死亡截断）
      applySwitch(r.marker.entries.slice(0, 1))
      return
    }
    if (position === 'P6-after-removeItem') {
      applySwitch(r.marker.entries) // 全部应用完但未 finalize 即死亡
      return
    }
  }
  try { await step() } catch { /* 进程死亡不清理 */ }
  return { store, guard, phase: await guard.getPhase(), marker: await guard.getMarker() }
}

for (const position of ['P1-before-stage', 'P2-after-stage', 'P3-after-verify', 'P4-after-marker', 'P5-mid-setItem', 'P6-after-removeItem']) {
  const { guard, phase, marker } = await killAt(position)
  const action = decideKillRecovery(phase)
  console.log(`  -- ${position}: phase=${phase} → recovery=${action}`)
  ok(`${position}: 恢复决策正确`, action === EXPECT_DECISION[position], `action=${action}`)

  // 崩溃时刻不变量
  if (position === 'P1-before-stage') {
    ok(`${position}: 旧 localStorage 完整`, lsGet('gt.learning.v2') === 'old-payload' && lsGet('gt.settings') === 'old-settings')
  }
  if (position === 'P2-after-stage' || position === 'P3-after-verify') {
    ok(`${position}: 旧 localStorage 完整（切换未开始）`, lsGet('gt.learning.v2') === 'old-payload' && lsGet('gt.settings') === 'old-settings')
    ok(`${position}: marker 不存在（未授予）`, marker === null)
  }
  if (position === 'P4-after-marker') {
    ok(`${position}: marker 已固化（entries 可重放）`, marker !== null && marker.entries.length === 2)
  }
  if (position === 'P5-mid-setItem') {
    ok(`${position}: 部分切换可见（gt.learning.v2 已新、gt.settings 未动）`, lsGet('gt.learning.v2') === 'new-payload' && lsGet('gt.settings') === 'old-settings')
    ok(`${position}: marker 完整可重放`, marker !== null && marker.entries.length === 2)
  }
  if (position === 'P6-after-removeItem') {
    ok(`${position}: 切换已生效但未 finalize`, lsGet('gt.learning.v2') === 'new-payload' && lsGet('gt.settings') === 'new-settings')
  }

  // 恢复动作执行（重启后的编排者）
  if (action === 'RESUME') {
    // 原 owner 续走：verify（幂等）→ requestCommit → 同步切换 → finalize
    const e = exp('A', 5)
    const r1 = await guard.markVerified(e, NOW)
    const r2 = await guard.requestCommit(e, { now: NOW, leaseMs: LEASE })
    if (r2.ok) applySwitch(r2.marker.entries)
    const r3 = await guard.finalizeCommit()
    ok(`${position}: RESUME 续走至 committed`, r1.ok && r2.ok && r3.ok && (await guard.getPhase()) === 'committed')
  } else if (action === 'REDO_SWITCH') {
    // 重启编排者以新 token 重新 acquire（锁可能已易主/过期）——重放凭 marker，不凭旧 token
    const rd = await guard.redoSwitch((es) => applySwitch(es))
    const rf = await guard.finalizeCommit()
    ok(`${position}: REDO_SWITCH 重放 + finalize → committed`, rd.ok && rf.ok && (await guard.getPhase()) === 'committed')
  } else if (action === 'RERUN') {
    const rr = await guard.reset()
    ok(`${position}: RERUN reset → idle 可重跑`, rr.ok && (await guard.getPhase()) === 'idle')
  } else if (action === 'NOOP') {
    ok(`${position}: NOOP（已 committed，无需动作）`, true)
  }

  // 恢复后终态一致性
  if (position !== 'P1-before-stage') {
    ok(`${position}: 恢复后新数据生效`, lsGet('gt.learning.v2') === 'new-payload' && lsGet('gt.settings') === 'new-settings')
    ok(`${position}: 恢复后旧数据无残留`, lsKeys().every((k) => ['gt.learning.v2', 'gt.settings'].includes(k)))
  }
}

/* ---------------- 9. 旧 token 全链路端到端（§19-4） ---------------- */
console.log('== 9. 旧 token 永不覆盖（§19-4 端到端） ==')
{
  const { store, guard } = freshGuard()
  await putLock(store, 'A', 5, NOW + LEASE)
  await guard.stage([{ key: 'gt.data', value: 'from-A-token5' }], exp('A', 5), NOW)
  // A 的 lease 过期 → B 抢锁（token=6）
  await putLock(store, 'B', 6, NOW + 2 * LEASE)
  const aStage = await guard.stage([{ key: 'gt.data', value: 'from-A-token5-stale' }], exp('A', 5), NOW + LEASE)
  const aCommit = await guard.requestCommit(exp('A', 5), { now: NOW + LEASE })
  ok('旧 owner 旧 token：staging FAIL', !aStage.ok && aStage.reason === 'not-owner')
  ok('旧 owner 旧 token：commit FAIL', !aCommit.ok)
  ok('staging 数据仍是 B 可见的 A-token5 版本（未被 stale 覆盖）', decodeStagedValue(await store.runTxn(async (t) => t.get(stagingKey('gt.data')))) === 'from-A-token5')
  const bCommit = await guard.requestCommit(exp('B', 6), { now: NOW + LEASE })
  ok('当前 owner token=6 commit → ok（fencing chain write 侧闭合）', bCommit.ok === true && bCommit.marker.fencingToken === 6)
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
