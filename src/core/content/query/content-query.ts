/* V4.1 · Content Query Layer —— 统一内容检索层（V4.1-P0 核心；P0.5 升级为统一入口）。
 *
 * 定位：Content Package → Content Registry → **Content Query** → Learning Engine → UI
 * UI（含未来的 Word Detail / Search / Filter）只能通过本层检索内容，不得直接持有
 * 词表数组做 filter —— 这样底层数据源从 JSON 换成 IndexedDB / R2 / API 时页面零改动。
 *
 * 数据来源不透明：本层只调 registry.loadPackage() / ContentIndex，不感知 JSON/远程/CDN。
 * 索引访问同样不透明：**只走 content-index 的 finder（findByXxx / idsByPackage）**，
 * 本文件不得出现 idx.byWord / idx.byId 这类对索引物理结构的直接访问（V4.1-P0.6）。
 *
 * ⚠️ 统一入口原则（写死，别再破例）：
 *   新增内容类型（topic / audio / listening ...）时，在 search/list/get/count 内部扩展分支，
 *   **禁止**再出现 searchTopics() / searchAudios() / listListening() 这类散装 API。
 *   散装 API 每加一类就翻一倍，是上一代代码最贵的债；统一入口 + type 参数让调用方
 *   （UI / Learning Engine）永远只学一套签名。
 *
 * 兼容：searchWords / listWords / getWord / countWords 保留原语义，是统一入口在
 * type='word' 下的薄封装（tests/content-query.mjs 的契约测试依赖它们）。
 */
import { getPackage, getVocabularyPackages, loadPackage } from '../registry'
import { parseContentId } from '../model/content'
import type { ContentType } from '../model/content'
import { buildHits, ensureIndex, findById, findByPackage, findByWord, idsByPackage, normalizeWord } from '../index/content-index'
import type { VocabularyPackage } from '../registry'

/** 检索结果：一条词条 + 它所在的内容包上下文 */
export interface WordHit {
  /** 词条 ContentId：content:word:<namespace>:<lemma> */
  id: string
  word: string
  translation: string
  phonetic?: string
  definition?: string
  /** 所属包 ContentId：content:vocabulary:<namespace>:<id> */
  packageId: string
  /** 所属包裸 id（UI/持久化键） */
  packageLocalId: string
  packageTitle: string
}

/* ---------------- 作用域（Scope） ----------------
 *
 * 首页 / 搜索页 / 词库页 / Word Detail / 收藏页共用一套「我要查哪些内容」的描述，
 * 避免每个页面各写一套 packageId+tags 拼装逻辑（拼装逻辑一分散，过滤条件就会漂移）。
 *
 * 合并规则（见 resolveScope）：**显式平铺参数优先于 scope** —— 调用方既传
 * `{scope:{packageId:'ielts'}, packageId:'cet4'}` 时以 cet4 为准（覆盖，不是取交集），
 * 因为平铺参数是「就近的、更具体的意图」，scope 是「页面级默认作用域」。
 * scope 缺省视为空作用域 = 全库。
 */
export interface ContentScope {
  /** 内容类型；省略时按 QueryOptions.type 处理（默认 'word'） */
  type?: ContentType
  /** 限定包（裸 id 或 4 段式 ContentId） */
  packageId?: string
  /** 限定包的 namespace（如 ecdict-ielts / curated-ai-core） */
  namespace?: string
  /** 包 tag 过滤，命中任一即入选 */
  tags?: string[]
}

/** 合并后的作用域（type 已解析出默认值，供内部各分支直接使用） */
export interface ResolvedScope {
  type: ContentType | 'all'
  packageId?: string
  namespace?: string
  tags?: string[]
}

/* ---------------- 排序（Sort）契约 ----------------
 *
 * P1 前必须定死，否则翻页会重项 / 漏项（这是分页类缺陷里最难查的一类：不报错，只丢数据）。
 * 铁律：
 *  ① **排序必须在分页之前完成**（sortRows → paginate），先切页再排序必然错页；
 *  ② **tie-break 组合必须唯一**（词形 → packageLocalId → 包内序号），否则同 key 的行
 *     顺序由 sort 的算法稳定性决定，换引擎 / 换数据量就可能翻页重复；
 *  ③ 同一 query 多次执行顺序完全一致 ⇒ 翻页不重不漏。
 *  search() 与 list() 都遵守（list 也排序：浏览页翻页同样依赖确定性）。
 */
export type SortField = 'relevance' | 'word' | 'updated'
export interface SortSpec {
  /** 默认 'relevance' */
  field?: SortField
  /** 默认 'asc' */
  order?: 'asc' | 'desc'
}

export interface SearchOptions {
  query: string
  /** 限定包（裸 id 或 4 段式 ContentId）；省略则跨全部包 */
  packageId?: string
  /** 最大返回条数（默认 20） */
  limit?: number
  /** 仅精确匹配（词形全等），默认含前缀匹配 */
  exact?: boolean
}

export interface ListOptions {
  packageId: string
  page?: number
  pageSize?: number
  /** 过滤：仅返回带音标的条目 */
  hasPhonetic?: boolean
}

/** 统一查询参数（type 决定内容类型，其余为跨类型通用过滤条件） */
export interface QueryOptions {
  /** 内容类型；'all' = 遍历全部已支持类型。默认 'word' */
  type?: ContentType | 'all'
  /** 搜索词（词形 / 翻译 / 释义） */
  query?: string
  /** 限定包（裸 id 或 4 段式 ContentId） */
  packageId?: string
  /** 限定包的 namespace（如 ecdict-ielts） */
  namespace?: string
  /** 包 tag 过滤，命中任一即入选 */
  tags?: string[]
  /** 页码，从 1 起（默认 1） */
  page?: number
  /** 每页条数；省略则不分页（返回全部命中） */
  pageSize?: number
  /** 仅精确词形匹配（不返回前缀 / 释义命中） */
  exact?: boolean
  /** 仅返回带音标的条目 */
  hasPhonetic?: boolean
  /** 页面级作用域；被上面同义的平铺参数覆盖 */
  scope?: ContentScope
  /** 排序：'relevance' | 'word' | 'updated'，或 { field, order }；默认 relevance / asc */
  sort?: SortField | SortSpec
}

/** 当前统一入口已支持检索的内容类型；新类型在此登记，其它分支自动跟上 */
const SUPPORTED_TYPES: ContentType[] = ['word']

/** 归一化（trim + lowercase + NFC + 空白折叠）—— 与索引 key 必须同源，否则存得进查不到 */
const norm = (s: string) => normalizeWord(s)

/** 字典序比较：**不用 localeCompare**（不同运行环境的 ICU 数据不同，排序结果会漂，
 *  直接破坏分页稳定性），只用 code-unit 比较，任何环境结果一致。 */
const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** type → 实际要检索的类型列表；不支持的类型返回空数组（查询结果 [] / count 0） */
function resolveTypes(type: ContentType | 'all'): ContentType[] {
  if (type === 'all') return [...SUPPORTED_TYPES]
  return SUPPORTED_TYPES.includes(type) ? [type] : []
}

/** sort 两种写法归一（'word' / { field, order }） */
function parseSort(sort?: SortField | SortSpec): Required<SortSpec> {
  if (!sort) return { field: 'relevance', order: 'asc' }
  if (typeof sort === 'string') return { field: sort, order: 'asc' }
  return { field: sort.field ?? 'relevance', order: sort.order ?? 'asc' }
}

/** 平铺参数 + scope 合并：平铺优先（有值即覆盖 scope 同名字段），scope 缺省 = 空作用域 = 全库 */
export function resolveScope(opts: QueryOptions): ResolvedScope {
  const s = opts.scope
  return {
    type: opts.type ?? s?.type ?? 'word',
    packageId: opts.packageId ?? s?.packageId,
    namespace: opts.namespace ?? s?.namespace,
    // 空数组不视为过滤条件（与老实现 tags:[] = 不过滤 一致），故按 length 判空
    tags: opts.tags?.length ? opts.tags : s?.tags?.length ? s.tags : undefined,
  }
}

/** packageId（裸 id / ContentId）+ namespace → 目标包；两者都省略为全部包，未登记为空数组。
 *  namespace 过滤 = 包 manifest id 解析出的 namespace 相等（namespace 每包唯一）。 */
function scopePackages(packageId?: string, namespace?: string): VocabularyPackage[] {
  let pkgs: VocabularyPackage[]
  if (packageId) {
    const hit = getPackage(packageId)
    pkgs = hit ? [hit] : []
  } else {
    pkgs = getVocabularyPackages()
  }
  if (namespace) pkgs = pkgs.filter((p) => parseContentId(p.manifest.id)?.namespace === namespace)
  return pkgs
}

/** tag 过滤：命中任一 tag 即入选（tags 为空表示不过滤） */
function scopeTags(pkgs: VocabularyPackage[], tags?: string[]): VocabularyPackage[] {
  if (!tags?.length) return pkgs
  return pkgs.filter((p) => tags.some((t) => p.manifest.tags.includes(t)))
}

/** 参与排序的一行：hit + 相关性分组（rank）+ 包内序号（ord，updated 排序与 tie-break 用） */
interface Row {
  hit: WordHit
  /** 0=精确词形 / 1=前缀 / 2=释义翻译；list 恒为 0 */
  rank: number
  /** 包内数据序号（词表原始顺序） */
  ord: number
}

/** 包 → (词条 id → 包内序号)：精确命中不经过 pool 时用它补齐 ord，保证 tie-break 唯一 */
function ordinalsOf(pkgs: VocabularyPackage[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pkgs) idsByPackage(p.localId).forEach((id, i) => m.set(id, i))
  return m
}

/** 取当前作用域下的候选集（索引顺序 = 包注册序 + 包内数据序），全部经 finder 访问索引 */
async function poolEntries(scope: ResolvedScope, hasPhonetic?: boolean): Promise<Row[]> {
  const pkgs = scopeTags(scopePackages(scope.packageId, scope.namespace), scope.tags)
  if (!pkgs.length) return []
  await ensureIndex(pkgs.map((p) => p.localId))
  const out: Row[] = []
  for (const p of pkgs) {
    const hits = findByPackage(p.localId)
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i]
      if (hasPhonetic && !hit.phonetic) continue
      out.push({ hit, rank: 0, ord: i })
    }
  }
  return out
}

/**
 * 排序（分页之前调用）：
 *  - relevance（默认）：保持 精确词形 > 前缀 > 释义/翻译 的分组，**组内 tie-break 按
 *    (词形, packageLocalId, 包内序号) 升序** ⇒ deterministic；
 *  - word：按 normalizeWord 字典序升序，tie-break 按 packageLocalId → 包内序号；
 *  - updated：当前词表**没有**词级 updatedAt 字段，故规定退化为「按包内原始词序（数据
 *    顺序）」，主序 = (packageLocalId, 包内序号)。⚠️ 这不是「按更新时间排序」，只是
 *    在数据接入前给翻页一个确定顺序；**词级 updatedAt 接入后改为按时间戳**，
 *    届时必须同步修改本注释与 tests/content-query.mjs【12】。不要在此基础上编造语义。
 *  - order:'desc'：只反转主序，**tie-break 恒升序**，保证确定性不被破坏。
 */
function sortRows(rows: Row[], sort?: SortField | SortSpec): WordHit[] {
  const { field, order } = parseSort(sort)
  const flip = order === 'desc' ? -1 : 1
  return [...rows]
    .sort((a, b) => {
      let primary = 0
      if (field === 'relevance') primary = a.rank - b.rank
      else if (field === 'word') primary = cmpText(norm(a.hit.word), norm(b.hit.word))
      else primary = cmpText(a.hit.packageLocalId, b.hit.packageLocalId) || a.ord - b.ord
      if (primary) return primary * flip
      // tie-break 恒升序：(词形, packageLocalId, 包内序号) —— 三者组合唯一 ⇒ 顺序完全确定
      return (
        cmpText(norm(a.hit.word), norm(b.hit.word)) ||
        cmpText(a.hit.packageLocalId, b.hit.packageLocalId) ||
        a.ord - b.ord
      )
    })
    .map((r) => r.hit)
}

function paginate<T>(rows: T[], page?: number, pageSize?: number): T[] {
  if (!pageSize) return rows
  const p = Math.max(1, page ?? 1)
  return rows.slice((p - 1) * pageSize, p * pageSize)
}

/* ---------------- 统一入口 ---------------- */

/** 统一搜索：词形精确 > 前缀 > 释义/翻译命中；不支持的类型返回 [] */
export async function search(opts: QueryOptions): Promise<WordHit[]> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return []
  const q = norm(opts.query ?? '')
  if (!q) return []

  const pkgs = scopeTags(scopePackages(scope.packageId, scope.namespace), scope.tags)
  if (!pkgs.length) return []
  await ensureIndex(pkgs.map((p) => p.localId))
  const inScope = new Set(pkgs.map((p) => p.localId))
  const keep = (h: WordHit) => inScope.has(h.packageLocalId) && (!opts.hasPhonetic || !!h.phonetic)

  const rows: Row[] = []
  const ordMap = ordinalsOf(pkgs)
  // 精确词形走 byWord 倒排表：O(命中数)，不再逐条扫 9346 词
  for (const hit of findByWord(q)) if (keep(hit)) rows.push({ hit, rank: 0, ord: ordMap.get(hit.id) ?? 0 })
  const prefix: Row[] = []
  const loose: Row[] = []
  if (!opts.exact) {
    for (const { hit, ord } of await poolEntries(scope, false)) {
      const w = norm(hit.word)
      if (w === q) continue // 已由精确组收集
      if (w.startsWith(q)) prefix.push({ hit, rank: 1, ord })
      else if (norm(hit.translation).includes(q) || norm(hit.definition ?? '').includes(q)) loose.push({ hit, rank: 2, ord })
    }
  }
  rows.push(...prefix, ...loose)
  // 排序 → 分页：顺序不可颠倒（先切页再排序会重项 / 漏项）
  return paginate(sortRows(rows, opts.sort), opts.page, opts.pageSize)
}

/** 统一浏览：按包 / namespace / tag + 音标过滤 → 排序 → 分页；不支持的类型返回 [] */
export async function list(opts: QueryOptions): Promise<WordHit[]> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return []
  const rows = await poolEntries(scope, opts.hasPhonetic)
  return paginate(sortRows(rows, opts.sort), opts.page, opts.pageSize)
}

/** 统一单条寻址：按 ContentId 取；未接入的类型 / 非法 id 返回 null */
export async function get(contentId: string): Promise<WordHit | null> {
  const parsed = parseContentId(contentId)
  if (!parsed) return null
  if (!SUPPORTED_TYPES.includes(parsed.type)) return null
  return getWord(contentId)
}

/** 统一计数：支持 type / packageId / namespace / tags / hasPhonetic 过滤；不支持的类型返回 0 */
export async function count(opts: QueryOptions = {}): Promise<number> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return 0
  const pkgs = scopeTags(scopePackages(scope.packageId, scope.namespace), scope.tags)
  if (!pkgs.length) return 0
  if (!opts.hasPhonetic) return pkgs.reduce((sum, p) => sum + p.manifest.stats.items, 0)
  return (await poolEntries(scope, true)).length
}

export const contentQuery = { search, list, get, count }

/* ---------------- 兼容封装（type 固定 'word'，语义与 V4.1-P0 完全一致） ---------------- */

/** 包内词条 → WordHit（ContentId 由包 namespace + 词形计算，大库不预展开全表 id） */
function toHits(localId: string, packageId: string, packageTitle: string, words: { word: string; translation: string; phonetic?: string; definition?: string }[]): WordHit[] {
  return buildHits(localId, packageId, packageTitle, words)
}

/** 搜索词条：跨包检索（同一词在 IELTS/CET/TOEFL 出现会各返回一条，标注来源包）。
 *  排序：精确词形 > 前缀匹配 > 释义/翻译命中（组内按词形 + 包序 tie-break，deterministic）。 */
export async function searchWords(opts: SearchOptions): Promise<WordHit[]> {
  return search({
    type: 'word',
    query: opts.query,
    packageId: opts.packageId,
    exact: opts.exact,
    pageSize: opts.limit ?? 20,
  })
}

/** 分页列出包内词条（Word Detail / 词表浏览用） */
export async function listWords(opts: ListOptions): Promise<WordHit[]> {
  return list({
    type: 'word',
    packageId: opts.packageId,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 50,
    hasPhonetic: opts.hasPhonetic,
  })
}

/** 按词条 ContentId 取单条（content:word:ecdict-ielts:abandon）。
 *  namespace 每包唯一 ⇒ 该 id 唯一指向一个包（跨包同词各有各的 id，不互相污染）。
 *
 * ⚠️ 生成侧与寻址侧的大小写口径必须一致（V4.1-P0.5 独立复核实测捕获的潜伏缺陷）：
 *    id 由 buildHits 用**原词形**（保留大小写）生成 —— code 词库的 `const [a, setA] = ...`、
 *    `Oxford` / `Marxist` 这类专有名词都带大写。若这里用 norm(localId)（lowercase）反查，
 *    9346 条里 93 条会「search 查得到、get 取不回」（go-code 41/50、ts-code 34/50），
 *    Word Detail 接线当天就会大面积空白页。故① 走索引 byId 精确取（key 与生成侧同源），
 *    ② 仅在精确未命中时才用 norm 兜底（兼容调用方传入的 lowercase / 未规范 id）。 */
export async function getWord(contentId: string): Promise<WordHit | null> {
  const parsed = parseContentId(contentId)
  if (!parsed || parsed.type !== 'word') return null
  const pkgs = getVocabularyPackages().filter((p) => parseContentId(p.manifest.id)?.namespace === parsed.namespace)
  if (!pkgs.length) return null

  // ① 精确：索引正排表的 key 就是生成侧写进去的 id，逐字符一致（经 findById，不直接摸 Map）
  await ensureIndex(pkgs.map((p) => p.localId))
  const direct = findById(contentId)
  if (direct) return direct

  // ② 兜底：调用方传入 lowercase / 未规范化的 id
  const target = norm(parsed.localId)
  for (const p of pkgs) {
    const words = await loadPackage(p.localId)
    const hit = words.find((w) => norm(w.word) === target)
    if (hit) return toHits(p.localId, p.manifest.id, p.manifest.title, [hit])[0]
  }
  return null
}

/** 词条总数（省略 packageId 时为全库合计） */
export async function countWords(packageId?: string): Promise<number> {
  return count({ type: 'word', packageId })
}
