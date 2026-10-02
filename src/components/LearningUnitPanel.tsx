/* Stage 2 产品探索 · 学习单元展开视图（Home 页内 sub-view，不做路由）。
 *
 * 这一页要回答的是：一个真实 IELTS 学习单元怎么串起
 *  词汇 → 音频 → 字幕 → 听力 → 练习 → 复习/进度
 * 七个环节里「复习 / 进度」不在这里实现 —— 它们已经存在（ReviewPanel / ProgressPanel /
 * analytics / streak），本页只把「本单元完成度」从现有 analytics 的词级总账算出来，
 * 并通过 `onStart` 复用现有开轮通道（startRound(source?: WordItem[])）把 100 词交出去。
 *
 * ⚠️ 零伪造可用性（本刀最重要的产品原则）：
 *    - 音频：条目（5 条 title）存在但**没有任何二进制** ⇒ 只列条目 + 显式「待接入」，不做播放器
 *    - 字幕：内容层**连包都不存在**（subtitle 是 AssetKind 不是 ContentType）⇒ 只给占位说明
 *    - 练习：条目存在但**没有题目数据** ⇒ 只列条目 + 显式「待接入」，不做假作答面板
 * 这三类都不能出现「点了没反应」或「点了进一个空壳」—— 一律给可见文案。
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, Headphones, ListChecks, Play, ScrollText, Volume2 } from 'lucide-react'
/* 顶层 barrel `../core/content` 是内容层的唯一门面（CONTENT_CONTRACT §12.1）：
 * 深路径直引 core/content/** 会顶破架构门 ui-contract 的 bypassFacadeImports 棘轮（基线 0）。 */
import { loadPackageData } from '../core/content'
import type { LearningUnit } from '../data/learningUnits'
import { useT } from '../i18n/hooks'

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

/** items.json 条目（当前三个 demo 包都是 `{ id, title }`，只取这两个字段展示） */
interface ItemRow {
  id: string
  title: string
}

const toRows = (rows: unknown[]): ItemRow[] =>
  rows.flatMap((r) => {
    const o = r as { id?: unknown; title?: unknown }
    return typeof o.id === 'string' && typeof o.title === 'string' ? [{ id: o.id, title: o.title }] : []
  })

export default function LearningUnitPanel({ theme, unit, canStart, progress, onStart, onBack }: LearningUnitPanelProps) {
  const t = useT()

  const [rowsByPkg, setRowsByPkg] = useState<Record<string, ItemRow[]>>({})

  /* 挂载条目：三个 demo 包都是 lazy（各自独立 items-* chunk），聚合不触发 registry 改动。
   * 词段不在本组件解析 —— 词对象是 App 层从 registry 取的（见 selectUnitWords），
   * 这里渲染的是**编排表里的词形白名单**（string[]），UI 域因此不出现词表句柄上的算子。 */
  useEffect(() => {
    let alive = true
    Promise.all(unit.attached.map((a) => loadPackageData(a.localId)))
      .then((groups) => {
        if (!alive) return
        setRowsByPkg(Object.fromEntries(unit.attached.map((a, i) => [a.localId, toRows(groups[i])])))
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

  const rows = (localId: string) => rowsByPkg[localId] ?? []

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

      {/* 音频（placeholder：无二进制） */}
      <div className={cardCls} data-testid="unit-audio">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Volume2 size={15} className={theme.accent} />
          {t('unit.section.audio')}
          <span className={`text-xs tabular-nums ${theme.sub}`}>{rows('demo-audio-01').length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rows('demo-audio-01').map((r) => (
            <span key={r.id} className={`${rowCls} font-mono`}>
              {r.title}
            </span>
          ))}
        </div>
        <div className={pendingCls} data-testid="unit-audio-pending">
          ⚠️ {t(unit.attached[0]?.reasonKey ?? 'unit.status.audioPending')}
        </div>
      </div>

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

      {/* 听力（listed：仅列标题） */}
      <div className={cardCls} data-testid="unit-listening">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Headphones size={15} className={theme.accent} />
          {t('unit.section.listening')}
          <span className={`text-xs tabular-nums ${theme.sub}`}>{rows('demo-listening-01').length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rows('demo-listening-01').map((r) => (
            <span key={r.id} className={`${rowCls} font-mono`}>
              {r.title}
            </span>
          ))}
        </div>
      </div>

      {/* 练习（placeholder：无题目数据） */}
      <div className={cardCls} data-testid="unit-exercise">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks size={15} className={theme.accent} />
          {t('unit.section.exercise')}
          <span className={`text-xs tabular-nums ${theme.sub}`}>{rows('demo-exercise-01').length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rows('demo-exercise-01').map((r) => (
            <span key={r.id} className={`${rowCls} font-mono`}>
              {r.title}
            </span>
          ))}
        </div>
        <div className={pendingCls} data-testid="unit-exercise-pending">
          ⚠️ {t(unit.attached[2]?.reasonKey ?? 'unit.status.exercisePending')}
        </div>
      </div>
    </div>
  )
}
