/* V4-P0 · wordBanks.ts = Content Registry 的兼容层。
 *
 * V4.1 起词库数据的唯一定义源是 content/vocabulary/<id>/{manifest,words}.json
 * （经 src/core/content/registry.ts 注册）；本文件保留 V3 的 WordBank 形状与
 * 缓存/加载 API，供既有 UI 与测试零改动运行。不要在本文件添加新的数据内容。
 */
import { getVocabularyPackages, loadPackage } from '../core/content/registry'
import type { WordItem } from '../core/content/schema'

export type { WordItem } from '../core/content/schema'
export { DEFAULT_BANK_ID } from '../core/content/schema'

export interface WordBank {
  id: string
  name: string
  description: string
  /** 英文词库名（en 语言模式下优先显示） */
  nameEn?: string
  descriptionEn?: string
  icon: string
  words: WordItem[]
  /**
   * 大词库异步加载器：words 为空数组占位，首次选中时动态 import 分包。
   * 小词库仍直接持有 words。加载结果缓存在模块级 bankCache，切换不重复请求。
   */
  load?: () => Promise<WordItem[]>
  /** 词数元数据（懒加载词库 words 为占位空数组时，下拉等处显示用） */
  count?: number
}

/** 懒加载词库的模块级缓存：bankId → 已加载词条，二次切换不再请求 */
const bankCache = new Map<string, WordItem[]>()

/** 读取词库当前可用词条：缓存优先，未加载的懒加载词库返回占位空数组 */
export function bankWordsOf(bank: WordBank): WordItem[] {
  return bankCache.get(bank.id) ?? bank.words
}

/** 已加载词集合（所有同步词库 + 缓存中的懒加载词库），供复习轮等需要全量映射处使用 */
export function allLoadedWords(banks: WordBank[]): WordItem[] {
  return banks.flatMap((b) => bankWordsOf(b))
}

/** 确保词库已加载并缓存，返回词条（无 load 的词库直接返回 words） */
export async function ensureBankWords(bank: WordBank): Promise<WordItem[]> {
  const hit = bankCache.get(bank.id)
  if (hit) return hit
  if (!bank.load) return bank.words
  const words = await bank.load()
  bankCache.set(bank.id, words)
  return words
}

/** registry 包 → V3 WordBank 形状（inline 包同步持有 words；lazy 包占位 + load + count）。
 *  nameEn/descriptionEn 仅在与中文不同（即 manifest 有独立英文文案）时输出，保持 V3 形状。 */
export const WORD_BANKS: WordBank[] = getVocabularyPackages().map((pkg) => {
  const { manifest: m, words, load, localId } = pkg
  const bank: WordBank = {
    id: localId,
    name: m.title,
    description: m.description,
    nameEn: m.titleEn === m.title ? undefined : m.titleEn,
    descriptionEn: m.descriptionEn === m.description ? undefined : m.descriptionEn,
    icon: m.icon,
    words: (words ?? []) as WordItem[],
  }
  if (load) {
    // 走 registry.loadPackage：与查询层共享同一份缓存，不产生第二份 3000 词数组
    bank.load = () => loadPackage(localId)
    bank.count = m.stats.items
  }
  return bank
})
