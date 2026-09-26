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
 *
 * localId 稳定性契约（V4.1-P0.5 定版）：
 *   localId 一旦随内容包发布，即成为该实体的永久主键，**不得因为展示文本变化而修改**
 *   （改释义、改音标、改例句、修 typo 都不许动 localId；内容修订用 contentVersion +1 表达）。
 *   同词多义需要拆成多个实体时，用后缀区分：`run` / `run-2`，或 `run-v1` / `run-n1`
 *   （v = verb 义项，n = noun 义项）。本轮只固化规范，不实现多义拆分逻辑。
 *   localId 的形态规范见 normalizeLocalId / isStableLocalId。
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

/**
 * 结构版本（schema 版本），写进 manifest.schemaVersion。
 * 只在 content schema 发生**破坏性变更**时递增（字段增删/改名/语义变更），
 * 由导入管线据此决定是否需要迁移或拒收。V4.1-P0 起为 4。
 *
 * ⚠️ 与「内容版本」（contentVersion）是两回事：
 *   SCHEMA_VERSION = 结构的形状；contentVersion = 某条内容的内容修订次数。
 */
export const SCHEMA_VERSION = 4

/**
 * localId 稳定化规范（生成侧/校验侧共用同一函数，避免各包各自 normalize 出偏差）。
 * 顺序固定：NFC 归一 → trim → 内部连续空白折叠为单个空格 → 删除控制字符 → `:` `/` 替换为 `-`。
 *
 * ⚠️ **不做 lowercase**：大小写是 vocabulary 侧的语义决策，由调用方决定
 * （code 词库区分大小写）；wordId() 内部会自行 lowercase。本函数只管「稳定」，不管「语义」。
 */
export function normalizeLocalId(raw: string): string {
  return raw
    .normalize('NFC')
    .trim()
    // 连续空白（含不间断空格 \u00A0 / 制表 / 换行）折叠为单个空格
    .replace(/[\s\u00A0]+/g, ' ')
    // 控制字符一律删除（\u0000-\u001F、\u007F）
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // `:` 与 `/` 会破坏 4 段式 ContentId 的解析，必须禁止，退化成 `-`
    .replace(/[:/]/g, '-')
}

/**
 * 该 localId 是否已处于规范形态（可直接写进 ContentId / 落盘）。
 * 判据：非空 + 幂等（normalizeLocalId(id) === id）+ 不含 `:` `/` + 不含控制字符。
 */
export function isStableLocalId(id: string): boolean {
  if (!id) return false
  if (id.includes(':') || id.includes('/')) return false
  if (/[\u0000-\u001F\u007F]/.test(id)) return false
  return normalizeLocalId(id) === id
}

/**
 * 内容版本：某条内容被修订了几次（改释义/改音标/换音频…）。
 * contentVersion 变化时 ContentId **保持不变** —— 主键稳定，学习记录才不会断链。
 *
 * ⚠️ 绝不可把 contentVersion 塞进 ContentId：
 *   一旦进 id，每次修订都会产生一个新主键，历史学习记录全部失联。
 */
export interface ContentVersioned {
  contentVersion: number
}

/**
 * 指向「某个内容实体」的引用，可选带上「学到的是该实体的哪个版本」。
 * 三者分工，别混：
 *   ContentId       = 是**哪个**内容实体（不变）
 *   contentVersion  = 学的是该实体的**哪个版本**（可选；用于判断复习记录是否过时）
 *   Learning        = 用户学到**什么程度**（在 Learning 层，不在这里）
 */
export interface ContentRef {
  contentId: string
  contentVersion?: number
}
