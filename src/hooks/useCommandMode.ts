/* P1.6-D · 命令态 hook —— 从 App.tsx 抽出（Esc 全局切换 打字态 ↔ 命令态）
 *
 * 命令态打开时打字引擎与背单词键盘流都让位（键全给命令行）。
 */
import { useCallback, useEffect, useState } from 'react'

export function useCommandMode() {
  const [commandMode, setCommandMode] = useState(false)

  const closePalette = useCallback(() => {
    setCommandMode(false)
    // 焦点归还页面（输入框卸载后 activeElement 可能残留）
    const el = document.activeElement as HTMLElement | null
    el?.blur()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (commandMode) {
        // 捕获阶段拦截，避免下拉等其它 Esc 处理器再次响应
        e.preventDefault()
        e.stopPropagation()
        closePalette()
        return
      }
      // 已有下拉打开时让它们自己处理 Esc，不抢
      if (document.querySelector('[data-testid^="dropdown-"][aria-expanded="true"]')) return
      // 焦点在表单元素里时不劫持 Esc
      const ae = document.activeElement
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return
      setCommandMode(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [commandMode, closePalette])

  return { commandMode, setCommandMode, closePalette }
}
