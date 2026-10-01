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

  /* 切换词库时顺带刷新一次自定义词库列表（导入新词库后会触发这里）。
   * 原写法是 effect 里同步 setState —— React 19 已把它点名为反模式（白起一轮级联渲染）。
   * 改成官方的 **render 阶段调整 state**：用 customBanksFor 记下「这份列表是按哪个 bankId
   * 取的」，bankId 一变就在 render 里重取一次。触发点与原来 effect 的 [bankId] 逐一对齐
   * （切库、切回原库、导入后重新取回都覆盖），只是把 setState 从「渲染后再补一轮」搬到
   * 「这一次渲染里直接调整」，语义不变、少一轮渲染。 */
  const [customBanksFor, setCustomBanksFor] = useState(bankId)
  if (customBanksFor !== bankId) {
    setCustomBanksFor(bankId)
    setCustomBanks(loadCustomBanks())
  }

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
  /* 同步路径（切库时立刻用已缓存/自带的词条填上）从 effect 挪到 **render 阶段调整 state**：
   * 懒词库此刻 bankWordsOf 还是空，setBankWords([]) 正好就是「加载词库中」占位 ——
   * 与原来清空占位那一步逐字等价；随即在一次渲染内把 bank 记进 bankWordsFor，
   * 避免同一轮里重复调整。 */
  const [bankWordsFor, setBankWordsFor] = useState<WordBank | null>(null)
  if (bankWordsFor !== bank) {
    setBankWordsFor(bank)
    setBankWords(bankWordsOf(bank))
  }
  /* effect 只留「占位为空 ⇒ 异步 fill」这一条：ready 非空已经在上面的 render 阶段填好，
   * 这里再判一次长度就不会重复发起（原逻辑：ready 非空 ⇒ 同步填且不走异步）。 */
  useEffect(() => {
    if (bankWordsOf(bank).length > 0) return
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
