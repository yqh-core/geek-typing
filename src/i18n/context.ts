/**
 * LangContext 单独成文件：react(only-export-components) 要求「组件与非组件分文件」，
 * 而 context 属于非组件导出 —— 与 LangProvider 同放 index.tsx 会被判成一条 warning。
 *
 * 依赖方向：context.ts ← index.tsx（LangProvider 注入）/ ← hooks.ts（useLang / useT 消费）。
 * 本文件不 import 任何 i18n 内部模块，无环。
 */
import { createContext } from 'react'
import { zh } from './zh'

export type Lang = 'zh' | 'en'

export interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

export const LangContext = createContext<LangContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: (key) => zh[key] ?? key,
})
