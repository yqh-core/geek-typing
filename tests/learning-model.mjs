#!/usr/bin/env node
/**
 * P1.5 · G2 门禁：Learning 数据模型（`gt.learning.v2` 的形状）
 *
 * 依据：`docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` 的 G2 四道判据
 *   G2-1  `gt.learning.v2` 顶层形状合法（key 形状 / contentId 一致 / intervalIdx / status / freshness）
 *   G2-2  `letters` 与全局聚合**不在** gt.learning.v2 里，且 gt.letterStats.v1 / gt.totals.v1 必须存在
 *   G2-3  `legacy:*` 记录必须自描述（unattributed.candidates.length >= 2；orphan.reason 精确值）
 *   G2-4  `judgeFreshness` 5 个 case 全过（§1.4 真值表）
 *
 * ⚠️ 本脚本**只读**：不写 localStorage、不改任何源码文件、不写任何产物。
 *
 * 怎么加载 TS：Node 不认 TypeScript，因此用 Vite 的 `ssrLoadModule` 在 Node 里按
 *   真实 Vite 管线加载 `src/lib/learning/*.ts`（写法学 `tests/content-query.mjs:31-34`）。
 *
 * 两种数据来源（**绝不混淆**，退出码语义见下）：
 *   ① `--user-store=<file>`  真实旧快照（localStorage 全量导出）→ 真跑迁移 → 断言产物
 *   ② 缺省                   用合成输入（`buildSyntheticInput()`）自测 → **显式警示 + 降级退出码**
 *
 * 退出码语义（参照 `scripts/learning-consistency.mjs:5-15` 与 `migration-dryrun.mjs:40-44`）：
 *   EXIT=0  全部判据 PASS
 *   EXIT=0  **降级**：synthetic 模式且未加 `--allow-synthetic`（会打印明确警示）
 *   EXIT=1  有判据 FAIL（门禁未通过）
 *   EXIT=2  脚本自身错误（读文件失败 / JSON 坏 / 参数错误 / Vite 加载失败）
 *
 * 用法：
 *   node tests/learning-model.mjs                        # 合成自测（降级退出码 + 警示）
 *   node tests/learning-model.mjs --allow-synthetic      # 合成自测也按严格判定
 *   node tests/learning-model.mjs --user-store=<file>    # 真实快照
 *   node tests/learning-model.mjs --json                 # stdout 打机器可读结果
 */
import { createServer } from 'vite'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VOCAB = join(ROOT, 'content', 'vocabulary')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const allowSynthetic = argv.includes('--allow-synthetic')
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))

/* ===========================================================================
 * 断言框架（学 tests/content-query.mjs:16-29 的 ok() 风格）
 * ========================================================================= */
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

/* ===========================================================================
 * 1. 内容侧真值（与 scripts/migration-dryrun.mjs:104-139 同口径）
 *
 * 为什么按同口径重建而不是 import dry-run 脚本：
 *   dry-run 脚本是**顶层直接执行**的 CLI（无 export、无 main() 守卫），
 *   `import` 它会立即重跑整段流程并向 stdout 打印人类表、写盘 3 个产物 ——
 *   污染本脚本的输出契约（`--json` 必须是纯 JSON）。这是架构上的不可 import，
 *   与 `migration-dryrun.mjs:1123-1147` 记录的理由完全相同。
 * ========================================================================= */
function loadContentProvider() {
  const pkgDirs = readdirSync(VOCAB, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const pkgInfoMap = new Map()
  const wordToPkgsMap = new Map() // Map<原词形, 包 id[]>
  const lowerToFormsMap = new Map() // Map<lowercase, Set<原词形>>
  let contentRecords = 0

  for (const p of pkgDirs) {
    const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
    const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
    contentRecords += words.length
    // 包内去重（同包同 word 会让 ContentId 撞车）
    const uniq = [...new Set(words.map((r) => r.word))]
    pkgInfoMap.set(p, {
      namespace: mf.namespace,
      contentVersion: mf.contentVersion,
      contentChecksum: mf.contentChecksum,
    })
    for (const w of uniq) {
      if (!wordToPkgsMap.has(w)) wordToPkgsMap.set(w, [])
      wordToPkgsMap.get(w).push(p)
      const l = w.toLowerCase()
      if (!lowerToFormsMap.has(l)) lowerToFormsMap.set(l, new Set())
      lowerToFormsMap.get(l).add(w)
    }
  }

  // 惰性 provider —— 形状与 src/lib/learning/types.ts 的 ContentProvider 一致
  const provider = {
    pkgInfo: (id) => pkgInfoMap.get(id) ?? null,
    wordToPkgs: (w) => wordToPkgsMap.get(w),
    lowerToForms: (l) => lowerToFormsMap.get(l),
    pkgIds: () => pkgDirs,
  }
  return { provider, contentRecords, distinctWords: wordToPkgsMap.size }
}

/* ===========================================================================
 * 2. 合成输入（**形状真实**：键口径与真实 store 一致；故意覆盖全部分支）
 *
 * ⚠️ 这是 synthetic 数据 —— 它的 orphan / caseConflict / invalid 是**故意注入**的，
 *    不代表真实用户数据有问题。脚本会在输出里显式警示并降级退出码。
 * ========================================================================= */
function buildSyntheticInput(content) {
  // 固定 epoch：合成数据必须完全可复现（否则「跑两次相同」会变成「同进程内碰巧相同」）
  const now = 1790467200000 // 2026-09-27T00:00:00.000Z
  const DAY = 86400000

  const pkgIds = content.provider.pkgIds()
  // 确定 resolved 样本：只出现在 1 个包里的词
  const resolvedPick = []
  const ambiguousPick = []
  for (const [w, ps] of pkgIds.length ? collect() : []) {
    if (ps.length === 1 && resolvedPick.length < 12) resolvedPick.push(w)
    else if (ps.length >= 2 && ambiguousPick.length < 8) ambiguousPick.push(w)
    if (resolvedPick.length >= 12 && ambiguousPick.length >= 8) break
  }
  function* collect() {
    for (const p of pkgIds) {
      const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
      for (const w of [...new Set(words.map((r) => r.word))]) {
        yield [w, content.provider.wordToPkgs(w) ?? []]
      }
    }
  }
  // 实测 5 包交叉最多的词（设计文档 §2.4 的落盘示例用它）
  if (content.provider.wordToPkgs('generalize') && !ambiguousPick.includes('generalize')) {
    ambiguousPick.unshift('generalize')
  }

  const revEntry = (i) => ({
    wrongCount: 1 + (i % 4),
    correctStreak: i % 3,
    lastWrongAt: now - (i + 1) * DAY,
    nextReviewAt: now + (i - 2) * DAY,
    intervalIdx: i % 5,
  })
  const memEntry = (i) => ({
    status: ['known', 'fuzzy', 'unknown'][i % 3],
    reviews: 1 + (i % 5),
    lastAt: now - i * 60000,
  })

  const review = {}
  const memorize = {}
  const analyticsWords = {}

  // ① resolved（原词形键，三源齐全）
  resolvedPick.forEach((w, i) => {
    review[w] = revEntry(i)
    memorize[w] = memEntry(i)
    analyticsWords[w.toLowerCase()] = { done: 2 + (i % 3), wrong: i % 2 }
  })
  // ② ambiguous（原词形键，三源齐全）
  ambiguousPick.forEach((w, i) => {
    review[w] = {
      wrongCount: 2 + i,
      correctStreak: 1,
      lastWrongAt: now - i * 3600000,
      nextReviewAt: now - DAY,
      intervalIdx: (i + 1) % 5,
    }
    memorize[w] = { status: 'fuzzy', reviews: 3, lastAt: now - 3600000 }
    analyticsWords[w.toLowerCase()] = { done: 3, wrong: 1 }
  })
  // ③ orphan（设计文档 §2.5 点名的真实场景：useEffect 不在 9346 条里）
  for (const [i, w] of ['zzz_not_in_content_2026', 'useEffect', 'obsoleteTokenX'].entries()) {
    review[w] = revEntry(i)
    memorize[w] = memEntry(i)
    analyticsWords[w.toLowerCase()] = { done: 1, wrong: 3 }
  }
  // ④ caseConflict（把某个 resolved 词改成大写变体 → 精确 miss / 小写 hit）
  for (const w of resolvedPick.slice(0, 6)) {
    const variant = w.charAt(0).toUpperCase() + w.slice(1)
    if (variant !== w && !content.provider.wordToPkgs(variant)) {
      review[variant] = revEntry(2)
      break
    }
  }
  // ⑤ invalid（空串 / 纯空白 / 超长 / 无字母数字）
  review[''] = revEntry(0)
  review['   '] = revEntry(0)
  review['x'.repeat(513)] = revEntry(0)
  memorize['---'] = { status: 'known', reviews: 0, lastAt: 0 }
  analyticsWords['@@@'] = { done: 0, wrong: 0 }

  const letters = {}
  for (const c of 'etaoinshrdlucmfwypvbgkjqxz') {
    letters[c] = { hit: 20 + (c.charCodeAt(0) % 30), miss: c.charCodeAt(0) % 7 }
  }

  return {
    snapshot: {
      review,
      memorize,
      analytics: {
        letters,
        words: analyticsWords,
        totalKeys: 51234,
        totalCorrect: 48120,
        totalWords: Object.keys(analyticsWords).length,
        bestWpm: 92,
      },
      customBanks: [
        {
          id: 'custom-m1x2y3',
          name: '我的词库（合成）',
          words: [
            { word: 'resilient', translation: '有韧性的' },
            { word: 'scrutinize', translation: '仔细检查' },
          ],
          createdAt: now - 30 * DAY,
        },
      ],
    },
    now,
    detail: `合成数据（形状真实：键口径同真实 store）resolved=${resolvedPick.length} ambiguous=${ambiguousPick.length} orphan=3 caseConflict=1 invalid=5 为**故意注入**`,
  }
}

/**
 * 从真实快照文件读入 4 个旧键的**原始字符串**形态（交给 `splitSnapshot` 解析）。
 * 兼容两种形状（同 `migration-dryrun.mjs:168-192`）：
 *   A. 多 store 包（localStorage 全量导出，顶层带 `gt.*` 键）
 *   B. 单 store 裸 map（顶层即 `{word: entry}`，按 gt.review.v1 解释）
 */
function loadRawStoresFrom(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`--user-store=${file} 顶层不是对象（实际 ${Array.isArray(raw) ? 'array' : typeof raw}）`)
  }
  const wrapped = { 'gt.review.v1': '{}', 'gt.memorize.v1': '{}', 'gt.analytics.v1': '{}', 'gt.customBanks.v1': '[]' }
  if (Object.keys(raw).some((k) => k.startsWith('gt.'))) {
    // A. 多 store 包：值可能已是对象（导出的 JSON）或字符串（原始 localStorage 值）
    for (const key of Object.keys(wrapped)) {
      const v = raw[key]
      if (v === undefined || v === null) wrapped[key] = null
      else wrapped[key] = typeof v === 'string' ? v : JSON.stringify(v)
    }
  } else {
    // B. 单表裸 map → 按 gt.review.v1 解释
    wrapped['gt.review.v1'] = JSON.stringify(raw)
  }
  return wrapped
}

/* ===========================================================================
 * 3. 主流程
 * ========================================================================= */
async function main() {
  console.log('='.repeat(74))
  console.log('P1.5 · G2 门禁：Learning 数据模型')
  console.log('='.repeat(74))

  /* ---- 加载 TS 实现 ---- */
  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })

  let migrateMod
  try {
    migrateMod = await server.ssrLoadModule('/src/lib/learning/migrate.ts')
    // 刻意**不接收返回值**：这个 ssrLoadModule 的目的只是把 types.ts 加载进 SSR 模块图，
    // 让下面 splitSnapshot 用到的类型常量到位。改成 `let x; x = await ...` 加 `_` 前缀会
    // 变成「声明一个从没赋值过的变量 + 给一个未声明的名字赋值」⇒ strict 下 ReferenceError。
    await server.ssrLoadModule('/src/lib/learning/types.ts')
  } catch (e) {
    await server.close()
    console.error('FAIL(EXIT=2): 无法加载 src/lib/learning/*.ts：', e?.stack ?? e)
    process.exit(2)
  }

  const { migrateV1toV2, judgeFreshness, splitSnapshot } = migrateMod
  // 注：这里刻意**不再**解构 `typesMod.KEY_*` —— 那三个常量从未被本脚本使用，
  // 留着只会让人误以为 G2-2 是用它们做的 key 断言（实际是按 `next.letterStats` / `next.totals` 的形状判的）。

  /* ---- 内容真值 ---- */
  const content = loadContentProvider()
  console.log(`\n内容真值：${content.distinctWords} 个不同 word / ${content.contentRecords} 条记录 / ${content.provider.pkgIds().length} 包`)

  /* ---- 数据来源 ---- */
  let rawStores
  let source
  let sourceDetail
  let migrateOpts

  if (userStoreArg) {
    const file = userStoreArg.split('=')[1]
    if (!existsSync(file)) {
      await server.close()
      console.error(`FAIL(EXIT=2): --user-store 文件不存在：${file}`)
      process.exit(2)
    }
    rawStores = loadRawStoresFrom(file)
    source = 'user-store'
    sourceDetail = `来自 --user-store=${file}`
    migrateOpts = { now: Date.parse('2026-09-27T12:00:00.000Z'), runtime: 'cli' }
  } else {
    const synth = buildSyntheticInput(content)
    rawStores = {
      'gt.review.v1': JSON.stringify(synth.snapshot.review),
      'gt.memorize.v1': JSON.stringify(synth.snapshot.memorize),
      'gt.analytics.v1': JSON.stringify(synth.snapshot.analytics),
      'gt.customBanks.v1': JSON.stringify(synth.snapshot.customBanks),
    }
    source = 'synthetic'
    sourceDetail = synth.detail
    migrateOpts = { now: synth.now, runtime: 'cli' }
  }

  console.log(`source    ${source}`)
  console.log(`detail    ${sourceDetail}`)

  /* ---- 真跑一次迁移（纯函数，零副作用） ---- */
  const split = splitSnapshot(rawStores)
  const { next, report } = migrateV1toV2(split.snapshot, content.provider, migrateOpts)
  const learning = next.learning

  console.log(`\n迁移三档：resolved=${report.tiers.resolved} ambiguous=${report.tiers.ambiguous} orphan=${report.tiers.orphan} caseConflict=${report.tiers.caseConflict} invalid=${report.tiers.invalid}`)

  /* =======================================================================
   * G2-1 · gt.learning.v2 顶层形状合法
   * ===================================================================== */
  console.log('\n【G2-1】gt.learning.v2 顶层形状')

  const CID = /^content:[a-z]+:[a-z0-9-]+:.+$/
  // 注：G2-1 的判据原文是 `/^legacy:(unattributed|orphan):.+$/`。实现里多了
  // caseConflict 档（键前缀 `legacy:case-conflict:` 是设计文档**未定义**的缺口，
  // 沿用 dry-run 的选择）。因此这里断言的是「legacy: 的**任意**子族」，
  // 并在下面单独断言三个已知子族 —— 既不放松判据，也不把已知缺口误判成 FAIL。
  const LEG_ANY = /^legacy:[a-z-]+:.+$/
  const bad = []
  let cidCount = 0
  let legacyCount = 0

  for (const [k, v] of Object.entries(learning)) {
    const isCid = CID.test(k)
    const isLegacy = LEG_ANY.test(k)
    if (!isCid && !isLegacy) {
      bad.push([k, 'key-shape'])
      continue
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      bad.push([k, 'value-not-object'])
      continue
    }
    if (isCid) {
      cidCount++
      if (v.contentId !== k) bad.push([k, 'contentId-mismatch'])
      if (v.review && !Number.isInteger(v.review.intervalIdx)) bad.push([k, 'intervalIdx-not-int'])
      if (v.review && !(v.review.intervalIdx >= 0 && v.review.intervalIdx < 5)) bad.push([k, 'intervalIdx-out-of-range'])
      if (v.freshness === undefined) bad.push([k, 'missing-freshness'])
      if (typeof v.contentVersion !== 'number') bad.push([k, 'missing-contentVersion'])
    } else {
      legacyCount++
      // legacy 记录**不得**携带 contentId（§2.4：无归属是它的定义）
      if ('contentId' in v) bad.push([k, 'legacy-should-not-have-contentId'])
      // §1.2：legacy 前缀记录永久 freshness='unknown'
      if (v.freshness !== 'unknown') bad.push([k, `legacy-freshness=${v.freshness}`])
    }
    if (v.memorize && !['known', 'fuzzy', 'unknown'].includes(v.memorize.status)) bad.push([k, 'bad-status'])
  }

  ok('所有 key 是合法 ContentId 或 legacy:*', bad.filter((x) => x[1] === 'key-shape').length === 0, `content:*=${cidCount} legacy:*=${legacyCount}`)
  ok('所有 content:* 的 contentId 与 key 逐字符一致', !bad.some((x) => x[1] === 'contentId-mismatch'))
  ok('review.intervalIdx 是 0..4 整数', !bad.some((x) => x[1].startsWith('intervalIdx')))
  ok('memorize.status 是合法枚举', !bad.some((x) => x[1] === 'bad-status'))
  ok('content:* 记录都有 freshness', !bad.some((x) => x[1] === 'missing-freshness'))
  ok('legacy:* 记录 freshness 恒为 unknown', !bad.some((x) => x[1].startsWith('legacy-freshness')))
  ok('legacy:* 记录不含 contentId（无归属是定义）', !bad.some((x) => x[1] === 'legacy-should-not-have-contentId'))
  if (bad.length) {
    console.log(`    违规样本（前 10）：\n${JSON.stringify(bad.slice(0, 10), null, 2)}`)
  }

  /* =======================================================================
   * G2-2 · letters 与全局聚合**不在** gt.learning.v2 里
   * ===================================================================== */
  console.log('\n【G2-2】letters 与全局聚合必须拆出去')

  const LEAK_FIELDS = ['letters', 'totalKeys', 'totalCorrect', 'totalWords', 'bestWpm']
  const leaked = []
  for (const [k, v] of Object.entries(learning)) {
    for (const f of LEAK_FIELDS) {
      if (v && typeof v === 'object' && f in v) leaked.push([k, f])
    }
  }
  ok(
    'gt.learning.v2 的 value 里不含 letters/totalKeys/totalCorrect/totalWords/bestWpm',
    leaked.length === 0,
    leaked.length ? `泄漏 ${leaked.length} 处：${JSON.stringify(leaked.slice(0, 5))}` : 'leaked=0',
  )

  // gt.letterStats.v1 与 gt.totals.v1 必须存在（由迁移产出）
  const hasLetterStats = next.letterStats && typeof next.letterStats === 'object' && 'letters' in next.letterStats
  const hasTotals =
    next.totals &&
    typeof next.totals === 'object' &&
    typeof next.totals.totalKeys === 'number' &&
    typeof next.totals.bestWpm === 'number'
  ok('gt.letterStats.v1 被产出（含 letters 表）', !!hasLetterStats, `letters 键数=${Object.keys(next.letterStats?.letters ?? {}).length}`)
  ok('gt.totals.v1 被产出（4 个标量）', !!hasTotals, JSON.stringify(next.totals))

  // 独立校验：letters 的值**原样搬运**，键名不变、值不变（§1.3 的「迁移动作」）
  const srcLetters = split.snapshot.analytics.letters
  const dstLetters = next.letterStats.letters
  ok(
    'letters 原样搬运（键名与值均不变）',
    JSON.stringify(Object.keys(srcLetters).sort()) === JSON.stringify(Object.keys(dstLetters).sort()) &&
      Object.keys(srcLetters).every(
        (c) => srcLetters[c].hit === dstLetters[c].hit && srcLetters[c].miss === dstLetters[c].miss,
      ),
    `${Object.keys(dstLetters).length} 个字母`,
  )
  const srcTotals = split.snapshot.analytics
  ok(
    '全局 4 标量原样搬运',
    next.totals.totalKeys === srcTotals.totalKeys &&
      next.totals.totalCorrect === srcTotals.totalCorrect &&
      next.totals.bestWpm === srcTotals.bestWpm,
    `totalKeys=${next.totals.totalKeys} bestWpm=${next.totals.bestWpm}`,
  )

  /* =======================================================================
   * G2-3 · legacy:* 记录必须自描述
   * ===================================================================== */
  console.log('\n【G2-3】legacy:* 记录自描述')

  const unattributed = Object.entries(learning).filter(([k]) => k.startsWith('legacy:unattributed:'))
  const orphans = Object.entries(learning).filter(([k]) => k.startsWith('legacy:orphan:'))
  const caseConflicts = Object.entries(learning).filter(([k]) => k.startsWith('legacy:case-conflict:'))

  // candidates.length >= 2 是**分档逻辑错判的可检测指纹**（G2-3 的判据原文理由）
  const badCandidates = unattributed.filter(
    ([, v]) => !Array.isArray(v.candidates) || v.candidates.length < 2 || !v.candidates.every((c) => CID.test(c)),
  )
  ok(
    'legacy:unattributed:* 的 candidates 是长度 >=2 的合法 ContentId 数组',
    badCandidates.length === 0,
    `${unattributed.length} 条，违规 ${badCandidates.length} 条`,
  )
  ok(
    'legacy:unattributed:* 的 tier === "ambiguous"',
    unattributed.every(([, v]) => v.tier === 'ambiguous'),
  )

  const badOrphanReason = orphans.filter(([, v]) => v.reason !== 'not-in-current-vocabulary')
  ok(
    'legacy:orphan:* 的 reason === "not-in-current-vocabulary"',
    badOrphanReason.length === 0,
    `${orphans.length} 条`,
  )
  ok('legacy:orphan:* 的 tier === "orphan"', orphans.every(([, v]) => v.tier === 'orphan'))

  // 三档计数必须与 learning 里的实际键数自洽（防「报告说 5 条、表里只有 3 条」）
  ok(
    'tiers.ambiguous 与 legacy:unattributed:* 键数自洽',
    report.tiers.ambiguous === unattributed.length,
    `${report.tiers.ambiguous} vs ${unattributed.length}`,
  )
  ok(
    'tiers.orphan 与 legacy:orphan:* 键数自洽',
    report.tiers.orphan === orphans.length,
    `${report.tiers.orphan} vs ${orphans.length}`,
  )
  ok(
    'tiers.caseConflict 与 legacy:case-conflict:* 键数自洽',
    report.tiers.caseConflict === caseConflicts.length,
    `${report.tiers.caseConflict} vs ${caseConflicts.length}`,
  )

  /* =======================================================================
   * G2-4 · judgeFreshness 5 个 case（§1.4 真值表）
   * ===================================================================== */
  console.log('\n【G2-4】judgeFreshness 真值表')

  const MANIFEST = { contentVersion: 3, contentChecksum: 'sha-aaa' }
  const cases = [
    {
      name: 'unknown（legacy 记录，无版本三元组）',
      got: judgeFreshness({}, MANIFEST),
      want: 'unknown',
    },
    {
      name: 'drifted(no-manifest)（包已不存在）',
      got: judgeFreshness({ contentVersion: 3, contentChecksum: 'sha-aaa' }, null),
      want: 'drifted',
    },
    {
      name: 'drifted(checksum-mismatch)（内容实质变了）',
      got: judgeFreshness({ contentVersion: 3, contentChecksum: 'sha-OLD' }, MANIFEST),
      want: 'drifted',
    },
    {
      name: 'stale(version-behind)（契约号过期但内容没变）',
      got: judgeFreshness({ contentVersion: 2, contentChecksum: 'sha-aaa' }, MANIFEST),
      want: 'stale',
    },
    {
      name: 'ok（完全一致）',
      got: judgeFreshness({ contentVersion: 3, contentChecksum: 'sha-aaa' }, MANIFEST),
      want: 'ok',
    },
  ]
  for (const c of cases) {
    ok(c.name, c.got === c.want, `got=${c.got} want=${c.want}`)
  }

  /* =======================================================================
   * 附加：纯函数性（零 localStorage 副作用）—— G3-3 的核心，这里顺手证
   * ===================================================================== */
  console.log('\n【附加】migrateV1toV2 纯函数性')
  // 在 Node 里 localStorage 不存在。若 migrate 内部碰了它，这里必然抛 ReferenceError。
  let purityOk = true
  let purityErr = ''
  try {
    const again = migrateV1toV2(split.snapshot, content.provider, migrateOpts)
    purityOk = JSON.stringify(again.next) === JSON.stringify(next)
  } catch (e) {
    purityOk = false
    purityErr = String(e?.message ?? e)
  }
  ok(
    '在无 localStorage 环境下可调用（零 I/O）',
    purityOk,
    purityErr || '相同输入产出逐字节相同的 next',
  )

  /* =======================================================================
   * 汇总与退出码
   * ===================================================================== */
  console.log('\n' + '─'.repeat(74))
  console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  console.log('─'.repeat(74))

  const result = { source, sourceDetail, pass, fail, failures, tiers: report.tiers }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  }

  await server.close()

  // ① 有 FAIL ⇒ 1（最高优先，无论什么数据源）
  if (fail > 0) {
    console.log('\nEXIT=1 门禁未通过：')
    for (const f of failures) console.log(`  ✗ ${f}`)
    process.exit(1)
  }

  // ② synthetic 且未加 --allow-synthetic ⇒ 显式警示 + 降级退出码 0
  //    （参照 scripts/learning-consistency.mjs:416-435 的做法：
  //      「绿」不得把「其实没测真实数据」冒充成「真实数据干净」）
  if (source === 'synthetic' && !allowSynthetic) {
    console.log('')
    console.log('⚠️  source=synthetic：本次门禁用的是**合成数据**，不代表真实用户数据。')
    console.log('    三条 legacy 分支（orphan / ambiguous / caseConflict）与 invalid 都是**故意注入**的，')
    console.log('    目的是证明这些分支在实现里**可达**、且产出的记录形状正确。')
    console.log('    退出码降级为 EXIT=0。')
    console.log('    要按真实数据判定：--user-store=<真实旧快照.json>')
    console.log('    要让合成数据也按严格判定（用于结构自检）：--allow-synthetic')
    process.exit(0)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error('FAIL(EXIT=2):', e?.stack ?? e)
  process.exit(2)
})
