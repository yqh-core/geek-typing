/* V4.1 · Content Model 顶层 —— 内容模型与 ContentId 规范。
 *
 * 三层边界（V4.1 定版，务必守住）：
 *   Content  —— 只描述「内容是什么」，不随用户改变；导入新词库不得污染用户学习记录。
 *   Learning —— 用户与某条内容的互动状态（SRS/掌握度/复习时间），以 contentId 为键。
 *   User     —— 用户自身画像与偏好（profile/preferences/goals/collections）。
 * 本文件只定义 Content 层；Learning 层在 reviewStore，User 层在 settings/goals 侧。
 *
 * ContentId 规范（4 段式）：content:<type>:<namespace>:<localId>
 *   content:vocabulary:ecdict-ielts:ielts       词汇内容包
 *   content:word:ecdict-ielts:abandon           词条
 *   content:topic:ielts:environment             主题
 *   content:audio:ielts:listening-test-01       音频
 *   content:document:ielts:vocabulary-guide     文档
 *
 * ⚠️ namespace 的唯一性契约（改这条前先读）：
 *   词级 id 的 localId 只有词形、不含包 id，因此 **namespace 必须每包唯一**
 *   （当前规则 = `${来源族}-${包 id}`，如 ecdict-ielts / curated-ai-core）。
 *   若两包共用 namespace（早期用来源族 `ecdict`，cet4/toefl/ielts 三包共用），
 *   同名词会产生同一个 ContentId —— 学习记录主键撞车、跨包进度互相污染。
 *   该坑由 tests/content-query.mjs 实测捕获，并在 scripts/content/validate.mjs
 *   第 9 项固化为门禁。跨包同词是**合法数据关系**（IELTS/CET/TOEFL 各有 abandon），
 *   消歧手段是 namespace 而不是禁止同词。
 */

/** 内容类型（与 registry 顶层槽位一致） */
export type ContentType =
  | 'vocabulary'
  | 'word'
  | 'topic'
  | 'listening'
  | 'audio'
  | 'reading'
  | 'writing'
  | 'speaking'
  | 'grammar'
  | 'document'
  | 'collection'
  | 'exercise'

/** 内容命名空间：${来源族}-${包 id}（ecdict-ielts / curated-ai-core …），每包唯一 */
export type ContentNamespace = string

export interface ParsedContentId {
  type: ContentType
  namespace: string
  localId: string
}

/** 构造 ContentId */
export function makeContentId(type: ContentType, namespace: string, localId: string): string {
  return `content:${type}:${namespace}:${localId}`
}

/** 解析 ContentId；格式不合法返回 null（调用方决定 fallback，不抛异常打断 UI） */
export function parseContentId(id: string): ParsedContentId | null {
  const m = /^content:([a-z]+):([a-z0-9-]+):(.+)$/.exec(id)
  if (!m) return null
  return { type: m[1] as ContentType, namespace: m[2], localId: m[3] }
}

/** 词条级 ContentId 的构造/解析快捷方式 */
export const wordId = (namespace: string, lemma: string) => makeContentId('word', namespace, lemma.toLowerCase())

/** 所有内容的顶层契约：任何类型内容都应可给出稳定 id 与类型 */
export interface ContentItem {
  /** ContentId（4 段式） */
  id: string
  type: ContentType
}

/** 内容包（聚合一组同类内容）与词条的关系由 relation 层描述，不在此内联。 */
export interface ContentPackageRef {
  id: string
  type: ContentType
  version: string
}

/** 多来源溯源（V4.1 升级：单一内容可能由 ECDICT + GitHub 数据集 + 自整理共同构成） */
export interface ContentSource {
  origin: string
  /** 结构化许可证（V4.1 升级：SPDX + 归属要求，替代单字符串） */
  license: ContentLicense
  importedAt?: string
  commit?: string
  /** 完整 SHA-256（V4.1：不再截断，provenance 需要可复现） */
  checksum?: string
}

export interface ContentLicense {
  /** SPDX 标识（MIT / CC-BY-4.0 ...）；未知来源为空 */
  spdx?: string
  name: string
  url?: string
  /** 是否要求署名展示（CC BY 等） */
  attributionRequired: boolean
  /** 是否允许商业使用；未知为 undefined（不可假定允许） */
  commercialUse?: boolean
}
