/**
 * 结算彩带：两侧喷射 + 中间补一发，全部在 1s 内完成。
 * 颜色跟随当前主题强调色。
 */
import confetti from 'canvas-confetti'

export function celebrate(colors: string[]) {
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
