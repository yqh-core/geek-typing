/* PWA 安装引导 —— 把「已具备的安装能力」变成用户可感知的入口。
 *
 * 站点能力本来就齐（public/manifest.webmanifest: display standalone + 192/512 maskable 图标、
 * public/sw.js 存在并注册），但 `beforeinstallprompt` / `appinstalled` 在 src/ 与 public/
 * 零命中 —— 能力齐全、入口为零。
 *
 * ⛔ **降级是本模块的主要设计目标，不是边角情况**：
 *   `beforeinstallprompt` 只在「可安装的 Chromium 且未安装」时触发。它**永不触发**于：
 *     ① iOS Safari —— 只能手动「分享 → 添加到主屏幕」，浏览器**不提供**任何程序化入口；
 *     ② 自动化浏览器 / CDP —— 本仓的 e2e 与视觉自证都在里面；
 *     ③ 已安装为 standalone 的会话；
 *     ④ 用户装过又卸载过的 Chromium（启发式冷却期内）。
 *   所以「事件没来 ⇒ 不渲染入口」是**错的**：那会让 iOS 用户（最大的一批移动端流量）
 *   与所有自动化环境**永久看不到入口**。本 hook 因此把状态分成三态而不是两态，
 *   组件据此分别给「一键装」与「手动怎么装」的文案，而不是消失。
 *
 * ⛔ 零新依赖：`beforeinstallprompt` / `appinstalled` 是浏览器原生事件，`prompt()` /
 * `userChoice` 是原生方法，`matchMedia('(display-mode: standalone)')` 是原生查询。
 * 只加一个 `declare global` 类型补丁（TS 的 lib.dom 至今没有 BeforeInstallPromptEvent）。
 */
import { useCallback, useEffect, useState } from 'react'

/** Chrome 一直没进 lib.dom 的安装提示事件。结构取自 WICG app-install 规范。 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/**
 * 安装能力三态。
 * - `promptable`：浏览器已给出 `beforeinstallprompt`，可一键唤起原生安装对话框。
 * - `manual`：没有该事件（iOS Safari / 自动化环境 / 已被启发式冷却），须走手动说明。
 * - `installed`：已装成 standalone（本次会话装成功，或本来就装在桌面/主屏上）。
 */
export type InstallCapability = 'promptable' | 'manual' | 'installed'

/**
 * 当前是否已作为独立应用运行。
 * 两条路径都要查：Chromium 系认 `display-mode: standalone`，iOS Safari 只给
 * 非标准的 `navigator.standalone`；任一为真即视为已安装。
 */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    const displayStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
    return iosStandalone || displayStandalone
  } catch {
    /* matchMedia 不可用（老环境）时按「未安装」处理 —— 只影响入口显隐，不影响功能 */
    return false
  }
}

/**
 * 订阅安装能力三态。
 *
 * 生命周期说明：`beforeinstallprompt` 通常在首屏 load 后数百毫秒才触发，且**只触发一次**
 * —— 所以事件对象必须存进 state（不能在 handler 里直接 prompt，那样事件一过就永久丢失）。
 * 事件对象用完后 `prompt()` 只能调一次，故 accepted/dismissed 之后一律置空：
 * 让入口退回「手动说明」而不是留一个点了没反应的死按钮。
 *
 * @returns 当前能力三态 + `promptInstall`（仅 `promptable` 时有实义，其余返回 false）
 */
export function useInstallCapability(): {
  capability: InstallCapability
  promptInstall: () => Promise<boolean>
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(detectStandalone)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // ⛔ 必须 preventDefault：不阻止默认行为时 Chrome 不再弹出那个「安装此应用？」的
      // 微型 UI 条，我们自己接管入口（否则两套入口并存，用户看到两个提示）。
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      // 无论接受与否，事件对象都已作废（规范：每个事件只能 prompt 一次）⇒ 置空，
      // 让入口退回 manual 态。接受的情形下 appinstalled 会随后把 installed 拉起、入口消失。
      setDeferred(null)
      return choice.outcome === 'accepted'
    } catch {
      /* prompt 被拒（如用户刚关掉页面）：不影响使用，只留手动路径 */
      setDeferred(null)
      return false
    }
  }, [deferred])

  if (installed) return { capability: 'installed', promptInstall }
  return { capability: deferred ? 'promptable' : 'manual', promptInstall }
}