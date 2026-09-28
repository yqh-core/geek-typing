#!/usr/bin/env node
/**
 * P1.5 · G4 门禁行为侧：`learning/storage.ts` + `learning/diagnostics.ts` + `learning/codec.ts`
 *
 * 依据：`docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` 的 G4 三道行为判据
 *   G4-3② 每次写失败必须 reportDiag + emitSaveFailure（半静默 = FAIL）
 *   G4-4   quota 熔断可观测（QUOTA_EVICTED）+ snapshotQuota / checkQuotaPressure / onQuotaPressure
 *          （70% 触发 / 69% 不触发 —— **对照组必须存在**）
 *   G4-5   codec 校验：合法项保留、非法项丢弃（STORAGE_ENTRY_DROPPED），整表非法回落空表
 *          （STORAGE_READ_CORRUPT），不整表判废、不抛异常
 *
 * 静态侧（G4-1 / G4-2 / G4-3①）在 scripts/gate-g4.mjs；两边合起来 = G4 全部门禁。
 *
 * G 段（G3-6 一键回滚 rollbackLearningV1）：漂移锁死 + backedUpKeys 驱动 + 失败路径不抛。
 *   首跑揪出实现偏差：恢复循环原为「映射全集驱动」，会触碰不在 token.backedUpKeys 里的键
 *   （§2.7.2 原文要求 backedUpKeys 驱动）—— 已修，本段用「清单外键 junk 幸存」锁死。
 *
 * ⚠️ 自校验纪律（regression-failure-triage skill）：
 *   - 每条「失败可观测」断言都配**成功对照组**（成功路径零 diag），
 *     防止「永远失败 ⇒ diag 恒有」的恒真假通过；
 *   - 69% 对照组防止「永远触发」的恒真假通过。
 *
 * localStorage 桩：Map 后备 + 可配置失败注入（前 N 次 setItem 抛错 / 错误类型可指定）。
 *   模块内函数每次调用都动态解析全局 `localStorage`，所以**换桩不需要重载模块**。
 *   模块级状态（diag buffer / pressure 闩）用 clearDiagBuffer + 滞回语义（69% 复位）在
 *   段与段之间隔离，**不需要**重载模块。
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------------- 断言框架 ---------------- */
let pass = 0
let fail = 0
const failures = []
function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail} ` : ''}`)
  }
}

/* ---------------- localStorage 桩 ---------------- */
function makeLs({ failSetTimes = 0, failSetWith = null, failGet = false } = {}) {
  const map = new Map()
  let setCalls = 0
  return {
    _map: map,
    getItem(k) {
      if (failGet) throw new Error('localStorage unavailable (privacy mode)')
      return map.has(k) ? map.get(k) : null
    },
    setItem(k, v) {
      setCalls++
      if (setCalls <= failSetTimes) {
        throw failSetWith ?? new Error('generic setItem failure')
      }
      map.set(k, String(v))
    },
    removeItem(k) {
      map.delete(k)
    },
    key(i) {
      return [...map.keys()][i] ?? null
    },
    get length() {
      return map.size
    },
  }
}

function quotaErr() {
  return Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' })
}

/* console.warn 捕获（段级安装/恢复） */
let warns = []
const origWarn = console.warn
function captureWarn() {
  warns = []
  console.warn = (...args) => {
    warns.push(args.map(String).join(' '))
  }
}
function restoreWarn() {
  console.warn = origWarn
}

/* ---------------- 测试数据 ---------------- */
const rec = (contentId, intervalIdx = 1) => ({ contentId, review: { intervalIdx } })
const KEY = 'gt.learning.v2'

/* ---------------- 加载被测模块 ---------------- */
console.log('== 加载 src/lib/learning/*.ts（Vite ssrLoadModule）==')
const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
})
try {
  const storage = await server.ssrLoadModule('/src/lib/learning/storage.ts')
  const diagMod = await server.ssrLoadModule('/src/lib/learning/diagnostics.ts')
  const codecMod = await server.ssrLoadModule('/src/lib/learning/codec.ts')
  const migrate = await server.ssrLoadModule('/src/lib/learning/migrate.ts')
  const S = (name) => storage[name]
  const D = (name) => diagMod[name]
  const C = (name) => codecMod[name]
  const M = (name) => migrate[name]

  /* =========================================================================
   * A · 导出面（G4-1 的行为侧佐证；目录/签名静态侧在 gate-g4.mjs）
   * ======================================================================= */
  console.log('\n== A · 导出符号齐备 ==')
  const storageExports = [
    'KEY_LEARNING_V2', 'KEY_LETTER_STATS', 'KEY_TOTALS', 'KEY_MIGRATION', 'KEY_BACKUP',
    'loadLearningV2', 'saveLearningV2', 'getRecord', 'getLegacyRecord', 'countLegacy',
    'putRecord', 'loadLetterStats', 'saveLetterStats', 'loadTotals', 'saveTotals',
    'loadMigrationMarker', 'saveMigrationMarker', 'clearMigrationMarker', 'diagnostics',
    'rollbackLearningV1',
  ]
  ok('storage.ts 导出 20 个设计符号', storageExports.every((n) => typeof S(n) === 'function' || typeof S(n) === 'string'),
    `缺失 = ${storageExports.filter((n) => S(n) === undefined).join(',') || '无'}`)
  ok('BACKUP_FIELD_TO_LEGACY_KEY 导出且为 4 字段映射（G3-6 回滚封装）',
    typeof S('BACKUP_FIELD_TO_LEGACY_KEY') === 'object' && Object.keys(S('BACKUP_FIELD_TO_LEGACY_KEY')).length === 4)
  const diagExports = ['reportDiag', 'getDiagBuffer', 'clearDiagBuffer', 'onSaveFailure', 'emitSaveFailure',
    'errorNameOf', 'isQuotaError', 'snapshotQuota', 'checkQuotaPressure', 'onQuotaPressure',
    'QUOTA_WARN_PERCENT', 'QUOTA_CONSERVATIVE_BYTES']
  ok('diagnostics.ts 导出三件套 + quota 观测', diagExports.every((n) => D(n) !== undefined),
    `缺失 = ${diagExports.filter((n) => D(n) === undefined).join(',') || '无'}`)
  ok('codec.ts 导出 mapCodec / arrayCodec / 形状工具', ['mapCodec', 'arrayCodec', 'isPlainObject', 'isFiniteNumber', 'numOr'].every((n) => typeof C(n) === 'function'))
  ok('QUOTA_WARN_PERCENT = 70（G4-4 判据原值）', D('QUOTA_WARN_PERCENT') === 70)
  ok('QUOTA_CONSERVATIVE_BYTES = 5 MiB（§2.9 保守口径）', D('QUOTA_CONSERVATIVE_BYTES') === 5 * 1024 * 1024)

  /* =========================================================================
   * B · 读写 roundtrip + 成功对照组（成功路径必须零 diag）
   * ======================================================================= */
  console.log('\n== B · 读写 roundtrip（成功对照组：零 diag）==')
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  const r1 = rec('content:word:ecdict-cet4:abandon', 2)
  const put = S('putRecord')(r1)
  ok('putRecord 成功：{ok:true, evicted:0}', put.result.ok === true && put.result.evicted === 0, JSON.stringify(put.result))
  ok('loadLearningV2 roundtrip：contentId 命中', S('loadLearningV2')()['content:word:ecdict-cet4:abandon']?.contentId === 'content:word:ecdict-cet4:abandon')
  ok('getRecord 返回同一条', S('getRecord')('content:word:ecdict-cet4:abandon')?.review?.intervalIdx === 2)
  ok('对照组：成功路径零 diag', D('getDiagBuffer')().length === 0, `len=${D('getDiagBuffer')().length}`)
  ok('对照组：成功路径零 console.warn（未安装捕获但 buffer 为空即证）', warns.length === 0)

  /* =========================================================================
   * C · 失败可观测（G4-3②：reportDiag + emitSaveFailure 双路必须同时发生）
   * ======================================================================= */
  console.log('\n== C · 写失败 → diag + 事件双路（G4-3②）==')
  globalThis.localStorage = makeLs({ failSetTimes: Infinity })
  D('clearDiagBuffer')()
  let evt = null
  const unsub = D('onSaveFailure')((e) => { evt = e })
  captureWarn()
  const r2 = S('saveLearningV2')({ 'content:word:x:a': rec('content:word:x:a') })
  restoreWarn()
  ok('非 quota 失败：{ok:false, reason:"unavailable", evicted:0}', r2.ok === false && r2.reason === 'unavailable' && r2.evicted === 0, JSON.stringify(r2))
  const buf = D('getDiagBuffer')()
  ok('reportDiag 记了 STORAGE_WRITE_FAILED', buf.some((e) => e.code === 'STORAGE_WRITE_FAILED' && e.key === KEY))
  ok('emitSaveFailure 触发订阅（key / ok=false）', !!evt && evt.key === KEY && evt.result.ok === false)
  ok('半静默防线：warn 也发生了（三路齐全）', warns.some((w) => w.includes('[learning/storage]')))

  /* 各键的写失败也必须上报 */
  globalThis.localStorage = makeLs({ failSetTimes: Infinity })
  D('clearDiagBuffer')()
  S('saveLetterStats')({ letters: { a: { hits: 1, types: 1 } } })
  ok('saveLetterStats 失败 → diag key=gt.letterStats.v1', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_WRITE_FAILED' && e.key === 'gt.letterStats.v1'))
  S('saveTotals')({ totalKeys: 1, totalCorrect: 1, totalWords: 1, bestWpm: 42 })
  ok('saveTotals 失败 → diag key=gt.totals.v1', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_WRITE_FAILED' && e.key === 'gt.totals.v1'))
  S('saveMigrationMarker')({ sourceFingerprint: 'fp', migratorVersion: 'v1', rollbackToken: { backupKey: KEY + '.backup', writtenKeys: [KEY] } })
  ok('saveMigrationMarker 失败 → diag key=gt.migration.v1', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_WRITE_FAILED' && e.key === 'gt.migration.v1'))
  ok('三键失败各记一条（不相互吞）', D('getDiagBuffer')().filter((e) => e.code === 'STORAGE_WRITE_FAILED').length === 3, `len=${D('getDiagBuffer')().length}`)
  unsub()

  /* =========================================================================
   * D · Quota 熔断（G4-4①：QUOTA_EVICTED + protectedKey 语义）
   * ======================================================================= */
  console.log('\n== D · Quota 熔断可观测（G4-4①）==')
  globalThis.localStorage = makeLs({ failSetTimes: 1, failSetWith: quotaErr() })
  D('clearDiagBuffer')()
  captureWarn()
  const store4 = {
    'content:word:p:w1': rec('content:word:p:w1', 1),
    'content:word:p:w2': rec('content:word:p:w2', 2),
    'content:word:p:w3': rec('content:word:p:w3', 3),
    'content:word:p:w4': rec('content:word:p:w4', 4),
  }
  const r3 = S('saveLearningV2')(store4)
  restoreWarn()
  ok('首轮清洗后写入成功：{ok:true, evicted:1}', r3.ok === true && r3.evicted === 1, JSON.stringify(r3))
  ok('diag 记 QUOTA_EVICTED count=1', D('getDiagBuffer')().some((e) => e.code === 'QUOTA_EVICTED' && e.count === 1))
  ok('被清洗的条目不在落盘结果里', !S('loadLearningV2')()['content:word:p:w4'])
  ok('清洗轮有 console.warn 留痕', warns.some((w) => w.includes('熔断清洗第 1 轮')))

  /* protectedKey 永不清洗：只有 1 条且就是 protectedKey ⇒ 候选空 ⇒ break ⇒ ok:false */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  S('saveLearningV2')({ 'content:word:p:solo': rec('content:word:p:solo', 1) })
  const before = globalThis.localStorage._map.get(KEY)
  globalThis.localStorage = makeLs({ failSetTimes: Infinity, failSetWith: quotaErr() })
  // 保留旧值：新桩里预置同一旧值，模拟「磁盘上已有历史数据」
  globalThis.localStorage._map.set(KEY, before)
  D('clearDiagBuffer')()
  const r4 = S('saveLearningV2')({ 'content:word:p:solo': rec('content:word:p:solo', 9) }, 'content:word:p:solo')
  ok('protectedKey 唯一条目：候选空 → 不空跑 → {ok:false, reason:"quota", evicted:0}', r4.ok === false && r4.reason === 'quota' && r4.evicted === 0, JSON.stringify(r4))
  ok('旧值未被破坏（清洗没有误伤磁盘历史数据）', globalThis.localStorage._map.get(KEY) === before)
  ok('protectedKey 场景无 QUOTA_EVICTED（一次都没清成）', !D('getDiagBuffer')().some((e) => e.code === 'QUOTA_EVICTED'))
  ok('最终失败也走 failWrite（STORAGE_WRITE_FAILED 在案）', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_WRITE_FAILED'))

  /* =========================================================================
   * E · Quota 可观测（G4-4②：snapshotQuota / 70% 触发 / 69% 对照组 / 滞回）
   * ======================================================================= */
  console.log('\n== E · Quota 压力观测（G4-4②）==')
  const lsE = makeLs()
  globalThis.localStorage = lsE
  D('clearDiagBuffer')()
  lsE.setItem(KEY, 'x'.repeat(1000)) // 2000 UTF-16 字节
  lsE.setItem('gt.totals.v1', 'y'.repeat(500)) // 1000 字节
  lsE.setItem('not-gt-key', 'z'.repeat(99999)) // 非 gt. 键，必须被排除
  const snap = D('snapshotQuota')()
  ok('snapshotQuota 覆盖全部 gt.* 键', snap.perKeyBytes[KEY] === 2000 && snap.perKeyBytes['gt.totals.v1'] === 1000)
  ok('非 gt. 键不计入', !('not-gt-key' in snap.perKeyBytes))
  ok('totalGtBytes = 3000（UTF-16 ×2 口径）', snap.totalGtBytes === 3000)
  ok('percent = totalGtBytes / 5MiB × 100', Math.abs(snap.percent - (3000 / (5 * 1024 * 1024) * 100)) < 1e-9)

  /* 70% 触发 / 69% 不触发（对照组）—— 滞回上升沿 */
  const lsHot = makeLs()
  globalThis.localStorage = lsHot
  D('clearDiagBuffer')()
  let pressureEvt = null
  const unsubP = D('onQuotaPressure')((e) => { pressureEvt = e })
  lsHot.setItem(KEY, 'a'.repeat(1835008)) // 3,670,016 B = 恰好 70.0%
  const fired70 = D('checkQuotaPressure')()
  ok('70%：checkQuotaPressure 返回 true 且事件触发', fired70 === true && pressureEvt !== null && Math.abs(pressureEvt.percent - 70) < 0.01)
  ok('70%：diag 记 QUOTA_PRESSURE', D('getDiagBuffer')().some((e) => e.code === 'QUOTA_PRESSURE'))
  const fired70again = D('checkQuotaPressure')()
  ok('滞回：持续超阈值不重复触发（第二次 false）', fired70again === false)
  lsHot.setItem(KEY, 'a'.repeat(1814000)) // 3,628,000 B ≈ 69.2%
  const fired69 = D('checkQuotaPressure')()
  ok('对照组 69%：不触发', fired69 === false && D('getDiagBuffer')().filter((e) => e.code === 'QUOTA_PRESSURE').length === 1)
  lsHot.setItem(KEY, 'a'.repeat(1840000)) // 再次 ≥70%
  const firedAgain = D('checkQuotaPressure')()
  ok('滞回复位后再次跨阈值：重新触发', firedAgain === true)
  unsubP()

  /* =========================================================================
   * F · Codec 挡脏数据（G4-5：合法保留 / 非法丢弃 / 整表非法回落 / 不抛）
   * ======================================================================= */
  console.log('\n== F · 校验挡脏数据（G4-5）==')
  const lsF = makeLs()
  globalThis.localStorage = lsF
  D('clearDiagBuffer')()
  const goodId = 'content:word:ecdict-cet4:abandon'
  const legacyKey = 'legacy:unattributed:absent'
  lsF.setItem(KEY, JSON.stringify({
    [goodId]: rec(goodId, 3),
    [legacyKey]: { word: 'absent', times: 1 },
    junk1: { nothing: true },
    junk2: 42,
  }))
  captureWarn()
  const loaded = S('loadLearningV2')()
  restoreWarn()
  ok('合法项保留：正式记录还在', loaded[goodId]?.review?.intervalIdx === 3)
  ok('合法项保留：legacy 占位还在', loaded[legacyKey]?.word === 'absent')
  ok('非法项丢弃：两条垃圾都消失', !('junk1' in loaded) && !('junk2' in loaded))
  ok('diag 记 STORAGE_ENTRY_DROPPED count=2', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_ENTRY_DROPPED' && e.count === 2))
  ok('丢弃留痕：console.warn 提到被丢的键名', warns.some((w) => w.includes('junk1')))
  ok('getRecord(合法) 正常返回', S('getRecord')(goodId)?.review?.intervalIdx === 3)
  ok('getLegacyRecord(legacy 键) 正常返回', S('getLegacyRecord')(legacyKey)?.word === 'absent')
  ok('getRecord(legacy 键) 收窄为 null（不串区）', S('getRecord')(legacyKey) === null)
  ok('getRecord(已丢弃键) 返回 null 而不抛', S('getRecord')('junk1') === null)

  /* 整表非法（G4-5 特意点名 analytics 数组缺陷的同源防线） */
  D('clearDiagBuffer')()
  lsF.setItem(KEY, '[1,2,3]')
  captureWarn()
  const loadedArr = S('loadLearningV2')()
  restoreWarn()
  ok('整表是数组 → 空表（不产生数字键怪对象）', typeof loadedArr === 'object' && Object.keys(loadedArr).length === 0)
  ok('整表非法 → diag STORAGE_READ_CORRUPT', D('getDiagBuffer')().some((e) => e.code === 'STORAGE_READ_CORRUPT' && e.key === KEY))
  lsF.setItem(KEY, '{broken json')
  captureWarn()
  S('loadLearningV2')()
  restoreWarn()
  ok('坏 JSON → 空表 + warn + diag', warns.some((w) => w.includes('整表非法')) && D('getDiagBuffer')().some((e) => e.code === 'STORAGE_READ_CORRUPT'))

  /* letterStats / totals 的整值校验（readRaw 路径） */
  D('clearDiagBuffer')()
  lsF.setItem('gt.letterStats.v1', JSON.stringify({ letters: 5 }))
  const ls1 = S('loadLetterStats')()
  ok('letterStats.letters 非对象 → 空表 + diag', Object.keys(ls1.letters).length === 0 && D('getDiagBuffer')().some((e) => e.code === 'STORAGE_READ_CORRUPT' && e.key === 'gt.letterStats.v1'))
  lsF.setItem('gt.totals.v1', JSON.stringify({ totalKeys: 1, totalCorrect: 2, totalWords: 3 })) // 缺 bestWpm
  const t1 = S('loadTotals')()
  ok('totals 缺字段 → 整份回落 EMPTY_TOTALS + diag', t1.totalKeys === 0 && t1.bestWpm === 0 && D('getDiagBuffer')().some((e) => e.code === 'STORAGE_READ_CORRUPT' && e.key === 'gt.totals.v1'))
  lsF.setItem('gt.totals.v1', JSON.stringify({ totalKeys: 7, totalCorrect: 8, totalWords: 9, bestWpm: 66 }))
  ok('totals 合法 → 原样读回', S('loadTotals')().bestWpm === 66)

  /* marker 校验（幂等 + 回滚的依据，校验必须更严） */
  D('clearDiagBuffer')()
  lsF.setItem('gt.migration.v1', JSON.stringify({ sourceFingerprint: 'fp', migratorVersion: 'v1' })) // 缺 rollbackToken
  ok('marker 残缺（缺 rollbackToken）→ null + diag', S('loadMigrationMarker')() === null && D('getDiagBuffer')().some((e) => e.code === 'STORAGE_READ_CORRUPT' && e.key === 'gt.migration.v1'))
  const marker = { sourceFingerprint: 'fp', migratorVersion: 'v1', rollbackToken: { backupKey: KEY + '.backup', writtenKeys: [KEY, 'gt.review.v1'] } }
  lsF.setItem('gt.migration.v1', JSON.stringify(marker))
  const m2 = S('loadMigrationMarker')()
  ok('marker 合法 → 原样读回（rollbackToken 完整）', m2 !== null && m2.rollbackToken.writtenKeys.length === 2)

  /* 环境不可用 ≠ 数据损坏：不打 diag */
  globalThis.localStorage = makeLs({ failGet: true })
  D('clearDiagBuffer')()
  const envEmpty = S('loadLearningV2')()
  ok('隐私模式（getItem 抛）→ 空表且零 diag（环境问题不是损坏）', Object.keys(envEmpty).length === 0 && D('getDiagBuffer')().length === 0)

  /* codec 工厂直接验证（G4-5 的 decode 契约：不合法返回 null 不抛） */
  const mc = C('mapCodec')((v) => typeof v === 'object' && v !== null && typeof v.word === 'string')
  ok('mapCodec.decode：坏 JSON → null（不抛）', mc.decode('{nope') === null)
  ok('mapCodec.decode：数组 → null（isPlainObject 防线）', mc.decode('[{"word":"a"}]') === null)
  const mixed = mc.decode(JSON.stringify({ a: { word: 'keep' }, b: { junk: 1 } }))
  ok('mapCodec.decode：合法保留 + 非法丢弃（逐项，不整表判废）', mixed !== null && mixed.a?.word === 'keep' && !('b' in mixed))
  const ac = C('arrayCodec')((v) => typeof v === 'string')
  const arr = ac.decode(JSON.stringify(['keep', 42, null, 'also']))
  ok('arrayCodec.decode：合法项保留、非法项丢弃', arr.length === 2 && arr[0] === 'keep' && arr[1] === 'also')

  /* diagnostics() 自身（容量观测） */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  S('saveLearningV2')({ 'content:word:q:a': rec('content:word:q:a'), 'legacy:orphan:gone': { word: 'gone' } })
  const d = S('diagnostics')()
  ok('diagnostics()：learningRecords=1 / legacyRecords=1 / bytesUtf16>0 / markerPresent=false',
    d.learningRecords === 1 && d.legacyRecords === 1 && d.bytesUtf16 > 0 && d.markerPresent === false, JSON.stringify(d))

  /* =========================================================================
   * G · rollbackLearningV1 行为（G3-6 一键回滚封装，§2.7.2 一句话算法）
   *    契约：删 writtenKeys 全部新键 → 从 backupKey 恢复 backedUpKeys → marker 可清。
   *    漂移防线：① 映射值序 vs IN_SCOPE_KEYS；② 恢复循环由 backedUpKeys 驱动，
   *    映射驱动实现会被 G-2 的「其余键 junk 幸存」断言顶出。
   * ======================================================================= */
  console.log('\n== G · rollbackLearningV1（G3-6 一键回滚）==')

  /* G-0 · 漂移锁死 */
  const mapping = S('BACKUP_FIELD_TO_LEGACY_KEY')
  ok('漂移锁死：Object.values(mapping) 逐项 === IN_SCOPE_KEYS（同序同值）',
    JSON.stringify(Object.values(mapping)) === JSON.stringify([...M('IN_SCOPE_KEYS')]),
    `mapping=${JSON.stringify(Object.values(mapping))} vs IN_SCOPE_KEYS=${JSON.stringify([...M('IN_SCOPE_KEYS')])}`)
  ok('漂移锁死：mapping 字段名 = migrate.ts backup 构造的四字段（review/memorize/analytics/customBanks）',
    JSON.stringify(Object.keys(mapping)) === JSON.stringify(['review', 'memorize', 'analytics', 'customBanks']))

  const tokenOf = (over = {}) => ({
    id: 't-g',
    backupKey: 'gt.learning.v2.backup',
    writtenKeys: ['gt.learning.v2', 'gt.learning.v2.backup', 'gt.migration.v1'],
    backedUpKeys: [...M('IN_SCOPE_KEYS')],
    legacyKeysRetained: false,
    ...over,
  })

  /* G-1 · 成功路径：4 键齐全（migration-guards G3-6 的 RAW 形态）→ 逐字节写回 + 新键全清 */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  const reviewRaw = JSON.stringify([{ contentId: 'content:word:cet4:abandon', wrongCount: 1, intervalIdx: 2 }])
  const memorizeRaw = JSON.stringify({ 'content:word:cet4:abandon': { status: 'known', reviews: 3 } })
  const analyticsRaw = JSON.stringify({ words: { abandon: { done: 5, wrong: 1 } }, letters: {} })
  const customBanksRaw = JSON.stringify([{ id: 'custom-1', name: 'mine', words: ['abandon'] }])
  globalThis.localStorage.setItem('gt.review.v1', reviewRaw)
  globalThis.localStorage.setItem('gt.memorize.v1', memorizeRaw)
  globalThis.localStorage.setItem('gt.analytics.v1', analyticsRaw)
  globalThis.localStorage.setItem('gt.customBanks.v1', customBanksRaw)
  globalThis.localStorage.setItem('gt.learning.v2', '{"migrated":true}')
  globalThis.localStorage.setItem('gt.learning.v2.backup', JSON.stringify({
    review: JSON.parse(reviewRaw), memorize: JSON.parse(memorizeRaw),
    analytics: JSON.parse(analyticsRaw), customBanks: JSON.parse(customBanksRaw),
  }))
  globalThis.localStorage.setItem('gt.migration.v1', JSON.stringify({ sourceFingerprint: 'fp', migratorVersion: 'v1', rollbackToken: tokenOf() }))
  const out1 = S('rollbackLearningV1')(tokenOf())
  ok('成功路径：restored=4 / cleared=3 / failed=0 / markerCleared=true',
    out1.restored.length === 4 && out1.cleared.length === 3 && out1.failed.length === 0 && out1.markerCleared === true,
    JSON.stringify(out1))
  ok('旧键逐字节写回：review / memorize / analytics / customBanks 四键全同值',
    globalThis.localStorage.getItem('gt.review.v1') === reviewRaw &&
    globalThis.localStorage.getItem('gt.memorize.v1') === memorizeRaw &&
    globalThis.localStorage.getItem('gt.analytics.v1') === analyticsRaw &&
    globalThis.localStorage.getItem('gt.customBanks.v1') === customBanksRaw)
  ok('G3-6 判据：回滚后 5 类新键全部不存在（learning.v2 / backup / marker）',
    globalThis.localStorage.getItem('gt.learning.v2') === null &&
    globalThis.localStorage.getItem('gt.learning.v2.backup') === null &&
    globalThis.localStorage.getItem('gt.migration.v1') === null)
  ok('对照组：成功回滚零 diag（不滥报）', D('getDiagBuffer')().length === 0, `len=${D('getDiagBuffer')().length}`)

  /* G-2 · backedUpKeys 驱动（§2.7.2 原文）：不在清单里的键**不被触碰**。
   *    若实现误用「映射全集驱动」，analytics 会被 backup 覆盖、memorize 会被 removeItem —— 本断言即红。 */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  const reviewRaw2 = JSON.stringify([{ contentId: 'content:word:cet4:only', wrongCount: 1, intervalIdx: 1 }])
  globalThis.localStorage.setItem('gt.analytics.v1', '{"createdBySomethingElse":true}') // 非本次迁移范围
  globalThis.localStorage.setItem('gt.learning.v2.backup', JSON.stringify({
    review: JSON.parse(reviewRaw2), memorize: {}, analytics: { hijacked: true }, customBanks: [],
  }))
  const out2 = S('rollbackLearningV1')(tokenOf({ backedUpKeys: ['gt.review.v1'] }))
  ok('backedUpKeys 驱动：restored 只含清单内的键', JSON.stringify(out2.restored) === JSON.stringify(['gt.review.v1']), JSON.stringify(out2.restored))
  ok('backedUpKeys 驱动：清单外的 gt.analytics.v1 原样幸存（junk 未被 backup 覆盖）',
    globalThis.localStorage.getItem('gt.analytics.v1') === '{"createdBySomethingElse":true}')
  ok('backedUpKeys 驱动：清单外的 gt.memorize.v1 不被 removeItem（仍为 null）', globalThis.localStorage.getItem('gt.memorize.v1') === null)

  /* G-3 · 缺键占位的 backup 忠实性：migrate.ts 四字段恒在（G3-6 已锁），缺键 = '{}' / '[]' 占位，
   *    回滚**原样写回**占位（占位 {} 与真实空表不可区分，宁可原样 —— 键会存在但内容为空表，v1 读者语义等价）。 */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  globalThis.localStorage.setItem('gt.review.v1', reviewRaw)
  globalThis.localStorage.setItem('gt.memorize.v1', memorizeRaw)
  globalThis.localStorage.setItem('gt.learning.v2.backup', JSON.stringify({
    review: JSON.parse(reviewRaw), memorize: JSON.parse(memorizeRaw), analytics: {}, customBanks: [],
  }))
  S('rollbackLearningV1')(tokenOf())
  ok('缺键占位：迁移前不存在的 analytics/customBanks 被写回占位 \'{}\' / \'[]\'（backup 忠实）',
    globalThis.localStorage.getItem('gt.analytics.v1') === '{}' && globalThis.localStorage.getItem('gt.customBanks.v1') === '[]',
    `analytics=${globalThis.localStorage.getItem('gt.analytics.v1')} customBanks=${globalThis.localStorage.getItem('gt.customBanks.v1')}`)

  /* G-4 · backup 缺失：失败进 outcome 不抛；新键仍清（坏状态必须走） */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  globalThis.localStorage.setItem('gt.learning.v2', '{"junk":1}')
  globalThis.localStorage.setItem('gt.migration.v1', JSON.stringify({ sourceFingerprint: 'fp', migratorVersion: 'v1', rollbackToken: tokenOf() }))
  const out4 = S('rollbackLearningV1')(tokenOf())
  ok('backup 缺失：failed 记 {backupKey, "backup missing…"}，restored=[]，不抛',
    out4.failed.length === 1 && out4.failed[0].key === 'gt.learning.v2.backup' && out4.failed[0].reason.includes('backup missing') && out4.restored.length === 0,
    JSON.stringify(out4.failed))
  ok('backup 缺失：新键仍清除', out4.cleared.length === 3 && globalThis.localStorage.getItem('gt.learning.v2') === null)
  ok('backup 缺失：MIGRATION_WARNING diag（失败留痕）', D('getDiagBuffer')().some((e) => e.code === 'MIGRATION_WARNING'))

  /* G-5 · backup 损坏（非法 JSON）→ backup unreadable + 新键仍清 */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  globalThis.localStorage.setItem('gt.learning.v2', '{"junk":1}')
  globalThis.localStorage.setItem('gt.learning.v2.backup', '{nope')
  const out5 = S('rollbackLearningV1')(tokenOf())
  ok('backup 损坏：failed 记 backup unreadable: SyntaxError', out5.failed.some((f) => f.reason.includes('backup unreadable: SyntaxError')), JSON.stringify(out5.failed))
  ok('backup 损坏：新键仍清除', out5.cleared.length === 3 && globalThis.localStorage.getItem('gt.learning.v2') === null)

  /* G-6 · 旧键写回失败（quota/任意 setItem 抛）：不抛、failed 全记、diag 双码 + warn（零静默） */
  const lsFail = makeLs({ failSetTimes: Infinity })
  lsFail._map.set('gt.learning.v2.backup', JSON.stringify({ review: { a: 1 }, memorize: {}, analytics: {}, customBanks: [] }))
  globalThis.localStorage = lsFail
  D('clearDiagBuffer')()
  captureWarn()
  const out6 = S('rollbackLearningV1')(tokenOf())
  restoreWarn()
  ok('写回失败：不抛（能走到断言即证）+ 4 个旧键全进 failed', out6.failed.length === 4 && out6.restored.length === 0, JSON.stringify(out6.failed))
  ok('写回失败：diag 双码 —— STORAGE_WRITE_FAILED（逐键）+ MIGRATION_WARNING（汇总）',
    D('getDiagBuffer')().filter((e) => e.code === 'STORAGE_WRITE_FAILED').length === 4 &&
    D('getDiagBuffer')().some((e) => e.code === 'MIGRATION_WARNING' && e.count === 4))
  ok('写回失败：console.warn 留痕（半静默防线）', warns.some((w) => w.includes('回滚有')))

  /* G-7 · marker 漏出 writtenKeys → markerCleared=false（暴露清单漂移，不静默） */
  globalThis.localStorage = makeLs()
  D('clearDiagBuffer')()
  globalThis.localStorage.setItem('gt.migration.v1', JSON.stringify({ sourceFingerprint: 'fp', migratorVersion: 'v1', rollbackToken: tokenOf() }))
  const out7 = S('rollbackLearningV1')(tokenOf({ writtenKeys: ['gt.learning.v2'] }))
  ok('marker 漏出 writtenKeys → markerCleared=false（不静默吞掉漏清）', out7.markerCleared === false && globalThis.localStorage.getItem('gt.migration.v1') !== null)
} finally {
  await server.close()
}

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
if (fail > 0) {
  console.log('失败项：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('G4 行为侧：全部通过')
