// 探针 P5（**必须判红**）：词表句柄的两条**非 `X.words`** 路径。
//
//   · ① 按名锚点 `bankWords`（TABLE_HANDLE_NAMES，= useBank() 返回的词表数组名）
//   · ② 从 `wordBanks` **值导入**的词表 API 标识符（TABLE_APIS）
//   · ② 的透传形态：句柄标识符作为返回值 ⇒ handleReads
//
// 期望：wordTableSources = 2（两处 `api:bankWordsOf`）
//       handleReads = 3（`bankWords[0]` 下标 / `bankWords.length` 成员 / `return bankWordsOf` 透传）
//       其余四桶 = 0
import { bankWordsOf, type WordItem, type WordBank } from './_support/wordBanks'

declare const bankWords: WordItem[]

export function first(): WordItem | undefined {
  return bankWords[0]
}

export function size(): number {
  return bankWords.length
}

export function resolve(bank: WordBank): WordItem[] {
  return bankWordsOf(bank)
}

export function expose() {
  return bankWordsOf
}
