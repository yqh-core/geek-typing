/**
 * 终端风命令面板（vim / Raycast 风格）：
 * Esc 打开/关闭（由 App 全局监听），真实 <input> 承载输入。
 * 打开即常显命令列表（Raycast 式模糊匹配）：子串命中、前缀优先；
 * ↑↓ 移动选中、Tab 补全命令名、Enter 执行——直接输入完整命令（含参数）回车的老路径保留，两者兼容。
 * 带参命令在部分输入下回车 = 补全「命令名+空格」，不误执行。
 * 所有命令走 App 传入的 state setter，与顶栏下拉同一数据源。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** 错题复习轮：返回是否成功开轮（无到期时由面板提示） */
  onReviewRound: () => boolean
  onClose: () => void
}

/** 命令注册表：withArg = 带参命令（部分输入回车时补全而非执行），描述走 i18n */
interface Cmd {
  name: string
  withArg?: boolean
}

const COMMANDS: Cmd[] = [
  { name: 'review' },
  { name: 'bank', withArg: true },
  { name: 'mode', withArg: true },
  { name: 'voice', withArg: true },
  { name: 'theme', withArg: true },
  { name: 'sound', withArg: true },
  { name: 'soundtheme', withArg: true },
  { name: 'shuffle', withArg: true },
  { name: 'memorize' },
  { name: 'typing' },
  { name: 'q' },
  { name: 'help' },
]

/** 命令速查（双语，:help 用，en 模式下不残留中文） */
const HELP: Record<'zh' | 'en', string[]> = {
  zh: [
    ':review  —  错题复习（艾宾浩斯到期词）',
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
    ':review  —  review due mistakes (Ebbinghaus)',
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
  onReviewRound,
  onClose,
}: CommandPaletteProps) {
  const t = useT()
  const { lang } = useLang()
  const [value, setValue] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const noticeTimer = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 挂载即聚焦；卸载时清掉提示计时器
  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  // 选中项变化时让列表跟随滚动
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selIdx])

  /** 过滤：命令名包含输入子串即命中，前缀命中排前面 */
  const query = value.trim().replace(/^:/, '').trim().toLowerCase().split(/\s+/)[0] ?? ''
  const matched = useMemo(() => {
    if (!query) return COMMANDS
    const prefix: Cmd[] = []
    const contains: Cmd[] = []
    for (const c of COMMANDS) {
      if (c.name.startsWith(query)) prefix.push(c)
      else if (c.name.includes(query)) contains.push(c)
    }
    return [...prefix, ...contains]
  }, [query])
  const selected = matched.length === 0 ? -1 : Math.min(selIdx, matched.length - 1)

  /** 红字错误提示，1.5s 自动消失 */
  const fail = (text: string) => {
    setNotice({ kind: 'error', text })
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1500)
  }

  /** info 提示（1.5s 自动消失，用于轻提示） */
  const info = (text: string) => {
    setNotice({ kind: 'info', text })
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
      case 'review': {
        if (onReviewRound()) ok(() => {})
        else info(t('review.noDue'))
        return
      }
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

  /** Enter 分派：
   * - 输入为空 / 输入了未知命令 → 无操作或走老路径（红字）
   * - 直接输入了完整命令名（含参数）→ 老路径执行（:bank 列词库、:theme ide 生效等）
   * - 部分输入 → 执行选中项：带参命令补全「命令名+空格」不误执行，无参命令直接执行 */
  const onEnter = () => {
    const body = value.trim().replace(/^:/, '')
    if (!body) return
    const parts = body.split(/\s+/)
    const hasArg = parts.length > 1
    const exact = COMMANDS.find((c) => c.name === parts[0].toLowerCase())
    if (hasArg || exact) {
      exec(value)
      setValue('')
      setSelIdx(0)
      return
    }
    const sel = selected >= 0 ? matched[selected] : undefined
    if (!sel) {
      exec(value) // 无命中：老路径给出「未知命令」红字
      setValue('')
      setSelIdx(0)
      return
    }
    if (sel.withArg) {
      sound.tap()
      setValue(`:${sel.name} `)
      setSelIdx(0)
      inputRef.current?.focus()
    } else {
      exec(`:${sel.name}`)
      setValue('')
      setSelIdx(0)
    }
  }

  const bankName = (b: WordBank) => (lang === 'en' ? b.nameEn ?? b.name : b.name)

  return (
    <div
      data-testid="command-palette"
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-xl sm:px-4"
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
          onChange={(e) => {
            setValue(e.target.value)
            setSelIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (matched.length > 0) setSelIdx((i) => Math.min(i + 1, matched.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelIdx((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Tab') {
              e.preventDefault()
              const sel = selected >= 0 ? matched[selected] : undefined
              if (sel) {
                setValue(`:${sel.name}${sel.withArg ? ' ' : ''}`)
                sound.tap()
              }
            }
          }}
          placeholder={t('cmd.placeholder')}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          style={{ caretColor: theme.accentHex }}
          className="flex-1 bg-transparent outline-none border-none font-mono text-base sm:text-sm text-slate-100 placeholder:opacity-40"
        />
      </div>

      {/* 命令列表：常显 + 实时过滤，最多可见 8 条可滚动 */}
      {matched.length > 0 && (
        <div
          ref={listRef}
          data-testid="command-list"
          className={`mt-2 rounded-xl border ${theme.border} bg-black/70 backdrop-blur-md shadow-2xl max-h-56 overflow-y-auto font-mono text-xs`}
        >
          {matched.map((c, i) => (
            <div
              key={c.name}
              data-testid={`command-item-${c.name}`}
              data-selected={i === selected ? 'true' : 'false'}
              aria-selected={i === selected}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault() // 保持输入框焦点
                setSelIdx(i)
                const sel = matched[i]
                if (sel.withArg) {
                  setValue(`:${sel.name} `)
                } else {
                  exec(`:${sel.name}`)
                  setValue('')
                }
                setSelIdx(0)
              }}
              className={`flex items-center gap-3 px-4 py-1.5 cursor-pointer ${
                i === selected ? 'bg-white/10' : ''
              }`}
            >
              <span className={`font-bold shrink-0 ${theme.accent}`}>:{c.name}</span>
              <span className={`truncate ${theme.sub}`}>{t(`cmd.desc.${c.name}`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
