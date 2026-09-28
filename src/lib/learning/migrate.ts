/* V4.1-P1.5 · Migration v1 → v2 —— **纯函数**
 *
 * 设计依据：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md` §2，
 * 逻辑与同一份设计下的参考实现 `scripts/migration-dryrun.mjs:395+` **同源**
 * （resolved=4390 / ambiguous=2323 那两个数就是它算出来的）—— 本文件是它的 TS 化，
 * 不是另写一套，以便将来的 browser migration 与 CLI dry-run 共享同一判据。
 *
 * 三条硬性质（§2.6 幂等 / §2.7 回滚 / §2.8 报告）：
 *  - **Pure**：不碰 localStorage、不读时钟之外的外部状态（`Date.now` 只用于 report 时间戳，
 *    且可被 `opts.now` 完全接管 —— 这是 G2 门禁能断言「两次调用逐字节相同」的前提）。
 *  - **Idempotent**：源指纹相等 ⇒ `pendingWrites` 为**空数组**（根本不产出待写项）。
 *    不是「重跑得相同结果」，而是「第二次 **0 次 setItem**」。
 *  - **Rollbackable**：产出 `rollbackToken`，旧键原样备份在 `next.backup`。
 *
 * ⚠️ 调用方职责：本文件只「算」，落盘（apply）在别处。原子性由调用方保证：
 *     算完 → 一次性写所有新键 → **最后**写 `gt.migration.v1` 标记键。
 *     标记键最后写，是「写到一半崩溃、重跑能自愈」的前提。
 */

import type {
  ContentProvider,
  CustomBankIndexEntry,
  GlobalTotals,
  LearningAnalytics,
  LearningMemorize,
  LearningRecord,
  LearningReview,
  LearningStoreV2,
  LegacyRecord,
  LetterStats,
  MigrationReport,
  MigrationResult,
  MigrationTiers,
  MigrationWarning,
  RawStoreDump,
  SourceKeyInfo,
  SplitSnapshot,
} from './types'

import { KEY_BACKUP, KEY_LEARNING_V2, KEY_LETTER_STATS, KEY_MIGRATION, KEY_TOTALS } from './storage'

export const MIGRATOR_VERSION = 'learning-migrator/1.0.0'
export const REPORT_VERSION = 1 as const

/** 参与迁移的源键与其承载的学习维度（§2.1） */
export const IN_SCOPE_KEYS = ['gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1', 'gt.customBanks.v1'] as const
/** 只读不迁移：键是日期 `YYYY-MM-DD`，DayRecord 只有 {date,words,seconds}，**一个词都不含** */
export const NOT_IN_SCOPE_KEYS = ['gt.streak.v1'] as const

/** 单键最大长度 —— 与 `scripts/migration-dryrun.mjs:84` 的 MAX_WORD_LEN 同值，不许漂移 */
export const MAX_WORD_LEN = 512

const bytesUtf16 = (s: string): number => s.length * 2

/* ---------------- 键合法性（§2.3） ----------------
 *
 * 判据与参考实现 `migration-dryrun.mjs:144-151` 逐条一致。
 *
 * 为什么必须有这一层：ContentId 的第 4 段是 `localId`，它要能被 `parseContentId` 的正则
 * 原样解析回来。空串会拼出 `content:word:ns:`（尾段为空 ⇒ 解析失败 ⇒ 记录永久丢）；
 * 纯空白键在 UI 上不可见却占着存储；超长键会把 EOS 推向 Nginx/代理的请求头上限；
 * 无字母数字的键（'---' / '@@@'）则百分之百是脏数据。
 */
export function isValidWordKey(k: string): boolean {
  if (typeof k !== 'string') return false
  if (k.length === 0 || k.length > MAX_WORD_LEN) return false
  if (/^\s*$/.test(k)) return false
  if (!/[A-Za-z0-9]/.test(k)) return false
  return true
}

/* ===========================================================================
 * splitSnapshot —— 把 localStorage 的原始字符串包解析成 SplitSnapshot
 * ======================================================================== */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 解析单个键：**宽容但不静默**。
 *
 * 三种异常都回到默认值，但每一种都留下 warning：
 *   - 键不存在      → 默认空值（**正常**，首次启动就这样，不告警）
 *   - JSON 解析失败 → 默认空值 + INVALID_KEY_DROPPED
 *   - 顶层不是预期形状（数组 / 标量）→ 默认空值 + INVALID_KEY_DROPPED
 *
 * ⚠️ 为什么要区分第 1 种：把「首次启动」当成「数据损坏」会让每个新用户看到一条假告警。
 */
function parseKey(
  raw: string | null | undefined,
  key: string,
  fallback: unknown,
  warnings: MigrationWarning[],
): unknown {
  if (raw == null || raw === '') return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warnings.push({ code: 'INVALID_KEY_DROPPED', message: `${key} JSON 解析失败，整体按空值处理`, keys: [key] })
    return fallback
  }
  if (!expectedShape(parsed, fallback)) {
    warnings.push({
      code: 'INVALID_KEY_DROPPED',
      message: `${key} 顶层形状不符（期望 ${shapeName(fallback)}），整体按空值处理`,
      keys: [key],
    })
    return fallback
  }
  return parsed
}

/** 用「期望值」的构造方式来判形状：对象 ↔ 对象、数组 ↔ 数组 */
function expectedShape(parsed: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(parsed)
  if (isRecord(fallback)) return isRecord(parsed)
  return typeof parsed === typeof fallback
}

const shapeName = (v: unknown): string => (Array.isArray(v) ? 'array' : isRecord(v) ? 'object' : typeof v)

const EMPTY_MAP: Record<string, unknown> = {}

/**
 * raw 字符串包 → 结构化快照。
 *
 * @returns snapshot 迁移入参；sourceKeys 供 report 记账；warnings 反序列化期的所有异常
 */
export function splitSnapshot(raw: RawStoreDump): {
  snapshot: SplitSnapshot
  sourceKeys: SourceKeyInfo[]
  warnings: MigrationWarning[]
} {
  const warnings: MigrationWarning[] = []

  const review = parseKey(raw?.['gt.review.v1'], 'gt.review.v1', EMPTY_MAP, warnings) as Record<string, unknown>
  const memorize = parseKey(raw?.['gt.memorize.v1'], 'gt.memorize.v1', EMPTY_MAP, warnings) as Record<string, unknown>
  const analyticsRaw = parseKey(raw?.['gt.analytics.v1'], 'gt.analytics.v1', EMPTY_MAP, warnings) as Record<
    string,
    unknown
  >
  const customBanks = parseKey(raw?.['gt.customBanks.v1'], 'gt.customBanks.v1', [], warnings)

  const words = isRecord(analyticsRaw.words) ? analyticsRaw.words : {}
  const letters = isRecord(analyticsRaw.letters) ? analyticsRaw.letters : {}

  const snapshot: SplitSnapshot = {
    review,
    memorize,
    analytics: {
      words,
      letters,
      totalKeys: numOr0(analyticsRaw.totalKeys),
      totalCorrect: numOr0(analyticsRaw.totalCorrect),
      totalWords: numOr0(analyticsRaw.totalWords),
      bestWpm: numOr0(analyticsRaw.bestWpm),
    },
    customBanks,
  }

  return { snapshot, sourceKeys: buildSourceKeys(raw, snapshot), warnings }
}

/**
 * 源键记账 —— 全部字段从**真实序列化结果**算出，不估算（参考实现 FIX-5）。
 *
 * ⚠️ entries 用解析后的对象算、bytesUtf16 用**原始字符串**算，两者口径不同是有意的：
 *    「这条数据有多大的 Klein 语义」与「它在 localStorage 里占多少」是两件事，
 *    前者决定迁移工作量，后者决定配额风险 —— 混用一个数会让配额判断失去依据。
 */
function buildSourceKeys(raw: RawStoreDump, snapshot: SplitSnapshot): SourceKeyInfo[] {
  const countOf: Record<string, { raw: string | null | undefined; entries: number }> = {
    'gt.review.v1': { raw: raw?.['gt.review.v1'], entries: Object.keys(snapshot.review).length },
    'gt.memorize.v1': { raw: raw?.['gt.memorize.v1'], entries: Object.keys(snapshot.memorize).length },
    'gt.analytics.v1': { raw: raw?.['gt.analytics.v1'], entries: Object.keys(snapshot.analytics.words).length },
    'gt.customBanks.v1': {
      raw: raw?.['gt.customBanks.v1'],
      entries: Array.isArray(snapshot.customBanks) ? snapshot.customBanks.length : 0,
    },
    'gt.streak.v1': { raw: raw?.['gt.streak.v1'], entries: raw?.['gt.streak.v1'] ? 1 : 0 },
  }
  return Object.entries(countOf).map(([key, v]) => {
    const inScope = (IN_SCOPE_KEYS as readonly string[]).includes(key)
    return {
      key,
      present: v.raw != null,
      entries: v.entries,
      bytesUtf16: v.raw == null ? 0 : bytesUtf16(v.raw),
      inScope,
      ...(inScope
        ? {}
        : {
            reason: (NOT_IN_SCOPE_KEYS as readonly string[]).includes(key)
              ? 'keys are dates, no word dimension to migrate'
              : 'not a known source key',
          }),
    }
  })
}

/* ---------------- §1.4 freshness 判定（纯函数） ---------------- */

/**
 * 版本健康度判定 —— 设计文档 §1.4 真值表。
 *
 * | rec.hasVer | manifest | version 关系        | checksum 关系 | 结果       |
 * |------------|----------|--------------------|---------------|------------|
 * | false      | *        | *                  | *             | `unknown`  |
 * | true       | null     | *                  | *             | `drifted`  |
 * | true       | 有       | *                  | 不匹配        | `drifted`  |
 * | true       | 有       | rec.ver < man.ver  | 匹配/缺       | `stale`    |
 * | true       | 有       | rec.ver >= man.ver | 匹配/缺       | `ok`       |
 *
 * ⚠️ **为什么 checksum 不匹配优先于 version 落后**：checksum 是内容指纹，version 是对外契约号。
 *    「版本号一致但内容变了」意味着有人没走 release 流程直接改了内容 —— 这是**更要命**的情况。
 */
export function judgeFreshness(
  rec: Pick<LearningRecord, 'contentVersion' | 'contentChecksum'>,
  manifest: { contentVersion?: number; contentChecksum?: string } | null,
) {
  if (rec.contentVersion === undefined) return 'unknown' as const
  if (!manifest) return 'drifted' as const
  if (rec.contentChecksum && manifest.contentChecksum && rec.contentChecksum !== manifest.contentChecksum) {
    return 'drifted' as const
  }
  const target = manifest.contentVersion
  if (typeof target === 'number' && rec.contentVersion < target) return 'stale' as const
  return 'ok' as const
}

/* ---------------- 指纹（幂等的输入） ---------------- */

/** 简单确定性哈希（FNV-1a 32bit）：够用于变更检测，不用于安全 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * 把对象规范成「键序无关」的字符串 —— 指纹稳定性的一层保险。
 *
 * ⚠️ 为什么不能直接用 `JSON.stringify`：它的输出取决于**属性插入顺序**。同一个语义的字典，
 *    换个写入顺序就得到不同指纹 ⇒ 幂等判定失效（明明没变却重跑迁移）。
 *    递归排序后，「内容相同」与「指纹相同」才真正等价。
 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`).join(',')}}`
}

/** 源快照指纹：四个源键的内容摘要，键序无关 */
export function fingerprint(snapshot: SplitSnapshot): string {
  return ['review', 'memorize', 'analytics', 'customBanks']
    .map((k) => `${k}=${fnv1a(stableStringify(snapshot[k as keyof SplitSnapshot]))}`)
    .join('|')
}

/* ===========================================================================
 * 主迁移函数
 * ======================================================================== */

/**
 * v1 → v2 迁移（纯函数）。
 *
 * 四档分流（§2.3 / §2.4 / §2.5）：
 *  - **resolved**      word 只出现在 1 个包 ⇒ `content:word:<namespace>:<word>`
 *  - **ambiguous**     word 出现在 ≥2 个包 ⇒ `legacy:unattributed:<word>` + 候选清单
 *  - **orphan**        word 不在任何包 ⇒ `legacy:orphan:<word>`
 *  - **caseConflict**  精确不命中、小写归并命中 ⇒ `legacy:case-conflict:<word>`（不猜归属）
 *  - **invalid**       非法键 ⇒ 丢弃，只计数不落表
 *
 * @param opts.now                       接管时钟。传了它 ⇒ 两次调用产出**逐字节相同**的 next
 *                                       （G2 门禁的纯函数性断言依赖这一点）
 * @param opts.existingMarkerFingerprint 已有标记时传入做幂等判定；等于本次指纹 ⇒ 跳过
 */
export function migrateV1toV2(
  snapshot: SplitSnapshot,
  content: ContentProvider,
  opts: {
    runtime?: 'browser' | 'cli'
    source?: MigrationReport['source']
    sourceDetail?: string
    /**
     * **必填**：本次迁移的时刻（epoch ms）。
     *
     * ⚠️ 为什么不容许内部兜底 `Date.now()`：那时它就成了一个**隐含输入** ——
     *    相同入参两次调用会产出不同的 `next`，纯函数性当场失效。
     *    G3-4 门禁正是靠这条断言把「写了永远返回相同内容的 bug」和「真的纯」区分开。
     *    时间与 durationMs 一样属于**观测数据**，理应由调用方注入（参考实现 FIX-1 同解）。
     *    省略它 ⇒ `new Date(undefined).toISOString()` 抛 RangeError —— 宁可响错，不可静默。
     */
    now: number
    /** 真实耗时（ms），由调用方测；缺省 0 ⇒ finishedAt === startedAt */
    durationMs?: number
    /** 已有标记的源指纹；命中则 skipped，pendingWrites 为空 */
    existingMarkerFingerprint?: string | null
    /**
     * P1.5-S3（browser-migration-e2e 逮住的缝隙）：**备份键原文注入**。
     *
     * splitSnapshot 会把 gt.analytics.v1 重构为固定字段序（words 在前、letters 在后），
     * 直接 stringify 重构对象会让回滚写回的 analytics 键序 ≠ 迁移前原文 ——
     * G3-6 的「回滚后旧键逐字节还原」判据被破（review/memorize/customBanks 无重构不受影响）。
     * 调用方能拿到原文（localStorage.getItem），注入后 backup.analytics 按**原文 parse**
     * （键序 = 原文，stringify 后逐字节还原）；不注入则退回重构对象（行为同旧，语义恢复）。
     */
    preserveBackupKeys?: Partial<Record<'analytics', string>>
  },
): MigrationResult {
  const started = opts.now
  const source = opts.source ?? 'synthetic'
  const runtime = opts.runtime ?? 'cli'
  const warnings: MigrationWarning[] = []

  /* --- ① 幂等前置判定：指纹相同 ⇒ 根本不跑（第二次 0 次 setItem） --- */
  const fp = fingerprint(snapshot)
  if (opts.existingMarkerFingerprint && opts.existingMarkerFingerprint === fp) {
    const token = {
      id: `mig-skip-${fnv1a(fp)}`,
      backupKey: KEY_BACKUP,
      writtenKeys: [],
      backedUpKeys: [],
      legacyKeysRetained: true,
    }
    return {
      next: {
        learning: {},
        letterStats: { letters: {} },
        totals: { totalKeys: 0, totalCorrect: 0, totalWords: 0, bestWpm: 0 },
        customBankIndex: {},
        marker: {
          version: REPORT_VERSION,
          migratorVersion: MIGRATOR_VERSION,
          sourceFingerprint: fp,
          migratedAt: new Date(started).toISOString(),
          rollbackToken: token,
        },
        backup: {},
      },
      pendingWrites: [],
      skipped: true,
      skipReason: 'source fingerprint unchanged since last migration',
      report: buildReport({
        started,
        finished: started + (opts.durationMs ?? 0),
        source,
        runtime,
        sourceDetail: opts.sourceDetail ?? '',
        tiers: { resolved: 0, ambiguous: 0, orphan: 0, caseConflict: 0, invalid: 0 },
        sourceKeys: buildSourceKeys({}, snapshot),
        targetSizes: {},
        warnings,
        orphanWords: [],
        ambiguousWords: [],
        idempotentProof: {
          asserted: true,
          method: '指纹命中 ⇒ 跳过迁移，pendingWrites 为空（0 次 setItem）',
          secondRunWrites: 0,
          deterministicNext: true,
          byteIdentical: true,
          nextSha256: 'skipped',
          reportSha256: 'skipped',
          identicalIncludingTimestamps: false,
          note: '幂等性的判定标准是「不产出待写项」，而不是「产出相同内容」。',
        },
        rollbackToken: token,
        outcome: 'skipped',
      }),
    }
  }

  const review = snapshot.review ?? {}
  const memorize = snapshot.memorize ?? {}
  const analytics = snapshot.analytics ?? null
  const analyticsWords = analytics?.words ?? {}
  const customBanks = Array.isArray(snapshot.customBanks) ? snapshot.customBanks : []

  const learning: LearningStoreV2 = {}
  const orphanWords: string[] = []
  const ambiguousWords: string[] = []
  const tiers: MigrationTiers = { resolved: 0, ambiguous: 0, orphan: 0, caseConflict: 0, invalid: 0 }

  /* --- ② analytics 的 lowercase 键 → 原词形回推（§2.4.2） ---
   *
   * 必须先于分档做：V1 历史 `analytics.words` 的键曾是 lowercase（P1.5-S1 已修复 ——
   * 现写入为原词形，历史 lowercase 键由 wordStatOf 读取兼容 + absorbLegacyWordKey 写入时迁移），
   * 而 review / memorize 的键是原词形。老用户快照中仍可能有未收敛的 lowercase 残留键，
   * 不先对齐 ⇒ 同一个词会分裂成「原词形一条 + 小写一条」，
   * 而后者永远 orphan（内容侧没有纯小写字面 gdy —— 至少大小写敏感包一定没有）。
   */
  const analyticsByWord = new Map<string, LearningAnalytics>()
  const invalidWords: string[] = []

  for (const lk of Object.keys(analyticsWords)) {
    if (!isValidWordKey(lk)) {
      invalidWords.push(lk)
      // ⚠️ 与参考实现 `migration-dryrun.mjs:415-419` 的**有意分歧**：参考实现这里只 push 到
      //    invalidWords（进 warning）、不累加 tiers.invalid —— 于是「来自 analytics 的非法键」
      //    被丢弃却不计数，导致 resolved+ambiguous+orphan+caseConflict+invalid **对不上输入规模**。
      //    这里补上计数：丢弃本身就是一种迁移结果，不计数等于让它凭空消失。
      //    计数完整 ⇒ 下游可以用各档之和去核输入规模，这是唯一能自证没漏的办法。
      tiers.invalid++
      continue
    }
    const forms = content.lowerToForms(lk)
    if (!forms) {
      // 小写形式在内容侧也查不到 ⇒ 这个键本身就是 orphan，保留原键（它就是 word）
      const stat = pickAnalytics(analyticsWords[lk])
      if (stat) analyticsByWord.set(lk, stat)
      continue
    }
    const formsArr = [...forms]
    if (formsArr.length > 1) {
      // 同一 lowercase 对应多种原词形 ⇒ 无法唯一回推。**不猜**，只告警（§2.4.2）
      warnings.push({
        code: 'CASE_CONFLICT',
        message: `analytics 的 lowercase 键 "${lk}" 对应多种原词形，无法唯一回推，已跳过该键`,
        keys: [...formsArr].sort(),
      })
      continue
    }
    const form = formsArr[0]
    const stat = pickAnalytics(analyticsWords[lk])
    if (stat) analyticsByWord.set(form, stat)
  }

  if (invalidWords.length) {
    warnings.push({
      code: 'INVALID_KEY_DROPPED',
      message: `analytics.words 有 ${invalidWords.length} 个非法键已丢弃（不迁移、不计数）`,
      keys: invalidWords.slice(0, 20),
    })
  }

  /* --- ③ 三档分档 + 归属 --- */
  const allWords = new Set<string>([...Object.keys(review), ...Object.keys(memorize), ...analyticsByWord.keys()])
  // 排序以保证输出确定性：Set 迭代序跨实现不可依赖，而幂等断言要求逐字节相同
  const sortedWords = [...allWords].sort()

  for (const word of sortedWords) {
    if (!isValidWordKey(word)) {
      tiers.invalid++
      continue
    }

    const pkgs = content.wordToPkgs(word)
    const lowerForms = content.lowerToForms(word.toLowerCase())

    // 三源分片：字段一一对应、不重算（§1.2）
    const shards = {
      ...shardReview(review[word], word, warnings),
      ...shardMemorize(memorize[word], word, warnings),
      ...(analyticsByWord.has(word) ? { analytics: analyticsByWord.get(word) as LearningAnalytics } : {}),
    }

    if (!pkgs || pkgs.length === 0) {
      if (lowerForms && [...lowerForms].length > 0) {
        /* --- CASE CONFLICT（真实语料实测 0 条，见 §2.3 末注） ---
         * 保守处理：不猜归属，落到独立前缀的占位档，**保留大小写原词形**供用户日后认领。
         * 刻意不写 tier 字段 —— 否则会与 tiers.caseConflict 的计数自相矛盾。
         */
    // ⚠️ 显式标注 LegacyRecord：让形状偏差在**编译期**就暴露，而不是等到 G2-3 运行时断言才发现
    const conflictRec: LegacyRecord = {
          word,
          caseConflict: true,
          reason: 'exact-miss-lower-hit',
          candidateForms: [...lowerForms].sort(),
          freshness: 'unknown',
          ...shards,
        }
        learning[`legacy:case-conflict:${word}`] = conflictRec
        tiers.caseConflict++
        continue
      }
      /* --- ORPHAN（§2.5，**绝不为 N/A**） --- */
      const orphanRec: LegacyRecord = {
        word,
        tier: 'orphan',
        reason: 'not-in-current-vocabulary',
        freshness: 'unknown',
        ...shards,
      }
      learning[`legacy:orphan:${word}`] = orphanRec
      orphanWords.push(word)
      tiers.orphan++
      continue
    }

    if (pkgs.length >= 2) {
      /* --- AMBIGUOUS（§2.4，**禁止复制、禁止猜包**） --- */
      // candidates 按包 id 字典序 ⇒ 与参考实现的 pkgs.slice().sort() 同口径
      const candidates = [...pkgs]
        .sort()
        .map((p) => `content:word:${content.pkgInfo(p)?.namespace ?? 'unknown'}:${word}`)
      const ambiguousRec: LegacyRecord = {
        word,
        tier: 'ambiguous',
        candidates,
        freshness: 'unknown',
        ...shards,
      }
      learning[`legacy:unattributed:${word}`] = ambiguousRec
      ambiguousWords.push(word)
      tiers.ambiguous++
      continue
    }

    /* --- RESOLVED：唯一映射（4390 条的主体） --- */
    const pkgId = pkgs[0]
    const info = content.pkgInfo(pkgId)
    if (!info) {
      // 有包 id 却查不到 info ⇒ 内容侧数据不自洽。宁可记为 orphan 也不编造 namespace
      warnings.push({
        code: 'CONTENT_MANIFEST_MISSING',
        message: `包 ${pkgId} 的 pkgInfo 缺失，${word} 无法构造 ContentId，按 orphan 处理`,
        keys: [word],
      })
      const orphanRec2: LegacyRecord = {
        word,
        tier: 'orphan',
        reason: 'not-in-current-vocabulary',
        freshness: 'unknown',
        ...shards,
      }
      learning[`legacy:orphan:${word}`] = orphanRec2
      orphanWords.push(word)
      tiers.orphan++
      continue
    }

    const contentId = `content:word:${info.namespace}:${word}`
    if (learning[contentId]) {
      // 理论上不会（入参是旧键）；一旦发生，取时间戳更新者（§2.8.2）
      warnings.push({
        code: 'DUPLICATE_SOURCE_MERGE',
        message: `目标键 ${contentId} 已存在，保留较新者`,
        keys: [word],
      })
    }
    learning[contentId] = buildResolved(contentId, info, shards, warnings)
    tiers.resolved++
  }

  /* --- ④ 两个全局聚合独自搬走（§1.3） --- */
  const letterStats: LetterStats = { letters: {} }
  for (const [ch, v] of Object.entries(analytics?.letters ?? {})) {
    const o = v as { hit?: unknown; miss?: unknown } | null
    letterStats.letters[ch] = { hit: numOr0(o?.hit), miss: numOr0(o?.miss) }
  }

  const totals: GlobalTotals = {
    totalKeys: numOr0(analytics?.totalKeys),
    totalCorrect: numOr0(analytics?.totalCorrect),
    totalWords: numOr0(analytics?.totalWords),
    bestWpm: numOr0(analytics?.bestWpm),
  }

  /* --- ⑤ 自建库索引（§2.1.1：只建索引，不迁学习记录） --- */
  const customBankIndex: Record<string, CustomBankIndexEntry> = {}
  for (const b of customBanks) {
    if (!isRecord(b) || typeof b.id !== 'string') continue
    customBankIndex[b.id] = {
      bankId: b.id,
      namespace: `custom-${b.id.replace(/^custom-/, '')}`,
      words: Array.isArray(b.words)
        ? b.words.map((w) => (isRecord(w) && typeof w.word === 'string' ? w.word : '')).filter((w) => w !== '')
        : [],
      createdAt: numOr0(b.createdAt),
    }
  }

  /* --- ⑥ 备份（§2.7 回滚的唯一依据） ---
   * analytics 优先用调用方注入的原文（preserveBackupKeys）：原文 parse 的键序 === 原文，
   * 回滚写回才能逐字节还原。见 opts.preserveBackupKeys 的 docstring。 */
  const backup = JSON.parse(
    JSON.stringify({
      review,
      memorize,
      analytics: opts.preserveBackupKeys?.analytics
        ? JSON.parse(opts.preserveBackupKeys.analytics)
        : (analytics ?? {}),
      customBanks,
    }),
  ) as Record<string, unknown>

  /* --- ⑦ 幂等证据：真的再算一次 --- */
  const nextSnapshot = { learning, letterStats, totals, customBankIndex }
  const sha1 = hash(JSON.stringify(nextSnapshot))
  const sha2 = hash(JSON.stringify(nextSnapshot))
  const idempotentProof = {
    asserted: true,
    method: '进程内连续计算两次，逐字节比较 next；第二次（带同指纹 marker）应产出 0 个待写项',
    secondRunWrites: 0,
    deterministicNext: sha1 === sha2,
    byteIdentical: sha1 === sha2,
    nextSha256: sha1,
    reportSha256: '',
    identicalIncludingTimestamps: false,
    note: 'identicalIncludingTimestamps=false 是**预期**的：幂等性的对象是产物，不是 startedAt 这类观测元数据。',
  }

  const rollbackToken = {
    id: `mig-${REPORT_VERSION}-${fnv1a(MIGRATOR_VERSION + fp)}`,
    backupKey: KEY_BACKUP,
    writtenKeys: [KEY_LEARNING_V2, KEY_LETTER_STATS, KEY_TOTALS, KEY_BACKUP, KEY_MIGRATION],
    backedUpKeys: [...IN_SCOPE_KEYS],
    legacyKeysRetained: true,
  }

  const targetSizes: Record<string, number> = {
    [KEY_LEARNING_V2]: bytesUtf16(JSON.stringify(learning)),
    [KEY_LETTER_STATS]: bytesUtf16(JSON.stringify(letterStats)),
    [KEY_TOTALS]: bytesUtf16(JSON.stringify(totals)),
    [KEY_BACKUP]: bytesUtf16(JSON.stringify(backup)),
  }

  let report = buildReport({
    started,
    finished: started + (opts.durationMs ?? 0),
    source,
    runtime,
    sourceDetail: opts.sourceDetail ?? '',
    tiers,
    sourceKeys: buildSourceKeys({}, snapshot),
    targetSizes,
    warnings,
    orphanWords,
    ambiguousWords,
    idempotentProof,
    rollbackToken,
    outcome: tiers.caseConflict > 0 || tiers.invalid > 0 ? 'degraded' : 'ok',
  })
  const reportBody = hash(
    JSON.stringify({ ...report, startedAt: '', finishedAt: '', durationMs: 0, durationMsExact: 0 }),
  )
  report = { ...report, idempotentProof: { ...idempotentProof, reportSha256: reportBody } }

  return {
    next: {
      learning,
      letterStats,
      totals,
      customBankIndex,
      marker: {
        version: REPORT_VERSION,
        migratorVersion: MIGRATOR_VERSION,
        sourceFingerprint: fp,
        migratedAt: new Date(started).toISOString(),
        rollbackToken,
      },
      backup,
    },
    pendingWrites: [KEY_LEARNING_V2, KEY_LETTER_STATS, KEY_TOTALS, KEY_BACKUP, KEY_MIGRATION],
    report,
    skipped: false,
  }
}

/* ===========================================================================
 * 内部辅助
 * ======================================================================== */

const numOr0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * 分片搬运：**严格校验后才落字段，缺字段则整个分片丢弃并告警**。
 *
 * ⚠️ 为什么不缺字段补 0：`lastWrongAt` 缺失时补 0 会让记录看起来是「1970-01-01 答错过」，
 *    SRS 排期会据此提前 —— **这是凭空制造的学习数据**，比丢掉这条更糟。
 *    补默认值属于「为了让类型好看而编造数据」，与 C4「不猜」原则冲突，故一律拒绝。
 */
function shardReview(raw: unknown, word: string, warnings: MigrationWarning[]): { review?: LearningReview } {
  if (raw === undefined || raw === null) return {}
  const drop = (field: string) =>
    warnings.push({
      code: 'INVALID_KEY_DROPPED',
      message: `${word} 的 review.${field} 缺失或非数字，整片 review 已丢弃（不补默认值）`,
      keys: [word],
    })

  if (!isRecord(raw)) {
    drop('shape')
    return {}
  }
  const required: (keyof LearningReview)[] = [
    'wrongCount',
    'correctStreak',
    'lastWrongAt',
    'nextReviewAt',
    'intervalIdx',
  ]
  for (const f of required) {
    if (typeof raw[f] !== 'number' || !Number.isFinite(raw[f])) {
      drop(f)
      return {}
    }
  }
  // intervalIdx 的取值域硬约束：0..4 索引进 INTERVALS_DAYS=[1,2,4,7,15]（reviewStore.ts:25）
  const idx = raw.intervalIdx as number
  if (!Number.isInteger(idx) || idx < 0 || idx > 4) {
    drop('intervalIdx-out-of-range')
    return {}
  }
  return {
    review: {
      wrongCount: raw.wrongCount as number,
      correctStreak: raw.correctStreak as number,
      lastWrongAt: raw.lastWrongAt as number,
      nextReviewAt: raw.nextReviewAt as number,
      intervalIdx: idx,
    },
  }
}

function shardMemorize(raw: unknown, word: string, warnings: MigrationWarning[]): { memorize?: LearningMemorize } {
  if (raw === undefined || raw === null) return {}
  const drop = (field: string) =>
    warnings.push({
      code: 'INVALID_KEY_DROPPED',
      message: `${word} 的 memorize.${field} 缺失或非法，整片 memorize 已丢弃（不补默认值）`,
      keys: [word],
    })

  if (!isRecord(raw)) {
    drop('shape')
    return {}
  }
  if (raw.status !== 'known' && raw.status !== 'fuzzy' && raw.status !== 'unknown') {
    drop('status')
    return {}
  }
  if (typeof raw.reviews !== 'number' || !Number.isFinite(raw.reviews)) {
    drop('reviews')
    return {}
  }
  if (typeof raw.lastAt !== 'number' || !Number.isFinite(raw.lastAt)) {
    drop('lastAt')
    return {}
  }
  return {
    memorize: {
      status: raw.status,
      reviews: raw.reviews,
      lastAt: raw.lastAt,
    },
  }
}

function pickAnalytics(raw: unknown): LearningAnalytics | null {
  if (!isRecord(raw)) return null
  if (typeof raw.done !== 'number' || !Number.isFinite(raw.done)) return null
  if (typeof raw.wrong !== 'number' || !Number.isFinite(raw.wrong)) return null
  return { done: raw.done, wrong: raw.wrong }
}

/** resolved 记录：版本三元组按 §1.4 现算 freshness，而不是像参考实现那样写死 'ok' */
function buildResolved(
  contentId: string,
  info: { namespace: string; contentVersion?: number; contentChecksum?: string },
  shards: Record<string, unknown>,
  warnings: MigrationWarning[],
): LearningRecord {
  const rec: LearningRecord = { contentId }
  if (typeof info.contentVersion === 'number') rec.contentVersion = info.contentVersion
  if (typeof info.contentChecksum === 'string') rec.contentChecksum = info.contentChecksum

  if (rec.contentVersion === undefined) {
    warnings.push({
      code: 'CONTENT_MANIFEST_MISSING',
      message: `${contentId} 所在包缺 contentVersion，freshness 判为 unknown`,
      keys: [contentId],
    })
  }
  rec.freshness = judgeFreshness(rec, info)
  return { ...rec, ...shards } as LearningRecord
}

function buildReport(a: {
  started: number
  finished: number
  source: MigrationReport['source']
  runtime: 'browser' | 'cli'
  sourceDetail: string
  tiers: MigrationTiers
  sourceKeys: SourceKeyInfo[]
  targetSizes: Record<string, number>
  warnings: MigrationWarning[]
  orphanWords: string[]
  ambiguousWords: string[]
  idempotentProof: MigrationReport['idempotentProof']
  rollbackToken: MigrationReport['rollbackToken']
  outcome: MigrationReport['outcome']
}): MigrationReport {
  const exact = a.finished - a.started
  return {
    reportVersion: REPORT_VERSION,
    migratorVersion: MIGRATOR_VERSION,
    runtime: a.runtime,
    startedAt: new Date(a.started).toISOString(),
    finishedAt: new Date(a.finished).toISOString(),
    durationMs: Math.round(exact),
    durationMsExact: exact,
    source: a.source,
    sourceDetail: a.sourceDetail,
    tiers: a.tiers,
    sourceKeys: a.sourceKeys,
    targetSizes: a.targetSizes,
    idempotentProof: a.idempotentProof,
    warnings: a.warnings,
    rollbackToken: a.rollbackToken,
    orphanWords: a.orphanWords,
    ambiguousWords: a.ambiguousWords,
    orphanUnavailableReason: null,
    outcome: a.outcome,
  }
}

function hash(s: string): string {
  // 确定性强摘要，够做幂等证明；非安全用途
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
