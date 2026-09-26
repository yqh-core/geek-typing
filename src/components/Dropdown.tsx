import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'

interface DropdownProps {
  /** 唯一标识：父组件用 openId 实现同页互斥（开一个关其他） */
  id: string
  /** 当前打开的下拉 id，null 表示全部关闭 */
  openId: string | null
  onOpenChange: (id: string | null) => void
  /** 触发器文案 */
  label: ReactNode
  theme: ThemeConfig
  /** 面板对齐方向，默认 left */
  align?: 'left' | 'right'
  /** 面板宽度，默认 w-56 */
  width?: string
  /** 供 e2e 用的 test id */
  testId?: string
  children: ReactNode
}

/**
 * 通用下拉菜单：点击开合、点击外部关闭、Esc 关闭、同页互斥（受控 openId）。
 */
export default function Dropdown({
  id,
  openId,
  onOpenChange,
  label,
  theme,
  align = 'left',
  width = 'w-56',
  testId,
  children,
}: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const open = openId === id

  // 点击外部关闭 + Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={ref} className="relative">
      <button
        data-testid={testId}
        aria-expanded={open}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all hover:opacity-80 active:scale-95 sm:px-3 ${
          theme.border
        } ${open ? `${theme.accent} bg-white/10` : theme.sub}`}
        onClick={() => {
          onOpenChange(open ? null : id)
        }}
      >
        <span className={open ? theme.accent : ''}>{label}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 ${width} ${
            theme.card
          } border ${theme.border} rounded-xl shadow-2xl overflow-hidden z-30 animate-popIn`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
