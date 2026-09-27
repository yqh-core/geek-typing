# 学习图谱（LEARNING_GRAPH）

> 状态：📐 待建
>
> 📐 **待建**：学习图谱 —— **零实现**。`relation.ts` 有 90 行类型模型，但**不产出任何一条关系数据**
> ✅ **已有**（相关但独立）：`RelationType` 类型枚举、`RELATION_TARGET_TYPES` 约束表、`getRelations()` 空实现占位
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/core/content/relation/relation.ts`（90 行）、`src/core/content/registry.ts:128-131`、`content/README.md:345-350`

---

## 1. 一句话事实

**模型 90 行，数据 0 条。**

```
src/core/content/relation/relation.ts      90 行    ✅ 类型与常量齐备
content/vocabulary/*/relations.json        不存在   📐 零产出
registry.getRelations(contentId)           恒返回 [] 📐 registry.ts:128-131
validate 第 12(e) 项                       恒跳过    📐 validate.mjs:312-315
```

`registry.ts:128-131`：

```ts
/** 关系查询：当前无 relations.json，恒为空数组（关系模型已就位，接入内容即产出） */
export function getRelations(_contentId: string): ContentRelation[] {
  return []
}
```

> ⚠️ **参数名是 `_contentId`** —— 带下划线表示**未使用**。这是一个「签名已定、实现为空」的占位函数。

**「学习图谱」是需求文档的核心目标之一**（`GAP_ANALYSIS.md:150` 记为 D-1「需求文档核心目标。当前 `relation.ts` 有模型但**不产出任何数据**」）。

---

## 2. ✅ 已有：关系模型（90 行）

### 2.1 两类关系，永不合并（铁律）

`relation.ts:18-23` 原文：

> ⚠️ **铁律：Content Relation 与 Learning Relation 永不合并进同一张 graph。**
> 前者是内容之间的关系（随内容发布而存在，对所有用户一致，可进 `content/` 数据）；
> 后者是用户与内容的关系（随用户行为而变，属于 **Learning 层**，禁止落进 `content/`）。
> 合并的后果：导入新词库时用户数据被覆盖、多用户互相串进度、内容包体积随用户数膨胀。
> 另外 `RELATION_TARGET_TYPES` **只约束 Content Relation**，不用于校验 Learning Relation。

| 类型 | 形态 | 存放 | 生命周期 |
|---|---|---|---|
| **Content Relation** | 内容 ↔ 内容 | `content/vocabulary/<id>/relations.json`（可选） | 随内容发布 |
| **Learning Relation** | 用户 ↔ 内容 | **Learning 层**（禁止落 `content/`） | 随用户行为 |

`content/README.md:345-350` 同此：

> - **Content Relation**（`relation/relation.ts`）：word→topic、audio→transcript、reading→vocabulary …
> - **Learning Relation**：user→content、user→collection、user→goal …
>
> 学习关系属于 Learning 层，**不落 `content/` 数据**。

### 2.2 `RelationType` —— 6 种内容关系

`relation.ts:26-40`：

```ts
export type RelationType =
  /** 归属：词条属于某内容包 / 主题下的内容 */
  | 'belongs_to'
  /** 包含：包/主题包含某条内容 */
  | 'contains'
  /** 相关：主题相关、近义、同族 */
  | 'related_to'
  /** 前置：学习路径上的先修关系 */
  | 'prerequisite'
  /** 出现于：词条出现在某音频/阅读/文档中 */
  | 'appears_in'
  /** 同一实体：不同 namespace（即不同包）下的同一 lexical item
   *  （content:word:ecdict-ielts:abandon ≡ content:word:ecdict-cet4:abandon）——
   *  跨包同词合法，消歧靠 namespace，而不是禁止同词。 */
  | 'same_as'
```

### 2.3 `ContentRelation` —— 关系的数据形状

`relation.ts:42-48`：

```ts
export interface ContentRelation {
  /** 源 ContentId */
  from: string
  type: RelationType
  /** 目标 ContentId */
  to: string
}
```

**三点式三元组**（`from` / `type` / `to`），无权重、无置信度、无时间戳。

### 2.4 `RELATION_TARGET_TYPES` —— 端点类型约束

`relation.ts:50-61`：

```ts
/**
 * 关系端点类型约束（校验用）：belongs_to 的 to 应为包，appears_in 的 to 应为资源。
 * ⚠️ 只用于 **Content Relation**；Learning Relation 的端点不是内容类型，不适用本表。
 */
export const RELATION_TARGET_TYPES: Record<RelationType, ContentType[]> = {
  belongs_to: ['vocabulary', 'topic', 'collection'],
  contains: ['word', 'audio', 'document', 'exercise'],
  related_to: ['word', 'topic'],
  prerequisite: ['word', 'topic'],
  appears_in: ['audio', 'document', 'listening', 'reading'],
  same_as: ['word'],
}
```

**每个关系类型都规定了「目标端允许的内容类型」** —— 这是为未来的校验预留的约束表。

### 2.5 文档给出的关系示例

`relation.ts:4-9`：

```
关系数据流：content/vocabulary/<id>/relations.json（可选）→ registry.getRelations()
例：
  content:word:ecdict-ielts:abandon
    ├─ belongs_to → content:vocabulary:ecdict-ielts:ielts
    ├─ related_to → content:topic:ielts:environment
    └─ appears_in → content:audio:ielts:listening-test-01
```

> ⚠️ 注意示例中的 `content:topic:ielts:environment` 与 `content:audio:ielts:listening-test-01` **用的是包 id 当 namespace** —— `content/README.md:87-88` 明确指出这是**旧写法、会撞 namespace、不要照抄**：
> 「⚠️ 未来类型也要守 namespace 规则 `${来源族}-${包 id}`。旧写法 `content:topic:ielts:environment` 拿包 id 当 namespace，会撞 namespace —— 不要照抄。」

### 2.6 `LearningRelation` —— 用户 ↔ 内容

`relation.ts:63-90`：

```ts
/** 用户 ↔ 内容 的关系类型（Learning 层，不进 content/ 数据） */
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
  /** 关系发生时间（ISO 字符串） */
  at?: string
}
```

**5 种学习关系**，比内容关系多了 `userId` 与 `at` 字段。

---

## 3. 📐 待建：零数据状态

### 3.1 文件系统实测

```bash
$ content/vocabulary/*/relations.json
（不存在）
```

**10 个包全部无 `relations.json`。**

### 3.2 门禁实测：第 12(e) 项恒跳过

`validate.mjs:312-315`：

```js
//   (e) invalid / orphan relation —— 只有 relations.json 存在才校验
const relPath = path.join(dir, 'relations.json')
if (!existsSync(relPath)) {
  console.log('  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）')
}
```

**实测输出恒为**：`· 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）`

> ⚠️ **「跳过」不是「通过」。** `content/README.md:634` 明确记录：
> 「`relations.json` 与 `assets/` 目前尚无数据 → 门禁 (e) / (f) 打印「跳过」，不伪造通过。」

### 3.3 为什么零数据（官方解释）

`relation.ts:11-12`：

> 当前（V4.1-P0）**不产出任何 `relations.json`：无 topic/audio 内容前建关系是空数据**。
> 模型就位后，第一个新内容类型接入即可直接产出关系，无需再改架构。

**这个理由站得住**：关系的两端都需要内容实体（`content:topic:*` / `content:audio:*`），而这些类型**当前全部 `packages=0 / items=0`**（`04-content/CONTENT_TYPES.md` 实测：12 个类型中仅 `vocabulary` 与 `word` 有数据）。

用 `catalog.ts:52-64` 的 `PLANNED_TYPES` 对照：

```ts
const PLANNED_TYPES = [
  'vocabulary',    // ✅ 10 包 9346 词
  'listening',     // 📐 0
  'reading',       // 📐 0
  'audio',         // 📐 0
  'topic',         // 📐 0
  'exercise',      // 📐 0
  'writing',       // 📐 0
  'speaking',      // 📐 0
  'grammar',       // 📐 0
  'document',      // 📐 0
  'collection',    // 📐 0
]
```

**11 个槽位中 10 个为空** ⇒ 关系图没有可连的节点。

### 3.4 ⚠️ 一个已存在但无关系表达的事实

**尽管没有 `relations.json`，项目中已经存在「事实上的关系」**：

| 已存在的关系 | 当前表达方式 | 建议的关系类型 |
|---|---|---|
| `abandon`（ielts）与 `abandon`（cet4）是同一个词 | **隐式**：靠 `normKey` 比较词形（`validate.mjs:98`） | `same_as` |
| 词条属于某个包 | **隐式**：由文件位置决定（`content/vocabulary/<id>/words.json`） | `belongs_to` |
| 包属于某考试（`exam: "IELTS"`） | **manifest 字段**（`ielts/manifest.json`） | — |

**这意味着 `same_as` 类型已有 2323 个实例可立即产出**（跨包同词数，见 `DEDUPLICATION.md` §5.3）—— 只是当前没有 `relations.json` 承载它们。

> **建议**（📐）：若要在无新内容类型的情况下先落地部分关系图，`same_as` 是**最低成本的第一批数据** —— 它只需要现有词表 + 一次跨包同词扫描，不需要任何新内容类型。这可以作为验证「关系链路端到端可用」的最小用例。

---

## 4. 📐 建议：关系类型与实现路径

> 以下全部为**建议**，非实测事实。当前代码零数据、零读取。

### 4.1 建议补齐的关系类型（对照需求）

`relation.ts:26-40` 已定义 6 种。按需求文档描述的学习图谱目标，**建议**补充以下关系（**不在现有枚举内**）：

| 建议类型 | 方向 | 语义 | 依据 |
|---|---|---|---|
| `word → sentence` | 词 → 句 | 例句包含该词 | 需求：用例句学词 |
| `word → audio` | 词 → 音 | 该词的发音音频 | `relation.ts:8` 示例已提及 `appears_in`，但那是「词出现在音频中」而非「词的发音音频」 |
| `word → video` | 词 → 视频 | 该词出现的视频片段 | 需求：视频学习 |
| `lesson → book` | 课 → 书 | 课属于哪本教材（如 NCE 1-4） | 需求：NCE 方向 |
| `lesson → exercise` | 课 → 练习 | 课配套的练习题 | 需求：练习闭环 |
| `word → word`（同义/反义） | 词 → 词 | 近义、反义、词根族 | `related_to` 已可表达，但缺子类型区分 |

**注意**：现有 `RelationType` 中 `appears_in` 的 `to` 允许 `audio / document / listening / reading`（`relation.ts:59`），这意味着**「词 → 音频」的最基础形态已可表达** —— 建议优先复用而非新增类型。

### 4.2 建议的实现路径（分四步）

```
S1 · 定义 relations.json 形状
     └─ 建议：{ relations: [ { from, type, to } ] } 或裸数组
        （validate.mjs:320 已同时支持两种：Array.isArray(raw) ? raw : raw?.relations）

S2 · 产出第一批数据（推荐 same_as）
     └─ 跨包同词扫描 → 2323 条 same_as
        ⚠️ 需确认：2323 条是否全部要写？还是只写「用户可能困惑」的部分？
        （每条 same_as 是双向还是单向？建议单向，读取时双向展开）

S3 · 打通校验（第 12(e) 项已就绪）
     └─ 端点须匹配 4 段式 ContentId 且在全库可达（validate.mjs:324-337）
        ⚠️ 该实现只识别 type === 'word' 的可达性（:331），
           非 word 类型端点需要先有对应内容才能通过

S4 · 图查询 API + UI
     └─ 建议在 Content 层加「按 ContentId 取邻居」的查询，
        而不要新建 Graph 服务（守 content/README.md:625 的 P1 硬原则）
```

### 4.3 建议的文件位置

| 方案 | 位置 | 优点 | 缺点 |
|---|---|---|---|
| **A. 包内文件**（模型已预设） | `content/vocabulary/<id>/relations.json` | 与包同生命周期；validate 第 12(e) 已就绪 | 跨包关系（如 `same_as`）无处安放 —— 两端属于不同包 |
| B. 全库单文件 | `content/relations.json` | 跨包关系自然 | 需改 validate 第 12(e) 的查找路径 |
| C. 按关系类型分文件 | `content/relations/same_as.json` 等 | 语义清晰 | 引入新目录约定 |

> **建议选 A + B 组合**（📐）：包内关系（`belongs_to` / `contains` / `prerequisite` 等）放包目录；**跨包关系（`same_as`）放全库文件** —— 因为 `same_as` 的语义本身就是「跨包同词」，放进任一个包都会造成归属争议。

### 4.4 ⚠️ 建议避免的三个陷阱

| 陷阱 | 说明 | 依据 |
|---|---|---|
| **把 Learning Relation 写进 `content/`** | 会导致「导入新词库时用户数据被覆盖、多用户互相串进度」 | `relation.ts:18-22` |
| **用包 id 当 namespace** | 旧写法 `content:topic:ielts:environment` 会撞 namespace | `content/README.md:87-88` |
| **在无内容类型时先建关系** | 会产生指向空实体的孤儿端点，validate 第 12(e) 会 FAIL | `relation.ts:11-12` |

---

## 5. 与需求文档的对照

| 需求 | 实测状态 | 缺口 |
|---|---|---|
| 学习图谱 | 📐 零数据 | 全部 |
| 词 → 句 / 音 / 视频 | 📐 零实现 | 需内容类型先落地 |
| 课 → 书 / 练习 | 📐 零实现 | 需 lesson/book 类型（不在 `PLANNED_TYPES` 内！） |
| 学习路径（先修关系） | 🟡 类型已有（`prerequisite`） | 零数据、零 UI |
| 关系可视化 | 📐 零实现 | 无图渲染组件 |

> ⚠️ **注意 `PLANNED_TYPES` 中无 `lesson` / `book` / `sentence` / `video`** —— 而需求文档提到 NCE（1-4 册，课→书）与视频学习。**这意味着即使要建学习图谱，内容类型的槽位本身也需要先扩展**（或把 lesson 归入 `collection` / `document`）。这是一处需求与现有类型体系的**范围错配**，建议在规划阶段澄清。

---

## 6. 结论

- **学习图谱当前完成度 = 0%（数据）**。模型层（90 行）设计完整且约束明确，但**没有一条关系数据**，`getRelations()` 恒返回 `[]`，门禁第 12(e) 项**恒跳过**（不是通过）。
- **零数据有合理理由**：关系两端需要内容实体，而 11 个内容类型槽位中 10 个为空（`catalog.ts:52-64`）。
- **发现一个可立即落地的最小切口**：`same_as` 类型已有 **2323 个真实实例**（跨包同词），不需任何新内容类型即可产出第一批关系数据，可用于端到端验证关系链路。
- **两处范围错配需要澄清**（📐）：① 需求提到的 lesson/book/sentence/video 不在 `PLANNED_TYPES` 内；② `relation.ts:6-8` 的示例用了旧 namespace 写法（`content:topic:ielts:*`），与 `content/README.md:87-88` 的规范冲突。
- **建议的实现路径**见 §4，全部标注为建议。核心原则：**不要新建 Graph 服务**（守 `content/README.md:625` 的 P1 硬原则），先落地 `same_as` 验证链路，再随内容类型推进逐个接入。
