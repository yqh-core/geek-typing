/* P1.6-D · 词库 hook —— 从 App.tsx 抽出（内置库 + 自建库 + 懒加载词条）
 *
 * 懒加载语义保持：小词库同步；懒加载词库异步填充（模块级缓存兜底），
 * 拉取失败**保持加载态**而不是塞空释义（CONTENT_CONTRACT 明令禁止占位）。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  WORD_BANKS,
  bankWordsOf,
  ensureBankWords,
  type WordBank,
  type WordItem,
} from '../data/wordBanks'
import { loadCustomBanks, type CustomBank } from '../lib/customBanks'

export function useBank(bankId: string) {
  const [customBanks, setCustomBanks] = useState<CustomBank[]>(() => loadCustomBanks())

  // 切换词库时顺带刷新一次自定义词库列表（导入新词库后会触发这里）
  useEffect(() => {
    setCustomBanks(loadCustomBanks())
  }, [bankId])

  /** 内置词库 + 我的自定义词库 */
  const banks = useMemo<WordBank[]>(
    () => [
      ...WORD_BANKS,
      ...customBanks.map((c) => ({
        id: c.id,
        name: c.name,
        description: '我的自定义词库',
        icon: 'FileText',
        words: c.words,
      })),
    ],
    [customBanks],
  )

  const bank = useMemo(() => banks.find((b) => b.id === bankId) ?? banks[0], [banks, bankId])

  /** 当前词库已解析词条：小词库同步；懒加载词库在下方 effect 异步填充 */
  const [bankWords, setBankWords] = useState<WordItem[]>([])
  useEffect(() => {
    const ready = bankWordsOf(bank)
    if (ready.length > 0) {
      setBankWords(ready)
      return
    }
    // 懒加载词库且未缓存：清空占位进入「加载词库中」态
    setBankWords([])
    let alive = true
    ensureBankWords(bank)
      .then((w) => {
        if (alive) setBankWords(w)
      })
      .catch((e) => {
        // 断网首次切到未加载过的大词库：chunk 拉取失败，保持加载态（词库数据无法凭空获得）
        console.warn(`词库 ${bank.id} 加载失败`, e)
      })
    return () => {
      alive = false
    }
  }, [bank])

  return { banks, bank, bankWords, customBanks }
}
