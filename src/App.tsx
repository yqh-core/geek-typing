/* P1.6-D · App 组合层
 *
 * 重构说明：原 957 行的「上帝组件」已拆为 8 个 hook，App 只保留两件事：
 *   1) 把 hook 组合起来（含跨 hook 的依赖桥接）；
 *   2) 渲染 JSX。
 *
 * hook 分工：
 *   useTabNav        页签导航（WAI-ARIA tablist，roving tabindex）
 *   useSettings      7 项偏好 + 持久化 + 音效开关
 *   useCommandMode   命令态（Esc 切换，打开时打字/背单词键盘流让位）
 *   useBank          词库（内置 + 自定义 + 懒加载词条）
 *   useAnalytics     analytics 态 + 镜像 ref + 节流落盘
 *   useStreak        打卡 history + 今日词数 / 连续天数
 *   useReviewFlow    错题本派生 + 复习轮 / 单挑轮归属映射
 *   useTypingRound   打字状态机（**不认识学习语义**，只回调 onCompleteWord）
 *
 * 学习语义的唯一接线点在本文件：onCompleteWord → practiceEngine.completeTypingWord。
 * 这样 practice-engine 门禁天然成立（hook 里不出现「完成三连」）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import PracticePanel from './components/PracticePanel'
import ResultOverlay from './components/ResultOverlay'
import StreakBar from './components/StreakBar'
import KeyMap from './components/KeyMap'
import Memorize from './components/Memorize'
import HomePanel from './components/HomePanel'
import LearningUnitPanel from './components/LearningUnitPanel'
import ReviewPanel from './components/ReviewPanel'
import ProgressPanel from './components/ProgressPanel'
import CommandPalette from './components/CommandPalette'
import { THEMES } from './lib/theme'
import { sound } from './lib/sound'
import { practiceEngine, type PracticeSession } from './core/practice'
import { getCatalog } from './core/content'
import { speak, warmSpeech } from './lib/speech'
import { Terminal } from 'lucide-react'
import { useT, useLang } from './i18n/hooks'
import {
  ACTIVE_LEARNING_UNIT,
  loadUnitWords,
  unitProgressOf,
  type UnitWordList,
} from './data/learningUnits'
import { useTabNav, type TabId } from './hooks/useTabNav'
import { useSettings } from './hooks/useSettings'
import { useCommandMode } from './hooks/useCommandMode'
import { useBank } from './hooks/useBank'
import { useAnalytics } from './hooks/useAnalytics'
import { useStreak } from './hooks/useStreak'
import { useReviewFlow } from './hooks/useReviewFlow'
import { useTypingRound } from './hooks/useTypingRound'
import type { WordItem } from './data/wordBanks'

/** CommandPalette 等外部消费者仍从 '../App' 取 TabId，此处保持再导出 */
export type { TabId }

/** P1.7-W5C：内容目录汇总（同步、只读 manifest，来自 registry 静态注册）。
 *  仅组合展示用，计算一次即可，不触发任何词条加载。 */
const contentCatalog = getCatalog()

/** 页签 id / 面板 id：tabpanel 的 aria-labelledby 需指回页签 id，故两者成对生成 */
const tabDomId = (id: TabId) => `tab-${id}`
const tabPanelDomId = (id: TabId) => `tabpanel-${id}`

export default function App() {
  const t = useT()
  const { lang } = useLang()

  const { tab, setTab, tabRefs, handleTabKeyDown } = useTabNav()
  const {
    bankId,
    setBankId,
    themeId,
    setThemeId,
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,
    shuffled,
    setShuffled,
    mode,
    setMode,
    autoSpeak,
    setAutoSpeak,
  } = useSettings()
  const { commandMode, setCommandMode, closePalette } = useCommandMode()
  const { banks, bank, bankWords, loadFailed, retryBankLoad } = useBank(bankId)
  const { analytics, analyticsRef, updateAnalytics, reset: resetAnalytics } = useAnalytics()
  const { history, setHistory, todayCount, streakDays } = useStreak()

  const theme = THEMES[themeId]

  /* ---------------- 学习单元（Stage 2 第一刀）----------------
   * 首页单元卡要显示「本单元完成度」，所以 App 这里也要拿到单元词（与面板共用
   * registry.loadPackage 的缓存，不产生第二份 3000 词内存）。
   * 单元展开视图是 Home 页内的 sub-view：不新增页签（页签集合是 UI 契约锚点）、
   * 不引入路由（第一刀不需要可分享的 URL，这是已知取舍）。 */
  const [unitOpen, setUnitOpen] = useState(false)
  const [unitPicked, setUnitPicked] = useState<UnitWordList | null>(null)

  /* 词段加载在 data 层（loadUnitWords）：App 域里不出现任何「词表来源点 / 词表句柄」，
   * 否则会被架构门 ui-contract 计入 wordTableSources / handleReads 棘轮（只许降不许升）。 */
  useEffect(() => {
    let alive = true
    loadUnitWords(ACTIVE_LEARNING_UNIT)
      .then((picked) => {
        if (alive && picked) setUnitPicked(picked)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /* 完成度计算在 data 层（unitProgressOf）—— UI 域只收一个 number，
   * 不持有词表句柄做算子，避免顶破 ui-contract 的 handleReads / bannedArrayOps 棘轮。 */
  const unitProgress = useMemo(
    () => unitProgressOf(analytics, ACTIVE_LEARNING_UNIT, unitPicked),
    [unitPicked, analytics],
  )

  /* ---------------- 依赖环的显式破环点 ----------------
   * useReviewFlow 需要 startRound（复习轮开轮），而 useTypingRound 的完成回调需要
   * useReviewFlow 的 wordCtx（跨包归属）—— 二者互为依赖。用一层 ref 桥接：
   * 复习流的开轮动作只发生在事件回调里，挂载后 startRoundRef 必然已填充。 */
  const startRoundRef = useRef<((source?: WordItem[]) => void) | null>(null)
  const startRoundBridge = useCallback((source?: WordItem[]) => {
    if (!startRoundRef.current) {
      // G4-3 零静默失败：桥未回填就开轮会是「点了没反应」的静默故障，必须可观测。
      // （挂载 effect 必然先于任何用户事件回填，此处只在极端时序异常时触发）
      console.warn('[App] startRound 桥未就绪，复习轮开轮被忽略', source?.length ?? 0)
      return
    }
    startRoundRef.current(source)
  }, [])

  const {
    reviewVersion,
    bumpReview,
    roundContentIdsRef,
    wordCtx,
    dueCount,
    reviewTotal,
    recommendation,
    reviewSingleWord,
    startReviewRound,
  } = useReviewFlow({ banks, bankWords, bankId, startRound: startRoundBridge, setTab, tab })

  /** 本轮练习会话（Practice Engine 的去重作用域）：每轮重建，保证一轮内同 contentId 只落一次 */
  const sessionRef = useRef<PracticeSession | null>(null)

  /** 开轮钩子：清空归属映射 + 重建引擎会话（复习轮 / 单挑轮随后自行覆盖映射） */
  const onRoundStart = useCallback(() => {
    roundContentIdsRef.current = new Map()
    sessionRef.current = practiceEngine.createSession('typing', [])
  }, [roundContentIdsRef])

  /** 整词完成 —— 学习语义的唯一接线点：Practice Engine（3 连调用语义中枢） */
  const onCompleteWord = useCallback(
    (word: string, perfect: boolean, wpm: number) => {
      const session = sessionRef.current ?? practiceEngine.createSession('typing', [])
      sessionRef.current = session
      const res = practiceEngine.completeTypingWord(
        session,
        { word, perfect, wpm },
        analyticsRef.current,
        wordCtx(word),
      )
      updateAnalytics(() => res.analytics)
      if (res.reviewWritten) bumpReview()
    },
    [analyticsRef, updateAnalytics, wordCtx, bumpReview],
  )

  const {
    queue,
    wordIndex,
    typed,
    errorFlash,
    wrongKey,
    finished,
    stats,
    elapsedMs,
    wrongItems,
    milestone,
    countdown,
    current,
    startRound,
    startWeakRound,
    accuracy,
    wpm,
    percent,
    upcoming,
    nextKey,
    completedWords,
  } = useTypingRound({
    bankWords,
    shuffled,
    mode,
    tab,
    commandMode,
    autoSpeak,
    analytics,
    updateAnalytics,
    setHistory,
    onCompleteWord,
    onRoundStart,
  })

  // 破环桥回填：挂载后复习流的开轮动作即指向真实 startRound
  useEffect(() => {
    startRoundRef.current = startRound
  }, [startRound])

  // 预热语音引擎（某些浏览器首次 getVoices 为空）
  useEffect(() => {
    warmSpeech()
  }, [])

  return (
    <div className={`min-h-screen ${theme.root} transition-colors duration-300`}>
      {/* 背景光晕 */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-[820px] h-[520px] rounded-full blur-3xl opacity-[0.07] bg-emerald-500" />
      </div>

      <div className="relative flex flex-col items-center gap-8 py-10 px-4 min-h-screen">
        <Header
          theme={theme}
          banks={banks}
          bankId={bankId}
          onBankChange={setBankId}
          onThemeChange={setThemeId}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled((v) => !v)}
          soundTheme={soundTheme}
          onSoundThemeChange={setSoundTheme}
          shuffled={shuffled}
          onShuffleToggle={() => setShuffled((v) => !v)}
          autoSpeak={autoSpeak}
          onAutoSpeakToggle={() => setAutoSpeak((v) => !v)}
          currentMode={mode}
          onModeChange={(id) => {
            setMode(id)
            startRound()
          }}
          analytics={analytics}
          onWeakPractice={startWeakRound}
          onReviewWord={reviewSingleWord}
          onReset={resetAnalytics}
          dueCount={dueCount}
          reviewTotal={reviewTotal}
          onReviewRound={() => {
            sound.tap()
            void startReviewRound()
          }}
          onRestart={() => {
            sound.tap()
            startRound()
          }}
          onOpenCommand={() => setCommandMode(true)}
        />

        {/* 页签切换：今日 / 打字 / 背单词 / 复习 / 进度
            WAI-ARIA tablist：roving tabindex（仅选中项 tabIndex=0，其余 -1，Tab 一次即可穿过导航）
            ←/→ 循环切换并自动激活，Home/End 跳首尾，Enter/Space 激活 */}
        <div
          role="tablist"
          aria-label={t('tab.label')}
          className={`flex items-center p-1 rounded-xl border ${theme.border} gap-1 flex-wrap`}
        >
          {(
            [
              { id: 'home', label: t('tab.home') },
              { id: 'typing', label: t('tab.typing') },
              { id: 'memorize', label: t('tab.memorize') },
              { id: 'review', label: t('tab.review') },
              { id: 'progress', label: t('tab.progress') },
            ] as { id: TabId; label: string }[]
          ).map((tb) => (
            <button
              key={tb.id}
              id={tabDomId(tb.id)}
              role="tab"
              aria-selected={tab === tb.id}
              aria-controls={tabPanelDomId(tb.id)}
              tabIndex={tab === tb.id ? 0 : -1}
              ref={(node) => {
                tabRefs.current[tb.id] = node
              }}
              data-testid={`tab-${tb.id}`}
              onKeyDown={(e) => handleTabKeyDown(e, tb.id)}
              onClick={() => {
                sound.tap()
                setTab(tb.id)
              }}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                tab === tb.id ? `${theme.accent} bg-white/10` : theme.sub
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {tab === 'typing' && (
          <div className="w-full max-w-4xl">
            <StatsBar
              accent={theme.accent}
              progress={{ current: Math.min(wordIndex + 1, queue.length), total: queue.length }}
              accuracy={`${accuracy}%`}
              wpm={String(wpm)}
              combo={stats.combo}
              percent={percent}
            />
          </div>
        )}

        {/* 限时模式倒计时（原模式行保留项） */}
        {tab === 'typing' && mode === 'timed' && countdown !== null && (
          <span
            data-testid="countdown"
            className={`text-sm font-bold tabular-nums ${countdown <= 10 ? 'text-red-400' : theme.accent}`}
          >
            ⏱ {countdown}s
          </span>
        )}
        {tab === 'typing' && mode === 'spell' && (
          <span className={`text-[11px] ${theme.sub}`}>{t('practice.spellFix')}</span>
        )}

        {/* 页签面板：role=tabpanel 与上方页签通过 id / aria-labelledby 双向关联 */}
        <div
          id={tabPanelDomId(tab)}
          role="tabpanel"
          aria-labelledby={tabDomId(tab)}
          className="flex-1 w-full flex items-center justify-center py-4 relative"
        >
          {tab === 'typing' && milestone && (
            <div
              className={`pointer-events-none absolute top-0 z-20 px-5 py-2 rounded-full border ${theme.border} ${theme.card} ${theme.accent} text-sm font-bold animate-popIn shadow-2xl`}
            >
              🔥 {milestone} {t('milestone.combo')}
            </div>
          )}
          {tab === 'home' ? (
            unitOpen ? (
              <LearningUnitPanel
                theme={theme}
                unit={ACTIVE_LEARNING_UNIT}
                canStart={Boolean(unitPicked)}
                progress={unitProgress}
                onStart={() => {
                  sound.tap()
                  setTab('typing')
                  if (unitPicked) startRound(unitPicked)
                }}
                onBack={() => setUnitOpen(false)}
              />
            ) : (
            <HomePanel
              theme={theme}
              recommendation={recommendation}
              bankName={lang === 'en' ? bank?.nameEn ?? bank?.name ?? '' : bank?.name ?? ''}
              bankCount={bank?.count ?? bank?.words.length ?? 0}
              catalogSummary={{ packages: contentCatalog.packages.length, items: contentCatalog.totalItems }}
              unit={ACTIVE_LEARNING_UNIT}
              unitProgress={unitProgress}
              onOpenUnit={() => setUnitOpen(true)}
              onReviewRound={() => {
                sound.tap()
                void startReviewRound()
              }}
              onWeakRound={() => {
                setTab('typing')
                startWeakRound()
              }}
              onNewRound={() => {
                setTab('typing')
                startRound()
              }}
            />
            )
          ) : tab === 'review' ? (
            <ReviewPanel
              theme={theme}
              banks={banks}
              reviewVersion={reviewVersion}
              analytics={analytics}
              onReviewRound={() => {
                sound.tap()
                void startReviewRound()
              }}
              onReviewWord={(word) => {
                setTab('typing')
                reviewSingleWord(word)
              }}
            />
          ) : tab === 'progress' ? (
            <ProgressPanel theme={theme} history={history} analytics={analytics} streakDays={streakDays} />
          ) : tab === 'memorize' ? (
            /* key=bank.id：memorize 视图按 (词,包) 归属，切库即重挂载重取本包视图，
             * 杜绝「旧库视图过滤新库词表」的瞬时脏状态 */
            <Memorize key={bank.id} theme={theme} bank={{ ...bank, words: bankWords }} paused={commandMode} streakDays={streakDays} loadFailed={loadFailed} onRetryBankLoad={retryBankLoad} />
          ) : current ? (
            <PracticePanel
              theme={theme}
              word={current.word}
              translation={current.translation}
              definition={current.definition}
              typed={typed}
              errorFlash={errorFlash}
              wrongKey={wrongKey}
              upcoming={upcoming}
              mode={mode}
              onSpeak={mode === 'code' ? undefined : () => speak(current.word)}
            />
          ) : (
            <div className={theme.sub}>{t('footer.loading')}</div>
          )}
        </div>

        {/* 虚拟键盘：高亮下一个该敲的键（仅打字页签） */}
        {tab === 'typing' && <KeyMap theme={theme} nextKey={nextKey} wrongKey={errorFlash ? wrongKey : null} />}

        {tab === 'typing' && (
          <div data-testid="esc-hint" className={`text-[11px] tracking-widest uppercase ${theme.sub} -mt-4`}>
            {t('keymap.escHint')}
          </div>
        )}

        {tab === 'typing' && (
          <footer className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs ${theme.sub}`}>
            <span className="flex items-center gap-1.5">
              <Terminal size={13} />
              {t('footer.hint1')}
            </span>
            <span>{mode === 'spell' ? t('footer.hintSpell') : t('footer.hintClassic')}</span>
            <span>{t('footer.hint3')}</span>
          </footer>
        )}

        <StreakBar theme={theme} history={history} todayCount={todayCount} />
      </div>

      {commandMode && (
        <CommandPalette
          theme={theme}
          banks={banks}
          bankId={bankId}
          onBankChange={setBankId}
          onModeChange={(id) => {
            setMode(id)
            startRound()
          }}
          onThemeChange={setThemeId}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled((v) => !v)}
          soundTheme={soundTheme}
          onSoundThemeChange={setSoundTheme}
          shuffled={shuffled}
          onShuffleToggle={() => setShuffled((v) => !v)}
          onTabChange={(tb: TabId) => {
            sound.tap()
            setTab(tb)
          }}
          onRestart={() => startRound()}
          onReviewRound={startReviewRound}
          onClose={closePalette}
        />
      )}

      {tab === 'typing' && finished && (
        <ResultOverlay
          theme={theme}
          stats={{
            words: mode === 'timed' ? completedWords : queue.length,
            accuracy,
            wpm,
            bestCombo: stats.bestCombo,
            seconds: Math.round(elapsedMs / 1000),
            wrongCount: wrongItems.length,
          }}
          mode={mode}
          todayCount={todayCount}
          onRestart={() => {
            sound.tap()
            startRound()
          }}
          onReview={() => {
            sound.tap()
            startRound(wrongItems.length > 0 ? wrongItems : undefined)
          }}
          reviewAvailable={wrongItems.length > 0}
        />
      )}
    </div>
  )
}
