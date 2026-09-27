# 学习架构（LEARNING_ARCHITECTURE）

> 状态：🔄 混合（本文分节标注）
>
> `【已有】` SRS / 错题本 / 掌握度 / 打卡 / 分析 / 推荐 —— 全部为已在运行的实现
> `【待建】` ContentId 键迁移 / LearningItem 落地 / 学习图谱 —— 当前无实现
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 关联：`13-acceptance/GAP_ANALYSIS.md#A-4`、`CONTENT_CONTRACT.md` §10 L-6

---

## 1. 一个必须先说的错位【已有·实测】

项目里存在**两个"Learning 层"**，它们是不同的东西：

| | 目录 A | 目录 B |
|---|---|---|
| 路径 | `src/core/learning/model/` | `src/lib/` |
| 文件数 | 1（`learning-item.ts`，47 行） | 12（`*Store.ts` / `mastery.ts` / `streak.ts` / `analytics.ts` / `recommend.ts` …） |
| 内容 | **只有类型定义，零实现** | 全部真实运行的逻辑 |
| 主键 | 设计上是 `contentId` | 实际是**裸 `word`** |
| 是否被 UI 调用 | **否**（零 import） | 是 |

```
src/core/learning/model/learning-item.ts   ← 设计态（类型）
src/lib/reviewStore.ts                     ← 运行态（真实现）
src/lib/memorizeStore.ts                   ← 运行态
src/lib/analytics.ts                       ← 运行态
src/lib/streak.ts                          ← 运行态
src/lib/mastery.ts / recommend.ts          ← 运行态派生
```

契约 §10 L-6 用一段话钉死这个事实（P0.6.1 事实订正）：

> **Learning 层未迁移**：运行时学习记录的键是**裸 `word`，连包的信息都没有** ——
> 不是旧表述的 `bankId + word`。

---

## 2. 设计态：LearningItem【待建】

文件：`src/core/learning/model/learning-item.ts`（47 行）

```ts
// :23
export type LearningStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

// :34
export interface LearningItem extends ContentRef {
  status: LearningStatus
  mastery: number          // 0..1，跨内容类型统一口径
  attempts: number
  correct: number
  incorrect: number
  firstSeenAt?: string
  lastSeenAt?: string
  nextReviewAt?: string
  streak: number
  source?: 'typing' | 'memorize' | 'review' | 'import'
}
```

`extends ContentRef` —— 意味着设计上每条学习记录应携带
`contentId` + `contentVersion?` + `contentChecksum?`（`model/content.ts:178-189`）。

### 2.1 两条铁律（原文件 `:6-17`）

**(a) SRS 不与 Vocabulary 绑定。**

> 正确链路是 Content → LearningItem → SRS，而**不是** Vocabulary → VocabularySRS。
> 因为除了 Word，Audio / Reading / Sentence / Grammar 同样需要有学习状态。
> 一旦把 SRS 绑在 Vocabulary 上，每接入一个新内容类型就要再造一套 SRS 表。

**(b) 学习状态禁止写回 `content/` 数据或 WordContent。**

> 一是导入新词库会污染/丢失用户进度，二是多用户场景下互相串数据。

### 2.2 当前状态

| 项 | 实测 |
|---|---|
| 文件行数 | 47 |
| 导出符号 | `LearningStatus`（类型）、`LearningItem`（接口） |
| 任何实现函数 | **无** |
| 在 `src/` 内被 import 次数 | **0** |
| 是否有对应 store | **无** |

**结论：本文件是纯设计态**。文件头 `:19` 自述：「本轮只定义模型，不改 `src/core/review/*` 的现有实现」。

---

## 3. 运行态：真实的 SRS 与学习记录【已有】

### 3.1 SRS —— `src/lib/reviewStore.ts`（176 行）

localStorage key：`gt.review.v1`（`:27`）

**数据结构**（`:14-22`）：

```ts
export interface ReviewEntry {
  wrongCount: number
  correctStreak: number
  lastWrongAt: number
  nextReviewAt: number
  intervalIdx: number
}
export type ReviewStore = Record<string, ReviewEntry>   // ← key 是裸 word
```

**艾宾浩斯间隔表**（`:25`）：

```ts
export const INTERVALS_DAYS = [1, 2, 4, 7, 15]   // 5 档
```

**调度规则**（`:5-8` 原文）：

| 事件 | 行为 | 实现 |
|---|---|---|
| 敲错 | `intervalIdx` 归 0，1 天后到期 | `recordWrong()` `:104-120` |
| 复习敲对 | `intervalIdx + 1`，按下一档间隔排期 | `recordCorrect()` `:123-149` |
| 走完最后一档再敲对 | **毕业**，条目移除 | `:128-136` |

**两个工程细节**：

- **±10% 抖动**（`jitter()`，`:99-101`）：`intervalDays * DAY * (1 + (Math.random()*0.2 - 0.1))`
  —— 错峰到期，防复习雪崩（`:98` 注释）。
- **Quota 熔断**（`save()`，`:64-96`）：写 `localStorage` 遇 `QuotaExceededError` 时，
  按 `intervalIdx` 从高到低清洗（优先丢接近毕业的低风险条目），每轮清 1/4，最多 3 轮
  （`QUOTA_ROUNDS = 3`，`:52`），约清掉 58%。全失败返回 `{ok: false}` **不抛出**，
  每次清洗 `console.warn` 一条保证可观测。

**查询 API**：

| 函数 | 行 | 说明 |
|---|---|---|
| `loadReview()` | `:31` | JSON 损坏 / 隐私模式返回空表 |
| `recordWrong(word)` | `:104` | |
| `recordCorrect(word)` | `:123` | |
| `dueWords(validWords?, now)` | `:152` | 已到期且仍在有效词集合中的词 |
| `reviewStats(now)` | `:169` | `{total, due}` |

### 3.2 背单词进度 —— `src/lib/memorizeStore.ts`（72 行）

localStorage key：`gt.memorize.v1`（`:16`）

```ts
// :6
export type MemStatus = 'known' | 'fuzzy' | 'unknown'
// :8
export interface MemRecord { status: MemStatus; reviews: number; lastAt: number }
// :14
export type MemStore = Record<string, MemRecord>   // ← key 是裸 word
```

三态判定（认识 / 模糊 / 不认识），`reviews` 计数，`lastAt` 时间戳。
统计函数 `getMemorizeStats(store, bankWords)`（`:60-72`）返回
`{learnedToday, reviewedToday, masteredInBank}`。

### 3.3 击键与词级分析 —— `src/lib/analytics.ts`（116 行）

localStorage key：`gt.analytics.v1`（`:6`）

```ts
// :18
export interface Analytics {
  letters: Record<string, LetterStat>   // LetterStat = {hit, miss}
  words:   Record<string, WordStat>     // WordStat   = {done, wrong}
  totalKeys: number
  totalCorrect: number
  totalWords: number
  bestWpm: number
}
```

关键实现（`:72-74`）—— **这是第三套 key 口径**：

```ts
export function recordWordDone(a: Analytics, word: string, perfect: boolean, wpm: number): Analytics {
  const k = word.toLowerCase()
  ...
}
```

字母统计只收纯字母（`recordKey()` `:59-61`：`if (!/^[a-z]$/.test(key)) return a`），
code 模式的符号键不进字母弱项。

派生：`accuracyOf`（`:83`）、`weakLetters(a, n=8)`（`:88-97`）、
`wrongWords(a, n=10)`（`:100-106`）、`rankByWeakness(words, letters)`（`:109-116`）。

### 3.4 打卡热力图 —— `src/lib/streak.ts`（94 行）

localStorage key：`gt.streak.v1`（`:6`）

```ts
// :9
export const DAILY_GOAL = 50
// :11
export interface DayRecord { date: string /* YYYY-MM-DD */; words: number; seconds: number }
// :17
export type History = Record<string, DayRecord>   // ← key 是日期，不是词
```

派生：`getTodayCount`（`:62`）、`getStreakDays`（`:67-81`，最多回溯 400 天）、
`getRecentDays(h, days=14)`（`:84-94`，热力图数据）。

### 3.5 掌握度与推荐

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/lib/mastery.ts` | 33 | 四级掌握度派生 |
| `src/lib/recommend.ts` | 39 | 纯读取 localStorage 派生、无副作用（`:3`） |

### 3.6 学习记录的落盘全景

| key | 文件:行 | 键形态 | 记录条数（当前） |
|---|---|---|---|
| `gt.review.v1` | `src/lib/reviewStore.ts:27` | **裸 `word`（原词形）** | 运行时 |
| `gt.memorize.v1` | `src/lib/memorizeStore.ts:16` | **裸 `word`（原词形）** | 运行时 |
| `gt.analytics.v1` | `src/lib/analytics.ts:6` | `.words` 子表键 = **`word.toLowerCase()`** | 运行时 |
| `gt.streak.v1` | `src/lib/streak.ts:6` | 日期 `YYYY-MM-DD` | 运行时 |
| `gt.customBanks.v1` | `src/lib/customBanks.ts:3` | 数组，词**没有 ContentId** | 运行时 |
| `gt.bank` | `src/App.tsx:84` | 当前词库 id | 标量 |

⚠️ **`gt.customBanks.v1` 的契约漏洞**（契约 §10.1 末段原文）：

> 自定义词库的词**没有 ContentId**，包 id 形如 `custom-<base36>`。
> 若把自定义词库登记进 registry，会**违反 I-3「namespace 两两不同」**
> （`custom-<base36>` 的 namespace 规则未定义）。
> 本轮**未在契约中给出最终规则**。

生成处：`customBanks.ts:28` `id: \`custom-${Date.now().toString(36)}\``。

---

## 4. 迁移缺口：ContentId 迁移未完成【待建】

### 4.1 事实

**旧 Learning key 是裸 `word`，不是 `bankId + word`。**
契约 §10.1 明确「**全仓不存在任何 `bankId + word` 拼接**」。

由此产生的量化问题（`GAP_ANALYSIS.md#A-4`）：

| 项 | 实测数字 | 含义 |
|---|---|---|
| 跨包同名词 | **2 323** | 同一词形出现在 ≥2 个包（如 `abandon` 在 ielts / cet4） |
| 含大写字母的词条 | **93** | 多为 go-code/ts-code/frontend 的真实代码行（如 `var wg sync.WaitGroup`）；**不是**「大小写敏感碰撞组」——实测「仅大小写不同、其余相同」的词形碰撞组 = **0 组** |
| 四层 key 口径数 | **4 套各不相同** | review 原词形 / memorize 原词形 / analytics lowercase / customBanks 无 id |

### 4.2 为什么是「不可逆信息损失」

契约 §10.1 原文：

> 旧学习记录**没有记包**，因此 2323 个跨包同名词**无法确定归属**。
> 这不是实现难度问题，是**数据本身不存在** —— 迁移只能 best-effort。

三档归属规则（契约 §10.1 表格，已定义但**未实现**）：

| 情形 | 规则 |
|---|---|
| 该词形在全库**唯一命中** 1 个包 | ✅ **确定归属**，直接迁到该包 namespace 下的 ContentId |
| 命中 **≥2 个包** | ⚠️ best-effort 挂到用户当前 `gt.bank`，**并且必须在 UI 明示**（不许静默处理） |
| **0 命中**（词已从词库移除） | 保留为 **orphan** 记录，**不许静默丢弃**（丢弃 = 用户学习历史凭空消失） |

⚠️ 契约同时规定：「P1.5 开工前必须先在契约层确认这三档的 UI 表达方式，
不允许在迁移脚本里偷偷选一档。」

### 4.3 具体待办（GAP_ANALYSIS 建议，非已达成）

`GAP_ANALYSIS.md#A-4` 与 `#7` 给出的优先级：

| # | 事项 | 状态 |
|---|---|---|
| 1 | Learning 迁移 dry-run | 📐 未做 |
| 2 | Migration Audit Ledger（`resolved` / `ambiguous` / `orphan` 可查询） | 📐 未做 |
| 3 | 定义 `LearningBindingStatus`（bound / ambiguous / orphan） | 📐 未做 |
| 4 | Learning 记录带 `contentId + contentVersion + checksum` | 📐 未做 |

### 4.4 迁移的前置依赖：UI 必须先接 Query

学习记录的键要从 `word` 换成 `contentId`，前提是 UI 手上得有 `contentId`。

实测：UI 拿不到。词条经 `src/data/wordBanks.ts` 转成 V3 的 `WordItem`
（`schema.ts:83-88`，只有 `word/translation/phonetic?/definition?` 四个字段），
而 `WordHit` 才带 `id`（`content-query.ts:28`）。

→ **UI 边界泄漏（`GAP_ANALYSIS.md#A-1`）是 Learning 迁移的前置阻塞项**，
不是两个独立问题。契约 §12（P1 UI Contract）与 §10.1（L-6）是配套的。

### 4.5 另一个危险点：静默空释义 fallback

契约 §12.6 标为「🔴 最危险的一类（迁移时必须优先处理）」：

```
src/App.tsx:253
src/components/ReviewPanel.tsx:47
```

用了 `map.get(w) ?? { word: w, translation: '' }` 占位兜底 —— 取不到就**静默显示空释义**，
页面不报错、不空转，只是「悄悄少了一个词的释义」。这类缺陷在迁移期不可能靠肉眼发现。

---

## 5. Learning 四层边界（架构约束）【已有】

三层边界定义在 `model/content.ts:3-7`：

| 层 | 存放 | 主键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**` | ContentId + contentChecksum | 随版本发布 |
| **Learning** | `src/core/learning/model/`（LocalStorage / 未来 IndexedDB） | contentId（+ ContentSnapshot） | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

三条不可协商（契约 §1）：

1. Content is immutable from the user's perspective.
2. Learning never owns content.
3. User data never enters `content/`.

→ **当前状态**：Learning 层在实现上遵守了边界 3（无任何写 `content/` 的代码），
但**违反了边界 2 的键设计**（主键不是 contentId）。

### 5.1 Learning Relation

`src/core/content/relation/relation.ts:64-90` 定义了 Learning 层的关系类型：

```ts
export type LearningRelationType = 'studied' | 'collected' | 'mastered' | 'in_progress' | 'goal_of'

export interface LearningRelation {
  userId?: string
  from: string
  type: LearningRelationType
  to: string
  at?: string
}
```

**铁律**（`relation.ts:18-22`、`:81`）：

> Content Relation 与 Learning Relation **永不合并进同一张 graph**。
> 合并的后果：导入新词库时用户数据被覆盖、多用户互相串进度、内容包体积随用户数膨胀。

当前**无任何实现产出 `LearningRelation`** —— 它是模型占位。

---

## 6. 当前无实现的能力【待建】

| # | 能力 | 现状 | 依据 |
|---|---|---|---|
| 1 | **ContentId 键的学习记录** | 无。全部 key 是裸 word / lowercase / 日期 | 契约 §10 L-6 |
| 2 | **LearningItem 落地** | 只有类型，零实现，零调用 | `learning-item.ts` 全文件 |
| 3 | **学习图谱（Learning Graph）** | 需求文档核心目标；`relation.ts` 有模型但**不产出任何数据** | `GAP_ANALYSIS.md#D-1` |
| 4 | **跨内容类型统一 SRS** | 无。SRS 只服务 `word` | `learning-item.ts:8-12` 的设计意图 |
| 5 | **迁移工具与审计账本** | 无 | `GAP_ANALYSIS.md#A-4` |
| 6 | **学习记录快照比对** | 无调用。`isSameSnapshot()` / `snapshotOf()` 在 `src/` 内零引用 | `model/snapshot.ts:74`、`:97` |
| 7 | **orphan 学习记录检出** | 无。validate 第 12(g) 项明确「由 Learning 层负责，脚本不校验」 | `validate.mjs:278-279` |

### 6.1 建议方向（标注为「建议」，非现状）

> 以下为审计方向建议，**不是项目已承诺的路线**。

1. **先接线，再迁移**：UI 接 Query 层拿到 `WordHit.id`，才可能产出带 `contentId` 的新记录
   （契约 §12 已是既定方向）。
2. **双写过渡**：新记录同时写 `word` 与 `contentId`，旧记录只读不写；
   待覆盖率足够后再切换主键 —— 避免一次性迁移的不可逆风险。
3. **Audit Ledger 先于迁移**：先能**回答**「这个词属于哪个包 / 有几个歧义 / 有几个 orphan」，
   再决定怎么迁。
4. **快照字段的写入时机**：`contentVersion + checksum` 应与 `contentId` 同时写入，
   因为「用户学的是哪个快照」在 `isSameSnapshot()` 的判断里缺一不可（`snapshot.ts:91-95`）。

---

## 7. 一句话结论

> 项目的 SRS（艾宾浩斯 5 档 + ±10% 抖动 + Quota 熔断）、
> 三态背单词进度、击键分析、打卡热力图**都是真实运行且工程细节完整的实现**，
> 但它们全部以**裸 `word` 为键**，因此 2 323 个跨包同名词无法确定归属。
> `src/core/learning/` 目录下的 `LearningItem` 模型**只有类型、零实现、零调用** ——
> 它描述的是应该有的形态，而不是现在有的形态。
