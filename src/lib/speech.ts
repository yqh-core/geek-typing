/**
 * 单词发音：使用浏览器内置 Web Speech API，零依赖零流量。
 * Chrome / Edge / Safari / Firefox 均支持，中文系统也能调用英文语音。
 * 发音口音偏好（en-US / en-GB）持久化到 localStorage 'gt.voice'，默认 en-US。
 */

const VOICE_KEY = 'gt.voice'

export type VoicePref = 'en-US' | 'en-GB'

let cachedVoice: SpeechSynthesisVoice | null = null

function readVoicePref(): VoicePref {
  try {
    return localStorage.getItem(VOICE_KEY) === 'en-GB' ? 'en-GB' : 'en-US'
  } catch {
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
    localStorage.setItem(VOICE_KEY, p)
  } catch {
    /* 隐私模式下忽略 */
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
