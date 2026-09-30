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
 *  - **分族索引**：条目按**形状族**（descriptorOf(包.type).itemType）落表 ——
 *    word 族进 byId + byWord + byPackage + byTag；其他族只进 byId + byPackage + byTag
 *    （**绝不进 byWord**：这是「非 word 条目不当词形检索」的结构保证，另有测试断言兜底）。
 *    新增内容类型时在此**按族**扩展索引维度（byTag 的词级 tag、byAudio 等），
 *    而不是新增散装 API —— 否则又回到「每加一类就多一套查询函数」的老路。
 */
import { getAllPackages, getPackage, loadPackage, loadPackageData } from '../registry'
import { makeContentId, parseContentId } from '../model/content'
import type { ContentType } from '../model/content'
import { descriptorOf } from '../types/registry'
import { isWordHit } from '../query/content-query'
import type { ContentHit, ContentItemHit, WordHit } from '../query/content-query'

/**
 * ContentIndex —— **internal**：索引的物理结构（当前四张 Map）。
 * 仅观测 / 测试 / 调试可直接读；业务代码（含 Query 层）一律走下面的 finder，
 * 否则「索引内部换成 Trie / 索引落到 Worker」那天要改的调用点会散落全站。
 */
export interface ContentIndex {
  /** ContentId → 条目（全量正排表，get() 与结果物化走这里）。**所有族**都进这张表 */
  byId: Map<string, ContentHit>
  /** 归一化词形（NFC + lowercase + 空白折叠）→ ContentId[]（跨包同词各占一条）。
   *  **只由 word 族写入**；非 word 族不进本表（分族不变量，见文件头）。 */
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

/**
 * 包内**非 word 族**条目 → ContentItemHit（P18-E）。
 *
 * 与 buildHits 的关键差异：
 *  - 条目 id 取 `item.id`（**包内本地键**，不是词形）⇒ 稳定，不随展示文本变化；
 *  - `fields` **保留原条目对象本身**（不是拷贝）—— descriptor 声明的任意字段按名取值
 *    （query 层的 fieldValueOf 消费），字段集是**数据**，不在代码里写死。
 *
 * 载荷合法性是 `content:validate` 的门：这里遇到 `id` 不是非空字符串的行**跳过并留痕**
 * （`console.warn`），不静默、也不抛 —— 运行时崩溃比缺一条更糟（与 content-query.ts 的
 * queryWord 显式降级留痕同一风格）。
 */
export function buildItemHits(
  localId: string,
  packageId: string,
  packageTitle: string,
  itemType: ContentType,
  rows: unknown[],
): ContentItemHit[] {
  const ns = parseContentId(packageId)?.namespace ?? localId
  const out: ContentItemHit[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      console.warn(`[content-index] 跳过非法条目（非对象）：${localId}`, raw)
      continue
    }
    const item = raw as Record<string, unknown>
    const itemId = item.id
    if (typeof itemId !== 'string' || !itemId) {
      console.warn(`[content-index] 跳过非法条目（id 缺失/非字符串）：${localId}`, raw)
      continue
    }
    out.push({
      type: itemType,
      id: makeContentId(itemType, ns, itemId),
      itemId,
      // title 由 content:validate 的 TITLE_FIELD(required) 保证为字符串；
      // 此处不做运行时兜底改写 —— 缺 title 属载荷门失败，不许在索引里静默补默认值。
      title: item.title as string,
      packageId,
      packageLocalId: localId,
      packageTitle,
      fields: item,
    })
  }
  return out
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
      const pkg = getPackage(localId)
      if (!pkg) return
      // 分族判定用**形状**（descriptor.itemType），不是 14 个类型名的 switch ——
      // vocabulary 的条目同样走 word 族（itemType='word'）。
      const itemType = descriptorOf(pkg.manifest.type)?.itemType
      if (!itemType) return
      if (itemType === 'word') {
        // word 族：唯一数据来源 registry.loadPackage（inline 直接命中，lazy 走动态 import + 缓存）
        const words = await loadPackage(localId)
        for (const hit of buildHits(localId, pkg.manifest.id, pkg.manifest.title, words)) {
          index.byId.set(hit.id, hit)
          push(index.byWord, normalizeWord(hit.word), hit.id)
          push(index.byPackage, localId, hit.id)
          for (const tag of pkg.manifest.tags) push(index.byTag, tag, hit.id)
        }
      } else {
        // 其他族：条目通道（items.json）；**不写 byWord**（分族不变量）
        const rows = await loadPackageData(localId)
        for (const hit of buildItemHits(localId, pkg.manifest.id, pkg.manifest.title, itemType, rows)) {
          index.byId.set(hit.id, hit)
          push(index.byPackage, localId, hit.id)
          for (const tag of pkg.manifest.tags) push(index.byTag, tag, hit.id)
        }
      }
      built.add(localId)
    })()
    inflight.set(localId, task)
  }
  await task
  inflight.delete(localId)
}

/** 确保索引覆盖目标包；省略参数则覆盖**全部已注册包**（含非 vocabulary 类型）。返回同一份 ContentIndex（可变单例）。 */
export async function ensureIndex(packageIds?: string[]): Promise<ContentIndex> {
  const targets = packageIds
    ? [...new Set(packageIds.map(resolveLocalId).filter((id): id is string => !!id))]
    : getAllPackages().map((p) => p.localId)
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
    // 只有 word 族 hit 进过 byWord；非 word hit 跳过该步（否则 normalizeWord(hit.word) 会抛 TypeError）
    if (!isWordHit(hit)) continue
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

/* ---------------- 索引访问封装（finder）—— 业务层访问索引的唯一入口 ----------------
 *
 * 写死的原则：**Query 层与任何业务代码只能通过 finder 访问索引**。
 *
 * 为什么必须有这一层：ContentIndex 现在是四张 Map，明天可能是 Trie / FST / SQLite /
 * IndexedDB / 跑在 Worker 里的倒排表（甚至远端搜索 API 的异步 getter）。如果调用点
 * 到处写 `idx.byWord.get(x)` / `idx.byId.get(id)`，换实现时要改的地方就散落在每个
 * 业务文件里，且**总有一处漏改 → 静默丢数据**（最难查的一类缺陷）。封成 finder 后，
 * 内部结构怎么换都只改本文件，Query 层零改动。
 *
 * 语义（与内部 byX 表严格一致，切换实现时不得改变）：
 *  - 命中顺序 = 索引顺序 = 包内词条数据顺序（分页 / 排序契约依赖这个稳定性）；
 *  - 未命中返回 []（findById 返回 null），调用方不必判空；
 *  - 返回的是新数组，调用方改它不会污染索引；
 *  - finder 是**同步**的：调用方需先 await ensureIndex() 覆盖目标包，
 *    未建索引的包表现为「查不到」（与 old 行为一致，不会返回半截数据）。
 */
/** id[] → ContentHit[]（保持索引顺序，跳过已失效的悬空 id） */
function materialize(ids: string[] | undefined): ContentHit[] {
  const out: ContentHit[] = []
  for (const id of ids ?? []) {
    const hit = index.byId.get(id)
    if (hit) out.push(hit)
  }
  return out
}

/** 按 ContentId 取单条；未命中 / 未建索引返回 null */
export function findById(id: string): ContentHit | null {
  return index.byId.get(id) ?? null
}

/** 按归一化词形取全部命中（跨包同词各占一条）；key 必须经 normalizeWord 处理。
 *
 *  `byWord` 由构造（buildOne 的 word 族分支）**只含 word 族 id**；这里的 `filter(isWordHit)`
 *  只是把它表达成**类型桥**（byWord 的值类型是 string[]，物化后是联合类型）。
 *  该不变量另有测试断言兜底（byWord 里不得出现非 word 前缀的 id）。 */
export function findByWord(normalizedWord: string): WordHit[] {
  return materialize(index.byWord.get(normalizedWord)).filter(isWordHit)
}

/** 包内全部条目（裸 localId，如 'cet4' / 'demo-reading-01'） */
export function findByPackage(packageLocalId: string): ContentHit[] {
  return materialize(index.byPackage.get(packageLocalId))
}

/** tag 命中的全部条目（当前 tag 取包 manifest.tags；词级 tag 接入后由索引侧扩展） */
export function findByTag(tag: string): ContentHit[] {
  return materialize(index.byTag.get(tag))
}

/** 按包 namespace（如 'ecdict-ielts'）取全部条目；namespace 每包唯一 ⇒ 最多命中一个包 */
export function findByNamespace(namespace: string): ContentHit[] {
  const pkg = getAllPackages().find((p) => parseContentId(p.manifest.id)?.namespace === namespace)
  return pkg ? findByPackage(pkg.localId) : []
}

/** 包内词条 id 列表（只要 id 不要实体时用，省掉物化成本） */
export function idsByPackage(packageLocalId: string): string[] {
  const arr = index.byPackage.get(packageLocalId)
  return arr ? [...arr] : []
}
