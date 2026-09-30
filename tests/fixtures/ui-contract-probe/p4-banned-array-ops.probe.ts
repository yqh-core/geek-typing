// 探针 P4（**必须判红**）：`WordItem[]` 上的禁用数组算子。
// 刻意写成**换行链式**（与 src/components/Memorize.tsx:53-56 同型）——
// 单行正则在链式换行时只能命中 1/3（漏 filter 与 slice），AST 必须三个都抓到。
//
// 期望：bannedArrayOps = 3（filter / slice / map 各计 1），
//       wordTableSources = 1（`bank.words`），
//       handleReads = 1（只有链首 `.filter` 的接收者直接是句柄 `bank.words`；
//                          `.slice` / `.map` 的接收者是前一级调用的结果，不是句柄本身），
//       其余三桶 = 0。
import type { WordBank } from './_support/wordBanks'

export function pick(bank: WordBank): string[] {
  return bank.words
    .filter((w) => w.word.length > 2)
    .slice(0, 10)
    .map((w) => w.word)
}
