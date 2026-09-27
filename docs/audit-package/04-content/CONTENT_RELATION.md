# 内容关系（CONTENT_RELATION）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：关系模型 —— `RelationType` / `ContentRelation` / `LearningRelation` 类型定义完整
> 📐 **待建**：关系数据 —— **零产出，无任何 `relations.json`**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 原文依据：`src/core/content/relation/relation.ts`（90 行）、契约 §8.2

---

## 1. 一句话事实

模型 90 行，数据 0 条。

```
src/core/content/relation/relation.ts     90 行   ✅ 类型与常量齐备
content/vocabulary/*/relations.json       不存在  📐 零产出
registry.getRelations(contentId)          恒返回 []   registry.ts:129-131
```

`registry.ts:128-131`：

```ts
/** 关系查询：当前无 relations.json，恒为空数组（关系模型已就位，接入内容即产出） */
export function getRelations(_contentId: string): ContentRelation[] {
  return []
}
```

⚠️ 注意参数是 `_contentId` —— 带下划线表示**未使用**。这是一个「签名已定、实现为空」的占位函数。

---

## 2. ✅ 已有：两类关系模型

### 2.1 为什么必须分两类（铁律）

`relation.ts:1-2` 与 `:18-22` 原文：

> **V4.1 · Relation —— 两类关系，永不合并（本轮只定模型，不建图）。**
>
> ⚠️ **铁律：Content Relation 与 Learning Relation 永不合并进同一张 graph。**
> 前者是内容之间的关系（随内容发布而存在，对所有用户一致，可进 `content/` 数据）；
> 后者是用户与内容的关系（随用户行为而变，属于 **Learning 层**，禁止落进 `content/`）。
> 合并的后果：导入新词库时用户数据被覆盖、多用户互相串进度、内容包体积随用户数膨胀。

契约 §9（`:345-350`）同此：

> - **Content Relation**：word→topic、audio→transcript、reading→vocabulary …
> - **Learning Relation**：user→content、user→collection、user→goal …
>
> 学习关系属于 Learning 层，**不落 `content/` 数据**。

`schema.ts` 与 `content/` 目录都只承载 Content Relation。

---

## 3. ✅ Content Relation 模型

### 3.1 六种关系类型

`relation.ts:26-40`：

```ts
export type RelationType =
  | 'belongs_to'    // 归属：词条属于某内容包 / 主题下的内容
  | 'contains'      // 包含：包/主题包含某条内容
  | 'related_to'    // 相关：主题相关、近义、同族
  | 'prerequisite'  // 前置：学习路径上的先修关系
  | 'appears_in'    // 出现于：词条出现在某音频/阅读/文档中
  | 'same_as'       // 同一实体：不同 namespace 下的同一 lexical item
```

### 3.2 `ContentRelation` 结构

`relation.ts:42-48`：

```ts
export interface ContentRelation {
  from: string     // 源 ContentId
  type: RelationType
  to: string       // 目标 ContentId
}
```

### 3.3 `same_as` 的特殊语义

`relation.ts:37-39` 原文：

> 同一实体：不同 namespace（即不同包）下的同一 lexical item
> （`content:word:ecdict-ielts:abandon` ≡ `content:word:ecdict-cet4:abandon`）——
> 跨包同词合法，消歧靠 namespace，而不是禁止同词。

**这是跨包同词的正式表达方式**：不靠禁止同词、也不靠合并 id，
而是用一条 `same_as` 关系把两个不同 id 关联起来。

实测背景：全库 **2 323 个跨包同名词**（`GAP_ANALYSIS.md#A-4`）——
即 `same_as` 关系理论上最多有 2 323 条待产出。

### 3.4 端点类型约束 `RELATION_TARGET_TYPES`

`relation.ts:54-61`：

```ts
export const RELATION_TARGET_TYPES: Record<RelationType, ContentType[]> = {
  belongs_to:   ['vocabulary', 'topic', 'collection'],
  contains:     ['word', 'audio', 'document', 'exercise'],
  related_to:   ['word', 'topic'],
  prerequisite: ['word', 'topic'],
  appears_in:   ['audio', 'document', 'listening', 'reading'],
  same_as:      ['word'],
}
```

⚠️ **适用范围限定**（`relation.ts:51-53`）：

> 只用于 **Content Relation**；Learning Relation 的端点不是内容类型，不适用本表。

设计意图（`relation.ts:50-51`）：「`belongs_to` 的 to 应为包，`appears_in` 的 to 应为资源」。

### 3.5 命名的历史遗留

`relation.ts:3-9` 的示例用的是**旧形态** ContentId：

```
content:word:ecdict-ielts:abandon
  ├─ belongs_to → content:vocabulary:ecdict-ielts:ielts
  ├─ related_to → content:topic:ielts:environment        ← 裸包 id 当 namespace
  └─ appears_in → content:audio:ielts:listening-test-01   ← 同上
```

后两行违反 namespace 规则 `${来源族}-${包 id}`。
`content/README.md:87-88` 已就此提醒：

> ⚠️ 未来类型也要守 namespace 规则 `${来源族}-${包 id}`。旧写法
> `content:topic:ielts:environment` 拿包 id 当 namespace，会撞 namespace —— **不要照抄**。

```

→ 这是 relation.ts 注释里的示例陈旧问题（代码本身无影响，因为无数据）。
```

---

## 4. ✅ Learning Relation 模型

`relation.ts:64-90`：

```ts
export type LearningRelationType =
  | 'studied'      // 学过（至少练过一次）
  | 'collected'    // 收藏/加入生词本
  | 'mastered'     // 已掌握
  | 'in_progress'  // 学习中（未掌握，仍在复习队列）
  | 'goal_of'      // 是某目标的内容（目标 → 内容）

export interface LearningRelation {
  userId?: string
  from: string
  type: LearningRelationType
  to: string
  at?: string      // 关系发生时间（ISO 字符串）
}
```

`relation.ts:78-80` 的字段语义：

```
from = 用户主体 / 用户集合（当前以 userId 携带用户身份）
to   = ContentId
```

### 4.1 实测：零产出

| 项 | 值 |
|---|---|
| `LearningRelation` 在 `src/` 内被构造的次数 | **0** |
| `LearningRelationType` 在 `src/` 内被使用的次数 | **0** |
| 与现有 Learning store 的关系 | **无**（`reviewStore` / `memorizeStore` 都用裸 `word`，见下） |

### 4.2 与现有实现的口径差距

`LearningRelation.to` 声明为 `ContentId`，但实际学习记录用的是裸 `word`：

| 层 | 键形态 |
|---|---|
| `LearningRelation.to`（设计） | `content:word:ecdict-ielts:abandon` |
| `gt.review.v1` 实际键 | `abandon`（裸 word） |
| `gt.memorize.v1` 实际键 | `abandon` |
| `gt.analytics.v1` 实际键 | `abandon`（lowercase） |

→ **Learning Relation 无法在现有数据上构造**，因为没有任何一条现有记录带 ContentId。
这是契约 §10 L-6「Learning 层未迁移」的直接后果。
详见 `03-architecture/LEARNING_ARCHITECTURE.md#4`。

---

## 5. 📐 待建：`relations.json` 契约

契约 §8.2（`:448-461`）已给出**文件级契约**，但**无任何包产出**：

```ts
interface ContentRelation { from: string; type: RelationType; to: string }
```

数据流设计（`relation.ts:4-5`）：

```
content/vocabulary/<id>/relations.json（可选）→ registry.getRelations()
```

### 5.1 门禁钩子（已存在，恒跳过）

`validate.mjs:312-340` 第 12(e) 项：

```js
const relPath = path.join(dir, 'relations.json')
if (!existsSync(relPath)) {
  console.log('  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）')
} else {
  // 支持两种结构：数组 或 { relations: [...] }
  // 逐条校验：端点须匹配 4 段式 ContentId 且在全库可达
  // 不可达 → "孤儿端点"
}
```

**实测**：10 个包**全部无 `relations.json`** ⇒ 该项恒打印「跳过」。

⚠️ 契约 §10 L-3 提醒：

> `relations.json` / `assets/` 尚无数据，门禁相应项打印「跳过」，**不伪造通过**。

`content/README.md:514` 同此，并强调「当前 10 个包全部无该字段 ⇒ 该项恒跳过，
**别当成『已校验通过』**」。

### 5.2 门禁的校验能力（已实现，未触发）

即使当前无数据，校验逻辑已写完整（`validate.mjs:319-338`）：

| 校验项 | 实现 |
|---|---|
| 结构识别 | 数组 或 `{relations:[...]}` 两种皆可（`:320`） |
| 端点提取 | 支持 `{from,to}`、`{source,target}`、`{endpoints:[...]}` 三种写法（`:325`） |
| 端点格式 | 必须匹配 `/^content:([a-z]+):([a-z0-9-]+):(.+)$/`（`:327`） |
| 可达性 | 包 ContentId 精确匹配，或 `type==='word'` 时同 namespace + 词形可达（`:330-333`） |
| 报告 | 最多列 3 处问题（`:337`） |

→ **门禁已就绪，缺的只是数据。**

### 5.3 两个门禁覆盖不到的检查

`validate.mjs` **不校验**：

| # | 未校验项 | 说明 |
|---|---|---|
| 1 | **`type` 是否在 `RelationType` 枚举内** | 门禁只检查端点，不检查 `r.type` 的值 |
| 2 | **端点类型是否匹配 `RELATION_TARGET_TYPES`** | 例如 `belongs_to` 的 `to` 是否真是包/主题类型 |

`RELATION_TARGET_TYPES`（`relation.ts:54-61`）在 `src/` 内被引用的次数 = **0**
（仅定义，无使用处，无门禁）。

**建议**（标注为「建议」，非现状）：
接入第一个 `relations.json` 时同步补这两项门禁。
契约 §10 L-3 已明确要求：「P3 接入时必须同步补门禁断言」。

---

## 6. 关系数据量与规模的推算（供规划参考）

> 以下为基于实测数字的**推算**，非实测结果。

| 关系类型 | 潜在规模 | 依据 |
|---|---|---|
| `belongs_to` | 9 346 条 | 每个词条归属一个包 |
| `same_as` | ≤ 2 323 条 | 跨包同名词数量（`GAP_ANALYSIS.md#A-4`） |
| `contains` | 10 条 + 未来内容 | 每包 → 其内容（当前仅 10 包） |
| `related_to` / `prerequisite` | 0 | 依赖 `topic` 类型，无数据 |
| `appears_in` | 0 | 依赖 `audio` / `document` / `listening` / `reading`，无数据 |

**注意**：`belongs_to` 与 `same_as` 规模已过万条。若每包一个 `relations.json`，
则 ielts/kaoyan/toefl 三包各有约 3 000 条 `belongs_to` ——
这会显著增大包体积，**需要与 lazy 加载策略一起考虑**
（`relations.json` 是否会进主 chunk？当前无 policy 声明字段覆盖它）。

**建议**（标注为「建议」，非现状）：
`relations.json` 的加载策略需在 Content Loading Strategy（契约 §13）中单独规定 ——
当前 §13 只覆盖 `words.json`。

---

## 7. 一句话结论

> 关系层的**模型是完整的**（6 种 Content Relation + 5 种 Learning Relation + 端点类型约束），
> 两类关系「永不合并」的铁律在代码、注释、契约三处都有明文，
> 门禁（validate 第 12(e) 项）也已实现完整的端点格式与可达性校验。
> **但数据是零** —— 10 个包全部无 `relations.json`，`getRelations()` 是一个
> 参数带下划线、恒返回 `[]` 的占位函数。
> 契约 §10 L-3 已如实把这一项列为「冻结时必须一起接受」的已知限制。
