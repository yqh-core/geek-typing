import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LangProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
)

// PWA：生产环境注册 Service Worker，实现离线可用与秒开
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 注册失败不影响使用 */
    })
  })
}

/* ---------------- SW 空闲期预热大词库 ----------------
 * 首访用户不会在 idle 前点开大词库，chunk 不进 SW 缓存 → 首次离线切换大词库会失败。
 * window load 后借 requestIdleCallback 预拉考研/雅思/托福分包（与 wordBanks.ts 同一
 * 动态 import，产出同一 chunk），SW fetch handler 会顺手 put 进缓存。
 * 移动流量用户（saveData / 2g/3g）跳过，不打爆流量；无 SW 的浏览器预热仍让模块
 * 缓存生效，二次切换零等待。全程异步不阻塞交互。 */
if (import.meta.env.PROD) {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  const slowNetwork = conn?.saveData === true || ['slow-2g', '2g', '3g'].includes(conn?.effectiveType ?? '')
  if (!slowNetwork) {
    const warmBanks = async () => {
      // 等 SW 接管页面（claim）后再拉 chunk：保证预热请求经过 fetch handler 进缓存，
      // 否则首访用户预热发生在控制前 → chunk 不入库 → 首次离线仍切不了大词库
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.ready
          for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) {
            await new Promise((r) => setTimeout(r, 100))
          }
        } catch {
          /* 无 SW 环境直接预热（模块缓存仍生效） */
        }
      }
      Promise.allSettled([import('./data/ielts'), import('./data/kaoyan'), import('./data/toefl')]).catch(() => {})
    }
    window.addEventListener('load', () => {
      const ric = (window as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback
      if (ric) ric(() => void warmBanks(), { timeout: 4000 })
      else window.setTimeout(() => void warmBanks(), 2000)
    })
  }
}
