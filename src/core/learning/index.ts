export * from './service'
// P1.6-B：UI 经 core/learning 取 Analytics 类型，不再直连 lib/analytics（B02 边界门禁）
export type { Analytics } from '../../lib/analytics'
// P1.6-B+ 补强（白名单清零）：纯展示助手经唯一入口再导出。
// 这些是**纯函数**（输入状态 → 输出读数，无存储耦合）；经门面桶导出让 UI 彻底
// 不出现 lib/analytics、lib/reviewStore 的值导入。core/learning 本身是门禁放行的桥接层。
export { wordStatOf, accuracyOf, weakLetters, wrongWords } from '../../lib/analytics'
export type { ReviewItemView } from '../../lib/reviewStore'
export type { MemStatus, MemStore } from '../../lib/memorizeStore'
