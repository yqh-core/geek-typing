/**
 * 单词发音：使用浏览器内置 Web Speech API，零依赖零流量。
 * Chrome / Edge / Safari / Firefox 均支持，中文系统也能调用英文语音。
 */

let cachedVoice: SpeechSynthesisVoice | null = null

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices?.() ?? []
  cachedVoice =
    voices.find((v) => v.lang?.toLowerCase() === 'en-us' && /google|samantha|natural/i.test(v.name)) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
    null
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
  u.lang = v?.lang ?? 'en-US'
  u.rate = rate
  u.pitch = 1
  window.speechSynthesis.cancel() // 打断上一句，避免排队
  window.speechSynthesis.speak(u)
}

export function stopSpeak() {
  if (speechSupported()) window.speechSynthesis.cancel()
}
