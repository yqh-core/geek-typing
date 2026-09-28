export * from './service'
// P1.6-B：UI 经 core/learning 取 Analytics 类型，不再直连 lib/analytics（B02 边界门禁）
export type { Analytics } from '../../lib/analytics'
