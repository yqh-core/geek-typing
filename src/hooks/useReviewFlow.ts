/* P1.6-D · 复习流 hook —— 从 App.tsx 抽出
 *
 * 归属语义（P1.5-S4 §3.5 硬耦合③）：复习轮 / 单挑轮把「到期条目自带的 ContentId」
 * 存进 roundContentIdsRef，wordCtx 依此构造精确归属；普通轮回落 bankId。
 * 这是跨包正确归属的唯一途径，不可简化成「只用 bankId」。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { learningService } from '../core/learning/service'
import { resolveReviewWords } from '../lib/wordResolve'
import { buildRecommendation } from '../lib/recommend'
import type { LearningSourceCtx } from '../lib/learning/attribute'
import type { WordBank, WordItem } from '../data/wordBanks'
import type { TabId } from './useTabNav'

interface UseReviewFlowParams {
  banks: WordBank[]
  bankWords: WordItem[]
  bankId: string
  /** 开一轮练习（由 useTypingRound 提供） */
  startRound: (source?: WordItem[]) => void
  setTab: (tab: TabId) => void
  tab: TabId
}

export function useReviewFlow({ banks, bankWords, bankId, startRound, setTab, tab }: UseReviewFlowParams) {
  /** 错题本版本号：recordWrong/recordCorrect 后自增，驱动到期数等派生数据刷新 */
  const [reviewVersion, setReviewVersion] = useState(0)
  const bumpReview = useCallback(() => setReviewVersion((v) => v + 1), [])

  /** 本轮练习的词 → ContentId 归属映射（复习轮 / 带 contentId 的单挑轮携带，普通轮恒空） */
  const roundContentIdsRef = useRef<Map<string, string>>(new Map())

  /** 当前词完成/结算的归属上下文：复习轮映射带回精确 ContentId（跨包归属唯一途径）；
   *  普通轮归属当前词库（设计 §1.5：新写入的归属由「发生学习的包」唯一确定） */
  const wordCtx = useCallback(
    (word: string): LearningSourceCtx => {
      const cid = roundContentIdsRef.current.get(word)
      return cid ? { contentId: cid } : { bankId }
    },
    [bankId],
  )

  /* ---------------- 错题本（艾宾浩斯）派生数据 ---------------- */
  const dueCount = useMemo(() => {
    void reviewVersion
    return learningService.getReviewDueCount()
    // 切页签时也刷新一次：背单词页的三键打分不在本组件内打点
  }, [reviewVersion, tab])
  const reviewTotal = useMemo(() => {
    void reviewVersion
    return learningService.getReviewTotalCount()
  }, [reviewVersion, tab])

  /** Today's Practice 推荐快照：错题本变化（或切回页签）时重建 */
  const recommendation = useMemo(() => buildRecommendation(), [reviewVersion, tab])

  /** 单挑一个错词反复练。contentId 存在 = 精确归属该 (词,包)（ReviewPanel 的条目自带，
   *  §3.5 硬耦合③）；缺省 = 归属当前词库（Header 弱词 / 命令面板入口无包归属信息）。
   *  词条解析：先在当前已加载词表**原词形**精确命中；未命中走 Query 层异步解析
   *  （懒包 / 跨包 —— 复习面板展示的是全部包的到期词，跨包单挑此前会静默无效果）。 */
  const reviewSingleWord = useCallback(
    (word: string, contentId?: string) => {
      // 原词形精确命中优先；大小写兜底只用于拿到可练的词条（不参与归属身份构造，
      // 有 contentId 时归属仍走复习条目的精确 id，词形以其为准）
      const item =
        bankWords.find((w) => w.word === word) ??
        bankWords.find((w) => w.word.toLowerCase() === word.toLowerCase())
      if (item) {
        startRound(Array.from({ length: 10 }, () => item))
        if (contentId) roundContentIdsRef.current = new Map([[item.word, contentId]])
        return
      }
      void resolveReviewWords([word], banks).then(({ items }) => {
        const first = items[0]
        if (!first) return
        setTab('typing')
        startRound(Array.from({ length: 10 }, () => first))
        if (contentId) roundContentIdsRef.current = new Map([[first.word, contentId]])
      })
    },
    [bankWords, banks, startRound, setTab],
  )

  /** 错题复习轮：拉出全部到期词开一轮；无到期返回 false（由入口提示）
   *
   * ⚠️ 这里**不再**用 `?? { word: w, translation: '' }` 占位（CONTENT_CONTRACT §735-739 点名的
   * 🔴 缺陷：取不到就静默显示空释义）。改为 `resolveReviewWords` 返回**显式未命中清单**：
   * 取不到释义的词被跳过并 `console.warn` 记账，而不是塞一个空释义假装练得上。
   *
   * 副作用（必须知道）：极端情况下（如所有到期词的词库 chunk 都加载失败）items 可能为空，
   * 此时返回 false —— 与「无到期」语义一致：**没内容可练就是没内容可练**，不硬开一轮空指针。 */
  const startReviewRound = useCallback(async (): Promise<boolean> => {
    const dueItems = learningService.getReviewDueViews()
    if (dueItems.length === 0) return false
    // State B 下同一词可能在多个包各有到期条目：轮内去重，归属取首见包
    // （罕见场景，宁可少记一条也不误记另一半 —— 另一条下轮仍到期可复习）
    const dueWordsUnique = [...new Set(dueItems.map((i) => i.word))]
    const { items, missed } = await resolveReviewWords(dueWordsUnique, banks)
    if (items.length === 0) return false
    setTab('typing')
    startRound(items)
    // 归属映射：键用**引擎词**（item.word）—— queryWord 的大小写兜底可能让解析词形 ≠ 到期词形，
    // 而完成段拿到的是 current.word（引擎词）。resolveReviewWords 保序，
    // items[j] ↔ hitWords[j] 一一对应（State A 视图 contentId 为空串 → 映射为空 →
    // 回落 bankId 归属，v1 路径本就不读 ctx）。
    const cidByWord = new Map<string, string>()
    for (const it of dueItems) {
      if (it.contentId && !cidByWord.has(it.word)) cidByWord.set(it.word, it.contentId)
    }
    const missedSet = new Set(missed)
    const hitWords = dueWordsUnique.filter((w) => !missedSet.has(w))
    const map = new Map<string, string>()
    for (let j = 0; j < items.length; j++) {
      const cid = hitWords[j] !== undefined ? cidByWord.get(hitWords[j]) : undefined
      const engineWord = items[j]?.word
      if (cid && engineWord && !map.has(engineWord)) map.set(engineWord, cid)
    }
    roundContentIdsRef.current = map
    return true
  }, [banks, startRound, setTab])

  return {
    reviewVersion,
    bumpReview,
    roundContentIdsRef,
    wordCtx,
    dueCount,
    reviewTotal,
    recommendation,
    reviewSingleWord,
    startReviewRound,
  }
}
