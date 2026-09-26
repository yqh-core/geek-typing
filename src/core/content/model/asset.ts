/* V4.1-P0.5 · Content Asset —— 「文件在哪」与「内容是什么」分离。
 *
 * 核心原则：**Content ≠ File**。
 *   一条内容（word / audio / document …）可以有 0..n 个资产文件，且这些文件的
 *   存放位置会随部署演进而变：本地 `public/` → R2 → CDN → GitHub Releases。
 *   Asset 层把「文件在哪」单独建模，这样搬运/换 CDN 时 **Content 模型不用动**，
 *   只改 AssetRef.url 的解析策略。目录上也分离：`content/` 存数据，`assets/` 存文件。
 *
 * assetId 建议形态：`asset:<kind>:<namespace>:<localId>`
 *   asset:audio:ecdict-ielts:abandon-uk
 *   asset:image:ielts:environment-diagram
 * ⚠️ 前缀用 `asset:` 而不是 `content:`：避免与 4 段式 ContentId 混淆
 *   （parseContentId 只认 `content:` 前缀，assetId 不该被当成内容实体解析）。
 */
import type { ContentLicense } from './content'

export type AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'

/** 资产引用：只描述文件本身，不含任何内容语义，也**不含**学习状态 */
export interface AssetRef {
  /** 资产 id，建议 `asset:<kind>:<namespace>:<localId>` */
  assetId: string
  kind: AssetKind
  /** 可达地址；可为相对路径（本地）、https URL（R2/CDN/Releases）或未来其它 scheme */
  url: string
  mime?: string
  bytes?: number
  /** 内容寻址校验（建议 SHA-256 完整值，不截断） */
  checksum?: string
  /** 资产可自带许可证：与所属内容的许可证不同时以此为准 */
  license?: ContentLicense
}

/** 构造 assetId（形态 `asset:<kind>:<namespace>:<localId>`） */
export function makeAssetId(kind: AssetKind, namespace: string, localId: string): string {
  return `asset:${kind}:${namespace}:${localId}`
}
