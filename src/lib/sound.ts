/**
 * 机械键盘音效引擎
 * 全部使用 Web Audio API 实时合成，零外部音频文件，秒开无加载。
 */

export type SoundTheme = 'mech' | 'thock' | '8bit'

type AnyWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

class SoundEngine {
  private ctx: AudioContext | null = null
  private noiseBuffer: AudioBuffer | null = null

  enabled = true
  theme: SoundTheme = 'mech'

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as AnyWindow).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()

      // 预生成一段白噪声，用于模拟机械轴体的"咔哒"声
      const len = Math.floor(this.ctx.sampleRate * 0.25)
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buf
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** 白噪声脉冲 + 带通滤波 = 清脆键声 */
  private click(ctx: AudioContext, freq: number, dur: number, gainVal: number, q = 1.2) {
    if (!this.noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q

    const gain = ctx.createGain()
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(gainVal, t + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  /** 低频正弦 = 厚实的底座触底感 */
  private thock(ctx: AudioContext, freq: number, dur: number, gainVal: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.62, t + dur)
    gain.gain.setValueAtTime(gainVal, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** 方波音 = 8-bit 复古游戏音 */
  private blip(ctx: AudioContext, freq: number, dur: number, gainVal: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(gainVal, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** 敲对一个字母 */
  correct() {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    if (this.theme === '8bit') {
      this.blip(ctx, 620 + Math.random() * 180, 0.07, 0.05)
    } else if (this.theme === 'thock') {
      this.thock(ctx, 210, 0.075, 0.16)
      this.click(ctx, 1400, 0.03, 0.05, 0.8)
    } else {
      this.click(ctx, 2600 + Math.random() * 700, 0.045, 0.11)
      this.thock(ctx, 180, 0.05, 0.07)
    }
  }

  /** 敲错：低沉的闷响 */
  error() {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    if (this.theme === '8bit') {
      this.blip(ctx, 150, 0.11, 0.06)
    } else {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = ctx.currentTime
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(190, t)
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.13)
      gain.gain.setValueAtTime(0.075, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  }

  /** 打完一个单词：上行双音 */
  complete() {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    const notes = this.theme === '8bit' ? [660, 880, 1170] : [784, 1175]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = ctx.currentTime + i * 0.07
      osc.type = this.theme === '8bit' ? 'square' : 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.2)
    })
  }

  /** 点击 UI 按钮的轻微反馈 */
  tap() {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    this.click(ctx, 3200, 0.025, 0.045)
  }
}

export const sound = new SoundEngine()
