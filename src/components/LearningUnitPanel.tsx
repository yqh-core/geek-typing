/* Stage 2 产品探索 · 学习单元展开视图（Home 页内 sub-view，不做路由）。
 *
 * 这一页要回答的是：一个真实学习单元怎么串起
 *  词汇 → 音频 → 字幕 → 听力 → 阅读 → 练习 → 复习/进度
 * 「复习 / 进度」不在这里实现 —— 它们已经存在（ReviewPanel / ProgressPanel /
 * analytics / streak），本页只把「本单元完成度」从现有 analytics 的词级总账算出来，
 * 并通过 `onStart` 复用现有开轮通道（startRound(source?: WordItem[])）把词段交出去。
 *
 * ⚠️ 零伪造可用性（本刀最重要的产品原则）：
 *    - 音频：条目（5 条 title）存在但**没有任何二进制** ⇒ 只列条目 + 显式「待接入」，不做播放器
 *    - 字幕：内容层**连包都不存在**（subtitle 是 AssetKind 不是 ContentType）⇒ 只给占位说明
 *    - 练习：条目存在但**没有题目数据** ⇒ 只列条目 + 显式「待接入」，不做假作答面板
 * 这三类都不能出现「点了没反应」或「点了进一个空壳」—— 一律给可见文案。
 *
 * ── A1-E：挂载区改为**按 attached 通用渲染** ──
 * 之前三个挂载区（音频/听力/练习）把 localId 写死成 demo-* 并按 `unit.attached[0]` / `[2]`
 * 取 reasonKey。Unit-03（IELTS Education）挂的是 reading/exercise 正式包，写死会让它的
 * 挂载区整片渲染成空、且 reasonKey 取错行。现在按 `unit.attached` 逐项渲染，
 * 分区形态由**包类型**（getPackageCatalog 的 type）决定，不是由 localId 文本决定：
 *   reading  → 有 body/paragraphs 就渲染正文，否则退回列条目
 *   exercise → 有 questions.items 就渲染可作答的 ExercisePanel，否则列条目 + 待接入
 *   其余     → 列条目（placeholder 时附待接入原因）
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Headphones, ListChecks, Play, ScrollText, Volume2 } from 'lucide-react'
/* 顶层 barrel `../core/content` 是内容层的唯一门面（CONTENT_CONTRACT §12.1）：
 * 深路径直引 core/content/** 会顶破架构门 ui-contract 的 bypassFacadeImports 棘轮（基线 0）。 */
import { getPackageCatalog, loadPackageData } from '../core/content'
import type { LearningUnit } from '../data/learningUnits'
import { useT } from '../i18n/hooks'
import ExercisePanel, { type ExerciseQuestion } from './ExercisePanel'

interface LearningUnitPanelProps {
  theme: import('../lib/theme').ThemeConfig
  unit: LearningUnit
  /** 词段是否解析完成（词对象由 App 层从 registry 取后透传给开轮通道） */
  canStart: boolean
  /** 本单元完成度 0–100，由 App 层经 data 层 unitProgressOf 算出（UI 域不持词表句柄做算子） */
  progress: number
  onStart: () => void
  onBack: () => void
}

/** items.json 条目（多数包是 `{ id, title }`，只取这两个字段展示） */
interface ItemRow {
  id: string
  title: string
}

const toRows = (rows: unknown[]): ItemRow[] =>
  rows.flatMap((r) => {
    const o = r as { id?: unknown; title?: unknown }
    return typeof o.id === 'string' && typeof o.title === 'string' ? [{ id: o.id, title: o.title }] : []
  })

/** 从 reading 条目里取正文：优先 paragraphs（已分段），退回 body 整段。 */
function readingBodyOf(rows: unknown[]): { title: string; paragraphs: string[] } | null {
  for (const r of rows) {
    const o = r as { title?: unknown; paragraphs?: unknown; body?: unknown }
    if (typeof o.paragraphs === 'object' && o.paragraphs !== null && Array.isArray(o.paragraphs)) {
      const ps = o.paragraphs.filter((p): p is string => typeof p === 'string')
      if (ps.length > 0) return { title: typeof o.title === 'string' ? o.title : '', paragraphs: ps }
    }
    if (typeof o.body === 'string' && o.body.trim().length > 0) {
      return { title: typeof o.title === 'string' ? o.title : '', paragraphs: [o.body] }
    }
  }
  return null
}

/**
 * 从 exercise 条目里取题目。内容层给的是 unknown，逐字段**收窄后再用**，
 * 任何一条不合规就整包判为「无题目数据」—— 宁可显式待接入，也不渲染半个题面。
 */
function exerciseOf(rows: unknown[]): { questions: ExerciseQuestion[]; collocations: string[] } | null {
  for (const r of rows) {
    const o = r as { questions?: unknown }
    const q = o.questions
    if (typeof q !== 'object' || q === null) continue
    const raw = (q as { items?: unknown }).items
    if (!Array.isArray(raw) || raw.length === 0) continue

    const questions: ExerciseQuestion[] = []
    for (const it of raw) {
      const x = it as {
        id?: unknown; type?: unknown; prompt?: unknown; options?: unknown
        answer?: unknown; explanation?: unknown; skill?: unknown
      }
      if (typeof x.id !== 'string' || typeof x.prompt !== 'string' || typeof x.answer !== 'string') return null
      if (x.type !== 'mcq' && x.type !== 'tfng') return null
      if (!Array.isArray(x.options)) return null
      const options = x.options.map((op) => op as { key?: unknown; text?: unknown })
      const okOpts = options.every((op) => typeof op.key === 'string' && typeof op.text === 'string')
      if (!okOpts) return null
      questions.push({
        id: x.id,
        type: x.type,
        prompt: x.prompt,
        options: options.map((op) => ({ key: op.key as string, text: op.text as string })),
        answer: x.answer,
        explanation: typeof x.explanation === 'string' ? x.explanation : '',
        skill: typeof x.skill === 'string' ? x.skill : '',
      })
    }
    const cols = (q as { collocations?: unknown }).collocations
    const collocations = Array.isArray(cols) ? cols.filter((c): c is string => typeof c === 'string') : []
    return { questions, collocations }
  }
  return null
}

export default function LearningUnitPanel({ theme, unit, canStart, progress, onStart, onBack }: LearningUnitPanelProps) {
  const t = useT()

  const [rowsByPkg, setRowsByPkg] = useState<Record<string, unknown[]>>({})

  /* 挂载条目：包都是 lazy（各自独立 items-* chunk），聚合不触发 registry 改动。
   * 词段不在本组件解析 —— 词对象是 App 层从 registry 取的（见 selectUnitWords），
   * 这里渲染的是**编排表里的词形白名单**（string[]），UI 域因此不出现词表句柄上的算子。 */
  useEffect(() => {
    let alive = true
    Promise.all(unit.attached.map((a) => loadPackageData(a.localId)))
      .then((groups) => {
        if (!alive) return
        setRowsByPkg(Object.fromEntries(unit.attached.map((a, i) => [a.localId, groups[i]])))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [unit])

  const cardCls = `${theme.card} border ${theme.border} rounded-2xl px-5 py-4 flex flex-col gap-3`
  const btnCls = `flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold active:scale-95 transition-all ${theme.accent}`
  const pendingCls = `text-xs ${theme.sub}`
  const rowCls = `px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs`

  const raw = (localId: string): unknown[] => rowsByPkg[localId] ?? []
  const rows = (localId: string): ItemRow[] => toRows(raw(localId))

  /** 分区图标：按包类型选，不按 localId 文本猜。 */
  const iconOf = (type: string) => {
    if (type === 'audio') return <Volume2 size={15} className={theme.accent} />
    if (type === 'listening') return <Headphones size={15} className={theme.accent} />
    if (type === 'reading') return <BookOpen size={15} className={theme.accent} />
    return <ListChecks size={15} className={theme.accent} />
  }
  const sectionLabelKey = (type: string) =>
    type === 'reading' ? 'unit.section.reading' : `unit.section.${type}`

  return (
    <div data-testid="unit-panel" className="w-full max-w-4xl flex flex-col gap-4">
      {/* 顶部：返回 + 单元标题 + 完成度 */}
      <div className={`${cardCls}`}>
        <button data-testid="unit-back" onClick={onBack} className={`${theme.sub} text-xs flex items-center gap-1.5`}>
          <ArrowLeft size={13} />
          {t('unit.back')}
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-bold ${theme.accent}`} data-testid="unit-title">
              {t(unit.titleKey)}
            </span>
            <span className={`text-xs ${theme.sub}`}>{t(unit.summaryKey)}</span>
          </div>
          <div className={`text-xs ${theme.sub}`} data-testid="unit-progress">
            {t('unit.progress')} {progress}%
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-black/15 overflow-hidden">
          <div
            data-testid="unit-progress-bar"
            className="h-full rounded-full transition-all duration-500 bg-emerald-500/70"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button data-testid="unit-start" disabled={!canStart} onClick={onStart} className={btnCls}>
          <Play size={13} />
          {t('unit.start')}
        </button>
      </div>

      {/* 词段 */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText size={15} className={theme.accent} />
          {t('unit.section.words')}
          <span className={`text-xs tabular-nums ${theme.sub}`} data-testid="unit-words-count">
            {unit.wordCount}
          </span>
        </div>
        {/* 词列表来自编排表的词形白名单（渲染读的是 lexemes 镜像，不碰 `.words` 句柄；
            释义等词对象由 App 层经 registry 取后交给开轮通道）。 */}
        <div className="flex flex-wrap gap-1.5">
          {unit.lexemes.map((w) => (
            <span key={w} data-testid="unit-word" className={`${rowCls} font-mono`}>
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* 挂载区：按 attached 逐项渲染（形态由包类型决定，不是由 localId 文本决定） */}
      {unit.attached.map((a) => {
        const type = getPackageCatalog(a.localId)?.type ?? ''
        const data = raw(a.localId)
        const reading = type === 'reading' ? readingBodyOf(data) : null
        const exercise = type === 'exercise' ? exerciseOf(data) : null
        return (
          <div key={a.localId} className={cardCls} data-testid={`unit-attached-${a.localId}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {iconOf(type)}
              {t(sectionLabelKey(type))}
              <span className={`text-xs tabular-nums ${theme.sub}`}>{rows(a.localId).length}</span>
            </div>

            {reading ? (
              <div
                data-testid="unit-reading-body"
                className="max-h-72 overflow-y-auto flex flex-col gap-2 pr-1"
              >
                {reading.title ? <div className="text-sm font-semibold">{reading.title}</div> : null}
                {reading.paragraphs.map((p, i) => (
                  <p key={i} data-testid="unit-reading-para" className="text-xs leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            ) : null}

            {exercise ? (
              <ExercisePanel theme={theme} questions={exercise.questions} collocations={exercise.collocations} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rows(a.localId).map((r) => (
                  <span key={r.id} className={`${rowCls} font-mono`}>
                    {r.title}
                  </span>
                ))}
              </div>
            )}

            {a.status === 'placeholder' ? (
              <div className={pendingCls} data-testid={`unit-attached-${a.localId}-pending`}>
                ⚠️ {t(a.reasonKey ?? 'unit.status.audioPending')}
              </div>
            ) : null}
          </div>
        )
      })}

      {/* 字幕位（placeholder：内容层完全不存在） */}
      <div className={cardCls} data-testid="unit-subtitle">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks size={15} className={theme.accent} />
          {t('unit.section.subtitle')}
        </div>
        <div className={pendingCls} data-testid="unit-subtitle-pending">
          ⚠️ {t(unit.subtitleReasonKey)}
        </div>
      </div>
    </div>
  )
}
