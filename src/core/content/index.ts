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
} from './query/content-query'

export { getCatalog, getPackageCatalog } from './catalog/catalog'

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
