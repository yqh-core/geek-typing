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
  /** 次要文字（含键帽未激活字母，需 ≥4.5） */
  sub: string
  /** 未敲击字母（大文本 ≥3.0；code 模式 16–20px 需 ≥4.5，故按 4.5 取值） */
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
  /** 键帽「下一个该敲」激活态前景色（浅色主题下必须换深字，否则 1.3） */
  keyActiveFg: string
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
    // 原 text-slate-600（#475569）在卡片底 rgb(13,21,38) 上仅 2.40 → 改 #7a8598（卡片 4.89 / 页面底 5.05）
    pending: 'text-[#7a8598]',
    correct: 'text-emerald-400',
    caret: 'bg-emerald-400',
    accent: 'text-emerald-400',
    accentHex: '#34d399',
    pill: 'bg-slate-800/80 text-emerald-400 border-slate-700',
    keyActiveFg: '#ecfdf5',
    wrongBg: 'bg-red-500/20',
  },
  ide: {
    id: 'ide',
    label: '专注 IDE',
    root: 'bg-[#181818] text-[#d4d4d4]',
    card: 'bg-[#1e1e1e]',
    border: 'border-[#2b2b2b]',
    // 原 #8b8b8b 在键帽指法淡色底上仅 3.80 → 改 #949cab（卡片 6.04 / 页面底 6.43 / 键帽最差 4.69）
    sub: 'text-[#949cab]',
    // 原 #6e7681 在 IDE 编辑器 22px 正文上仅 3.63 → 改 #8b949e（卡片 5.42 / 页面底 5.77）
    pending: 'text-[#8b949e]',
    correct: 'text-[#4ec9b0]',
    caret: 'bg-[#569cd6]',
    accent: 'text-[#569cd6]',
    accentHex: '#569cd6',
    pill: 'bg-[#252526] text-[#4ec9b0] border-[#333]',
    keyActiveFg: '#ecfdf5',
    wrongBg: 'bg-[#f14c4c25]',
    ideStyle: true,
  },
  ink: {
    id: 'ink',
    label: '墨水屏',
    root: 'bg-[#f5f3ec] text-[#1f2328]',
    card: 'bg-white',
    border: 'border-[#e3e0d6]',
    // 原 #6b7280 在 #f5f3ec 底上仅 4.35 → 改 gray-600 #4b5563（页面底 6.81 / 白卡 7.56）
    sub: 'text-[#4b5563]',
    // 原 #c2bfb4 在白底上仅 1.84 → 改 #767365（白卡 4.76，仍浅于已敲对的 #0f7b4f=5.29）
    pending: 'text-[#767365]',
    correct: 'text-[#0f7b4f]',
    caret: 'bg-[#1f2328]',
    accent: 'text-[#0f7b4f]',
    accentHex: '#0f7b4f',
    pill: 'bg-[#efece3] text-[#0f7b4f] border-[#ddd9cd]',
    // 浅色主题：激活键帽底是 rgba(52,211,153,.35) 叠在 #f5f3ec 上 = rgb(177,232,207)，深绿字才达标
    keyActiveFg: '#065f46',
    wrongBg: 'bg-[#dc262622]',
  },
}

export const THEME_LIST: ThemeConfig[] = [THEMES.matrix, THEMES.ide, THEMES.ink]
