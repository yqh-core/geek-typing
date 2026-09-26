import { useState } from 'react'
import { Volume2, VolumeX, Shuffle, RotateCcw, Check, Plus } from 'lucide-react'
import { sound, type SoundTheme } from '../lib/sound'
import { THEME_LIST } from '../lib/theme'
import type { ThemeConfig, ThemeId } from '../lib/theme'
import type { WordBank } from '../data/wordBanks'
import { MODES, type PracticeModeId } from '../lib/modes'
import { speechSupported } from '../lib/speech'
import type { Analytics } from '../lib/analytics'
import Dropdown from './Dropdown'
import BankManager from './BankManager'
import StatsPanel from './StatsPanel'
import { useT, useLang } from '../i18n'

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
  autoSpeak: boolean
  onAutoSpeakToggle: () => void
  /** 当前练习模式（下拉里高亮用） */
  currentMode: PracticeModeId
  onModeChange: (id: PracticeModeId) => void
  /** 数据面板所需（原 App 内联使用，现由顶栏承载） */
  analytics: Analytics
  onWeakPractice: () => void
  onReviewWord: (word: string) => void
  onReset: () => void
  onRestart: () => void
}

/**
 * v2 顶栏：Logo + 练习/词库/设置三个下拉 + 语言切换 + 重开 + 数据面板。
 * 原平铺的模式按钮、音效包、皮肤全部收进下拉。
 */
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
    autoSpeak,
    onAutoSpeakToggle,
    currentMode,
    onModeChange,
    analytics,
    onWeakPractice,
    onReviewWord,
    onReset,
    onRestart,
  } = props

  const t = useT()
  const { lang, setLang } = useLang()
  // 同页互斥：同一时刻只开一个下拉
  const [openId, setOpenId] = useState<string | null>(null)
  const [bankManagerOpen, setBankManagerOpen] = useState(false)

  const activeBank = banks.find((b) => b.id === bankId) ?? banks[0]

  const itemBtn = (active: boolean) =>
    `w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-center justify-between gap-2 ${
      active ? theme.accent : ''
    }`

  return (
    <header className="w-full max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold tracking-[0.2em] ${theme.accent}`}>
            GEEK&nbsp;TYPING
          </span>
          <span className={`hidden sm:inline text-[11px] ${theme.sub}`}>· {t('app.subtitle')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 练习下拉：模式三选 + 自动发音 */}
          <Dropdown
            id="practice"
            openId={openId}
            onOpenChange={setOpenId}
            label={t('nav.practice')}
            theme={theme}
            testId="dropdown-practice"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                data-testid={`mode-${m.id}`}
                onClick={() => {
                  sound.tap()
                  setOpenId(null)
                  onModeChange(m.id)
                }}
                title={t(`mode.${m.id}Hint`)}
                className={itemBtn(currentMode === m.id)}
              >
                <span className="text-xs font-semibold">{t(`mode.${m.id}`)}</span>
                {currentMode === m.id && <Check size={13} />}
              </button>
            ))}
            {/* 分隔线 */}
            <div className={`border-t ${theme.border} my-1`} />
            {/* 自动发音开关 */}
            {speechSupported() && (
              <button
                data-testid="toggle-autospeak"
                onClick={() => {
                  sound.tap()
                  onAutoSpeakToggle()
                }}
                title={t('toggle.autospeakTitle')}
                className={itemBtn(autoSpeak)}
              >
                <span className="text-xs">
                  {autoSpeak ? '🔊' : '🔇'} {t('toggle.autospeak')}
                </span>
                {autoSpeak && <Check size={13} />}
              </button>
            )}
          </Dropdown>

          {/* 词库下拉：内置 + 自定义 + 导入入口 */}
          <Dropdown
            id="banks"
            openId={openId}
            onOpenChange={setOpenId}
            label={
              <span className="max-w-[8em] truncate sm:max-w-none">
                {lang === 'en' ? activeBank?.nameEn ?? activeBank?.name : activeBank?.name}
              </span>
            }
            theme={theme}
            align="left"
            width="w-64"
            testId="dropdown-banks"
          >
            {banks.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  sound.tap()
                  onBankChange(b.id)
                  setOpenId(null)
                }}
                className={itemBtn(b.id === bankId)}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold truncate">
                    {lang === 'en' ? b.nameEn ?? b.name : b.name}
                  </span>
                  <span className={`block text-[11px] ${theme.sub}`}>
                    {b.words.length} {t('bank.wordsUnit')}
                  </span>
                </span>
                {b.id === bankId && <Check size={13} className="shrink-0" />}
              </button>
            ))}
            <div className={`border-t ${theme.border} my-1`} />
            {/* 导入词库入口：打开 BankManager 弹窗 */}
            <button
              data-testid="open-bank-manager"
              onClick={() => {
                sound.tap()
                setOpenId(null)
                setBankManagerOpen(true)
              }}
              className={`w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-1.5 text-xs ${theme.accent}`}
            >
              <Plus size={13} />
              {t('nav.importBank')}
            </button>
          </Dropdown>

          {/* 设置下拉：主题 + 键盘音 + 音效包 + 乱序 */}
          <Dropdown
            id="settings"
            openId={openId}
            onOpenChange={setOpenId}
            label={t('nav.settings')}
            theme={theme}
            testId="dropdown-settings"
          >
            <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-widest opacity-60">
              {t('settings.theme')}
            </div>
            {THEME_LIST.map((th) => (
              <button
                key={th.id}
                onClick={() => {
                  sound.tap()
                  onThemeChange(th.id)
                }}
                title={th.id === 'ide' ? t('theme.ideTitle') : undefined}
                className={itemBtn(theme.id === th.id)}
              >
                <span className="text-xs font-semibold">{t(`theme.${th.id}`)}</span>
                {theme.id === th.id && <Check size={13} />}
              </button>
            ))}
            <div className={`border-t ${theme.border} my-1`} />
            {/* 键盘音开关 */}
            <button
              onClick={() => {
                sound.tap()
                onSoundToggle()
              }}
              className={itemBtn(soundEnabled)}
            >
              <span className="text-xs flex items-center gap-1.5">
                {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                {t('settings.sound')}
              </span>
              {soundEnabled && <Check size={13} />}
            </button>
            {/* 音效包三选（仅在开启时可见） */}
            {soundEnabled && (
              <div className="flex items-center gap-1 px-3 pb-2">
                {(['mech', 'thock', '8bit'] as SoundTheme[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      sound.tap()
                      onSoundThemeChange(s)
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                      soundTheme === s ? `${theme.accent} bg-white/10` : theme.sub
                    }`}
                  >
                    {t(`sound.${s}`)}
                  </button>
                ))}
              </div>
            )}
            <div className={`border-t ${theme.border} my-1`} />
            {/* 乱序开关 */}
            <button onClick={onShuffleToggle} className={itemBtn(shuffled)}>
              <span className="text-xs flex items-center gap-1.5">
                <Shuffle size={13} />
                {shuffled ? t('settings.shuffle') : t('settings.order')}
              </span>
              {shuffled && <Check size={13} />}
            </button>
          </Dropdown>

          {/* 语言切换 */}
          <div className={`flex items-center p-0.5 rounded-lg border ${theme.border}`}>
            {(['zh', 'en'] as const).map((l) => (
              <button
                key={l}
                data-testid={`lang-${l}`}
                onClick={() => {
                  sound.tap()
                  setLang(l)
                }}
                className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                  lang === l ? `${theme.accent} bg-white/10` : theme.sub
                }`}
              >
                {l === 'zh' ? '中' : 'EN'}
              </button>
            ))}
          </div>

          {/* 重开 */}
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs ${theme.sub} transition-all hover:opacity-80`}
            onClick={onRestart}
            title={t('nav.restart')}
          >
            <RotateCcw size={13} />
          </button>

          {/* 数据面板入口（保持靠右） */}
          <div className="ml-auto">
            <StatsPanel
              theme={theme}
              analytics={analytics}
              onWeakPractice={onWeakPractice}
              onReviewWord={onReviewWord}
              onReset={onReset}
            />
          </div>
        </div>
      </div>

      {/* 自定义词库弹窗（受控打开，不再渲染自带触发按钮） */}
      <BankManager
        theme={theme}
        open={bankManagerOpen}
        onOpenChange={setBankManagerOpen}
        onBankChange={(id) => {
          setBankManagerOpen(false)
          onBankChange(id)
        }}
      />
    </header>
  )
}
