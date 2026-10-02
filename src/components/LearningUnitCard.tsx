/* Stage 2 产品探索 · 学习单元入口卡（挂在 Home 页，Stage 2 第一刀的「单元入口」）。
 *
 * 这一刀只新增一个入口：用户此前在首页只能看到「到期复习 / 弱项 / 新词」三个**词库动作**，
 * 没有任何界面能回答「我现在在学哪一段、这一段还有什么别的」。这张卡就是那个回答。
 *
 * ⚠️ 不新增页签：页签集合（今日 / 打字练习 / 背单词 / 复习 / 进度）是 UI 契约锚点，
 * 加一个 tab 要动 tablist + e2e 断言面，为产品探索付全局代价不划算。
 * 点开走 Home 页内的 sub-view（见 LearningUnitPanel），不引入路由。 */
import { GraduationCap } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import { useT } from '../i18n/hooks'
import type { LearningUnit } from '../data/learningUnits'

interface LearningUnitCardProps {
  theme: ThemeConfig
  unit: LearningUnit
  /** 本单元完成度（0–100），来自现有 analytics 的词级总账 */
  progress: number
  onOpen: () => void
}

export default function LearningUnitCard({ theme, unit, progress, onOpen }: LearningUnitCardProps) {
  const t = useT()
  const btnCls = `flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold active:scale-95 transition-all ${theme.accent}`

  return (
    <div
      data-testid="home-unit-card"
      className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4 flex flex-col gap-3`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap size={15} className={theme.accent} />
          {t('unit.card')}
        </div>
        <div className="text-xs tabular-nums" data-testid="unit-card-progress">
          {progress}%
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-base font-bold ${theme.accent}`} data-testid="unit-card-title">
          {t(unit.titleKey)}
        </span>
        <span className={`text-xs ${theme.sub}`}>{t(unit.summaryKey)}</span>
      </div>

      <div className={`text-xs ${theme.sub}`} data-testid="unit-card-words">
        {unit.wordCount} {t('bank.wordsUnit')}
      </div>

      <button data-testid="unit-card-open" onClick={onOpen} className={btnCls}>
        {t('unit.enter')}
      </button>
    </div>
  )
}
