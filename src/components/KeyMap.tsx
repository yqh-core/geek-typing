import type { ThemeConfig } from '../lib/theme'

/** 标准指法分区：0=左手小指 … 7=右手小指 */
const ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const FINGER_OF: Record<string, number> = {
  q: 0, a: 0, z: 0,
  w: 1, s: 1, x: 1,
  e: 2, d: 2, c: 2,
  r: 3, f: 3, v: 3, t: 3, g: 3, b: 3,
  y: 4, h: 4, n: 4, u: 4, j: 4, m: 4,
  i: 5, k: 5,
  o: 6, l: 6,
  p: 7,
}

/** 八个手指的淡色底，用于暗示该用哪根手指 */
const FINGER_TINT = [
  'rgba(248,113,113,.14)', // red-400
  'rgba(251,146,60,.14)', // orange
  'rgba(250,204,21,.14)', // yellow
  'rgba(74,222,128,.14)', // green
  'rgba(56,189,248,.14)', // sky
  'rgba(129,140,248,.14)', // indigo
  'rgba(192,132,252,.14)', // purple
  'rgba(244,114,182,.14)', // pink
]

interface KeyMapProps {
  theme: ThemeConfig
  /** 下一个该敲的字母 */
  nextKey: string | null
  /** 刚敲错的键，用于闪红 */
  wrongKey: string | null
  /** 兼容旧调用：是否使用紧凑尺寸（已废弃，现自动响应式） */
  compact?: boolean
}

export default function KeyMap({ theme, nextKey, wrongKey, compact }: KeyMapProps) {
  return (
    <div className={`select-none w-full max-w-full px-2 ${compact ? 'opacity-80' : ''}`} data-testid="keymap" aria-hidden="true">
      <div className="flex flex-col items-center gap-1 sm:gap-1.5">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1 sm:gap-1.5">
            {row.map((k) => {
              const active = nextKey?.toLowerCase() === k
              const wrong = wrongKey?.toLowerCase() === k
              const base =
                'w-[7.6vw] max-w-[44px] min-w-[26px] sm:w-11 h-8 sm:h-11 rounded-md sm:rounded-lg flex items-center justify-center text-[11px] sm:text-sm font-semibold uppercase border transition-all duration-100'
              return (
                <span
                  key={k}
                  data-key={k}
                  data-active={active ? 'true' : undefined}
                  style={{
                    backgroundColor: active ? 'rgba(52,211,153,.35)' : FINGER_TINT[FINGER_OF[k] ?? 3],
                    borderColor: active
                      ? '#34d399'
                      : wrong
                        ? '#f87171'
                        : 'transparent',
                    color: active ? '#ecfdf5' : undefined,
                    boxShadow: active ? '0 0 12px rgba(52,211,153,.45)' : undefined,
                    transform: active ? 'translateY(-2px) scale(1.06)' : undefined,
                  }}
                  className={`${base} ${active ? '' : theme.pending}`}
                >
                  {k}
                </span>
              )
            })}
          </div>
        ))}
        <div className="text-[11px] tracking-widest uppercase opacity-50 mt-1">请用标准指法敲击</div>
      </div>
    </div>
  )
}
