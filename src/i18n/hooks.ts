/**
 * i18n 的 hook 出口（useLang / useT）。
 *
 * 与 index.tsx / context.ts 的分工：
 * - 组件 `LangProvider` 留在 src/i18n/index.tsx，本文件只放非组件导出，
 *   避免 react(only-export-components) 把「组件 + 非组件同文件」判成一条 warning。
 * - Context 单独在 src/i18n/context.ts：context 本身也是非组件导出，留在 index.tsx
 *   同样会被判一条 —— 所以三文件分工是 context（值）→ index（组件）/ hooks（消费），
 *   依赖全程单向，无环。
 */
import { useContext } from 'react'
import { LangContext, type Lang } from './context'

/** 取当前语言与切换函数 */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  return useContext(LangContext)
}

/** 取翻译函数 */
export function useT(): (key: string) => string {
  return useContext(LangContext).t
}
