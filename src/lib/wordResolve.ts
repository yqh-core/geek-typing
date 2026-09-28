/* 复习 / 错题场景的词条解析 —— 全项目**唯一**允许「先贪心、后精确」的取值路径。
 *
 * ## 为什么必须存在（而不是直接使用 queryWord）
 *
 * 错题表 `gt.review.v1` 的形状是 `Record<string, ReviewEntry>`（`reviewStore.ts:22`），
 * **只有裸词形、没有包归属**。而 Query 层的 `queryWord(packageId, word)` 需要 packageId
 * （namespace 不外泄给 UI，CONTENT_CONTRACT §12.1）。于是这里不可避免地要做一次
 * 「候选包枚举」——这个枚举只能有一份实现，否则两个调用点迟早漂移。
 *
 * ## 取值顺序：先零成本、后才付费
 *
 *   ① **已加载词条**（`allLoadedWords`，含用户自定义词库 CustomBank）⇒ 命中即返回
 *   ② 未命中 ⇒ 逐个内容包 `queryWord`（lazy 包在此被按需载入；断网时返回 null）
 *   ③ 全部未命中 ⇒ **显式返回 null**
 *
 * ## ① 为什么不能删（删了就是负优化）
 *
 * 自定义词库**不在 content registry 里**，Query 层根本看不见它们。若把全部逻辑换成
 * `queryWord`，练过自定义词库的词会**整片变成未命中** —— 从「偶尔空释义」退化成
 * 「大面积归零」，比现状更糟。因此 ① 必须与旧行为逐字等价。
 *
 * ## null 的含义（重要）
 *
 * `null` 是**显式未命中**，不是「可以拿空释义占位」。调用方必须处理它：
 * 复习轮里跳过该词 + 计数 + `console.warn`；列表里显示「释义不可用」。
 * **`?? { word, translation: '' }` 这种写法在本文件之后即属违规。**
 */
import { allLoadedWords, type WordBank, type WordItem } from '../data/wordBanks'
import { queryWord } from '../core/content/query/content-query'

/** 已加载词条 → Map（多个一次不过构建，避免逐词重复 flatMap）。键为**原词形**。 */
export function buildLoadedMap(banks: WordBank[]): Map<string, WordItem> {
  return new Map(allLoadedWords(banks).map((w) => [w.word, w]))
}

/**
 * 按词形解析出可渲染词条。
 *
 * @param banks 候选词库集合（含自定义词库；顺序即优先级，与 UI 下拉序一致）
 * @param loadedMap 复用外部已构建的 Map（多个词批量解析时避免重复构建）；省略则现算
 * @returns WordItem | null —— null = 显式未命中，禁止用空释义占位
 */
export async function resolveReviewWord(
  word: string,
  banks: WordBank[],
  loadedMap?: Map<string, WordItem>,
): Promise<WordItem | null> {
  if (!word) return null
  // ① 已加载：同步 Map 命中，零 await ⇒ 对已载词库完全不引入异步开销
  const map = loadedMap ?? buildLoadedMap(banks)
  const direct = map.get(word)
  if (direct) return direct

  // ② 逐个内容包精确寻址（大小写兜底在 queryWord 内部完成）
  for (const b of banks) {
    const hit = await queryWord(b.id, word)
    if (hit) {
      return {
        word: hit.word,
        translation: hit.translation,
        phonetic: hit.phonetic,
        definition: hit.definition,
      }
    }
  }
  // ③ 显式未命中
  return null
}

/**
 * 批量解析 + 分离「命中 / 未命中」。
 *
 * 合并在这里是为了让调用方**不可能忘记**处理未命中 —— 返回值把未命中词单独列出来，
 * 调用方至少可以选择「记录下来」或「渲染占位」，但没法假装它不存在。
 */
export async function resolveReviewWords(words: string[], banks: WordBank[]): Promise<{
  items: WordItem[]
  missed: string[]
}> {
  const loadedMap = buildLoadedMap(banks)
  const resolved = await Promise.all(words.map((w) => resolveReviewWord(w, banks, loadedMap)))
  const items: WordItem[] = []
  const missed: string[] = []
  resolved.forEach((r, i) => {
    if (r) items.push(r)
    else missed.push(words[i])
  })
  if (missed.length > 0) {
    console.warn(`[review] ${missed.length}/${words.length} 个词取不到释义，已显式跳过：${missed.join(', ')}`)
  }
  return { items, missed }
}
