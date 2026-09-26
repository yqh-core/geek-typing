/**
 * 终端风命令面板（vim / Raycast 风格）：
 * Esc 打开/关闭（由 App 全局监听），真实 <input> 承载输入，Enter 执行，:help 列出全部命令。
 * 所有命令走 App 传入的 state setter，与顶栏下拉同一数据源。
 */
import { useEffect, useRef, useState } from 'react'
import type { ThemeConfig, ThemeId } from '../lib/theme'
import type { SoundTheme } from '../lib/sound'
import type { PracticeModeId } from '../lib/modes'
import type { WordBank } from '../data/wordBanks'
import { getVoicePref, setVoicePref } from '../lib/speech'
import { sound } from '../lib/sound'
import { useT, useLang } from '../i18n'

interface CommandPaletteProps {
  theme: ThemeConfig
  banks: WordBank[]
  bankId: string
  onBankChange: (id: string) => void
  onModeChange: (id: PracticeModeId) => void
  onThemeChange: (id: ThemeId) => void
  soundEnabled: boolean
  onSoundToggle: () => void
  soundTheme: SoundTheme
  onSoundThemeChange: (t: SoundTheme) => void
  shuffled: boolean
  onShuffleToggle: () => void
  onTabChange: (tab: 'typing' | 'memorize') => void
  onRestart: () => void
  onClose: () => void
}

/** 命令速查（双语，en 模式下不残留中文） */
const HELP: Record<'zh' | 'en', string[]> = {
  zh: [
    ':bank [序号|id]  —  切换词库',
    ':mode classic|spell|timed|code',
    ':voice en-US|en-GB',
    ':theme matrix|ide|ink',
    ':sound on|off',
    ':soundtheme mech|thock|8bit',
    ':shuffle on|off',
    ':memorize / :typing',
    ':q  —  重开本轮',
    ':help',
  ],
  en: [
    ':bank [n|id]  —  switch bank',
    ':mode classic|spell|timed|code',
    ':voice en-US|en-GB',
    ':theme matrix|ide|ink',
    ':sound on|off',
    ':soundtheme mech|thock|8bit',
    ':shuffle on|off',
    ':memorize / :typing',
    ':q  —  restart round',
    ':help',
  ],
}

type Notice = { kind: 'info' | 'error'; text: string } | null

export default function CommandPalette({
  theme,
  banks,
  onBankChange,
  onModeChange,
  onThemeChange,
  soundEnabled,
  onSoundToggle,
  soundTheme,
  onSoundThemeChange,
  shuffled,
  onShuffleToggle,
  onTabChange,
  onRestart,
  onClose,
}: CommandPaletteProps) {
  const t = useT()
  const { lang } = useLang()
  const [value, setValue] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const noticeTimer = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 挂载即聚焦；卸载时清掉错误提示计时器
  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  const bankName = (b: WordBank) => (lang === 'en' ? b.nameEn ?? b.name : b.name)

  /** 红字错误提示，1.5s 自动消失 */
  const fail = (text: string) => {
    setNotice({ kind: 'error', text })
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1500)
  }

  /** 执行成功：响一声 + 关面板（焦点由 App 归还页面） */
  const ok = (fn: () => void) => {
    sound.tap()
    fn()
    onClose()
  }

  const exec = (raw: string) => {
    const body = raw.trim().replace(/^:/, '')
    if (!body) return
    const [cmdRaw, ...args] = body.split(/\s+/)
    const cmd = cmdRaw.toLowerCase()
    const arg = (args[0] ?? '').toLowerCase()

    switch (cmd) {
      case 'help':
        setNotice({ kind: 'info', text: HELP[lang].join('\n') })
        return
      case 'bank': {
        if (!arg) {
          setNotice({
            kind: 'info',
            text: banks.map((b, i) => `${i + 1}. ${bankName(b)} · ${b.id}`).join('\n'),
          })
          return
        }
        const n = Number(arg)
        const target =
          Number.isInteger(n) && n >= 1 && n <= banks.length ? banks[n - 1] : banks.find((b) => b.id === arg)
        if (!target) {
          fail(t('cmd.bankNotFound'))
          return
        }
        ok(() => onBankChange(target.id))
        return
      }
      case 'mode':
        if (arg === 'classic' || arg === 'spell' || arg === 'timed' || arg === 'code') {
          ok(() => onModeChange(arg))
        } else {
          fail(':mode classic|spell|timed|code')
        }
        return
      case 'voice':
        if (arg === 'en-us' || arg === 'en-gb') {
          // arg 已被小写化，这里还原成规范的偏好写法
          const want = arg === 'en-gb' ? 'en-GB' : 'en-US'
          if (want !== getVoicePref()) ok(() => setVoicePref(want))
          else onClose()
        } else {
          fail(':voice en-US|en-GB')
        }
        return
      case 'theme':
        if (arg === 'matrix' || arg === 'ide' || arg === 'ink') {
          ok(() => onThemeChange(arg))
        } else {
          fail(':theme matrix|ide|ink')
        }
        return
      case 'sound':
        if (arg === 'on' || arg === 'off') {
          const want = arg === 'on'
          if (want !== soundEnabled) ok(onSoundToggle)
          else onClose()
        } else {
          fail(':sound on|off')
        }
        return
      case 'soundtheme':
        if (arg === 'mech' || arg === 'thock' || arg === '8bit') {
          if (arg !== soundTheme) ok(() => onSoundThemeChange(arg))
          else onClose()
        } else {
          fail(':soundtheme mech|thock|8bit')
        }
        return
      case 'shuffle':
        if (arg === 'on' || arg === 'off') {
          const want = arg === 'on'
          if (want !== shuffled) ok(onShuffleToggle)
          else onClose()
        } else {
          fail(':shuffle on|off')
        }
        return
      case 'memorize':
        ok(() => onTabChange('memorize'))
        return
      case 'typing':
        ok(() => onTabChange('typing'))
        return
      case 'q':
        ok(onRestart)
        return
      default:
        fail(t('cmd.unknown'))
    }
  }

  return (
    <div
      data-testid="command-palette"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4"
    >
      {notice && (
        <div
          data-testid={notice.kind === 'error' ? 'command-error' : 'command-notice'}
          className={`mb-2 rounded-xl border px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap shadow-2xl backdrop-blur-md bg-black/80 ${
            notice.kind === 'error' ? 'border-red-500/60 text-red-400' : `${theme.border} ${theme.accent}`
          }`}
        >
          {notice.text}
        </div>
      )}
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${theme.border} bg-black/70 backdrop-blur-md shadow-2xl`}
      >
        <span className={`font-mono text-sm font-bold ${theme.accent}`}>:</span>
        <input
          ref={inputRef}
          data-testid="command-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              exec(value)
              setValue('')
            }
          }}
          placeholder={t('cmd.placeholder')}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          style={{ caretColor: theme.accentHex }}
          className="flex-1 bg-transparent outline-none border-none font-mono text-sm text-slate-100 placeholder:opacity-40"
        />
      </div>
    </div>
  )
}
