/**
 * P1.5 · `Codec<T>` —— 领域对象 ⇄ localStorage 字符串的编解码 + 形状校验
 *
 * 设计依据：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md` §3.3
 *   （`Codec<T>` 接口 + `mapCodec` / `arrayCodec` / `typedStore` / `TypedStore<T>`
 *    + §3.3 表格的「校验钩子的具体实现要求」）
 *
 * 为什么需要它（§3.3 原文）：现状 5 个 store 各自 `JSON.parse` / `JSON.stringify`，
 * 且只有 `reviewStore` 做了形状校验（`reviewStore.ts:36` 的
 * `typeof parsed === 'object' && !Array.isArray(parsed)`），其余 4 个
 * **直接把 parse 结果 cast 成目标类型**：
 *   - `memorizeStore.ts:22` → `JSON.parse(raw) as MemStore`
 *   - `streak.ts:28` → `JSON.parse(raw) as History`
 *   - `customBanks.ts:15` → `JSON.parse(raw) as CustomBank[]`
 *   - `analytics.ts:39` 的 `{ ...EMPTY, ...parsed }` **更危险**：数组 spread 进去会得到数字键的怪对象
 *
 * ⚠️ **本文件是纯新增**（G4-5 的实现基座）。上面的 4 个 v1 store 的**结构性改造**
 *    一个都不做（它们是 v1，§3.5 的 S3–S6 冻结中）；仅按 G4-3 补了失败留痕
 *    （console.warn，不改控制流）。这里定义的 codec 供 v2 新键使用 ——
 *    `storage.ts` 的 `loadLearningV2` 已是它的第一个真实消费者。
 */

/* ===========================================================================
 * §3.3 —— Codec<T>
 * ========================================================================= */

/**
 * 编码器：把「领域对象」与「localStorage 里的一串字符」互相转换。
 *
 * 三条硬约束（§3.3）：
 *   ① `decode` **必须自己做形状校验**，不合法返回 `null`（**不抛**）。
 *   ② `validate` 是**独立的**合法性谓词（供写入前自检与读取后诊断**复用**）——
 *      不要把校验逻辑只写在 `decode` 里，否则写入侧无法复用同一判据（必然漂移）。
 *   ③ `empty()` 必须**每次返回新对象**，不能共享引用。
 *      反例：`analytics.ts:27-34` 的 `EMPTY` 是模块级常量，`loadAnalytics()` 在
 *      `raw` 为空时**直接返回它** —— 调用方一旦就地改这个对象，就污染了全局默认值。
 */
export interface Codec<T> {
  /** 领域对象 → 字符串 */
  encode(value: T): string
  /** 字符串 → 领域对象；**必须自己做形状校验**，不合法返回 null（不抛） */
  decode(raw: string): T | null
  /** 独立的合法性谓词（供写入前自检与读取后诊断复用） */
  validate(value: unknown): value is T
  /** 空值（键不存在时的默认值）—— 必须是**新对象**，不能共享引用 */
  empty(): T
}

/* ===========================================================================
 * 形状工具
 * ========================================================================= */

/** 是否普通对象（非 null、非数组）—— `analytics.ts:39` 缺陷的根治点 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 是否有限数字（排除 NaN / Infinity —— 它们 `JSON.stringify` 后会变成 `null`） */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 取数字，非有限数字则回落默认值 */
export function numOr(v: unknown, fallback: number): number {
  return isFiniteNumber(v) ? v : fallback
}

/* ===========================================================================
 * §3.3 —— mapCodec / arrayCodec
 * ========================================================================= */

/**
 * 简单 `Record<string, V>` 表的通用 codec 工厂（覆盖 4 个 store 的主形状）。
 *
 * ⚠️ **单条非法项的处置（§3.3 的硬约束）**：丢弃该条并**继续**（返回合法子集），
 *    而不是整表判废。理由：合成数据里存在注入的非法键（空串 / `'   '` / 超长），
 *    真实用户的库里同样可能有历史脏数据。整表判废 = **因为一条脏数据丢掉整本错题本**，
 *    这是最坏的用户体验。
 *
 * 被丢弃的条目通过 `onDropped` 回调上报（调用方接 diag），本工厂**不自己写 diag** ——
 * 保持 codec 是纯函数，便于单测（§2.8.2 的同一原则：纯函数才可测、才能被 dry-run 复用）。
 */
export function mapCodec<V>(
  validateEntry: (v: unknown) => v is V,
  onDropped?: (droppedKeys: string[]) => void,
): Codec<Record<string, V>> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      // 数组也是 object，但**不是表** —— 这行是 `analytics.ts:39` 缺陷的同源防线
      if (!isPlainObject(parsed)) return null
      const out: Record<string, V> = {}
      const dropped: string[] = []
      for (const [k, v] of Object.entries(parsed)) {
        if (validateEntry(v)) out[k] = v
        else dropped.push(k)
      }
      if (dropped.length && onDropped) onDropped(dropped)
      return out
    },
    validate: (value): value is Record<string, V> => {
      if (!isPlainObject(value)) return false
      return Object.values(value).every(validateEntry)
    },
    // 每次返回**新对象**（§3.3 硬约束 ③）
    empty: () => ({}),
  }
}

/**
 * 数组 codec（`gt.customBanks.v1` 用）。
 * 与 `mapCodec` 同原则：非法项**逐项丢弃并继续**，不整表判废。
 */
export function arrayCodec<T>(
  validateItem: (v: unknown) => v is T,
  onDropped?: (droppedCount: number) => void,
): Codec<T[]> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      if (!Array.isArray(parsed)) return null
      const out = parsed.filter(validateItem)
      if (out.length !== parsed.length && onDropped) onDropped(parsed.length - out.length)
      return out
    },
    validate: (value): value is T[] => Array.isArray(value) && value.every(validateItem),
    empty: () => [],
  }
}

/* ===========================================================================
 * §3.3 —— typedStore / TypedStore<T>
 * ========================================================================= */

/**
 * Quota 策略（§3.4 问题 2）。
 *
 * 为什么 `QuotaPolicy` 是**可选**的：`[实测]` S7 满配仅占真实配额 28.19%，
 * 撞不到 Quota。把熔断逻辑复制到每个 store 是**纯粹的复杂度负担且没有对应收益**。
 * 当前只有 `gt.learning.v2`（与旧的 `gt.review.v1`）需要它。
 */
export interface QuotaPolicy<T> {
  /** QuotaExceeded 时，从 value 里挑出「可以丢」的条目 —— 返回新的 value + 丢了几个 */
  evict(value: T): { next: T; evicted: number }
  /** 最多几轮（reviewStore.ts:52 的 QUOTA_ROUNDS = 3） */
  rounds: number
  /** 本轮刚写入、**绝不能丢**的条目（reviewStore.ts:66 的 protectedKey） */
  protectedKey?: string
}

/** 写入结果（§3.2）——**取代现有 4 处静默 catch 与 1 处 console.warn** */
export interface CodecSaveResult {
  ok: boolean
  /** 熔断时被清洗的条目数（沿用 reviewStore.SaveResult 的语义，reviewStore.ts:45-49） */
  evicted: number
  /** 失败原因（ok=true 时为 null）。'quota' 与 'other' 必须区分 —— 前者可熔断，后者不可 */
  reason: 'quota' | 'serialize' | 'unavailable' | 'other' | null
  /** 失败时的原始错误（供 diag 上报；不上抛，避免炸渲染） */
  error?: unknown
}

/** 读取结果：区分「没数据」与「数据坏了」—— 这是现状最大的盲区 */
export type LoadResult<T> =
  | { ok: true; value: T; present: boolean } // present=false 表示键不存在
  | { ok: false; reason: 'corrupt' | 'unavailable'; raw?: string }

/**
 * 由 `Codec<T>` + 键名组成一个带类型的存储句柄（§3.3）。
 *
 * `inspect()` 的存在理由：诊断场景需要同时看到「原始字符串 / 解码结果 / 是否合法」
 * 三者。只看解码结果无法区分「键不存在」与「键存在但坏了」——
 * 而这正是 §3.2 的 `LoadResult` 要消灭的盲区。
 */
export interface TypedStore<T> {
  key: string
  load(): T
  save(value: T): CodecSaveResult
  /** 读原始值 + 解码结果，供诊断使用 */
  inspect(): { raw: string | null; decoded: T | null; valid: boolean }
}
