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
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CustomBank[]) : []
  } catch {
    return []
  }
}

function persist(banks: CustomBank[]) {
  localStorage.setItem(KEY, JSON.stringify(banks))
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
    } catch {
      return []
    }
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Za-z][A-Za-z'\- ]*?)\s*(?:=|,|\||:|：|\t| {2,})\s*(.+)$/)
      if (m) return { word: m[1].trim(), translation: m[2].trim() }
      const parts = line.split(/\s+/)
      if (parts.length >= 2 && /^[A-Za-z][A-Za-z'\-]*$/.test(parts[0])) {
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
