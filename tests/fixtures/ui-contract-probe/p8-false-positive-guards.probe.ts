// 探针 P8（**必须放行**）：三条**实测假阳**的守卫 —— 正则方案必错的三种写法。
//
//   ① `LEVELS.filter(...)`：`LEVELS: MasteryLevel[]` 是常量数组，不是 `WordItem[]`
//      （对照 src/components/ReviewPanel.tsx:162）。
//   ② `Record<string, WordStat>` 上的 `.map().filter().sort().slice()`：
//      接收者**不是数组**，但名字像、算子齐 —— 文本正则的完美假阳
//      （对照 src/lib/analytics.ts:259-263）。
//
// 期望：六桶全 0。若本探针判红，说明判据退化成了「按名字/算子猜」的文本方案。
type MasteryLevel = 'new' | 'learning' | 'mastered'
const LEVELS: MasteryLevel[] = ['new', 'learning', 'mastered']
export const ordered = LEVELS.filter((l) => l !== 'new')

type WordStat = { attempts: number; correct: number }
declare const statMap: Record<string, WordStat>
export const ranked = Object.entries(statMap)
  .map(([w, s]) => [w, s] as const)
  .filter(([, s]) => s.attempts > 0)
  .sort()
  .slice(0, 5)
