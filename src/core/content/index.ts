/* P1.6-A · Content API —— 统一内容检索入口（CONTENT_CONTRACT §12.1：UI 只允许三类 API）

 * UI 不应再直接 import '../core/content/query/content-query' 或 '../data/wordBanks'。
 * 一律从本文件取：
 *   - contentQuery（统一检索：search / list / get / count / queryWord）
 *   - getCatalog / getPackageCatalog（目录）
 *   - makeContentId / parseContentId / wordId（ContentId 工具）
 * 这层是「稳定入口」：新增内容类型时在 content-query 内部扩展，本 barrel 不变。
 */
export {
  contentQuery,
  search,
  list,
  get,
  count,
  queryWord,
  searchWords,
  listWords,
  getWord,
  countWords,
  // P18-E：结果联合的结构判别（非 word 族靠它收窄，不用 as 断言）
  isWordHit,
} from './query/content-query'

export { getCatalog, getPackageCatalog } from './catalog/catalog'

/* P18-H：预热入口也走门面 —— 否则 UI（main.tsx）只能直引 './core/content/registry' 深路径，
 * 而 deep import 正是 CONTENT_CONTRACT §12.1 要消灭的东西（门面存在的意义就是"新增内容类型时
 * 本 barrel 不变、调用方不感知"）。门判据 bypassFacadeImports 硬盯着这类直引。
 *
 * Stage 2 第一刀（学习单元）需要两条更深的加载 API，**同样只经门面暴露**：
 *   loadPackage(id)      —— 词表载荷（WordItem[]），单元词段的唯一加载通道
 *   loadPackageData(id)  —— items.json 条目（unknown[]），单元挂载条目的唯一加载通道
 * 门判据 handleReads / wordTableSources 的棘轮基线是按「UI 域不出现词表句柄」定的，
 * 但**加载通道本身必须存在** —— 所以门面开这两个口，而不是让调用方去深路径引 registry。 */
export { warmUpVocabulary, loadPackage, loadPackageData } from './registry'

export {
  makeContentId,
  parseContentId,
  wordId,
  normalizeLocalId,
  isStableLocalId,
} from './model/content'

export type {
  ContentType,
  ContentItem,
  ContentPackageRef,
} from './model/content'

export type {
  WordHit,
  ContentHit,
  ContentItemHit,
  QueryOptions,
  SearchOptions,
  ListOptions,
  ContentScope,
  ResolvedScope,
  SortField,
  SortSpec,
} from './query/content-query'

export type {
  ContentCatalog,
  CatalogTypeEntry,
  CatalogPackageEntry,
} from './catalog/catalog'
