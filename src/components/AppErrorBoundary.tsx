import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * 全局错误边界：捕获子树渲染异常，展示兜底 UI，避免白屏。
 *
 * 刻意不使用 i18n（useT / 语境）：本组件可能承载 i18n Provider 自身的崩溃，
 * 若依赖译文再取不到 key 会二次抛错，故文案全部硬编码中文。
 * 同理不做主题切换，仅用固定深色配色，保证任何主题下都可见。
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 保留控制台堆栈，便于定位真实崩溃点
    console.error('[AppErrorBoundary] 渲染异常：', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        data-testid="app-error-boundary"
        role="alert"
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-[#0b1120] text-slate-200"
      >
        <div className="text-4xl" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-xl font-bold">页面暂时出现问题</h1>
        <p className="text-sm text-slate-400 max-w-md">已为你保留本地练习记录。可以重新加载页面，或返回首页继续。</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            data-testid="error-reload"
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25 transition-colors"
          >
            重新加载
          </button>
          <button
            data-testid="error-home"
            type="button"
            onClick={() => window.location.assign('/')}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-300 border border-slate-700 hover:bg-white/5 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }
}
