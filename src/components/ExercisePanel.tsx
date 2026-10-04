/* IELTS 练习题作答面板（A1-E）。
 *
 * ── 本刀的边界（PM 终裁 ④）：**结果不落盘** ──
 * 用户作答 → 本地判对错 → 本地展示解析与得分，**不写入任何持久化学习记录**。
 * 这不是偷懒，是有据可查的取舍：现有 `domains/practice.ts` 的 dispatchAnswer 默认分支
 * 是 `if (!ans.correct) recordWrong(ans.word, ctx)` —— 题目没有 questionId，只能把题目标识
 * 塞进 `word`，答错 15 题就会在错题本里产生 15 条**伪单词**，直接污染 ReviewPanel 与
 * ProgressPanel 的「错词 Top5」。而题目级结果链路（questionId → 题目结果 → 答题历史 →
 * 进度聚合）是一整条新链，超出本刀边界，将来单独开刀。
 *
 * ── 也因此：本组件**不 import 任何学习层模块** ──
 * 不碰 practiceEngine、不碰 learningService、不碰 lib/reviewStore 等（架构门
 * gate-practice-engine / gate-learning-boundary 都会判红）。它是纯展示 + 纯本地状态。
 *
 * ⚠️ 架构门 ui-contract 的棘轮约束（本组件落在 UI_SCOPE_RE 内）：
 *   · 不出现属性名 `words` 的词表句柄读（handleReads 只许降不许升）
 *   · 不在 `WordItem[]` 上用 filter/map/sort/slice（bannedArrayOps 只许降不许升）
 *   本组件的数组全是题目/选项（ExerciseQuestion[] / ExerciseOption[]），不触及词表句柄。
 */
import { useState } from 'react'
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { useT } from '../i18n/hooks'

export interface ExerciseOption {
  key: string
  text: string
}

export interface ExerciseQuestion {
  id: string
  /** mcq = 单项选择；tfng = True / False / Not Given */
  type: 'mcq' | 'tfng'
  prompt: string
  options: ExerciseOption[]
  answer: string
  explanation: string
  skill: string
}

interface ExercisePanelProps {
  theme: import('../lib/theme').ThemeConfig
  questions: ExerciseQuestion[]
  /** 篇章搭配（collocations），可缺省 */
  collocations?: string[]
}

export default function ExercisePanel({ theme, questions, collocations }: ExercisePanelProps) {
  const t = useT()
  /** 题目 id → 用户选中的选项 key。未答的题目不在表里。 */
  const [picked, setPicked] = useState<Record<string, string>>({})

  const total = questions.length
  let correctCount = 0
  for (const q of questions) {
    if (picked[q.id] === q.answer) correctCount++
  }
  const answeredCount = Object.keys(picked).length
  const allDone = total > 0 && answeredCount === total

  const choose = (q: ExerciseQuestion, key: string) => {
    // 选过就不能改：IELTS 练习的解析是即时给出的，允许改选会让「先看解析再改答案」成为可能
    if (picked[q.id] !== undefined) return
    setPicked((prev) => ({ ...prev, [q.id]: key }))
  }

  const cardCls = `border ${theme.border} rounded-xl px-4 py-3 flex flex-col gap-2`
  const optBase = `text-left px-3 py-2 rounded-lg border text-xs transition-all`

  return (
    <div data-testid="exercise-panel" className="flex flex-col gap-3">
      {/* 得分条 */}
      <div className={`${theme.card} ${cardCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${theme.sub}`}>
            {t('exercise.progress')} {answeredCount} / {total}
          </span>
          <span className={`text-xs font-semibold ${theme.accent}`} data-testid="exercise-score">
            {t('exercise.score')} {correctCount} / {total}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/15 overflow-hidden">
          <div
            data-testid="exercise-progress-bar"
            className="h-full rounded-full transition-all duration-500 bg-emerald-500/70"
            style={{ width: `${total === 0 ? 0 : Math.round((answeredCount / total) * 100)}%` }}
          />
        </div>
        {allDone ? (
          <button
            data-testid="exercise-retry"
            onClick={() => setPicked({})}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border ${theme.border} text-xs ${theme.sub} active:scale-95 transition-all`}
          >
            <RotateCcw size={12} />
            {t('exercise.retry')}
          </button>
        ) : null}
      </div>

      {/* 题目 */}
      {questions.map((q, i) => {
        const mine = picked[q.id]
        const done = mine !== undefined
        const right = mine === q.answer
        return (
          <div key={q.id} data-testid={`exercise-q-${q.id}`} className={`${theme.card} ${cardCls}`}>
            <div className="flex items-start justify-between gap-2">
              <span className={`text-xs font-semibold ${theme.sub}`}>
                {t('exercise.question')} {i + 1}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${theme.border} ${theme.sub}`}>
                {q.skill}
              </span>
            </div>
            <p className="text-xs leading-relaxed">{q.prompt}</p>
            <div className="flex flex-col gap-1.5">
              {q.options.map((o) => {
                const isMine = mine === o.key
                const isAnswer = o.key === q.answer
                // 未答：中性；答后：正确项标绿、被误选项标红，其余保持中性
                let cls = `${optBase} ${theme.border}`
                if (done && isAnswer) cls = `${optBase} border-emerald-500/60 bg-emerald-500/10`
                else if (done && isMine) cls = `${optBase} border-red-500/60 bg-red-500/10`
                return (
                  <button
                    key={o.key}
                    data-testid={`exercise-option-${q.id}-${o.key}`}
                    disabled={done}
                    onClick={() => choose(q, o.key)}
                    className={cls}
                  >
                    <span className="font-mono font-semibold">{o.key}.</span> {o.text}
                  </button>
                )
              })}
            </div>
            {done ? (
              <div
                data-testid={`exercise-result-${q.id}`}
                className={`flex flex-col gap-1 text-xs rounded-lg px-2.5 py-2 border ${
                  right ? 'border-emerald-500/40' : 'border-red-500/40'
                }`}
              >
                <span className={`flex items-center gap-1.5 font-semibold ${right ? 'text-emerald-500' : 'text-red-500'}`}>
                  {right ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {right ? t('exercise.correct') : t('exercise.incorrect')}
                </span>
                <span className={theme.sub}>
                  {t('exercise.answer')} {q.answer}
                </span>
                <span className="leading-relaxed">{q.explanation}</span>
              </div>
            ) : null}
          </div>
        )
      })}

      {/* 篇章搭配 */}
      {collocations && collocations.length > 0 ? (
        <div className={`${theme.card} ${cardCls}`} data-testid="exercise-collocations">
          <span className={`text-xs font-semibold ${theme.sub}`}>{t('exercise.collocations')}</span>
          <div className="flex flex-wrap gap-1.5">
            {collocations.map((c) => (
              <span key={c} data-testid="exercise-collocation" className={`px-2 py-1 rounded-lg border ${theme.border} text-xs font-mono`}>
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
