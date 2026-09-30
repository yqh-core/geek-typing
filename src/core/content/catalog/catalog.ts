/* V4.1 · Content Catalog —— 内容目录（V4.1-P0.5 新增）。
 *
 * 职责分离（三者不要混）：
 *   Catalog —— 回答「有什么」：有多少种内容类型、各类型多少包/多少条、每包的元信息；
 *   Query   —— 回答「怎么找」：搜索 / 分页 / 单条寻址（src/core/content/query/）；
 *   Registry—— 回答「从哪加载」：包注册与词条加载（src/core/content/registry.ts）。
 * 目录页 / 设置页 / 能力探测只读 Catalog，不触发任何词条加载。
 *
 * 诚实原则：**未接入的内容类型一律返回 packages=0 / items=0，不许编造数字**。
 * P1.7-Wave4 B-2 起 listening/audio/reading/topic/exercise/writing/speaking/collection
 * 各接入 1 个结构探针 demo 包（registry 登记 + items.json 懒加载），目录页会出现
 * 真实数字；新类型要扩展照此办理。宁可让 UI 显示「暂未开放」，也不要拿假数字骗过验收。
 */
import { getAllPackages, getPackage } from '../registry'
import { SCHEMA_VERSION, type ContentType } from '../model/content'
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

/** 目录的**类型槽位**（app 侧的运行时投影）。
 *
 * 权威是 `src/core/content/types/registry.ts` 的 `packageLevelTypes()`；这里是它的**精简副本**，
 * 存在的唯一理由是**体积**（P1.8-A 实测）：注册表含 14 条富描述（fields / query / learning / note），
 * 整表进主 chunk 会让主 chunk 从 436.45 涨到 444.94 KiB，越过 439.45 KiB 预算（INV-3 禁上调预算）。
 * 而目录的类型维度**当前没有任何 UI 消费**（App 只读 `packages.length` / `totalItems`）——
 * 让 app 为一个没人读的字段背上整张富描述表不划算。
 *
 * 口径因此定为：**权威在注册表，副本在此，由门禁判据 D 强制逐项相等**（不等即 FAIL）。
 * 新增包级类型时改完注册表，门禁立刻指出这里漏了谁 —— 不靠人记，也不靠注释提醒。
 * 条目级类型（word）的 `packageLevel=false`，故不在本表内。顺序与注册表一致，便于人读比对。 */
const PLANNED_TYPES: ContentType[] = [
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

/** 全站内容目录：同步、只读 manifest（不加载任何词条/条目载荷），可放心在首屏调用。
 *  P1.7-Wave4 B-2：喂全部注册包（getVocabularyPackages → getAllPackages），新类型
 *  demo 包登记即自然出现；诚实原则不变 —— 只报真实数字。 */
export function getCatalog(): ContentCatalog {
  const pkgs = getAllPackages()
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
