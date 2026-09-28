/* P1.6-D · 页签导航 hook —— 从 App.tsx 抽出（WAI-ARIA tablist）
 *
 * ⚠️ 键盘导航的关键约束（真实缺陷教训，勿改）：
 *   **只有方向键 / Home / End 才 preventDefault**。
 *   - Enter / Space 是按钮的原生激活键，浏览器自己合成 click。
 *     若在此处 preventDefault + 手动 setTab，页签会变成「吞键黑洞」：
 *     焦点一旦停在页签上，Space 就再也传不到背单词面板
 *     （离线态3「Space 翻面」因此失败）。
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { sound } from '../lib/sound'

export type TabId = 'home' | 'typing' | 'memorize' | 'review' | 'progress'

/** 页签顺序：键盘 ←/→ 循环导航、Home/End 跳首尾 与 roving tabindex 均以此为准 */
export const TAB_IDS: TabId[] = ['home', 'typing', 'memorize', 'review', 'progress']

export function useTabNav() {
  // V3-P0a：默认落在 Today's Practice 推荐首页
  const [tab, setTab] = useState<TabId>('home')
  /** 页签按钮引用：键盘事件需要把焦点移动到新页签（roving tabindex） */
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})
  /** 键盘导航标记：仅键盘切换页签时抢焦点，鼠标点击不抢 */
  const keyboardNavRef = useRef(false)

  const handleTabKeyDown = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>, id: TabId) => {
    const isNav = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End'
    // Enter / Space：放行，不拦截（原生 click 会触发 onClick 切页签）
    if (!isNav) return
    e.preventDefault() // 拦住方向键滚动页面
    const i = TAB_IDS.indexOf(id)
    let next: TabId = id
    if (e.key === 'ArrowRight') next = TAB_IDS[(i + 1) % TAB_IDS.length]
    else if (e.key === 'ArrowLeft') next = TAB_IDS[(i - 1 + TAB_IDS.length) % TAB_IDS.length]
    else if (e.key === 'Home') next = TAB_IDS[0]
    else next = TAB_IDS[TAB_IDS.length - 1]
    // 自动激活（activation follows focus）：先交接焦点，再切换状态
    keyboardNavRef.current = true
    tabRefs.current[next]?.focus()
    sound.tap()
    setTab(next)
  }, [])

  // 键盘导航后，焦点自动跟随到新的选中页签（鼠标点击路径不触发，保持原观感）
  useEffect(() => {
    if (!keyboardNavRef.current) return
    keyboardNavRef.current = false
    tabRefs.current[tab]?.focus()
  }, [tab])

  return { tab, setTab, tabRefs, handleTabKeyDown }
}
