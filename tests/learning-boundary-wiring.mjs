#!/usr/bin/env node
/**
 * P1.7 Wave 2-B · learning 键族 persistence 接线测试
 *
 * 证明「W2A 建的 Repository/namespace 边界是否真的被业务模块接起来」：
 *   1. lib/learning/storage 的原生读写已收口到 storage-io → Repository；
 *   2. 写入**字节与改造前完全一致**（只走 getRaw/setRaw，不经 codec）；
 *   3. 未注册键 / 跨域键写入在真实业务路径上被判红（NamespaceError）；
 *   4. 损坏数据 / 键不存在的既有语义（空表 + 不静默）保持不变；
 *   5. 服务拆分后门面 API 与单例成员集合不减（向后兼容）。
 *
 * 用法：node tests/learning-boundary-wiring.mjs
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
function throws(fn, ErrClass) {
  try { fn(); return false } catch (e) { return e instanceof ErrClass }
}

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const adapterMod = await server.ssrLoadModule('/src/core/persistence/adapter.ts')
const nsMod = await server.ssrLoadModule('/src/core/persistence/namespace.ts')
const repoMod = await server.ssrLoadModule('/src/core/persistence/repository.ts')
const ioMod = await server.ssrLoadModule('/src/core/learning/storage-io.ts')
const storageMod = await server.ssrLoadModule('/src/lib/learning/storage.ts')
const serviceMod = await server.ssrLoadModule('/src/core/learning/service.ts')

const { MemoryStorageAdapter } = adapterMod
const { NamespaceError } = nsMod
const { KeyFamilyRepository } = repoMod
const { setLearningAdapter, readKeyRaw, writeKeyRaw, removeKeyRaw } = ioMod
const {
  KEY_LEARNING_V2, KEY_LETTER_STATS, KEY_TOTALS, KEY_MIGRATION,
  loadLearningV2, saveLearningV2, loadLetterStats, saveLetterStats, loadTotals, saveTotals,
  saveMigrationMarker, loadMigrationMarker, clearMigrationMarker,
} = storageMod

/** 注入内存适配器：被测代码经 Repository 读写，全部落在 memory map 上可观测 */
const mem = new MemoryStorageAdapter()
setLearningAdapter(mem)

/* ---------------- 1. learning.v2：经 Repository 且字节一致 ---------------- */
console.log('== 1. gt.learning.v2 经 Repository 接线 ==')
{
  const store = {
    'content:word:curated-ai-core:attention': {
      contentId: 'content:word:curated-ai-core:attention',
      contentVersion: 1,
      contentChecksum: 'sha256:abc',
      freshness: 'ok',
      memorize: { status: 'known', reviews: 1, lastAt: 1 },
    },
  }
  const r = saveLearningV2(store, 'content:word:curated-ai-core:attention')
  ok('saveLearningV2 → ok', r.ok === true && r.evicted === 0)
  ok('字节与改造前一致（JSON.stringify 原样落盘）', mem.get(KEY_LEARNING_V2) === JSON.stringify(store))
  ok('键落在 persistence 适配器上（证明走了 Repository）', mem.has(KEY_LEARNING_V2))
  const back = loadLearningV2()
  ok('loadLearningV2 读回等价', JSON.stringify(back) === JSON.stringify(store))
}

/* ---------------- 2. letterStats / totals ---------------- */
console.log('== 2. letterStats / totals ==')
{
  const stats = { letters: { a: { total: 3, correct: 2 }, b: { total: 1, correct: 1 } } }
  const r1 = saveLetterStats(stats)
  ok('saveLetterStats → ok 且字节一致', r1.ok === true && mem.get(KEY_LETTER_STATS) === JSON.stringify(stats))
  ok('loadLetterStats 读回等价', JSON.stringify(loadLetterStats()) === JSON.stringify(stats))
  const totals = { totalKeys: 10, totalCorrect: 9, totalWords: 3, bestWpm: 42 }
  const r2 = saveTotals(totals)
  ok('saveTotals → ok 且字节一致', r2.ok === true && mem.get(KEY_TOTALS) === JSON.stringify(totals))
  ok('loadTotals 读回等价', JSON.stringify(loadTotals()) === JSON.stringify(totals))
}

/* ---------------- 3. migration 域隔离（跨域判红在真实路径生效） ---------------- */
console.log('== 3. migration 域隔离 ==')
{
  // 用真实用户快照里的迁移标记形状（migratedAt 为 ISO 串 + rollbackToken 必填）
  const marker = {
    version: 1,
    migratorVersion: 'learning-migrator/1.0.0',
    sourceFingerprint: 'review=9aea6495|memorize=c623f2a4|analytics=2c250460|customBanks=741638a5',
    migratedAt: '2026-09-28T23:39:58.393Z',
    rollbackToken: {
      id: 'mig-1-d0339ebb',
      backupKey: 'gt.learning.v2.backup',
      writtenKeys: ['gt.learning.v2', 'gt.letterStats.v1', 'gt.totals.v1', 'gt.learning.v2.backup', 'gt.migration.v1'],
      backedUpKeys: ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1'],
      legacyKeysRetained: true,
    },
  }
  saveMigrationMarker(marker)
  ok('saveMigrationMarker 落盘（migration 域仓路由）', mem.get(KEY_MIGRATION) === JSON.stringify(marker))
  ok('loadMigrationMarker 读回', loadMigrationMarker() !== null)
  clearMigrationMarker()
  ok('clearMigrationMarker 生效', !mem.has(KEY_MIGRATION) && loadMigrationMarker() === null)
  // 跨域判红：settings 域键不得经 learning 仓写入
  ok('跨域写判红（settings 键经 learning 路径）', throws(() => writeKeyRaw('gt.theme', 'ide'), NamespaceError))
  ok('未注册键写判红', throws(() => writeKeyRaw('gt.unknown.v9', 'x'), NamespaceError))
  ok('非 gt 键写判红', throws(() => writeKeyRaw('other', 'x'), NamespaceError))
  // 读路径与写路径**同约束**：learning 通道访问 settings 域键 → 判红，且不静默成 null
  mem.set('gt.theme', 'ide')
  ok('越界域读判红（settings 键经 learning 通道读 → throw，不静默为 null）', throws(() => readKeyRaw('gt.theme'), NamespaceError))
  // 分层证明：W2A 仓储层契约未变（跨域**读**放行 / 跨域写判红），收严只在模块授权层
  const learningRepo = new KeyFamilyRepository(mem, 'learning')
  ok('仓储层跨域读放行（W2A 契约不变：learning 仓可读 settings 键）', learningRepo.getRaw('gt.theme') === 'ide')
  ok('仓储层跨域写仍判红（W2A 契约不变）', throws(() => learningRepo.setRaw('gt.theme', 'x'), NamespaceError))
  // 允许域不止 learning：回滚路径要读写 analytics / content 域旧键
  mem.set('gt.analytics.v1', '{"a":1}')
  ok('允许域内跨域读放行（analytics 旧键可读）', readKeyRaw('gt.analytics.v1') === '{"a":1}')
  removeKeyRaw(KEY_TOTALS)
  ok('removeKeyRaw 同域放行', !mem.has(KEY_TOTALS))
}

/* ---------------- 4. 既有语义保持：损坏 / 缺失 / 环境不可用 ---------------- */
console.log('== 4. 既有语义保持 ==')
{
  mem.set(KEY_LETTER_STATS, '{broken')
  const stats = loadLetterStats()
  ok('损坏数据 → 空表（不抛、不静默构造）', JSON.stringify(stats) === JSON.stringify({ letters: {} }))
  mem.remove(KEY_LETTER_STATS)
  ok('键缺失 → 空表', JSON.stringify(loadLetterStats()) === JSON.stringify({ letters: {} }))
  mem.set(KEY_LEARNING_V2, '[1,2,3]') // 整表非法（数组）
  ok('learning.v2 整表非法 → 空表', JSON.stringify(loadLearningV2()) === '{}')
  // 存储不可用：getRaw 抛 → readKeyRaw 返回 null（环境问题，不是数据损坏）
  const throwing = new MemoryStorageAdapter()
  throwing.get = () => { throw new Error('SecurityError: storage unavailable') }
  setLearningAdapter(throwing)
  ok('存储不可用 → readKeyRaw null（环境语义，不判损坏）', readKeyRaw(KEY_LEARNING_V2) === null)
  setLearningAdapter(mem) // 复位
}

/* ---------------- 5. 服务拆分向后兼容 ---------------- */
console.log('== 5. 服务拆分向后兼容 ==')
{
  const expected = [
    'getState', 'getMemorizeView', 'getMemorizeStats', 'getReviewItems', 'getDueItems',
    'getMastery', 'getDuePartition', 'getReviewDueCount', 'getReviewTotalCount',
    'getReviewDueViews', 'getReviewItemViews', 'getMasteryDistribution', 'startupMigration',
    'getAnalytics', 'applyWordDone', 'applyKey', 'persistAnalytics', 'freshAnalytics',
    'getWeakLetters', 'recordReview', 'recordPractice', 'recordWordDoneV2',
    'resolveContentId', 'rankByWeakness',
  ]
  const missing = expected.filter((k) => typeof serviceMod[k] !== 'function')
  ok(`门面 24 个函数全部导出`, missing.length === 0, missing.length ? `缺失: ${missing.join(',')}` : '')
  const singletonMissing = expected.filter((k) => typeof serviceMod.learningService[k] !== 'function')
  ok('learningService 单例成员集合不减', singletonMissing.length === 0, singletonMissing.length ? `缺失: ${singletonMissing.join(',')}` : '')
  ok('拆分后 getState 行为不变（无记录 → null/false）', (() => { const s = serviceMod.getState('content:word:none:x'); return s.record === null && s.hasRecord === false })())
  ok('拆分后 resolveContentId 行为不变（无 ctx → \'\'）', serviceMod.resolveContentId('word', {}) === '')
  ok('拆分后 rankByWeakness 返回数组', Array.isArray(serviceMod.rankByWeakness(['ab', 'cd'], ['a'])))
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
