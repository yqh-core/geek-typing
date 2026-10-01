/**
 * 轻量 i18n：自研实现，不引第三方库。
 * - 语言状态 'zh' | 'en'，持久化到本机存储键 'gt.lang'（P1.7-W2C 起经 settings 通道读写）
 * - 默认语言按 navigator.language 探测
 * - t(key) 缺 key 时回退中文，再兜底 key 本身
 *
 * 本文件只导出「类型 + 组件」；Context 在 src/i18n/context.ts，hook（useLang / useT）在 src/i18n/hooks.ts。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { settingsChannel } from '../core/persistence/channels'
import { zh } from './zh'
import { en } from './en'
import { LangContext, type Lang, type LangContextValue } from './context'

export type { Lang }

/** 双语字典表 */
const DICTS: Record<Lang, Record<string, string>> = { zh, en }

/** 从本机存储 / 浏览器语言探测初始语言 */
function detectLang(): Lang {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（settings 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const saved = settingsChannel.read('gt.lang')
    if (saved === 'zh' || saved === 'en') return saved
  } catch (e) {
    // G4-3 零静默失败：读取失败按浏览器语言兜底但留痕（S3 迁移时移除）
    console.warn('[i18n] 语言读取失败，按浏览器语言兜底', e)
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

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
