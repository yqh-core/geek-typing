export type ThemeId = 'matrix' | 'ide' | 'ink'

export interface ThemeConfig {
  id: ThemeId
  label: string
  /** 页面底色 */
  root: string
  /** 主卡片背景 */
  card: string
  /** 卡片描边 */
  border: string
  /** 次要文字 */
  sub: string
  /** 未敲击字母 */
  pending: string
  /** 已敲对的字母 */
  correct: string
  /** 光标颜色 */
  caret: string
  /** 强调色文字 */
  accent: string
  /** 强调色原始色值（confetti / caretColor 等需要真实颜色的场景） */
  accentHex: string
  /** 强调色药丸 */
  pill: string
  /** 错误底色 */
  wrongBg: string
  /** 是否 IDE 风格皮肤 */
  ideStyle?: boolean
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  matrix: {
    id: 'matrix',
    label: '黑客荧光',
    root: 'bg-[#0b1120] text-slate-200',
    card: 'bg-slate-900/60 backdrop-blur-sm',
    border: 'border-slate-700/70',
    sub: 'text-slate-400',
    pending: 'text-slate-600',
    correct: 'text-emerald-400',
    caret: 'bg-emerald-400',
    accent: 'text-emerald-400',
    accentHex: '#34d399',
    pill: 'bg-slate-800/80 text-emerald-400 border-slate-700',
    wrongBg: 'bg-red-500/20',
  },
  ide: {
    id: 'ide',
    label: '专注 IDE',
    root: 'bg-[#181818] text-[#d4d4d4]',
    card: 'bg-[#1e1e1e]',
    border: 'border-[#2b2b2b]',
    sub: 'text-[#8b8b8b]',
    pending: 'text-[#6e7681]',
    correct: 'text-[#4ec9b0]',
    caret: 'bg-[#569cd6]',
    accent: 'text-[#569cd6]',
    accentHex: '#569cd6',
    pill: 'bg-[#252526] text-[#4ec9b0] border-[#333]',
    wrongBg: 'bg-[#f14c4c25]',
    ideStyle: true,
  },
  ink: {
    id: 'ink',
    label: '墨水屏',
    root: 'bg-[#f5f3ec] text-[#1f2328]',
    card: 'bg-white',
    border: 'border-[#e3e0d6]',
    sub: 'text-[#6b7280]',
    pending: 'text-[#c2bfb4]',
    correct: 'text-[#0f7b4f]',
    caret: 'bg-[#1f2328]',
    accent: 'text-[#0f7b4f]',
    accentHex: '#0f7b4f',
    pill: 'bg-[#efece3] text-[#0f7b4f] border-[#ddd9cd]',
    wrongBg: 'bg-[#dc262622]',
  },
}

export const THEME_LIST: ThemeConfig[] = [THEMES.matrix, THEMES.ide, THEMES.ink]
