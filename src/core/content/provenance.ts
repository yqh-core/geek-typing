/* V4.1 · Provenance —— 内容溯源语义层（P1.7-Wave4 B-4）。
 *
 * 解决的问题：此前 manifest.sources[].origin 只是一段自由文本（"curated in-repo" /
 * "ECDICT"），「这段内容是不是自有内容」的判定耦合在 origin 字符串的措辞上 ——
 * 校验脚本判 `origin.includes('curated')`，纯属字符串巧合。本文件把「来源是谁」
 * 升级为结构化语义字段：
 *
 *   provider     —— 来源方标识（自有内容用 PROVIDER_ORIGINAL 哨兵值）
 *   repository?  —— 来源仓库地址（外部来源必填，内部来源省略）
 *   path?        —— 来源仓库内的路径（B-3 ingest 管线接入时填写）
 *   revision?    —— 来源仓库的 commit / 版本号（同上）
 *   retrievedAt? —— 抓取时间（同上；当前 sources[].importedAt 承担此语义）
 *
 * 落点：manifest.sources[] 每项直接携带 provider（扁平，不嵌套），由
 * scripts/content/build.mjs 的 PROVIDER 源表统一回写 —— manifest 是构建产物，
 * 禁止手改。校验脚本（Node，无法 import TS）以字面量镜像本文件的哨兵值与
 * 判定规则，两处必须同步修改。
 */

/** 自有内容哨兵值：provider === 该值 ⇒ 免 SPDX（无外部来源，协议自主） */
export const PROVIDER_ORIGINAL = 'geek-typing original'

/** 单条来源的溯源信息（manifest.sources[] 项的溯源部分） */
export interface Provenance {
  /** 来源方标识；自有内容恒为 PROVIDER_ORIGINAL */
  provider: string
  /** 来源仓库地址（如 ECDICT 的 GitHub 仓库） */
  repository?: string
  /** 来源仓库内路径 */
  path?: string
  /** 来源仓库 revision（commit / tag） */
  revision?: string
  /** 抓取时间（ISO） */
  retrievedAt?: string
}

/** 是否自有内容：按 provider 哨兵值判定，不再依赖 origin 措辞 */
export function isOriginalProvenance(p?: Provenance | null): boolean {
  return p?.provider === PROVIDER_ORIGINAL
}
