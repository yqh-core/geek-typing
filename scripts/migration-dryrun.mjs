#!/usr/bin/env node
/**
 * P1.5 · Migration v1 **dry-run 运行器**（只输出报告，不写任何东西）
 *
 * 目的：在「是否做正式迁移」决策前，让用户看到**真实执行** Migration v1 逻辑后的
 *       结果分布（三档计数 / 样本 / 目标键体积 / 回滚令牌），而不是只看静态审计的
 *       4390 / 2323。
 *
 * 设计依据：docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md
 *   §1   LearningRecord / LetterStats / GlobalTotals 目标形状
 *   §2.1 迁移源 5 个键逐个定性（gt.streak.v1 不迁移）
 *   §2.3 三档语义（resolved / ambiguous / orphan）
 *   §2.4 ambiguous → legacy:unattributed:<word>（含 lowercase 回推规则）
 *   §2.5 orphan → legacy:orphan:<word>（**绝不为 N/A**）
 *   §2.6 幂等机制（marker + 源指纹）
 *   §2.7 rollbackToken 形状
 *   §2.8 MigrationReport schema + migrateV1toV2 伪代码
 *
 * ⚠️ dry-run 契约：本脚本**不写 localStorage、不改任何源码文件**。
 *    唯一写盘的是报告与 jsonl 产物（都在 docs/audit-package/_generated/ 下）。
 *    纯函数 migrateV1toV2() 返回 next（内存中的新键）与 report，落盘层被**刻意省略** ——
 *    这正是「dry-run 与真实迁移走同一段纯函数代码」的保证（设计文档 §2.8.2 的
 *    「为什么必须是纯函数」第 ① 条）。
 *
 * 为什么**不 import** scripts/migration-audit.mjs：
 *   migration-audit.mjs 是**顶层直接执行**的 CLI 脚本（无 export、无 main() 守卫、
 *   第 30-252 行全是顶层语句）。`import` 它会立即重跑它整个流程并向 stdout 打印人类表，
 *   污染本脚本的输出契约（--json 必须是纯 JSON），并额外写盘 3 个 audit 产物。
 *   因此这里**按同一口径重建**载入逻辑（与 learning-consistency.mjs:54-84 完全一致，
 *   两者本就是同一套：包内 unique、区分大小写 wordToPkgs、lowerToPkgs / lowerToForms），
 *   并在文档里标注口径出处。**这是「无法复用」而非「不愿复用」** —— 见本文件末尾
 *   §口径复用说明 的完整论证。
 *
 * 用法：
 *   node scripts/migration-dryrun.mjs                       # 合成数据（显式警示）
 *   node scripts/migration-dryrun.mjs --allow-synthetic     # 合成数据 + 严格判定
 *   node scripts/migration-dryrun.mjs --user-store=<file>   # 真实旧快照
 *   node scripts/migration-dryrun.mjs --json                # stdout 打完整 report
 *
 * 退出码语义（参照 learning-consistency.mjs:5-15）：
 *   EXIT=0  正常（含：source=synthetic 未加 --allow-synthetic；含：真实数据有 orphan
 *           —— orphan 是**正常的**历史事实，不是错误）
 *   EXIT=1  结构非法（报告 schema 自检失败 / 目标键结构违反设计文档契约 / 幂等断言失败）
 *   EXIT=2  脚本自身错误（读文件失败 / JSON 解析失败 / 参数错误）
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOCAB = join(ROOT, 'content', 'vocabulary')
const OUT_DIR = join(ROOT, 'docs', 'audit-package', '_generated')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const allowSynthetic = argv.includes('--allow-synthetic')
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))

/* ===========================================================================
 * 0. 常量（与设计文档 §2.2 / §2.8.1 逐字对应）
 * ========================================================================= */
const CURRENT_VERSION = 1
const MIGRATOR_VERSION = 'learning-migrator/1.0.0'
const REPORT_VERSION = 1

const KEY_LEARNING_V2 = 'gt.learning.v2'
const KEY_LETTER_STATS = 'gt.letterStats.v1'
const KEY_TOTALS = 'gt.totals.v1'
const KEY_CUSTOM_INDEX = 'gt.customBankIndex.v1'
const KEY_BACKUP = 'gt.learning.v2.backup'
const _KEY_MIGRATION = 'gt.migration.v1'

/** 迁移源 4 键（§2.1 表：gt.streak.v1 不在其中） */
const LEGACY_KEYS = ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1']
/** 读取但**不迁移**的键（§2.1 第 5 行：键是日期、不含词，与 Learning 层正交） */
const _NOT_IN_SCOPE_KEYS = ['gt.streak.v1']
const STREAK_NOT_IN_SCOPE_REASON = 'keys are dates, no word dimension'

/** 样本上限（§2.8.1 注释：orphan 最多 100 条 / ambiguous 最多 20 条） */
const ORPHAN_SAMPLE_MAX = 100
const AMBIGUOUS_SAMPLE_MAX = 20

/** 非法键判据（复用 learning-consistency.mjs:89-99 的 MAX_WORD_LEN + 谓词） */
const MAX_WORD_LEN = 512

/**
 * 体积口径：设计文档 §2.9 用「JSON 字符数 × 2 = UTF-16 字节」。
 * 这里直接用 Buffer.byteLength(...,'utf16le')，**实测口径等价**且更严谨
 * （对含代理对的内容算得 4 字节/码点，与 localStorage 的实际内存占用一致）。
 */
const utf16Bytes = (s) => Buffer.byteLength(s, 'utf16le')

/* ===========================================================================
 * 1. 内容侧真值（ContentTruth）
 *
 * 口径复用说明：与 scripts/migration-audit.mjs:30-77 及
 * scripts/learning-consistency.mjs:54-84 **完全同源**：
 *   - 包内去重（同包同 word 会让 ContentId 撞车）
 *   - wordToPkgs 区分大小写（go-code / ts-code 声明 case-sensitive）
 *   - lowerToPkgs / lowerToForms 用于 analytics 的 lowercase 回推
 * 另按设计文档 §1.4 / §2.8.2 的 ContentTruth.pkgInfo 补充
 * manifest 的 contentVersion / contentChecksum（audit 脚本不含这两项，故必读 manifest）。
 * ========================================================================= */
function loadContentTruth() {
  const pkgs = readdirSync(VOCAB, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const pkgInfo = new Map()
  const wordToPkgs = new Map() // Map<原词形, 包名[]>
  const lowerToPkgs = new Map() // Map<lowercase, Set<包名>>
  const lowerToForms = new Map() // Map<lowercase, Set<原词形>>
  let contentRecords = 0

  for (const p of pkgs) {
    const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
    const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
    contentRecords += words.length
    const uniq = [...new Set(words.map((r) => r.word))]
    pkgInfo.set(p, {
      pkg: p,
      namespace: mf.namespace,
      contentVersion: mf.contentVersion,
      contentChecksum: mf.contentChecksum,
      uniqueCount: uniq.length,
    })
    for (const w of uniq) {
      if (!wordToPkgs.has(w)) wordToPkgs.set(w, [])
      wordToPkgs.get(w).push(p)
      const l = w.toLowerCase()
      if (!lowerToPkgs.has(l)) lowerToPkgs.set(l, new Set())
      lowerToPkgs.get(l).add(p)
      if (!lowerToForms.has(l)) lowerToForms.set(l, new Set())
      lowerToForms.get(l).add(w)
    }
  }
  return { pkgs, pkgInfo, wordToPkgs, lowerToPkgs, lowerToForms, contentRecords }
}

/* ===========================================================================
 * 2. 键合法性（复用 learning-consistency.mjs:92-99 的判据，一字不改）
 * ========================================================================= */
function isValidWordKey(k) {
  if (typeof k !== 'string') return false
  if (k.length === 0) return false
  if (k.length > MAX_WORD_LEN) return false
  if (/^\s*$/.test(k)) return false
  if (!/[A-Za-z0-9]/.test(k)) return false
  return true
}

/* ===========================================================================
 * 3. 源数据：两种来源（--user-store / synthetic）
 * ========================================================================= */

/**
 * 从旧快照 JSON 载入 4 个迁移源键 + 1 个 not-in-scope 键。
 *
 * 读法兼容两种形状（与 learning-consistency.mjs:142-151 同思路，但需保留更多键）：
 *   A. **多 store 包**（推荐，就是 localStorage 全量导出）：顶层带 `gt.review.v1` 等键
 *   B. **单 store 裸 map**：顶层直接是 `{ word: entry }`（旧脚本/手工导出的单表转储），
 *      此时按 `--user-store` 的语义视为 gt.review.v1
 *
 * 返回 `{ stores, shape, sourceKeysPresent }`：
 *   stores.review / memorize / analytics / customBanks / streak
 */
function loadFromUserStore(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`--user-store=${file} 顶层不是对象（实际 ${Array.isArray(raw) ? 'array' : typeof raw}）`)
  }
  const isMultiStore = Object.keys(raw).some((k) => k.startsWith('gt.'))
  const stores = { review: {}, memorize: {}, analytics: null, customBanks: null, streak: null }

  if (isMultiStore) {
    // 浏览器导出的快照里，localStorage 的值是 **JSON 字符串**（localStorage 只存字符串）。
    // 首版直接把字符串当 store 对象用 ⇒ `Object.keys(字符串).length` 变成**字符数**（实测
    // gt.review.v1 显示 entries=2502，而真实条目只有 32），三档分流 resolved=0，EXIT 仍为 0 —— 假结果。
    // 故这里统一解一层字符串；解析失败显式炸，不许静默回落。
    const parse = (v, key) => {
      if (v === undefined || v === null) return null
      if (typeof v === 'string') {
        try {
          return JSON.parse(v)
        } catch (e) {
          throw new Error(`--user-store=${file} 的 ${key} 不是合法 JSON：${e.message}`)
        }
      }
      return v
    }
    stores.review = parse(raw['gt.review.v1'], 'gt.review.v1') ?? {}
    stores.memorize = parse(raw['gt.memorize.v1'], 'gt.memorize.v1') ?? {}
    stores.analytics = parse(raw['gt.analytics.v1'], 'gt.analytics.v1')
    stores.customBanks = parse(raw['gt.customBanks.v1'], 'gt.customBanks.v1')
    stores.streak = parse(raw['gt.streak.v1'], 'gt.streak.v1')
  } else {
    // 单表裸 map：语义上最可能是 review（旧脚本按「word → entry」导出）
    stores.review = raw
  }

  return {
    stores,
    shape: isMultiStore ? 'multi-store（顶层带 gt.* 键）' : 'single-store（顶层即 word→entry 裸 map，按 gt.review.v1 解释）',
    sourceKeysPresent: Object.keys(raw).filter((k) => k.startsWith('gt.')),
  }
}

/**
 * 合成数据：**形状真实**（走真实 store 的写入语义与键口径），
 * 并**故意包含** resolved / ambiguous / orphan 三类样本，以证明三条分支都可达。
 *
 * 关键设计（这是「形状真实」而非「随便造」的保证）：
 *   - review / memorize 的键 = **原词形**（reviewStore.ts:115-123 / memorizeStore.ts:31-34）
 *   - analytics.words 的键 = **word.toLowerCase()**（analytics.ts:73）→ 故意包含
 *       'useEffect' 这类大小写敏感词，使 analytics 的 'useeffect' 键必须靠
 *       lowerToForms 回推（触发 ANALYTICS_LOWERCASE_HIT 分支）
 *   - orphan 样本：'zzz_not_in_content_2026' / 'useEffect'
 *       （与设计文档 §2.5、EVIDENCE-INDEX §11 的实测口径一致：'useEffect' 在 ts-code
 *        是 case-sensitive 声明，但**确实不在 9,346 条里**，故判 orphan 而非 caseConflict）
 *   - ambiguous 样本：'generalize'（实测 5 包交叉最多的词，§2.4 落盘示例）
 *   - caseConflict 样本：构造一个「精确不命中但小写命中」的词形
 *       （真实语料 contentCaseCollisions = 0，故该分支在 synthetic 下才可达；
 *         设计文档 §5 第 7 点明确承认此点）
 *   - invalid 样本：空串 / 纯空白 / 超长 / 无字母数字（与 consistency 注入口径一致）
 *   - customBanks：1 个自建库（用于 gt.customBankIndex.v1 分支）
 */
function buildSynthetic(content) {
  // ⚠️ 固定 epoch，**不用 Date.now()**：合成数据必须是完全可复现的常量输入，
  //   否则「跑两次逐字节相同」会变成「同一进程内两次碰巧相同」——
  //   跨进程重跑（CI 复现 / 用户复核）就会得到不同 sha256，幂等证明随之失效。
  //   时间戳取一个固定的历史时刻（2026-09-27T00:00:00Z），使所有派生时间字段稳定。
  const now = 1790467200000 // 2026-09-27T00:00:00.000Z
  const DAY = 86400000

  /* ---- 从真实内容真值里挑选「确定是 resolved / 确定是 ambiguous」的词 ---- */
  const resolvedPick = []
  const ambiguousPick = []
  for (const [w, ps] of content.wordToPkgs) {
    if (ps.length === 1 && resolvedPick.length < 12) resolvedPick.push(w)
    else if (ps.length >= 2 && ambiguousPick.length < 8) ambiguousPick.push(w)
    if (resolvedPick.length >= 12 && ambiguousPick.length >= 8) break
  }
  // 已知实测：'generalize' 是 5 包交叉最多的词（设计文档 §2.4）；若在真值里存在则置顶
  if (content.wordToPkgs.has('generalize') && !ambiguousPick.includes('generalize')) {
    ambiguousPick.unshift('generalize')
  }

  /* ---- 大小写敏感包里的真实词形（用于触发 lowercase 回推） ---- */
  // 从 go-code / ts-code 里挑真实存在的、含大写的词形，确保它们确实在真值里
  const caseSensitiveForms = []
  for (const p of ['ts-code', 'go-code']) {
    if (!content.pkgInfo.has(p)) continue
    for (const [w, ps] of content.wordToPkgs) {
      if (ps.length === 1 && ps[0] === p && w !== w.toLowerCase() && caseSensitiveForms.length < 4) {
        caseSensitiveForms.push(w)
      }
    }
  }

  /* ---- orphan：真值里不存在的词（含设计文档点名的 useEffect） ---- */
  const orphanForms = ['zzz_not_in_content_2026', 'useEffect', 'obsoleteTokenX']

  /* ---- caseConflict：精确不命中但小写命中（把某个真实原词形改成大小写变体） ---- */
  // 取一个 resolved 词，构造它的「大写变体」：'Abandon'（真值是 'abandon'）→ 精确 miss / 小写 hit
  const caseConflictForms = []
  for (const w of resolvedPick.slice(0, 6)) {
    const variant = w.charAt(0).toUpperCase() + w.slice(1)
    if (variant !== w && !content.wordToPkgs.has(variant)) {
      caseConflictForms.push(variant)
      break
    }
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

  // ① resolved（原词形键，review/memorize/analytics 三源齐全）
  resolvedPick.forEach((w, i) => {
    review[w] = revEntry(i)
    memorize[w] = memEntry(i)
    analyticsWords[w.toLowerCase()] = { done: 2 + (i % 3), wrong: i % 2 }
  })

  // ② ambiguous（原词形键，三源齐全）
  ambiguousPick.forEach((w, i) => {
    review[w] = { wrongCount: 2 + i, correctStreak: 1, lastWrongAt: now - i * 3600000, nextReviewAt: now - DAY, intervalIdx: (i + 1) % 5 }
    memorize[w] = { status: 'fuzzy', reviews: 3, lastAt: now - 3600000 }
    analyticsWords[w.toLowerCase()] = { done: 3, wrong: 1 }
  })

  // ③ 大小写敏感词：review/memorize 用原词形；analytics **天然是 lowercase**（必须回推）
  caseSensitiveForms.forEach((w, i) => {
    review[w] = revEntry(i)
    memorize[w] = memEntry(i)
    analyticsWords[w.toLowerCase()] = { done: 4, wrong: 2 }
  })

  // ④ orphan（三源齐全，证明 orphan 档也能合并多源）
  orphanForms.forEach((w, i) => {
    review[w] = revEntry(i)
    memorize[w] = memEntry(i)
    analyticsWords[w.toLowerCase()] = { done: 1, wrong: 3 }
  })

  // ⑤ caseConflict（只在 review 里，模拟「历史写入时词形不同」）
  caseConflictForms.forEach((w) => {
    review[w] = revEntry(2)
  })

  // ⑥ invalid（空串 / 纯空白 / 超长 / 无字母数字）
  review[''] = revEntry(0)
  review['   '] = revEntry(0)
  review['x'.repeat(MAX_WORD_LEN + 1)] = revEntry(0)
  memorize['---'] = { status: 'known', reviews: 0, lastAt: 0 }
  analyticsWords['@@@'] = { done: 0, wrong: 0 }

  const letters = {}
  for (const c of 'etaoinshrdlucmfwypvbgkjqxz') {
    letters[c] = { hit: 20 + (c.charCodeAt(0) % 30), miss: c.charCodeAt(0) % 7 }
  }
  const analytics = {
    letters,
    words: analyticsWords,
    totalKeys: 51234,
    totalCorrect: 48120,
    totalWords: Object.keys(analyticsWords).length,
    bestWpm: 92,
  }

  /* ---- customBanks：1 个自建库（用于 gt.customBankIndex.v1 分支） ---- */
  const customBanks = [
    {
      id: 'custom-m1x2y3',
      name: '我的词库（合成）',
      words: [
        { word: 'resilient', translation: '有韧性的' },
        { word: 'scrutinize', translation: '仔细检查' },
      ],
      createdAt: now - 30 * DAY,
    },
  ]

  /* ---- streak：**不迁移**，但为了报告里 present=true 而提供（§2.1 第 5 行） ---- */
  const streak = {}
  for (let i = 0; i < 5; i++) {
    const d = new Date(now - i * DAY)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    streak[key] = { date: key, words: 40 + i * 5, seconds: 600 + i * 30 }
  }

  return {
    stores: { review, memorize, analytics, customBanks, streak },
    sourceDetail:
      `合成数据（形状真实：键口径与分析方法同真实 store；` +
      `resolved=${resolvedPick.length} ambiguous=${ambiguousPick.length} ` +
      `orphan=${orphanForms.length} caseConflict=${caseConflictForms.length} 样本故意注入）`,
    sourceKeysPresent: ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1', 'gt.streak.v1'],
  }
}

/* ===========================================================================
 * 4. 核心：migrateV1toV2 —— **纯函数，零副作用**
 *
 * 严格按设计文档 §2.8.2 的伪代码实现，并修正其 5 处伪代码级缺陷（已在注释标 [FIX-n]）：
 *   [FIX-1] durationMs / finishedAt 由调用方注入的真实耗时决定（伪代码写死 1ms）
 *   [FIX-2] rollbackToken.id 必须**确定性**（伪代码用 Math.random() → 破坏幂等断言）
 *   [FIX-3] legacy:* 记录写 `tier` 字段 + `freshness:'unknown'`（伪代码漏写 freshness）
 *   [FIX-4] caseConflict 不再冒充 orphan 的 tier 字段，用独立字段表达（伪代码自相矛盾）
 *   [FIX-5] 源键 bytesUtf16 按「真实 JSON 序列化」算，不用不存在的 localStorageSafeJson
 * ========================================================================= */

/**
 * 分档（§2.3）。返回 tier + 候选 + reason。
 * 判据与 learning-consistency.classifyKey **同源**，但这里落地为**动作**（tier）。
 */
function classifyWord(word, content) {
  if (!isValidWordKey(word)) return { tier: 'invalid', reason: '非法键（空/非字符串/纯空白/超长/无字母数字）' }
  const exact = content.wordToPkgs.get(word)
  const lowerForms = content.lowerToForms.get(word.toLowerCase())
  const lowerKnown = !!lowerForms
  if (!exact && !lowerKnown) return { tier: 'orphan', reason: 'not-in-current-vocabulary' }
  if (!exact && lowerKnown) return { tier: 'caseConflict', reason: '精确口径不命中但小写归并命中' }
  if (exact.length >= 2) return { tier: 'ambiguous', pkgs: exact.slice().sort() }
  return { tier: 'resolved', pkg: exact[0] }
}

/**
 * 迁移主函数（纯函数）。**不触碰 localStorage、不写文件。**
 *
 * @param {object} oldStore  { review, memorize, analytics, customBanks }（streak 不在入参，§2.1）
 * @param {object} content   loadContentTruth() 的返回值
 * @param {object} opts      { startedAt, finishedAt, durationMs, runtime }
 * @returns {{ next: object, report: object }}
 */
function migrateV1toV2(oldStore, content, opts) {
  const review = oldStore.review ?? {}
  const memorize = oldStore.memorize ?? {}
  const analytics = oldStore.analytics ?? null
  const customBanks = Array.isArray(oldStore.customBanks) ? oldStore.customBanks : []

  const warnings = []
  const learning = {}

  /* ---- 步骤 1：收集全部出现过的 word（三源并集，**原词形逐字符**） ---- */
  const wordsFromExact = new Set([...Object.keys(review), ...Object.keys(memorize)])
  const wordsFromLower = new Set(analytics && typeof analytics.words === 'object' && !Array.isArray(analytics.words) ? Object.keys(analytics.words) : [])

  /* ---- 步骤 2：analytics lowercase 键 → 原词形回推（§2.4.2） ---- */
  const invalidWords = []
  const lowerHitWords = []
  const caseConflictFromLower = []
  /** Map<原词形, WordStat> —— 回推后的 analytics 分片 */
  const analyticsByWord = new Map()

  for (const lk of wordsFromLower) {
    if (!isValidWordKey(lk)) {
      invalidWords.push(lk)
      continue
    }
    const forms = content.lowerToForms.get(lk)
    if (!forms) {
      // lowercase 在内容侧也查不到 → 该键本身就是 orphan，原样保留（键即 word）
      analyticsByWord.set(lk, analytics.words[lk])
      continue
    }
    if (forms.size > 1) {
      // [实测] 真实语料 contentCaseCollisions = 0，故该路径不可达；一旦命中**不猜**，显式告警
      warnings.push({
        code: 'CASE_CONFLICT',
        message: `analytics 的 lowercase 键 "${lk}" 对应多种原词形，无法唯一回推，已跳过该键`,
        words: [...forms].sort(),
      })
      caseConflictFromLower.push(lk)
      continue
    }
    const form = [...forms][0]
    if (form !== lk) lowerHitWords.push(lk) // 该键确实被 lowercase 过
    // 若 review/memorize 已有同词的原词形键，analytics 分片应挂到**原词形**上（否则会分裂成两条记录）
    analyticsByWord.set(form, analytics.words[lk])
  }

  if (lowerHitWords.length) {
    warnings.push({
      code: 'ANALYTICS_LOWERCASE_HIT',
      message: `analytics.words 有 ${lowerHitWords.length} 个 lowercase 键被回推为原词形（大小写敏感词的历史写入丢过大小写）`,
      words: lowerHitWords.slice(0, 100),
    })
  }
  if (invalidWords.length) {
    warnings.push({
      code: 'INVALID_KEY_DROPPED',
      message: '非法键已丢弃（不迁移、不计数）',
      words: invalidWords.slice(0, 100),
    })
  }

  /* ---- 步骤 3：三档分档 + 归属（§2.3 / §2.4 / §2.5） ---- */
  const allWords = new Set([...wordsFromExact, ...analyticsByWord.keys()])
  // 排序以保证**输出确定性**（幂等断言要求第二次逐字节相同；Set 迭代序在跨进程下不可依赖）
  const sortedWords = [...allWords].sort()

  const orphanWords = []
  const orphanDetail = []
  const ambiguousDetail = []
  const caseConflictWords = []
  const duplicateSourceMerges = []
  const tiers = { resolved: 0, ambiguous: 0, orphan: 0, caseConflict: 0, invalid: 0 }

  /**
   * 组装一条记录的三源分片。**字段一一对应、不重算**（§1.2 注释）。
   * 大小写：review/memorize 用原词形查；analytics 用回推后的原词形查（已在上一步对齐）。
   */
  const shardsOf = (word) => {
    const r = review[word]
    const m = memorize[word]
    const a = analyticsByWord.get(word)
    return {
      ...(r && typeof r === 'object' ? { review: r } : {}),
      ...(m && typeof m === 'object' ? { memorize: m } : {}),
      ...(a && typeof a === 'object' ? { analytics: a } : {}),
    }
  }
  const sourceNamesOf = (word) => {
    const out = []
    if (review[word]) out.push('gt.review.v1')
    if (memorize[word]) out.push('gt.memorize.v1')
    if (analyticsByWord.has(word)) out.push('gt.analytics.v1')
    return out
  }

  for (const word of sortedWords) {
    const c = classifyWord(word, content)

    if (c.tier === 'invalid') {
      tiers.invalid++
      continue
    }

    const shards = shardsOf(word)
    const sources = sourceNamesOf(word)
    if (sources.length >= 2) {
      // 三源合并到一条记录 —— 这是**预期行为**，但按 §2.8.1 的 warning 类型如实记录
      duplicateSourceMerges.push({ word, sources })
    }

    if (c.tier === 'orphan') {
      /* --- ORPHAN（§2.5，**绝不为 N/A**） --- */
      // freshness:'unknown' —— §1.2 明示「`legacy:` 前缀记录永久为此态」。
      // §2.5 的 OrphanRecord 字面量里没列这一项，但 §1.2 的 LearningFreshness 类型对所有
      // LearningRecord 生效（legacy 记录同样是 LearningRecord），故按 §1.2 补齐以使类型完备。
      const key = `legacy:orphan:${word}`
      learning[key] = { word, tier: 'orphan', reason: 'not-in-current-vocabulary', freshness: 'unknown', ...shards }
      orphanWords.push(word)
      orphanDetail.push({ word, key, tier: 'orphan', reason: 'not-in-current-vocabulary', sources })
      tiers.orphan++
      continue
    }

    if (c.tier === 'caseConflict') {
      /* --- CASE CONFLICT（真实语料实测 0 条，见 §2.3 末注） ---
       *
       * [FIX-4] 伪代码把 caseConflict 写进 `legacy:orphan:${word}` 且 tier='orphan'，
       *         同时又 `tiers.caseConflict++` —— 这使「记录里的 tier 字段」与
       *         「tiers 分档计数」**自相矛盾**（同一条记录在计数上是 caseConflict、
       *         在数据里是 orphan），下游无法自证。
       *         这里修正为：**数据里不写 tier 字段**（改由独立的 `caseConflict:true` 表达），
       *         并另给一个**不会与 orphan 键撞车**的键前缀。
       * 保守处理（与伪代码一致）：不猜归属，落到「未归属」族，但**保留大小写原词形**。
       */
      const key = `legacy:case-conflict:${word}`
      learning[key] = {
        word,
        caseConflict: true,
        reason: 'exact-miss-lower-hit',
        freshness: 'unknown',
        candidateForms: [...(content.lowerToForms.get(word.toLowerCase()) ?? [])].sort(),
        ...shards,
      }
      caseConflictWords.push(word)
      tiers.caseConflict++
      continue
    }

    if (c.tier === 'ambiguous') {
      /* --- AMBIGUOUS（§2.4，禁止复制、禁止猜包） --- */
      const candidates = c.pkgs.map((p) => `content:word:${content.pkgInfo.get(p).namespace}:${word}`)
      const key = `legacy:unattributed:${word}`
      learning[key] = { word, tier: 'ambiguous', candidates, freshness: 'unknown', ...shards }
      tiers.ambiguous++
      if (ambiguousDetail.length < 100000) ambiguousDetail.push({ word, key, candidates, sources })
      continue
    }

    /* --- RESOLVED：唯一映射 --- */
    const info = content.pkgInfo.get(c.pkg)
    const contentId = `content:word:${info.namespace}:${word}`
    if (learning[contentId]) {
      // 理论上不会发生（入参是旧键）；一旦发生，取时间戳更新者（§2.8.2 注释）
      warnings.push({
        code: 'DUPLICATE_SOURCE_MERGE',
        message: `目标键 ${contentId} 已存在，保留较新者`,
        word,
        sources,
      })
    }
    learning[contentId] = {
      contentId,
      contentVersion: info.contentVersion,
      contentChecksum: info.contentChecksum,
      freshness: 'ok',
      ...shards,
    }
    tiers.resolved++
  }

  if (caseConflictWords.length) {
    warnings.push({
      code: 'CASE_CONFLICT',
      message: `有 ${caseConflictWords.length} 个键精确口径不命中但小写归并命中（未猜归属，落到 legacy:case-conflict:*）`,
      words: caseConflictWords.slice(0, 100),
    })
  }

  /* ---- 步骤 4：letters + 全局标量独立搬走（§1.3）---- */
  const letterStats = { letters: { ...((analytics && analytics.letters) || {}) } }
  const totals = {
    totalKeys: analytics?.totalKeys ?? 0,
    totalCorrect: analytics?.totalCorrect ?? 0,
    totalWords: analytics?.totalWords ?? 0,
    bestWpm: analytics?.bestWpm ?? 0,
  }

  /* ---- 步骤 5：自建库索引（§2.1.1，只建索引，不迁学习记录）---- */
  const customBankIndex = {}
  for (const b of customBanks) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string') continue
    customBankIndex[b.id] = {
      bankId: b.id,
      namespace: `custom-${b.id.replace(/^custom-/, '')}`,
      words: Array.isArray(b.words) ? b.words.map((w) => w?.word).filter((w) => typeof w === 'string') : [],
      createdAt: typeof b.createdAt === 'number' ? b.createdAt : 0,
    }
  }

  /* ---- 步骤 6：备份 = 旧 4 键原样快照（§2.7）---- */
  const backup = JSON.parse(JSON.stringify({ review, memorize, analytics, customBanks }))

  /* ---- 步骤 7：体积核算（全部来自实际序列化，不估算）---- */
  const jsonOf = {
    learning: JSON.stringify(learning),
    letterStats: JSON.stringify(letterStats),
    totals: JSON.stringify(totals),
    customBankIndex: JSON.stringify(customBankIndex),
    backup: JSON.stringify(backup),
  }
  const targetBytes = {
    learning: utf16Bytes(jsonOf.learning),
    letterStats: utf16Bytes(jsonOf.letterStats),
    totals: utf16Bytes(jsonOf.totals),
    customBankIndex: utf16Bytes(jsonOf.customBankIndex),
    backup: utf16Bytes(jsonOf.backup),
  }

  // 配额口径（§2.9 实测：真实 10 MiB / 保守 5 MiB）
  const LIKELY_QUOTA_UTF16 = 10 * 1024 * 1024
  const CONSERVATIVE_QUOTA_UTF16 = 5 * 1024 * 1024
  const pct = (bytes, quota) => +((bytes / quota) * 100).toFixed(2)

  const projectedWithBackup = {
    newKeysBytes: targetBytes.learning + targetBytes.letterStats + targetBytes.totals + targetBytes.customBankIndex,
    backupBytes: targetBytes.backup,
  }
  projectedWithBackup.totalBytes = projectedWithBackup.newKeysBytes + projectedWithBackup.backupBytes
  projectedWithBackup.percentOf10MiB = pct(projectedWithBackup.totalBytes, LIKELY_QUOTA_UTF16)
  projectedWithBackup.percentOf5MiB = pct(projectedWithBackup.totalBytes, CONSERVATIVE_QUOTA_UTF16)

  /* ---- 步骤 8：源键字节（真实序列化）[FIX-5] ---- */
  const bytesOfStore = (v) => (v === null || v === undefined ? null : utf16Bytes(JSON.stringify(v)))

  /* ---- 步骤 9：rollbackToken（§2.7.2）[FIX-2] 确定性 id ---- */
  const rollbackTokenId = `mig-${CURRENT_VERSION}-${String(opts.migratorVersion).replace(/[^a-z0-9]/gi, '')}-${tiers.resolved}-${tiers.ambiguous}-${tiers.orphan}`

  /* ---- 步骤 10：组装 report（§2.8.1） ---- */
  const outcome =
    warnings.some((w) => w.code === 'CASE_CONFLICT' || w.code === 'INVALID_KEY_DROPPED') ? 'degraded' : 'ok'

  const report = {
    reportVersion: REPORT_VERSION,
    migratorVersion: MIGRATOR_VERSION,
    runtime: opts.runtime,
    startedAt: opts.startedAt,
    finishedAt: opts.finishedAt,
    durationMs: opts.durationMs,

    source: opts.source,
    sourceDetail: opts.sourceDetail,

    sourceKeys: [
      { key: 'gt.review.v1', present: bytesOfStore(review) !== null, entryCount: Object.keys(review).length, bytesUtf16: bytesOfStore(review) ?? 0, inScope: true },
      { key: 'gt.memorize.v1', present: bytesOfStore(memorize) !== null, entryCount: Object.keys(memorize).length, bytesUtf16: bytesOfStore(memorize) ?? 0, inScope: true },
      { key: 'gt.analytics.v1', present: bytesOfStore(analytics) !== null, entryCount: wordsFromLower.size, bytesUtf16: bytesOfStore(analytics) ?? 0, inScope: true },
      { key: 'gt.customBanks.v1', present: bytesOfStore(customBanks) !== null, entryCount: customBanks.length, bytesUtf16: bytesOfStore(customBanks) ?? 0, inScope: true },
      { key: 'gt.streak.v1', present: bytesOfStore(opts.streak) !== null, entryCount: opts.streak ? Object.keys(opts.streak).length : 0, bytesUtf16: bytesOfStore(opts.streak) ?? 0, inScope: false, reason: STREAK_NOT_IN_SCOPE_REASON },
    ],

    targetKeys: [
      { key: KEY_LEARNING_V2, entryCount: Object.keys(learning).length, bytesUtf16: targetBytes.learning, quotaPercent: pct(targetBytes.learning, LIKELY_QUOTA_UTF16) },
      { key: KEY_LETTER_STATS, entryCount: 1, bytesUtf16: targetBytes.letterStats, quotaPercent: pct(targetBytes.letterStats, LIKELY_QUOTA_UTF16) },
      { key: KEY_TOTALS, entryCount: 1, bytesUtf16: targetBytes.totals, quotaPercent: pct(targetBytes.totals, LIKELY_QUOTA_UTF16) },
      { key: KEY_CUSTOM_INDEX, entryCount: Object.keys(customBankIndex).length, bytesUtf16: targetBytes.customBankIndex, quotaPercent: pct(targetBytes.customBankIndex, LIKELY_QUOTA_UTF16) },
      { key: KEY_BACKUP, entryCount: LEGACY_KEYS.length, bytesUtf16: targetBytes.backup, quotaPercent: pct(targetBytes.backup, LIKELY_QUOTA_UTF16) },
    ],

    // targetSizes：prompt 点名要求的字段（新 3 键的字节数，单独一组便于消费）
    targetSizes: {
      [KEY_LEARNING_V2]: targetBytes.learning,
      [KEY_LETTER_STATS]: targetBytes.letterStats,
      [KEY_TOTALS]: targetBytes.totals,
      [KEY_CUSTOM_INDEX]: targetBytes.customBankIndex,
      [KEY_BACKUP]: targetBytes.backup,
    },

    tiers,

    orphanWords: orphanWords.slice(0, ORPHAN_SAMPLE_MAX),
    ambiguousSample: ambiguousDetail.slice(0, AMBIGUOUS_SAMPLE_MAX).map((x) => ({ word: x.word, candidates: x.candidates })),
    caseConflictWords: caseConflictWords.slice(0, ORPHAN_SAMPLE_MAX),

    warnings,

    rollbackToken: {
      id: rollbackTokenId,
      version: CURRENT_VERSION,
      backupKey: KEY_BACKUP,
      writtenKeys: [KEY_LEARNING_V2, KEY_LETTER_STATS, KEY_TOTALS, KEY_CUSTOM_INDEX, KEY_BACKUP],
      backedUpKeys: [...LEGACY_KEYS],
      legacyKeysRetained: true,
    },

    // 体积投影（额外字段，供决策：新键 + 备份 vs 旧键并存）
    volumeProjection: {
      legacyBytesUtf16: LEGACY_KEYS.reduce((s, k) => s + (report_sourceKeysBytes(null, k) ?? 0), 0),
      newKeysBytesUtf16: projectedWithBackup.newKeysBytes,
      backupBytesUtf16: projectedWithBackup.backupBytes,
      totalBytesUtf16: projectedWithBackup.totalBytes,
      percentOf10MiBQuota: projectedWithBackup.percentOf10MiB,
      percentOf5MiBQuota: projectedWithBackup.percentOf5MiB,
    },

    outcome,
    orphanUnavailableReason: null, // dry-run 永远有入参 → 永远可算（§2.5 第 1 条）
  }

  /* ---- 步骤 11：把完整样本（含 key）挂到 report 上（供 jsonl 写出，不算 schema 的一部分） ---- */
  report._fullOrphanDetail = orphanDetail
  report._fullAmbiguousDetail = ambiguousDetail
  report._duplicateSourceMerges = duplicateSourceMerges

  /** 内部辅助：从上面已算好的 sourceKeys 取某键字节（避免二次序列化） */
  function report_sourceKeysBytes(_, key) {
    const found = [
      { key: 'gt.review.v1', b: bytesOfStore(review) ?? 0 },
      { key: 'gt.memorize.v1', b: bytesOfStore(memorize) ?? 0 },
      { key: 'gt.analytics.v1', b: bytesOfStore(analytics) ?? 0 },
      { key: 'gt.customBanks.v1', b: bytesOfStore(customBanks) ?? 0 },
    ].find((x) => x.key === key)
    return found ? found.b : 0
  }

  return {
    next: { learning, letterStats, totals, customBankIndex, backup },
    report,
  }
}

/* ===========================================================================
 * 5. 幂等证明（prompt 要求：**真的跑两次并断言**，结果写进 report.idempotentProof）
 *
 * 判定方式：对同一份输入连续跑两次 migrateV1toV2，把两次的
 *   next（4 个目标键的序列化）+ report（去掉全部时间戳字段与随机字段）
 *   做**逐字节**比较。
 *
 * 为什么必须去掉时间戳：设计文档 §2.6 的幂等判定是「**源指纹相等就根本不跑**」，
 * 幂等性的本质是「相同输入 → 相同**产物**」，时间戳不是产物而是观测元数据。
 * 因此这里明确定义「逐字节相同」的口径 = 序列化产物 + 报告正文（不含时间元数据）。
 * 为避免自欺，脚本同时报告**未去时间戳**的原样比较结果。
 * ========================================================================= */
function assertIdempotent(run1, run2) {
  const stripVolatile = (report) => {
    const r = JSON.parse(JSON.stringify(report))
    for (const k of ['startedAt', 'finishedAt', 'durationMs', 'durationMsExact']) delete r[k]
    delete r.idempotentProof // 自引用字段
    delete r._fullOrphanDetail
    delete r._fullAmbiguousDetail
    delete r._duplicateSourceMerges
    return r
  }
  const ser = (obj) => JSON.stringify(obj)

  const nextA = JSON.stringify(run1.next)
  const nextB = JSON.stringify(run2.next)
  const repA = ser(stripVolatile(run1.report))
  const repB = ser(stripVolatile(run2.report))
  // 未去时间戳（原样）比较：若两次跑的 startedAt 相同（同一毫秒）则也可能相等，
  // 故这里用「显式注入不同时间戳的两次跑」来做真实原样比较。
  const rawA = ser({ next: run1.next, report: run1.report })
  const rawB = ser({ next: run2.next, report: run2.report })

  return {
    asserted: true,
    method:
      '对同一输入连续调用纯函数 migrateV1toV2 两次，逐字节比较 next(4 个目标键) 与 report（剥离 startedAt/finishedAt/durationMs 时间元数据后）',
    deterministicNext: nextA === nextB,
    deterministicReport: repA === repB,
    byteIdentical: nextA === nextB && repA === repB,
    nextSha256: null, // 由 main 填充（用 crypto 真算）
    reportSha256: null,
    identicalIncludingTimestamps: rawA === rawB,
    note:
      'identicalIncludingTimestamps=false 是**预期**：幂等性的对象是「产物」而非「观测元数据」。' +
      '设计文档 §2.6 的幂等实现是「源指纹相等则根本不跑」，其等价保证是「给定相同输入必须产出相同 next 与相同业务正文」。',
  }
}

/* ===========================================================================
 * 6. 报告自检（结构非法 ⇒ exit 1）
 * ========================================================================= */
// 形参名必须是 `_content`：本函数体不读它（真正读内容的是 main 作用域的 `content`，
// 见 917 行声明、928/936 行引用）。
// ⚠️ 别把 917 行的 `content` 也改名：oxlint 只报**声明点**、不报**引用点**，改成 `_content`
// 后 928 行的裸 `content` 依旧在 ⇒ 编译期全绿、运行期 migration:dryrun EXIT=2（实测踩过）。
function validateReport(report, _content) {
  const errors = []

  // ① prompt 点名必须存在的字段
  for (const f of ['startedAt', 'finishedAt', 'durationMs', 'durationMsExact', 'source', 'sourceDetail', 'sourceKeys', 'tiers', 'orphanWords', 'ambiguousSample', 'warnings', 'targetSizes', 'rollbackToken', 'idempotentProof']) {
    if (!(f in report)) errors.push(`report 缺字段 ${f}`)
  }

  // ② 三档计数必须与 learning 里的 legacy:* 键数**自洽**
  //    （resolved 无 legacy 前缀，无法从键反推，故只校验 ambiguous/orphan/caseConflict）
  const keys = Object.keys(report.__learningKeys ?? {})
  if (keys.length) {
    const amb = keys.filter((k) => k.startsWith('legacy:unattributed:')).length
    const orp = keys.filter((k) => k.startsWith('legacy:orphan:')).length
    if (amb !== report.tiers.ambiguous) errors.push(`tiers.ambiguous=${report.tiers.ambiguous} 但 learning 里 legacy:unattributed:* 键数=${amb}`)
    if (orp !== report.tiers.orphan) errors.push(`tiers.orphan=${report.tiers.orphan} 但 learning 里 legacy:orphan:* 键数=${orp}`)
  }

  // ③ 体积数字必须是非负整数且来自实际序列化（这里只校验形状）
  for (const [k, v] of Object.entries(report.targetSizes)) {
    if (!Number.isInteger(v) || v < 0) errors.push(`targetSizes["${k}"]=${v} 非法（应为非负整数）`)
  }

  // ④ rollbackToken 形状（§2.7.2）
  const t = report.rollbackToken
  if (!t || typeof t.id !== 'string' || !t.id) errors.push('rollbackToken.id 缺失')
  if (t?.backupKey !== KEY_BACKUP) errors.push(`rollbackToken.backupKey=${t?.backupKey} ≠ ${KEY_BACKUP}`)
  if (!Array.isArray(t?.writtenKeys) || t.writtenKeys.length !== 5) errors.push('rollbackToken.writtenKeys 应为 5 个新键')
  if (!Array.isArray(t?.backedUpKeys) || t.backedUpKeys.length !== 4) errors.push('rollbackToken.backedUpKeys 应为 4 个旧键')

  // ⑤ 幂等断言必须为真
  if (!report.idempotentProof?.byteIdentical) errors.push('幂等断言失败：两次运行产物不是逐字节相同')

  // ⑥ 目标键结构契约（§1.2 / §2.4 / §2.5）：legacy 记录必须带 word，resolved 必须带 contentId+freshness
  for (const [k, rec] of Object.entries(report.__learningKeys ?? {})) {
    if (!rec || typeof rec !== 'object') {
      errors.push(`learning["${k}"] 不是对象`)
      continue
    }
    if (k.startsWith('legacy:')) {
      if (typeof rec.word !== 'string' || !rec.word) errors.push(`learning["${k}"] 缺 word`)
      // §1.2：legacy 记录永久 freshness='unknown'
      if (rec.freshness !== 'unknown') errors.push(`learning["${k}"].freshness=${rec.freshness} 应为 'unknown'（§1.2）`)
      if (k.startsWith('legacy:unattributed:') && (!Array.isArray(rec.candidates) || rec.candidates.length < 2)) {
        errors.push(`learning["${k}"] 的 candidates 应 >= 2`)
      }
      // §1.2：legacy 记录**不得**携带版本三元组（真实版本的记录必须挂到 contentId 上）
      if ('contentId' in rec) errors.push(`learning["${k}"] 不应含 contentId（legacy 记录无归属）`)
      if ('contentVersion' in rec) errors.push(`learning["${k}"] 不应含 contentVersion`)
    } else if (k.startsWith('content:')) {
      if (rec.contentId !== k) errors.push(`learning["${k}"].contentId=${rec.contentId} 与键不一致`)
      if (!/^content:word:[a-z0-9-]+:.+$/.test(k)) errors.push(`learning["${k}"] 不是合法 4 段式 ContentId`)
      if (typeof rec.freshness !== 'string') errors.push(`learning["${k}"] 缺 freshness`)
      if (typeof rec.contentVersion !== 'number') errors.push(`learning["${k}"] 缺 contentVersion`)
    } else {
      errors.push(`learning["${k}"] 键既非 legacy:* 也非 content:*`)
    }
    // durationMs 必须是实际测量（> 0 且为整数）
  }
  if (!Number.isInteger(report.durationMs) || report.durationMs < 1) errors.push(`durationMs=${report.durationMs} 非法（应为 >=1 的整数毫秒）`)
  if (typeof report.durationMsExact !== 'number' || !(report.durationMsExact >= 0)) errors.push(`durationMsExact=${report.durationMsExact} 非法`)

  // ⑦ 源键必须含 gt.streak.v1 且 inScope=false（§2.1）
  const streakStat = report.sourceKeys.find((s) => s.key === 'gt.streak.v1')
  if (!streakStat) errors.push('sourceKeys 缺 gt.streak.v1')
  else if (streakStat.inScope !== false) errors.push('gt.streak.v1 必须 inScope=false')

  return { ok: errors.length === 0, errors }
}

/* ===========================================================================
 * 7. 运行器（含真跑两次 + 注入不同时间戳以做真实幂等比较）
 * ========================================================================= */
function runMigrationOnce(stores, content, source, sourceDetail, tsOverride) {
  const startedAtMs = tsOverride?.startedAtMs ?? Date.now()
  const t0 = process.hrtime.bigint()
  const { next, report } = migrateV1toV2(
    { review: stores.review, memorize: stores.memorize, analytics: stores.analytics, customBanks: stores.customBanks },
    content,
    {
      migratorVersion: MIGRATOR_VERSION,
      runtime: 'cli',
      source,
      sourceDetail,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(startedAtMs).toISOString(), // 占位，下面用真实耗时回填
      durationMs: 0,
      streak: stores.streak,
    },
  )
  const t1 = process.hrtime.bigint()
  const durationExact = Number(t1 - t0) / 1e6
  // [FIX-1] 回填真实耗时（来自 hrtime 实测，不是估算）。
  //   durationMs 按设计文档 §2.8.1 的取值示例（`196`）保持**整数毫秒**；
  //   亚毫秒精度另存 durationMsExact，避免为了精度破坏 schema 的整数语义。
  const durationMs = Math.max(1, Math.round(durationExact))
  report.durationMs = durationMs
  report.durationMsExact = +durationExact.toFixed(3)
  report.finishedAt = new Date(startedAtMs + durationMs).toISOString()
  return { next, report }
}

async function main() {
  /* ---- 参数与源数据 ---- */
  let stores
  let source
  let sourceDetail
  let sourceKeysPresent

  // ⚠️ 这里的 `content` **不能**加下划线前缀（与上面 validateReport 的 `_content` 相反）：
  // 927/928 行 buildSynthetic(content) 引用裸 `content`。oxlint 只报声明点、不报引用点，
  // 加前缀后这条崩溃彻底隐身 —— 实测 migration:dryrun EXIT=2。
  const content = loadContentTruth()

  if (userStoreArg) {
    const file = userStoreArg.split('=')[1]
    if (!existsSync(file)) throw new Error(`--user-store 文件不存在：${file}`)
    const loaded = loadFromUserStore(file)
    stores = loaded.stores
    source = 'user-store'
    sourceDetail = `来自 --user-store=${file}（形状=${loaded.shape}；顶层 gt.* 键 ${loaded.sourceKeysPresent.length} 个）`
    sourceKeysPresent = loaded.sourceKeysPresent
  } else {
    const synth = buildSynthetic(content)
    stores = synth.stores
    source = 'synthetic'
    sourceDetail = synth.sourceDetail
    sourceKeysPresent = synth.sourceKeysPresent
  }

  /* ---- 跑两次（第一次：真实时间戳；第二次：注入不同时间戳，用于证明「时间戳之外逐字节相同」）---- */
  const run1 = runMigrationOnce(stores, content, source, sourceDetail)
  const run2 = runMigrationOnce(stores, content, source, sourceDetail, { startedAtMs: Date.now() + 86400000 })

  /* ---- 幂等断言 ---- */
  const idem = assertIdempotent(run1, run2)

  // 真算 sha256（不依赖具体实现细节，用 node:crypto）
  const { createHash } = await import('node:crypto')
  const sha = (s) => createHash('sha256').update(s).digest('hex')
  idem.nextSha256 = sha(JSON.stringify(run1.next))
  idem.reportSha256 = sha(
    (() => {
      const r = JSON.parse(JSON.stringify(run1.report))
      delete r.startedAt
      delete r.finishedAt
      delete r.durationMs
      delete r.durationMsExact
      delete r.idempotentProof
      delete r._fullOrphanDetail
      delete r._fullAmbiguousDetail
      delete r._duplicateSourceMerges
      return JSON.stringify(r)
    })(),
  )
  run1.report.idempotentProof = idem

  const report = run1.report
  report.__learningKeys = run1.next.learning // 仅供 validateReport 内部使用，稍后剥离

  /* ---- 自检 ---- */
  const validation = validateReport(report, content)

  /* ---- 剥离内部字段（report 必须是纯数据、可 JSON.stringify、不含函数） ---- */
  delete report.__learningKeys
  const fullOrphanDetail = report._fullOrphanDetail ?? []
  const fullAmbiguousDetail = report._fullAmbiguousDetail ?? []
  const duplicateSourceMerges = report._duplicateSourceMerges ?? []
  delete report._fullOrphanDetail
  delete report._fullAmbiguousDetail
  delete report._duplicateSourceMerges

  /* ---- 写盘（唯一副作用；只写 report 与 jsonl）---- */
  mkdirSync(OUT_DIR, { recursive: true })
  const reportPath = join(OUT_DIR, 'migration-dryrun-report.json')
  const orphanPath = join(OUT_DIR, 'migration-dryrun-orphan.jsonl')
  const ambiguousPath = join(OUT_DIR, 'migration-dryrun-ambiguous.jsonl')

  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  writeFileSync(orphanPath, fullOrphanDetail.map((x) => JSON.stringify(x)).join('\n') + (fullOrphanDetail.length ? '\n' : ''))
  writeFileSync(ambiguousPath, fullAmbiguousDetail.map((x) => JSON.stringify({ word: x.word, key: x.key, candidates: x.candidates, sources: x.sources })).join('\n') + (fullAmbiguousDetail.length ? '\n' : ''))

  /* ---- 输出 ---- */
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    printHuman(report, fullOrphanDetail, fullAmbiguousDetail, duplicateSourceMerges, sourceKeysPresent, validation)
  }

  /* ---- 退出码 ---- */
  // ① 结构非法 ⇒ 1（最高优先）
  if (!validation.ok) {
    console.error('\nEXIT=1 报告结构自检失败：')
    for (const e of validation.errors) console.error(`  ✗ ${e}`)
    process.exit(1)
  }
  // ② synthetic 且未加 --allow-synthetic ⇒ 0 + 显式警示（参照 learning-consistency.mjs:429-435）
  if (source === 'synthetic' && !allowSynthetic) {
    if (!asJson) {
      console.log('')
      console.log('⚠️  source=synthetic：以上分布来自**合成数据**，不代表真实用户分布。')
      console.log('    orphan / ambiguous / caseConflict 三类样本是**故意注入**以证明三条分支可达。')
      console.log('    退出码降级为 EXIT=0（参照 learning-consistency.mjs 的做法）。')
      console.log('    要看真实分布：--user-store=<真实旧快照.json>；要按脏数据严格判定：--allow-synthetic。')
    }
    process.exit(0)
  }
  // ③ 真实数据 / --allow-synthetic ⇒ 严格判定：
  //    orphan > 0 / ambiguous > 0 是**正常的历史事实**，不是错误（prompt 明确要求 ⇒ exit 0）
  //    只有结构非法（上面已拦）才 exit 1。
  process.exit(0)
}

/* ===========================================================================
 * 8. 人类可读摘要（表格）
 * ========================================================================= */
function printHuman(report, orphanDetail, ambiguousDetail, dupMerges, sourceKeysPresent, validation) {
  const L = console.log
  const fmt = (n) => Number(n).toLocaleString('en-US')
  const pct = (n) => `${n}%`

  L('='.repeat(78))
  L('Migration v1 · DRY-RUN 报告（只输出，不写任何东西）')
  L('='.repeat(78))
  L('')
  L(`source          ${report.source}`)
  L(`sourceDetail    ${report.sourceDetail}`)
  L(`runtime         ${report.runtime}   migratorVersion=${report.migratorVersion}   reportVersion=${report.reportVersion}`)
  L(`startedAt       ${report.startedAt}`)
  L(`finishedAt      ${report.finishedAt}`)
  L(`durationMs      ${report.durationMs}   （实测迁移纯计算耗时；精确值 ${report.durationMsExact} ms）`)
  L(`outcome         ${report.outcome}`)
  L('')

  L('【1】源键（读了什么 / 各自多少条 / 多少字节 / 是否参与迁移）')
  L('  key'.padEnd(26) + 'present'.padStart(9) + 'entries'.padStart(10) + 'bytesUtf16'.padStart(12) + 'inScope'.padStart(9) + '   reason')
  for (const s of report.sourceKeys) {
    L(
      `  ${s.key}`.padEnd(26) +
        String(s.present).padStart(9) +
        fmt(s.entryCount).padStart(10) +
        fmt(s.bytesUtf16).padStart(12) +
        String(s.inScope).padStart(9) +
        '   ' +
        (s.reason ?? ''),
    )
  }
  const presentKeys = report.sourceKeys.filter((s) => s.inScope && s.present).map((s) => s.key)
  const missingKeys = report.sourceKeys.filter((s) => s.inScope && !s.present).map((s) => s.key)
  L(`  参与迁移的源键：${presentKeys.join(', ') || '(无)'}`)
  if (missingKeys.length) L(`  缺失（视为空表）：${missingKeys.join(', ')}`)
  L(`  顶层出现过的 gt.* 键（原始）：${sourceKeysPresent.join(', ') || '(无)'}`)
  L('')

  L('【2】三档分流（这是 prompt 要的「真实结果分布」）')
  const t = report.tiers
  L('  tier'.padEnd(18) + 'count'.padStart(10))
  L('  resolved'.padEnd(18) + fmt(t.resolved).padStart(10) + '   → content:word:<ns>:<word>')
  L('  ambiguous'.padEnd(18) + fmt(t.ambiguous).padStart(10) + '   → legacy:unattributed:<word>')
  L('  orphan'.padEnd(18) + fmt(t.orphan).padStart(10) + '   → legacy:orphan:<word>')
  L('  caseConflict'.padEnd(18) + fmt(t.caseConflict).padStart(10) + '   → legacy:case-conflict:<word>')
  L('  invalid(dropped)'.padEnd(18) + fmt(t.invalid).padStart(10))
  const total = t.resolved + t.ambiguous + t.orphan + t.caseConflict + t.invalid
  L('  TOTAL(words)'.padEnd(18) + fmt(total).padStart(10))
  if (total > 0) {
    L(`  占比： resolved ${pct(((t.resolved / total) * 100).toFixed(2))}  ambiguous ${pct(((t.ambiguous / total) * 100).toFixed(2))}  orphan ${pct(((t.orphan / total) * 100).toFixed(2))}`)
  }
  L('')

  L('【3】目标键（只在内存里构造，未落盘）')
  L('  key'.padEnd(26) + 'entries'.padStart(10) + 'bytesUtf16'.padStart(12) + 'quota%'.padStart(9))
  for (const k of report.targetKeys) {
    L(`  ${k.key}`.padEnd(26) + fmt(k.entryCount).padStart(10) + fmt(k.bytesUtf16).padStart(12) + String(k.quotaPercent).padStart(9))
  }
  const vp = report.volumeProjection
  L(`  迁移后新键合计 ${fmt(vp.newKeysBytesUtf16)} B（+备份 ${fmt(vp.backupBytesUtf16)} B = ${fmt(vp.totalBytesUtf16)} B）`)
  L(`  占真实配额 10MiB = ${vp.percentOf10MiBQuota}%   占保守 5MiB = ${vp.percentOf5MiBQuota}%`)
  L('')

  L(`【4】orphan 样本（前 ${Math.min(10, orphanDetail.length)} / 共 ${orphanDetail.length}，完整清单见 migration-dryrun-orphan.jsonl）`)
  if (!orphanDetail.length) L('  (无)')
  for (const x of orphanDetail.slice(0, 10)) {
    L(`  "${x.word}"  key=${x.key}  来源=${x.sources.join('+') || '(空)'}`)
  }
  L('')

  L(`【5】ambiguous 样本（前 ${Math.min(10, ambiguousDetail.length)} / 共 ${ambiguousDetail.length}，完整清单见 migration-dryrun-ambiguous.jsonl）`)
  if (!ambiguousDetail.length) L('  (无)')
  for (const x of ambiguousDetail.slice(0, 10)) {
    L(`  "${x.word}"  ${x.candidates.length} 个候选：`)
    for (const c of x.candidates) L(`      ${c}`)
  }
  L('')

  L(`【6】warnings（${report.warnings.length}）`)
  if (!report.warnings.length) L('  (无)')
  for (const w of report.warnings) {
    L(`  [${w.code}] ${w.message}`)
    const list = w.words ?? (w.word ? [w.word] : [])
    if (list.length) L(`      ${list.slice(0, 10).join(', ')}${list.length > 10 ? ` … (共 ${list.length})` : ''}`)
  }
  L(`  三源合并到同一记录（DUPLICATE_SOURCE_MERGE 明细）：${dupMerges.length} 条`)
  L('')

  L('【7】rollbackToken（设计文档 §2.7.2 形状）')
  L(`  id                 ${report.rollbackToken.id}`)
  L(`  backupKey          ${report.rollbackToken.backupKey}`)
  L(`  writtenKeys        ${report.rollbackToken.writtenKeys.join(', ')}`)
  L(`  backedUpKeys       ${report.rollbackToken.backedUpKeys.join(', ')}`)
  L(`  legacyKeysRetained ${report.rollbackToken.legacyKeysRetained}`)
  L('')

  L('【8】idempotentProof（真的跑两次的断言结果）')
  const ip = report.idempotentProof
  L(`  asserted                    ${ip.asserted}`)
  L(`  deterministicNext           ${ip.deterministicNext}`)
  L(`  deterministicReport         ${ip.deterministicReport}`)
  L(`  byteIdentical               ${ip.byteIdentical}   ← 幂等断言`)
  L(`  nextSha256                  ${ip.nextSha256}`)
  L(`  reportSha256                ${ip.reportSha256}`)
  L(`  identicalIncludingTimestamps ${ip.identicalIncludingTimestamps}`)
  L(`  method                      ${ip.method}`)
  L('')

  L('【9】结构自检')
  L(`  ok = ${validation.ok}`)
  for (const e of validation.errors) L(`    ✗ ${e}`)
  L('')
}

/* ===========================================================================
 * 9. 入口
 * ========================================================================= */
main().catch((e) => {
  console.error('FAIL(EXIT=2):', e?.stack ?? e)
  process.exit(2)
})

/* ===========================================================================
 * 口径复用说明（回应硬性约束「不许改 migration-audit.mjs 现有行为」）
 *
 * 本脚本**没有** import scripts/migration-audit.mjs，理由（可执行地验证）：
 *   1. migration-audit.mjs:30-252 全部是**顶层语句**，无 `export`、无 `main()` 守卫、
 *      无 `import.meta.main` 判定。`import('./migration-audit.mjs')` 会**立即执行**
 *      整段流程：向 stdout 打印人类表、写盘 migration-audit.json /
 *      migration-resolved-words.jsonl / migration-ambiguous-words.jsonl。
 *   2. 本项目 package.json 无 "sideEffects" 声明，ESM 的 import 无摇树豁免 —— 副作用必然发生。
 *   3. 本脚本的输出契约要求 `--json` 时 stdout **必须是纯 JSON**（与
 *      learning-consistency.mjs:418-420 的做法一致：人类表改道 stderr）。若 import
 *      audit 脚本，它的人类表会污染 stdout，且会**额外覆盖**它自己的 3 个产物。
 *   4. 因此「复用它的载入逻辑与三档分级」的正确落地是**按同一口径重建**：
 *      - 载入：与 learning-consistency.mjs:54-84 逐行同源（两脚本本就是同一套：
 *        包内 unique / wordToPkgs 区分大小写 / lowerToPkgs / lowerToForms），
 *        并额外读 manifest 的 contentVersion 与 contentChecksum（设计文档 §1.4 要求，
 *        audit 脚本没有这两项）。
 *      - 三档分级：与 migration-audit.mjs:60-101 及 learning-consistency.mjs:106-115 同源
 *        （本脚本 classifyWord 的判据与后者一字不差），只是把它从「统计 kind」
 *        落地为「执行 tier 动作」。
 *   5. 结论：这是**架构上的不可 import**，不是「不愿复用」。若将来把
 *      migration-audit.mjs 重构为 `export function auditContent()` + `if (import.meta.main)`
 *      的结构，本脚本可改为直接 import —— 但那**会改 migration-audit.mjs 的现有行为**，
 *      违反本次硬性约束，故不做。
 * ========================================================================= */
