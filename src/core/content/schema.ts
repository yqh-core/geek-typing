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
import type { ContentSource, ContentType } from './model/content'

export type { ContentType, ContentSource, ContentLicense, ParsedContentId } from './model/content'
export { makeContentId, parseContentId, wordId } from './model/content'
export type { WordContent, WordPayload } from './model/vocabulary'
export type { ContentRelation, RelationType } from './relation/relation'

/** 内容包清单（content/vocabulary/<id>/manifest.json）。
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
  /** 内容版本（由 content:build 自动派生）：内容变更时 +1，绝不进 ContentId。
   *  与 schemaVersion（结构版本）是两个维度，学习记录记的是 contentVersion。 */
  contentVersion?: number
  /** 结构版本（由 content:build 写入，常量 SCHEMA_VERSION）：schema 破坏性变更才递增 */
  schemaVersion?: number
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
