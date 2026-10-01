#!/usr/bin/env node
/**
 * P1.7 Wave 1-B · FencedWrite 真 IndexedDB + 真 localStorage 测试（浏览器侧）
 *
 * 覆盖 Node 内存桩测不到的真语义：
 *   1. MigrationLock（真 IDB）与 MigrationWriteGuard **同库同 store** 集成：
 *      guard 事务直接读 lock 记录做 fencing 校验（跨模块 CAS 由 IDB readwrite 串行化保证）；
 *   2. 六位置 kill-page：页签 A 推进迁移到崩溃位置后「死亡」（不清理、不 finalize），
 *      页签 B（同 origin，等价重启）**先快照恢复前状态**，再凭 IDB/journal 相位做
 *      恢复决策并完成恢复，断言恢复前不变量 + 恢复后终态；
 *   3. 跨页签 stale token：A release（墓碑）→ B acquire（token+1）→ A 旧 token staging/commit FAIL。
 *
 * 「setItem 中间」崩溃 = applySwitch 只应用前 k 条后脚本终止（真实世界 = 同步块被页面
 * 死亡截断）；恢复正确性由 marker 幂等重放保证。同步段无 await 的结构性证明在
 * tests/fenced-write.mjs（行为 + 结构双证明），此处不重复。
 *
 * 实现：vite dev server（浏览器直接 import TS 源模块）+ playwright-core + 系统 Chrome。
 * IDB 库名 / localStorage 键按次随机，测试互不污染。
 *
 * 用法：node tests/fenced-write-browser.mjs
 */
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
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

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const dir of readdirSync(agents)) {
      const exe = join(agents, dir, 'chrome.exe')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      const exe = join(pwRoot, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  return candidates.find((p) => existsSync(p))
}

const server = await createServer({ root: ROOT, logLevel: 'silent' })
await server.listen()
const origin = server.resolvedUrls.local[0]

const exe = findChrome()
if (!exe) { console.error('❌ 未找到 Chrome'); process.exit(2) }
const browser = await chromium.launch({ executablePath: exe, headless: true })

const _OLD_GLOBAL_KEY = 'gt.fence.old'

async function newPage(context) {
  const p = await context.newPage()
  await p.goto(origin, { waitUntil: 'domcontentloaded' })
  return p
}

try {
  const context = await browser.newContext()
  const pageA = await newPage(context)

  /* 1. 真 IDB 集成：MigrationLock acquire → guard 全链路 → 真 localStorage 切换 */
  console.log('== 1. 真 IDB：Lock + Guard 同库集成，全链路提交 ==')
  const dbName = `gt-fence-w1b-full-${Date.now()}`
  const full = await pageA.evaluate(async ([db]) => {
    // 不能加 `_` 前缀：下面 99/100 行在引用裸 `lockMod`（lint 只报声明点，加前缀后连报都不报）
    const lockMod = await import('/src/core/persistence/migration-lock.ts')
    const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
    const entries = [
      { key: 'gt.fence.a', value: 'new-a' },
      { key: 'gt.fence.b', value: 'new-b' },
      { key: 'gt.fence.old', value: null }, // REMOVE OLD 排在写入之后（§19-5）
    ]
    localStorage.setItem('gt.fence.old', 'legacy-value')
    const store = await guardMod.createIdbFenceStore(db)
    const lockStore = await lockMod.createIdbLockStore(db)
    const lock = new lockMod.MigrationLock(lockStore, 60_000)
    const guard = new guardMod.MigrationWriteGuard(store)
    const acq = await lock.acquire('A', { leaseMs: 60_000 })
    if (!acq.ok) return { fail: 'acquire' }
    const e = { ownerId: 'A', fencingToken: acq.record.fencingToken }
    const st = await guard.stage(entries, e)
    if (!st.ok) return { fail: 'stage:' + st.reason }
    const cm = await guard.requestCommit(e, { leaseMs: 60_000 })
    if (!cm.ok) return { fail: 'commit:' + cm.reason }
    guardMod.applySwitch(cm.marker.entries) // 同步切换
    const fn = await guard.finalizeCommit()
    const rel = await lock.release({ ownerId: 'A', fencingToken: acq.record.fencingToken })
    return {
      token: acq.record.fencingToken,
      entryCount: cm.marker.entries.length,
      finalized: fn.ok,
      released: rel.ok,
      phase: await guard.getPhase(),
      lsA: localStorage.getItem('gt.fence.a'),
      lsB: localStorage.getItem('gt.fence.b'),
      lsOld: localStorage.getItem('gt.fence.old'),
    }
  }, [dbName])
  ok('真 IDB：acquire → token=1', full.token === 1)
  ok('真 IDB：marker.entries 完整（3 条，含 REMOVE OLD）', full.entryCount === 3)
  ok('真 IDB：finalize → committed + release → ok', full.finalized && full.released && full.phase === 'committed')
  ok('真 localStorage：新键已写入', full.lsA === 'new-a' && full.lsB === 'new-b')
  ok('真 localStorage：旧键已 REMOVE', full.lsOld === null)

  /* 2. 六位置 kill-page：页签 A 死于各位置，页签 B 快照 → 决策 → 恢复 → 终态断言 */
  console.log('== 2. 跨页签 kill-page 六位置（真 IDB + 真 localStorage） ==')
  const POSITIONS = ['P1-before-stage', 'P2-after-stage', 'P3-after-verify', 'P4-after-marker', 'P5-mid-setItem', 'P6-after-removeItem']
  const EXPECT = {
    'P1-before-stage': 'RERUN',
    'P2-after-stage': 'RESUME',
    'P3-after-verify': 'RESUME',
    'P4-after-marker': 'REDO_SWITCH',
    'P5-mid-setItem': 'REDO_SWITCH',
    'P6-after-removeItem': 'REDO_SWITCH',
  }

  for (const position of POSITIONS) {
    const dbName = `gt-fence-w1b-kill-${position}-${Date.now()}`
    const lsPrefix = `gt.kp.${position}.`
    const entries = [
      { key: lsPrefix + 'new1', value: 'v1' },
      { key: lsPrefix + 'new2', value: 'v2' },
      { key: lsPrefix + 'old', value: null }, // REMOVE OLD
    ]
    const keys = { new1: lsPrefix + 'new1', new2: lsPrefix + 'new2', old: lsPrefix + 'old' }

    // 页签 A：推进到崩溃位置后直接返回（等价进程死亡，无清理、无 finalize）
    const crashed = await pageA.evaluate(async ([db, entries, position, keys]) => {
      const lockMod = await import('/src/core/persistence/migration-lock.ts')
      const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
      localStorage.setItem(keys.old, 'legacy-value') // 该迁移的旧数据
      const store = await guardMod.createIdbFenceStore(db)
      const lockStore = await lockMod.createIdbLockStore(db)
      const lock = new lockMod.MigrationLock(lockStore, 60_000)
      const guard = new guardMod.MigrationWriteGuard(store)
      const acq = await lock.acquire('A', { leaseMs: 60_000 })
      if (!acq.ok) return { fail: 'acquire' }
      const e = { ownerId: 'A', fencingToken: acq.record.fencingToken }
      if (position === 'P1-before-stage') return { token: e.fencingToken }
      await guard.stage(entries, e)
      if (position === 'P2-after-stage') return { token: e.fencingToken }
      await guard.markVerified(e)
      if (position === 'P3-after-verify') return { token: e.fencingToken }
      const cm = await guard.requestCommit(e, { leaseMs: 60_000 })
      if (!cm.ok) return { fail: 'commit' }
      if (position === 'P4-after-marker') return { token: e.fencingToken }
      if (position === 'P5-mid-setItem') {
        guardMod.applySwitch(cm.marker.entries.slice(0, 1)) // 死于同步段中途
        return { token: e.fencingToken }
      }
      guardMod.applySwitch(cm.marker.entries)
      return { token: e.fencingToken } // P6：应用完未 finalize 即死亡
    }, [dbName, entries, position, keys])
    if (crashed.fail) { ok(`${position}: 页签 A 崩溃前推进`, false, crashed.fail); continue }

    // 页签 B：重启后的编排者（同 origin = 共享 IDB + localStorage）
    const pageB = await newPage(context)
    const recovered = await pageB.evaluate(async ([db, keys]) => {
      const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
      const store = await guardMod.createIdbFenceStore(db)
      const guard = new guardMod.MigrationWriteGuard(store)
      // —— 恢复前快照（先看现场，再动手）——
      const pre = {
        new1: localStorage.getItem(keys.new1),
        new2: localStorage.getItem(keys.new2),
        old: localStorage.getItem(keys.old),
        marker: await guard.getMarker(),
        phase: await guard.getPhase(),
      }
      const action = guardMod.decideKillRecovery(pre.phase)
      let resumeOk = null
      let redoOk = null
      if (action === 'RERUN') {
        resumeOk = (await guard.reset()).ok
      } else if (action === 'RESUME') {
        // 原 owner 续走：lease 60s 未过期，lock 记录上的 owner/token 仍属 A
        const rec = await store.runTxn(async (t) => t.get('lock'))
        const e = { ownerId: rec.ownerId, fencingToken: rec.fencingToken }
        await guard.markVerified(e)
        const cm = await guard.requestCommit(e, { leaseMs: 60_000 })
        if (cm.ok) guardMod.applySwitch(cm.marker.entries)
        resumeOk = (await guard.finalizeCommit()).ok
      } else if (action === 'REDO_SWITCH') {
        // 重启编排者凭已授予 marker 幂等重放（不依赖旧 token 持锁）
        const rd = await guard.redoSwitch((es) => guardMod.applySwitch(es))
        redoOk = rd.ok && (await guard.finalizeCommit()).ok
      }
      return {
        pre, action, resumeOk, redoOk,
        afterPhase: await guard.getPhase(),
        new1: localStorage.getItem(keys.new1),
        new2: localStorage.getItem(keys.new2),
        old: localStorage.getItem(keys.old),
      }
    }, [dbName, keys])
    await pageB.close()

    console.log(`  -- ${position}: phase=${recovered.pre.phase} → recovery=${recovered.action}`)
    ok(`${position}: 恢复决策 = ${EXPECT[position]}`, recovered.action === EXPECT[position], `got=${recovered.action}`)

    // 崩溃时刻不变量（来自页签 B 的恢复前快照）
    if (position === 'P1-before-stage') {
      ok(`${position}: 旧 localStorage 完整`, recovered.pre.old === 'legacy-value')
      ok(`${position}: marker 不存在`, recovered.pre.marker === null)
      ok(`${position}: RERUN reset → idle`, recovered.resumeOk === true && recovered.afterPhase === 'idle')
    }
    if (position === 'P2-after-stage' || position === 'P3-after-verify') {
      ok(`${position}: 崩溃时旧 localStorage 完整（切换未开始）`, recovered.pre.old === 'legacy-value' && recovered.pre.new1 === null)
      ok(`${position}: marker 不存在（未授予）`, recovered.pre.marker === null)
      ok(`${position}: RESUME 续走 → committed`, recovered.resumeOk === true && recovered.afterPhase === 'committed')
    }
    if (position === 'P4-after-marker') {
      ok(`${position}: marker 已固化可重放（3 条）`, recovered.pre.marker !== null && recovered.pre.marker.entries.length === 3)
      ok(`${position}: 崩溃时旧 localStorage 完整`, recovered.pre.old === 'legacy-value' && recovered.pre.new1 === null)
    }
    if (position === 'P5-mid-setItem') {
      ok(`${position}: 崩溃时部分切换（new1 已写、new2 未写）`, recovered.pre.new1 === 'v1' && recovered.pre.new2 === null)
      ok(`${position}: marker 完整可重放`, recovered.pre.marker !== null && recovered.pre.marker.entries.length === 3)
    }
    if (position === 'P6-after-removeItem') {
      ok(`${position}: 崩溃时切换已生效但未 finalize`, recovered.pre.new1 === 'v1' && recovered.pre.new2 === 'v2' && recovered.pre.old === null)
    }

    // 恢复后终态
    if (position === 'P1-before-stage') {
      // RERUN = 清理重跑：迁移尚未执行，localStorage 不动、相位复位 idle
      ok(`${position}: 恢复后 phase=idle（等重跑）`, recovered.afterPhase === 'idle')
      ok(`${position}: localStorage 未被触碰`, recovered.new1 === null && recovered.new2 === null && recovered.old === 'legacy-value')
    } else {
      ok(`${position}: 恢复后 phase=committed`, recovered.afterPhase === 'committed')
      ok(`${position}: 恢复后新键生效`, recovered.new1 === 'v1' && recovered.new2 === 'v2')
      ok(`${position}: 恢复后旧键已 REMOVE`, recovered.old === null)
    }
  }

  /* 3. 跨页签 stale token（§19-4：旧 token 永不覆盖新 owner 数据） */
  console.log('== 3. 跨页签 stale token ==')
  {
    const dbName = `gt-fence-w1b-stale-${Date.now()}`
    const a = await pageA.evaluate(async ([db]) => {
      const lockMod = await import('/src/core/persistence/migration-lock.ts')
      const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
      const store = await guardMod.createIdbFenceStore(db)
      const lockStore = await lockMod.createIdbLockStore(db)
      const lock = new lockMod.MigrationLock(lockStore, 60_000)
      const guard = new guardMod.MigrationWriteGuard(store)
      const acq = await lock.acquire('A', { leaseMs: 60_000 })
      const e = { ownerId: 'A', fencingToken: acq.record.fencingToken }
      const st = await guard.stage([{ key: 'gt.stale.k', value: 'from-A' }], e)
      const rel = await lock.release(e) // 墓碑：token=1 保留、owner 清空
      return { token: acq.record.fencingToken, staged: st.ok, released: rel.ok }
    }, [dbName])
    ok('A acquire(token=1) + staging 成功后 release（墓碑）', a.token === 1 && a.staged && a.released)

    const pageB = await newPage(context)
    const b = await pageB.evaluate(async ([db]) => {
      const lockMod = await import('/src/core/persistence/migration-lock.ts')
      const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
      const store = await guardMod.createIdbFenceStore(db)
      const lockStore = await lockMod.createIdbLockStore(db)
      const lock = new lockMod.MigrationLock(lockStore, 60_000)
      const guard = new guardMod.MigrationWriteGuard(store)
      const acq = await lock.acquire('B', { leaseMs: 60_000 })
      if (!acq.ok) return { fail: 'acquire' }
      // A 的旧 token 试图写入/提交 → 必须 FAIL
      const staleStage = await guard.stage([{ key: 'gt.stale.k', value: 'STALE-OVERWRITE' }], { ownerId: 'A', fencingToken: 1 })
      const staleCommit = await guard.requestCommit({ ownerId: 'A', fencingToken: 1 })
      // B 当前 token 正常写入
      const bStage = await guard.stage([{ key: 'gt.stale.k', value: 'from-B' }], { ownerId: 'B', fencingToken: acq.record.fencingToken })
      const cur = guardMod.decodeStagedValue(await store.runTxn(async (t) => t.get(guardMod.stagingKey('gt.stale.k'))))
      return {
        token: acq.record.fencingToken,
        staleStageOk: staleStage.ok, staleStageReason: staleStage.ok ? null : staleStage.reason,
        staleCommitOk: staleCommit.ok,
        bStageOk: bStage.ok, cur,
      }
    }, [dbName])
    await pageB.close()
    ok('B acquire → token=2（跨周期单调）', b.token === 2)
    ok('stale A staging → FAIL not-owner（墓碑 owner 已清空）', b.staleStageOk === false && b.staleStageReason === 'not-owner')
    ok('stale A commit → FAIL', b.staleCommitOk === false)
    ok('B token=2 staging → ok，staging 值未被 stale 覆盖', b.bStageOk === true && b.cur === 'from-B')
  }
} finally {
  await browser.close().catch(() => {})
  await server.close().catch(() => {})
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
