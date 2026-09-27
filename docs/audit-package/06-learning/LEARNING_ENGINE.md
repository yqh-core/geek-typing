# 学习引擎（LEARNING_ENGINE）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：三套独立的本地学习机制 —— 打字练习引擎、背单词引擎、SRS 复习引擎；各自有存储、有 UI、有统计
> 📐 **待建**：统一学习引擎 —— Learning 层（`src/core/learning/`）**只有 47 行类型定义，零实现**；三套机制互不打通
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/{reviewStore,masterizeStore,memorizeStore,analytics,streak,recommend}.ts`、`src/core/learning/model/learning-item.ts`、`src/App.tsx`

---

## 1. 一句话事实

**「学习引擎」在本项目里指的是三套并列的机制，而不是一个统一引擎。**

```
        ┌──────────────────────────────────────────────────────────┐
        │            当前实际架构（三套并列，互不通信）              │
        ├──────────────────┬───────────────────┬───────────────────┤
        │  ① 打字练习引擎   │  ② 背单词引擎      │  ③ SRS 复习引擎    │
        │  (App.tsx 引擎)   │  (Memorize.tsx)   │  (reviewStore)    │
        ├──────────────────┼───────────────────┼───────────────────┤
        │ 存储              │ 存储              │ 存储              │
        │ gt.analytics.v1   │ gt.memorize.v1    │ gt.review.v1      │
        │ gt.streak.v1      │                   │                   │
        ├──────────────────┼───────────────────┼───────────────────┤
        │ 口径：字母/词      │ 口径：词（三键）  │ 口径：词（间隔档） │
        └──────────────────┴───────────────────┴───────────────────┘
                    ▲                  ▲                  ▲
                    └──────────────────┴──────────────────┘
                         共享：裸 word 作为键（无 contentId）
```

**`src/core/learning/` 目录下只有一个文件**：`model/learning-item.ts`（47 行，纯类型）。

---

## 2. ✅ 已有：三套机制的存储总览

| # | 机制 | localStorage key | 定义文件 | 行数 | 写入触发 |
|---|---|---|---|---|---|
| ① | 学习分析（字母/词统计） | `gt.analytics.v1` | `src/lib/analytics.ts` | 116 | 每次击键（节流 800ms） |
| ① | 打卡 / 热力图 | `gt.streak.v1` | `src/lib/streak.ts` | 94 | 整词完成 + 每轮结束 |
| ② | 背单词进度 | `gt.memorize.v1` | `src/lib/memorizeStore.ts` | 72 | 三键打分 |
| ③ | 错题本 / SRS | `gt.review.v1` | `src/lib/reviewStore.ts` | 176 | 整词完成 / 三键打分 |
| — | 偏好（模式/主题/音效等） | `gt.mode` / `gt.theme` / `gt.sound` / `gt.soundTheme` / `gt.shuffle` / `gt.bank` / `gt.autoSpeak` / `gt.voice` | `App.tsx:305-311`、`speech.ts:7` | — | 设置变更 |
| — | 用户自定义词库 | `gt.customBanks.v1` | `src/lib/customBanks.ts` | 92 | 导入 / 删除 |

**合计 13 个 localStorage key 承载学习状态**（本文件涉及 4 个核心 key）。

---

## 3. ✅ 已有：① 打字练习引擎

### 3.1 入口

`App.tsx:384-555` —— 单个 `window.addEventListener('keydown')` 的全局键盘引擎。详见 `PRACTICE.md`。

### 3.2 写入的学习数据

| 数据 | 目标 | 时机 | 行号 |
|---|---|---|---|
| 击键对错（字母级） | `gt.analytics.v1` | 每次单字符按键 | `:444, 503, 544` |
| 整词完成（含 WPM） | `gt.analytics.v1` | 整词敲完 | `:483, 526` |
| 打卡词数 +1 | `gt.streak.v1` | 整词敲完 | `:482, 525` |
| 本轮秒数 | `gt.streak.v1` | 结算 | `:285` |
| 错题本打点 | `gt.review.v1` | 整词敲完 | `:485, 528` |

### 3.3 analytics 的结构

`src/lib/analytics.ts:3-23`：

```ts
const KEY = 'gt.analytics.v1'

export interface LetterStat { hit: number; miss: number }
export interface WordStat { done: number; wrong: number }

export interface Analytics {
  letters: Record<string, LetterStat>     // key = 小写字母
  words: Record<string, WordStat>         // key = 小写词形
  totalKeys: number
  totalCorrect: number
  totalWords: number
  bestWpm: number
}
```

**注意**：`letters` 与 `words` 的 key **都是小写归一化**的（`analytics.ts:53`：`const key = letter.toLowerCase()`）。

**落盘节流**（`App.tsx:318-322`）：

```ts
// 分析数据落盘（节流，避免每次击键都写 localStorage）
useEffect(() => {
  const t = window.setTimeout(() => saveAnalytics(analytics), 800)
  return () => window.clearTimeout(t)
}, [analytics])
```

800ms 防抖 —— 连续输入时只在停顿后写一次。**代价**：若用户在 800ms 内关闭页面，最后一段数据丢失。

---

## 4. ✅ 已有：② 背单词引擎

### 4.1 存储

`src/lib/memorizeStore.ts:1-16`：

```ts
/**
 * 背单词进度持久化：localStorage key 'gt.memorize.v1'
 * schema: { [word]: { status, reviews, lastAt } }
 */

export type MemStatus = 'known' | 'fuzzy' | 'unknown'

export interface MemRecord {
  status: MemStatus
  reviews: number
  lastAt: number
}

export type MemStore = Record<string, MemRecord>

const KEY = 'gt.memorize.v1'
```

### 4.2 三键打分

`Memorize.tsx:72-74`（`answer` 函数）：

```ts
const answer = (status: MemStatus) => {
  setStore((s) => recordMemorize(s, item.word, status))
  ...
}
```

`Memorize.tsx:425` 定义了三个按钮：

```tsx
] as { id: MemStatus; label: string; cls: string; icon: typeof Check }[]
```

**「不认识」（unknown）与「模糊」（fuzzy）都会写错题本**（`Memorize.tsx:77-79`）：

```ts
recordWrong(item.word)      // 不认识
recordCorrect(item.word)    // 认识
```

> ⚠️ **这是一个重要的耦合**：背单词的三键打分**直接驱动 SRS**，但 `fuzzy`（模糊）的语义在 SRS 中没有对应档位 —— 它要么被当作错（若代码走 `recordWrong`），要么被当作对。**实测代码只区分了「认识」与「不认识」两条路径**，`fuzzy` 的处理需进一步确认（本文件未能从现有片段判定其归属）。

### 4.3 统计

`memorizeStore.ts:50-72`：

```ts
export interface MemStats {
  /** 今日记录过的新词数（首次作答算新学） */
  learnedToday: number
  /** 今日作答中复习过的词数（reviews > 1） */
  reviewedToday: number
  /** 给定词表内已掌握（known）的词数 */
  masteredInBank: number
}

export function getMemorizeStats(store: MemStore, bankWords: string[]): MemStats {
  const start = todayStart()
  let learnedToday = 0
  let reviewedToday = 0
  for (const w of bankWords) {
    const r = store[w]
    if (!r || r.lastAt < start) continue
    if (r.reviews > 1) reviewedToday++
    else learnedToday++
  }
  const masteredInBank = bankWords.filter((w) => store[w]?.status === 'known').length
  return { learnedToday, reviewedToday, masteredInBank }
}
```

**判定「新学 vs 复习」的依据是 `reviews > 1`** —— 即同一词被作答过多次。

**`todayStart()`**（`:43-48`）用本地时区零点（`d.setHours(0,0,0,0)`）。

**调用点**：`Memorize.tsx:96`：

```ts
() => getMemorizeStats(store, bank.words.map((w) => w.word)),
```

### 4.4 落盘无熔断

`memorizeStore.ts:35-39`：

```ts
try {
  localStorage.setItem(KEY, JSON.stringify(next))
} catch {
  /* 隐私模式下忽略 */
}
```

**静默忽略所有写入失败**（不只配额，还包括隐私模式）。对比 `reviewStore.ts:64-96` 的三轮熔断 —— **强度不一致**（同 `05-import/ERROR_HANDLING.md` §3.3 记录的问题）。

---

## 5. ✅ 已有：③ SRS 复习引擎

**完整实现见 `SRS.md`。** 此处只记其在「引擎」视角下的位置：

| 项 | 值 |
|---|---|
| 文件 | `src/lib/reviewStore.ts`（176 行） |
| key | `gt.review.v1` |
| 间隔表 | `[1, 2, 4, 7, 15]` 天（`:25`） |
| 状态转移 | `recordWrong`（归零）/ `recordCorrect`（推进 / 毕业） |
| 抗雪崩 | ±10% jitter（`:98-101`） |
| 抗溢出 | 三轮 Quota 熔断（`:64-96`） |
| 派生 | `mastery.ts`（四级掌握度）、`recommend.ts`（首页推荐） |

**SRS 是三套机制中唯一有「质量保障机制」的**（jitter + 熔断 + 容错读取）。

---

## 6. ✅ 已有：聚合层 —— `recommend.ts`

`src/lib/recommend.ts`（39 行）是**唯一跨越三套机制的代码**：

```ts
export function buildRecommendation(): TodayRecommendation {
  const analytics = loadAnalytics()      // ← 机制 ①
  const history = loadHistory()          // ← 机制 ①（streak）
  const due = dueWords()                 // ← 机制 ③
  return {
    dueCount: due.length,
    dueTopWords: due.slice(0, 5),
    weakWords: wrongWords(analytics, 3).map(...),
    weakLetters: weakLetters(analytics, 3).map(...),
    todayCount: getTodayCount(history),
    goal: DAILY_GOAL,
    streakDays: getStreakDays(history),
  }
}
```

**但它是「只读聚合」，不是「统一引擎」**：它把三份数据拼成一个展示快照，**不改变任何一套机制的写入逻辑**。

`recommend.ts:3` 注释明确了它的定位：

> 纯读取 localStorage 派生、无副作用；调用方在 `reviewVersion` 变化（及切回页签）时重建。

---

## 7. ✅ 已有：打卡与连续天数

`src/lib/streak.ts`（94 行）：

```ts
const KEY = 'gt.streak.v1'
/** 每日目标词数 */
export const DAILY_GOAL = 50

export interface DayRecord {
  date: string   // YYYY-MM-DD
  words: number
  seconds: number
}
export type History = Record<string, DayRecord>
```

### 7.1 连续天数算法

`streak.ts:66-81`：

```ts
/** 连续打卡天数（含今天；今天没练则从昨天往前数） */
export function getStreakDays(h: History): number {
  const pad = (n: number) => String(n).padStart(2, '0')
  const cursor = new Date()
  let days = 0
  for (let i = 0; i < 400; i++) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    if (h[key] && h[key].words > 0) {
      days += 1
    } else if (i > 0) {
      break
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}
```

**三个细节**：

| 细节 | 说明 | 行号 |
|---|---|---|
| 上限 400 天 | 防止无限循环 | `:71` |
| `else if (i > 0) break` | **今天没练不算断**（`i === 0` 时跳过今天继续往前数） | `:75-76` |
| 用本地日期分量 | 不用 UTC，避免时区偏移 | `:72` |

**这是「宽限今天」的设计**：用户上午打开应用时连续天数不应显示为 0。

### 7.2 热力图

`streak.ts:83-94`：

```ts
/** 最近 14 天的数据，用于热力图 */
export function getRecentDays(h: History, days = 14): DayRecord[] { ... }
```

**14 天窗口**，缺失日期以 `{ date: key, words: 0, seconds: 0 }` 填充（`:91`）。

**UI**：`StreakBar.tsx:15-17` 定义了热力等级：

```ts
if (words < DAILY_GOAL * 0.25) return 1
if (words < DAILY_GOAL * 0.5) return 2
if (words < DAILY_GOAL) return 3
```

即按 `DAILY_GOAL = 50` 的 25% / 50% / 100% 分四档。

`StreakBar.tsx:47` 展示了诚实原则：

```tsx
<span className={`text-[11px] ${theme.sub}`}>{t('streak.localOnly')}</span>
```

**「仅本地存储」的提示可见** —— 不假装有云同步。

---

## 8. 📐 待建：统一学习引擎（`src/core/learning/`）

### 8.1 现状：47 行类型，零实现

**实测目录内容**（`find src/core/learning -name "*.ts"`）：

```
src/core/learning/model/learning-item.ts      47 行   唯一文件
```

`learning-item.ts` 全文只有类型定义，无任何函数、存储、读写。它定义了：

```ts
export type LearningStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

export interface LearningItem extends ContentRef {
  status: LearningStatus
  /** 掌握度 0..1（跨内容类型统一口径，SRS 排期据此计算） */
  mastery: number
  attempts: number
  correct: number
  incorrect: number
  firstSeenAt?: string
  lastSeenAt?: string
  nextReviewAt?: string
  streak: number
  /** 产生这条学习记录的入口，便于按来源统计/回溯 */
  source?: 'typing' | 'memorize' | 'review' | 'import'
}
```

**`source` 字段枚举了四个入口**：`typing` / `memorize` / `review` / `import` —— 这正好对应现有三套机制 + 导入。**说明设计者已意识到多入口问题，但尚未统一。**

### 8.2 契约要求（`learning-item.ts:1-20` 原文）

> `src/core/learning/` 是文档最终架构里的 Learning 层：它以 contentId 为键，
> 与 Content 层（不随用户变）、User 层（profile/preferences）三分。
>
> ⚠️ 两条铁律：
>
> (a) SRS **不与 Vocabulary 绑定**。
>     正确链路是 Content → LearningItem → SRS，而**不是** Vocabulary → VocabularySRS。
>     因为除了 Word，Audio / Reading / Sentence / Grammar 同样需要有学习状态
>     （练过哪段听力、某篇文章读到几遍、某个语法点掌握度）。一旦把 SRS 绑在
>     Vocabulary 上，每接入一个新内容类型就要再造一套 SRS 表。
>
> (b) 学习状态**禁止**写回 `content/` 数据或 WordContent。

**铁律 (b) 实测合规**：全仓无任何把学习状态写入 `content/` 的代码（`04-content/CONTENT_SCHEMA.md` 亦确认字段白名单不含学习字段）。

### 8.3 三套机制 vs 统一引擎的差距

| 契约要求 | 现状 | 差距 |
|---|---|---|
| 以 `contentId` 为键 | 全部用裸 `word` | 🔴 2323 个跨包同词无法归属 |
| `status`（4 态） | 三套各有一套状态（`MemStatus` 3 态 / `intervalIdx` 5 档 / 无状态） | 无统一状态机 |
| `mastery: number`（0..1） | `mastery.ts` 用四级枚举 | 口径分裂（见 `MASTERY.md` §6.1） |
| `attempts` / `correct` / `incorrect` | 分散在 `analytics.words[].done/wrong` | 未统一 |
| `firstSeenAt` / `lastSeenAt` | **无任何字段**（`reviewStore` 只有 `lastWrongAt`） | 缺失 |
| `nextReviewAt` | ✅ `ReviewEntry.nextReviewAt` | 已有（但仅词级） |
| `streak`（连续对） | ✅ `ReviewEntry.correctStreak` | 已有 |
| `source`（入口溯源） | **无** | 缺失 |
| 版本快照（`contentVersion` + `checksum`） | **无** | 缺失（契约要求三元组，见 `SRS.md` §7.1） |

### 8.4 建议的实现路径（📐）

> 以下全部为**建议**，非实测事实。参考 `GAP_ANALYSIS.md:181-189` 与 `content/README.md:621`。

| 步骤 | 内容 | 依赖 |
|---|---|---|
| S1 | **Learning key 迁移**：裸 `word` → `contentId`（+ version + checksum），按契约三档规则（唯一命中 / 多包命中 / orphan） | 需 Migration Audit Ledger |
| S2 | **迁移 dry-run**：先在只读模式下输出分类结果，供人工复核后再落盘 | S1 |
| S3 | **统一状态机**：把 `MemStatus` / `intervalIdx` / 三套状态收敛到 `LearningStatus` 四态 | S1 |
| S4 | **`mastery` 口径统一**：明确四级枚举与 0..1 数值的换算 | S3 |
| S5 | **入口溯源**：写入时记录 `source`，使「这个词是怎么学的」可回答 | S3 |
| S6 | 跨内容类型复用：Audio / Reading 接入时直接复用 SRS，不再造新表 | S1-S5 |

**不建议**的做法：为统一而新建 Repository / Service / Framework 层 —— `content/README.md:625-627` 的 P1 硬原则明确写了：

> **P1 的硬原则：不再造新的抽象 / 目录 / Framework / Repository / Service。**
> Catalog、Index、Query、Scope、Sort 都已经就位，P1 的工作是**接线**。

---

## 9. ✅ 已有：完整数据流图

```
        用户按键 / 三键打分
                │
    ┌───────────┼───────────────┬─────────────────┐
    ▼           ▼               ▼                 ▼
analytics   streak         memorize          reviewStore
(字母/词)   (打卡/热力)     (三键进度)        (SRS 间隔)
gt.analytics gt.streak     gt.memorize       gt.review
    │           │               │                 │
    │           │               └────────┬────────┘
    │           │                        │
    └───────────┴────────┬───────────────┘
                         ▼
                  buildRecommendation()
                  （只读聚合，无副作用）
                         │
                         ▼
              Today's Practice 首页推荐
              （dueCount / weakWords / weakLetters / streakDays）
```

**关键事实**：四套存储**互相不读**（除 `recommend.ts` 的只读聚合）。`memorize` 与 `review` 之间只有**单向写入**（三键打分触发 SRS 打点），无反向读取。

---

## 10. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 学习引擎 | 🟡 有三套并列机制，无统一引擎 |
| 学习状态绑定内容身份 | 📐 未做（键为裸 word） |
| 跨内容类型学习状态 | 📐 未做（`LearningItem` 有类型无实现） |
| 学习状态不回写内容层 | ✅ 合规 |
| 学习统计 | ✅ 已有（analytics + streak + memorize + review 四份） |
| 统一推荐 | ✅ 已有（`recommend.ts` 只读聚合） |
| 跨设备同步 | 📐 未做（`streak.ts:3` 提到「后续想同步可以平滑迁移到 Cloudflare D1」） |

---

## 11. 结论

- **「学习引擎」目前是三套并列机制**：打字练习（字母/词统计 + 打卡）、背单词（三键进度）、SRS 复习（间隔排期）。各自完整、各自可用，但**只有 `recommend.ts` 一处只读聚合**。
- **`src/core/learning/` 是实现空白**：47 行纯类型，零函数。契约已明确要求「SRS 不与 Vocabulary 绑定」，但 `reviewStore` 的键仍是裸 `word`。
- **三处质量差异值得记录**：
  1. `reviewStore` 有 jitter + 三轮熔断；`memorizeStore` / `streak` / `customBanks` 无（或静默）
  2. `analytics` 落盘有 800ms 节流，代价是最后一段数据可能丢失
  3. `RoundStats` 完全不持久化
- **最有价值的下一步**（📐，建议）见 §8.4：Learning key 迁移 → dry-run → 统一状态机 → 已知口径 → 入口溯源。**不建议**为此新建抽象层。
