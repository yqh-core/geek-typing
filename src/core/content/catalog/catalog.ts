/* V4.1 · Content Catalog —— 内容目录（V4.1-P0.5 新增）。
 *
 * 职责分离（三者不要混）：
 *   Catalog —— 回答「有什么」：有多少种内容类型、各类型多少包/多少条、每包的元信息；
 *   Query   —— 回答「怎么找」：搜索 / 分页 / 单条寻址（src/core/content/query/）；
 *   Registry—— 回答「从哪加载」：包注册与词条加载（src/core/content/registry.ts）。
 * 目录页 / 设置页 / 能力探测只读 Catalog，不触发任何词条加载。
 *
 * 诚实原则：**未接入的内容类型一律返回 packages=0 / items=0，不许编造数字**。
 * listening / audio / reading / topic / exercise 目前只是规划槽位，数据接入后（放进
 * content/<type>/<id>/manifest.json 并在 registry 登记）会自动出现在 types 里，
 * 本文件无需改动。宁可让 UI 显示「暂未开放」，也不要拿假数字骗过验收。
 */
import { getPackage, getVocabularyPackages } from '../registry'
import { SCHEMA_VERSION } from '../model/content'
import type { PackageManifest } from '../schema'

export interface CatalogTypeEntry {
  /** 内容类型（vocabulary / listening / audio ...） */
  type: string
  /** 该类型下的内容包数 */
  packages: number
  /** 该类型下的内容条目数（取各包 manifest.stats.items 求和） */
  items: number
}

export interface CatalogPackageEntry {
  /** 包裸 id（UI / 持久化键） */
  localId: string
  /** 包 ContentId：content:vocabulary:<namespace>:<id> */
  contentId: string
  title: string
  type: string
  items: number
  tags: string[]
  /** 已开启的能力名（manifest.features 中值为 true 的键），业务按此判断而非按包 id 分支 */
  features: string[]
  /** 离线策略：inline / lazy / runtime / on-demand */
  offline: string
}

export interface ContentCatalog {
  schemaVersion: number
  types: CatalogTypeEntry[]
  packages: CatalogPackageEntry[]
  /** 全部类型的条目合计 */
  totalItems: number
}

/** 规划中的内容类型槽位（含已接入的 vocabulary）：目录页据此展示「哪些还没有」。
 *  'word' 是条目级类型（词条不属于任何包的子类型），故不在目录的类型维度里列出。 */
const PLANNED_TYPES = [
  'vocabulary',
  'listening',
  'reading',
  'audio',
  'topic',
  'exercise',
  'writing',
  'speaking',
  'grammar',
  'document',
  'collection',
]

function toEntry(m: PackageManifest, localId: string): CatalogPackageEntry {
  return {
    localId,
    contentId: m.id,
    title: m.title,
    type: m.type,
    items: m.stats.items,
    tags: [...m.tags],
    features: Object.keys(m.features).filter((k) => m.features[k] === true),
    offline: m.offline.policy,
  }
}

/** 全站内容目录：同步、只读 manifest（不加载任何词条），可放心在首屏调用。 */
export function getCatalog(): ContentCatalog {
  const pkgs = getVocabularyPackages()
  const byType = new Map<string, CatalogTypeEntry>()
  for (const t of PLANNED_TYPES) byType.set(t, { type: t, packages: 0, items: 0 })
  for (const p of pkgs) {
    const cur = byType.get(p.manifest.type) ?? { type: p.manifest.type, packages: 0, items: 0 }
    cur.packages += 1
    cur.items += p.manifest.stats.items
    byType.set(p.manifest.type, cur)
  }
  const packages = pkgs.map((p) => toEntry(p.manifest, p.localId))
  return {
    schemaVersion: SCHEMA_VERSION,
    types: [...byType.values()],
    packages,
    totalItems: packages.reduce((sum, p) => sum + p.items, 0),
  }
}

/** 单包目录条目；裸 id（ielts）或 4 段式 ContentId 均可，未登记返回 null */
export function getPackageCatalog(localId: string): CatalogPackageEntry | null {
  const pkg = getPackage(localId)
  if (!pkg) return null
  return toEntry(pkg.manifest, pkg.localId)
}
