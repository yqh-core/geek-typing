#!/usr/bin/env node
/**
 * P1.7 Wave 1-D · 真实用户快照 staging 端到端演练（Wave 1 出口证据）
 *
 * 目的：用**真实用户数据**（_user-snapshot/real-user-localStorage.json，16 键）
 *       走一遍新编排器全流水线：
 *       READ → VALIDATE → TRANSFORM → guard.stage（fencing）→ VERIFY（R5 五零）
 *       → markVerified → requestCommit（四项确认）→ applySwitch（单次同步切换）
 *       → finalize → journal committed → REMOVE OLD → release Lock
 *
 * 变换语义（真实、可独立验证）：把 gt.learning.v2（单键多记录对象，4 条学习记录）
 * 拆分为 gt.learning.v3:<contentId>（每记录一键），值经 JCS+NFC canonical 重编码
 * （canonical.ts）；gt.learning.v2 在 COMMIT 后移除（§19-5）。
 *
 * 独立验收（不信编排器自报）：
 *   1. R5 五零 + identity set 集合相等（before=源记录 / after=落 localStorage 的目标记录）；
 *   2. 值无损：每条目标记录 canonicalHash === 源记录 canonicalHash（§7）；
 *   3. 旧键已移除；4. journal=committed；5. 锁已释放（墓碑）；
 *   6. 幂等：重跑 → COMPLETE 且 localStorage 不变。
 *
 * ⚠️ 本脚本只在内存 localStorage 桩中运行，不触碰浏览器/任何真实存储。
 *
 * 用法：node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json
 * 退出码：0 = 演练全过；1 = 任一验收断言失败；2 = 输入错误。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))
if (!userStoreArg) { console.error('usage: --user-store=<real snapshot json>'); process.exit(2) }

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ---- 载入真实快照并播种内存 localStorage 桩 ---- */
const snapshotPath = join(ROOT, userStoreArg.split('=')[1])
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const lsBacking = new Map(Object.entries(snapshot).map(([k, v]) => [k, String(v)]))
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
  clear: () => lsBacking.clear(),
}
const lsGet = (k) => (lsBacking.has(k) ? lsBacking.get(k) : null)
const lsHas = (k) => lsBacking.has(k)

console.log(`快照：${Object.keys(snapshot).length} 键（真实用户数据，只读播种）`)

const server = await createServer2()
async function createServer2() {
  const { createServer } = await import('vite')
  return createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
}
const guardMod = await server.ssrLoadModule('/src/core/persistence/migration-write-guard.ts')
const orchMod = await server.ssrLoadModule('/src/core/persistence/migration-orchestrator.ts')
const r5Mod = await server.ssrLoadModule('/src/core/persistence/r5.ts')
const canonMod = await server.ssrLoadModule('/src/core/persistence/canonical.ts')
const { createMemoryFenceStore, FENCE_LOCK_KEY } = guardMod
const { MigrationOrchestrator } = orchMod
const { r5Check } = r5Mod
const { canonicalize, canonicalHash } = canonMod

/* ---- 共库内存存储（镜像浏览器 lock/guard 同库 IDB 语义） ---- */
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
const orch = new MigrationOrchestrator(lockStore, mem)

/* ---- 迁移定义：gt.learning.v2 → gt.learning.v3:<contentId>（canonical 重编码） ---- */
const SOURCE_KEY = 'gt.learning.v2'
const sourceRaw = lsGet(SOURCE_KEY)
if (!sourceRaw) { console.error('快照中无 gt.learning.v2'); process.exit(2) }
const sourceRecords = JSON.parse(sourceRaw)
const sourceIds = Object.keys(sourceRecords)

const VALID_FRESHNESS = ['ok', 'unknown', 'stale']
const VALID_MEMORIZE_STATUS = ['unknown', 'learning', 'fuzzy', 'known', 'mastered']

const def = {
  migrationId: 'learning-canonical-drill',
  targetVersion: 'migration-2',
  sourceKeys: [SOURCE_KEY],
  isTargetKey: (k) => k.startsWith('gt.learning.v3:'),
  expectedTargetCount: sourceIds.length,
  removalKeys: [SOURCE_KEY],
  validate: (k, v) => {
    for (const [cid, rec] of Object.entries(v)) {
      // id 推导：content 记录带 contentId 字段；legacy:*（unattributed/orphan）记录无该字段，键即 id（P1.5 §2.4/§2.5）
      const id = rec.contentId ?? cid
      if (id !== cid) throw new Error(`记录 id 与键不一致: ${cid} → ${id}`)
      if (!VALID_FRESHNESS.includes(rec.freshness)) throw new Error(`bad freshness: ${rec.freshness}`)
      const st = rec.memorize?.status
      if (typeof st !== 'string' || !VALID_MEMORIZE_STATUS.includes(st)) throw new Error(`bad memorize.status: ${st}`)
    }
  },
  transform: (k, v) => [
    ...Object.entries(v).map(([cid, rec]) => ({ key: `gt.learning.v3:${cid}`, value: canonicalize(rec) })),
    { key: SOURCE_KEY, value: null }, // REMOVE OLD 排尾（§19-5）
  ],
  toR5Records: (k, v) =>
    Object.entries(v).map(([cid, rec]) => ({
      id: cid,
      refs: [],
      enums: { freshness: rec.freshness, 'memorize.status': rec.memorize?.status ?? 'unknown' },
    })),
  toR5RecordsFromStaging: (entries) =>
    entries
      .filter((e) => e.value !== null && e.key.startsWith('gt.learning.v3:'))
      .map((e) => {
        const rec = JSON.parse(e.value)
        const cid = e.key.slice('gt.learning.v3:'.length)
        return { id: rec.contentId ?? cid, refs: [], enums: { freshness: rec.freshness, 'memorize.status': rec.memorize?.status ?? 'unknown' } }
      }),
  r5Spec: { validEnums: { freshness: VALID_FRESHNESS, 'memorize.status': VALID_MEMORIZE_STATUS } },
  sourceFingerprint: `real-user-snapshot:${sourceIds.length}records`,
  read: () => Object.fromEntries([...lsBacking.keys()].map((k) => [k, lsBacking.get(k)])),
}

/* ---- 运行 ---- */
console.log('')
console.log('== 编排器全流水线（真实数据） ==')
const rep = await orch.run(def)
ok('committed=true / aborted=false', rep.committed === true && rep.aborted === false, rep.reason ?? '')
ok('恢复决策 = RUN', rep.recovery.action === 'RUN')
ok('journal phase=committed', (await orch.getJournal('learning-canonical-drill')).phase === 'committed')

console.log('')
console.log('== 独立验收（不信任编排器自报） ==')
// 1. R5 独立复核：before=源记录 / after=localStorage 落地记录
const beforeRecords = sourceIds.map((cid) => {
  const rec = sourceRecords[cid]
  return { id: cid, refs: [], enums: { freshness: rec.freshness, 'memorize.status': rec.memorize?.status ?? 'unknown' } }
})
const afterRecords = sourceIds.map((cid) => {
  const rec = JSON.parse(lsGet(`gt.learning.v3:${cid}`))
  return { id: rec.contentId ?? cid, refs: [], enums: { freshness: rec.freshness, 'memorize.status': rec.memorize?.status ?? 'unknown' } }
})
const r5 = r5Check(beforeRecords, afterRecords, def.r5Spec)
ok(`R5 五零 + identity set 相等（${sourceIds.length} 条）`, r5.ok === true && Object.values(r5.counts).every((c) => c === 0), JSON.stringify(r5.counts))

// 2. 值无损（canonicalHash 等值，§7）
let hashEqual = true
for (const cid of sourceIds) {
  const before = sourceRecords[cid]
  const after = JSON.parse(lsGet(`gt.learning.v3:${cid}`))
  if ((await canonicalHash(before)) !== (await canonicalHash(after))) { hashEqual = false; break }
}
ok(`值无损：${sourceIds.length} 条记录 canonicalHash 全等（JCS+NFC 重编码 round-trip）`, hashEqual)

// 3. REMOVE OLD
ok('旧键 gt.learning.v2 已移除（REMOVE OLD 在 COMMIT 后）', !lsHas(SOURCE_KEY))
ok('其余 15 个非迁移键原样保留（零副作用）', Object.keys(snapshot).filter((k) => k !== SOURCE_KEY).every((k) => lsGet(k) === String(snapshot[k])))

// 4. 锁释放
const lock = await mem.runTxn(async (t) => t.get(FENCE_LOCK_KEY))
ok('锁已释放（墓碑）', lock.ownerId === '' && lock.fencingToken === 1)

// 5. 幂等
const lsFingerprintBefore = JSON.stringify([...lsBacking.keys()].sort())
const rep2 = await orch.run(def)
ok('重跑 → COMPLETE（幂等收口）', rep2.committed === true && rep2.recovery.action === 'COMPLETE')
ok('重跑后 localStorage 状态不变', JSON.stringify([...lsBacking.keys()].sort()) === lsFingerprintBefore)

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
