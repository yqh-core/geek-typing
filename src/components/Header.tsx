import { Volume2, VolumeX, Shuffle, ArrowLeftRight, RotateCcw } from 'lucide-react'
import { sound, type SoundTheme } from '../lib/sound'
import { THEME_LIST } from '../lib/theme'
import type { ThemeConfig, ThemeId } from '../lib/theme'
import type { WordBank } from '../data/wordBanks'
import BankManager from './BankManager'
import { useState } from 'react'

const SOUND_THEMES: { id: SoundTheme; label: string }[] = [
  { id: 'mech', label: '青轴' },
  { id: 'thock', label: '麻将音' },
  { id: '8bit', label: '8-bit' },
]

interface HeaderProps {
  theme: ThemeConfig
  banks: WordBank[]
  bankId: string
  onBankChange: (id: string) => void
  onThemeChange: (id: ThemeId) => void
  soundEnabled: boolean
  onSoundToggle: () => void
  soundTheme: SoundTheme
  onSoundThemeChange: (t: SoundTheme) => void
  shuffled: boolean
  onShuffleToggle: () => void
  onRestart: () => void
}

export default function Header(props: HeaderProps) {
  const {
    theme,
    banks,
    bankId,
    onBankChange,
    onThemeChange,
    soundEnabled,
    onSoundToggle,
    soundTheme,
    onSoundThemeChange,
    shuffled,
    onShuffleToggle,
    onRestart,
  } = props

  const [bankOpen, setBankOpen] = useState(false)
  const activeBank = banks.find((b) => b.id === bankId) ?? banks[0]

  const ghostBtn = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs transition-all hover:opacity-80`

  return (
    <header className="w-full max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold tracking-[0.2em] ${theme.accent}`}>GEEK&nbsp;TYPING</span>
          <span className={`hidden sm:inline text-[11px] ${theme.sub}`}>· 敲代码一样背单词</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 词库选择 */}
          <div className="relative">
            <button
              className={ghostBtn}
              onClick={() => {
                sound.tap()
                setBankOpen((v) => !v)
              }}
            >
              <span className={theme.accent}>{activeBank.name}</span>
              <ArrowLeftRight size={13} />
            </button>
            {bankOpen && (
              <div
                className={`absolute right-0 mt-2 w-56 ${theme.card} border ${theme.border} rounded-xl shadow-2xl overflow-hidden z-20 animate-popIn`}
              >
                {banks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      sound.tap()
                      onBankChange(b.id)
                      setBankOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors ${b.id === bankId ? theme.accent : ''}`}
                  >
                    <div className="text-xs font-semibold">{b.name}</div>
                    <div className={`text-[11px] ${theme.sub}`}>{b.description} · {b.words.length} 词</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <BankManager
            theme={theme}
            onBankChange={(id) => {
              setBankOpen(false)
              onBankChange(id)
            }}
          />

          {/* 乱序 */}
          <button
            className={`${ghostBtn} ${shuffled ? theme.accent : theme.sub}`}
            onClick={onShuffleToggle}
            title="切换顺序 / 乱序"
          >
            <Shuffle size={13} />
            {shuffled ? '乱序' : '顺序'}
          </button>

          {/* 重来 */}
          <button className={`${ghostBtn} ${theme.sub}`} onClick={onRestart} title="重新开始本轮">
            <RotateCcw size={13} />
          </button>

          {/* 音效开关 */}
          <button
            className={`${ghostBtn} ${soundEnabled ? theme.accent : theme.sub}`}
            onClick={onSoundToggle}
            title="开关键盘音效"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>

          {/* 音效包 */}
          {soundEnabled && (
            <div className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${theme.border}`}>
              {SOUND_THEMES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    sound.tap()
                    onSoundThemeChange(s.id)
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                    soundTheme === s.id ? `${theme.accent} bg-white/10` : theme.sub
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* 皮肤 */}
          <div className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${theme.border}`}>
            {THEME_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  sound.tap()
                  onThemeChange(t.id)
                }}
                className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                  theme.id === t.id ? `${theme.accent} bg-white/10` : theme.sub
                }`}
                title={t.id === 'ide' ? '伪装成代码编辑器，摸鱼背单词不被发现' : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

        </div>
      </div>
    </header>
  )
}
