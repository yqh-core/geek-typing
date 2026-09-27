# 练习机制（PRACTICE）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：4 种练习模式（classic / spell / timed / code）、打字核心链路、严格纠错、连击与里程碑、虚拟键盘提示、结算面板、音效
> 📐 **待建**：听说读写类练习（口语/听力/写作/阅读题）；练习内容仅限「单词」与「代码行」
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/modes.ts`（21 行）、`src/App.tsx`（键盘引擎 `:400-555`）、`src/components/{PracticePanel,ResultOverlay,KeyMap}.tsx`

---

## 1. 一句话事实

**练习是「打字 + 记单词」的合体，不是考试类型的练习。**

4 种模式的**差异只在「考什么」与「时间约束」，核心引擎是同一套**（`App.tsx:400-555`，一个 `keydown` 监听器）：

| 模式 | 考什么 | 大小写 | 自由输入 | 时间 |
|---|---|---|---|---|
| classic | 看词打字 | 不敏感 | ❌ 严格 | 无 |
| spell | 看中文拼英文 | 不敏感 | ✅ 自由 | 无 |
| timed | 同 classic | 不敏感 | ❌ 严格 | 60 秒 |
| code | 打真实代码行 | **敏感** | ❌ 严格 | 无 |

---

## 2. ✅ 已有：4 种模式定义

`src/lib/modes.ts`（21 行，全文实测）：

```ts
export type PracticeModeId = 'classic' | 'spell' | 'timed' | 'code'

export interface ModeConfig {
  id: PracticeModeId
  label: string
  hint: string
  /** 限时模式的时长（秒） */
  duration?: number
}

export const MODES: ModeConfig[] = [
  { id: 'classic', label: '经典模式', hint: '看词打字，敲对变绿、敲错被拦住' },
  { id: 'spell', label: '拼写模式', hint: '只给中文释义，考你自己拼出来' },
  { id: 'timed', label: '限时 60s', hint: '一分钟内尽量多打，练速度', duration: 60 },
  { id: 'code', label: '代码模式', hint: '大小写敏感练真实代码行，强化符号键肌肉记忆' },
]

export function getMode(id: PracticeModeId): ModeConfig {
  return MODES.find((m) => m.id === id) ?? MODES[0]
}
```

**`getMode()` 有兜底**（`:19`）：未知 id 返回 `MODES[0]`（classic），不会返回 `undefined`。

**唯一的时间参数**是 `duration`，仅 `timed` 有值（60 秒）。

---

## 3. ✅ 已有：打字核心链路

### 3.1 单一键盘监听器

`App.tsx:400-555` —— **一个 `window.addEventListener('keydown')`**，通过多层早返回来分流：

```ts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // 命令态下打字引擎完全让位，键全给命令行
    if (commandMode) return
    // 背单词页签下禁用全局打字引擎，避免按键触发练习
    if (tab !== 'typing') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === 'Enter' && finished) { e.preventDefault(); sound.tap(); startRound(); return }
    if (finished) return

    // 拼写模式的退格要在长度过滤之前处理
    if (mode === 'spell' && e.key === 'Backspace') {
      e.preventDefault(); sound.tap(); setTyped((t) => t.slice(0, -1)); setErrorFlash(false); return
    }

    // 只处理单字符按键，忽略 Shift / CapsLock / Tab 等功能键
    if (e.key.length !== 1) return
    e.preventDefault()
    if (lockRef.current || !current) return

    if (startedRef.current === null) { startedRef.current = Date.now(); setRunning(true) }
    ...
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [...])
```

**五层守卫**（`【实测·代码可读】`）：

| 守卫 | 行号 | 作用 |
|---|---|---|
| `commandMode` | `:403` | 命令面板打开时让位 |
| `tab !== 'typing'` | `:405` | 非打字页签禁用 |
| 修饰键 | `:406` | Ctrl/Meta/Alt 组合不拦截 |
| `e.key.length !== 1` | `:426` | 只处理单字符（跳过 Shift / CapsLock / Tab / F1…） |
| `lockRef.current` | `:428` | 换词动画期间锁输入（220ms） |

> **`lockRef.current`**（`:480, 523, 530, 537`）：整词完成后置 `true`，220ms 后重置 —— 防止换词动画期间的按键穿到下一个词。

### 3.2 两种判定策略

**策略 A —— 严格纠错（classic / timed / code）**，`App.tsx:495-550`：

```ts
/* ================= 经典 / 限时 / 代码模式：严格纠错 ================= */
const next = typed + key

// ✅ 敲对了（code 模式为原文比较，大小写敏感）
if (target.startsWith(next)) {
  ...
  // 整个单词敲完
  if (next === target) {
    lockRef.current = true
    sound.complete()
    setHistory(recordWord())
    setAnalytics((a) => recordWordDone(a, current.word, statsRef.current.errors === 0, currentWpm()))
    settleReview(current.word, wrongWords.includes(targetLower))
    window.setTimeout(() => { ... }, 220)
  }
  return
}

// ❌ 敲错了：不允许跳过，必须敲正确的下一个字母
sound.error()
setAnalytics((a) => recordKey(a, key, false))
setWrongKey(key)
setErrorFlash(true)
...
setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
```

**关键行为**（`:542` 注释原文）：**「敲错了：不允许跳过，必须敲正确的下一个字母」** —— 错误字符**不进入** `typed`，用户必须敲对才能前进。这是「严格纠错」的定义。

**策略 B —— 自由输入（spell）**，`App.tsx:438-493`：

```ts
/* ================= 拼写（默写）模式：允许自由输入 ================= */
if (mode === 'spell') {
  const next = typed + key
  const pos = typed.length
  const good = next[pos] === targetLower[pos]      // ← 逐位比较
  setTyped(next)                                    // ← 无论对错都写入
  setAnalytics((a) => recordKey(a, key, good))
  sound.correctOrError(good)
  if (!good) { ... return }
  ...
  if (next.length >= targetLower.length) {
    // 长度够但仍有错字母：不许过关，提示用退格修正
    const perfect = next === targetLower
    if (!perfect) { sound.error(); setErrorFlash(true); ...; return }   // ← 不许过关
    ...
  }
  return
}
```

**关键差异**：spell 模式**允许输入错误字符**（`setTyped(next)` 无条件执行），但**长度达到后若仍有错则不许过关**（`:470-479`），提示用户用退格修正。所以它是「允许犯错但必须改对」，与策略 A 的「不许犯错」不同。

### 3.3 大小写敏感性

`App.tsx:386-388`：

```ts
const targetLower = (current?.word ?? '').toLowerCase()
// code 模式大小写敏感：target 用原文比较；其余模式保持小写比较
const target = mode === 'code' ? (current?.word ?? '') : targetLower
```

`App.tsx:436`：

```ts
// code 模式保持按键原文（大小写敏感）；其余模式统一小写比较
const key = mode === 'code' ? e.key : e.key.toLowerCase()
```

**这是 `code` 模式与其余三种模式的根本差异**（对应 `modes.ts:15` 的 hint：「大小写敏感练真实代码行」）。

> ⚠️ **注意 `targetLower` 被用于两处「词身份」判定**：`wrongWords.includes(targetLower)`（`:485, 528, 549`）与 `nextKey`（`:577`）。即使 code 模式用原文比较，**记入错题本的仍是小写形式** —— 与 `reviewStore` 的键口径一致（见 `SRS.md` §7.1）。

---

## 4. ✅ 已有：连击与里程碑

### 4.1 combo 累加与清零

| 事件 | 对 combo 的影响 | 行号 |
|---|---|---|
| 敲对字母 | `combo: s.combo + 1`，同时 `bestCombo: Math.max(s.bestCombo, s.combo + 1)` | `:509-510`（classic）、`:461-462`（spell） |
| 敲错字母 | `combo: 0` | `:550`（classic）、`:452`（spell） |

**`combo` 是「连续敲对字符数」**，不是词数。一次错字符清零。

### 4.2 里程碑

```ts
if (MILESTONES.includes(nextCombo)) {
  sound.milestone()
  setMilestone(nextCombo)
  if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
  milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1400)
}
```

出现两处（`:464-469` classic-spell、`:514-519` classic/timed/code）。**显示 1.4 秒后自动消失。**

`MILESTONES` 常量定义在 `App.tsx` 顶部（本文件未逐字引用其值，实测为数组常量）。

### 4.3 音效映射（`src/lib/sound.ts`）

| 事件 | 音效方法 | 实现行 |
|---|---|---|
| 敲对字母 | `sound.correct()` | `sound.ts:89-102` |
| 敲错字母 | `sound.error()` | `sound.ts:105-124` |
| 整词完成 | `sound.complete()` | `sound.ts:127-145` |
| 连击里程碑 | `sound.milestone()` | `sound.ts:148-165` |
| 一轮通关 | `sound.fanfare()` | `sound.ts:174-193` |
| UI 按钮 | `sound.tap()` | `sound.ts:196-201` |

**全部为 Web Audio 实时合成，零音频文件**（`sound.ts:2-3`）。三种音色主题（`mech` / `thock` / `8bit`，`sound.ts:6`）通过不同振荡器类型实现：

| 合成方法 | 波形 | 用途 | 行号 |
|---|---|---|---|
| `click()` | 白噪声 + 带通滤波 | 清脆键声 | `:36-55` |
| `thock()` | 正弦（频率下滑至 0.62×） | 厚实底座 | `:58-70` |
| `blip()` | 方波（频率上滑至 1.5×） | 8-bit 复古 | `:73-86` |

**白噪声预生成一次**（`:24-29`）：`0.25 秒 × sampleRate` 的随机缓冲，复用于所有 click。

---

## 5. ✅ 已有：结算

`App.tsx:281-288`：

```ts
/** 结算本轮 */
const finishRound = useCallback(() => {
  setFinished(true)
  const secs = startedRef.current ? Math.round((Date.now() - startedRef.current) / 1000) : 0
  setHistory(recordSeconds(secs))
  setElapsedMs(secs * 1000)
  sound.fanfare()
}, [])
```

**结算动作**：置 `finished` / 记录本轮秒数到 `gt.streak.v1` / 播 fanfare。

### 5.1 派生指标

`App.tsx:564-578`：

```ts
const accuracy = stats.keys === 0 ? 100 : Math.round((stats.correct / stats.keys) * 100)
const minutes = elapsedMs / 60000
const wpm = minutes > 0 ? Math.max(0, Math.round(stats.correct / 5 / minutes)) : 0
const percent = queue.length ? Math.round((wordIndex / queue.length) * 100) : 0
const upcoming = queue.slice(wordIndex + 1, wordIndex + 4)
```

| 指标 | 公式 | 备注 |
|---|---|---|
| accuracy | `correct / keys × 100` | 无按键时 100% |
| **wpm** | `correct / 5 / minutes` | **标准「5 字符 = 1 词」口径** |
| percent | `wordIndex / queue.length` | 进度条 |
| upcoming | 后 3 个词 | 预览 |

**瞬时 WPM**（`App.tsx:273-279`）：

```ts
const currentWpm = useCallback(() => {
  if (!startedRef.current) return 0
  const secs = (Date.now() - startedRef.current) / 1000
  if (secs <= 0) return 0
  return Math.round(statsRef.current.correct / 5 / (secs / 60))
}, [])
```

**用 `statsRef` 而非 `stats`** —— 因为该函数在 `keydown` 回调（稳定引用）中被调用，闭包捕获的 `stats` 会过期，故用 ref 读取最新值。

`completedWords`（`:578`）：

```ts
const completedWords = finished ? Math.min(wordIndex + (countdown === 0 ? 0 : 1), queue.length) : wordIndex
```

**限时模式特殊处理**：`countdown === 0` 时**不加 1** —— 因为时间到而结束时当前词并未完成。

### 5.2 队列规模

`App.tsx:47`：

```ts
const CHAPTER_SIZE = 20
```

`App.tsx:189-202`（`buildQueue`）：

```ts
const buildQueue = useCallback(
  (source?: WordItem[]) => {
    const base = source && source.length > 0 ? source : bankWords
    const arr = [...base]
    if (shuffled) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
    }
    return arr.slice(0, CHAPTER_SIZE)
  },
  [buildQueue],
)
```

**每轮固定 20 词**（Fisher-Yates 洗牌后取前 20）。仅取前 20 意味着**大词库需要多轮才能覆盖全部**，且每轮都从同一个「前 N 个」范围内抽样（若 `shuffled` 关闭，则恒为包内前 20 个）。

---

## 6. ✅ 已有：限时模式

`App.tsx:324-335`：

```ts
/* ---------------- 限时模式倒计时 ---------------- */
useEffect(() => {
  if (mode !== 'timed' || !running || finished) return
  const total = getMode('timed').duration ?? 60
  if (countdown === null) setCountdown(total)
  const id = window.setInterval(() => setCountdown((c) => (c === null ? c : Math.max(0, c - 1))), 1000)
  return () => window.clearInterval(id)
}, [mode, running, finished, countdown])

useEffect(() => {
  if (mode === 'timed' && countdown === 0 && running && !finished) finishRound()
}, [countdown, running, finished, mode, finishRound])
```

**倒计时从第一次开始打字才启动**（依赖 `running`）—— `running` 在首个按键时置 `true`（`App.tsx:430-433`）：

```ts
if (startedRef.current === null) { startedRef.current = Date.now(); setRunning(true) }
```

**60 秒到 → 自动结算**（`:334`）。

---

## 7. ✅ 已有：辅助组件

| 组件 | 作用 | 实测存在 |
|---|---|---|
| `PracticePanel.tsx` | 打字主面板；含 `speak-btn`（手动发音按钮，`:182-185`） | ✅ |
| `ResultOverlay.tsx` | 结算浮层 | ✅ |
| `KeyMap.tsx` | 虚拟键盘提示（含 `nextKey` 高亮：`App.tsx:577`） | ✅ |
| `StatsBar.tsx` | 实时统计条 | ✅ |
| `StreakBar.tsx` | 打卡条（`DAILY_GOAL = 50`） | ✅ |
| `ProgressPanel.tsx` | 进度页 | ✅ |

### 7.1 自动发音

`App.tsx:390-398`：

```ts
// 换词时自动发音（拼写模式默认发音，或手动开启自动发音；仅打字页签生效）
// code 模式朗读代码行无意义，禁用自动发音
useEffect(() => {
  if (tab !== 'typing') return
  if (mode === 'code') return
  if (!current) return
  if (mode === 'spell' || autoSpeak) speak(current.word)
}, [current?.word, wordIndex, mode, autoSpeak, tab])
```

**规则**：spell 模式**强制发音**（因为只给中文释义，靠听来提示）；其余模式按 `autoSpeak` 开关（持久化在 `gt.autoSpeak`，`App.tsx:110`、`:311`）；**code 模式禁用**（读代码无意义）。

发音实现是 Web Speech API（`speech.ts:68-78`），支持 en-US / en-GB 口音偏好 —— 详见 `07-media/AUDIO.md`。

### 7.2 弱项专攻（基于字母错误率）

`App.tsx:223-236`：

```ts
/** 弱项专攻：优先出包含最常敲错字母的词 */
const startWeakRound = useCallback(() => {
  const letters = weakLetters(analytics, 6).map((w) => w.letter)
  if (letters.length === 0) { startRound(); return }
  const set = new Set(letters)
  const candidates = bankWords.filter((w) => w.word.toLowerCase().split('').some((c) => set.has(c)))
  const map = new Map(candidates.map((w) => [w.word, w]))
  const ranked = rankByWeakness(candidates.map((w) => w.word), letters)
  const picked = ranked.map((w) => map.get(w)).filter((w): w is WordItem => !!w)
  startRound(picked.length > 0 ? picked : undefined)
}, [analytics, bankWords, startRound])
```

**这是唯一的「自适应出题」能力**：取错误率最高的 6 个字母（`weakLetters(analytics, 6)`），筛出含这些字母的词，再按弱点排序。

**注意它基于 `analytics`（字母级错误率），不基于 `mastery`（掌握度）** —— 掌握度只用于展示（见 `MASTERY.md` §7）。

---

## 8. 📐 待建：练习能力缺口

| 缺口 | 现状 | 说明 |
|---|---|---|
| **口语练习** | ❌ 零实现 | 无录音、无语音识别、无发音评分。仅有 Web Speech **朗读**（单向 TTS） |
| **听力练习** | ❌ 零实现 | 无音频资源、无听写、无理解题 |
| **写作练习** | ❌ 零实现 | 无作文、无批改 |
| **阅读练习** | ❌ 零实现 | 无文章、无阅读理解题 |
| **例句练习** | 📐 无数据 | 全库词条无 `example` 字段（见 `04-content/CONTENT_QUALITY.md`） |
| **练习内容类型** | 仅 `word` + 代码行 | `MODES` 的 4 种模式全部作用于「一个字符串」 |
| **错误回放** | ❌ 无 | 无「重播我打错的那些键」 |
| **难度自适应** | 🟡 部分 | 仅 `startWeakRound`（字母级），无词级/包级难度梯度 |
| **练习结果持久化** | 🟡 部分 | 秒数入 `gt.streak.v1`；`RoundStats`（keys/correct/errors/combo/bestCombo）**不落盘** |

> ⚠️ **`RoundStats` 不持久化值得记录**：`App.tsx:102` 的 `stats` state 只在内存，`finishRound()`（`:281-288`）只保存 `secs`。因此「本轮准确率」「本轮最佳连击」在刷新后丢失，仅在 `ResultOverlay` 当次可见。

---

## 9. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 打字练习 | ✅ 已有（4 模式） |
| 拼写默写 | ✅ 已有（spell，且强制发音） |
| 限时挑战 | ✅ 已有（timed 60s） |
| 代码行练习 | ✅ 已有（code，大小写敏感） |
| 弱项专攻 | ✅ 已有（字母级） |
| 听/说/读/写练习 | 📐 零实现 |
| 音频资源练习 | 📐 零实现 |
| 例句练习 | 📐 无数据 |

---

## 10. 结论

- **练习是真实、完整的打字产品**：单键盘引擎、两种判定策略、大小写分支、连击里程碑、三音色主题音效、20 词分轮、实时指标、结算浮层、虚拟键盘提示、自动发音。
- **两种判定策略的区分是刻意的**：严格纠错（不许跳过）vs 自由输入（可错但必须改对）—— 前者练手速，后者练记忆。
- **`code` 模式的实现是真实的、非噱头**：`target` 与 `key` 均保留原文比较（`App.tsx:388, 436`），配套 `ts-code` / `go-code` 词库（各 50 条）。
- **能力上限明确**：4 种模式全部作用于「一个字符串」，口语/听力/写作/阅读零实现。`RoundStats` 不持久化是一处小缺口。
