#!/usr/bin/env node
/**
 * P1.7 Wave 1-D · Migration Orchestrator 测试（Wave 1 出口整合）
 *
 * 覆盖：RUN 全流水线（含 R5 staging 验证 + COMMIT 同步切换 + REMOVE OLD）/
 * R5 违规 → failed + 旧数据完整 / corrupt 源 → CORRUPT_STATE 终止 /
 * kill-after-stage → RESUME / kill-after-marker → COMMIT（marker 重放）/
 * lock-held 终止 / CLEANUP_OLD 重放。
 *
 * 实现：vite ssrLoadModule 加载真实 TS；localStorage Map 桩；
 * lock 与 guard 共用同一内存 map（镜像浏览器共库 IDB 语义）。
 *
 * 用法：node tests/migration-orchestrator.mjs
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const lsBacking = new Map()
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
  clear: () => lsBacking.clear(),
}
const lsSet = (k, v) => lsBacking.set(k, String(v))
const lsGet = (k) => (lsBacking.has(k) ? lsBacking.get(k) : null)
const lsHas = (k) => lsBacking.has(k)

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const guardMod = await server.ssrLoadModule('/src/core/persistence/migration-write-guard.ts')
const orchMod = await server.ssrLoadModule('/src/core/persistence/migration-orchestrator.ts')
const { createMemoryFenceStore, FENCE_LOCK_KEY } = guardMod
const { MigrationOrchestrator } = orchMod

const NOW = 1_000_000_000

/** 合成域：app.data.v1（records 数组）→ app.data.v2:<id>（每键一条）+ REMOVE OLD */
function makeDef(overrides = {}) {
  return {
    migrationId: 'app-data-1-2',
    targetVersion: 'migration-2',
    sourceKeys: ['app.data.v1'],
    isTargetKey: (k) => k.startsWith('app.data.v2:'),
    expectedTargetCount: 3,
    removalKeys: ['app.data.v1'],
    validate: (k, v) => {
      const recs = v.records
      if (!Array.isArray(recs)) throw new Error('records must be array')
      for (const r of recs) {
        if (typeof r.id !== 'string') throw new Error('id required')
        if (!['active', 'archived'].includes(r.status)) throw new Error(`bad status: ${r.status}`)
      }
    },
    transform: (k, v) => v.records.map((r) => ({ key: `app.data.v2:${r.id}`, value: JSON.stringify(r) })),
    toR5Records: (k, v) => v.records.map((r) => ({ id: r.id, refs: r.refs ?? [], enums: { status: r.status } })),
    toR5RecordsFromStaging: (entries) =>
      entries
        .filter((e) => e.value !== null)
        .map((e) => {
          const r = JSON.parse(e.value)
          return { id: r.id, refs: r.refs ?? [], enums: { status: r.status } }
        }),
    r5Spec: { validEnums: { status: ['active', 'archived'] } },
    sourceFingerprint: 'synthetic-seed',
    read: () => Object.fromEntries([...lsBacking.keys()].map((k) => [k, lsBacking.get(k)])),
    ...overrides,
  }
}

function seed() {
  lsBacking.clear()
  const records = [
    { id: 'r1', refs: ['r2'], status: 'active' },
    { id: 'r2', status: 'archived' },
    { id: 'r3', refs: ['r1'], status: 'active' },
  ]
  lsSet('app.data.v1', JSON.stringify({ records }))
  return records
}

/** lock 与 guard 共用同一内存 map（镜像共库 IDB 串行化语义） */
function freshOrchestrator() {
  // 这里**不能**加 `_` 前缀：下面 lockStore 的闭包与 return 都在引用 `mem`（lint 只报声明点、
  // 报不到引用点，改成 `_mem` 会留下一个裸标识符引用 ⇒ ReferenceError）。
  const mem = createMemoryFenceStore()
  const lockStore = {
    runTxn: (fn) =>
      mem.runTxn(async (txn) =>
        fn({
          get: () => txn.get(FENCE_LOCK_KEY),
          put: (rec) => txn.put(FENCE_LOCK_KEY, rec),
          del: () => txn.del(FENCE_LOCK_KEY),
        }),
      ),
  }
  return { mem, orch: new MigrationOrchestrator(lockStore, mem) }
}

async function putLock(mem, owner, token, leaseUntil) {
  await mem.runTxn(async (t) => { await t.put(FENCE_LOCK_KEY, { ownerId: owner, leaseUntil, fencingToken: token }) })
}

/* ---------------- 1. RUN 全流水线 ---------------- */
console.log('== 1. RUN 全流水线 ==')
{
  seed()
  const { mem, orch } = freshOrchestrator()
  const rep = await orch.run(makeDef(), { now: NOW })
  ok('报告 committed=true', rep.committed === true && rep.aborted === false, rep.reason ?? '')
  ok('恢复决策 = RUN（pending+complete+missing）', rep.recovery.action === 'RUN')
  ok('新键 3 条落 localStorage', ['r1', 'r2', 'r3'].every((id) => lsGet(`app.data.v2:${id}`) !== null))
  ok('REMOVE OLD：旧键已移除', !lsHas('app.data.v1'))
  ok('journal phase=committed', (await orch.getJournal('app-data-1-2')).phase === 'committed')
  const lock = await mem.runTxn(async (t) => t.get(FENCE_LOCK_KEY))
  ok('锁已释放（墓碑：owner 空、token 保留）', lock.ownerId === '' && lock.fencingToken === 1)
  // 幂等：再跑一次 → COMPLETE
  const rep2 = await orch.run(makeDef(), { now: NOW })
  ok('重复运行 → COMPLETE（committed=true）', rep2.committed === true && rep2.recovery.action === 'COMPLETE')
}

/* ---------------- 2. R5 违规 → failed + 旧数据完整 ---------------- */
console.log('== 2. R5 违规路径 ==')
{
  seed()
  const { orch } = freshOrchestrator()
  // transform 丢一条记录（r2 缺失 → identity set 不等）
  const badDef = makeDef({
    transform: (k, v) => v.records.filter((r) => r.id !== 'r2').map((r) => ({ key: `app.data.v2:${r.id}`, value: JSON.stringify(r) })),
    expectedTargetCount: 2,
  })
  const rep = await orch.run(badDef, { now: NOW })
  ok('R5 违规 → aborted=true', rep.aborted === true && rep.committed === false)
  ok('失败原因 = R5 违规', (rep.reason ?? '').includes('R5'))
  ok('r5 结果随报告返回：identitySetEqual=false', rep.r5 !== null && rep.r5.identitySetEqual === false)
  ok('旧 localStorage 完整（切换前零写入）', lsHas('app.data.v1') && lsGet('app.data.v2:r1') === null)
  ok('journal phase=failed', (await orch.getJournal('app-data-1-2')).phase === 'failed')
  // 修复后重跑 → RERUN → committed
  const rep2 = await orch.run(makeDef(), { now: NOW })
  ok('RERUN（failed+complete+missing）→ committed', rep2.recovery.action === 'RERUN' && rep2.committed === true)
  ok('RERUN 后新键完整', ['r1', 'r2', 'r3'].every((id) => lsGet(`app.data.v2:${id}`) !== null))
}

/* ---------------- 3. corrupt 源 → CORRUPT_STATE 终止 ---------------- */
console.log('== 3. corrupt 终止 ==')
{
  seed()
  lsSet('app.data.v1', '{not-json')
  const { orch } = freshOrchestrator()
  const rep = await orch.run(makeDef(), { now: NOW })
  ok('CORRUPT_STATE → aborted', rep.recovery.action === 'CORRUPT_STATE' && rep.aborted === true)
  ok('旧数据未被触碰', lsGet('app.data.v1') === '{not-json')
  ok('journal 未建立（终端决策不写 journal）', (await orch.getJournal('app-data-1-2')) === null)
}

/* ---------------- 4. kill-after-stage → RESUME ---------------- */
console.log('== 4. kill-after-stage → RESUME ==')
{
  seed()
  const { mem, orch } = freshOrchestrator()
  // 模拟：上一进程拿到锁、stage 完成后死亡（journal=running、fence=staged、无 marker；
  // lease 已过期 —— 否则 RESUME 会被 lock-held 正确拦截）
  const records = JSON.parse(lsGet('app.data.v1')).records
  await putLock(mem, 'dead-owner', 1, NOW)
  const g = new guardMod.MigrationWriteGuard(mem)
  const entries = records.map((r) => ({ key: `app.data.v2:${r.id}`, value: JSON.stringify(r) }))
  await g.stage(entries, { ownerId: 'dead-owner', fencingToken: 1 }, NOW - 60_000)
  await mem.runTxn(async (t) => {
    await t.put('journal:app-data-1-2', { migrationId: 'app-data-1-2', phase: 'running', targetVersion: 'migration-2', sourceFingerprint: 'synthetic-seed', startedAt: NOW, updatedAt: NOW, finishedAt: null })
  })
  const rep = await orch.run(makeDef(), { now: NOW + 1000 })
  ok('恢复决策 = RESUME（running+complete+missing）', rep.recovery.action === 'RESUME')
  ok('RESUME 续走 → committed', rep.committed === true)
  ok('新键完整 + 旧键移除', ['r1', 'r2', 'r3'].every((id) => lsGet(`app.data.v2:${id}`) !== null) && !lsHas('app.data.v1'))
  ok('journal phase=committed', (await orch.getJournal('app-data-1-2')).phase === 'committed')
}

/* ---------------- 5. kill-after-marker → COMMIT（marker 重放） ---------------- */
console.log('== 5. kill-after-marker → COMMIT 重放 ==')
{
  seed()
  const { mem, orch } = freshOrchestrator()
  // 模拟：上一进程 journal=verified + requestCommit 已授予（marker 在）+ 同步切换前死亡
  const records = JSON.parse(lsGet('app.data.v1')).records
  await putLock(mem, 'dead-owner', 1, NOW + 60_000)
  const g = new guardMod.MigrationWriteGuard(mem)
  // 与真实编排器一致：staged entries 末尾含 REMOVE OLD 条目（§19-5）
  const entries = [...records.map((r) => ({ key: `app.data.v2:${r.id}`, value: JSON.stringify(r) })), { key: 'app.data.v1', value: null }]
  await g.stage(entries, { ownerId: 'dead-owner', fencingToken: 1 }, NOW)
  await g.markVerified({ ownerId: 'dead-owner', fencingToken: 1 }, NOW)
  await mem.runTxn(async (t) => {
    const j = { migrationId: 'app-data-1-2', phase: 'verified', targetVersion: 'migration-2', sourceFingerprint: 'synthetic-seed', startedAt: NOW, updatedAt: NOW, finishedAt: null }
    await t.put('journal:app-data-1-2', j)
  })
  const cm = await g.requestCommit({ ownerId: 'dead-owner', fencingToken: 1 }, { now: NOW })
  if (!cm.ok) throw new Error('setup requestCommit failed')
  ok('setup：marker 已授予且 localStorage 未动', lsGet('app.data.v2:r1') === null && lsHas('app.data.v1'))
  const rep = await orch.run(makeDef(), { now: NOW + 1000 })
  ok('恢复决策 = COMMIT（verified+complete+missing）', rep.recovery.action === 'COMMIT')
  ok('marker 重放 → committed', rep.committed === true, rep.reason ?? '')
  ok('重放后新键完整 + 旧键移除', ['r1', 'r2', 'r3'].every((id) => lsGet(`app.data.v2:${id}`) !== null) && !lsHas('app.data.v1'))
  ok('journal phase=committed', (await orch.getJournal('app-data-1-2')).phase === 'committed')
}

/* ---------------- 6. lock-held 终止 ---------------- */
console.log('== 6. lock-held ==')
{
  seed()
  const { mem, orch } = freshOrchestrator()
  await putLock(mem, 'another-owner', 5, NOW + 60_000)
  const rep = await orch.run(makeDef(), { now: NOW })
  ok('锁被他人持有 → aborted lock-held', rep.aborted === true && (rep.reason ?? '').includes('lock-held'))
  ok('旧数据未动', lsGet('app.data.v1') !== null && lsGet('app.data.v2:r1') === null)
}

/* ---------------- 7. CLEANUP_OLD 重放 ---------------- */
console.log('== 7. CLEANUP_OLD ==')
{
  seed()
  const { mem, orch } = freshOrchestrator()
  // 模拟：切换已完成（新键在、旧键还在）、journal=committed、REMOVE OLD 崩溃未执行
  const records = JSON.parse(lsGet('app.data.v1')).records
  for (const r of records) lsSet(`app.data.v2:${r.id}`, JSON.stringify(r))
  await mem.runTxn(async (t) => {
    await t.put('journal:app-data-1-2', { migrationId: 'app-data-1-2', phase: 'committed', targetVersion: 'migration-2', sourceFingerprint: 'x', startedAt: NOW, updatedAt: NOW, finishedAt: NOW })
  })
  const rep = await orch.run(makeDef(), { now: NOW })
  ok('恢复决策 = CLEANUP_OLD（committed+complete+complete）', rep.recovery.action === 'CLEANUP_OLD')
  ok('REMOVE OLD 重放完成', !lsHas('app.data.v1') && lsGet('app.data.v2:r1') !== null)
  ok('committed=true（收口）', rep.committed === true)
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
