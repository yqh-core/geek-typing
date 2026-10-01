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
 * ⚠️ P18-E′（裁定 §⑫）：本文件是**全量面**（含 i18n / learning / packageLevel 富元数据），
 *   真实消费者是 Node 侧门禁脚本 —— **不进 bundle**。运行时（查询层 / 索引层）只读
 *   `types/registry-core.ts` 的薄表。
 *   两个面的关系是**单向派生**：本表的 type / itemType / queryEnabled / query 一律由
 *   `CONTENT_TYPE_CORE` 展开继承（下面每条都是 `{ ...CONTENT_TYPE_CORE.x, …富元数据 }`），
 *   **禁止**在展开后再覆盖这四个字段 —— 否则"两份清单各说各话"就会回来。
 *   该不变量由 `scripts/gate-content-type-contract.mjs` 判据 J 机器校验。
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
import { CONTENT_TYPE_CORE } from './registry-core'
import type { ContentTypeCoreDescriptor } from './registry-core'

/* 运行时面的 re-export（门禁脚本与旧调用方都从本文件取，别改成两份定义）：
 * CONTENT_TYPES / TypeListExhaustive / IndexFieldSpec / descriptorOf / queryEnabledTypes
 * 的唯一定义在 `./registry-core`（核心类型也一样：ContentType 在 model/content.ts）。 */
export { CONTENT_TYPES, descriptorOf, queryEnabledTypes } from './registry-core'
export type { TypeListExhaustive, IndexFieldSpec } from './registry-core'

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

/**
 * 全量描述 = 运行时面（`ContentTypeCoreDescriptor`，由 CORE 展开继承）+ 富元数据。
 * 用 `extends` 而不是重写同名字段：编译期保证两者不会各自漂移。
 */
export interface ContentTypeDescriptor extends ContentTypeCoreDescriptor {
  /** 类型维度文案（**禁止**再拿 `bank.*` 的词库语义硬套到听力/阅读上） */
  i18n: { labelKey: string; unitKey: string }
  /** 是否属"内容包"维度（false = 条目级类型，不出现在 Catalog 的类型列表里） */
  packageLevel: boolean
  /** 已有内容包（含结构探针 demo，见 catalog.ts 的诚实原则） */
  packageRegistered: boolean
  /** 载荷字段模型 */
  fields: FieldSpec[]
  /** 该类型是否必须有资产（如 audio 必须有音频文件） */
  assets: { required: AssetKind[]; optional: AssetKind[] }
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

/**
 * 注册表的**唯一**数据（全量面）。新增类型 = 在这里加一条（不要新建 per-type 文件），
 * 并同步在 `registry-core.ts` 加对应的运行时投影条目（判据 J 的第 1 条会双向判红）。
 *
 * 每条的 `...CONTENT_TYPE_CORE.x` 是**运行时四字段的唯一来源**，结构上也只能有一个来源：
 * 展开后再写 `itemType` / `queryEnabled` / `query` 会让两个面分家 —— 那是判据 J 要抓的违规。
 * 顺序与 ContentType 联合保持一致，便于人读比对。
 */
export const CONTENT_TYPE_REGISTRY: Readonly<Record<ContentType, ContentTypeDescriptor>> = {
  word: {
    ...CONTENT_TYPE_CORE.word,
    i18n: { labelKey: 'type.word.label', unitKey: 'type.word.unit' },
    packageLevel: false, // 条目级类型：词条不属于任何包的子类型，不进 Catalog 类型列表
    packageRegistered: true,
    fields: VOCAB_ITEM_FIELDS,
    assets: { required: [], optional: ['audio'] },
    learning: { progressKind: 'word' },
  },
  vocabulary: {
    ...CONTENT_TYPE_CORE.vocabulary,
    i18n: { labelKey: 'type.vocabulary.label', unitKey: 'type.vocabulary.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: VOCAB_ITEM_FIELDS,
    assets: { required: [], optional: ['audio'] },
    learning: { progressKind: 'word' },
    note: '包级容器类型；条目级查询走 itemType=word。10 个词汇包 = 9346 词。',
  },
  listening: {
    ...CONTENT_TYPE_CORE.listening,
    i18n: { labelKey: 'type.listening.label', unitKey: 'type.listening.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'transcript', required: false, kind: 'string' },
      { name: 'segments', required: false, kind: 'object', note: '逐句时间轴（P18-B 定形；本 Wave 不实现）' },
      { name: 'speaker', required: false, kind: 'string' },
      { name: 'durationSec', required: false, kind: 'number' },
    ],
    assets: { required: ['audio'], optional: ['subtitle', 'image'] },
    learning: { progressKind: 'media' },
  },
  audio: {
    ...CONTENT_TYPE_CORE.audio,
    i18n: { labelKey: 'type.audio.label', unitKey: 'type.audio.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'durationSec', required: false, kind: 'number' },
      { name: 'transcript', required: false, kind: 'string' },
    ],
    assets: { required: ['audio'], optional: ['subtitle'] },
    learning: { progressKind: 'media' },
  },
  reading: {
    ...CONTENT_TYPE_CORE.reading,
    i18n: { labelKey: 'type.reading.label', unitKey: 'type.reading.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'body', required: false, kind: 'string', note: 'P18-B 起对该类型转必填' },
      { name: 'paragraphs', required: false, kind: 'string[]' },
      { name: 'questions', required: false, kind: 'object' },
    ],
    assets: { required: [], optional: ['image', 'audio'] },
    learning: { progressKind: 'unit' },
  },
  topic: {
    ...CONTENT_TYPE_CORE.topic,
    i18n: { labelKey: 'type.topic.label', unitKey: 'type.topic.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'description', required: false, kind: 'string' }],
    assets: { required: [], optional: ['image'] },
  },
  exercise: {
    ...CONTENT_TYPE_CORE.exercise,
    i18n: { labelKey: 'type.exercise.label', unitKey: 'type.exercise.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'questions', required: false, kind: 'object' }],
    assets: { required: [], optional: ['audio', 'image'] },
  },
  writing: {
    ...CONTENT_TYPE_CORE.writing,
    i18n: { labelKey: 'type.writing.label', unitKey: 'type.writing.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'prompt', required: false, kind: 'string' },
      { name: 'sample', required: false, kind: 'string' },
      { name: 'wordLimit', required: false, kind: 'number' },
    ],
    assets: { required: [], optional: ['image'] },
    learning: { progressKind: 'unit' },
  },
  speaking: {
    ...CONTENT_TYPE_CORE.speaking,
    i18n: { labelKey: 'type.speaking.label', unitKey: 'type.speaking.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'prompt', required: false, kind: 'string' },
      { name: 'sample', required: false, kind: 'string' },
    ],
    assets: { required: [], optional: ['audio'] },
    learning: { progressKind: 'unit' },
  },
  grammar: {
    ...CONTENT_TYPE_CORE.grammar,
    i18n: { labelKey: 'type.grammar.label', unitKey: 'type.grammar.unit' },
    packageLevel: true,
    packageRegistered: false, // 尚无包（catalog 诚实报 0）
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'explanation', required: false, kind: 'string' },
      { name: 'examples', required: false, kind: 'string[]' },
    ],
    assets: { required: [], optional: [] },
    learning: { progressKind: 'unit' },
  },
  document: {
    ...CONTENT_TYPE_CORE.document,
    i18n: { labelKey: 'type.document.label', unitKey: 'type.document.unit' },
    packageLevel: true,
    packageRegistered: false,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'summary', required: false, kind: 'string' }],
    assets: { required: ['document'], optional: ['image'] },
  },
  collection: {
    ...CONTENT_TYPE_CORE.collection,
    i18n: { labelKey: 'type.collection.label', unitKey: 'type.collection.unit' },
    packageLevel: true,
    packageRegistered: true,
    fields: [ID_FIELD, TITLE_FIELD, { name: 'description', required: false, kind: 'string' }],
    assets: { required: [], optional: [] },
    note: '集合靠 relation 层描述成员关系（relations.json），不在此内联成员列表。',
  },
  course: {
    ...CONTENT_TYPE_CORE.course,
    i18n: { labelKey: 'type.course.label', unitKey: 'type.course.unit' },
    packageLevel: true,
    packageRegistered: false, // P18-A 新增类型：契约先立，内容后进
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'description', required: false, kind: 'string' },
      { name: 'level', required: false, kind: 'string' },
      { name: 'lessonIds', required: false, kind: 'string[]', note: 'lesson 的本地 id 列表；顺序即课程顺序' },
    ],
    assets: { required: [], optional: ['image'] },
    learning: { progressKind: 'unit' },
    note: 'P18-A 新增。课程 → lesson → 条目 的三级结构，成员关系用 lessonIds / relation 表达。',
  },
  lesson: {
    ...CONTENT_TYPE_CORE.lesson,
    i18n: { labelKey: 'type.lesson.label', unitKey: 'type.lesson.unit' },
    packageLevel: true,
    packageRegistered: false,
    fields: [
      ID_FIELD,
      TITLE_FIELD,
      { name: 'order', required: false, kind: 'number', note: '课内顺序（1-based）' },
      { name: 'courseId', required: false, kind: 'string' },
      { name: 'itemIds', required: false, kind: 'string[]' },
    ],
    assets: { required: [], optional: ['audio', 'image'] },
    learning: { progressKind: 'unit' },
    note: 'P18-A 新增。Lesson 是学习单元（不直接承载媒体），媒体挂在 lesson 的条目上。',
  },
}

/* ------------------------------------------------------------------ *
 * 派生（消费者只读这些，不要各自遍历注册表）
 *
 * ⚠️ `descriptorOf` / `queryEnabledTypes` 已在文件头 re-export 自 `./registry-core`
 *    （运行时面）—— 它们的**定义**只有一份，别在这里再写一遍。
 * ------------------------------------------------------------------ */

/** 包级类型集合（= Catalog 的类型维度应列出的类型）。
 *  `packageLevel` 是富元数据（运行时零消费者）⇒ 只在本文件（全量面）派生。 */
export function packageLevelTypes(): ContentType[] {
  return (Object.keys(CONTENT_TYPE_REGISTRY) as ContentType[]).filter((t) => CONTENT_TYPE_REGISTRY[t].packageLevel)
}

/** 该类型条目的 ContentId type 段 */
export function itemTypeOf(type: ContentType): ContentType {
  return CONTENT_TYPE_REGISTRY[type].itemType
}
