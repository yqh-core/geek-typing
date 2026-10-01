/**
 * 结算彩带：两侧喷射 + 中间补一发，全部在 1s 内完成。
 * 颜色跟随当前主题强调色。
 *
 * canvas-confetti 只在**真的要放彩带时**才加载（动态 import ≈ 19.8 KiB，
 * 落在独立 chunk，不进主 chunk —— 主 chunk 预算见 gate-perf.mjs）。
 * 约定：模块级缓存 promise ⇒ 整个会话只加载一次，且并发调用共享同一次加载
 * （不会「点一下拉一次」）；首次触发最多晚一个 chunk 加载时间，之后零延迟。
 */
/** canvas-confetti 的调用形态。包以 `export =` 导出（function + namespace），
 *  因此 `typeof import('canvas-confetti').default` 取不到 —— 用命名空间成员 `Options`
 *  作为唯一入参类型来源，运行时经 interop 落在 `.default` 上（见 loadConfetti）。 */
type ConfettiFn = (options?: import('canvas-confetti').Options) => Promise<undefined> | null

let inflight: Promise<ConfettiFn> | null = null

function loadConfetti(): Promise<ConfettiFn> {
  if (!inflight) {
    inflight = import('canvas-confetti').then((m) => m.default as ConfettiFn)
  }
  return inflight
}

export async function celebrate(colors: string[]) {
  const confetti = await loadConfetti()
  const side = (angle: number, x: number) =>
    confetti({
      particleCount: 70,
      spread: 62,
      angle,
      origin: { x, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    })
  side(60, 0)
  side(120, 1)
  window.setTimeout(() => {
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors,
      disableForReducedMotion: true,
    })
  }, 420)
}
