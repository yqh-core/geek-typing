/* V4.1 · Content Query Layer —— 统一内容检索层（V4.1-P0 核心；P0.5 升级为统一入口）。
 *
 * 定位：Content Package → Content Registry → **Content Query** → Learning Engine → UI
 * UI（含未来的 Word Detail / Search / Filter）只能通过本层检索内容，不得直接持有
 * 词表数组做 filter —— 这样底层数据源从 JSON 换成 IndexedDB / R2 / API 时页面零改动。
 *
 * 数据来源不透明：本层只调 registry.loadPackage() / ContentIndex，不感知 JSON/远程/CDN。
 *
 * ⚠️ 统一入口原则（写死，别再破例）：
 *   新增内容类型（topic / audio / listening ...）时，在 search/list/get/count 内部扩展分支，
 *   **禁止**再出现 searchTopics() / searchAudios() / listListening() 这类散装 API。
 *   散装 API 每加一类就翻一倍，是上一代代码最贵的债；统一入口 + type 参数让调用方
 *   （UI / Learning Engine）永远只学一套签名。
 *
 * 兼容：searchWords / listWords / getWord / countWords 保留原语义，是统一入口在
 * type='word' 下的薄封装（tests/content-query.mjs 的 42 项契约依赖它们）。
 */
import { getPackage, getVocabularyPackages, loadPackage } from '../registry'
import { parseContentId } from '../model/content'
import type { ContentType } from '../model/content'
import { buildHits, ensureIndex, normalizeWord } from '../index/content-index'
import type { ContentIndex } from '../index/content-index'
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
}

/** 当前统一入口已支持检索的内容类型；新类型在此登记，其它分支自动跟上 */
const SUPPORTED_TYPES: ContentType[] = ['word']

/** 归一化（trim + lowercase + NFC + 空白折叠）—— 与索引 key 必须同源，否则存得进查不到 */
const norm = (s: string) => normalizeWord(s)

/** type → 实际要检索的类型列表；不支持的类型返回空数组（查询结果 [] / count 0） */
function resolveTypes(type: ContentType | 'all'): ContentType[] {
  if (type === 'all') return [...SUPPORTED_TYPES]
  return SUPPORTED_TYPES.includes(type) ? [type] : []
}

/** packageId（裸 id / ContentId）→ 目标包；省略为全部包，未登记为空数组 */
function scopePackages(packageId?: string): VocabularyPackage[] {
  if (!packageId) return getVocabularyPackages()
  const hit = getPackage(packageId)
  return hit ? [hit] : []
}

/** tag 过滤：命中任一 tag 即入选（tags 为空表示不过滤） */
function scopeTags(pkgs: VocabularyPackage[], tags?: string[]): VocabularyPackage[] {
  if (!tags?.length) return pkgs
  return pkgs.filter((p) => tags.some((t) => p.manifest.tags.includes(t)))
}

/** 取当前过滤条件下的候选集（索引已覆盖目标包时按包顺序展开，保持与老实现一致的排序） */
async function poolOf(opts: QueryOptions): Promise<WordHit[]> {
  const pkgs = scopeTags(scopePackages(opts.packageId), opts.tags)
  if (!pkgs.length) return []
  const idx: ContentIndex = await ensureIndex(pkgs.map((p) => p.localId))
  const out: WordHit[] = []
  for (const p of pkgs) {
    for (const id of idx.byPackage.get(p.localId) ?? []) {
      const hit = idx.byId.get(id)
      if (hit) out.push(hit)
    }
  }
  return opts.hasPhonetic ? out.filter((h) => !!h.phonetic) : out
}

function paginate<T>(rows: T[], page?: number, pageSize?: number): T[] {
  if (!pageSize) return rows
  const p = Math.max(1, page ?? 1)
  return rows.slice((p - 1) * pageSize, p * pageSize)
}

/* ---------------- 统一入口 ---------------- */

/** 统一搜索：词形精确 > 前缀 > 释义/翻译命中；不支持的类型返回 [] */
export async function search(opts: QueryOptions): Promise<WordHit[]> {
  const types = resolveTypes(opts.type ?? 'word')
  if (!types.length) return []
  const q = norm(opts.query ?? '')
  if (!q) return []

  const pkgs = scopeTags(scopePackages(opts.packageId), opts.tags)
  if (!pkgs.length) return []
  const idx = await ensureIndex(pkgs.map((p) => p.localId))
  const scope = new Set(pkgs.map((p) => p.localId))
  const keep = (h: WordHit) => scope.has(h.packageLocalId) && (!opts.hasPhonetic || !!h.phonetic)

  const exact: WordHit[] = []
  // 精确词形走 byWord 倒排表：O(命中数)，不再逐条扫 9346 词
  for (const id of idx.byWord.get(q) ?? []) {
    const hit = idx.byId.get(id)
    if (hit && keep(hit)) exact.push(hit)
  }
  const prefix: WordHit[] = []
  const loose: WordHit[] = []
  if (!opts.exact) {
    for (const hit of await poolOf(opts)) {
      const w = norm(hit.word)
      if (w === q) continue // 已由 exact 收集
      if (w.startsWith(q)) prefix.push(hit)
      else if (norm(hit.translation).includes(q) || norm(hit.definition ?? '').includes(q)) loose.push(hit)
    }
  }
  return paginate([...exact, ...prefix, ...loose], opts.page, opts.pageSize)
}

/** 统一下拉/浏览：按包 + tag + 音标过滤后分页；不支持的类型返回 [] */
export async function list(opts: QueryOptions): Promise<WordHit[]> {
  const types = resolveTypes(opts.type ?? 'word')
  if (!types.length) return []
  return paginate(await poolOf(opts), opts.page, opts.pageSize)
}

/** 统一单条寻址：按 ContentId 取；未接入的类型 / 非法 id 返回 null */
export async function get(contentId: string): Promise<WordHit | null> {
  const parsed = parseContentId(contentId)
  if (!parsed) return null
  if (!SUPPORTED_TYPES.includes(parsed.type)) return null
  return getWord(contentId)
}

/** 统一计数：支持 type / packageId / tags / hasPhonetic 过滤；不支持的类型返回 0 */
export async function count(opts: QueryOptions = {}): Promise<number> {
  const types = resolveTypes(opts.type ?? 'word')
  if (!types.length) return 0
  const pkgs = scopeTags(scopePackages(opts.packageId), opts.tags)
  if (!pkgs.length) return 0
  if (!opts.hasPhonetic) return pkgs.reduce((sum, p) => sum + p.manifest.stats.items, 0)
  return (await poolOf(opts)).length
}

export const contentQuery = { search, list, get, count }

/* ---------------- 兼容封装（type 固定 'word'，语义与 V4.1-P0 完全一致） ---------------- */

/** 包内词条 → WordHit（ContentId 由包 namespace + 词形计算，大库不预展开全表 id） */
function toHits(localId: string, packageId: string, packageTitle: string, words: { word: string; translation: string; phonetic?: string; definition?: string }[]): WordHit[] {
  return buildHits(localId, packageId, packageTitle, words)
}

/** 搜索词条：跨包检索（同一词在 IELTS/CET/TOEFL 出现会各返回一条，标注来源包）。
 *  排序：精确词形 > 前缀匹配 > 释义/翻译命中。 */
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

  // ① 精确：byId 的 key 就是生成侧写进去的 id，逐字符一致
  const idx = await ensureIndex(pkgs.map((p) => p.localId))
  const direct = idx.byId.get(contentId)
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
