/**
 * 单词发音：使用浏览器内置 Web Speech API，零依赖零流量。
 * Chrome / Edge / Safari / Firefox 均支持，中文系统也能调用英文语音。
 * 发音口音偏好（en-US / en-GB）持久化到本机存储键 'gt.voice'
 * （P1.7-W2C 起经 settings 通道读写），默认 en-US。
 */

import { settingsChannel } from '../core/persistence/channels'

const VOICE_KEY = 'gt.voice'

export type VoicePref = 'en-US' | 'en-GB'

let cachedVoice: SpeechSynthesisVoice | null = null

function readVoicePref(): VoicePref {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（settings 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    return settingsChannel.read(VOICE_KEY) === 'en-GB' ? 'en-GB' : 'en-US'
  } catch (e) {
    // G4-3 零静默失败：读取失败按默认音色处理但留痕（S3 迁移时移除）
    console.warn('[speech] 音色读取失败，按默认处理', e)
    return 'en-US'
  }
}

let voicePref: VoicePref = readVoicePref()

/** 当前口音偏好 */
export function getVoicePref(): VoicePref {
  return voicePref
}

/** 切换口音偏好并持久化（下一次 speak 按新偏好选声） */
export function setVoicePref(p: VoicePref) {
  voicePref = p
  cachedVoice = null // 让 pickVoice 按新偏好重选
  try {
    settingsChannel.write(VOICE_KEY, p)
  } catch (e) {
    // G4-3 零静默失败：隐私模式写入失败必须可观测（S3 迁移时移除）
    console.warn('[speech] 音色写入失败', e)
  }
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices?.() ?? []
  if (voicePref === 'en-GB') {
    // 英音偏好：先找 en-gb，再退回任意英文声
    cachedVoice =
      voices.find((v) => v.lang?.toLowerCase() === 'en-gb') ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      null
  } else {
    cachedVoice =
      voices.find((v) => v.lang?.toLowerCase() === 'en-us' && /google|samantha|natural/i.test(v.name)) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      null
  }
  return cachedVoice
}

export function warmSpeech() {
  if (!speechSupported()) return
  window.speechSynthesis.getVoices?.()
}

/** 朗读一个英文单词 */
export function speak(word: string, rate = 0.85) {
  if (!speechSupported() || !word) return
  const u = new SpeechSynthesisUtterance(word.replace(/[-_]/g, ' '))
  const v = pickVoice()
  if (v) u.voice = v
  u.lang = v?.lang ?? voicePref
  u.rate = rate
  u.pitch = 1
  window.speechSynthesis.cancel() // 打断上一句，避免排队
  window.speechSynthesis.speak(u)
}

export function stopSpeak() {
  if (speechSupported()) window.speechSynthesis.cancel()
}
