#!/usr/bin/env node
/**
 * P1.5 · G3 门禁：Migration 的三条硬性质（对应执行计划第 ⑥⑦ 步 + §2.7 回滚）
 *
 *   G3-3 Pure        不碰 localStorage、不改入参、无隐含外部状态
 *   G3-4 Idempotent  第二次：**0 次 setItem**（不是「写了相同内容」，是**根本不写**）
 *   G3-6 Rollback    备份可完整恢复旧键（逐字节）
 *   G3-3/G3-4 Determinism 固定时钟下，两次 next 逐字节相同
 *
 * ⚠️ **每个判据都配一个必须判红的合成对照组**（下表）。没有对照组的判据无法自证：
 *    一个「永远返回 skipped」的实现会把幂等测试判成绿 —— 那正是最难发现的假通过。
 *
 *  | 判据      | 正向                      | 必须判红的对照组                          |
 *  |-----------|---------------------------|--------------------------------------------|
 *  | 幂等      | 同指纹 ⇒ pendingWrites=[] | **指纹变了 ⇒ 必须重迁移**（不得跳过）     |
 *  | 纯函数性  | 触碰记录数 = 0            | 对照组：主动碰一次 ⇒ 探针**确实**能抓到   |
 *  | 回滚      | 恢复后与原文逐字节相同    | 对照组：改一个字节 ⇒ 必须**不相同**       |
 *  | 确定性    | 两次 next 逐字节相同      | 省略时钟 ⇒ 必须**响错**（不得静默兜底 Date.now）|
 *
 * > 编号说明：本脚本的判据编号**沿用** `P1.5-RELEASE-GATE.md` 的 G3-x，
 * >   不另起一套 —— 两个地方写同一个编号却指不同判据，等于把证据追溯链剪断。
 * ⚠️ 本脚本**不写任何产物**；所有落盘判别都在内存里的 mock storage 上做。
 *
 * 退出码：0=全过 / 1=有 FAIL / 2=脚本自身错误
 *
 * 用法：
 *   node tests/migration-guards.mjs
 *   node tests/migration-guards.mjs --json
 */
import { createServer } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VOCAB = join(ROOT, 'content', 'vocabulary')

const asJson = process.argv.includes('--json')

/* ---------------- 断言框架 ---------------- */
let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    if (!asJson) console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    failures.push(name)
    if (!asJson) console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  if (!asJson) console.log(`\n【${title}】`)
}

/* ===========================================================================
 * 内容侧真值 —— 与 tests/learning-model.mjs:72-111 同口径
 *
 * 为什么要重建而不是 import：`learning-model.mjs` 是顶层直接执行的 CLI（无 export），
 * import 它会立即重跑整个门禁。这与 `migration-dryrun.mjs:1123-1147` 记录的理由相同。
 * ======================================================================== */
function loadContentProvider() {
  const pkgDirs = readdirSync(VOCAB, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const pkgInfoMap = new Map()
  const wordToPkgsMap = new Map()
  const lowerToFormsMap = new Map()

  for (const p of pkgDirs) {
    const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
    const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
    pkgInfoMap.set(p, {
      namespace: mf.namespace,
      contentVersion: mf.contentVersion,
      contentChecksum: mf.contentChecksum,
    })
    for (const w of [...new Set(words.map((r) => r.word))]) {
      if (!wordToPkgsMap.has(w)) wordToPkgsMap.set(w, [])
      wordToPkgsMap.get(w).push(p)
      const l = w.toLowerCase()
      if (!lowerToFormsMap.has(l)) lowerToFormsMap.set(l, new Set())
      lowerToFormsMap.get(l).add(w)
    }
  }
  return {
    pkgInfo: (id) => pkgInfoMap.get(id) ?? null,
    wordToPkgs: (w) => wordToPkgsMap.get(w) ?? null,
    lowerToForms: (l) => lowerToFormsMap.get(l) ?? null,
    _words: wordToPkgsMap,
  }
}

/* ===========================================================================
 * 内存 mock storage —— 统计真实 setItem 次数
 *
 * 为什么必须数**次数**而不是比较**内容**：幂等的语义是「第二次根本不写」，
 * 「写了两次但内容一样」同样满足内容比较，却不符合约定。只有次数能区分这两者。
 * ======================================================================== */
function createMockStorage() {
  const map = new Map()
  const log = []
  return {
    map,
    log,
    setItem(k, v) {
      log.push(k)
      map.set(k, v)
    },
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem(k) {
      map.delete(k)
    },
    setItemCount: () => log.length,
    snapshot() {
      const out = {}
      for (const k of [...map.keys()].sort()) out[k] = map.get(k)
      return JSON.stringify(out)
    },
  }
}

/** 按 pendingWrites 顺序真实落盘 —— 模拟 §4 apply 阶段 */
function applyResult(store, next) {
  const payload = {
    'gt.learning.v2': next.learning,
    'gt.letterStats.v1': next.letterStats,
    'gt.totals.v1': next.totals,
    'gt.learning.v2.backup': next.backup,
    'gt.migration.v1': next.marker,
  }
  for (const key of next.__pendingWrites) {
    if (!(key in payload)) throw new Error(`pendingWrites 里的 ${key} 没有对应产物 —— apply 会写 undefined`)
    store.setItem(key, JSON.stringify(payload[key]))
  }
}

/* ===========================================================================
 * localStorage 探针 —— 在 Node 里安装一个**一碰就报警**的假 localStorage
 *
 * 为什么不能只依赖「Node 里没有 localStorage ⇒ 触碰就 ReferenceError」：
 *   ① 那只覆盖了全局不存在的情况；一旦将来有人在测试环境 polyfill 了它，判据就失效了；
 *   ② 它无法区分「碰了但没抛」和「完全没碰」。显式探针能记录**触碰次数**，
 *      并且下面会用主动触碰的对照组证明探针本身有效。
 * ======================================================================== */
function installStorageProbe() {
  const touches = []
  const trap = new Proxy(
    {},
    {
      get(_target, prop) {
        touches.push(String(prop))
        throw new Error(`[probe] migrate 触碰了 localStorage.${String(prop)}`)
      },
      set() {
        touches.push('__set__')
        throw new Error('[probe] migrate 写入了 localStorage')
      },
    },
  )
  globalThis.localStorage = trap
  return {
    touches,
    uninstall() {
      delete globalThis.localStorage
    },
  }
}

/* ===========================================================================
 * 主流程
 * ======================================================================== */
async function main() {
  console.log('='.repeat(74))
  console.log('P1.5 · G3 门禁：Migration 纯函数性 / 幂等性 / 回滚')
  console.log('='.repeat(74))

  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })

  let migrateMod
  let storageMod
  try {
    migrateMod = await server.ssrLoadModule('/src/lib/learning/migrate.ts')
    storageMod = await server.ssrLoadModule('/src/lib/learning/storage.ts')
  } catch (e) {
    await server.close()
    console.error('FAIL(EXIT=2): 无法加载 src/lib/learning/*.ts：', e?.stack ?? e)
    process.exit(2)
  }

  const { migrateV1toV2, splitSnapshot, fingerprint } = migrateMod
  const { KEY_LEARNING_V2, KEY_MIGRATION, KEY_BACKUP } = storageMod

  const content = loadContentProvider()

  /* ---------------- 输入：合成但形状真实 ---------------- */
  const NOW = Date.parse('2026-09-27T12:00:00.000Z')
  const wordsAll = [...content._words.entries()]
  const resolvedPick = wordsAll.filter(([, ps]) => ps.length === 1).slice(0, 6).map(([w]) => w)
  const ambiguousPick = wordsAll.filter(([, ps]) => ps.length >= 2).slice(0, 4).map(([w]) => w)

  const review = {}
  const memorize = {}
  const analyticsWords = {}
  resolvedPick.forEach((w, i) => {
    review[w] = {
      wrongCount: 1 + i,
      correctStreak: i,
      lastWrongAt: NOW - i * 3600000,
      nextReviewAt: NOW + 86400000,
      intervalIdx: i % 5,
    }
    memorize[w] = { status: 'fuzzy', reviews: 2, lastAt: NOW - 60000 }
    analyticsWords[w.toLowerCase()] = { done: 3, wrong: 1 }
  })
  ambiguousPick.forEach((w) => {
    review[w] = { wrongCount: 2, correctStreak: 0, lastWrongAt: NOW, nextReviewAt: NOW, intervalIdx: 1 }
  })
  // 一个孤儿词（真实场景：用户以前学过、现在词库里已经没有这个词了）
  review['zzzLegacyWordNotInContent'] = {
    wrongCount: 9,
    correctStreak: 0,
    lastWrongAt: NOW,
    nextReviewAt: NOW,
    intervalIdx: 0,
  }

  const RAW = {
    'gt.review.v1': JSON.stringify(review),
    'gt.memorize.v1': JSON.stringify(memorize),
    'gt.analytics.v1': JSON.stringify({
      words: analyticsWords,
      letters: { a: { hit: 10, miss: 2 }, b: { hit: 3, miss: 1 } },
      totalKeys: 4321,
      totalCorrect: 4000,
      totalWords: 120,
      bestWpm: 77,
    }),
    'gt.customBanks.v1': JSON.stringify([
      { id: 'custom-g1', name: '测试库', words: [{ word: 'alpha' }], createdAt: NOW },
    ]),
  }

  const split = splitSnapshot(RAW)
  const OPTS = { now: NOW, runtime: 'cli', source: 'synthetic', sourceDetail: 'G3 门禁合成数据' }

  console.log(
    `\n输入：review=${Object.keys(split.snapshot.review).length} memorize=${Object.keys(split.snapshot.memorize).length} analytics.words=${Object.keys(split.snapshot.analytics.words).length}`,
  )

  /* =======================================================================
   * G3-1 · Pure
   * ===================================================================== */
  section('G3-3 纯函数性（不碰 localStorage / 不改入参）')

  const probe = installStorageProbe()
  let probeOk = true
  let probeErr = ''
  let before = ''
  const frozenRef = {}
  try {
    // 深冻结入参：ESM 是严格模式，任何就地改写都会抛 TypeError —— 比事后比对更早暴露
    const frozen = JSON.parse(JSON.stringify(split.snapshot))
    deepFreeze(frozen)
    frozenRef.value = frozen
    before = JSON.stringify(frozen)
    migrateV1toV2(frozen, content, OPTS)
  } catch (e) {
    probeOk = false
    probeErr = String(e?.message ?? e)
  } finally {
    probe.uninstall()
  }
  const after = JSON.stringify(frozenRef.value)
  ok('迁移过程未触碰 localStorage（探针触碰数=0）', probe.touches.length === 0, `touches=${probe.touches.length}`)
  ok('未就改写入参：调用不抛（深冻结 ⇒ ESM 严格模式下就地改写会 TypeError）', probeOk, probeErr || 'no throw')
  ok(
    '未就改写入参：调用前后入参逐字节相同',
    before !== '' && before === after,
    before === after ? 'snapshot 前后一致' : '⚠️ 入参被修改了',
  )

  // 对照组：证明探针**确实能抓到**触碰 —— 否则上面的 0 可能是「探针坏了」而不是「没碰」
  const control = installStorageProbe()
  let controlCaught = false
  try {
    void localStorage.getItem('gt.review.v1')
  } catch {
    controlCaught = true
  } finally {
    control.uninstall()
  }
  ok(
    '对照组：主动触碰一次 ⇒ 探针必然记录（证明探针有效）',
    controlCaught && control.touches.length === 1,
    `touches=${control.touches.length}`,
  )

  /* =======================================================================
   * G3-4 · Determinism
   * ===================================================================== */
  section('G3-3 确定性（固定时钟下逐字节相同）')

  const run1 = migrateV1toV2(split.snapshot, content, OPTS)
  const run2 = migrateV1toV2(split.snapshot, content, OPTS)
  ok('两次调用 next 逐字节相同', JSON.stringify(run1.next) === JSON.stringify(run2.next))
  ok(
    '两次调用 report 除时间戳外逐字节相同',
    stripTimestamps(run1.report) === stripTimestamps(run2.report),
    'startedAt/finishedAt/durationMs 已剔除',
  )

  // 对照组：时间必须是**显式入参**，而不是函数内部的隐含状态。
  // 换一个 now ⇒ 只有 marker.migratedAt / report 时间戳跟着变，数据部分逐字节不动 ——
  // 这同时证明了两件事：① 时钟确实能影响输出（不是被写死的常量）；
  //                    ② 受影响的范围被限制在时间戳，没有别的隐含通道。
  const laterOpts = { ...OPTS, now: NOW + 60000 }
  const later = migrateV1toV2(split.snapshot, content, laterOpts)
  ok(
    '对照组：now 变化 ⇒ marker.migratedAt 必然跟随',
    later.next.marker.migratedAt !== run1.next.marker.migratedAt,
    `${run1.next.marker.migratedAt} → ${later.next.marker.migratedAt}`,
  )
  ok(
    '对照组：now 变化的**影响范围仅限时间戳**（数据部分仍逐字节相同）',
    stripMarkerTime(later.next) === stripMarkerTime(run1.next),
    '剔除 marker.migratedAt 后逐字节相同',
  )
  // 最关键的一条：隐含输入已被彻底移除 ⇒ 不注入时钟就必然响错，而不是静默用 Date.now()
  let omittedClockThrew = false
  try {
    migrateV1toV2(split.snapshot, content, { runtime: 'cli' })
  } catch {
    omittedClockThrew = true
  }
  ok(
    '对照组：省略时钟必定响错（证明没有隐含的 Date.now 兜底）',
    omittedClockThrew === true,
    'RangeError: Invalid time value',
  )

  /* =======================================================================
   * G3-2 · Idempotent —— 核心：第二次 0 次 setItem
   * ===================================================================== */
  section('G3-4 幂等性（第二次必须 0 次 setItem）')

  const store = createMockStorage()
  ok('首次迁移产出待写项', run1.pendingWrites.length > 0, `${run1.pendingWrites.length} 个键`)
  ok(
    '标记键排在 pendingWrites 最后（崩溃后重跑可自愈的前提）',
    run1.pendingWrites[run1.pendingWrites.length - 1] === KEY_MIGRATION,
    run1.pendingWrites.join(' → '),
  )

  applyResult(store, { ...run1.next, __pendingWrites: run1.pendingWrites })
  const writesAfterFirst = store.setItemCount()
  const stateAfterFirst = store.snapshot()
  ok('首次落盘写入了全部新键', writesAfterFirst === run1.pendingWrites.length, `setItem=${writesAfterFirst}`)
  ok('gt.learning.v2 已落盘', store.getItem(KEY_LEARNING_V2) !== null)

  // 第二次：带上一次 marker 里的源指纹
  const second = migrateV1toV2(split.snapshot, content, {
    ...OPTS,
    existingMarkerFingerprint: run1.next.marker.sourceFingerprint,
  })
  applyResult(store, { ...second.next, __pendingWrites: second.pendingWrites })
  const writesAfterSecond = store.setItemCount()

  ok('第二次被标记为 skipped', second.skipped === true, second.skipReason ?? '')
  ok('第二次 pendingWrites 为空数组', second.pendingWrites.length === 0, `length=${second.pendingWrites.length}`)
  ok(
    '**第二次 0 次 setItem**（这是幂等的唯一可观测定义）',
    writesAfterSecond === writesAfterFirst,
    `${writesAfterFirst} → ${writesAfterSecond}（+0）`,
  )
  ok('第二次落盘后存储状态与首次完全一致', store.snapshot() === stateAfterFirst)

  // 对照组：源数据变了 ⇒ 必须重迁移。**没有这条，永远 skipped 的实现会被判绿**
  const changed = JSON.parse(RAW['gt.review.v1'])
  changed['brandNewWordAfterMigration'] = {
    wrongCount: 0,
    correctStreak: 0,
    lastWrongAt: NOW,
    nextReviewAt: NOW,
    intervalIdx: 0,
  }
  const splitChanged = splitSnapshot({ ...RAW, 'gt.review.v1': JSON.stringify(changed) })
  ok(
    '对照组：源快照变了 ⇒ 指纹必然变化（否则幂等判定本身失效）',
    fingerprint(splitChanged.snapshot) !== run1.next.marker.sourceFingerprint,
  )
  const third = migrateV1toV2(splitChanged.snapshot, content, {
    ...OPTS,
    existingMarkerFingerprint: run1.next.marker.sourceFingerprint,
  })
  ok(
    '对照组：**指纹不同 ⇒ 不得跳过**（必须重新产出待写项）',
    third.skipped === false && third.pendingWrites.length > 0,
    `skipped=${third.skipped} writes=${third.pendingWrites.length}`,
  )

  /* =======================================================================
   * G3-3 · Rollback —— 备份必须能完整恢复旧键
   * ===================================================================== */
  section('G3-6 回滚（备份 ⇒ 逐字节恢复）')

  const backup = run1.next.backup
  ok(
    '备份包含全部 4 个迁移源键',
    ['review', 'memorize', 'analytics', 'customBanks'].every((k) => k in backup),
    Object.keys(backup).join(','),
  )
  ok(
    '备份内容与原始输入逐字节相同',
    JSON.stringify(backup.review) === JSON.stringify(split.snapshot.review) &&
      JSON.stringify(backup.memorize) === JSON.stringify(split.snapshot.memorize) &&
      JSON.stringify(backup.analytics) === JSON.stringify(split.snapshot.analytics) &&
      JSON.stringify(backup.customBanks) === JSON.stringify(split.snapshot.customBanks),
  )
  ok('rollbackToken 指向备份键', run1.next.marker.rollbackToken.backupKey === KEY_BACKUP)
  ok(
    'rollbackToken.backedUpKeys 与实际迁移源一致',
    run1.next.marker.rollbackToken.backedUpKeys.length === 4,
    run1.next.marker.rollbackToken.backedUpKeys.join(','),
  )

  // 真跑一次回滚：删新键 + 从备份恢复旧键
  const rb = createMockStorage()
  applyResult(rb, { ...run1.next, __pendingWrites: run1.pendingWrites })
  restoreFromBackup(rb, backup)
  ok(
    '回滚后旧键逐字节还原',
    rb.getItem('gt.review.v1') === RAW['gt.review.v1'] &&
      rb.getItem('gt.memorize.v1') === RAW['gt.memorize.v1'] &&
      rb.getItem('gt.analytics.v1') === RAW['gt.analytics.v1'] &&
      rb.getItem('gt.customBanks.v1') === RAW['gt.customBanks.v1'],
  )
  ok('回滚后新键 gt.learning.v2 已清除', rb.getItem(KEY_LEARNING_V2) === null)
  ok('回滚后迁移标记已清除（下次会重新迁移）', rb.getItem(KEY_MIGRATION) === null)

  // 对照组：动一个字节 ⇒ 必须判不相同 —— 证明上面的比较**不是恒真**
  const rbTampered = createMockStorage()
  applyResult(rbTampered, { ...run1.next, __pendingWrites: run1.pendingWrites })
  restoreFromBackup(rbTampered, backup)
  rbTampered.setItem('gt.review.v1', rbTampered.getItem('gt.review.v1').replace('"wrongCount"', '"wrongCountX"'))
  ok(
    '对照组：篡改一个字节 ⇒ 与原文**必须**不同（证明比较不是恒真）',
    rbTampered.getItem('gt.review.v1') !== RAW['gt.review.v1'],
  )

  /* =======================================================================
   * 汇总
   * ===================================================================== */
  console.log('\n' + '─'.repeat(74))
  console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  console.log('─'.repeat(74))

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          pass,
          fail,
          failures,
          firstWrites: writesAfterFirst,
          secondWrites: writesAfterSecond,
          tiers: run1.report.tiers,
        },
        null,
        2,
      ) + '\n',
    )
  }

  await server.close()

  if (fail > 0) {
    console.log('\nEXIT=1 门禁未通过：')
    for (const f of failures) console.log(`  ✗ ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

/* ---------------- 辅助 ---------------- */

function deepFreeze(o) {
  if (o === null || typeof o !== 'object') return o
  Object.freeze(o)
  for (const v of Object.values(o)) deepFreeze(v)
  return o
}

/** 剔除 report 里所有随调用时刻变化的字段 */
function stripTimestamps(report) {
  return JSON.stringify({ ...report, startedAt: '', finishedAt: '', durationMs: 0, durationMsExact: 0 })
}

/** 剔除 next 里来自时钟的字段（仅 marker.migratedAt），剩下的是「数据本体」 */
function stripMarkerTime(next) {
  return JSON.stringify({ ...next, marker: { ...next.marker, migratedAt: '' } })
}

/** 回滚动作：删掉迁移写入的新键 + 从备份还原旧键 */
function restoreFromBackup(store, backup) {
  const map = { review: 'gt.review.v1', memorize: 'gt.memorize.v1', analytics: 'gt.analytics.v1', customBanks: 'gt.customBanks.v1' }
  for (const k of ['gt.learning.v2', 'gt.letterStats.v1', 'gt.totals.v1', 'gt.migration.v1', 'gt.learning.v2.backup']) {
    store.removeItem(k)
  }
  for (const [field, legacyKey] of Object.entries(map)) {
    if (backup[field] !== undefined) store.setItem(legacyKey, JSON.stringify(backup[field]))
  }
}


main().catch((e) => {
  console.error('FAIL(EXIT=2):', e?.stack ?? e)
  process.exit(2)
})
