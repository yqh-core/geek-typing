/* P18-E′ · Content Type Registry —— **运行时薄表**（裁定 §⑫）。
 *
 * 为什么要有它（P18-E 的实测教训）：
 *   P18-E 把「包路由 / 扫描字段由 descriptor.query 派生」落地后，查询层必须在 runtime 读注册表，
 *   `types/registry.ts` 的**全表**（含 i18n / learning / packageLevel 富元数据）因此进了主包，
 *   主 chunk raw 424.25 → 432.15 KiB（+7.90）。而实测那些富字段在 `src/` 内**零运行时消费者**
 *   （唯一真实消费者是 Node 侧门禁脚本，不进 bundle）⇒ 那 7.90 KiB 是纯死重。
 *
 * 于是把「运行时真正要用的那几个字段」投影出来单独成表：
 *   本文件 = **运行时面**（进 bundle）：type / itemType / queryEnabled / query
 *   registry.ts = **全量面**（门禁 / 文档消费）：富元数据 + 由本表展开派生
 *
 * 单一事实源的方向是**单向**的：registry.ts 的全表由 `CONTENT_TYPE_CORE` 展开派生，
 * 结构上不可能出现「两份清单各说各话」；分家这件事由 `scripts/gate-content-type-contract.mjs`
 * 的判据 J（键集合三者相等 + 逐值相等 + 非空反向守卫）机器守住。
 *
 * ⚠️ 本文件**不得**再长回 i18n / learning / packageLevel —— 那等于把裁掉的死重又请回主包。
 *    需要富元数据的地方请从 `types/registry.ts` 取（它在门禁侧，不进 bundle）。
 */
import type { ContentType } from '../model/content'

/**
 * 内容类型的**运行时可枚举**清单（唯一定义；registry.ts 只是 re-export）。
 *
 * 双向编译期约束（详见 registry.ts 的历史注释，这里逐字保留）：
 *   ① 数组 ⊆ 联合 —— `as const satisfies readonly ContentType[]`
 *   ② 联合 ⊆ 数组 —— `AssertNever<Exclude<ContentType, 数组元素>>`
 */
export const CONTENT_TYPES = [
  'word',
  'vocabulary',
  'listening',
  'audio',
  'reading',
  'topic',
  'exercise',
  'writing',
  'speaking',
  'grammar',
  'document',
  'collection',
  'course',
  'lesson',
] as const satisfies readonly ContentType[]

type AssertNever<T extends never> = T

/* ② 联合 ⊆ 数组：漏写一个成员即编译报错。纯编译期约束、无运行时代码。
 * 证伪方式：往 ContentType 联合里加成员而不同步 CONTENT_TYPES，`tsc -b` 即红。 */
export type TypeListExhaustive = AssertNever<Exclude<ContentType, (typeof CONTENT_TYPES)[number]>>

/** 索引维度：`exact` 走倒排（O(命中数)），`prefix`/`substring` 走扫描（当前是性能热点） */
export interface IndexFieldSpec {
  field: string
  mode: 'exact' | 'prefix' | 'substring'
}

/**
 * 运行时刻画一个内容类型所需的**全部**字段（P18-E′ 投影面）。
 * 只这 4 个 —— 富元数据（i18n / learning / packageLevel / fields / assets …）一律在
 * `types/registry.ts`，那里是全量面。
 */
export interface ContentTypeCoreDescriptor {
  type: ContentType
  /** 该类型的条目级 ContentId 用哪个 type 段（vocabulary 的条目是 word，其余同名） */
  itemType: ContentType
  /** 条目可被 Query 检索（P18-E 逐类型开启） */
  queryEnabled: boolean
  /** 检索适配：由 P18-E 的 index/query 派生消费，勿在别处另写一份 */
  query: { index: IndexFieldSpec[]; match: IndexFieldSpec[]; sort: string[] }
}

const VOCAB_QUERY = {
  index: [{ field: 'word', mode: 'exact' as const }],
  match: [
    { field: 'word', mode: 'prefix' as const },
    { field: 'translation', mode: 'substring' as const },
    // 声明补齐（P18-E）：rank2 一直也匹配 definition（旧实现里是硬编码判断），
    // 只是本清单漏写 ⇒ 「声明少一条」的漂移。查询层改成由本清单派生后，声明必须与行为一致。
    { field: 'definition', mode: 'substring' as const },
  ],
  sort: ['relevance', 'word'],
}

/** 非 word 条目的**默认**检索声明（`id` 精确 + `title` 子串）。
 *  与 `VOCAB_QUERY` 同一口径：模块私有常量、不导出、只被下面的表引用 —— 既是单一声明
 *  （改一处即全部生效），也让主包里只留一份字面量（P18-E′ 体积）。 */
const ITEM_QUERY = {
  index: [{ field: 'id', mode: 'exact' as const }],
  match: [{ field: 'title', mode: 'substring' as const }],
  sort: ['relevance', 'title'],
}

/**
 * 运行时的**唯一**类型数据源。新增类型 = 在这里加一条 + 在 registry.ts 补富元数据。
 * 顺序与 ContentType 联合 / CONTENT_TYPES 保持一致，便于人读比对。
 *
 * ⚠️ 这里每一个字段都会被 registry.ts 展开继承 —— 改这里等于同时改两边（判据 J 守着）。
 */
export const CONTENT_TYPE_CORE: Readonly<Record<ContentType, ContentTypeCoreDescriptor>> = {
  word: {
    type: 'word',
    itemType: 'word',
    queryEnabled: true, // ← 当前唯一可查询的**条目级**类型（vocabulary 的条目也走它）
    query: VOCAB_QUERY,
  },
  vocabulary: {
    type: 'vocabulary',
    itemType: 'word',
    queryEnabled: false, // 包级类型本身不直接可查；其条目以 `word` 类型被查询
    query: VOCAB_QUERY,
  },
  listening: {
    type: 'listening',
    itemType: 'listening',
    queryEnabled: false,
    query: {
      index: [{ field: 'id', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'transcript', mode: 'substring' }],
      sort: ['relevance', 'title'],
    },
  },
  audio: {
    type: 'audio',
    itemType: 'audio',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  reading: {
    type: 'reading',
    itemType: 'reading',
    // P18-E 首个放开的非 word 类型（放开 = 启用集 / 包路由 / 索引 / 结果形状四段齐备）
    queryEnabled: true,
    query: {
      index: [{ field: 'id', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'body', mode: 'substring' }],
      sort: ['relevance', 'title'],
    },
  },
  topic: {
    type: 'topic',
    itemType: 'topic',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  exercise: {
    type: 'exercise',
    itemType: 'exercise',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  writing: {
    type: 'writing',
    itemType: 'writing',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  speaking: {
    type: 'speaking',
    itemType: 'speaking',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  grammar: {
    type: 'grammar',
    itemType: 'grammar',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  document: {
    type: 'document',
    itemType: 'document',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  collection: {
    type: 'collection',
    itemType: 'collection',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  course: {
    type: 'course',
    itemType: 'course',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
  lesson: {
    type: 'lesson',
    itemType: 'lesson',
    queryEnabled: false,
    query: ITEM_QUERY,
  },
}

/* ------------------------------------------------------------------ *
 * 派生（运行时消费者只读这些）
 * ------------------------------------------------------------------ */

/** 条目可被 Query 检索的类型集合（P18-E 接线时由 query 层消费） */
export function queryEnabledTypes(): ContentType[] {
  return (Object.keys(CONTENT_TYPE_CORE) as ContentType[]).filter((t) => CONTENT_TYPE_CORE[t].queryEnabled)
}

/** 取类型的运行时描述；未知类型返回 null（不抛异常，调用方决定 fallback） */
export function descriptorOf(type: string): ContentTypeCoreDescriptor | null {
  return (CONTENT_TYPE_CORE as Record<string, ContentTypeCoreDescriptor>)[type] ?? null
}
