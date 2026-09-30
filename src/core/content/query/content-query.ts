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
 * 分族（P18-E）：条目按**形状族**分派，族 = `descriptorOf(包.type).itemType`。
 *   - word 族（类型 word / vocabulary）：结果形状 `WordHit`，精确命中走 byWord 倒排，
 *     前缀 / 子串命中按 `descriptor.query.match` 派生；
 *   - 其他族（reading / topic / …）：结果形状 `ContentItemHit`，精确命中按
 *     `descriptor.query.index` 的 exact 字段，前缀 / 子串同样由 `descriptor.query.match` 派生。
 *   族规则**全部由注册表派生**（packageTypesOf / descriptor.query），本文件不写死任何类型名；
 *   `SUPPORTED_TYPES = queryEnabledTypes()` —— 注册表是唯一事实源。
 *
 * 兼容：searchWords / listWords / getWord / countWords 保留原语义，是统一入口在
 * type='word' 下的薄封装（tests/content-query.mjs 的契约测试依赖它们）。
 */
import { getAllPackages, getPackage, getVocabularyPackages, loadPackage } from '../registry'
import type { ContentPackage } from '../registry'
import { parseContentId, wordId } from '../model/content'
import type { ContentType } from '../model/content'
import { buildHits, ensureIndex, findById, findByPackage, findByWord, idsByPackage, normalizeWord } from '../index/content-index'
import { CONTENT_TYPE_REGISTRY, descriptorOf, queryEnabledTypes } from '../types/registry'
import type { ContentTypeDescriptor } from '../types/registry'

/** 检索结果（word 族）：一条词条 + 它所在的内容包上下文 */
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

/**
 * 检索结果（非 word 族）：一条条目 + 它所在的内容包上下文（P18-E）。
 *
 * 判别联合靠**结构判别**（`'word' in h`，见 `isWordHit`），故 `WordHit` 一字未改、
 * 也不给它加必填 `type` 字段 —— 那会同时动 content-index 的 7 个 finder 与 barrel 导出，
 * 换来的判别力并不比结构判别更多（裁定 §⑨-4）。
 */
export interface ContentItemHit {
  /** = descriptorOf(包.type).itemType；非 'word' */
  type: ContentType
  /** 条目 ContentId：content:<itemType>:<ns>:<包内本地 id> */
  id: string
  /** 包内本地 id（稳定键，不随展示文本变） */
  itemId: string
  title: string
  /** 所属包 ContentId */
  packageId: string
  packageLocalId: string
  packageTitle: string
  /**
   * 原始条目对象本身（**不拷贝**）—— descriptor 声明的任意字段按名取值
   * （`fieldValueOf` 消费）。字段集是**数据**，所以不在代码里写死。
   */
  fields: Record<string, unknown>
}

/** 统一入口的返回联合：word 族 | 其他族 */
export type ContentHit = WordHit | ContentItemHit

/** 结构判别：有无 `word` 字段。非 word 族靠它收窄（**不用 `as`** —— `as` 会在真出现混装时静默骗过编译器）。 */
export function isWordHit(h: ContentHit): h is WordHit {
  return 'word' in h
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

/** 统一入口已支持检索的内容类型 —— **由注册表派生**（唯一事实源），不在此另写一份清单。
 *  ⚠️ 必须写成这个形态（不要包成 `[...queryEnabledTypes()]`）：门禁脚本按本行正则提取启用集。 */
const SUPPORTED_TYPES: ContentType[] = queryEnabledTypes()

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

/* ---------------- 形状族派生（registry 是唯一事实源，本文件不写死类型名） ----------------
 *
 * 族 = descriptorOf(类型).itemType。`word` 与 `vocabulary` 同属 word 族，`reading` 自成一族。
 * 「某类型要查哪些包」= `getAllPackages()` 里 manifest.type 落在同族类型集合内的包。
 */
function packageTypesOf(type: ContentType): ContentType[] {
  const itemType = descriptorOf(type)?.itemType
  if (!itemType) return []
  return (Object.keys(CONTENT_TYPE_REGISTRY) as ContentType[]).filter(
    (t) => CONTENT_TYPE_REGISTRY[t].itemType === itemType,
  )
}

/** 已启用的这些类型覆盖到的**全部包**（按 `getAllPackages()` 注册序 ⇒ word 场景与今天逐字一致） */
function packagesOfTypes(types: ContentType[]): ContentPackage[] {
  const allowed = new Set(types.flatMap(packageTypesOf))
  return allowed.size ? getAllPackages().filter((p) => allowed.has(p.manifest.type)) : []
}

/**
 * word 族的字段取值：**封闭映射**（word / translation / phonetic / definition）。
 * 这批字段是**代码里的接口定义**（`WordHit`），不是内容数据，所以手写映射是对的。
 * 其他族一律走 `hit.fields[field]` —— 字段集是**数据**，不许在代码里写死。
 * 非字符串一律返回 undefined（不做字符串化，避免把数字/对象当文本匹配）。
 */
const WORD_FIELDS: Record<string, (h: WordHit) => string | undefined> = {
  word: (h) => h.word,
  translation: (h) => h.translation,
  phonetic: (h) => h.phonetic,
  definition: (h) => h.definition,
}

function fieldValueOf(hit: ContentHit, field: string): string | undefined {
  if (isWordHit(hit)) return WORD_FIELDS[field]?.(hit)
  const v = hit.fields[field]
  return typeof v === 'string' ? v : undefined
}

/**
 * rank 1/2 的派生规则（与 descriptor.query.match 严格对应）：
 *  - 任一 `mode:'prefix'` 字段 `startsWith(q)` ⇒ rank 1；
 *  - 否则任一 `mode:'substring'` 字段 `includes(q)` ⇒ rank 2；
 *  - 都不命中 ⇒ -1。
 * 对 word 族（match = word(prefix) + translation/definition(substring)）**逐字还原**今天的三档语义。
 */
function matchRank(hit: ContentHit, d: ContentTypeDescriptor | null, q: string): number {
  const specs = d?.query.match ?? []
  for (const spec of specs) {
    if (spec.mode !== 'prefix') continue
    const v = norm(fieldValueOf(hit, spec.field) ?? '')
    if (v && v.startsWith(q)) return 1
  }
  for (const spec of specs) {
    if (spec.mode !== 'substring') continue
    const v = norm(fieldValueOf(hit, spec.field) ?? '')
    if (v && v.includes(q)) return 2
  }
  return -1
}

/** 精确命中（rank 0）：非 word 族按 `descriptor.query.index` 的 exact 字段逐个比对。
 *  用 Set 去重由调用方负责（同一条 hit 不许因多个 exact 声明被收两次）。 */
function isExactHit(hit: ContentHit, d: ContentTypeDescriptor | null, q: string): boolean {
  return (d?.query.index ?? []).some(
    (spec) => spec.mode === 'exact' && norm(fieldValueOf(hit, spec.field) ?? '') === q,
  )
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

/**
 * 启用类型 + packageId（裸 id / ContentId）+ namespace → 目标包。
 *
 * ⚠️ **关键**：`pkgs` 最终一定按 `allowed`（族集合）过滤 —— 即使调用方显式指定了一个
 * **异族** 的 packageId 也要滤掉。否则 `list({type:'word', packageId:'demo-reading-01'})`
 * 会返回 reading 条目（"返回别的类型的数据"的静默错数据，裁定 §⑨-1）。
 * 未登记包 / 无启用类型 → 空数组。
 */
function scopePackages(types: ContentType[], packageId?: string, namespace?: string): ContentPackage[] {
  const allowed = new Set(types.flatMap(packageTypesOf))
  if (!allowed.size) return []
  let pkgs: ContentPackage[] = packageId
    ? [getPackage(packageId)].filter((p): p is ContentPackage => !!p)
    : packagesOfTypes(types)
  pkgs = pkgs.filter((p) => allowed.has(p.manifest.type))
  if (namespace) pkgs = pkgs.filter((p) => parseContentId(p.manifest.id)?.namespace === namespace)
  return pkgs
}

/** tag 过滤：命中任一 tag 即入选（tags 为空表示不过滤） */
function scopeTags(pkgs: ContentPackage[], tags?: string[]): ContentPackage[] {
  if (!tags?.length) return pkgs
  return pkgs.filter((p) => tags.some((t) => p.manifest.tags.includes(t)))
}

/** 参与排序的一行：hit + 相关性分组（rank）+ 包内序号（ord，updated 排序与 tie-break 用） */
interface Row {
  hit: ContentHit
  /** 0=精确命中 / 1=前缀 / 2=子串；list 恒为 0 */
  rank: number
  /** 包内数据序号（原始顺序） */
  ord: number
}

/** 包 → (条目 id → 包内序号)：精确命中不经过 pool 时用它补齐 ord，保证 tie-break 唯一 */
function ordinalsOf(pkgs: ContentPackage[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pkgs) idsByPackage(p.localId).forEach((id, i) => m.set(id, i))
  return m
}

/**
 * 取给定包集合的候选集（索引顺序 = 包注册序 + 包内数据序），全部经 finder 访问索引。
 * `pkgs` 由调用方算好传入（避免重复算 scope）。
 *
 * `hasPhonetic` 是 **word 族专属**过滤（词级概念，注册表里没有这个维度）：
 * 非 word 族**不参与筛选**（不是"被筛成空"）—— 否则 `list({type:'reading', hasPhonetic:true})`
 * 会静默变成 []，看起来像"没有结果"，不会有人怀疑（裁定 §⑨-6①）。
 */
async function poolEntries(pkgs: ContentPackage[], hasPhonetic?: boolean): Promise<Row[]> {
  if (!pkgs.length) return []
  await ensureIndex(pkgs.map((p) => p.localId))
  const out: Row[] = []
  for (const p of pkgs) {
    const hits = findByPackage(p.localId)
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i]
      if (hasPhonetic && isWordHit(hit) && !hit.phonetic) continue
      out.push({ hit, rank: 0, ord: i })
    }
  }
  return out
}

/**
 * 排序（分页之前调用）：
 *  - relevance（默认）：保持 精确词形 > 前缀 > 释义/翻译 的分组，**组内 tie-break 按
 *    (词形, packageLocalId, 包内序号) 升序** ⇒ deterministic；
 *  - word：按 normalizeWord 字典序升序，tie-break 按 packageLocalId → 包内序号。
 *    ⚠️ 这是**词形排序**，属 word 族专属 ⇒ **非 word hit 不参与该主序**（退回 rank 主序），
 *    与 `hasPhonetic` 同一条中性规则（不是把非 word 排成空/乱序）。
 *  - updated：当前词表**没有**词级 updatedAt 字段，故规定退化为「按包内原始词序（数据
 *    顺序）」，主序 = (packageLocalId, 包内序号)。⚠️ 这不是「按更新时间排序」，只是
 *    在数据接入前给翻页一个确定顺序；**词级 updatedAt 接入后改为按时间戳**，
 *    届时必须同步修改本注释与 tests/content-query.mjs【12】。不要在此基础上编造语义。
 *  - order:'desc'：只反转主序，**tie-break 恒升序**，保证确定性不被破坏。
 *
 * tie-break 铁律（分页确定性）：`(主文本, packageLocalId, ord)` 组合必须唯一且恒升序。
 * 主文本 word 族取 `norm(word)`，非 word 族取 `title`（title 是唯一所有族都有的文本字段）。
 */
function sortRows(rows: Row[], sort?: SortField | SortSpec): ContentHit[] {
  const { field, order } = parseSort(sort)
  const flip = order === 'desc' ? -1 : 1
  return [...rows]
    .sort((a, b) => {
      let primary = 0
      if (field === 'relevance') primary = a.rank - b.rank
      else if (field === 'word') {
        // 词形主序只对 word 族成立；任一侧非 word ⇒ 退回 rank 主序（中性，不制造新语义）
        primary =
          isWordHit(a.hit) && isWordHit(b.hit)
            ? cmpText(norm(a.hit.word), norm(b.hit.word))
            : a.rank - b.rank
      } else primary = cmpText(a.hit.packageLocalId, b.hit.packageLocalId) || a.ord - b.ord
      if (primary) return primary * flip
      // tie-break 恒升序：(主文本, packageLocalId, 包内序号) —— 三者组合唯一 ⇒ 顺序完全确定
      return (
        cmpText(tieText(a.hit), tieText(b.hit)) ||
        cmpText(a.hit.packageLocalId, b.hit.packageLocalId) ||
        a.ord - b.ord
      )
    })
    .map((r) => r.hit)
}

/** tie-break 主文本：word 族用归一化词形，其他族用 title（所有族都有的文本字段） */
function tieText(hit: ContentHit): string {
  return isWordHit(hit) ? norm(hit.word) : hit.title
}

function paginate<T>(rows: T[], page?: number, pageSize?: number): T[] {
  if (!pageSize) return rows
  const p = Math.max(1, page ?? 1)
  return rows.slice((p - 1) * pageSize, p * pageSize)
}

/* ---------------- 统一入口 ---------------- */

/** 统一搜索：精确命中 > 前缀 > 子串（rank 与扫描字段全部由 descriptor.query 派生）；
 *  未放开的类型返回 []。 */
export async function search(opts: QueryOptions): Promise<ContentHit[]> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return []
  const q = norm(opts.query ?? '')
  if (!q) return []

  const pkgs = scopeTags(scopePackages(types, scope.packageId, scope.namespace), scope.tags)
  if (!pkgs.length) return []
  await ensureIndex(pkgs.map((p) => p.localId))
  const inScope = new Set(pkgs.map((p) => p.localId))
  // hasPhonetic 是 word 族专属：非 word 族不参与筛选（否则会被静默筛成空）
  const keep = (h: ContentHit) => inScope.has(h.packageLocalId) && (!opts.hasPhonetic || !isWordHit(h) || !!h.phonetic)
  // 每个 hit 的 descriptor 按**它所属包**取（type:'all' 下会混族）
  const descOf = new Map(pkgs.map((p) => [p.localId, descriptorOf(p.manifest.type)]))

  const rows: Row[] = []
  const seen = new Set<string>()
  const ordMap = ordinalsOf(pkgs)
  // rank 0（word 族）：精确词形走 byWord 倒排表 —— O(命中数)，不再逐条扫 9346 词
  for (const hit of findByWord(q)) {
    if (!keep(hit) || seen.has(hit.id)) continue
    seen.add(hit.id)
    rows.push({ hit, rank: 0, ord: ordMap.get(hit.id) ?? 0 })
  }
  // pool 扫描：非 word 族的 rank 0（descriptor.query.index 的 exact 字段）+ 全族的 rank 1/2。
  // exact 模式下若作用域内没有非 word 族包，无需扫 pool（保持精确检索的高效特征）。
  const hasNonWordScope = pkgs.some((p) => descriptorOf(p.manifest.type)?.itemType !== 'word')
  const pool = !opts.exact || hasNonWordScope ? await poolEntries(pkgs, false) : []
  for (const { hit, ord } of pool) {
    if (seen.has(hit.id)) continue
    const d = descOf.get(hit.packageLocalId) ?? null
    if (isWordHit(hit)) {
      // word 族精确已由倒排收集；词形全等的条目即使被 hasPhonetic 滤掉，也不降级成前缀命中（旧语义）
      if (norm(hit.word) === q) continue
    } else if (isExactHit(hit, d, q)) {
      // rank 0（非 word 族）：descriptor.query.index 里 mode='exact' 的字段逐个比对（用 seen 去重）
      seen.add(hit.id)
      rows.push({ hit, rank: 0, ord })
      continue
    }
    if (opts.exact) continue
    const rank = matchRank(hit, d, q)
    if (rank < 0) continue
    seen.add(hit.id)
    rows.push({ hit, rank, ord })
  }
  // 排序 → 分页：顺序不可颠倒（先切页再排序会重项 / 漏项）
  return paginate(sortRows(rows, opts.sort), opts.page, opts.pageSize)
}

/** 统一浏览：按包 / namespace / tag + 音标过滤（音标仅 word 族）→ 排序 → 分页；未放开的类型返回 [] */
export async function list(opts: QueryOptions): Promise<ContentHit[]> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return []
  const pkgs = scopeTags(scopePackages(types, scope.packageId, scope.namespace), scope.tags)
  const rows = await poolEntries(pkgs, opts.hasPhonetic)
  return paginate(sortRows(rows, opts.sort), opts.page, opts.pageSize)
}

/** 统一单条寻址：按 ContentId 取；未放开的类型 / 非法 id / 未命中返回 null */
export async function get(contentId: string): Promise<ContentHit | null> {
  const parsed = parseContentId(contentId)
  if (!parsed) return null
  if (!SUPPORTED_TYPES.includes(parsed.type)) return null
  // word 族：路径与语义逐字不变（含 ①② 两段大小写口径）
  if (parsed.type === 'word') return getWord(contentId)
  // 非 word 族：定位所属包（namespace 每包唯一）→ ensureIndex → byId 精确命中；未命中即 null。
  // 不做 norm 兜底：条目 id 是**包内本地 id**（不是"词形"），兜底会引入第二套寻址口径。
  const owner = getAllPackages().find((p) => parseContentId(p.manifest.id)?.namespace === parsed.namespace)
  if (!owner) return null
  await ensureIndex([owner.localId])
  return findById(contentId)
}

/** 统一计数：支持 type / packageId / namespace / tags / hasPhonetic 过滤；未放开的类型返回 0。
 *  ⚠️ 必须与 scopePackages/list 同源 —— 否则会出现「count=6 而 list=[]」的自相矛盾（裁定 §⑨-1）。 */
export async function count(opts: QueryOptions = {}): Promise<number> {
  const scope = resolveScope(opts)
  const types = resolveTypes(scope.type)
  if (!types.length) return 0
  const pkgs = scopeTags(scopePackages(types, scope.packageId, scope.namespace), scope.tags)
  if (!pkgs.length) return 0
  if (!opts.hasPhonetic) return pkgs.reduce((sum, p) => sum + p.manifest.stats.items, 0)
  // hasPhonetic 走与 list 同一条路径（§⑨-6① 的中性规则 ⇒ 非 word 包全额计入）
  return (await poolEntries(pkgs, true)).length
}

/**
 * 统一入口聚合（`queryWord` 一并入袋，同时保留 named export —— 设计文档 §4.2 第 5 条）。
 *
 * ⚠️ `queryWord` 是本袋里唯一「位置参数 + 单词形」签名的成员，这是**故意的例外**：
 * 文件头的统一入口原则禁止的是**按内容类型散装增殖**（`searchTopics` / `listAudios` …），
 * 不是禁止新增语义不同的入口。UI 调用它只需包裸 id + 词形，不需要知道 namespace。
 */
export const contentQuery = { search, list, get, count, queryWord }

/* ---------------- 兼容封装（type 固定 'word'，语义与 V4.1-P0 完全一致） ---------------- */

/** 包内词条 → WordHit（ContentId 由包 namespace + 词形计算，大库不预展开全表 id） */
function toHits(localId: string, packageId: string, packageTitle: string, words: { word: string; translation: string; phonetic?: string; definition?: string }[]): WordHit[] {
  return buildHits(localId, packageId, packageTitle, words)
}

/** 搜索词条：跨包检索（同一词在 IELTS/CET/TOEFL 出现会各返回一条，标注来源包）。
 *  排序：精确词形 > 前缀匹配 > 释义/翻译命中（组内按词形 + 包序 tie-break，deterministic）。 */
export async function searchWords(opts: SearchOptions): Promise<WordHit[]> {
  const rows = await search({
    type: 'word',
    query: opts.query,
    packageId: opts.packageId,
    exact: opts.exact,
    pageSize: opts.limit ?? 20,
  })
  // type 固定 'word' ⇒ 结果必然全是 word 族；用 isWordHit 收窄（**不用 as** —— as 会在
  // 将来真的出现混装时静默骗过编译器，filter 则会如实丢掉非 word 行）
  return rows.filter(isWordHit)
}

/** 分页列出包内词条（Word Detail / 词表浏览用） */
export async function listWords(opts: ListOptions): Promise<WordHit[]> {
  const rows = await list({
    type: 'word',
    packageId: opts.packageId,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 50,
    hasPhonetic: opts.hasPhonetic,
  })
  return rows.filter(isWordHit)
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
  // findById 返回 ContentHit（byId 现在全族混装）；id 的 type 段是 'word' ⇒ 必然是 WordHit。
  // 用 isWordHit 做类型桥而非 as：真出现混装时如实返回 null，不静默骗过编译器。
  if (direct && isWordHit(direct)) return direct

  // ② 兜底：调用方传入 lowercase / 未规范化的 id
  const target = norm(parsed.localId)
  for (const p of pkgs) {
    const words = await loadPackage(p.localId)
    const hit = words.find((w) => norm(w.word) === target)
    if (hit) return toHits(p.localId, p.manifest.id, p.manifest.title, [hit])[0]
  }
  return null
}

/**
 * 单词形精确取回（UI 唯一需要的**单条寻址**入口）。
 *
 * 存在理由：`getWord(contentId)` 需要 namespace，而 UI 手上只有 `{ bankId, word }` ——
 * 让 UI 自己拼 namespace 等于泄漏包内部标识，违反 CONTENT_CONTRACT §12.1「UI 只允许
 * 使用三类 API」。同理不能用 `searchWords({ exact })`：它是**检索语义**且返回数组，
 * 未命中给 `[]`，`arr[0]` 为 `undefined` ⇒ 又滑回 `?? { word, translation: '' }`
 * 的静默兜底 —— 那正是本函数要消灭的缺陷。
 *
 * 语义：
 *   1. 作用域锁定在**单个 packageId** 内，不做全库跨包检索（避免同名跨包歧义）
 *   2. 大小写口径与 `getWord` 完全一致：① 原词形精确 → ② `norm` 兜底
 *      ⇒ go-code / ts-code 那 93 条含大写词条（`Oxford` / `Marxist`）同样能取回
 *   3. 未命中**显式返回 null**，绝不返回「空释义词条对象」
 *   4. lazy 包未预热时 `loadPackage` 会 reject（断网是常态）⇒ 内部 try/catch 收敛成
 *      null 并 `console.warn` 留痕，**禁止** reject 冒泡进 React 渲染树
 *
 * **`queryWord` 是 `getWord` 的「不用 ContentId 的薄封装」**：namespace 拼接只发生在
 * Query 层内部，查找逻辑全部复用 `getWord` 的 ① ② 两段，不引入第二套口径。
 * 「成本几乎为零，复用已有全部正确性」是这个入口的主要收益来源。
 *
 * @param packageId 包**裸 id**（'ielts' / 'go-code'），不是 ContentId
 * @param word 词形（原词形优先，大小写不敏感兜底）
 * @returns WordHit | null —— 包不存在 / 词不存在 / 加载失败 一律 null
 */
export async function queryWord(packageId: string, word: string): Promise<WordHit | null> {
  if (!word) return null
  try {
    const pkg = getPackage(packageId)
    if (!pkg) return null
    const ns = parseContentId(pkg.manifest.id)?.namespace ?? pkg.localId
    await ensureIndex([pkg.localId])

    // ① 精确：索引正排表的 key 由 buildHits 写入、与生成侧同源 ⇒ 逐字符一致。
    //    再校验 packageLocalId：防御两个包解析出同一 namespace 时把别人的词条返回回来。
    const direct = findById(wordId(ns, word))
    // wordId 生成的 id 其 type 段恒为 'word' ⇒ 命中必是 WordHit（isWordHit 作类型桥，不用 as）
    if (direct && isWordHit(direct) && direct.packageLocalId === pkg.localId) return direct

    // ② 兜底：调用方传入 lowercase / 未规范化的词形
    const target = norm(word)
    const words = await loadPackage(pkg.localId)
    const hit = words.find((w) => norm(w.word) === target)
    if (!hit) return null
    return buildHits(pkg.localId, pkg.manifest.id, pkg.manifest.title, [hit])[0] ?? null
  } catch (err) {
    // 显式降级而**不静默**：断网 / chunk 拉取失败在这里收敛，同时留下可查的痕迹
    console.warn(`[queryWord] 取词失败，显式降级为 null：${packageId} / ${word}`, err)
    return null
  }
}

/** 词条总数（省略 packageId 时为全库合计） */
export async function countWords(packageId?: string): Promise<number> {
  return count({ type: 'word', packageId })
}
