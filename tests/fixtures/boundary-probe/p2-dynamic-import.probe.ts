// 探针 P2（旧探针 2 · **必须判红**）：绕过静态 from 正则的动态导入向量。
// ① await import('...')；② require('...')
declare const require: (spec: string) => unknown

export async function loadAnalyticsLazily() {
  return import('./lib/analytics')
}

export function loadMemorizeLegacy() {
  return require('./lib/memorizeStore')
}
