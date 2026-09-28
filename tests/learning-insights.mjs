#!/usr/bin/env node
/**
 * P1.5 · G6-2 / G6-3 行为证据：`learning/insights.ts`
 *
 *   G6-2  `masteryDistributionV2`：`legacy:*` 不得混进四档分布（unattributed 单列）
 *   G6-3  `dueWordsV2`：`legacy:*` 不得进 due 列表；且 attributed + unattributed === total
 *         （「分开展示」≠「悄悄隐藏」—— §2.4.3）
 *
 * 自校验纪律：
 *   - 每条「不包含」断言都配**在场前置断言**（unattributed > 0），防「恒空分布」假通过；
 *   - 对照组：把同三条 legacy 换成正式 ContentId ⇒ 分布**必须**变化 ——
 *     证明过滤是**内容驱动**的，不是写死的结果。
 *
 * 纯函数模块（insights.ts 不碰 localStorage），直接 ssrLoadModule 后调用。
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
})
try {
  const { masteryDistributionV2, dueWordsV2 } = await server.ssrLoadModule('/src/lib/learning/insights.ts')

  const NOW = 1_700_000_000_000
  /* 注意：返回 { [contentId]: entry } —— store 的形状是 Record<contentId, entry>，
   * 直接返回 entry 再 spread 会把 contentId/review 变成 store 顶层键（首跑踩过：全零分布）。 */
  const rec = (contentId, { correctStreak = 0, intervalIdx = 0, dueIn = 0 } = {}) => ({
    [contentId]: {
      contentId,
      review: { wrongCount: 1, correctStreak, lastWrongAt: NOW - 86400e3, nextReviewAt: NOW + dueIn, intervalIdx },
    },
  })
  const legacy = (key, opts = {}) => ({ [key]: { word: key.split(':')[1] ?? 'w', freshness: 'unknown', review: { wrongCount: 1, correctStreak: 0, lastWrongAt: NOW - 86400e3, nextReviewAt: NOW + (opts.dueIn ?? 0), intervalIdx: 0 }, ...opts.extra } })

  /* =========================================================================
   * G6-2 · masteryDistributionV2 过滤 legacy:*
   * ======================================================================= */
  console.log('\n== G6-2 · masteryDistributionV2 过滤 legacy:* ==')
  const mixed = {
    ...rec('content:word:cet4:struggling', { correctStreak: 0 }), // struggling
    ...rec('content:word:cet4:strong', { correctStreak: 3, intervalIdx: 3 }), // strong
    ...legacy('legacy:unattributed:absent1'),
    ...legacy('legacy:orphan:gone2'),
    ...legacy('legacy:case-conflict:conflict3'),
  }
  const d1 = masteryDistributionV2(mixed)
  ok('前置自校验：unattributed = 3（legacy 确实在场，防「恒空分布」假通过）', d1.unattributed === 3)
  ok('四档分布不含 legacy（struggling=1, strong=1，其余 0）',
    d1.attributed.struggling === 1 && d1.attributed.strong === 1 && d1.attributed.learning === 0 && d1.attributed.familiar === 0,
    JSON.stringify(d1.attributed))
  const sum = Object.values(d1.attributed).reduce((a, b) => a + b, 0)
  ok('四档计数之和 = 带 review 的正式记录数（2），不是全表条数（5）', sum === 2, `sum=${sum}`)
  ok('legacy 记录的 freshness=unknown 不影响分布（分布只看 review）', d1.attributed.struggling === 1)

  /* 对照组：同三条换成正式 ContentId ⇒ 分布必须变化 */
  const control = {
    ...rec('content:word:cet4:struggling', { correctStreak: 0 }),
    ...rec('content:word:cet4:strong', { correctStreak: 3, intervalIdx: 3 }),
    ...rec('content:word:cet4:legacy1', { correctStreak: 0 }),
    ...rec('content:word:cet4:legacy2', { correctStreak: 0 }),
    ...rec('content:word:cet4:legacy3', { correctStreak: 0 }),
  }
  const d2 = masteryDistributionV2(control)
  ok('对照组：换成正式键后 struggling=4（证明上面的过滤是内容驱动的，不是写死）',
    d2.attributed.struggling === 4 && d2.attributed.strong === 1 && d2.unattributed === 0,
    JSON.stringify(d2.attributed))

  /* memorize-only / analytics-only 记录不进分布（口径说明见 insights.ts 头注释） */
  const mixedShapes = {
    ...rec('content:word:cet4:hasReview', { correctStreak: 2, intervalIdx: 2 }),
    'content:word:cet4:memorizeOnly': { contentId: 'content:word:cet4:memorizeOnly', memorize: { status: 'known', reviews: 3, lastAt: NOW } },
    'content:word:cet4:analyticsOnly': { contentId: 'content:word:cet4:analyticsOnly', analytics: { done: 5, wrong: 1 } },
  }
  const d3 = masteryDistributionV2(mixedShapes)
  ok('memorize-only / analytics-only 不进四档分布（分布主题 = 错题本）',
    d3.attributed.familiar === 1 && Object.values(d3.attributed).reduce((a, b) => a + b, 0) === 1)

  /* =========================================================================
   * G6-3 · dueWordsV2：legacy:* 不进 due；attributed + unattributed === total
   * ======================================================================= */
  console.log('\n== G6-3 · dueWordsV2 分区 ==')
  const store = {
    ...rec('content:word:cet4:dueReal', { correctStreak: 1, dueIn: -100 }), // 到期
    ...rec('content:word:cet4:futureReal', { correctStreak: 1, dueIn: 86400e3 }), // 未到期
    ...legacy('legacy:orphan:dueGhost', { dueIn: -200 }), // legacy 到期 —— 不得进 due
    ...legacy('legacy:unattributed:futureGhost', { dueIn: 86400e3 }), // legacy 未到期
  }
  const p1 = dueWordsV2(store, NOW)
  ok('due 列表 = 正式到期 contentId，且不含任何 legacy: 前缀',
    p1.attributed.length === 1 && p1.attributed[0] === 'content:word:cet4:dueReal' && p1.attributed.every((k) => !k.startsWith('legacy:')),
    JSON.stringify(p1.attributed))
  ok('前置自校验：unattributed = 1（legacy 到期条目确实在场且被计数，不是悄悄消失）', p1.unattributed === 1)
  ok('对照组等式：attributed.length + unattributed === total（分开展示 ≠ 悄悄隐藏）',
    p1.attributed.length + p1.unattributed === p1.total && p1.total === 2, `total=${p1.total}`)

  /* 对照组：删掉 legacy 到期条目 ⇒ unattributed 归零、total 收缩（证明计数是活的） */
  const noLegacyDue = {
    ...rec('content:word:cet4:dueReal', { correctStreak: 1, dueIn: -100 }),
    ...rec('content:word:cet4:futureReal', { correctStreak: 1, dueIn: 86400e3 }),
    ...legacy('legacy:unattributed:futureGhost', { dueIn: 86400e3 }),
  }
  const p2 = dueWordsV2(noLegacyDue, NOW)
  ok('对照组：无 legacy 到期 ⇒ unattributed=0 且 total=1（计数是内容驱动的）', p2.unattributed === 0 && p2.total === 1)

  /* 边界：legacy 记录没有 review 子记录 ⇒ 既不进 due 也不计 unattributedDue */
  const noReviewLegacy = { ...rec('content:word:cet4:dueReal', { dueIn: -100 }), 'legacy:orphan:bare': { word: 'bare', freshness: 'unknown' } }
  const p3 = dueWordsV2(noReviewLegacy, NOW)
  ok('无 review 的 legacy 占位：不进 due、不计到期数（nothing to review）', p3.attributed.length === 1 && p3.unattributed === 0 && p3.total === 1)

  /* 空 store 全零（对照组：防「恒 1」式的写死） */
  const p4 = dueWordsV2({}, NOW)
  const d0 = masteryDistributionV2({})
  ok('空表：分布全零 + due 全零', Object.values(d0.attributed).every((v) => v === 0) && d0.unattributed === 0 && p4.total === 0)
} finally {
  await server.close()
}

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
if (fail > 0) {
  console.log('失败项：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('G6-2 / G6-3 行为侧：全部通过')
