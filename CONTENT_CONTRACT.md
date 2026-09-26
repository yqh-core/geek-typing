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
>
> ### 📌 变更记录：V4.1-P0.6.1（additive amendment，2026-09-26）
>
> 本版是 P0.6 冻结之后的**追加修订（只收口，不新增架构）**：只做**增补**与**事实订正**，
> **未改变 P0.6 已冻结的任何一条语义**（C-1~C-5、I-1~I-18、§1~§9 全部原样保留）。
>
> | 节 | 本轮动作 |
> |---|---|
> | §2.2 | 新增 **C-6**：词条 ContentId 的 lemma 保留原词形（id 侧禁止 lowercase） |
> | §10 L-6 | **事实订正**：Learning 运行时键不是 `bankId + word`，而是**裸 `word`**；补量化数字与不可逆信息损失 |
> | §10 L-7 | **事实订正**：补 P1 UI 边界实测（`?raw` 单点 / 17 处直读词数组 / Query·Catalog 零调用 / `hasFeature` 零调用） |
> | §11 | 新增 **I-19**（id 侧禁止 lowercase）、**I-20**（首屏体积不随词库增长） |
> | §12 | **新增**：P1 UI Contract（防腐层） |
> | §13 | **新增**：Content Loading Strategy（产品级约束 + 五条可验收阈值） |

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
| 12 | P1 UI Contract（防腐层） |
| 13 | Content Loading Strategy（产品级约束） |

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
| **C-6**（P0.6.1 新增） | 词条 ContentId 的 lemma **保留原词形**（一字不改） | 见下方「C-6 裁定」 |

### 2.3 C-6 裁定：id 侧保留原词形，lowercase 只允许出现在检索 key

> **C-6：词条 ContentId 的 lemma 保留原词形（一字不改）。**
>
> 理由：生成侧（`buildHits`）与寻址侧（`findById`）必须**逐字符同源**，
> 否则出现「search 查得到、get 取不回」。
> lowercase 只允许出现在**检索 key**（`normalizeWord`）里，**不允许出现在 id 里**。

背景（这是一个已被实测捕获的潜伏缺陷，不是理论风险）：

- `src/core/content/index/content-index.ts:61` 的 `buildHits()` 是**真正的 id 生成出口**，用的是**原词形**；
- `src/core/content/model/content.ts:70` 的 `wordId()` 内部曾自行 **lowercase**，与 `buildHits()` 不同源；
- 两者对全库 **93 条含大写词**（`Oxford`、`Marxist`、`const [a, setA]`）会生成**不同的 ContentId**；
- `wordId()` 在生产代码里**零调用**，但它经 `src/core/content/schema.ts:15` **对外 public 导出** ——
  P1 接线时谁用了它，这 93 条词的学习记录就**永远对不上索引**。

结论：

| 位置 | 口径 |
|---|---|
| id 生成 / 寻址（`buildHits` / `wordId` / `findById`） | **原词形，逐字符同源** |
| 检索 key（`normalizeWord` / duplicate detection / search 匹配） | 可以 lowercase |

> ⚠️ 本条与 §3.5 的旧表述「`wordId()` 内部自行 lowercase」冲突 ——
> **以 C-6 为准**：`wordId()` 与 `buildHits()` 现已统一为保留原词形。

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

- **不做 lowercase**：大小写是 vocabulary / code 词库的语义决策。`normalizeLocalId()` 本身不改大小写；
  `wordId()` 与 `buildHits()` 必须**同源、保留原词形**（见 C-6），lowercase 只允许出现在**检索 key**（`normalizeWord`）里。
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
| L-6 | **Learning 层未迁移**（P0.6.1 事实订正）：**运行时学习记录的键是裸 `word`，连包的信息都没有** —— 不是旧表述的 `bankId + word`。四层口径还各不相同（见下表） | 量化：全库 9346 词中**跨包同名词 2323 个**（同一词形出现在 ≥2 个包）、原词形**含大写 93 条**；**全仓不存在任何 `bankId + word` 拼接** | P1.5 迁移到 ContentId；迁移**存在不可逆信息损失**，按下方归属规则执行 |
| L-7 | **UI 尚未接 Query Layer 与 Catalog**：现有组件（HomePanel / PracticePanel / ReviewPanel / CommandPalette …）仍直读词表 | 实测：`?raw` 词表导入**全站只在 `src/core/content/registry.ts` 一处**（比旧描述好，UI 组件零直连）；但 UI 有 **17 处**直接持有词数组做操作；`contentQuery.*` / `getCatalog()` 在 UI 中调用数 **= 0**；`hasFeature()`（registry.ts:134）调用数 **= 0** | P1 直接接线，**不造新抽象 / 新目录 / 新 Repository / 新 Service**；边界见 §12 |

### 10.1 L-6 明细：四层 Learning 运行时键的真实口径

| key | 位置 | 每条记录的键 |
|---|---|---|
| `gt.review.v1` | `src/lib/reviewStore.ts:27`（写于 `:67` / `:88`） | **裸 `word`（原词形）**；`ReviewStore = Record<string, ReviewEntry>`（`:22`） |
| `gt.memorize.v1` | `src/lib/memorizeStore.ts:16`（写于 `:36`） | **裸 `word`（原词形）**；`MemStore = Record<string, MemRecord>`（`:14`） |
| `gt.analytics.v1` | `src/lib/analytics.ts:6`（写于 `:47`） | `.words` 子表键 = **`word.toLowerCase()`**（`:73`）—— 与前两层**口径还不一样** |
| `gt.customBanks.v1` | `src/lib/customBanks.ts:3` | 数组不是 map，词**没有 ContentId**；包 id 形如 `custom-<base36>`（`:28`） |

#### 🔴 不可逆信息损失（P1.5 必须知情）

旧学习记录**没有记包**，因此 2323 个跨包同名词**无法确定归属**。这不是实现难度问题，是**数据本身不存在** —— 迁移只能 best-effort：

| 情形 | 规则 |
|---|---|
| 该词形在全库**唯一命中** 1 个包 | ✅ **确定归属**，直接迁到该包 namespace 下的 ContentId |
| 命中 **≥2 个包** | ⚠️ best-effort 挂到用户当前 `gt.bank`，**并且必须在 UI 明示**（不许静默处理） |
| **0 命中**（词已从词库移除） | 保留为 **orphan** 记录，**不许静默丢弃**（丢弃 = 用户学习历史凭空消失） |

P1.5 开工前必须先在契约层确认这三档的 UI 表达方式，不允许在迁移脚本里偷偷选一档。

#### 🔴 契约漏洞：`gt.customBanks.v1` 没有 ContentId / namespace

自定义词库的词**没有 ContentId**，包 id 形如 `custom-<base36>`。
若把自定义词库登记进 registry，会**违反 I-3「namespace 两两不同」**（`custom-<base36>` 的 namespace 规则未定义）。

本轮**未在契约中给出最终规则**（属于新增语义，需走 §0 变更流程），只把问题钉在这里：
P1/P1.5 若要让自定义词库进入 Content 体系，**必须先在契约里规定 `custom-<id>` namespace 规则**，
否则 I-3 与 I-12（词级 ContentId 全局唯一）会同时被打穿。

---

## 11. 不变式清单（Invariants）

这些已经被 `content:validate`（**20** 项 × 10 包）、`test:content`（**148** 项）
以及构建后门禁 `check:bundle`（主 chunk 体积 / 预热预算）覆盖。
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
| **I-19**（P0.6.1） | **词条 ContentId 的 lemma 保留原词形**（`wordId` 与 `buildHits` 同源，**禁止在 id 侧 lowercase**） | `test:content` |
| **I-20**（P0.6.1） | **首屏体积不随词库增长**（主 chunk ≤ **420 KiB raw / 135 KiB gzip**；`offline.policy==='inline'` 的包 **Σ词 ≤ 1000 且 Σ words.json ≤ 64 KiB**） | `check:bundle` + `content:validate` 第 **19 / 21** 项 |

---

## 12. P1 UI Contract（防腐层）

> **这不是新增代码层，也不是新的 Framework —— 它是一条边界原则。**
> P1 接线时**不得**为此新建目录 / Repository / Service / hook 层；
> 本节只是把「UI 页面能用什么、不能碰什么」钉死。

### 12.1 UI 只允许使用三类 API

| 类别 | API |
|---|---|
| **Catalog API** | `getCatalog()` / `getPackageCatalog(localId)` |
| **Query API** | `contentQuery.search(opts)` / `contentQuery.list(opts)` / `contentQuery.get(contentId)` / `contentQuery.count(opts)` |
| **现有 Learning API** | 维持现状，不在 P1 重写 |

除这三类之外，UI 不得再开辟第四条访问 Content 的路径。

### 12.2 ❌ 禁止

| 禁止项 | 说明 |
|---|---|
| `import words.json` | **不论**是 `?raw` 还是经 `wordBanks` 转手，UI 一律不得直接引用词表文件 |
| 对词表数组做 `filter` / `map` / `sort` / `slice` | 这是 Query API 的职责；UI 自己做 = 分页 / 排序契约（S-1~S-3）当场失效 |
| 包名分支 `packageId === 'ielts'` / `bankId === 'cet4'` | 每加一个包就要改一次 UI，且必然漏改 |

> ✅ 好消息（实测）：**硬编码包名分支当前 = 0 处**，这一条目前是干净的，P1 只需保持。

### 12.3 ✅ 替代写法：按能力判断，不按包名

```ts
// ❌ 禁止
if (packageId === 'ielts') { showPhonetic() }

// ✅ 正确
if (hasFeature(packageId, 'phonetic')) { showPhonetic() }
```

⚠️ 实测 `hasFeature()`（`src/core/content/registry.ts:134`）当前**调用数 = 0** ——
契约要求的替代方案**还没接上**。P1 必须把它接上，而不是继续用别的判断方式。
已知需要用 `features` + `hasFeature()` 替换掉的位置：
`src/App.tsx:388` / `:396` / `:734` —— 这三处现在是**按用户开关 `gt.mode === 'code'`** 决定
大小写敏感 / 是否朗读，属于**包能力**，应由 manifest `features` 声明 + `hasFeature()` 判断。

### 12.4 唯一白名单：`types.Clear`（棘轮下降）

当前存量代码**暂时允许**保留 `types.Clear` 这一类直读词数组的写法 —— 理由是
**要保护 165 项 e2e 资产**，一次性清干净风险过大。

但白名单不是免死金牌，而是**棘轮（ratchet）**：

- 当前计数 = **基线**，由 `tests/ui-contract.mjs` 落盘锁定；
- **只许降，不许升** —— 任何让计数增加的 PR 直接 CI 红；
- 每次改动 UI 文件时顺手降一点，直到归零后删除白名单。

### 12.5 与 §13 的关系

**懒加载边界属于 §13，UI 不得破坏它。**
具体地说：UI 若在页面初始化时同步 `import` 任何 `words.json`、或把 lazy 包强制拉进主 chunk，
就是在破坏「首屏体积不随词库增长」（I-20）—— 由 `check:bundle` 直接判红。

### 12.6 实测基线（P0.6.1，供 P1 对照）

| 项 | 实测 |
|---|---|
| `?raw` 词表导入位置 | **全站仅 `src/core/content/registry.ts` 一处**（UI 组件零直连） |
| UI 直读词数组处数 | **17 处**（`src/App.tsx:191-199/231/232/241/251/253/569/572`、`src/components/ReviewPanel.tsx:46/47/50-55`、`src/components/Memorize.tsx:52-57/68/96/269`） |
| `contentQuery.*` / `getCatalog()` UI 调用数 | **0** |
| 硬编码包名分支 | **0 处** |
| `hasFeature()` 调用数 | **0** |

🔴 **最危险的一类（迁移时必须优先处理）**：
`src/App.tsx:253` 与 `src/components/ReviewPanel.tsx:47` 用了
`map.get(w) ?? { word: w, translation: '' }` **占位兜底** —— 取不到就**静默显示空释义**，
页面不报错、不空转，只是「悄悄少了一个词的释义」。这类缺陷在迁移期不可能靠肉眼发现。

---

## 13. Content Loading Strategy（产品级约束）

> **这一节是产品约束，不是性能建议。**
> 「用户加了 5 个大词库之后首屏变慢」不是优化项，是**违约**。

### 13.1 核心模型

```
Package = manifest.json（永远轻、常驻、O(包数)）  +  words.json（按需加载）
⇒ 首屏体积不随词库增长
```

manifest 只装元数据，**与词数无关**（实测单包 1.25–1.40 KiB，3000 词包与 20 词包一样大）。
因此：**包变多 ⇒ 主 chunk 只按包数线性增长；词变多 ⇒ 只要走 lazy，主 chunk 不动。**

### 13.2 当前实测（node zlib gzip level 9，与 vite 构建日志交叉核对）

| 项 | 实测值 |
|---|---|
| 首屏必须下载（index.html + 主 chunk + CSS，**不含 words chunk**） | **406.09 KiB raw / 125.21 KiB gzip** |
| 主 chunk `index-Cawl4_-q.js` | **381.06 KiB raw / 118.89 KiB gzip** |
| 3 个 lazy chunk | 464.04 / 471.22 / 471.76 KiB raw；163.12 / 166.96 / 166.95 KiB gzip |
| 10 个 manifest 总计 | **13.08 KiB raw / 2.21 KiB gzip**（单包 **1.25–1.40 KiB**，**与词数无关**） |

包分布：7 个 inline（`ai-core` / `cloud-native` / `frontend` / `cet4` / `cet6` / `ts-code` / `go-code`，
共 **346 词 / 37.15 KiB**）、3 个 lazy（`ielts` / `kaoyan` / `toefl`，各 **3000 词 / 约 471 KiB**）。

### 13.3 对照实验（硬证据：inline 是 1:1 全额传导，不是「大约」）

临时把 lazy 的 **kaoyan 改成 inline** 再 build（已还原）：

| 项 | 前 | 后 | 增量 |
|---|---|---|---|
| 主 chunk raw | 381.06 KiB | 852.97 KiB | **+471.92 KiB（+123.8%）** |
| 主 chunk gzip | 118.89 KiB | 285.30 KiB | **+166.41 KiB（+140.0%）** |
| words chunk 数 | 3 | 2 | −1 |

- 增量与 kaoyan `words.json` 的 **471.70 KiB** 呈**字节级 1:1.0005 全额传导** —— 词表一字节不落地进主 chunk；
- rolldown **当场报 `INEFFECTIVE_DYNAMIC_IMPORT` 警告**（见 13.6）。

第二组实验（把 7 个 inline 包词表临时清空再 build）：主 chunk 390.20 → 353.10 kB，
gzip 123.07 → 107.90 kB ⇒ **7 个 inline 词表占主 chunk 37.10 kB raw / 15.17 kB gzip**。

### 13.4 未来推算

**加 5 个大包（GRE 12000 / Oxford 30000 / Cambridge 20000 / 自建 5000 / TOEFL 10000 = 77000 词）全部 lazy：**

- 词数 **×9.2**；
- 主 chunk raw 只 **+6.55 KiB（+1.7%）**、gzip 只 **+1.11 KiB（+0.9%）**；
- ⇒ **主 chunk 是 O(包数) 而非 O(词数)**，本节约束成立。

**反之任一大包做成 inline 的外推**（实测系数 **157.3 KiB/千词 raw、55.5 KiB/千词 gzip**）：

| 包 | 主 chunk gzip 变成 |
|---|---|
| 自建 5000 词 | 397 KiB（**×3.3**） |
| GRE 12000 词 | 785 KiB（**×5.9**） |
| Oxford 30000 词 | **1854 KiB（×13.4）** |

### 13.5 五条可验收阈值

| # | 断言 | 阈值 | 当前实测 | 余量 |
|---|---|---|---|---|
| 18 | manifest 体积：单包 < **8 KiB**，全库 < **40 KiB** | 8 / 40 KiB | 最大 **1.40** / 总 **13.08 KiB** | 不红（**5.7× / 3.1×**） |
| 19 | inline 预算：`offline.policy==='inline'` 的包 **Σ词 ≤ 1000** 且 **Σ words.json ≤ 64 KiB** | 1000 词 / 64 KiB | **346 词 / 37.15 KiB** | 不红 |
| 20 | 策略一致性：manifest 的 `offline.policy` 必须与 `registry.ts` 实际加载方式一致（`words:` ↔ inline，`load:` ↔ lazy） | 10/10 | **10/10** | 不红 |
| 21 | 主 chunk 体积：raw ≤ **420 KiB** 且 gzip ≤ **135 KiB** | 420 / 135 KiB | **381.06 / 118.89 KiB** | 不红（**10.2% / 12.0%**） |
| 22 | 预热预算：被 `warmUpVocabulary` 列入的包 gzip 总量 ≤ **600 KiB** | 600 KiB | **497.03 KiB** | 不红（余量仅 **17%**，最紧） |

第 **18 / 19 / 20** 项由 `content:validate` 守护（门禁从 17 项扩到 **20** 项）；
第 **21 / 22** 项是**构建后检查**，由 `check:bundle` 守护，**不属于 `content:validate`**。

> **第 21 条阈值的设计意图**（别误读）：它是为**抓 inline 误用**设计的，**不是抓 lazy 增长**。
> - 加 5 个 lazy 包 ⇒ 主 chunk 只到 **387.6 KiB**，**仍在阈值内**（正确行为，不该红）；
> - inline 一个 **500 词的小包** ⇒ **+78 KiB**，**立刻撞线**（错误行为，必须红）。
>
> 所以第 21 条红了，第一反应应该是「谁把词表做成 inline 了」，而不是「词太多了」。

### 13.6 免费检测信号

构建器自带的 `INEFFECTIVE_DYNAMIC_IMPORT` 警告 = **有人把一个本该 lazy 的包写成了 static import**。
它在本轮对照实验中**当场触发**，零成本。**看到这条警告必须当缺陷处理，不许忽略。**

### 13.7 🔴 已知限制 / 待办：预热预算是最薄弱的一环

`warmUpVocabulary()`（`src/core/content/registry.ts:139-141`）当前**硬编码全量预热 3 个 lazy 包
= 497.03 KiB gzip**，且有两个方向相反的失效模式：

- **加包时不会自动加入** ⇒ 漏预热 ⇒ **首次离线切库失败**（用户离线状态下切到新包直接打不开）；
- **手动加入又没有上限** ⇒ 流量**随包数线性膨胀**（现在 3 个包就已吃掉 600 KiB 预算的 83%）。

**本轮未解决**（只做收口，不改架构）。记录待办：

> 在新增 GRE / Oxford 之前，必须先把 `warmUpVocabulary()` 从「全量 `allSettled`」改成
> **「按需 + 限量」**（例如只预热当前包 + 最近使用的 N 个包，或按 600 KiB 预算截断）。
> 否则包一多，必然二选一地踩中上面两个坑。

---

## 附：变更历史

| 版本 | 变更 | 日期 |
|---|---|---|
| V4.1-P0 | Content Model / Query Layer / Relation / ContentId 4 段式 | 2026-09 |
| V4.1-P0.5 | Catalog / Index / Asset Model / Normalize+Duplicate Detection / 统一 Query API | 2026-09-26 |
| **V4.1-P0.6** | contentChecksum（canonical）/ ContentSnapshot / Manifest 完整化 / Query Scope / Search Sort 契约 / Canonical JSON / 本文 —— **契约冻结** | 2026-09-26 |
| **V4.1-P0.6.1** | **只收口**：C-6（id 侧保留原词形）/ L-6·L-7 事实订正 / §12 P1 UI Contract / §13 Content Loading Strategy + 五条阈值 / I-19·I-20 —— **additive amendment，未改变 P0.6 任何已冻结语义** | 2026-09-26 |

---

## 下一步

**P0.6.1 已完成收口**：Content 契约在 P0.6 冻结之后，本轮只补齐了影响 P1 的边界
（id 大小写裁定、Learning 迁移的信息损失、UI 防腐层、加载策略产品级约束），
**没有新增架构、没有重构**。

下一步进入 **P1：词汇产品化**（Catalog → Package Explorer → Search → Word List → Word Detail → Start Learning）。
P1 的原则是**少做**：不造新的抽象 / 目录 / Framework / Repository / Service，
直接把已经存在的 Query Layer 接到 UI 上，让用户真正看到「词库 → 搜索 → 单词 → 学习」。

### 🔒 P1 的一句话原则（用户原话，照此执行）

> **「现在千万不要再优化 ContentIndex、不要再设计 Repository、不要再拆 Service、不要再增加 Framework。」**

P1 要做的只有一件事：**接线**。任何「顺手优化一下 ContentIndex / 抽个 Repository 出来会更干净」
的冲动，都是在给 Content 契约制造新的漂移点。
