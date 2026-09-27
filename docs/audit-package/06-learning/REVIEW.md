# 复习机制（REVIEW）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：错题本全链路 —— 打点、到期计算、复习轮出题、单挑入口、Review Dashboard、掌握度分布、i18n 与 testid
> 📐 **待建**：跨内容类型的复习（当前仅词级）；复习历史与审计日志
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/App.tsx`、`src/components/ReviewPanel.tsx`（213 行）、`src/lib/reviewStore.ts`、`src/i18n/{zh,en}.ts`

---

## 1. 一句话事实

**复习机制是「错题本」的完整产品化实现**：用户不需要手动「加入复习」，任何敲错的词自动进入错题本并按艾宾浩斯排期。

设计哲学藏在 i18n 文案里（`i18n/en.ts:146`）：

```
'review.empty': 'No mistakes yet — wrong words join the review plan automatically'
```

**「自动加入」是核心体验决策** —— 没有「加入收藏」按钮，错即入本。

---

## 2. ✅ 已有：错题本机制

### 2.1 自动入本（无需用户操作）

`App.tsx:259-271`：

```ts
/** 整词完成时打点错题本：本轮敲错的词记错，复习中的词敲对则推进间隔 */
const settleReview = useCallback(
  (word: string, missed: boolean) => {
    if (missed) {
      recordWrong(word)
      bumpReview()
    } else if (loadReview()[word]) {
      recordCorrect(word)
      bumpReview()
    }
  },
  [bumpReview],
)
```

**分支语义**：

| 条件 | 动作 | 说明 |
|---|---|---|
| `missed === true` | `recordWrong(word)` | **无条件**记错（无论是否已在错题本中） |
| `missed === false` **且** 词已在错题本中 | `recordCorrect(word)` | 推进间隔 |
| `missed === false` **且** 词不在错题本中 | **无操作** | 从未错过的词不会因答对而入本 |

**第二个分支的 `loadReview()[word]` 判定是必要的**：否则每个答对的词都会创建一条 `correctStreak: 1` 的空记录，错题本会膨胀成「所有练过的词」。

### 2.2 背单词页的入本路径

`Memorize.tsx:77-79`（三键打分）：

```ts
recordWrong(item.word)    // 选「不认识」
recordCorrect(item.word)  // 选「认识」
```

> ⚠️ **这是第二条入本路径**：背单词页的三键打分（known / fuzzy / unknown，见 `memorizeStore.ts:6`）中，**「不认识」也会写错题本**。因此错题本的来源不止打字练习。
> 注意 `App.tsx:178` 的注释特意提到这点：「切页签时也刷新一次：背单词页的三键打分不在本组件内打点」—— 说明两处打点的**失效通知路径不同**，前者靠 `bumpReview`，后者只能靠切页签时重新 `useMemo`。

---

## 3. ✅ 已有：到期计算

### 3.1 `dueWords()` —— 到期查询

`reviewStore.ts:151-159`：

```ts
export function dueWords(validWords?: string[], now = Date.now()): string[] {
  const store = loadReview()
  if (!validWords) {
    return Object.keys(store).filter((w) => store[w]?.nextReviewAt <= now)
  }
  const valid = new Set(validWords)
  return Object.keys(store).filter((w) => valid.has(w) && store[w]?.nextReviewAt <= now)
}
```

**到期判据 = `nextReviewAt <= now`**（时间戳比较，无时区问题）。

**`validWords` 参数实测无调用方使用** —— 四个调用点全部不传：

| 调用点 | 代码 |
|---|---|
| `App.tsx:177` | `return dueWords()` |
| `App.tsx:249` | `const due = dueWords()` |
| `ReviewPanel.tsx:42` | `return dueWords()` |
| `recommend.ts:29` | `const due = dueWords()` |

**原因**（`App.tsx:176` 注释原文）：

> 存储里的词本身即历史上练过的词（**懒词库下无法依赖全词库展开**），不再做词库过滤

**这是一个重要的设计约束**：三大词库（ielts/kaoyan/toefl）走 lazy 加载 ⇒ 首屏并不持有全部词条 ⇒ 若用 `validWords` 过滤，**未加载词库的错词会被误判为孤儿而消失**。所以宁可不过滤。权衡是「可能展示词库中已不存在的词」换「绝不丢用户数据」。

### 3.2 到期数如何刷新

`localStorage` 无响应式订阅，故用**手工版本号**：

`App.tsx:112-114`：

```ts
/** 错题本版本号：recordWrong/recordCorrect 后自增，驱动到期数等派生数据刷新 */
const [reviewVersion, setReviewVersion] = useState(0)
const bumpReview = useCallback(() => setReviewVersion((v) => v + 1), [])
```

派生数据（`App.tsx:173-186`）：

```ts
const reviewDue = useMemo(() => {
  void reviewVersion
  return dueWords()
  // 切页签时也刷新一次：背单词页的三键打分不在本组件内打点
}, [reviewVersion, tab])

const reviewTotal = useMemo(() => {
  void reviewVersion
  return Object.keys(loadReview()).length
}, [reviewVersion, tab])

const recommendation = useMemo(() => buildRecommendation(), [reviewVersion, tab])
```

**`void reviewVersion` 的写法**是刻意的：让 ESLint 看到该变量被「使用」，同时实际逻辑不依赖其值 —— 因为 `useMemo` 依赖数组里的 `reviewVersion` 已经完成了失效通知。依赖数组是 `[reviewVersion, tab]`，所以**切换页签也会重算**（覆盖背单词页的打点）。

---

## 4. ✅ 已有：Review Dashboard（`ReviewPanel.tsx`，213 行）

### 4.1 组件结构

| 区块 | 行号 | 内容 | testid |
|---|---|---|---|
| 标题 + 计数 | `:68-85` | 错题总数 / 今日到期 | `review-panel` / `review-stat-total` / `review-stat-due` |
| 到期主按钮 | `:87-100` | 「开始复习（N 个到期）」 | `review-start-btn` |
| 掌握度分布 | `:102-123` | 四级占比条形图 | `review-dist` / `review-dist-${level}` |
| 到期词列表 | `:125-209` | 每条：徽章 + 词 + 音标 + 释义 + 详情 + 单挑 | `review-item-${word}` |
| 词条详情展开 | `:168-204` | 词 + 音标 + 释义 + definition + 统计 + 练习按钮 | `review-detail` / `review-detail-phonetic` / `review-detail-practice` |

> **testid 密度高**是该组件的特点 —— 12 个 `data-testid`，说明它被 e2e 充分覆盖。

### 4.2 列表排序与截断

`ReviewPanel.tsx:50-56`：

```ts
const now = Date.now()
const entries = Object.entries(store)
  .filter(([, e]) => !!e)
  .map(([word, entry]) => ({ word, entry: entry as ReviewEntry }))
  .sort((a, b) => a.entry.nextReviewAt - b.entry.nextReviewAt)
// 有到期 → 只列到期词；无到期 → 全量按 nextReviewAt 升序前 20
const shown = due.length > 0 ? entries.filter((x) => x.entry.nextReviewAt <= now) : entries.slice(0, 20)
const total = entries.length
```

**排序**：恒按 `nextReviewAt` 升序（最急的在前）。
**截断策略**（`:54` 注释）：有到期 → 只列到期；无到期 → 前 20 条（让用户看到「接下来要复习什么」）。

### 4.3 空态

`ReviewPanel.tsx:105-107` 与 `:127-130`：

```tsx
{total === 0 ? (
  <div className={`text-xs ${theme.sub}`}>{t('review.empty')}</div>
) : ( ... )}
```

`i18n/en.ts:146`：`'No mistakes yet — wrong words join the review plan automatically'`
`i18n/zh.ts`：对应中文文案。

**空态文案明确解释了「自动加入」机制** —— 这是一个好设计：用户在空态就理解了错题本如何工作。

### 4.4 词条详情的统计来源

`ReviewPanel.tsx:136, 182-193`：

```tsx
const stat = analytics.words[word.toLowerCase()]
...
<span>{t('review.statDone')} ×{stat?.done ?? 0} · {t('review.statWrong')} ×{stat?.wrong ?? 0}</span>
<span>{t('review.wrongCountLabel')} ×{entry.wrongCount}</span>
<span>{t('review.correctStreakLabel')} ×{entry.correctStreak}</span>
<span>{t('review.nextReview')} {fmtTime(entry.nextReviewAt)}</span>
```

**注意这里有两个数据源**：

| 展示项 | 来源 | 含义 |
|---|---|---|
| done / wrong | `analytics.words[]`（`gt.analytics.v1`） | **击键级**统计 |
| wrongCount / correctStreak / nextReviewAt | `reviewStore`（`gt.review.v1`） | **SRS 条目** |

`word.toLowerCase()` 说明 analytics 的键是小写归一化的，而 reviewStore 的键保留原词形 —— **两套键口径不一致**，此处靠 `toLowerCase()` 桥接。

---

## 5. ✅ 已有：复习轮与单挑入口

### 5.1 复习轮（批量）

`App.tsx:247-257`：

```ts
/** 错题复习轮：拉出全部到期词开一轮；无到期返回 false（由入口提示） */
const startReviewRound = useCallback((): boolean => {
  const due = dueWords()
  if (due.length === 0) return false
  const map = new Map(allLoadedWords(banks).map((w) => [w.word, w]))
  // 已加载词库中找不到的（如词库 chunk 未加载）给占位词条，保证复习轮不断链
  const items = due.map((w) => map.get(w) ?? { word: w, translation: '' })
  setTab('typing')
  startRound(items)
  return true
}, [banks, startRound])
```

**两个设计点**：

1. **返回 `boolean`** —— 调用方可据此决定是否提示「无到期」（对比 `reviewStore` 其他函数返回 store）。
2. **占位词条兜底**（`:253`）：找不到词条时用 `{ word: w, translation: '' }` —— **保证复习轮不会断链**。因为 `dueWords()` 不做词库过滤（§3.1），可能包含当前未加载词库中的词。

### 5.2 单挑一个词

`App.tsx:238-245`：

```ts
/** 单挑一个错词反复练 */
const reviewSingleWord = useCallback(
  (word: string) => {
    const item = bankWords.find((w) => w.word.toLowerCase() === word.toLowerCase())
    if (item) startRound(Array.from({ length: 10 }, () => item))
  },
  [bankWords, startRound],
)
```

**关键行为**：**把同一个词重复 10 次**组成一轮（`Array.from({ length: 10 }, () => item)`）。这是「集中重复」策略，与 SRS 的「分散间隔」互补 —— 单挑用于**短时突破**。

**注意匹配用 `toLowerCase()`**（`:241`）：解决 reviewStore 键的大小写与实际词条大小写可能不一致的问题（93 条含大写字母的词条场景）。

**未命中时静默无操作**（`if (item)`）—— 若词不在当前词库的已加载词条中，点击「单挑」不会有任何反馈。

### 5.3 入口位置

| 入口 | 位置 | 行为 |
|---|---|---|
| 「开始复习（N 个到期）」 | `ReviewPanel.tsx:88-100` `review-start-btn` | → `startReviewRound` |
| 列表项的「单挑」按钮 | `ReviewPanel.tsx:157-165` `review-item-drill` | → `onReviewWord(word)` |
| 详情展开的「练习这个词」 | `ReviewPanel.tsx:195-202` `review-detail-practice` | → `onReviewWord(word)` |
| 首页推荐（Today's Practice） | `recommend.ts:29-32` | `dueCount` + `dueTopWords`（前 5） |
| 顶栏「错题复习」标签 | `i18n/*.ts` `review.label` | 显示到期数 |

---

## 6. ✅ 已有：首页推荐聚合

`src/lib/recommend.ts`（39 行）：

```ts
export interface TodayRecommendation {
  /** 今日到期错词数 */
  dueCount: number
  /** 到期词预览（最多 5 个） */
  dueTopWords: string[]
  /** 错得最多的词（最多 3 个） */
  weakWords: { word: string; wrong: number }[]
  /** 错误率最高的字母（最多 3 个） */
  weakLetters: { letter: string; rate: number }[]
  /** 今日已完成词数 */
  todayCount: number
  /** 每日目标词数 */
  goal: number
  /** 连续打卡天数 */
  streakDays: number
}

export function buildRecommendation(): TodayRecommendation {
  const analytics = loadAnalytics()
  const history = loadHistory()
  const due = dueWords()
  return {
    dueCount: due.length,
    dueTopWords: due.slice(0, 5),
    weakWords: wrongWords(analytics, 3).map((w) => ({ word: w.word, wrong: w.wrong })),
    weakLetters: weakLetters(analytics, 3).map((w) => ({ letter: w.letter, rate: w.rate })),
    todayCount: getTodayCount(history),
    goal: DAILY_GOAL,
    streakDays: getStreakDays(history),
  }
}
```

**它聚合了三个存储**：

| 字段 | 来源 |
|---|---|
| `dueCount` / `dueTopWords` | `gt.review.v1`（reviewStore） |
| `weakWords` / `weakLetters` | `gt.analytics.v1`（analytics） |
| `todayCount` / `goal` / `streakDays` | `gt.streak.v1`（streak） |

**`buildRecommendation()` 是纯读取、无副作用**（`:3` 注释：「纯读取 localStorage 派生、无副作用」）。

---

## 7. ✅ 已有：i18n 完整覆盖

`review.*` 键实测（`src/i18n/en.ts:127-146`）：

| key | en | 用途 |
|---|---|---|
| `review.label` | Review due | 顶栏标签 |
| `review.dueUnit` | due | 单位 |
| `review.noDue` | No due mistakes — keep it up! | 空态 |
| `review.statsTotal` | Total mistakes | 统计 |
| `review.statsDue` | Due today | 统计 |
| `review.start` | Start review round | 主按钮 |
| `review.panelTitle` | Review Center | 面板标题 |
| `review.masteryDist` | Mastery distribution | 分布标题 |
| `review.upcomingTitle` | Upcoming (by next review) | 列表标题 |
| `review.nextReview` | Next review | 详情 |
| `review.statDone` / `review.statWrong` | done / wrong | 详情 |
| `review.wrongCountLabel` | Wrong times | 详情 |
| `review.correctStreakLabel` | Correct streak | 详情 |
| `review.practiceWord` | Practice this word | 按钮 |
| `review.drill` | Drill | 按钮 |
| `review.detail` | Detail | 按钮 |
| `review.empty` | No mistakes yet — wrong words join the review plan automatically | 空态 |

**17 个 key，中英双语齐备。**

---

## 8. 📐 待建：三个缺口

### 8.1 复习不带内容身份

与 `SRS.md` §7.1 同一问题：reviewStore 的键是裸 `word`。复习轮出题时 `loadReview()[word]`（`App.tsx:265`）只能按词形判定，**无法区分 ielts 的 abandon 与 cet4 的 abandon**。

**实测影响**：2323 个跨包同名词的复习记录会合并为一条。

### 8.2 无复习历史

`ReviewEntry` 只保留**当前状态**（`wrongCount` / `correctStreak` / `lastWrongAt` / `nextReviewAt` / `intervalIdx`），**无事件日志**。

**后果**：
- 无法回答「这个词复习过几次」（`correctStreak` 只是**连续**答对数，中途错一次就归零）
- 无法绘制复习曲线
- 无法做「复习效果」分析（如「复习后正确率是否提升」）

> ⚠️ **`wrongCount` 是唯一的累计量**（`reviewStore.ts:111`：`(prev?.wrongCount ?? 0) + 1`）—— 它单调递增。但**没有累计答对数**，只有连续答对数。

**建议**（📐）：若需要复习效果分析，建议增加 `totalCorrect` 累计字段（与 `wrongCount` 对称），而不是引入全量事件日志（localStorage 容量受限）。

### 8.3 复习量与时间无预算控制

**当前无「今天只复习 N 个」的机制**：`startReviewRound()` 拉出**全部**到期词组成一轮（`App.tsx:249-255`）。

**实测**：无「复习上限」「每日复习目标」概念。`DAILY_GOAL = 50`（`streak.ts:9`）是「每日目标**词数**」，作用在打卡/热力图（`StreakBar.tsx:33`），**不约束复习轮规模**。

**场景**：若用户 30 天未打开应用，一次积累 2000 个到期词，点「开始复习」会一次性组 2000 词的队列。

**建议**（📐）：建议引入「每日复习上限」或分批出题（如每次最多 50 词，剩余留在队列）。注意 `CHAPTER_SIZE = 20`（`App.tsx:47`）在 `buildQueue`（`App.tsx:189-202`）中**会截断到 20 词**：

```ts
return arr.slice(0, CHAPTER_SIZE)
```

所以**实际上单轮是 20 词**（`startRound(items)` → `buildQueue(items)` → `slice(0, 20)`）。也就是说「2000 词一次出完」并不会发生 —— 但用户需要手动点 100 次「下一轮」。**这是一个「有隐式截断但无显式分批 UX」的状态。**

---

## 9. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 错题本 | ✅ 已有（自动入本） |
| 到期待复习提示 | ✅ 已有（顶栏计数 + 面板 + 首页推荐） |
| 复习轮 | ✅ 已有（批量 + 单挑） |
| 掌握度展示 | ✅ 已有（四级分布） |
| 跨内容类型复习 | 📐 未做 |
| 复习历史 / 效果分析 | 📐 未做 |
| 复习量预算 | 📐 未做（仅有 `CHAPTER_SIZE = 20` 的隐式截断） |
| 跨设备同步 | 📐 未做 |

---

## 10. 结论

- **复习机制是完整的产品化实现**：自动入本、到期计算、Dashboard、批量复习轮、单词单挑、首页推荐、17 个 i18n 键、12 个 testid。
- **两处「防丢数据」的设计值得记功**：
  1. `dueWords()` 不做词库过滤（避免 lazy 词库未加载时误删错词，`App.tsx:176`）
  2. `startReviewRound()` 用占位词条兜底（保证复习轮不断链，`App.tsx:253`）
- **一处隐式行为需注意**：`buildQueue` 的 `slice(0, CHAPTER_SIZE)`（`App.tsx:199`）把单轮限制在 20 词 —— 这既是「防止 2000 词一次出完」的保护，也是「无显式分批 UX」的根源。
- **三个缺口**：无内容身份（与 SRS 同源）、无复习历史（只有累计错次）、无复习量预算。
