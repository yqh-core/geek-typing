#!/usr/bin/env node
/**
 * P1.7 Wave 1-A · Migration Lock 真 IndexedDB 并发测试（浏览器侧）
 *
 * 覆盖 v2.3.2 §3 的真 IDB 语义（Node 内存存储测不到的部分）：
 *   1. 同源 20 个并发 acquire（20 个独立 ownerId）→ 恰好 1 个成功（IDB readwrite 串行化 + CAS）；
 *   2. 跨页签 double writer：A acquire → B acquire FAIL → A renew OK → B renew FAIL →
 *      A release OK → B acquire OK(token+1) → stale A renew/release FAIL。
 *
 * 实现：vite dev server（浏览器可直接 import TS 源模块）+ playwright-core + 系统 Chrome。
 * IDB 数据库名按次随机，测试互不污染。
 *
 * 用法：node tests/migration-lock-browser.mjs
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

try {
  const context = await browser.newContext()
  const pageA = await context.newPage()
  await pageA.goto(origin, { waitUntil: 'domcontentloaded' })

  /* 1. 同页签 20 并发 acquire（真 IndexedDB） */
  console.log('== 1. 真 IDB：20 并发 acquire ==')
  const race = await pageA.evaluate(async () => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(`gt-lock-w1a-race-${Date.now()}`)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const owners = Array.from({ length: 20 }, (_, i) => `owner-${i}`)
    const results = await Promise.all(owners.map((o) => lock.acquire(o, { leaseMs: 60_000 })))
    return {
      okCount: results.filter((r) => r.ok).length,
      winnerToken: results.find((r) => r.ok)?.record?.fencingToken ?? null,
      failReasons: [...new Set(results.filter((r) => !r.ok).map((r) => r.reason))],
    }
  })
  ok('20 并发 acquire → 恰好 1 个成功', race.okCount === 1, `okCount=${race.okCount}`)
  ok('胜者 fencingToken = 1', race.winnerToken === 1)
  ok('其余 19 个失败原因均为 held', race.failReasons.length === 1 && race.failReasons[0] === 'held')

  /* 2. 跨页签 double writer（同一 context = 同一 origin 存储 = 共享 IDB） */
  console.log('== 2. 跨页签 double writer ==')
  const pageB = await context.newPage()
  await pageB.goto(origin, { waitUntil: 'domcontentloaded' })
  const dbName = `gt-lock-w1a-xtab-${Date.now()}`
  const a1 = await pageA.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const r = await lock.acquire('A', { leaseMs: 60_000 })
    return { ok: r.ok, token: r.ok ? r.record.fencingToken : null, lease: r.ok ? r.record.leaseUntil : null }
  }, [dbName])
  ok('页签 A acquire → 成功 token=1', a1.ok && a1.token === 1)

  const b1 = await pageB.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const r = await lock.acquire('B', { leaseMs: 60_000 })
    return { ok: r.ok, reason: r.ok ? null : r.reason }
  }, [dbName])
  ok('页签 B acquire（A 持有中）→ FAIL（跨页签可见）', !b1.ok && b1.reason === 'held')

  const bRenew = await pageB.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    return lock.renew({ ownerId: 'B', leaseUntil: 1, fencingToken: 99 })
  }, [dbName])
  ok('页签 B renew（伪造期望）→ FAIL', !bRenew.ok)

  const aRenew = await pageA.evaluate(async ([db, leaseUntil]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const r = await lock.renew({ ownerId: 'A', leaseUntil, fencingToken: 1 }, { leaseMs: 60_000 })
    return { ok: r.ok, newLease: r.ok ? r.record.leaseUntil : null }
  }, [dbName, a1.lease])
  ok('页签 A renew（三元组匹配）→ 成功', aRenew.ok && aRenew.newLease > a1.lease)

  const aRelease = await pageA.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    return lock.release({ ownerId: 'A', fencingToken: 1 })
  }, [dbName])
  ok('页签 A release → 成功（墓碑 token 保留）', aRelease.ok)

  const b2 = await pageB.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const r = await lock.acquire('B', { leaseMs: 60_000 })
    return { ok: r.ok, token: r.ok ? r.record.fencingToken : null }
  }, [dbName])
  ok('A 释放后页签 B acquire → 成功 token=2（fencing 跨周期单调）', b2.ok && b2.token === 2)

  const aStale = await pageA.evaluate(async ([db]) => {
    const m = await import('/src/core/persistence/migration-lock.ts')
    const store = await m.createIdbLockStore(db)
    const lock = new m.MigrationLock(store, { defaultLeaseMs: 60_000 })
    const rn = await lock.renew({ ownerId: 'A', leaseUntil: 1, fencingToken: 1 })
    const rl = await lock.release({ ownerId: 'A', fencingToken: 1 })
    return { renewOk: rn.ok, releaseOk: rl.ok }
  }, [dbName])
  ok('stale 页签 A 的 renew 与 release 均 FAIL（B 持 token=2）', !aStale.renewOk && !aStale.releaseOk)
} finally {
  await browser.close().catch(() => {})
  await server.close().catch(() => {})
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
