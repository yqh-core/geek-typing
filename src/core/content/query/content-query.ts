/* V4.1 · Content Query Layer —— 内容检索层（V4.1-P0 核心新增）。
 *
 * 定位：Content Package → Content Registry → **Content Query** → Learning Engine → UI
 * UI（含未来的 Word Detail / Search / Filter）只能通过本层检索内容，不得直接持有
 * 词表数组做 filter —— 这样底层数据源从 JSON 换成 IndexedDB / R2 / API 时页面零改动。
 *
 * 数据来源不透明：本层只调 registry.loadPackage()，不感知 JSON/远程/CDN。
 */
import { getVocabularyPackages, loadPackage } from '../registry'
import { makeContentId, parseContentId } from '../model/content'

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

const norm = (s: string) => s.trim().toLowerCase()

/** 包内词条 → WordHit（ContentId 由包 namespace + 词形计算，大库不预展开全表 id） */
function toHits(localId: string, packageId: string, packageTitle: string, words: { word: string; translation: string; phonetic?: string; definition?: string }[]): WordHit[] {
  // namespace 每包唯一，词条 id = content:word:<包 namespace>:<词形>。
  // 极端兜底：包 id 无法解析时用包 localId（同样唯一），绝不退化成共享 namespace。
  const ns = parseContentId(packageId)?.namespace ?? localId
  return words.map((w) => ({
    id: makeContentId('word', ns, w.word),
    word: w.word,
    translation: w.translation,
    phonetic: w.phonetic,
    definition: w.definition,
    packageId,
    packageLocalId: localId,
    packageTitle,
  }))
}

/** 搜索词条：跨包检索（同一词在 IELTS/CET/TOEFL 出现会各返回一条，标注来源包）。
 *  排序：精确词形 > 前缀匹配 > 释义/翻译命中。 */
export async function searchWords(opts: SearchOptions): Promise<WordHit[]> {
  const q = norm(opts.query)
  if (!q) return []
  const limit = opts.limit ?? 20
  const targets = opts.packageId
    ? getVocabularyPackages().filter((p) => p.localId === opts.packageId || p.manifest.id === opts.packageId)
    : getVocabularyPackages()

  const exact: WordHit[] = []
  const prefix: WordHit[] = []
  const loose: WordHit[] = []
  for (const p of targets) {
    const words = await loadPackage(p.localId)
    const hits = toHits(p.localId, p.manifest.id, p.manifest.title, words)
    for (const h of hits) {
      const w = norm(h.word)
      if (w === q) exact.push(h)
      else if (!opts.exact && w.startsWith(q)) prefix.push(h)
      else if (!opts.exact && (norm(h.translation).includes(q) || norm(h.definition ?? '').includes(q))) loose.push(h)
    }
  }
  return [...exact, ...prefix, ...loose].slice(0, limit)
}

/** 分页列出包内词条（Word Detail / 词表浏览用） */
export async function listWords(opts: ListOptions): Promise<WordHit[]> {
  const pkg = getVocabularyPackages().find((p) => p.localId === opts.packageId || p.manifest.id === opts.packageId)
  if (!pkg) return []
  const words = await loadPackage(pkg.localId)
  const filtered = opts.hasPhonetic ? words.filter((w) => w.phonetic) : words
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = opts.pageSize ?? 50
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize)
  return toHits(pkg.localId, pkg.manifest.id, pkg.manifest.title, slice)
}

/** 按词条 ContentId 取单条（content:word:ecdict-ielts:abandon）。
 *  namespace 每包唯一 ⇒ 该 id 唯一指向一个包（跨包同词各有各的 id，不互相污染）。 */
export async function getWord(contentId: string): Promise<WordHit | null> {
  const parsed = parseContentId(contentId)
  if (!parsed || parsed.type !== 'word') return null
  const pkgs = getVocabularyPackages().filter((p) => parseContentId(p.manifest.id)?.namespace === parsed.namespace)
  for (const p of pkgs) {
    const words = await loadPackage(p.localId)
    const hit = words.find((w) => norm(w.word) === parsed.localId)
    if (hit) return toHits(p.localId, p.manifest.id, p.manifest.title, [hit])[0]
  }
  return null
}

/** 词条总数（省略 packageId 时为全库合计） */
export async function countWords(packageId?: string): Promise<number> {
  const targets = packageId
    ? getVocabularyPackages().filter((p) => p.localId === packageId || p.manifest.id === packageId)
    : getVocabularyPackages()
  let total = 0
  for (const p of targets) total += p.manifest.stats.items
  return total
}
