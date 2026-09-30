// 探针 P3（**必须判红**）：词表来源点 ① —— `X.words` 属性访问（类型为 `WordItem[]`）。
// 同时覆盖两种「句柄读操作」形态：成员读 `.length` 与下标读 `[...]`。
// 期望：wordTableSources = 2，handleReads = 2，其余四桶 = 0。
import type { WordBank } from './_support/wordBanks'

export function count(bank: WordBank): number {
  return bank.words.length
}

export function at(bank: WordBank) {
  return bank.words[0]
}
