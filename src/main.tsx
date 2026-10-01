import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary'
import { LangProvider } from './i18n'
import { warmUpVocabulary } from './core/content'
import { learningService } from './core/learning'

/* P1.5-S4 §3.5 硬耦合②：M 与读侧切换必须同时 —— 迁移在首屏渲染**之前**完成（或明确放弃），
 * UI 永远不会看到「一半 v1 一半 v2」的中间态。新用户（no-legacy-data）与已迁移用户
 * （marker-present）在同步早退路径瞬间通过；仅老用户首次升级这一次需等待内容包加载。
 * 失败自动放弃（停留 State A，下次启动重试），绝不阻塞使用。 */
void learningService.startupMigration().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <LangProvider>
          <App />
        </LangProvider>
      </AppErrorBoundary>
    </StrictMode>,
  )
})

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
 * window load 后借 requestIdleCallback 预拉 **registry 的 WARMUP_IDS 清单内**分包
 * （当前 = kaoyan / toefl，考研 + 托福；与 wordBanks.ts 同一动态 import，产出同一 chunk），
 * SW fetch handler 会顺手 put 进缓存。清单见 `src/core/content/registry.ts` —— 以那里为唯一事实源。
 * 移动流量用户（saveData / 2g/3g）跳过，不打爆流量；无 SW 的浏览器预热仍让模块
 * 缓存生效，二次切换零等待。全程异步不阻塞交互。 */
if (import.meta.env.PROD) {
  /* SW 接管（`navigator.serviceWorker.controller`）的等待预算，单位 =  polling 次数 × 100ms。
   *
   * 旧值 50（= 5 秒）明显偏紧：SW 首次安装的激活链路是
   * 「install → 预缓存整壳 assets → skipWaiting → claim clients」，其中「预缓存整壳」的
   * 体量随版本资产数增长，而这段耗时与设备 IO / 弱网成正比 —— 预算一到点仍未接管，
   * 预热就落在「SW 未控制页面」的状态：动态 import 的 chunk 不经过 SW fetch handler，
   * 压根不进 SW 缓存，「首次离线切大词库」这条目的直接落空。
   *
   * 新值 150（= 15 秒）：15 秒是「整壳预缓存 + claim」这整条链路在中低端机上仍然留足余量
   * 的量级；而它同时又是**不慢的** —— 健康设备上 `controller` 在首访预热起跑时早已存在
   * （e2e 实测等接管 15~19ms），`for` 第一次判空就退出，抬高预算一行也不会多等一格。
   *
   * 等不到也**不阻塞**任何东西：预热纯空闲期跑，toefl/kaoyan chunk 本来就会被动态 import
   * 拉进 JS 模块缓存（二次切换仍是零等待），只是进不了 SW 缓存 —— 代价因此被限定在
   * 「首次离线换大词库」，而这个降级必须留下**可观测信号**（见下面的 warn），
   * 不能像旧代码那样连一句日志都没有，让缺陷只能靠用户反馈发现。 */
  const SW_CONTROLLER_WAIT_POLLS = 150

  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  const slowNetwork = conn?.saveData === true || ['slow-2g', '2g', '3g'].includes(conn?.effectiveType ?? '')
  if (!slowNetwork) {
    const warmBanks = async () => {
      // 等 SW 接管页面（claim）后再拉 chunk：保证预热请求经过 fetch handler 进缓存，
      // 否则首访用户预热发生在控制前 → chunk 不入库 → 首次离线仍切不了大词库
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.ready
          for (let i = 0; i < SW_CONTROLLER_WAIT_POLLS && !navigator.serviceWorker.controller; i++) {
            await new Promise((r) => setTimeout(r, 100))
          }
        } catch {
          /* 无 SW 环境直接预热（模块缓存仍生效） */
        }
      }
      // 预算内没等到接管 ⇒ 本次预热是「降级态」：chunk 不进 SW 缓存。仍然照常预热
      // （模块缓存仍生效），但必须把这件事说出来 —— 它是静默失效，不说就等于没埋这个信号。
      // （这个分支与上面 catch 的「无 SW 环境」不同：后者是预期环境态，不打日志）
      if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
        console.warn(
          '[warmBanks] SW 未接管页面：本次预热不经 fetch handler 入缓存，首次离线切大词库可能失败',
        )
      }
      // V4-P0：预热改经 registry（与 wordBanks.load 同一动态 import 模块 → 同一 chunk），
      // 预拉 src/core/content/registry.ts 的 WARMUP_IDS 清单内的包，SW fetch handler 顺手 put 进缓存
      // （清单本体在 registry.ts，这里不复制包数；e2e 预热探针也从那份清单派生期望值）
      //
      // 旧写法是一条裸 `void warmUpVocabulary()`，而 warmUpVocabulary 内部又把失败吞掉 ⇒
      // 预热没跑成完全没有信号。现在拿它回传的结果摘要：未全覆盖就打 warn（同样只是 idle
      // 期后台行为，不影响流程，只负责让人看得见）。
      void warmUpVocabulary().then((r) => {
        if (r.failed > 0 || r.missing > 0) {
          console.warn(
            `[warmBanks] 预热未全覆盖：成功 ${r.warmed} / 失败 ${r.failed} / 缺 loader ${r.missing}，首次离线切大词库可能失败`,
          )
        }
      })
    }
    window.addEventListener('load', () => {
      const ric = (window as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback
      if (ric) ric(() => void warmBanks(), { timeout: 4000 })
      else window.setTimeout(() => void warmBanks(), 2000)
    })
  }
}
