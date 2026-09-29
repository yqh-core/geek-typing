/* V4.1-P1.5 · Learning v2 类型层
 *
 * 来源：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md`（已冻结的设计）。
 * 本文件**逐字照抄**设计文档 §1.2 / §1.3 的类型定义，包括那些看起来冗长的注释 ——
 * 那些注释是契约论证的一部分，删掉等于删掉「为什么这么设计」。
 *
 * 三层边界（src/core/content/model/content.ts:3-7 定版）：
 *   Content  —— 内容是什么（不随用户变）
 *   Learning —— 用户与某条内容的互动状态（本文件）
 *   User     —— 用户画像与偏好
 */

/**
 * Learning 层的一等公民：**一条 LearningRecord = 一个 ContentId 的学习状态**。
 *
 * ⚠️ 本类型**只承载「挂得到某条 content 上的状态」**。
 *    任何全局性、与具体 content 无关的聚合（字母统计、总击键数、最佳 WPM）
 *    一律不进本类型 —— 见 §1.3 的拆分论证，以及 `GlobalTotals` / `LetterStats`。
 */
export interface LearningRecord {
  /** 主键，4 段式：content:<type>:<namespace>:<localId>（model/content.ts:9-14） */
  contentId: string
  /** 学的是该实体的哪个版本（对外学习契约号；进 ContentId 会断链，见 model/content.ts:164-166） */
  contentVersion?: number
  /** 规范化内容指纹（canonical SHA-256），与 contentVersion 互补而非冗余（model/content.ts:182-188） */
  contentChecksum?: string
  /** 版本健康度：由 §1.4 的判定规则写入，供 UI 与诊断消费 */
  freshness?: LearningFreshness
  /** SRS / 错题状态（对应旧 ReviewEntry，字段一一对应、不重算） */
  review?: LearningReview
  /** 背单词掌握状态（对应旧 MemRecord） */
  memorize?: LearningMemorize
  /** 词级学习分析（对应旧 analytics.words[k] —— **不含 letters**） */
  analytics?: LearningAnalytics
}

/** 与 reviewStore.ReviewEntry 字段完全一致 —— 迁移只改键，不改值（MIGRATION_AUDIT §4.1） */
export interface LearningReview {
  wrongCount: number
  correctStreak: number
  lastWrongAt: number
  nextReviewAt: number
  /** 0..4，索引进 INTERVALS_DAYS = [1,2,4,7,15]（reviewStore.ts:25） */
  intervalIdx: number
}

/** 与 memorizeStore.MemRecord 字段完全一致 */
export interface LearningMemorize {
  status: 'known' | 'fuzzy' | 'unknown'
  reviews: number
  lastAt: number
}

/** 对应旧 analytics.words[k]（WordStat），键由 lowercase 换成 ContentId */
export interface LearningAnalytics {
  done: number
  wrong: number
}

/**
 * 版本健康度：
 *   ok      —— contentVersion / contentChecksum 与当前内容包一致
 *   stale   —— contentVersion 落后于当前包（内容修订过），**复习记录仍有效**，只是排期依据可能过时
 *   drifted —— contentChecksum 不匹配（内容实质变了），需用户确认后才继续沿用
 *   unknown —— 旧迁移记录未写入版本三元组（`legacy:` 前缀记录永久为此态）
 */
export type LearningFreshness = 'ok' | 'stale' | 'drifted' | 'unknown'

/**
 * 新存储键的顶层形状。
 *
 * ⚠️ **为什么值是联合类型 `LearningRecord | LegacyRecord`，而不是单一 `LearningRecord`**：
 *    设计文档 §256 定版「目标主键：LearningRecord 表，key = contentId
 *    （**含** `legacy:unattributed:` | `legacy:orphan:` 前缀键）」—— 三档里的
 *    ambiguous / orphan / case-conflict **写进同一个 `gt.learning.v2` 表**，只是键前缀不同。
 *    若把值类型钉死成 `LearningRecord`，legacy 记录缺 `contentId` 就在**类型层无法表达**，
 *    要么被迫 `as unknown as`（丢掉类型保护），要么给 legacy 编造一个 contentId ——
 *    后者正是 C4「不猜」原则禁止的事。故用显式联合 + 收窄守卫（下方 `isLegacyKey` 等）。
 */
export type LearningEntry = LearningRecord | LegacyRecord

export type LearningStoreV2 = Record<string, LearningEntry> // key = contentId 或 legacy:* 前缀键

/* ---------------- §1.3 必须拆出去的两个全局聚合 ----------------
 *
 * 为什么硬塞进 LearningRecord 是错的（三条独立理由，任一条成立即可否决）：
 *  1. 语义错配：letters 的 26 个键不是 content。ContentType 共 12 个成员，
 *     没有也不应该有 'letter'；用伪 id（letter:a）是给非内容的东西套内容的外衣。
 *  2. 生命周期：letters 永不过期；而 LearningRecord 会因「毕业」被删除
 *     （reviewStore.ts:135-142）。塞进去等于让字母弱项随错题本毕业随机归零 —— 功能回归。
 *  3. 迁移语义：words 表要重建（lowercase → ContentId）；letters 表什么都不用做
 *     （键恒为小写，letter.toLowerCase() 是恒等变换）。走同一分支是多余耦合。
 */

/** 独立存储键 'gt.letterStats.v1' */
export interface LetterStats {
  /** 26 个键固定为 'a'..'z'（恒为小写，无大小写语义问题） */
  letters: Record<string, { hit: number; miss: number }>
}

/**
 * 全局聚合统计 —— 独立存储键 'gt.totals.v1'
 *
 * 这四项**天然不属于任何一条 content**：totalKeys 是击键数、totalCorrect 是正确击键数、
 * totalWords 是完成词次、bestWpm 是单轮最佳 —— 都是「跨 content 的累加量」，
 * 归属到任意一个 ContentId 上都是错的（且迁移会重复计数：一条记录只能存一份聚合）。
 */
export interface GlobalTotals {
  totalKeys: number
  totalCorrect: number
  totalWords: number
  bestWpm: number
}

/* ---------------- §2 legacy 占位记录 ---------------- */

/**
 * `legacy:unattributed:<word>` 的键格式与值格式。
 *
 * ⚠️ 为什么 `legacy:unattributed:` 前缀不可能与真实 ContentId 混淆：
 *    真实 ContentId 是 `content:<type>:<namespace>:<localId>`，**必须以 `content:` 开头**
 *    （model/content.ts:58-60 的 makeContentId 硬编码前缀）。
 *    任何 `content:` 之外的字符串，parseContentId（:63-67 的正则 `^content:...`）一律返回 null。
 *    因此 `legacy:*` 是**语法上不可达**于内容寻址的 —— 安全的隔离带。
 */
export type LegacyUnattributedKey = `legacy:unattributed:${string}`

/** `legacy:orphan:<word>`：旧记录里的词在当前词库中完全不存在 */
export type LegacyOrphanKey = `legacy:orphan:${string}`

/**
 * `legacy:case-conflict:<word>`：精确口径不命中、但小写归并命中。
 *
 * ⚠️ **这是设计缺口，不是最终定案**：设计文档 §2.8 的 `tiers` schema 把 caseConflict 与
 *    resolved/ambiguous/orphan 并列，但 §2.4.1 的伪代码把它写进了 `legacy:orphan:${word}`
 *    且 `tier:'orphan'` —— 这会让「计数里的 tier」与「数据里的 tier」永久不一致。
 *    本实现沿用 `scripts/migration-dryrun.mjs` 的选择：**独立前缀 + 不写 `tier` 字段**，
 *    避免与 orphan 混淆。此选择待设计者确认。
 */
export type LegacyCaseConflictKey = `legacy:case-conflict:${string}`

/** legacy 三档占位记录的公共形状 */
export interface LegacyRecord {
  /** 保留原词形（保留大小写）—— 大小写敏感包（go-code / ts-code）的词必须能原样恢复 */
  word: string
  /**
   * 缺失 `contentId` 字段是有意的：legacy 记录没有内容归属，写了就是编造（C4「不猜」原则）。
   *
   * 有 `tier` 的只有 orphan / ambiguous —— 与设计文档 §2.8.2 的参考实现同口径。
   * caseConflict **刻意不写 `tier`**：它会冒充「数据里的 tier」与「计数里的 tier.caseConflict」
   * 自相矛盾（设计伪代码的自相矛盾处），改用 `caseConflict: true` 显式表达。
   */
  tier?: 'orphan' | 'ambiguous'
  /** 精确口径不命中、小写归并命中时为真（§2.4.1） */
  caseConflict?: true
  candidates?: string[]
  /** caseConflict 记录可能归属的原词形清单（小写归并命中的那些） */
  candidateForms?: string[]
  reason?: 'not-in-current-vocabulary' | 'exact-miss-lower-hit'
  review?: LearningReview
  memorize?: LearningMemorize
  analytics?: LearningAnalytics
  /** legacy 记录永久为 'unknown'（§1.4） */
  freshness?: Extract<LearningFreshness, 'unknown'>
}

/* ---------------- §2.8 Migration Report ---------------- */

/** 迁移元信息：判断「是否需要迁移」与「如何回滚」的唯一依据 */
export interface MigrationMarker {
  /** 报告 schema 版本（当前 1） */
  version: number
  /** 迁移器版本，形如 'learning-migrator/1.0.0' */
  migratorVersion: string
  /** 源快照指纹：源键集合 + 每键内容摘要，幂等判定的输入 */
  sourceFingerprint: string
  migratedAt: string
  /** 回滚所需信息（§2.7） */
  rollbackToken: RollbackToken
}

export interface RollbackToken {
  id: string
  /** 旧键备份所在的新键名 */
  backupKey: string
  /** 本次迁移写入的新键列表 */
  writtenKeys: string[]
  /** 被备份的旧键列表 */
  backedUpKeys: string[]
  /** 旧键是否被保留（若为 false，回滚只能靠 backupKey） */
  legacyKeysRetained: boolean
}

/** 三档迁移结果计数 */
export interface MigrationTiers {
  resolved: number
  ambiguous: number
  orphan: number
  /** 精确口径不命中但小写归并命中；见 LegacyCaseConflictKey 的缺口说明 */
  caseConflict: number
  /** 非法键被丢弃数（不迁移、不计数进三档） */
  invalid: number
}

export interface MigrationWarning {
  code:
    | 'ANALYTICS_LOWERCASE_HIT'
    | 'INVALID_KEY_DROPPED'
    | 'CASE_CONFLICT'
    | 'DUPLICATE_SOURCE_MERGE'
    | 'CONTENT_MANIFEST_MISSING'
  message: string
  /** 涉及的具体键（样本，非全量） */
  keys?: string[]
}

export interface SourceKeyInfo {
  key: string
  present: boolean
  /** 源记录条数 */
  entries: number
  /** UTF-16 字节数（本机存储按字符 ×2 计费） */
  bytesUtf16: number
  /** 是否参与迁移（gt.streak.v1 为 false：键是日期，不含词） */
  inScope: boolean
  /** 不参与迁移的原因 */
  reason?: string
}

export interface MigrationReport {
  reportVersion: 1
  migratorVersion: string
  runtime: 'browser' | 'cli'
  startedAt: string
  finishedAt: string
  durationMs: number
  /** 与 durationMs 同口径的精确值（取整导致亚毫秒精度丢失，这里保留原值） */
  durationMsExact: number
  source: 'user-store' | 'browser' | 'synthetic'
  sourceDetail: string
  tiers: MigrationTiers
  sourceKeys: SourceKeyInfo[]
  /** 迁移后各目标键的 UTF-16 字节数（含备份键） */
  targetSizes: Record<string, number>
  /** 幂等性证据（§2.6）：第二次必须产出 0 个待写项 */
  idempotentProof: {
    asserted: boolean
    method: string
    /** 第二次运行产出的待写项数，必须为 0 */
    secondRunWrites: number
    deterministicNext: boolean
    byteIdentical: boolean
    nextSha256: string
    reportSha256: string
    identicalIncludingTimestamps: boolean
    note: string
  }
  warnings: MigrationWarning[]
  rollbackToken: RollbackToken
  /** 样本（前若干条），全量在同目录 jsonl 产物里 */
  orphanWords: string[]
  ambiguousWords: string[]
  /** 迁移因缺输入而不可执行时的说明；dry-run 与浏览器迁移恒为 null */
  orphanUnavailableReason: string | null
  outcome: 'ok' | 'degraded' | 'skipped'
}

/* ---------------- 收窄守卫（联合类型的判别手段） ----------------
 *
 * 为什么单独有这一节：`gt.learning.v2` 一张表里混装两种记录（见 `LearningStoreV2` 的注释），
 * 消费方必须能**一行判明**手上的值属于哪一档。没有守卫 ⇒ 消费方各写各的 `'contentId' in v`，
 * 判据必然漂移（这正是 §3.3 把 `validate` 从 `decode` 里独立出来的同一个理由）。
 *
 * 键空间互斥性由 C-1 保证：真实 ContentId **恒以 `content:` 开头**（`makeContentId` 硬编码），
 * legacy 键恒以 `legacy:` 开头 ⇒ 只看前缀即可判别，无需读值。
 */

/** 该键是否为 legacy 占位键（`legacy:unattributed:*` / `legacy:orphan:*` / `legacy:case-conflict:*`） */
export function isLegacyKey(key: string): boolean {
  return key.startsWith('legacy:')
}

/** 值是否为「有内容归属」的正式学习记录（有 contentId ⇒ 一定不是 legacy 占位） */
export function isLearningRecord(v: LearningEntry): v is LearningRecord {
  return typeof (v as LearningRecord).contentId === 'string'
}

/** 值是否为 legacy 占位记录（无内容归属，只有原词形 word） */
export function isLegacyRecord(v: LearningEntry): v is LegacyRecord {
  return typeof (v as LearningRecord).contentId !== 'string'
}

/** 从联合表取出**正式**学习记录（自动跳过 legacy 占位）—— UI 遍历时的默认口径 */
export function attributedEntries(store: LearningStoreV2): [string, LearningRecord][] {
  return Object.entries(store).filter((e): e is [string, LearningRecord] => isLearningRecord(e[1]))
}

/** 从联合表取出 legacy 占位记录 —— 「未归属」分区专用 */
export function legacyEntries(store: LearningStoreV2): [string, LegacyRecord][] {
  return Object.entries(store).filter((e): e is [string, LegacyRecord] => isLegacyRecord(e[1]))
}

/* ---------------- 迁移输入/输出 ---------------- */

/** 本机存储全量导出形态：键名 → 原始字符串（可能缺键、可能为 null） */
export type RawStoreDump = Record<string, string | null | undefined>

/** analytics 键解析后的形状（四个全局标量 + words / letters 两个子表） */
export interface AnalyticsSnapshot {
  words: Record<string, unknown>
  letters: Record<string, unknown>
  totalKeys: number
  totalCorrect: number
  totalWords: number
  bestWpm: number
}

/**
 * v1 快照（**已解析**对象形态）—— `migrateV1toV2` 的入参。
 *
 * ⚠️ 为什么入参是解析后的对象而不是原始字符串：迁移逻辑要的是**语义**（这张表有哪些词、
 *    letters 里 hit 是多少），不是字节。把 JSON.parse 放在 `splitSnapshot` 里做，
 *    migrateV1toV2 才能保持「输入即业务对象」，也才能在 Node（无本机存储）里被单测与
 *    dry-run 复用 —— 这正是 §2.8.2 对参考实现的要求。
 */
export interface SplitSnapshot {
  review: Record<string, unknown>
  memorize: Record<string, unknown>
  analytics: AnalyticsSnapshot
  /** gt.customBanks.v1 —— 自建词库数组（§2.1.1 只建索引，不迁学习记录） */
  customBanks: unknown
}

/** 自建词库索引条目（§2.1.1：迁移只建索引，**不迁**自建库的学习记录） */
export interface CustomBankIndexEntry {
  bankId: string
  namespace: string
  words: string[]
  createdAt: number
}

/** 内容侧能力：让 migrateV1toV2 保持纯函数（可注入、可测、无 I/O） */
export interface ContentPackageInfo {
  /** 4 段式 ContentId 的第三段 */
  namespace: string
  contentVersion?: number
  contentChecksum?: string
}

/**
 * 内容侧能力 —— 形状与设计文档 §2.8.2 参考实现（scripts/migration-dryrun.mjs）**同源**。
 *
 * ⚠️ 为什么以「包 id」而不是「namespace」为键：`contentVersion` 是**按包**登记的
 *    （[实测] 10 包里有 contentVersion=1 与 =2 两种取值），同一个 namespace 未必能唯一定位
 *    一个版本三元组。用 pkgId 取 info 再取 namespace，是唯一不丢信息的方向。
 */
export interface ContentProvider {
  /** pkgId → 该包的 namespace 与版本三元组 */
  pkgInfo(pkgId: string): ContentPackageInfo | null
  /** 原词形 → 它出现在哪些包里（大小写敏感；数量决定 resolved / ambiguous / orphan） */
  wordToPkgs(word: string): string[] | null
  /** lowercase → 内容侧所有同 lowercase 的**原词形**（用于 analytics 的 lowercase 回推） */
  lowerToForms(lowerWord: string): Iterable<string> | null
  /** 额外兜底：本地 id 能否构成合法 ContentId（可选） */
  isValidLocalId?(localId: string): boolean
}

/** 迁移产出：待写项 + 报告。调用方负责把它落盘（apply 阶段），本文件不碰本机存储 */
export interface MigrationResult {
  next: {
    /** —— 键名与设计文档 §4 apply 伪代码逐字一致（`result.next.learning`）—— */
    learning: LearningStoreV2
    letterStats: LetterStats
    totals: GlobalTotals
    customBankIndex: Record<string, CustomBankIndexEntry>
    marker: MigrationMarker
    /** 旧键备份（回滚用） */
    backup: Record<string, unknown>
  }
  /** 待写的新键名列表；幂等命中时为空数组 */
  pendingWrites: string[]
  report: MigrationReport
  skipped: boolean
  skipReason?: string
}
