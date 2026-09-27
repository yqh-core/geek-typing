# 掌握度分级（MASTERY）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：四级掌握度，从错题本条目**纯派生**，不新增 schema 字段
> 📐 **待建**：跨内容类型的统一掌握度（当前仅词级）；掌握度的持久化历史（当前是瞬时快照）
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/mastery.ts`（33 行，全文实测）、`src/lib/reviewStore.ts`、`src/components/ReviewPanel.tsx`

---

## 1. 一句话事实

**掌握度是「派生量」而不是「存储量」** —— 33 行纯函数，从 `reviewStore` 的条目实时算出四级分类，**不写任何字段**。

设计动机（`mastery.ts:1-6` 头注释原文）：

> 掌握度分级（V3-P0a）：从错题本条目推导四级掌握度，**纯派生、无存储变更**。
>
> 毕业生（走完 15 天最后一档再答对）已从 reviewStore 移除，天然属于「mastered」，
> **仅在 UI 文案体现，不加 schema 字段**。

---

## 2. ✅ 已有：四级定义

### 2.1 类型

`mastery.ts:9`：

```ts
export type MasteryLevel = 'struggling' | 'learning' | 'familiar' | 'strong'
```

**四级枚举**，与 SRS 的 5 档 `intervalIdx` 是**多对一映射**（见 §2.3）。

### 2.2 映射规则

`mastery.ts:11-23`（含原文注释）：

```ts
/**
 * 条目 → 掌握度：
 * - correctStreak === 0 → struggling（挣扎中：刚记错还没复习对过）
 * - intervalIdx <= 1   → learning（入门：1~2 天档）
 * - intervalIdx === 2  → familiar（熟悉：4 天档）
 * - intervalIdx >= 3   → strong（巩固：7/15 天档）
 */
export function masteryOf(entry: ReviewEntry): MasteryLevel {
  if (!entry || entry.correctStreak === 0) return 'struggling'
  if (entry.intervalIdx <= 1) return 'learning'
  if (entry.intervalIdx === 2) return 'familiar'
  return 'strong'
}
```

**判定优先级：`correctStreak` 优先于 `intervalIdx`。**

即：**只要有「连续答对 0 次」这个条件，无论档位多高，都判 `struggling`。**

### 2.3 完整映射表（实测推演）

| `correctStreak` | `intervalIdx` | 掌握度 | 中文（`i18n/zh.ts`） | 英文（`i18n/en.ts`） | UI 配色（`ReviewPanel.tsx:20-25`） |
|---|---|---|---|---|---|
| **0** | 0（含刚记错） | `struggling` | 挣扎中 | Struggling | `border-red-400/50 text-red-300 bg-red-400/10` |
| **0** | 1 / 2 / 3 / 4 | `struggling` | 挣扎中 | Struggling | 同上（**档位被 `correctStreak` 覆盖**） |
| ≥ 1 | 0 | `learning` | 入门 | Learning | `border-amber-400/50 text-amber-300 bg-amber-400/10` |
| ≥ 1 | 1 | `learning` | 入门 | Learning | 同上 |
| ≥ 1 | 2 | `familiar` | 熟悉 | Familiar | `border-sky-400/50 text-sky-300 bg-sky-400/10` |
| ≥ 1 | 3 | `strong` | 巩固 | Strong | `border-emerald-400/50 text-emerald-300 bg-emerald-400/10` |
| ≥ 1 | 4 | `strong` | 巩固 | Strong | 同上 |
| — | ≥ 5 | **（条目已移除）** | — | — | — |

> ⚠️ **`correctStreak === 0 && intervalIdx === 0` 是常态**：因为 `recordWrong()` 同时把这两个字段设为 0（`reviewStore.ts:112-115`）。
> 而 `correctStreak === 0 && intervalIdx > 0` **理论上不可达** —— `recordCorrect` 推进档位时必然同时把 `correctStreak + 1`（`reviewStore.ts:142`）。因此第一行的优先级设计是**防御性**的，而非实际会触发的主路径。

### 2.4 与 SRS 五档的关系

```
SRS intervalIdx:   0 ──── 1 ──── 2 ──── 3 ──── 4 ────▶ 5(毕业)
                   │      │      │      │      │
                   └──────┴──┬───┘      └──┬───┘
                   learning │             │
                            │             └──▶ strong
                            └── 2 → familiar
                   （以上均需 correctStreak ≥ 1；否则一律 struggling）
```

**5 档间隔 → 4 级掌握度**：`intervalIdx` 0/1 合并为 `learning`，3/4 合并为 `strong`。

---

## 3. ✅ 已有：分布统计

`mastery.ts:25-33`：

```ts
/** 全表掌握度分布（四级计数） */
export function masteryDistribution(store: ReviewStore): Record<MasteryLevel, number> {
  const dist: Record<MasteryLevel, number> = { struggling: 0, learning: 0, familiar: 0, strong: 0 }
  for (const entry of Object.values(store)) {
    if (!entry) continue
    dist[masteryOf(entry)] += 1
  }
  return dist
}
```

**返回零值就绪的完整四级计数**（缺值为 0，不是 `undefined`），便于直接渲染。

**注意 `if (!entry) continue`**（`:29`）—— 防御 `loadReview()` 可能返回的畸形值（对比 `ReviewPanel.tsx:51` 也有 `filter(([, e]) => !!e)` 的同类防御）。

---

## 4. ✅ 已有：UI 接线（实测）

### 4.1 分布条形图

`ReviewPanel.tsx:39`：

```tsx
const dist = useMemo(() => masteryDistribution(store), [store])
```

渲染（`ReviewPanel.tsx:103-123`）：

```tsx
<div className={`${theme.card} border ${theme.border} rounded-2xl px-5 py-4`}>
  <div className="text-sm font-semibold mb-3">{t('review.masteryDist')}</div>
  {total === 0 ? (
    <div className={`text-xs ${theme.sub}`}>{t('review.empty')}</div>
  ) : (
    <div data-testid="review-dist" className="flex h-6 rounded-lg overflow-hidden bg-black/15">
      {LEVELS.filter((l) => dist[l] > 0).map((l) => (
        <div
          key={l}
          data-testid={`review-dist-${l}`}
          style={{ width: `${(dist[l] / total) * 100}%` }}
          className={`... ${MASTERY_CLASS[l]}`}
        >
          <span className="truncate px-1">{t(`mastery.${l}`)} {dist[l]}</span>
        </div>
      ))}
    </div>
  )}
</div>
```

- **宽度按占比**：`(dist[l] / total) * 100`（`:113`）
- **只渲染计数 > 0 的级别**（`:109` 的 `.filter((l) => dist[l] > 0)`）
- **有 `data-testid`**：`review-dist` 与 `review-dist-${l}` ⇒ 可被 e2e 断言

### 4.2 单条徽章

`ReviewPanel.tsx:134`：

```tsx
const level = masteryOf(entry)
```

渲染（`:140-145`）：

```tsx
<span
  data-badge={level}
  className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${MASTERY_CLASS[level]}`}
>
  {t(`mastery.${level}`)}
</span>
```

**`data-badge={level}`** —— 直接暴露掌握度等级给 e2e 断言。

### 4.3 i18n 键（实测自 `src/i18n/`）

| key | zh | en |
|---|---|---|
| `mastery.struggling` | 挣扎中 | Struggling |
| `mastery.learning` | 入门 | Learning |
| `mastery.familiar` | 熟悉 | Familiar |
| `mastery.strong` | 巩固 | Strong |

键位于 `src/i18n/zh.ts:150-152` 区域、`src/i18n/en.ts:149-152`（实测 `grep 'mastery\.'` 命中）。

---

## 5. ✅ 已有的设计优点

| 优点 | 说明 | 依据 |
|---|---|---|
| **零 schema 变更** | 纯派生 ⇒ 未来改分级规则不需要数据迁移 | `mastery.ts:2` |
| **毕业生自动归类** | 毕业即从 store 移除 ⇒ 天然属于「已掌握」，无需额外字段 | `mastery.ts:4-5` |
| **单函数可测** | `masteryOf(entry)` 是纯函数，输入输出明确 | `mastery.ts:18-23` |
| **零值就绪分布** | 返回值恒含四个 key，调用方无需判空 | `mastery.ts:27` |
| **防御性降级** | `!entry` 与 `correctStreak === 0` 双重保护 | `mastery.ts:19` |

---

## 6. 📐 待建：掌握度的三个缺口

### 6.1 掌握度不跨内容类型

`learning-item.ts:36-37` 定义了统一的掌握度口径：

```ts
export interface LearningItem extends ContentRef {
  status: LearningStatus
  /** 掌握度 0..1（跨内容类型统一口径，SRS 排期据此计算） */
  mastery: number
  ...
}
```

**注意它是 `number`（0..1），而 `mastery.ts` 是四级枚举。** 两者是**两套不同口径**：

| 口径 | 定义位置 | 形态 | 实现状态 |
|---|---|---|---|
| 四级枚举 | `mastery.ts:9` | `'struggling' \| 'learning' \| 'familiar' \| 'strong'` | ✅ 已实现并被 UI 使用 |
| 0..1 数值 | `learning-item.ts:37` | `number` | 📐 **仅有类型，零实现** |

**实测**：`src/core/learning/` 下只有 `model/learning-item.ts` 一个文件；全仓 grep `LearningItem` 无实现层引用。

**建议**（📐）：若未来要统一，需要明确 `masteryOf()` 的四级与 `mastery: number` 的换算关系（例如 0/0.33/0.66/1），以及「毕业生」在数值口径下如何表达（当前它已从 store 移除，无法参与计算）。

### 6.2 掌握度是瞬时快照，无历史

**当前 `masteryOf()` 只能回答「现在是什么级别」，无法回答「什么时候变的」。**

这是 `recordCorrect` / `recordWrong` 的设计后果：两者都**覆盖** `ReviewEntry`，不追加历史：

```ts
const next: ReviewStore = {
  ...store,
  [word]: { ...prev, correctStreak: prev.correctStreak + 1, intervalIdx: nextIdx, nextReviewAt: ... },
}
```

**后果**：无法绘制「掌握度随时间变化」的曲线，也无法回答「这个词升到 familiar 用了几天」。

**建议**（📐）：若需要进度曲线，应在 `ReviewEntry` 增加单调计数（如 `history: {at, level}[]`，或只是 `firstSeenAt` + `levelReachedAt` 的少量字段），而不是改为全量事件日志 —— 后者会让 localStorage 数据量随复习次数线性膨胀。**当前 schema 连 `firstSeenAt` 都没有**（对比：`learning-item.ts:41-42` 定义了 `firstSeenAt?` / `lastSeenAt?`，但那是未实现的模型）。

### 6.3 掌握度不回写内容层（这是一条正确的约束）

`learning-item.ts:14-17` 的铁律：

> (b) 学习状态**禁止**写回 `content/` 数据或 WordContent。
> Content 是共享的、可重新导入的、不随用户变的数据；把 mastery/复习时间写进去，
> 一是导入新词库会污染/丢失用户进度，二是多用户场景下互相串数据。

**实测合规**：全仓无任何把 mastery 写入 `content/` 的代码。`reviewStore` 单向读取词形，`content/vocabulary/*/words.json` 中无掌握度字段（字段白名单 `normalize.mjs:46` 也不允许）。

---

## 7. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 掌握度分级 | ✅ 已有（四级） |
| 掌握度可视化 | ✅ 已有（分布条形 + 单条徽章 + 颜色编码） |
| 掌握度驱动出题 | 🟡 部分：`relevance` 排序与「弱项专攻」基于 `analytics`（字母错误率），**不直接基于掌握度**；详见 `PRACTICE.md` |
| 跨内容类型掌握度 | 📐 未做 |
| 掌握度历史曲线 | 📐 未做 |

---

## 8. 结论

- **33 行，纯派生，零 schema 变更** —— 这是本项目「克制」的一个好例子：分级规则改了就改了，不涉及任何数据迁移。
- **映射规则清晰且注释完整**：`correctStreak` 优先于 `intervalIdx`；毕业生由「不在 store 中」隐式表达。
- **UI 接线完整**：分布条形、单条徽章、颜色、i18n、`data-testid` 齐备。
- **三个缺口全部属于「扩展」而非「缺陷」**：跨类型口径（`mastery: number` 有类型无实现）、无历史曲线、无 `firstSeenAt` 字段。
- **一处口径分裂值得记录**：`mastery.ts` 的四级枚举与 `learning-item.ts:37` 的 `mastery: number` 是两套定义，目前只有前者被实现与使用。
