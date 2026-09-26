export type PracticeModeId = 'classic' | 'spell' | 'timed' | 'code'

export interface ModeConfig {
  id: PracticeModeId
  label: string
  hint: string
  /** 限时模式的时长（秒） */
  duration?: number
}

export const MODES: ModeConfig[] = [
  { id: 'classic', label: '经典模式', hint: '看词打字，敲对变绿、敲错被拦住' },
  { id: 'spell', label: '拼写模式', hint: '只给中文释义，考你自己拼出来' },
  { id: 'timed', label: '限时 60s', hint: '一分钟内尽量多打，练速度', duration: 60 },
  { id: 'code', label: '代码模式', hint: '大小写敏感练真实代码行，强化符号键肌肉记忆' },
]

export function getMode(id: PracticeModeId): ModeConfig {
  return MODES.find((m) => m.id === id) ?? MODES[0]
}
