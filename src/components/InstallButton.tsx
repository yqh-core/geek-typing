/* PWA 安装入口 —— 顶栏的一枚图标按钮 + 手动安装说明浮层。
 *
 * ⛔ **永远渲染入口**（唯一例外：已装成 standalone ⇒ 入口消失）。理由见
 * `useInstallCapability` 顶部注释：`beforeinstallprompt` 在 iOS Safari 与任何自动化
 * 环境里都永不触发，「不支持就不渲染」会让这两类环境**永久看不到入口**——
 * 而 iOS Safari 恰恰是「装到桌面」最主流的路径。
 *
 * ⛔ 因此点击行为分两路：
 *   - `promptable`：调原生 `prompt()` 唤起系统安装对话框；
 *   - `manual`：弹本组件自带的说明浮层，按平台给不同的手动步骤（iOS 与桌面步骤完全不同，
 *     给错步骤等于没给）。i18n 里按平台/能力分开文案，不做「一句话糊弄」。
 *
 * 入口挂在顶栏而非落地块：`#seo-home` 由 scripts/seo/home-landing.*.mjs 生成并有 10 条
 * 门禁判据（位置/正文/零 script/体积/移动端…），往里塞交互元素会破坏「爬虫不执行 JS
 * 也能读全部正文」的性质，也会把 React 逻辑搅进静态产物生成链路。
 */
import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { useInstallCapability } from '../hooks/useInstallCapability'
import { useT } from '../i18n/hooks'

interface InstallButtonProps {
  theme: ThemeConfig
}

/**
 * 手动安装说明的目标平台。iOS Safari 只能走「分享 → 添加到主屏幕」，桌面 Chromium
 * 走「地址栏安装图标 / 菜单 → 安装」，Android Chromium 走「菜单 → 安装应用」。
 * 用 UA 而非 `navigator.userAgentData`：后者是 Chromium 独有的非标准扩展，
 * 在 iOS Safari 上不存在 —— 而 iOS 恰恰是最需要被正确识别的一支。
 */
type ManualPlatform = 'ios' | 'android' | 'desktop'

function detectPlatform(): ManualPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent ?? ''
  // iPadOS 13+ 默认上报桌面版 Safari，用「触点数 > 1」把它与真Mac 分开
  const iOSLike = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (iOSLike) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export default function InstallButton({ theme }: InstallButtonProps) {
  const t = useT()
  const { capability, promptInstall } = useInstallCapability()
  const [hintOpen, setHintOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  /* 点击外部 / Esc 关闭说明浮层（与 Dropdown 同一套交互语义，但自带状态、不占顶栏的
   * openId 互斥槽位 —— 安装入口与三个导航下拉是不同性质的动作，混进互斥会让「关掉下拉」
   * 顺手把安装说明也收走）。 */
  useEffect(() => {
    if (!hintOpen) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setHintOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHintOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [hintOpen])

  /* 已安装 ⇒ 入口消失（这是唯一的不渲染分支） */
  if (capability === 'installed') return null

  const onClick = () => {
    if (capability === 'promptable') {
      void promptInstall()
      return
    }
    setHintOpen((v) => !v)
  }

  /* 平台探测在渲染期算一次即可（同一 tick 内重复探测没有意义，iOS 判定还要读 maxTouchPoints） */
  const platform = detectPlatform()
  const hintKey =
    platform === 'ios'
      ? 'install.manualIos'
      : platform === 'android'
        ? 'install.manualAndroid'
        : 'install.manualDesktop'

  return (
    <div ref={panelRef} className="relative">
      <button
        data-testid="install-app"
        onClick={onClick}
        title={t('install.title')}
        aria-label={t('install.title')}
        aria-expanded={hintOpen}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs ${theme.sub} transition-all hover:opacity-80 active:scale-95`}
      >
        <Download size={13} />
        <span className="hidden sm:inline">{t('install.button')}</span>
      </button>

      {hintOpen && (
        <div
          data-testid="install-hint"
          className={`absolute right-0 mt-2 w-64 ${theme.card} border ${theme.border} rounded-xl shadow-2xl z-30 p-3 animate-popIn`}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className={`text-xs font-semibold ${theme.accent}`}>{t('install.manualTitle')}</span>
            <button
              data-testid="install-hint-close"
              onClick={() => setHintOpen(false)}
              title={t('install.close')}
              aria-label={t('install.close')}
              className={`shrink-0 ${theme.sub} hover:opacity-80`}
            >
              <X size={13} />
            </button>
          </div>
          <p className={`text-[11px] leading-relaxed ${theme.sub}`}>{t(hintKey)}</p>
        </div>
      )}
    </div>
  )
}