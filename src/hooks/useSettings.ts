/* P1.6-D · 偏好设置 hook —— 从 App.tsx 抽出（7 项偏好 + 持久化 + 音效开关）
 *
 * G4-3 零静默失败：读取失败按 fallback 并留痕；写入失败（隐私模式 / 配额不足）留痕。
 */
import { useEffect, useState } from 'react'
import type { ThemeId } from '../lib/theme'
import type { SoundTheme } from '../lib/sound'
import type { PracticeModeId } from '../lib/modes'
import { DEFAULT_BANK_ID } from '../data/wordBanks'
import { sound } from '../lib/sound'
import { settingsChannel } from '../core/persistence/channels'

export function readStorage<T>(key: string, fallback: T): T {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（settings 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const raw = settingsChannel.read(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch (e) {
    console.warn(`[settings] ${key} 读取失败，按默认值处理`, e)
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    settingsChannel.write(key, JSON.stringify(value))
  } catch (e) {
    console.warn(`[settings] ${key} 写入失败`, e)
  }
}

export function useSettings() {
  const [bankId, setBankId] = useState<string>(() => readStorage('gt.bank', DEFAULT_BANK_ID))
  const [themeId, setThemeId] = useState<ThemeId>(() => readStorage('gt.theme', 'matrix'))
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStorage('gt.sound', true))
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => readStorage('gt.soundTheme', 'mech'))
  const [shuffled, setShuffled] = useState<boolean>(() => readStorage('gt.shuffle', true))
  const [mode, setMode] = useState<PracticeModeId>(() => readStorage('gt.mode', 'classic'))
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => readStorage('gt.autoSpeak', false))

  // 偏好持久化
  useEffect(() => writeStorage('gt.bank', bankId), [bankId])
  useEffect(() => writeStorage('gt.theme', themeId), [themeId])
  useEffect(() => writeStorage('gt.sound', soundEnabled), [soundEnabled])
  useEffect(() => writeStorage('gt.soundTheme', soundTheme), [soundTheme])
  useEffect(() => writeStorage('gt.shuffle', shuffled), [shuffled])
  useEffect(() => writeStorage('gt.mode', mode), [mode])
  useEffect(() => writeStorage('gt.autoSpeak', autoSpeak), [autoSpeak])

  useEffect(() => {
    sound.enabled = soundEnabled
    sound.theme = soundTheme
  }, [soundEnabled, soundTheme])

  return {
    bankId,
    setBankId,
    themeId,
    setThemeId,
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,
    shuffled,
    setShuffled,
    mode,
    setMode,
    autoSpeak,
    setAutoSpeak,
  }
}
