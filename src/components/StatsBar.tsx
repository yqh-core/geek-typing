import { useT } from '../i18n'

interface StatProps {
  label: string
  value: string
  valueClass: string
}

function Stat({ label, value, valueClass }: StatProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-widest opacity-60">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

interface StatsBarProps {
  accent: string
  progress: { current: number; total: number }
  accuracy: string
  wpm: string
  combo: number
  percent: number
}

export default function StatsBar({ accent, progress, accuracy, wpm, combo, percent }: StatsBarProps) {
  const t = useT()
  return (
    <div className="w-full flex items-center justify-between gap-4 px-1">
      <Stat label={t('stats.progress')} value={`${progress.current}/${progress.total}`} valueClass={accent} />
      <Stat label={t('stats.accuracy')} value={accuracy} valueClass={accent} />
      <Stat label={t('stats.wpm')} value={wpm} valueClass={accent} />
      <Stat label={t('stats.combo')} value={`x${combo}`} valueClass={accent} />

      <div className={`hidden sm:block w-32 h-1.5 rounded-full bg-black/20 overflow-hidden ${accent}`}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: 'currentColor' }}
        />
      </div>
    </div>
  )
}
