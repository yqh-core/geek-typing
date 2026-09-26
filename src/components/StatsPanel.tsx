import { useState } from 'react'
import { BarChart3, X, RotateCcw, Crosshair, Trash2 } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import {
  accuracyOf,
  resetAnalytics,
  weakLetters,
  wrongWords,
  type Analytics,
} from '../lib/analytics'

interface StatsPanelProps {
  theme: ThemeConfig
  analytics: Analytics
  onWeakPractice: () => void
  onReviewWord: (word: string) => void
  onReset: () => void
}

export default function StatsPanel({
  theme,
  analytics,
  onWeakPractice,
  onReviewWord,
  onReset,
}: StatsPanelProps) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const weak = weakLetters(analytics, 8)
  const wrong = wrongWords(analytics, 10)
  const maxMiss = Math.max(1, ...weak.map((w) => w.miss))

  return (
    <>
      <button
        data-testid="open-stats"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs ${theme.accent} transition-all hover:opacity-80`}
        onClick={() => setOpen(true)}
        title="错词与击键分析"
      >
        <BarChart3 size={13} />
        数据
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={`w-full max-w-2xl ${theme.card} border ${theme.border} rounded-2xl p-6 shadow-2xl animate-popIn max-h-[85vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-bold ${theme.accent}`}>学习数据分析</h3>
              <button onClick={() => setOpen(false)} className={theme.sub} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            {/* 总览 */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 ${theme.sub}`}>
              {[
                { label: '累计击键', value: analytics.totalKeys },
                { label: '总正确率', value: `${accuracyOf(analytics)}%` },
                { label: '完成词数', value: analytics.totalWords },
                { label: '最高 WPM', value: analytics.bestWpm },
              ].map((it) => (
                <div key={it.label} className={`rounded-xl border ${theme.border} px-3 py-3`}>
                  <div className="text-[11px]">{it.label}</div>
                  <div className="text-xl font-bold tabular-nums">{it.value}</div>
                </div>
              ))}
            </div>

            {/* 易错字母 */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3">最常敲错的键</div>
              {weak.length === 0 ? (
                <div className={`text-xs ${theme.sub}`}>还没有数据，先敲几轮再来</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {weak.map((w) => (
                    <div key={w.letter} className="flex items-center gap-3">
                      <span className="w-6 text-center font-mono font-bold uppercase">{w.letter}</span>
                      <div className="flex-1 h-4 rounded bg-black/15 overflow-hidden">
                        <div
                          className="h-full bg-red-400/70 transition-all"
                          style={{ width: `${(w.miss / maxMiss) * 100}%` }}
                        />
                      </div>
                      <span className={`text-[11px] tabular-nums ${theme.sub} w-16 text-right`}>
                        错 {w.miss} 次 · {Math.round(w.rate * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {weak.length > 0 && (
                <button
                  data-testid="weak-practice"
                  onClick={() => {
                    setOpen(false)
                    onWeakPractice()
                  }}
                  className="mt-4 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/50 text-emerald-400 text-xs font-semibold active:scale-95"
                >
                  <Crosshair size={13} />
                  针对这些弱字母专攻一轮
                </button>
              )}
            </div>

            {/* 错词榜 */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3">错词榜</div>
              {wrong.length === 0 ? (
                <div className={`text-xs ${theme.sub}`}>暂无错词，干净得离谱 👏</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {wrong.map((w) => (
                    <button
                      key={w.word}
                      onClick={() => {
                        setOpen(false)
                        onReviewWord(w.word)
                      }}
                      className={`px-3 py-1.5 rounded-lg border ${theme.border} text-xs font-mono hover:border-red-400/60`}
                    >
                      {w.word}
                      <span className={`ml-2 ${theme.sub}`}>×{w.wrong}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 重置 */}
            <div className={`pt-4 border-t ${theme.border} flex items-center justify-between`}>
              <span className={`text-[11px] ${theme.sub}`}>数据只保存在本机 localStorage</span>
              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onReset()
                      setConfirmReset(false)
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/60 text-red-400 text-xs"
                  >
                    <Trash2 size={12} />
                    确认清空
                  </button>
                  <button onClick={() => setConfirmReset(false)} className={`text-xs ${theme.sub}`}>
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className={`flex items-center gap-1 text-xs ${theme.sub}`}
                >
                  <RotateCcw size={12} />
                  清空统计数据
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export { resetAnalytics }
