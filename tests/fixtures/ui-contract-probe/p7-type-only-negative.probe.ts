// 探针 P7（**必须放行**）：仅类型引用 `wordBanks` —— `import type` 与 inline `type` 绑定。
// 无运行时耦合（编译后被完全擦除），不得计入任何桶。
// 期望：六桶全 0。
import type { WordItem } from './_support/wordBanks'
import { type WordBank } from './_support/wordBanks'

export type View = WordItem & WordBank
