// 探针 P5（**新**探针 · **必须判红**）：export...from 再导出 + **再导出链**。
// ① 直接再导出禁忌模块（见下第 4 行的 export...from）
// ② 经中间层再导出：中间层自己从 reviewStore 再导出 → export-from-chain
export { summarize } from './lib/analytics'
export { chainMarker } from './_support/barrel'
