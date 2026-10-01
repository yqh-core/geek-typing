import { contentChannel } from '../core/persistence/channels'
import type { WordItem } from '../data/wordBanks'

const KEY = 'gt.customBanks.v1'

export interface CustomBank {
  id: string
  name: string
  words: WordItem[]
  createdAt: number
}

export function loadCustomBanks(): CustomBank[] {
  try {
    // P1.7-W2C：原生读收口到 persistence 通道（content 域授权）。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 吃掉并留痕，与 W2B upgrade.ts 同口径。
    const raw = contentChannel.read(KEY)
    return raw ? (JSON.parse(raw) as CustomBank[]) : []
  } catch (e) {
    // G4-3 零静默失败：读取失败按空表处理但留痕（S4 迁移时移除）
    console.warn('[customBanks] 读取失败，按空表处理', e)
    return []
  }
}

function persist(banks: CustomBank[]) {
  try {
    contentChannel.write(KEY, JSON.stringify(banks))
  } catch (e) {
    // G4-3 ② 无保护 setItem = 0：这里原先**直接抛** —— 异常会穿透 React 事件处理器
    // 打到 ErrorBoundary，整个词库面板因一次写失败白屏。改为留痕 + 静默返回，
    // 与其它 store 的「失败可观测、不崩 UI」口径一致（P1.5-LEARNING-MODEL §3.5 S4 称其为修 bug）。
    console.warn('[customBanks] 写入失败，本次变更仅保留在内存', e)
  }
}

export function saveCustomBank(name: string, words: WordItem[]): CustomBank[] {
  const banks = loadCustomBanks()
  const bank: CustomBank = {
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim() || '我的词库',
    words,
    createdAt: Date.now(),
  }
  const next = [bank, ...banks]
  persist(next)
  return next
}

export function deleteCustomBank(id: string): CustomBank[] {
  const next = loadCustomBanks().filter((b) => b.id !== id)
  persist(next)
  return next
}

/**
 * 解析用户粘贴的文本，支持三种格式：
 *   1) JSON：[{"word":"xxx","translation":"yyy"}, ...]
 *   2) 每行一个：`word = translation` / `word 释义` / `word,translation` / `word:translation`
 *   3) 只有英文单词（无释义）
 */
export function parseWords(raw: string): WordItem[] {
  const text = raw.trim()
  if (!text) return []

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const data = JSON.parse(text)
      const arr = Array.isArray(data) ? data : data.words ?? []
      return arr
        .map((w: unknown) => {
          if (typeof w === 'string') return { word: w.trim(), translation: '' }
          const o = w as Record<string, string>
          return { word: (o.word ?? o.name ?? '').trim(), translation: (o.translation ?? o.meaning ?? '').trim() }
        })
        .filter((w: WordItem) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
    } catch (e) {
      // G4-3 零静默失败：用户粘贴的 JSON 解析失败必须留痕 —— 静默返回 [] 会让用户
      // 以为「导入成功但 0 个词」，分不清是格式错了还是内容真的为空。
      console.warn('[customBanks] 粘贴内容不是合法 JSON，已按 0 条解析', e)
      return []
    }
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // 字符类里 `-` 必须落末位（写成 `[A-Za-z'- ]` 会给 `'`~` ` 造一个逆向区间 ⇒ 正则直接非法）
      const m = line.match(/^([A-Za-z][A-Za-z' -]*?)\s*(?:=|,|\||:|：|\t| {2,})\s*(.+)$/)
      if (m) return { word: m[1].trim(), translation: m[2].trim() }
      const parts = line.split(/\s+/)
      if (parts.length >= 2 && /^[A-Za-z][A-Za-z'-]*$/.test(parts[0])) {
        return { word: parts[0], translation: parts.slice(1).join(' ') }
      }
      return { word: line, translation: '' }
    })
    .filter((w) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
}

export function exportBanksAsJson(banks: CustomBank[]): string {
  return JSON.stringify(
    banks.map((b) => ({ name: b.name, words: b.words })),
    null,
    2,
  )
}
