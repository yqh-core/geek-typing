/* V4.1 · Content Index —— 内容倒排索引（V4.1-P0.5 新增）。
 *
 * 为什么要有它：Content Query 层每次 search 都全表线性扫描（9346 词 × 逐条字符串比较），
 * 索引把「词形 → id」「包 → id」「tag → id」预先建好，查询从 O(n) 降到 O(1)/O(k)。
 * 更重要的是**换数据源时 Query 层不用动**：将来索引落在 IndexedDB / 远端搜索 API，
 * 只要实现下面这几个 Map 的等价语义（或把 ContentIndex 换成异步 getter），Query 层零改动。
 *
 * 原则：
 *  - 词条数据只经 registry.loadPackage() 取，复用其单份缓存；本文件禁止自己 import 词表，
 *    否则三大库会在内存里出现第二份 3000 词副本；
 *  - 懒构建：ensureIndex() 首次调用才加载目标包，已建过的包不重复加载；
 *  - 当前只索引 word 类型。**新内容类型接入时在此扩展索引维度**（byTag 的词级 tag、
 *    byAudio 等），而不是新增散装 API —— 否则又回到「每加一类就多一套查询函数」的老路。
 */
import { getPackage, getVocabularyPackages, loadPackage } from '../registry'
import { makeContentId, parseContentId } from '../model/content'
import type { WordHit } from '../query/content-query'

export interface ContentIndex {
  /** ContentId → 词条（全量正排表，get() 与结果物化走这里） */
  byId: Map<string, WordHit>
  /** 归一化词形（NFC + lowercase + 空白折叠）→ ContentId[]（跨包同词各占一条） */
  byWord: Map<string, string[]>
  /** packageLocalId → ContentId[] */
  byPackage: Map<string, string[]>
  /** tag → ContentId[]（tag 暂取包 manifest.tags；词级 tag 待数据接入后扩展） */
  byTag: Map<string, string[]>
}

/**
 * 词形归一化 —— 索引 key 与查询词必须走同一个函数，否则「存得进、查不到」。
 *
 * 为什么是这三步：
 *  - NFC：Unicode 同一字符有多种编码写法（é 可以是 U+00E9，也可以是 e + U+0301），
 *    不归一会让「拼写正确」的词查不到自己，属于最典型的静默丢数据；
 *  - lowercase：Apple / apple / APPLE 是同一个词（用户搜索大小写随意）；
 *  - 空白折叠 + trim：首尾多余空格、连续空格、全角/半角空格都要落到同一 key，
 *    否则粘贴进来的 " abandon " 搜不到 abandon。
 */
export function normalizeWord(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 包内词条 → WordHit（ContentId 由包 namespace + 词形计算，大库不预展开全表 id）。
 *  与 Query 层共用同一份构造逻辑，保证索引里的 hit 与老路径逐字段一致。 */
export function buildHits(
  localId: string,
  packageId: string,
  packageTitle: string,
  words: { word: string; translation: string; phonetic?: string; definition?: string }[],
): WordHit[] {
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

/* ---------------- 索引状态（模块级单例，invalidateIndex 可整体或部分重建） ---------------- */
const index: ContentIndex = {
  byId: new Map(),
  byWord: new Map(),
  byPackage: new Map(),
  byTag: new Map(),
}
/** 已建索引的包（裸 localId） */
const built = new Set<string>()
/** 每包的在建 Promise：并发 ensureIndex 时同一包只加载一次 */
const inflight = new Map<string, Promise<void>>()

const push = (m: Map<string, string[]>, key: string, id: string) => {
  const arr = m.get(key)
  if (arr) arr.push(id)
  else m.set(key, [id])
}

/** 裸 id 或 4 段式 ContentId → 包 localId */
function resolveLocalId(id: string): string | undefined {
  return getPackage(id)?.localId
}

async function buildOne(localId: string): Promise<void> {
  if (built.has(localId)) return
  let task = inflight.get(localId)
  if (!task) {
    task = (async () => {
      const pkg = getVocabularyPackages().find((p) => p.localId === localId)
      if (!pkg) return
      // 唯一数据来源：registry.loadPackage（inline 直接命中，lazy 走动态 import + 缓存）
      const words = await loadPackage(localId)
      for (const hit of buildHits(localId, pkg.manifest.id, pkg.manifest.title, words)) {
        index.byId.set(hit.id, hit)
        push(index.byWord, normalizeWord(hit.word), hit.id)
        push(index.byPackage, localId, hit.id)
        for (const tag of pkg.manifest.tags) push(index.byTag, tag, hit.id)
      }
      built.add(localId)
    })()
    inflight.set(localId, task)
  }
  await task
  inflight.delete(localId)
}

/** 确保索引覆盖目标包；省略参数则覆盖全部已注册包。返回同一份 ContentIndex（可变单例）。 */
export async function ensureIndex(packageIds?: string[]): Promise<ContentIndex> {
  const targets = packageIds
    ? [...new Set(packageIds.map(resolveLocalId).filter((id): id is string => !!id))]
    : getVocabularyPackages().map((p) => p.localId)
  for (const id of targets) await buildOne(id)
  return index
}

/**
 * 让索引失效（数据源被替换 / 热更新包 / 测试用）。
 *  - 给 packageId：只清该包（byId 中 packageLocalId 匹配项 + 三张倒排表里的对应 id），
 *    下次 ensureIndex 会重新加载该包；
 *  - 不给参数：全清（含 built 记录），退回到「首次调用才构建」的初始态。
 */
export function invalidateIndex(packageId?: string): void {
  if (!packageId) {
    index.byId.clear()
    index.byWord.clear()
    index.byPackage.clear()
    index.byTag.clear()
    built.clear()
    inflight.clear()
    return
  }
  const localId = resolveLocalId(packageId)
  if (!localId) return
  const drop = new Set(index.byPackage.get(localId) ?? [])
  for (const id of drop) {
    const hit = index.byId.get(id)
    if (!hit) continue
    index.byId.delete(id)
    const wordKey = normalizeWord(hit.word)
    const arr = index.byWord.get(wordKey)
    if (arr) {
      const next = arr.filter((x) => x !== id)
      if (next.length) index.byWord.set(wordKey, next)
      else index.byWord.delete(wordKey)
    }
  }
  index.byPackage.delete(localId)
  // 包级 tag 的倒排条目按 id 剔除（tag 本身可能仍被其它包引用，故只删 id 不删 key）
  for (const [tag, arr] of index.byTag) {
    const next = arr.filter((x) => !drop.has(x))
    if (next.length) index.byTag.set(tag, next)
    else index.byTag.delete(tag)
  }
  built.delete(localId)
  inflight.delete(localId)
}

/** 索引规模（观测用：packages=已建包数，entries=已索引词条数） */
export function getIndexStats(): { packages: number; entries: number } {
  return { packages: built.size, entries: index.byId.size }
}
