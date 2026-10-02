/* P1.6-D · 词库 hook —— 从 App.tsx 抽出（内置库 + 自建库 + 懒加载词条）
 *
 * 懒加载语义保持：小词库同步；懒加载词库异步填充（模块级缓存兜底），
 * 拉取失败**不塞空释义**（CONTENT_CONTRACT 明令禁止占位），而是记下失败态交给 UI 显示
 * 失败态 + 自救入口（N13：原来只 warn 后永远停在「正在加载词库…」，用户以为卡死；
 * 28a311c 的页内 retryToken 入口是假的 —— 换回整页 reload 见下方 retryBankLoad 注释）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /* 词条异步拉取的失败态。记 bank.id（不是 bool）而不是「有没有失败」：
   * 换库时才能只清掉旧库那一条，不用额外判断「这次失败是不是上一个库留下的」。 */
  const [loadFailedId, setLoadFailedId] = useState<string | null>(null)
  /* 换库（含切回原库）时清掉上一个库的失败态 —— 渲染阶段调整 state，与上面 bankWordsFor 同一写法，
   * 避免「A 库断网失败」的失败态粘到切过来的 B 库上，把 B 库误判成失败态。 */
  const [loadFailedFor, setLoadFailedFor] = useState<string | null>(null)
  if (loadFailedFor !== bank.id) {
    setLoadFailedFor(bank.id)
    setLoadFailedId(null)
  }

  /* effect 只留「占位为空 ⇒ 异步 fill」这一条：ready 非空已经在上面的 render 阶段填好，
   * 这里再判一次长度就不会重复发起（原逻辑：ready 非空 ⇒ 同步填且不走异步）。 */
  useEffect(() => {
    if (bankWordsOf(bank).length > 0) return
    let alive = true
    ensureBankWords(bank)
      .then((w) => {
        if (!alive) return
        setBankWords(w)
        setLoadFailedId(null) // 重试成功：失败态一并清掉
      })
      .catch((e) => {
        /* 断网首次切到未加载过的大词库 / sw 504 / chunk 404：ensureBankWords reject。
         * 词库数据无法凭空获得（CONTENT_CONTRACT 禁止塞空释义），但**不能让用户永远停在
         * 「正在加载词库…」** —— 记下失败态，由 UI 显示错误文案 + 重试入口。日志保留，便于线上定位。 */
        console.warn(`词库 ${bank.id} 加载失败`, e)
        if (alive) setLoadFailedId(bank.id)
      })
    return () => {
      alive = false
    }
  }, [bank])

  return {
    banks,
    bank,
    bankWords,
    customBanks,
    /** 当前词库的词条异步拉取已失败（供 Memorize 开第四态） */
    loadFailed: loadFailedId === bank.id,
    /* 自救入口 = **整页重载**（reload），不是页内重试：
     * Chrome 的模块 map 会把取模块失败的条目留在 fetched 态（record=null），
     * 之后同一个 URL 再 `import()` 直接 reject 且**不再发出任何网络请求** ——
     * 页内重试在浏览器层面就不可能自愈（实测：解除网络阻断后再点重试，新增请求 0、UI 仍 error）。
     * 唯一能重建模块图的是整页重载，故本入口只能是 location.reload()。
     * N13（28a311c）这里写的是 `setRetryToken(n => n + 1)`：effect 确实重跑，
     * 但第二次 import() 依旧不发请求、依旧 reject ⇒ 按钮点了**零反馈**，比不加还糟。 */
    retryBankLoad: useCallback(() => location.reload(), []),
  }
}
