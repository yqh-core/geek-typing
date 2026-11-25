/**
 * 轻量 i18n：自研实现，不引第三方库。
 * - 语言状态 'zh' | 'en'，持久化到本机存储键 'gt.lang'（P1.7-W2C 起经 settings 通道读写）
 * - 首次访问默认 English；显式的 gt.lang 偏好会持久化并优先恢复
 * - t(key) 缺 key 时回退中文，再兜底 key 本身
 * - 语言变化时同步 `<html lang>`（可访问性 / SEO）；映射见 HTML_LANG，SSR 下跳过
 *
 * 本文件只导出「类型 + 组件」；Context 在 src/i18n/context.ts，hook（useLang / useT）在 src/i18n/hooks.ts。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { settingsChannel } from '../core/persistence/channels'
import { zh } from './zh'
import { en } from './en'
import { LangContext, type Lang, type LangContextValue } from './context'

export type { Lang }

/** 双语字典表 */
const DICTS: Record<Lang, Record<string, string>> = { zh, en }

/** `<html lang>` follows the selected locale: zh→zh-CN, en→en. */
const HTML_LANG: Record<Lang, string> = { zh: 'zh-CN', en: 'en' }

/** 同步文档根语言；SSR / 测试环境无 document 时安全跳过（与 digttsreader applyHtmlLang 同口径）。 */
function applyHtmlLang(l: Lang): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = HTML_LANG[l]
  }
}

/** Restore an explicit language choice; first-time visitors start in English. */
function detectLang(): Lang {
  try {
    const saved = settingsChannel.read('gt.lang')
    if (saved === 'en' || saved === 'zh') return saved
  } catch (e) {
    console.warn('[i18n] language preference read failed; using English', e)
  }
  return 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  // 首帧与每次语言切换后同步 <html lang>（覆盖初始探测 + 所有 setLang 路径，不止 Header 点击）。
  useEffect(() => { applyHtmlLang(lang) }, [lang])

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l)
        try {
          settingsChannel.write('gt.lang', l)
        } catch (e) {
          // G4-3 零静默失败：隐私模式写入失败必须可观测（S3 迁移时移除）
          console.warn('[i18n] 语言偏好写入失败', e)
        }
      },
      // 查当前语言字典 → 回退英文 → 兜底 key 本身
      t: (key) => DICTS[lang][key] ?? en[key] ?? key,
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
