/* V4.1 · Content Schema —— 内容包清单类型层（PackageManifest）。
 *
 * 层次约定：
 *   model/content.ts —— ContentId 规范 + 三层（Content/Learning/User）边界 + ContentSource
 *   model/vocabulary.ts —— 词条内容模型
 *   relation/relation.ts —— Learning Graph 关系模型
 *   schema.ts —— 内容包清单（manifest.json 的 schema），组合上述类型
 *
 * 内容数据的唯一定义源是 content/<type>/<id>/{manifest,words}.json；本文件不承载数据。
 * stats/checksum 一律由 content:build 从数据自动派生，不人工维护。
 */
import type { ContentSource, ContentType, ContentRevisionEntry } from './model/content'

export type { ContentType, ContentSource, ContentLicense, ParsedContentId } from './model/content'
export { makeContentId, parseContentId, wordId } from './model/content'
export type { WordContent, WordPayload } from './model/vocabulary'
export type { ContentRelation, RelationType } from './relation/relation'

/** 内容包清单（content/vocabulary/<id>/manifest.json）—— Package 的「身份证」：
 *  由 content:build 自动生成，含「它是谁（packageId/namespace/id）」+「它当前是哪个快照
 *  （contentVersion/contentChecksum/contentRevision）」+「它怎么来的（sources/build）」，
 *  因此每个 Package 都是可审计、可复现的数据产品。
 *  音频/大文件资源一律存远程 URL（CDN/R2/GitHub Release），本体不进 git 仓库。 */
export interface PackageManifest {
  /** ContentId：content:vocabulary:<namespace>:<id>（<namespace> 消歧同名不同源） */
  id: string
  type: ContentType
  /** semver；词表修订/字段扩充时递增 */
  version: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  language: string
  /** 备考体系标签（IELTS/CET-4/考研...），非备考库为 null */
  exam: string | null
  tags: string[]
  /** lucide 图标名（UI 渲染用） */
  icon: string
  /** 能力声明：业务按 features 查询，禁止按包 id 分支 */
  features: { phonetic: boolean; definition: boolean } & Record<string, boolean>
  /** 由 content:build 自动派生（items/phonetic/definition） */
  stats: { items: number } & Record<string, number>
  /** 多来源溯源（内容可由 ECDICT + GitHub 数据集 + 自整理共同构成） */
  sources: ContentSource[]
  /** 离线策略：inline=随主包 / lazy=空闲预热 / runtime=访问时缓存 / on-demand=手动下载 */
  offline: { supported: boolean; policy: 'inline' | 'lazy' | 'runtime' | 'on-demand' }
  /** 包裸 id（= content/vocabulary/<packageId> 目录名），与 UI/持久化键一致 */
  packageId: string
  /** ContentId 第 3 段：每包唯一 = `${来源族}-${包 id}`（ecdict-ielts / curated-ai-core），
   *  跨包同词靠它消歧，见 model/content.ts 的 namespace 唯一性契约 */
  namespace: string
  /** 对外学习契约版本（由 content:build 派生）：同一 checksum 复用同一 version，
   *  回滚即回到历史 version。学习记录记的是它，绝不进 ContentId。
   *  与 schemaVersion（结构版本）是两个维度。 */
  contentVersion: number
  /** 单调递增修订号（由 content:build 派生）：每次内容构建都 +1，审计用，回滚也不回头。
   *  ⚠️ 它只回答「这个包被构建过多少次」，不参与任何相等性判断 —— 判断内容身份请用 contentChecksum。 */
  contentRevision: number
  /**
   * 规范化内容的 canonical SHA-256（contentChecksum）。
   * ⚠️ 与 `sources[].checksum` 语义不同，别混用：
   *   contentChecksum      = **规范化后入库内容**的指纹（归一化/排序/字段裁剪之后算的）
   *   sources[].checksum   = **来源原始数据**的指纹（下载到的原始文件算的）
   *   两者在规范化管线有输出时必然不同；混用会导致「源数据没变但内容变了」被漏判。
   */
  contentChecksum: string
  /** 该内容快照的发布时间（ISO date） */
  contentPublishedAt: string
  /** 修订历史：按 revision 升序，用于回滚时把 checksum 还原成 (revision, version) */
  contentHistory: ContentRevisionEntry[]
  /** 构建溯源：让每个 Package 成为可审计、可复现的数据产品 */
  build: { toolVersion: string; builtAt: string; sourceChecksum: string }
  /** 结构版本（由 content:build 写入，常量 SCHEMA_VERSION）：schema 破坏性变更才递增 */
  schemaVersion: number
  /** Import Pipeline 的规范化开关：代码词库须 stripHtml=false，
   *  否则 `type Handler<T>` / `<div />` 会被当成 HTML 标签删掉，词表被破坏。 */
  normalize?: { stripHtml?: boolean }
}

/** 词条载荷（与 V3 WordItem 形状一致；V4.1 起定义在 model/vocabulary）。
 *  学习状态（mastery/streak/nextReviewAt）绝不挂在这里，见 Content/Learning 边界。 */
export interface WordItem {
  word: string
  translation: string
  phonetic?: string
  definition?: string
}

/** 词库内置默认选中包（裸 id，与 UI/持久化一致） */
export const DEFAULT_BANK_ID = 'ai-core'
