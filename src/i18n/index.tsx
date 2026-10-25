/**
 * 轻量 i18n：自研实现，不引第三方库。
 * - 语言状态 'zh' | 'en'，持久化到本机存储键 'gt.lang'（P1.7-W2C 起经 settings 通道读写）
 * - 默认语言按 navigator.language 探测
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

/** `<html lang>` 取值：zh→zh-CN、en→en（与静态 index.html 的 lang="zh-CN" 一致，切换后随之更新）。 */
const HTML_LANG: Record<Lang, string> = { zh: 'zh-CN', en: 'en' }

/** 同步文档根语言；SSR / 测试环境无 document 时安全跳过（与 digttsreader applyHtmlLang 同口径）。 */
function applyHtmlLang(l: Lang): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = HTML_LANG[l]
  }
}

/** 初始语言 —— 2026-10-25 产品裁定：Geek Typing 面向中文用户，移除中英文切换功能，UI 钉死中文。
 *  i18n 机制与 en.ts 词条整体保留（零成本、可逆；恢复切换 = 还原本函数 + Header 按钮块）。
 *  存储键 gt.lang 不再读取：任何历史英文偏好在加载时直接失效，属预期行为。 */
function detectLang(): Lang {
  return 'zh'
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
      // 查当前语言字典 → 回退中文 → 兜底 key 本身
      t: (key) => DICTS[lang][key] ?? zh[key] ?? key,
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
