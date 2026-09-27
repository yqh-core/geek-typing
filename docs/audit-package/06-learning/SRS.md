# 间隔重复系统（SRS）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：完整的艾宾浩斯 SRS —— 5 档间隔表、错/对推进规则、毕业移除、±10% 抖动、Quota 熔断、到期查询与统计
> 📐 **待建**：ContentId 维度的 SRS（当前键为裸 `word`）；非词汇内容类型（audio/reading/sentence）的 SRS
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/reviewStore.ts`（176 行，全文实测）、`src/lib/mastery.ts`、`content/README.md:621`

---

## 1. 一句话事实

**SRS 是本项目学习层唯一完整实现的机制，且实现质量高于同类项目常见水平** —— 它有抖动（抗雪崩）、有熔断（抗溢出）、有毕业机制、有可观测的返回结构。

**但它的键是裸 `word`（`reviewStore.ts:22`），不是 `contentId`** —— 这导致 2323 个跨包同名词无法区分归属。

**实测全部为「代码可读」级证据**（SRS 无单元测试、无 fixture，见 `09-testing/TEST_MATRIX.md`）。

---

## 2. ✅ 已有：数据模型

### 2.1 存储位置与 schema

`reviewStore.ts:1-3` 头注释原文：

```
词级错题本 + 艾宾浩斯复习调度：localStorage key 'gt.review.v1'
schema: { [word]: { wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx } }
```

`reviewStore.ts:14-27`：

```ts
export interface ReviewEntry {
  wrongCount: number          // 累计记错次数
  correctStreak: number       // 连续答对次数
  lastWrongAt: number         // 最后一次记错的时刻（ms）
  nextReviewAt: number        // 下次到期时刻（ms）
  intervalIdx: number         // 当前处于间隔表的第几档（0-based）
}

export type ReviewStore = Record<string, ReviewEntry>   // ← key = 裸 word

/** 艾宾浩斯间隔（天） */
export const INTERVALS_DAYS = [1, 2, 4, 7, 15]

const KEY = 'gt.review.v1'
const DAY = 24 * 60 * 60 * 1000
```

### 2.2 五档间隔表

`reviewStore.ts:25`：

```ts
export const INTERVALS_DAYS = [1, 2, 4, 7, 15]   // 天
```

| `intervalIdx` | 间隔 | 掌握度映射（`mastery.ts:19-22`） |
|---|---|---|
| 0 | 1 天 | `learning`（`intervalIdx <= 1`） |
| 1 | 2 天 | `learning` |
| 2 | 4 天 | `familiar` |
| 3 | 7 天 | `strong` |
| 4 | 15 天 | `strong` |
| ≥ 5 | — | **毕业移除**（见 §4.3） |

五档之外没有更长的间隔 —— 走完 15 天档再答对即毕业。详见 `MASTERY.md`。

---

## 3. ✅ 已有：两种状态转移

### 3.1 `recordWrong` —— 记错（归零）

`reviewStore.ts:103-120`：

```ts
/** 记一次错：wrongCount+1、correctStreak 清零、间隔归 0，明天（±10% 抖动）到期 */
export function recordWrong(word: string): ReviewStore {
  const store = loadReview()
  const prev = store[word]
  const now = Date.now()
  const next: ReviewStore = {
    ...store,
    [word]: {
      wrongCount: (prev?.wrongCount ?? 0) + 1,
      correctStreak: 0,
      lastWrongAt: now,
      nextReviewAt: now + jitter(INTERVALS_DAYS[0]),   // ← 回到第 0 档，1 天后
      intervalIdx: 0,                                   // ← 归零
    },
  }
  save(next)
  return next
}
```

**关键语义**（`:5-6` 头注释）：

> - 敲错 → intervalIdx 归 0，1 天后到期

即：**无论此前推进到第几档，一次记错就打回第 0 档**。这是「错了就重来」的严格策略，比 SM-2 类算法（降级而非归零）更激进。

### 3.2 `recordCorrect` —— 记对（推进 / 毕业）

`reviewStore.ts:122-149`：

```ts
/** 记一次对（仅对复习中的词生效）：间隔推进一档；走完间隔表则毕业移除 */
export function recordCorrect(word: string): ReviewStore {
  const store = loadReview()
  const prev = store[word]
  if (!prev) return store                       // ← 不在错题本中的词，记对无副作用
  const nextIdx = prev.intervalIdx + 1
  if (nextIdx >= INTERVALS_DAYS.length) {
    // 毕业：从错题本移除
    const rest: ReviewStore = {}
    for (const [k, v] of Object.entries(store)) {
      if (k !== word) rest[k] = v
    }
    save(rest)
    return rest
  }
  const now = Date.now()
  const next: ReviewStore = {
    ...store,
    [word]: {
      ...prev,
      correctStreak: prev.correctStreak + 1,
      intervalIdx: nextIdx,
      nextReviewAt: now + jitter(INTERVALS_DAYS[nextIdx]),
    },
  }
  save(next)
  return next
}
```

**两个关键语义**：

1. **只对「复习中的词」生效**（`if (!prev) return store`，`:126`）—— 从未记错的词不会因为答对而进入错题本。这与 `App.tsx:265` 的调用条件一致：
   ```ts
   } else if (loadReview()[word]) { recordCorrect(word); bumpReview() }
   ```
2. **毕业移除**（`:128-136`）：走完 15 天档（`intervalIdx` 达到 5）再答对 → 直接从 store 删除条目。

### 3.3 状态转移图

```
                    recordWrong（任何档位）
        ┌───────────────────────────────────────────────┐
        │                                               │
        ▼                                               │
   [idx 0 · 1天] ──对──▶ [idx 1 · 2天] ──对──▶ [idx 2 · 4天] ──对──▶ [idx 3 · 7天]
        │                    │                     │                    │
        └──错(归0)────────────┴──错(归0)─────────────┴──错(归0)──────────┘
                                                    │
                                                    ▼
                                             [idx 4 · 15天] ──对──▶ 毕业（条目移除）
                                                    │
                                                    └──错(归0)──▶ 回到 [idx 0]
```

**注意**：`recordWrong` 在**任意档位**都归零，图中「错(归0)」的箭头从各档回到 idx 0。

---

## 4. ✅ 已有：四个工程细节

### 4.1 ±10% 抖动（抗复习雪崩）

`reviewStore.ts:98-101`：

```ts
/** ±10% 抖动：错峰到期，避免同批词同刻集中复习（雪崩） */
function jitter(intervalDays: number): number {
  return intervalDays * DAY * (1 + (Math.random() * 0.2 - 0.1))
}
```

**为什么必要**（`:10-11` 头注释）：

> 排期加 ±10% 随机抖动（jitter）：同批词不会同刻到期，抗复习雪崩

**场景推演**：用户一次导入 100 个词并全部记错 ⇒ 若无抖动，100 条条目的 `nextReviewAt` **完全相同** ⇒ 第二天 100 个词同时到期；第三天又是同一批同时到期 ⇒ 复习量呈脉冲式爆发，而不是平滑分布。±10% 抖动把到期时刻打散到 ±0.1 天（1 天档约 ±2.4 小时）的窗口内。

**实测数值范围**：

| 档 | 基准 | 抖动后范围 |
|---|---|---|
| 1 天 | 86 400 000 ms | 77 760 000 ~ 95 040 000 ms（0.9 ~ 1.1 天） |
| 15 天 | 1 296 000 000 ms | 1 166 400 000 ~ 1 425 600 000 ms（13.5 ~ 16.5 天） |

### 4.2 QuotaExceeded 熔断（抗存储溢出）

`reviewStore.ts:51-96`。参数（`:51-52`）：

```ts
/** Quota 熔断参数：每轮清 1/4、最多 3 轮（约清掉 58% 仍有空间不足则放弃） */
const QUOTA_ROUNDS = 3
```

错误识别（`:54-57`）：

```ts
function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}
```

**注意**：同时识别标准 `QuotaExceededError` 与 Firefox 的 `NS_ERROR_DOM_QUOTA_REACHED`。

熔断主体（`:64-96`）：

```ts
function save(store: ReviewStore): SaveResult {
  const json = JSON.stringify(store)
  try {
    localStorage.setItem(KEY, json)
    return { ok: true, evicted: 0 }
  } catch (e) {
    if (!isQuotaError(e)) return { ok: false, evicted: 0 }   // ← 非配额错误不熔断，直接放弃
  }

  // 熔断：副本上做清洗，避免污染调用方持有的 state
  const working: ReviewStore = { ...store }
  let evicted = 0
  for (let round = 1; round <= QUOTA_ROUNDS; round++) {
    const entries = Object.entries(working)
    // 清洗数量：至少 1 条；排除本轮正在写入的词条以外按 intervalIdx 降序丢
    const victims = entries
      .sort((a, b) => (b[1]?.intervalIdx ?? 0) - (a[1]?.intervalIdx ?? 0))
      .slice(0, Math.max(1, Math.ceil(entries.length / 4)))
    for (const [k] of victims) delete working[k]
    evicted += victims.length
    console.warn(
      `[reviewStore] localStorage 配额不足，熔断清洗第 ${round} 轮：清理 ${victims.length} 条接近毕业的错题（累计 ${evicted}）`,
    )
    try {
      localStorage.setItem(KEY, JSON.stringify(working))
      return { ok: true, evicted }
    } catch (e) {
      if (!isQuotaError(e)) return { ok: false, evicted }
    }
  }
  console.warn(`[reviewStore] 熔断清洗 ${QUOTA_ROUNDS} 轮后仍写入失败，本轮变更仅保留在内存`)
  return { ok: false, evicted }
}
```

**四个设计要点**：

| 要点 | 说明 | 行号 |
|---|---|---|
| 清洗策略 = **按 `intervalIdx` 降序优先丢** | 丢「接近毕业的低风险条目」，保留最需要复习的（低档位）条目 | `:80` |
| 每轮清 **`ceil(n/4)`**，至少 1 条 | 3 轮累计约清 58%（`1 - 0.75³ ≈ 0.578`） | `:81`、`:51` |
| 副本上清洗 | `{ ...store }` —— **不污染调用方持有的 state** | `:74` |
| 每次都 `console.warn` | 保证可观测，不静默丢数据 | `:84-86`、`:94` |

**返回结构**（`:43-49`）：

```ts
export interface SaveResult {
  ok: boolean
  /** Quota 熔断时被清洗掉的条目数（为可观测性服务） */
  evicted: number
}
```

> ⚠️ **但 `recordWrong` / `recordCorrect` 不返回 `SaveResult`**（`:118`、`:134`、`:147` 均为裸 `save(next)`）—— `evicted` 数字被丢弃，UI 层拿不到。这是「为可观测性服务」的设计与实际接线之间的一处落差。

### 4.3 毕业机制

`reviewStore.ts:7-8` 头注释：

> - 走完最后一档（15 天）再敲对 → 毕业，条目移除

实现见 §3.2 的 `:128-136`。**注意这是「移除」而不是「标记为已掌握」**：

- 错题本条目数**会下降**（`reviewStats().total` 反映的是「仍在错题本中的词数」，不是历史错词总数）；
- 毕业生在 UI 上表现为「掌握度高」的文案，**不加 schema 字段**（`mastery.ts:4-5` 注释）：
  > 毕业生（走完 15 天最后一档再答对）已从 reviewStore 移除，天然属于「mastered」，仅在 UI 文案体现，不加 schema 字段。

**这意味着**：一旦毕业，就**没有任何记录**能证明它曾经是错题。若未来需要「历史错词总数」统计，当前 schema 无法提供。

### 4.4 内存态兜底

`reviewStore.ts:94-95`：熔断 3 轮仍失败 → `console.warn` + `return { ok: false }`，**变更仅保留在内存**（`:44` 注释：「数据只留在内存，下次操作会重试」）。

**调用方从不检查这个返回值** —— 所以实际行为是：变更在本次会话内有效（因为 `recordWrong` 返回的 `next` 被 React state 持有），刷新页面后丢失。

---

## 5. ✅ 已有：读取 API

### 5.1 `loadReview()` —— 容错读取

`reviewStore.ts:30-41`：

```ts
/** 读取错题表（JSON 损坏 / 隐私模式返回空表） */
export function loadReview(): ReviewStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}   // ← 形状校验
    return parsed as ReviewStore
  } catch {
    return {}
  }
}
```

三层防御：无值时 `{}` / JSON 损坏时 `{}` / **形状非 object（如被写成数组）时 `{}`**。

### 5.2 `dueWords()` —— 到期查询

`reviewStore.ts:151-159`：

```ts
/** 已到期、且仍存在于有效词集合中的词；validWords 缺省时不过滤（存储里的词本身即历史上练过的词） */
export function dueWords(validWords?: string[], now = Date.now()): string[] {
  const store = loadReview()
  if (!validWords) {
    return Object.keys(store).filter((w) => store[w]?.nextReviewAt <= now)
  }
  const valid = new Set(validWords)
  return Object.keys(store).filter((w) => valid.has(w) && store[w]?.nextReviewAt <= now)
}
```

**两个参数**：`validWords`（可选词集过滤）与 `now`（可注入时间，便于测试）。

**实测调用方式**：全部调用点**都不传 `validWords`**：

| 调用点 | 代码 | 说明 |
|---|---|---|
| `App.tsx:177` | `return dueWords()` | 注释（`App.tsx:176`）：**「存储里的词本身即历史上练过的词（懒词库下无法依赖全词库展开），不再做词库过滤」** |
| `App.tsx:249` | `const due = dueWords()` | 复习轮入口 |
| `ReviewPanel.tsx:42` | `return dueWords()` | 面板展示 |
| `recommend.ts:29` | `const due = dueWords()` | 首页推荐 |

**为什么不过滤**：三大词库（ielts/kaoyan/toefl）走 lazy 加载 —— 首屏并不持有全部词条，若按 `validWords` 过滤会把未加载词库的错词**误判为孤儿**而排除。所以设计上选择了「不过滤」。这是一个**用「可能过时」换「不丢数据」**的权衡（`reviewStore.ts:151` 注释已说明理由）。

### 5.3 `reviewStats()` —— 统计

`reviewStore.ts:161-176`：

```ts
export interface ReviewStats {
  /** 错题总数 */
  total: number
  /** 今日到期数 */
  due: number
}

/** 统计：错题总数 / 今日到期数 */
export function reviewStats(now = Date.now()): ReviewStats {
  const store = loadReview()
  let due = 0
  for (const e of Object.values(store)) {
    if (e?.nextReviewAt <= now) due++
  }
  return { total: Object.keys(store).length, due }
}
```

> ⚠️ **`reviewStats()` 在 `src/` 中零调用点**（实测 grep 无命中）。UI 实际用的是**自己算**的版本：
> - `App.tsx:180-183`：`Object.keys(loadReview()).length` 得 total
> - `ReviewPanel.tsx:39-43`：`masteryDistribution(store)` + `dueWords()`
>
> 这是「工具函数存在但未被采用」的一处实例，与 `GAP_ANALYSIS.md` 记录的 UI 绕过分层问题（A-1）同源。

---

## 6. ✅ 已有：谁在读写在什么时候

### 6.1 写入口（`recordWrong` / `recordCorrect`）

| 调用点 | 行号 | 触发条件 |
|---|---|---|
| `App.tsx:263` | `recordWrong(word)` | 打字练习整词完成且有错 |
| `App.tsx:266` | `recordCorrect(word)` | 整词完成且无误 **且** `loadReview()[word]` 存在 |
| `Memorize.tsx:77` | `recordWrong(item.word)` | 背单词三键打分选「不认识」 |
| `Memorize.tsx:79` | `recordCorrect(item.word)` | 背单词选「认识」 |

`App.tsx:259-271`（打点函数）：

```ts
/** 整词完成时打点错题本：本轮敲错的词记错，复习中的词敲对则推进间隔 */
const settleReview = useCallback(
  (word: string, missed: boolean) => {
    if (missed) {
      recordWrong(word)
      bumpReview()
    } else if (loadReview()[word]) {      // ← 只在已在错题本中时才推进
      recordCorrect(word)
      bumpReview()
    }
  },
  [bumpReview],
)
```

`bumpReview()`（`App.tsx:112-114`）自增 `reviewVersion`，驱动 `useMemo` 派生数据刷新：

```ts
/** 错题本版本号：recordWrong/recordCorrect 后自增，驱动到期数等派生数据刷新 */
const [reviewVersion, setReviewVersion] = useState(0)
const bumpReview = useCallback(() => setReviewVersion((v) => v + 1), [])
```

**这是一个手工的失效通知机制** —— 因为 `localStorage` 没有响应式订阅，只能靠版本号 + `useMemo` 依赖数组（`App.tsx:174-183`、`ReviewPanel.tsx:35-43`）。

### 6.2 读入口

| 读点 | 行号 | 用途 |
|---|---|---|
| `App.tsx:177` | `dueWords()` | 顶栏到期数 |
| `App.tsx:182` | `Object.keys(loadReview()).length` | 顶栏错题总数 |
| `App.tsx:249` | `dueWords()` | 复习轮出题队列 |
| `App.tsx:265` | `loadReview()[word]` | 判定是否推进 |
| `Memorize.tsx:15` | import `loadReview, recordCorrect, recordWrong` | 背单词打点 |
| `ReviewPanel.tsx:37` | `loadReview()` | 面板全量 |
| `ReviewPanel.tsx:42` | `dueWords()` | 到期列表 |
| `recommend.ts:29` | `dueWords()` | 首页推荐 |

---

## 7. 📐 待建：SRS 的两个已知缺口

### 7.1 键是裸 `word`，不是 `contentId`

**这是本项目最重要的已知架构债之一**（`GAP_ANALYSIS.md:69-80` 记为 A-4）。

`reviewStore.ts:22`：

```ts
export type ReviewStore = Record<string, ReviewEntry>   // ← key 是裸 word
```

**为什么是问题**：

| 事实 | 数值 | 来源 |
|---|---|---|
| 全库跨包同名词 | **2323** | `GAP_ANALYSIS.md:72` |
| 含大写字母的词条 | **93** | `GAP_ANALYSIS.md:73` |

用户「以前学过 abandon」在 ielts 与 cet4 中都存在时，裸 `word` 键**无法回答**「学的是哪个包的 abandon」。

**契约已定义正确形态**（`content/README.md:169-180`）：

```jsonc
{
  "contentId": "content:word:ecdict-ielts:abandon",
  "contentVersion": 2,
  "checksum": "sha256:bc6c8ee5…",
  "state": {}
}
```

**职责划分**（`content/README.md:180`）：

> ContentId = 是哪个实体；`contentVersion` + `checksum` = 学的是该实体的哪个快照；Learning = 学到什么程度。

**迁移状态**：契约定义了**三态迁移**（唯一命中 / 多包命中 / orphan），但**迁移本身未实现**（`GAP_ANALYSIS.md:78`）。

**建议**（📐，来自 `GAP_ANALYSIS.md:80`，非实测）：
1. 迁移 dry-run；
2. Migration Audit Ledger（`resolved/ambiguous/orphan` 可查询）；
3. Learning 记录带 `contentId + contentVersion + checksum`。

### 7.2 SRS 与内容类型的耦合

**SRS 目前只能服务「单词」。** 但 `learning-item.ts:6-14` 的契约明确要求：

> (a) SRS **不与 Vocabulary 绑定**。
> 正确链路是 Content → LearningItem → SRS，而**不是** Vocabulary → VocabularySRS。
> 因为除了 Word，Audio / Reading / Sentence / Grammar 同样需要有学习状态（练过哪段听力、某篇文章读到几遍、某个语法点掌握度）。一旦把 SRS 绑在 Vocabulary 上，每接入一个新内容类型就要再造一套 SRS 表。

**当前状态**：

| 项 | 状态 |
|---|---|
| `LearningItem` 类型 | ✅ 已定义（`src/core/learning/model/learning-item.ts`，47 行） |
| `LearningItem` 实现 | 📐 **零实现** —— 纯类型文件，无存储、无读写函数 |
| SRS 与 Vocabulary 解耦 | 📐 未做 —— `reviewStore` 的键就是词形 |

**实测**：`src/core/learning/` 目录下**只有 `model/learning-item.ts` 一个文件**，无 store、无 index。

**建议**（📐）：SRS 泛化的前置条件是 7.1 的 ContentId 迁移；两者建议合并为同一批工作。

---

## 8. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 间隔重复 | ✅ 已有（5 档艾宾浩斯） |
| 抗雪崩 | ✅ 已有（±10% 抖动，`reviewStore.ts:98-101`） |
| 抗存储溢出 | ✅ 已有（三轮熔断，`reviewStore.ts:64-96`） |
| 毕业/掌握判定 | ✅ 已有（走完 15 天移除） |
| 学习状态绑定内容身份 | 📐 未做（键为裸 word） |
| 非词汇内容类型的 SRS | 📐 未做（模型有、实现无） |
| 跨设备同步 | 📐 未做（localStorage 单机；`streak.ts:3` 提到「后续想同步可以平滑迁移到 Cloudflare D1」） |

---

## 9. 结论

- **SRS 是真实、完整、有工程深度的实现**：五档间隔、错归零/对推进、毕业移除、±10% 抖动、三轮 Quota 熔断、容错读取、可注入时间的查询 API。
- **抖动与熔断是两个超出「最小可用」的加分项**：前者解决批量导入后的复习脉冲，后者解决 localStorage 溢出时的数据丢失。多数同类项目两者皆无。
- **两个真实缺口**：键为裸 `word`（2323 个跨包同词无法归属）、SRS 未与 Vocabulary 解耦（`LearningItem` 有类型无实现）。
- **一处小落差**：`SaveResult.evicted` 为可观测性设计，但 `recordWrong`/`recordCorrect` 丢弃了它；`reviewStats()` 有实现但零调用。
