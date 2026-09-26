/* V4.1 · Content Schema —— 内容平台的内容侧类型层。
 *
 * 核心架构原则（V4.1 定版）：
 * 1. Content 与 LearningState 分离——本文件只描述「不随用户改变的内容数据」；
 *    用户学习状态（mastery/streak/nextReviewAt 等）属于 LearningState，以 contentId
 *    为键挂载在 store 侧（reviewStore），未来 Cloud Sync 只同步 LearningState，
 *    永远不同步内容本体。
 * 2. ContentId 规范——`前缀:标识`，前缀即资源类型：
 *      bank:ielts  word:abandon  topic:environment  audio:...  document:...  exercise:...
 *    relation 机制（word↔topic 等）由 manifest/relations 数据承载，本层不建图。
 * 3. Content Capability——业务代码禁止 if (bank === 'xxx') 分支，能力判断一律走
 *    manifest.features（registry.hasFeature），IELTS/TOEFL/CET 全部只是数据。
 */

/** 内容包类型（registry 顶层槽位）。listening/reading 等为后续内容类型预留槽位。 */
export type ContentType =
  | 'vocabulary'
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'writing'
  | 'grammar'
  | 'documents'
  | 'exercises'

/** 内容溯源（Data Provenance）：任何外部来源内容缺 license 不得入库（content:validate 强制）。 */
export interface ContentSource {
  origin: string
  /** 开源协议（MIT 等）；仓库自维护内容为 UNLICENSED */
  license: string
  importedAt?: string
  commit?: string
  /** 内容 checksum（sha256 前 16 位），防篡改/重复导入对账 */
  checksum?: string
}

/** 内容包清单（content/vocabulary/<id>/manifest.json 的 schema）。
 *  音频/大文件资源一律存远程 URL（CDN/R2/GitHub Release），本体不进 git 仓库。 */
export interface PackageManifest {
  /** ContentId；vocabulary 类型为 `bank:<id>`，<id> 与 UI/持久化中的词库 id 一致 */
  id: string
  type: ContentType
  /** semver，内容包演进（词表修订/字段扩充时递增） */
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
  stats: { items: number } & Record<string, number>
  source: ContentSource
  /** 离线策略（SW 分级缓存依据）：inline=随主包 / lazy=空闲预热 / runtime=访问时缓存 / on-demand=用户手动下载 */
  offline: { supported: boolean; policy: 'inline' | 'lazy' | 'runtime' | 'on-demand' }
}

/** 词条内容（不可变内容数据；与 V3 的 WordItem 形状一致，由本文件作为唯一定义源）。
 *  phonetic/definition 由生成脚本注入（ECDICT）；code 词库无音标。 */
export interface WordItem {
  word: string
  translation: string
  phonetic?: string
  definition?: string
}

/** 词库内置的默认选中包 id（与 V3 行为一致） */
export const DEFAULT_BANK_ID = 'ai-core'
