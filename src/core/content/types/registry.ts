/* P1.8-A · Content Type Contract —— **类型的唯一事实源**（P1.8-PLAN v1.0 §2）。
 *
 * 为什么要有这个文件（评审意见 ②）：
 *   没有它，每加一种内容类型就会分叉出一套平行架构（`audio.ts` / `reading.ts` / … 各自定义
 *   字段、各自校验、各自查询适配），几个阶段后就无法收拾。
 *   有了它，**新增类型的完整动作 = 在本注册表里加一条描述**，不需要改 Query / Index / UI 骨架。
 *
 * 六段一致（本文件是前两段的落点，后四段从它派生）：
 *   Content Type → Schema → Validator → Query Adapter → Learning Adapter → UI Consumer
 *        ↑           ↑          ↑             ↑                ↑                ↑
 *    本注册表    fields[]  (P18-B)    query.* (P18-E)   learning.*(P18-E)   i18n.* (本 Wave)
 *
 * 两个正交开关（刻意分开，别合并成一个 `status`）：
 *   packageRegistered —— 该类型**已有内容包**（含仅作结构探针的 demo 包）
 *   queryEnabled      —— 该类型**条目可被 Query 检索**
 *   现状：`word` 与 `reading` 可查询（查询层 SUPPORTED_TYPES 由 queryEnabledTypes() 派生，
 *   不再自带第二份清单），其余类型仍是"包在、查不到"。
 *   P18-E 起**逐类型**把 queryEnabled 翻成 true，每次一个类型、各自出证据；
 *   「放开」= 启用集 / 包路由 / 索引 / 结果形状四段齐备，缺一段由门判红（裁定 §⑨-2）。
 *   两个开关分开，是为了让"包存在"与"能查询"这两件事在证据里可分辨 —— 别用一句话糊过去。
 *
 * 不变量（由 scripts/gate-content-type-contract.mjs 机器校验，INV-6）：
 *   1. 本注册表必须**穷尽** ContentType 联合的每个成员（漏一个即 FAIL）
 *   2. `src/core/content/model/` 下不得出现 per-type 散落文件（白名单之外即 FAIL）
 *   3. 本文件引用的 i18n 键必须同时存在于 zh.ts 与 en.ts
 *   4. 包级类型集合必须与 catalog 的 PLANNED_TYPES 一致
 *   5. queryEnabled 集合必须与 content-query.ts 实际启用的类型集合一致（防"注册了但查不到"）
 */
import type { ContentType } from '../model/content'
import type { AssetKind } from '../model/asset'

/**
 * 内容类型的**运行时可枚举**清单。
 *
 * 为什么需要它：`ContentType` 是 TS 类型联合，**运行时不存在**，无法在门禁脚本里遍历。
 * 但只加一个数组就会立刻产生"联合与数组各说各话"的新重复源，所以这里用**双向编译期约束**锁死：
 *
 *   ① 数组 ⊆ 联合 —— `as const satisfies readonly ContentType[]`（多写一个不存在的类型即编译报错）
 *   ② 联合 ⊆ 数组 —— `AssertNever<Exclude<ContentType, 数组元素>>`（漏写一个成员即编译报错）
 *
 * 于是"漏类型"这件事在 `tsc` 阶段就红了，不必等门禁脚本。
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

/* ② 联合 ⊆ 数组：若 ContentType 有成员未出现在 CONTENT_TYPES，Exclude 结果非 never → 编译报错。
 * 纯编译期约束、无运行时代码；导出仅为满足 noUnusedLocals（不导出会被 TS6133 判为未使用）。
 * 证伪方式：往 ContentType 联合里加一个成员而不同步 CONTENT_TYPES，`tsc -b` 即红。 */
export type TypeListExhaustive = AssertNever<Exclude<ContentType, (typeof CONTENT_TYPES)[number]>>

/** 载荷字段的形态（校验器据此做必填/类型检查，P18-B 落地执行） */
export type FieldKind = 'string' | 'number' | 'boolean' | 'string[]' | 'asset' | 'asset[]' | 'object'

export interface FieldSpec {
  name: string
  /** 缺失即 FAIL（P18-B 的校验器执行；本 Wave 只声明） */
  required: boolean
  kind: FieldKind
  /** 说明（用于文档与错误信息） */
  note?: string
}

/** 索引维度：`exact` 走倒排（O(命中数)），`prefix`/`substring` 走扫描（当前是性能热点） */
export interface IndexFieldSpec {
  field: string
  mode: 'exact' | 'prefix' | 'substring'
}

/** 学习消费适配（P18-E 接线；本 Wave 只声明意图） */
export interface LearningAdapter {
  /**
   * 进度语义：
   *   word  —— 逐词 SRS（当前唯一实现）
   *   media —— 按媒体资产推进（音频/视频播放进度）
   *   unit  —— 按单元完成度（课程/章节/Lesson）
   */
  progressKind: 'word' | 'media' | 'unit'
}

export interface ContentTypeDescriptor {
  type: ContentType
  /** 类型维度文案（**禁止**再拿 `bank.*` 的词库语义硬套到听力/阅读上） */
  i18n: { labelKey: string; unitKey: string }
  /** 该类型的条目级 ContentId 用哪个 type 段（vocabulary 的条目是 word，其余同名） */
  itemType: ContentType
  /** 是否属"内容包"维度（false = 条目级类型，不出现在 Catalog 的类型列表里） */
  packageLevel: boolean
  /** 已有内容包（含结构探针 demo，见 catalog.ts 的诚实原则） */
  packageRegistered: boolean
  /** 条目可被 Query 检索（P18-E 逐类型开启） */
  queryEnabled: boolean
  /** 载荷字段模型 */
  fields: FieldSpec[]
  /** 该类型是否必须有资产（如 audio 必须有音频文件） */
  assets: { required: AssetKind[]; optional: AssetKind[] }
  /** 检索适配：由 P18-E 的 index/query 派生消费，勿在别处另写一份 */
  query: { index: IndexFieldSpec[]; match: IndexFieldSpec[]; sort: string[] }
  learning?: LearningAdapter
  note?: string
}

/** 所有内容类型共有的条目字段（id 是本地键，不是 4 段式 ContentId） */
const ID_FIELD: FieldSpec = { name: 'id', required: true, kind: 'string', note: '包内本地 id（稳定，不得随展示文本变化）' }
const TITLE_FIELD: FieldSpec = { name: 'title', required: true, kind: 'string' }

/** 词汇类条目字段（vocabulary 包内的条目 / word 条目级类型共用同一形状） */
const VOCAB_ITEM_FIELDS: FieldSpec[] = [
  { name: 'word', required: true, kind: 'string', note: '保留原词形（C-6：不得 lowercase）' },
  { name: 'translation', required: true, kind: 'string' },
  { name: 'phonetic', required: false, kind: 'string' },
  { name: 'definition', required: false, kind: 'string' },
]

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

/**
 * 注册表的**唯一**数据。新增类型 = 在这里加一条（不要新建 per-type 文件）。
 * 顺序与 ContentType 联合保持一致，便于人读比对。
 */
export const CONTENT_TYPE_REGISTRY: Readonly<Record<ContentType, ContentTypeDescriptor>> = {
  word: {
    type: 'word',
    i18n: { labelKey: 'type.word.label', unitKey: 'type.word.unit' },
    itemType: 'word',
    packageLevel: false, // 条目级类型：词条不属于任何包的子类型，不进 Catalog 类型列表
    packageRegistered: true,
    queryEnabled: true, // ← 当前唯一可查询的**条目级**类型（vocabulary 的条目也走它）
    fields: VOCAB_ITEM_FIELDS,
    assets: { required: [], optional: ['audio'] },
    query: VOCAB_QUERY,
    learning: { progressKind: 'word' },
  },
  vocabulary: {
    type: 'vocabulary',
    i18n: { labelKey: 'type.vocabulary.label', unitKey: 'type.vocabulary.unit' },
    itemType: 'word',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false, // 包级类型本身不直接可查；其条目以 `word` 类型被查询
    fields: VOCAB_ITEM_FIELDS,
    assets: { required: [], optional: ['audio'] },
    query: VOCAB_QUERY,
    learning: { progressKind: 'word' },
    note: '包级容器类型；条目级查询走 itemType=word。10 个词汇包 = 9346 词。',
  },
  listening: {
    type: 'listening',
    i18n: { labelKey: 'type.listening.label', unitKey: 'type.listening.unit' },
    itemType: 'listening',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'transcript', required: false, kind: 'string' },
      { name: 'segments', required: false, kind: 'object', note: '逐句时间轴（P18-B 定形；本 Wave 不实现）' },
      { name: 'speaker', required: false, kind: 'string' },
      { name: 'durationSec', required: false, kind: 'number' },
    ],
    assets: { required: ['audio'], optional: ['subtitle', 'image'] },
    query: {
      index: [{ field: 'id', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'transcript', mode: 'substring' }],
      sort: ['relevance', 'title'],
    },
    learning: { progressKind: 'media' },
  },
  audio: {
    type: 'audio',
    i18n: { labelKey: 'type.audio.label', unitKey: 'type.audio.unit' },
    itemType: 'audio',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'durationSec', required: false, kind: 'number' },
      { name: 'transcript', required: false, kind: 'string' },
    ],
    assets: { required: ['audio'], optional: ['subtitle'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'media' },
  },
  reading: {
    type: 'reading',
    i18n: { labelKey: 'type.reading.label', unitKey: 'type.reading.unit' },
    itemType: 'reading',
    packageLevel: true,
    packageRegistered: true,
    // P18-E 首个放开的非 word 类型（放开 = 启用集 / 包路由 / 索引 / 结果形状四段齐备）
    queryEnabled: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'body', required: false, kind: 'string', note: 'P18-B 起对该类型转必填' },
      { name: 'paragraphs', required: false, kind: 'string[]' },
      { name: 'questions', required: false, kind: 'object' },
    ],
    assets: { required: [], optional: ['image', 'audio'] },
    query: {
      index: [{ field: 'id', mode: 'exact' }],
      match: [{ field: 'title', mode: 'substring' }, { field: 'body', mode: 'substring' }],
      sort: ['relevance', 'title'],
    },
    learning: { progressKind: 'unit' },
  },
  topic: {
    type: 'topic',
    i18n: { labelKey: 'type.topic.label', unitKey: 'type.topic.unit' },
    itemType: 'topic',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'description', required: false, kind: 'string' }],
    assets: { required: [], optional: ['image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
  },
  exercise: {
    type: 'exercise',
    i18n: { labelKey: 'type.exercise.label', unitKey: 'type.exercise.unit' },
    itemType: 'exercise',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'questions', required: false, kind: 'object' }],
    assets: { required: [], optional: ['audio', 'image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
  },
  writing: {
    type: 'writing',
    i18n: { labelKey: 'type.writing.label', unitKey: 'type.writing.unit' },
    itemType: 'writing',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'prompt', required: false, kind: 'string' },
      { name: 'sample', required: false, kind: 'string' },
      { name: 'wordLimit', required: false, kind: 'number' },
    ],
    assets: { required: [], optional: ['image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'unit' },
  },
  speaking: {
    type: 'speaking',
    i18n: { labelKey: 'type.speaking.label', unitKey: 'type.speaking.unit' },
    itemType: 'speaking',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'prompt', required: false, kind: 'string' },
      { name: 'sample', required: false, kind: 'string' },
    ],
    assets: { required: [], optional: ['audio'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'unit' },
  },
  grammar: {
    type: 'grammar',
    i18n: { labelKey: 'type.grammar.label', unitKey: 'type.grammar.unit' },
    itemType: 'grammar',
    packageLevel: true,
    packageRegistered: false, // 尚无包（catalog 诚实报 0）
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'explanation', required: false, kind: 'string' },
      { name: 'examples', required: false, kind: 'string[]' },
    ],
    assets: { required: [], optional: [] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'unit' },
  },
  document: {
    type: 'document',
    i18n: { labelKey: 'type.document.label', unitKey: 'type.document.unit' },
    itemType: 'document',
    packageLevel: true,
    packageRegistered: false,
    queryEnabled: false,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'summary', required: false, kind: 'string' }],
    assets: { required: ['document'], optional: ['image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
  },
  collection: {
    type: 'collection',
    i18n: { labelKey: 'type.collection.label', unitKey: 'type.collection.unit' },
    itemType: 'collection',
    packageLevel: true,
    packageRegistered: true,
    queryEnabled: false,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'description', required: false, kind: 'string' }],
    assets: { required: [], optional: [] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    note: '集合靠 relation 层描述成员关系（relations.json），不在此内联成员列表。',
  },
  course: {
    type: 'course',
    i18n: { labelKey: 'type.course.label', unitKey: 'type.course.unit' },
    itemType: 'course',
    packageLevel: true,
    packageRegistered: false, // P18-A 新增类型：契约先立，内容后进
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'description', required: false, kind: 'string' },
      { name: 'level', required: false, kind: 'string' },
      { name: 'lessonIds', required: false, kind: 'string[]', note: 'lesson 的本地 id 列表；顺序即课程顺序' },
    ],
    assets: { required: [], optional: ['image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'unit' },
    note: 'P18-A 新增。课程 → lesson → 条目 的三级结构，成员关系用 lessonIds / relation 表达。',
  },
  lesson: {
    type: 'lesson',
    i18n: { labelKey: 'type.lesson.label', unitKey: 'type.lesson.unit' },
    itemType: 'lesson',
    packageLevel: true,
    packageRegistered: false,
    queryEnabled: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'order', required: false, kind: 'number', note: '课内顺序（1-based）' },
      { name: 'courseId', required: false, kind: 'string' },
      { name: 'itemIds', required: false, kind: 'string[]' },
    ],
    assets: { required: [], optional: ['audio', 'image'] },
    query: { index: [{ field: 'id', mode: 'exact' }], match: [{ field: 'title', mode: 'substring' }], sort: ['relevance', 'title'] },
    learning: { progressKind: 'unit' },
    note: 'P18-A 新增。Lesson 是学习单元（不直接承载媒体），媒体挂在 lesson 的条目上。',
  },
}

/* ------------------------------------------------------------------ *
 * 派生（消费者只读这些，不要各自遍历注册表）
 * ------------------------------------------------------------------ */

/** 条目可被 Query 检索的类型集合（P18-E 接线时由 query 层消费） */
export function queryEnabledTypes(): ContentType[] {
  return (Object.keys(CONTENT_TYPE_REGISTRY) as ContentType[]).filter((t) => CONTENT_TYPE_REGISTRY[t].queryEnabled)
}

/** 包级类型集合（= Catalog 的类型维度应列出的类型） */
export function packageLevelTypes(): ContentType[] {
  return (Object.keys(CONTENT_TYPE_REGISTRY) as ContentType[]).filter((t) => CONTENT_TYPE_REGISTRY[t].packageLevel)
}

/** 取类型描述；未知类型返回 null（不抛异常，调用方决定 fallback） */
export function descriptorOf(type: string): ContentTypeDescriptor | null {
  return (CONTENT_TYPE_REGISTRY as Record<string, ContentTypeDescriptor>)[type] ?? null
}

/** 该类型条目的 ContentId type 段 */
export function itemTypeOf(type: ContentType): ContentType {
  return CONTENT_TYPE_REGISTRY[type].itemType
}
