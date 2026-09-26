/**
 * 轻量 i18n：自研实现，不引第三方库。
 * - 语言状态 'zh' | 'en'，持久化到 localStorage 'gt.lang'
 * - 默认语言按 navigator.language 探测
 * - t(key) 缺 key 时回退中文，再兜底 key 本身
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { zh } from './zh'
import { en } from './en'

export type Lang = 'zh' | 'en'

/** 双语字典表 */
const DICTS: Record<Lang, Record<string, string>> = { zh, en }

/** 从 localStorage / 浏览器语言探测初始语言 */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('gt.lang')
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    /* 隐私模式下忽略 */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: (key) => zh[key] ?? key,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l)
        try {
          localStorage.setItem('gt.lang', l)
        } catch {
          /* 隐私模式下忽略 */
        }
      },
      // 查当前语言字典 → 回退中文 → 兜底 key 本身
      t: (key) => DICTS[lang][key] ?? zh[key] ?? key,
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/** 取当前语言与切换函数 */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  return useContext(LangContext)
}

/** 取翻译函数 */
export function useT(): (key: string) => string {
  return useContext(LangContext).t
}
