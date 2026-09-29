/* P1.7 Wave 2-A · Persistence Boundary —— gt.* 键注册表（v2.3.2 §1 A-1）
 *
 * 「gt.* 键注册表，未注册键写入判红」。键清单与 owner 域从当前 src/ 实测
 * （2026-09-29，19 键）登记；动态键族用 pattern 表达。
 * 未登记的新键必须先来这里注册 —— 这是迁移三批（§1）的键位台账。
 */

export type KeyOwner =
  | 'learning' // 学习态（review/memorize/totals/letterStats/streak/learning.v2）
  | 'analytics' // 打字统计
  | 'migration' // 迁移 journal/marker
  | 'diagnostics' // 诊断
  | 'content' // 用户内容（自定义词库）
  | 'settings' // 设置辅助域

export interface KeyRegistration {
  family: string
  /** 匹配该键族的完整键（精确或前缀 pattern） */
  match: (key: string) => boolean
  owner: KeyOwner
  /** versioned = 带版本尾缀（迁移域），simple = 设置类无版本 */
  kind: 'versioned' | 'simple' | 'dynamic'
}

const REGISTRY: KeyRegistration[] = [
  // learning 域（§1 迁移批次 ①）
  { family: 'gt.learning.v2', match: (k) => k === 'gt.learning.v2', owner: 'learning', kind: 'versioned' },
  { family: 'gt.learning.v2.backup', match: (k) => k === 'gt.learning.v2.backup', owner: 'learning', kind: 'versioned' },
  { family: 'gt.learning.v3:*', match: (k) => k.startsWith('gt.learning.v3:'), owner: 'learning', kind: 'dynamic' },
  { family: 'gt.review.v1', match: (k) => k === 'gt.review.v1', owner: 'learning', kind: 'versioned' },
  { family: 'gt.memorize.v1', match: (k) => k === 'gt.memorize.v1', owner: 'learning', kind: 'versioned' },
  { family: 'gt.totals.v1', match: (k) => k === 'gt.totals.v1', owner: 'learning', kind: 'versioned' },
  { family: 'gt.letterStats.v1', match: (k) => k === 'gt.letterStats.v1', owner: 'learning', kind: 'versioned' },
  { family: 'gt.streak.v1', match: (k) => k === 'gt.streak.v1', owner: 'learning', kind: 'versioned' },
  // analytics 域
  { family: 'gt.analytics.v1', match: (k) => k === 'gt.analytics.v1', owner: 'analytics', kind: 'versioned' },
  // migration 域
  { family: 'gt.migration.v1', match: (k) => k === 'gt.migration.v1', owner: 'migration', kind: 'versioned' },
  // diagnostics 域
  { family: 'gt.diag.v1', match: (k) => k === 'gt.diag.v1', owner: 'diagnostics', kind: 'versioned' },
  // content 域（迁移批次 ② legacy 三 store 之一）
  { family: 'gt.customBanks.v1', match: (k) => k === 'gt.customBanks.v1', owner: 'content', kind: 'versioned' },
  // settings 辅助域（迁移批次 ③）
  { family: 'gt.bank', match: (k) => k === 'gt.bank', owner: 'settings', kind: 'simple' },
  { family: 'gt.mode', match: (k) => k === 'gt.mode', owner: 'settings', kind: 'simple' },
  { family: 'gt.theme', match: (k) => k === 'gt.theme', owner: 'settings', kind: 'simple' },
  { family: 'gt.shuffle', match: (k) => k === 'gt.shuffle', owner: 'settings', kind: 'simple' },
  { family: 'gt.sound', match: (k) => k === 'gt.sound', owner: 'settings', kind: 'simple' },
  { family: 'gt.soundTheme', match: (k) => k === 'gt.soundTheme', owner: 'settings', kind: 'simple' },
  { family: 'gt.autoSpeak', match: (k) => k === 'gt.autoSpeak', owner: 'settings', kind: 'simple' },
  { family: 'gt.voice', match: (k) => k === 'gt.voice', owner: 'settings', kind: 'simple' },
  { family: 'gt.lang', match: (k) => k === 'gt.lang', owner: 'settings', kind: 'simple' },
]

/** 解析键的注册信息；未注册 → null */
export function resolveKey(key: string): KeyRegistration | null {
  return REGISTRY.find((r) => r.match(key)) ?? null
}

/** 全量注册表（只读视图；gate / 迁移批次审计用） */
export function registeredKeys(): readonly KeyRegistration[] {
  return REGISTRY
}

export class NamespaceError extends Error {
  constructor(message: string) {
    super(`namespace: ${message}`)
    this.name = 'NamespaceError'
  }
}

/** 写入前置校验：未注册键判红（§1：未注册键写入判红） */
export function assertWritable(key: string): KeyRegistration {
  if (!key.startsWith('gt.')) throw new NamespaceError(`非 gt.* 键禁止经 persistence 层写入: ${key}`)
  const reg = resolveKey(key)
  if (!reg) throw new NamespaceError(`未注册键禁止写入（请先登记 gt.* 键注册表）: ${key}`)
  return reg
}
