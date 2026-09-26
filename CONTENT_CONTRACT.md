# Content Contract —— V4.1 内容契约（**已冻结**）

> **状态：FROZEN @ V4.1-P0.6**（2026-09-26）
>
> 本文件是 geek-typing **Content 层的唯一规范**。它不是设计说明，是**约束**：
> 这里是所有「必须为真」的断言，任何与之冲突的代码都是 bug（不是风格差异）。
>
> ### 🔒 冻结条款（最重要的一段）
>
> **P1（词汇产品化）及以后，不允许为了 UI 方便而修改本契约。**
>
> 具体地说，以下行为一律视为违约：
>
> | ❌ 禁止 | 理由 |
> |---|---|
> | 为了少一次查询而把 contentVersion 塞进 ContentId | 每次修订都会换主键，历史学习记录全部失联 |
> | 为了让联结表好看而放宽 / 收紧 namespace 规则 | namespace 唯一性是词级 id 全局唯一的充要条件 |
> | 为了少写一个字段而跳过 checksum | 「学到的到底是哪份内容」将无法回答 |
> | 为了让某个页面好写而新增 `searchXxx()` 散装 API | 每加一类翻一倍调用点，是上一代最贵的债 |
> | 为了让某张卡片显示「最近添加」而给词条补 `updatedAt` 假数据 | 数据不存在就诚实返回，见 §10「已知限制」 |
> | 觉得某字段麻烦而在 manifest 里省略它 | §7 全部为必填，`content:validate` 会 FAIL |
>
> **确需变更时的唯一流程**（见开头「冻结条款」，不允许跳过任何一步）：
>
> ```
> 1) 先改本文件（写明变更、影响面、迁移方案、是否需要 SCHEMA_VERSION +1）
> 2) 再改 scripts/content/validate.mjs，把新约束固化为门禁项
> 3) 跑 content:build 全量迁移所有包
> 4) 跑全量回归：content:validate → test:content → build → e2e → offline-audit
> 5) 提交时 commit message 必须含 [CONTRACT CHANGE]
> ```
>
> 配套文档：`content/README.md`（操作手册 / 踩坑史 / CLI），本文件（规范 / 冻结边界）。
> 两者冲突时**以本文件为准**，并立即修 README。

---

## 目录

| § | 主题 |
|---|---|
| 1 | 三层边界 |
| 2 | ContentId |
| 3 | PackageId / namespace / localId |
| 4 | 版本模型：schemaVersion / contentVersion / contentRevision / checksum |
| 5 | Canonical JSON 与 checksum 算法 |
| 6 | 核心类型：ContentRef / ContentVersioned / ContentVersionRef / ContentSnapshot / AssetRef |
| 7 | manifest.json 契约 |
| 8 | words.json / relations.json 契约 |
| 9 | Catalog / ContentIndex / ContentQuery 三层职责与 API |
| 10 | 已知限制（冻结时必须一起接受） |
| 11 | 不变式清单（可直接写成断言） |

---

## 1. 三层边界

| 层 | 存放 | 主键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**` | ContentId + contentChecksum | 随版本发布 |
| **Learning** | `src/core/learning/model/` | contentId（+ ContentSnapshot） | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

三条不可协商：

1. **Content is immutable from the user's perspective.** 用户行为永远不写 `content/`。
2. **Learning never owns content.** 学习状态（mastery / streak / nextReviewAt）绝不挂进 content payload，也不写回 `content/`。
3. **User data never enters `content/`.**

---

## 2. ContentId

### 2.1 形态

```
content:<type>:<namespace>:<localId>
```

正则（`parseContentId` 的实现依据）：

```
/^content:([a-z]+):([a-z0-9-]+):(.+)$/
```

示例：

```
content:vocabulary:ecdict-ielts:ielts        词汇包（Package Content Entity）
content:word:ecdict-ielts:abandon            包内词条（Word Content Entity）
content:topic:curated-ielts:environment      主题（规划）
content:audio:curated-ielts:listening-test-01  音频（规划）
```

> ⚠️ 后两行是**规划**示例，namespace 仍须遵守 §3.2 的 `${来源族}-${包 id}` 形态。
> 早期文档里出现过 `content:topic:ielts:environment` 这种「裸包 id 当 namespace」的写法，
> 它与包的 `packageId` 同形、会撞 namespace —— **不要照抄旧写法**。

### 2.2 冻结条款

| # | 断言 | 依据 |
|---|---|---|
| C-1 | ContentId 大小写敏感、逐字符比较 | 生成侧用原词形，寻址侧必须同源 |
| C-2 | `type` ∈ `ContentType`（`vocabulary`/`word`/`topic`/`listening`/`audio`/`reading`/`writing`/`speaking`/`grammar`/`document`/`collection`/`exercise`） | `model/content.ts` |
| C-3 | `namespace` 匹配 `[a-z0-9-]+` | 同上，正则第 2 段 |
| C-4 | **版本信息绝不进 ContentId**（不拼 `.v2`、不拼 checksum） | 否则每次修订换主键 |
| C-5 | 非法 id 时 `parseContentId` 返回 `null`，**不抛异常** | 调用方自己决定 fallback，不打断 UI |

---

## 3. PackageId / namespace / localId

### 3.1 PackageId

- 定义 = `content/vocabulary/<packageId>` 的**目录名**。
- 同时是 UI 路由段、**持久化键**、CLI 参数。三者必须同一个字符串。
- **门禁：validate 第 13 项**，`manifest.packageId === 目录名`。

### 3.2 namespace

- 定义 = ContentId 第 3 段，规则 **`${来源族}-${包 id}`**（`ecdict-ielts`、`curated-ai-core`）。
- **每包唯一** —— 这是硬约束，不是建议。
- 必须与 `manifest.id` 的第 3 段**严格相等**（反过来 asserted：build.mjs 是从最终 id 反解 namespace，不是重算，保证同源）。
- **门禁：validate 第 9 项**（两两不同）+ **第 14 项**（与 id 同源）。

> **踩坑史（必须记住）**：早期直接用来源族 `ecdict` 作 namespace，cet4 / toefl / ielts 三包共用，
> 于是 `content:word:ecdict:abandon` 同时存在于三个包 → 学习记录主键撞车、跨包进度互相污染。
> 该缺陷由 `tests/content-query.mjs` 实测捕获，现已固化为门禁。

### 3.3 namespace 为什么必须每包唯一（充要性证明）

词级 ContentId = `content:word:<namespace>:<词形>`，localId 只有词形、**不含包 id**。
因此：

```
∀ 包 p ≠ q : namespace(p) ≠ namespace(q)  ⟺  词级 ContentId 全局唯一
```

反方向同理：若两包 namespace 相同，同名词立刻产生同一个 id（不可逆，且静默）。

### 3.4 跨包同词是合法数据关系

IELTS / CET-4 / TOEFL 各有 `abandon` —— **这是正确的数据**，消歧靠 namespace，
**不靠禁止同词**。任何「跨包词唯一」的约束都是错的，会被门禁拒绝。

### 3.5 localId

生成规则由 `normalizeLocalId()` 单一实现，顺序固定：

```
NFC 归一 → trim → 连续空白折叠为单空格 → 删除控制字符 → `:` `/` 替换为 `-`
```

- **不做 lowercase**：大小写是 vocabulary / code 词库的语义决策，由调用方决定（`wordId()` 内部自行 lowercase）。
- `isStableLocalId(id)` 判据：非空 + 幂等 + 不含 `:` `/` + 不含控制字符。

**localId 稳定性契约**：一旦随内容包发布即为该实体的**永久主键**。
改释义 / 改音标 / 改例句 / 修 typo **都不得修改 localId** —— 内容修订用 `contentVersion` 表达。
同词多义拆分时用后缀：`run` / `run-2`，或 `run-v1` / `run-n1`。

---

## 4. 版本模型

### 4.1 四个数，各管一件事，**禁止复用**

| 字段 | 语义 | 递增时机 | 能否回滚 | 参与相等性判断 |
|---|---|---|---|---|
| `schemaVersion` | **结构**版本（当前 **4**） | manifest 结构破坏性变更 | 否 | 否 |
| `contentRevision` | 单调递增**审计号** | 每次「内容确实变了」的构建 +1 | **否**（回滚继续 +1） | **否** |
| `contentVersion` | 对外**学习契约版本** | 全新内容 +1；回滚回到历史值 | **是** | 是（与 checksum 一起） |
| `contentChecksum` | 内容的**确定性身份** | 内容变化 | 是（回到历史值） | 是 |

### 4.2 为什么必须拆成三个（一句话）

旧模型里 `contentVersion` 是「checksum 变就 +1」的单调计数器 —— 它是**状态**而不是内容的身份：
回滚会让 version 白白 +1，于是「回滚后的内容」与「从未发布过的新内容」在版本号上无法区分，
学习记录无法回答「这是我学过的那个版本吗」。

### 4.3 ⚠️ version 不保证连续（必须写进下游代码的心态）

```
内容 X → rev1/ver1
内容 Y → rev2/ver2
回滚 X → rev3/ver1   （version 回到历史值，history 不新增条目）
内容 Z → rev4/ver4   ← 注意：ver4，而不是 ver3
```

因此：

- ❌ 禁止假设 `version_n === version_{n-1} + 1`
- ❌ 禁止把 version 当数组下标 / 当进度条 / 当「第几代」做差值
- ✅ 判断内容身份：**只看 checksum 是否命中 `contentHistory`**
- ✅ 对外展示「版本」时用 `contentVersion`，但要接受跳号是正常现象

> 该行为由 P0.6 期间的 cet4 回滚**手工回归**确认（ver 序列出现过 `1 → 4`）：
> 步骤为「改一词 → build（rev2/ver2）→ 回滚 → build（rev3/ver1）→ 再改成第三种内容 →
> build（rev4/ver4）」。⚠️ 该回归**未固化为自动断言**（仓内落盘的 cet4 仍是 rev1/ver1、
> history 只有 1 条），因为断言它会污染 `contentHistory` 真值。需要复核请按上述步骤重跑。

### 4.4 版本三元组构建规则（`content:build`）

三条铁律：

1. **首次迁移不递增**：manifest 尚无 `contentHistory` 时只补字段，version/revision 取现有值或 1。
2. **内容未变则全量复用**：`contentChecksum` 与上次一致 ⇒ revision / version / publishedAt / builtAt
   一个字节都不改（否则每次 build 都改 `builtAt`，幂等被直接破坏）。
3. **内容变了**：先在 history 里找同 checksum 的条目（**取 revision 最大的那条**）
   - 命中（回滚）⇒ `version = 该条 version`，`revision = max + 1`，**不新增 history 条目**；
   - 未命中（全新）⇒ `revision = version = max + 1`，追加一条 history。

### 4.5 `contentChecksum` ≠ `sources[].checksum`

| 字段 | 含义 |
|---|---|
| `contentChecksum` | **规范化入库内容**的指纹 |
| `sources[].checksum` | **来源原始数据**的指纹 |
| `build.sourceChecksum` | 本次构建读入源数据的指纹 |

当前来源就是本仓 `words.json` ⇒ 三者同值。将来接入原始 CSV / 上游文件后必然分叉 ——
分叉本身就是 **provenance 的价值**：能回答「源数据没变，但规范化后入库内容变了」。

---

## 5. Canonical JSON 与 checksum 算法

**目的**：同一份数据，换排版（缩进 / 换行 / 键序不同）**checksum 不变**。
否则 `words.json` 被 prettier 格式化一次，全库 10 个包的内容版本都会「变更」。

### 5.1 规则（`scripts/content/canonical.mjs`，冻结）

| # | 规则 | 说明 |
|---|---|---|
| N-1 | 白名单字段按固定顺序输出 | `['word','translation','phonetic','definition','partOfSpeech']`。⚠️ 白名单对**任意对象**生效、不只对词条 —— 所以 `manifest.stats` 落盘是 `{"phonetic":..,"definition":..,"items":..}`（`phonetic`/`definition` 命中白名单被前置，`items` 走字典序），不是字典序 |
| N-2 | 未知字段**全部**白名单之后，按 **code unit 字典序**排 | 新字段出现不会让既有 checksum 失效 |
| N-3 | **value 为 `undefined` 的键跳过** | 保证 `{}` 与 `{a:undefined}` 同指纹 |
| N-4 | **数组绝不重排** | 🔴 词表顺序是有语义的，排序 = 破坏数据 |
| N-5 | Unicode **原样输出**，不转义为中文 | 避免 `\uXXXX` 与字面量的分歧 |
| N-6 | 紧凑输出，无空格 / 无缩进 | 唯一的紧凑形态 |
| N-7 | `canonicalize()` 结果**无**尾随换行；`canonicalFile()` 补 `\n`，且 **checksum 不含该换行** | 文件可 diff，指纹不被换行影响 |
| N-8 | 指纹格式 `'sha256:' + hex`（**完整值，不截断**） | provenance 需要可复现 |

### 5.2 自检

`canonical.mjs` 自带 `selfCheck()`，规则违反立刻 FAIL：

```
canonicalize([{word:'z'},{word:'a'}]) === '[{"word":"z"},{"word":"a"}]'   // 数组未被重排
```

---

## 6. 核心类型（冻结）

### 6.1 `ContentItem`

```ts
interface ContentItem { id: string; type: ContentType }
```

### 6.2 `ContentVersioned`

```ts
interface ContentVersioned { contentVersion: number }
```

### 6.3 `ContentRef` —— 指向「某个内容实体」

```ts
interface ContentRef {
  contentId: string
  contentVersion?: number     // 学到的是该实体的哪个版本
  contentChecksum?: string    // 该版本的确定性指纹
}
```

三者分工：ContentId = **是哪个实体**；contentVersion + checksum = **是该实体的哪个快照**；
Learning = **学到什么程度**（不在这里）。

### 6.4 `ContentVersionRef` —— 指向「某份内容本身」

```ts
interface ContentVersionRef { revision: number; checksum: string }
```

与 `ContentRef` 的区别：**不含 contentId**，可跨实体复用（例如校验「两包装的是不是同一份源数据」）。

### 6.5 `ContentSnapshot` —— 学习记录应当指向它

```ts
interface ContentSnapshot {
  contentId: string
  contentVersion: number
  checksum: string
  schemaVersion: number
  publishedAt?: string
}
```

辅助函数（`src/core/content/model/snapshot.ts`）：

| 函数 | 语义 |
|---|---|
| `snapshotOf(contentId, {version, checksum, publishedAt?}, schemaVersion?)` | 构造快照；省略 schemaVersion 取当前常量；**省略 publishedAt 则结果不含该键** |
| `isSameSnapshot(a?, b?)` | **contentId + contentVersion + checksum 三者全等**才 true；任一侧缺失 ⇒ false |
| `findRevision(history, checksum)` | 在 `contentHistory` 里取 **revision 最大**的匹配条目；无 ⇒ null |

两条必须记住：

- **`isSameSnapshot` 不能只比 version**：不同实体共用同一个 3 是合法的，`A#3` 与 `B#3` 是两份不同内容。
- **`findRevision` 必须与 `content:build` 同口径**：二者都取「最近一次以该内容发布的记录」。
  `contentHistory` 按 revision **升序**追加；同一 checksum 可出现多次（回滚场景），以最近一次为准。

### 6.6 `AssetRef` —— Content ≠ File

```ts
type AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'

interface AssetRef {
  assetId: string      // asset:<kind>:<namespace>:<localId>
  kind: AssetKind
  url: string          // 相对路径 / https URL（R2 / CDN / Releases）
  mime?: string
  bytes?: number
  checksum?: string
  license?: ContentLicense
}
```

- 前缀必须是 `asset:` 而不是 `content:` —— 否则会被 `parseContentId` 误解析成内容实体。
- Content 回答「这个东西是什么」，Asset 回答「文件在哪」。搬运到 CDN / R2 时 **Content 模型一行都不用改**。

---

## 7. `manifest.json` 契约（Package 的「身份证」）

### 7.1 字段表

| 字段 | 类型 | 必填 | 手改 | 说明 |
|---|---|:---:|:---:|---|
| `id` | string | ✅ | ❌ | 4 段式 ContentId，由 build 派生 |
| `type` | ContentType | ✅ | ✅ | |
| `version` | string | ✅ | ✅ | semver |
| `title` / `titleEn` | string | ✅ | ✅ | |
| `description` / `descriptionEn` | string | ✅ | ✅ | |
| `language` | string | ✅ | ✅ | |
| `exam` | string \| null | ✅ | ✅ | 非备考库为 null |
| `tags` | string[] | ✅ | ✅ | 包级 tag（Query scope 用它过滤） |
| `icon` | string | ✅ | ✅ | lucide 图标名 |
| `features` | `{phonetic: boolean; definition: boolean} & Record<string, boolean>` | ✅ | ✅ | 能力开关；业务用 `hasFeature()` 查询，**禁止 `if (packageId === 'xxx')`**。⚠️ `phonetic` / `definition` 两个键**必须存在**，`{}` 过不了 tsc |
| `stats` | `{items: number} & Record<string, number>` | ✅ | ❌ | 全部由 words.json 自动派生（`items` / `phonetic` / `definition`） |
| `sources` | ContentSource[] | ✅ | ❌ | 多来源溯源，含结构化 license |
| `offline` | `{supported, policy}` | ✅ | ✅ | policy: inline / lazy / runtime / on-demand |
| `schemaVersion` | number | ✅ | ❌ | 当前 **4** |
| `packageId` | string | ✅ | ❌ | **必须 === 目录名** |
| `namespace` | string | ✅ | ❌ | 必须与 `id` 第 3 段同源 |
| `contentVersion` | number | ✅ | ❌ | 学习契约版本 |
| `contentRevision` | number | ✅ | ❌ | 单调递增审计号，正整数 |
| `contentChecksum` | string | ✅ | ❌ | `'sha256:' + hex` 完整值 |
| `contentPublishedAt` | string | ✅ | ❌ | ISO date |
| `contentHistory` | ContentRevisionEntry[] | ✅ | ❌ | 非空的按 revision 升序列表 |
| `build` | `{toolVersion, builtAt, sourceChecksum}` | ✅ | ❌ | 构建溯源 |
| `normalize?` | `{stripHtml?: boolean}` | ➖ | ✅ | 代码词库须 `false` |

**禁止手改**列由 `content:build` 派生，漂移时跑一次 build 即可同步。

### 7.2 `contentHistory` 条目

```ts
interface ContentRevisionEntry {
  revision: number      // 单调递增
  version: number       // 该次构建对应的对外契约版本
  checksum: string      // 该次构建的规范指纹
  publishedAt?: string  // ISO date
}
```

### 7.3 ⚠️ 代码词库必须声明 `normalize.stripHtml: false`

否则 `type Handler<T>` 被剥成 `type Handler`、`<div />` 被整个删掉。
该缺陷由 ts-code 实测 5 条命中后固化。

### 7.4 真实落盘形状（`content/vocabulary/frontend/manifest.json`，单行 canonical + 尾随换行）

```json
{"build":{"builtAt":"2026-09-26T13:59:06.663Z","sourceChecksum":"sha256:ae689a16…","toolVersion":"content-build/1.1"},"contentChecksum":"sha256:ae689a16…","contentHistory":[{"checksum":"sha256:ae689a16…","publishedAt":"2026-09-26","revision":1,"version":1}],"contentPublishedAt":"2026-09-26","contentRevision":1,"contentVersion":1,"id":"content:vocabulary:curated-frontend:frontend","namespace":"curated-frontend","packageId":"frontend","schemaVersion":4,…}
```

---

## 8. `words.json` / `relations.json` 契约

### 8.1 words.json

- 形态：`WordPayload[]`，**顺序是有语义的**（Canonical JSON 规则 N-4：数组绝不重排）。
- `WordPayload = { word, translation, phonetic?, definition?, partOfSpeech?: string[] }`
  （= `Omit<WordContent, 'id' | 'type'>`）。⚠️ `schema.ts` 里的 `WordItem` 只是 `WordPayload` 的
  **子集描述**（缺 `partOfSpeech`），写类型请以 `WordPayload` 为准，否则会丢字段。
- 学习状态**绝不挂在这里**（mastery / streak / nextReviewAt 属 Learning 层）。
- 落盘格式 = `canonicalFile(words)`：紧凑单行 + 尾随换行。
- `contentChecksum === sha256Canonical(words)`（**必须走 canonical**，门禁第 15 项）。
- 大 JSON 经 `?raw` + 运行时 `JSON.parse` 导入（tsconfig 未开 `resolveJsonModule`）。

### 8.2 relations.json（**可选**，当前无包产出）

```ts
interface ContentRelation { from: string; type: RelationType; to: string }
```

六种 Content Relation：`belongs_to` / `contains` / `related_to` / `prerequisite` / `appears_in` / `same_as`。

**🔴 铁律：Content Relation 与 Learning Relation 永不合并进同一张图。**
后者（`studied` / `collected` / `mastered` / `in_progress` / `goal_of`）属于 Learning 层，**禁止落进 `content/`**。

文件不存在时门禁打印「跳过」，**不伪造通过**。

---

## 9. Catalog / ContentIndex / ContentQuery

```
Content Registry  → 从哪加载   (src/core/content/registry.ts)
Content Catalog   → 有什么     (src/core/content/catalog/catalog.ts)
Content Index     → 检索加速   (src/core/content/index/content-index.ts)  ← internal
Content Query     → 怎么找     (src/core/content/query/content-query.ts)  ← UI 唯一入口
```

### 9.1 Catalog

```ts
getCatalog(): ContentCatalog            // { schemaVersion, types[], packages[], totalItems }
getPackageCatalog(localId): CatalogPackageEntry | null
```

- **同步、只读 manifest**，不加载任何词条 ⇒ 首屏可放心调用。
- **诚实原则**：未接入的类型一律 `packages: 0 / items: 0`，**不许编造数字**。
- `features` 是「值为 true 的键」，业务按它分支而非按包 id。

### 9.2 ContentIndex（**internal**）

物理结构当前是四张 Map（`byId` / `byWord` / `byPackage` / `byTag`）—— **这是实现细节，不是契约**。

**业务代码（含 Query 层）只能通过 finder 访问索引**：

```ts
findById(id): WordHit | null
findByWord(normalizedWord): WordHit[]      // 跨包同词各占一条
findByPackage(packageLocalId): WordHit[]
findByTag(tag): WordHit[]
findByNamespace(namespace): WordHit[]      // namespace 每包唯一 ⇒ 最多命中一个包
idsByPackage(packageLocalId): string[]
```

finder 语义（切换实现时不得改变）：

- 命中顺序 = 索引顺序 = **包内词条数据顺序**（分页 / 排序契约依赖这个稳定性）；
- 未命中返回 `[]`（`findById` 返回 `null`），调用方不必判空；
- 返回**新数组**，调用方改它不污染索引；
- finder 是**同步**的，调用方需先 `await ensureIndex()` 覆盖目标包。

> 为什么必须有这层：明天索引可能是 Trie / FST / SQLite / IndexedDB / Worker / 远端 API。
> 若调用点到处写 `idx.byWord.get(x)`，换实现时总有一处漏改 → **静默丢数据**。
> 已确认 `content-query.ts` 零直访（grep `idx.\|by[A-Z]` 仅命中注释）。

### 9.3 ContentQuery（UI 唯一检索入口）

```ts
contentQuery.search(opts): Promise<WordHit[]>
contentQuery.list(opts): Promise<WordHit[]>
contentQuery.get(contentId): Promise<WordHit | null>
contentQuery.count(opts): Promise<number>
```

**统一入口原则（写死，别破例）**：新增内容类型时在 `SUPPORTED_TYPES` 里扩展 + 内部加分支，
❌ 禁止再出现 `searchTopics()` / `searchAudios()` 这类散装 API。

#### 9.3.1 `QueryOptions`

```ts
interface QueryOptions {
  type?: ContentType | 'all'   // 默认 'word'
  query?: string
  packageId?: string           // 裸 id 或 4 段式
  namespace?: string
  tags?: string[]
  page?: number                // 从 1 起
  pageSize?: number            // 省略 = 不分页
  exact?: boolean
  hasPhonetic?: boolean
  scope?: ContentScope
  sort?: SortField | SortSpec
}
```

#### 9.3.2 Scope

```ts
interface ContentScope { type?: ContentType; packageId?: string; namespace?: string; tags?: string[] }
```

- **合并规则（已冻结）：显式平铺参数优先于 `scope`，是「覆盖」不是「交集」。**
  `{scope:{packageId:'ielts'}, packageId:'cet4'}` ⇒ 以 `cet4` 为准。
  理由：平铺 = 就近的更具体意图，scope = 页面级默认作用域。
- `tags: []` 视为**不过滤**（与历史行为一致），判空用 `length`。
- `namespace` 过滤 = 包的 namespace 相等（每包唯一 ⇒ 最多命中一个包）。
- scope 缺省 = 空作用域 = 全库。

#### 9.3.3 Sort

```ts
type SortField = 'relevance' | 'word' | 'updated'
interface SortSpec { field?: SortField; order?: 'asc' | 'desc' }   // 默认 relevance / asc
```

**三条铁律（P1 分页正确性完全依赖它们）**：

| # | 铁律 | 违反后果 |
|---|---|---|
| S-1 | **排序必须在分页之前**（`sortRows` → `paginate`） | 先切页再排序 ⇒ 必然错页 |
| S-2 | **tie-break 组合必须唯一**：`(词形, packageLocalId, 包内序号)` | 同 key 行序由 sort 稳定性决定，换引擎就翻页重复 |
| S-3 | 同一 query 多次执行顺序**完全一致** | 翻页不重不漏的前提 |

- `desc` **只反转主序**，tie-break **恒升序**（否则确定性被破坏）。
- 字符串比较**不用 `localeCompare`**（各环境 ICU 数据不同 ⇒ 排序漂移 ⇒ 翻页错乱），只用 code unit。
- 未支持的类型：返回 `[]` / `count` 返回 `0`（诚实，不编造）。

#### 9.3.4 search 的相关性分组

rank `0` = 精确词形 > `1` = 前缀 > `2` = 释义/翻译命中。**组内**按 tie-break 升序。

#### 9.3.5 get 的大小写口径（🔴 曾经出过事故）

索引生成侧用**原词形**（保留大小写：`Oxford`、`Marxist`、`const [a, setA]`）。
若寻址侧用 lowercase 反查，会出现一批「search 查得到、get 取不回」的词 ——
全库 9346 条中实测 **93 条**命中；抽样看两个代码词库更集中：**go-code 41/50、ts-code 34/50**
（两个数字口径不同：93 是全库口径，41/34 是各包 50 条抽样口径，**不可相加**）。
后果是 Word Detail 接线当天大面积空白页。

因此：**① 先走 `findById(contentId)` 精确取，② 仅在未命中时才用 norm 兜底。**
该行为已由「全库 9346 条逐条自取回」回归断言锁定。

---

## 10. 已知限制（冻结 = 连同这些一起接受）

冻结不等于「完美」。以下限制是**已知的、有意为之的**，P1 必须知道它们的存在，
**但不允许偷偷绕过** —— 要改就走 §0 的变更流程。

| # | 限制 | 现状 | 正解 |
|---|---|---|---|
| L-1 | **`sort: 'updated'` 是退化语义** | 词表数据**没有**词级 `updatedAt` 字段，当前实际按「包内原始词序」排序（主序 = `packageLocalId` + 包内序号） | 数据接入后改为按时间戳；届时**必须**同步改 `sortRows` 注释与 `tests/content-query.mjs`【12】。**不要在此基础上编造「最近更新」语义** |
| L-2 | **`contentVersion` 不保证连续** | 回滚后新内容会跳号（实测 ver `1 → 4`） | 下游只用 checksum 判断内容身份，见 §4.3 |
| L-3 | **`relations.json` / `assets/` 尚无数据** | 门禁相应项打印「跳过」，不伪造通过 | P3 接入时必须同步补门禁断言 |
| L-4 | **近似重复只在 for-review 层** | car / automobile 这类语义近义**不做自动处理**，绝不自动删除任何词 | 只生成候选供人工 review |
| L-5 | **AssetManifest 未做** | `assets/manifest.json`（checksum / mime / bytes / duration / language / source / license / storage）尚未建模 | 推到 P3 |
| L-6 | **Learning 层未迁移**：`src/core/learning/model/learning-item.ts` 的 `LearningItem extends ContentRef` 已就位，但**运行时**学习记录仍是 `bankId + word` 键 | 残留位置实测：`src/App.tsx`、`src/components/Header.tsx`、`src/components/CommandPalette.tsx`、`src/data/wordBanks.ts`（⚠️ 注意：没有 `src/core/review/` 目录，别按旧说法去那里找） | P1.5 迁移到 ContentId |
| L-7 | **UI 尚未接 Query Layer 与 Catalog**：现有组件（HomePanel / PracticePanel / ReviewPanel / CommandPalette …）仍直读词表 | `getCatalog()` / `contentQuery.*` 已可用但零 UI 调用 | P1 直接接线，**不造新抽象 / 新目录 / 新 Repository / 新 Service** |

---

## 11. 不变式清单（Invariants）

这些已经被 `content:validate`（17 项 × 10 包）与 `test:content`（**148** 项）覆盖。
任何一条被打破 ⇒ CI 必须红。

| ID | 不变式 | 守护者 |
|---|---|---|
| I-1 | 每个包的 `packageId === 目录名` | validate #13 |
| I-2 | 每个包的 `namespace === parse(manifest.id).namespace` | validate #14 |
| I-3 | **namespace 两两不同** | validate #9 |
| I-4 | 包 ContentId 全局唯一 | validate #8 |
| I-5 | `contentChecksum === sha256Canonical(words)` | validate #15 |
| I-6 | `build.sourceChecksum === contentChecksum` | validate #17 |
| I-7 | `contentHistory` 非空，且存在 `checksum === contentChecksum` 的条目，其 `version === contentVersion`、`1 ≤ revision ≤ contentRevision` | validate #16 |
| I-8 | `schemaVersion === 4`、`contentVersion` 为正整数 | validate #10 / #11 |
| I-9 | `stats.items === words.length` | validate #5 |
| I-10 | 包内无 duplicate localId / duplicate normalized word | validate #4 / #12 |
| I-11 | 外部来源必须有 SPDX | validate #7 |
| I-12 | 词级 ContentId 全局唯一（跨包扫描） | validate #12(c) |
| I-13 | Query 层零直访 ContentIndex 内部 Map | test:content + code review |
| I-14 | 排序 deterministic：同一 query 多次执行顺序一致 | test:content【12】 |
| I-15 | 全库词条 **search 能查到 ⇒ get 能取回**（含大写词形） | test:content 逐条自取回归 |
| I-16 | 全库 10 包 Σ items = 基准数（当前 **9346**），变更需显式更新 | test:content【1】`全库 Σitems = 契约基准` |
| I-17 | `canonicalize` 对「同内容不同排版」输出一致，且**不重排数组** | canonical.selfCheck + test:content |
| I-18 | `findRevision` 与 `content:build` 回滚同口径（取 revision 最大的匹配条目） | test:content【13】 |

---

## 附：变更历史

| 版本 | 变更 | 日期 |
|---|---|---|
| V4.1-P0 | Content Model / Query Layer / Relation / ContentId 4 段式 | 2026-09 |
| V4.1-P0.5 | Catalog / Index / Asset Model / Normalize+Duplicate Detection / 统一 Query API | 2026-09-26 |
| **V4.1-P0.6** | contentChecksum（canonical）/ ContentSnapshot / Manifest 完整化 / Query Scope / Search Sort 契约 / Canonical JSON / 本文 —— **契约冻结** | 2026-09-26 |

冻结之后进入 **P1：词汇产品化**（Catalog → Package Explorer → Search → Word List → Word Detail → Start Learning）。
P1 的原则是**少做**：不造新的抽象 / 目录 / Framework / Repository / Service，
直接把已经存在的 Query Layer 接到 UI 上，让用户真正看到「词库 → 搜索 → 单词 → 学习」。
