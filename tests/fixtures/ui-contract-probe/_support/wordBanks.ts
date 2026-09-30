/**
 * 合成夹具（**非探针**）：替身 `src/data/wordBanks` 的**形状与导出名**。
 *
 * 只提供类型与标识符，**不实现行为** —— 因此本文件自身在六桶上**恒为 0**，
 * 不会污染探针的逐文件期望计数（探针模式下扫描根下所有 .ts 都进判定）。
 *
 * 导出名与真实模块一致，才能让 `wordTableSources` ②（「从 wordBanks 值导入的词表 API 标识符」
 * 这条按名锚定的判据）在探针上被真实触发：
 *   TABLE_APIS = WORD_BANKS / bankWordsOf / allLoadedWords / ensureBankWords
 */
export interface WordItem {
  word: string
  translation: string
}

export interface WordBank {
  id: string
  name: string
  words: WordItem[]
}

/** 只是默认词库 id 常量 —— 不是词表读取 API（判据刻意不把它计入 wordTableSources）。 */
export const DEFAULT_BANK_ID = 'ielts'

export const WORD_BANKS: WordBank[] = []

export function bankWordsOf(_bank: WordBank): WordItem[] {
  return []
}

export function allLoadedWords(_banks: WordBank[]): WordItem[] {
  return []
}

export function ensureBankWords(_bank: WordBank): Promise<WordItem[]> {
  return Promise.resolve([])
}
