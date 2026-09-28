# 内容类型（CONTENT_TYPES）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`vocabulary`（包级）与 `word`（条目级）—— 唯一有数据落地的类型
> 📐 **待建**：其余 10 个类型 —— 仅有类型槽位定义，零数据、零实现
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27

---

## 1. 类型总表

`ContentType` 全集定义在 `src/core/content/model/content.ts:34-46`：

```ts
export type ContentType =
  | 'vocabulary' | 'word' | 'topic' | 'listening' | 'audio'
  | 'reading' | 'writing' | 'speaking' | 'grammar'
  | 'document' | 'collection' | 'exercise'
```

**共 12 个取值**。逐个核对落地状态：

| # | 类型 | 状态 | 数据落点 | 证据 |
|---|---|---|---|---|
| 1 | `vocabulary` | ✅ **已有** | `content/vocabulary/<id>/{manifest,words}.json` × 10 包 | `registry.ts:58-69` |
| 2 | `word` | ✅ **已有**（条目级） | 无独立文件；由 `words.json` 词条派生 | `content-index.ts:51-70` |
| 3 | `topic` | 📐 待建 | 无目录，无数据 | — |
| 4 | `listening` | 📐 待建 | 无目录，无数据 | — |
| 5 | `audio` | 📐 待建 | 无目录，无数据 | — |
| 6 | `reading` | 📐 待建 | 无目录，无数据 | — |
| 7 | `writing` | 📐 待建 | 无目录，无数据 | — |
| 8 | `speaking` | 📐 待建 | 无目录，无数据 | — |
| 9 | `grammar` | 📐 待建 | 无目录，无数据 | — |
| 10 | `document` | 📐 待建 | 无目录，无数据 | — |
| 11 | `collection` | 📐 待建 | 无目录，无数据 | — |
| 12 | `exercise` | 📐 待建 | 无目录，无数据 | — |

**落地率：2 / 12（16.7%）**。
若只算「内容品类」（不计地址 `topics` 与条目级的 `word`），则是 **1 / 11**。

---

## 2. ✅ `vocabulary` —— 唯一有品类数据落地的类型

### 2.1 目录契约

```
content/vocabulary/<packageId>/manifest.json     必需
content/vocabulary/<packageId>/words.json        必需
content/vocabulary/<packageId>/relations.json    可选（当前无包产出）
```

`content/README.md:67` 给出目录形态定义。约定（`content/README.md:71-75`）：

> 新增内容类型时平级加目录：`content/audio/`、`content/reading/`、`content/topic/`。
>
> ⚠️ `content/assets/` 目前**并不存在**（本目录下只有 `README.md` 与 `vocabulary/`）。

### 2.2 全部 10 个包的实测清单

数据源：`content-samples/MANIFESTS.md`（由 `extract-samples.mjs` 从实际 JSON 读出）。

| 包目录名 | ContentId | 词数 | policy | exam | features |
|---|---|---|---|---|---|
| `ai-core` | `content:vocabulary:curated-ai-core:ai-core` | 43 | inline | — | `{phonetic:false, definition:false}` |
| `cet4` | `content:vocabulary:ecdict-cet4:cet4` | 84 | inline | `CET-4` | `{phonetic:true, definition:true}` |
| `cet6` | `content:vocabulary:ecdict-cet6:cet6` | 69 | inline | `CET-6` | `{phonetic:true, definition:true}` |
| `cloud-native` | `content:vocabulary:curated-cloud-native:cloud-native` | 30 | inline | — | `{phonetic:false, definition:false}` |
| `frontend` | `content:vocabulary:curated-frontend:frontend` | 20 | inline | — | `{phonetic:false, definition:false}` |
| `go-code` | `content:vocabulary:curated-go-code:go-code` | 50 | inline | — | `{phonetic:false, definition:false}` |
| `ielts` | `content:vocabulary:ecdict-ielts:ielts` | 3000 | lazy | `IELTS` | `{phonetic:true, definition:true}` |
| `kaoyan` | `content:vocabulary:ecdict-kaoyan:kaoyan` | 3000 | lazy | `考研` | `{phonetic:true, definition:true}` |
| `toefl` | `content:vocabulary:ecdict-toefl:toefl` | 3000 | lazy | `TOEFL` | `{phonetic:true, definition:true}` |
| `ts-code` | `content:vocabulary:curated-ts-code:ts-code` | 50 | inline | — | `{phonetic:false, definition:false}` |
| | | **9346** | inline 7 / lazy 3 | 5 个有 exam | 5 true / 5 false |

**注册表顺序**（`registry.ts:58-69`，即 UI 下拉序）：

```
ai-core, cloud-native, frontend, cet4, cet6, ielts(load), kaoyan(load), toefl(load), ts-code, go-code
```

注意：注册顺序与目录名的字典序**不同**（`ielts/kaoyan/toefl` 被排在 `cet6` 之后），
因为该顺序是产品排序（小库在前、大库在中、代码库在后），不是文件系统顺序。

### 2.3 「类型」在代码里的表达

`vocabulary` 类型在代码中有**三处**物理表达，必须三者一致：

| 表达 | 位置 | 门禁 |
|---|---|---|
| 目录名 | `content/vocabulary/<id>/` | validate #13 |
| `manifest.packageId` | manifest 字段 | validate #13（必须 === 目录名） |
| ContentId 第 4 段 | `manifest.id` | validate #3（必须以 `:${目录名}` 结尾） |

这就是契约 §3.1 的「一词三表」：

> 定义 = `content/vocabulary/<packageId>` 的**目录名**。
> 同时是 UI 路由段、**持久化键**、CLI 参数。三者必须同一个字符串。

---

## 3. ✅ `word` —— 条目级类型

`word` 不是「包」，是**包内的条目**。它在架构中的位置与 `vocabulary` 不同：

| | `vocabulary` | `word` |
|---|---|---|
| 聚合层级 | 包（Package） | 条目（Item） |
| 有独立文件 | 有（`manifest.json` + `words.json`） | 无（在 `words.json` 数组内） |
| 有 contentHistory | 有（在 manifest 中） | 无 |
| 有 namespace 条目 | 有（`manifest.namespace`） | 借用所属包的 namespace |
| ContentId 形态 | `content:vocabulary:<ns>:<包id>` | `content:word:<包ns>:<词形>` |
| 在 Catalog 里 | 有（`CatalogPackageEntry`） | **无** |
| 在 Index 里 | 有（`byPackage`） | 有（`byId` / `byWord` / `byTag`） |
| UI 可检索 | — | ✅（`SUPPORTED_TYPES = ['word']`） |

`catalog.ts:51` 明确 `word` **不在目录的类型维度里列出**：

> `'word'` 是条目级类型（词条不属于任何包的子类型），故不在目录的类型维度里列出。

`SUPPORTED_TYPES`（`content-query.ts:133`）：

```ts
const SUPPORTED_TYPES: ContentType[] = ['word']
```

→ **当前唯一可检索的类型是 `word`**。`resolveTypes()`（`:143-146`）对不支持的类型返回空数组，
`search` / `list` / `get` / `count` 一律返回空结果。

---

## 4. 📐 `PLANNED_TYPES` —— 11 个规划槽位

定义在 `src/core/content/catalog/catalog.ts:52-64`：

```ts
const PLANNED_TYPES = [
  'vocabulary', 'listening', 'reading', 'audio', 'topic',
  'exercise', 'writing', 'speaking', 'grammar', 'document', 'collection',
]
```

**注意：这是 11 项，`ContentType` 是 12 项。**
差的一项就是 `word` —— 理由见 `catalog.ts:51`（条目级类型不进目录）。

### 4.1 槽位的作用

`getCatalog()`（`catalog.ts:80-97`）先用 `PLANNED_TYPES` 初始化所有类型为 `packages:0 / items:0`，
再把已注册的包累加进去：

```ts
for (const t of PLANNED_TYPES) byType.set(t, { type: t, packages: 0, items: 0 })
for (const p of pkgs) { cur.packages += 1; cur.items += p.manifest.stats.items; ... }
```

设计意图（`catalog.ts:9-12`）：

> **未接入的内容类型一律返回 packages=0 / items=0，不许编造数字**。
> listening / audio / reading / topic / exercise 目前只是规划槽位，数据接入后
> （放进 `content/<type>/<id>/manifest.json` 并在 registry 登记）会自动出现在 types 里，
> **本文件无需改动**。

→ 这是一个**自动扩展**的设计：新类型接入时 Catalog 无需改动。

### 4.2 实测输出（当前）

`getCatalog()` 的实际返回（10 个包已注册）：

| type | packages | items |
|---|---|---|
| `vocabulary` | **10** | **9346** |
| `listening` | 0 | 0 |
| `reading` | 0 | 0 |
| `audio` | 0 | 0 |
| `topic` | 0 | 0 |
| `exercise` | 0 | 0 |
| `writing` | 0 | 0 |
| `speaking` | 0 | 0 |
| `grammar` | 0 | 0 |
| `document` | 0 | 0 |
| `collection` | 0 | 0 |

`totalItems = 9346`。

### 4.3 各规划类型的特有字段（契约 §6 已定义，未实现）

契约 `:227-233` 给出各类型的 payload 字段设计：

| 类型 | 特有字段 |
|---|---|
| Vocabulary | word / phonetic / definition / examples |
| Audio | audioUrl / duration / transcript / segments / speaker / difficulty |
| Reading | title / body / paragraphs / questions / answers |
| Topic | title / description / children |
| Exercise | prompts / options / answer / explanation |

契约 §6 的核心原则（`:224-225`）：

> 真正必须统一的是 **Identity / Metadata / Source / License / Version / Relation / Query**，
> 不是 payload。各类型有自己的字段。
> ……不要为了「统一」让所有类型共享同一套 payload。

### 4.4 各类型在 Registry 里的接口预留

`registry.ts:122-126` 的 `listContent(type)`：

```ts
export function listContent(type: string): PackageManifest[] {
  if (type !== 'vocabulary') return []
  return packages.map((p) => p.manifest)
}
```

注释（`:122`）：「按类型列出内容包清单（**listening 等类型当前为空数组**）」。

`registry.ts:105-120` 的 `getContent(contentId)`：

```ts
if (parsed.type === 'word') { ... }   // 仅 word 类型可解析
return null                            // 其余类型返回 null
```

注释（`:105`）：「ContentId → 单条内容（**当前仅 word 类型可解析；其余类型待内容接入后扩展**）」。

→ **接口形态已为多类型预留，实现上只开通了 `word`。**

---

## 5. 类型相关的架构约束

### 5.1 统一入口原则（不新增散装 API）

`content-query.ts:11-15` 原文：

> ⚠️ **统一入口原则（写死，别再破例）**：
> 新增内容类型（topic / audio / listening ...）时，在 search/list/get/count 内部扩展分支，
> **禁止**再出现 `searchTopics()` / `searchAudios()` / `listListening()` 这类散装 API。
> 散装 API 每加一类就翻一倍，是上一代代码最贵的债。

### 5.2 索引维度扩展点

`content-index.ts:12-13`：

> 当前只索引 word 类型。**新内容类型接入时在此扩展索引维度**（byTag 的词级 tag、
> byAudio 等），而不是新增散装 API —— 否则又回到「每加一类就多一套查询函数」的老路。

`byTag` 当前取的是**包级** `manifest.tags`（`content-index.ts:108`、`:31`）：

```ts
for (const tag of pkg.manifest.tags) push(index.byTag, tag, hit.id)
```

词级 tag 待数据接入后扩展。

### 5.3 关系端点类型约束

`relation/relation.ts:54-61` 的 `RELATION_TARGET_TYPES` 已为未来类型定义端点约束：

```ts
belongs_to:  ['vocabulary', 'topic', 'collection']
contains:    ['word', 'audio', 'document', 'exercise']
related_to:  ['word', 'topic']
prerequisite:['word', 'topic']
appears_in:  ['audio', 'document', 'listening', 'reading']
same_as:     ['word']
```

该表**只约束 Content Relation**，不用于 Learning Relation（`relation.ts:51-53`）。

### 5.4 normalize 的类型特例

`vocabulary` 类型中，代码词库（`ts-code` / `go-code`）需要 `manifest.normalize.stripHtml: false`
（`normalize.mjs:14-18`）。若未来接入 `document`（含 HTML 正文）等类型，
这个开关的语义需要重新界定 —— 当前契约只针对词条文本。

---

## 6. 建议方向（标注为「建议」）

> 以下为审计建议，**不是项目已承诺的路线**。

1. **先定 Asset，再定 media 类型**：`audio` / `listening` / `reading` 都强依赖资产定位，
   而 `AssetManifest` 推到 P3（契约 §10 L-5）。建议 Asset 契约先行，
   否则 media 类型的 manifest 会与 `assets/manifest.json` 抢字段。
2. **`topic` 可能应优先于 `audio`**：`relation.ts:56-59` 里 `belongs_to` / `related_to` /
   `prerequisite` 的端点都包含 `topic`。若先做 audio，关系图会缺一类节点。
3. **类型不必一次全开**：`PLANNED_TYPES` 是展示槽位而非承诺清单。
   建议按「有真实数据可接」的顺序推进，而不是按 `ContentType` 的声明顺序。
4. **`SUPPORTED_TYPES` 是唯一闸门**：新增类型时必须同步修改
   `content-query.ts:133`，否则 query 层会静默返回空结果（当前设计如此，符合诚实原则）。

---

## 7. 一句话结论

> ContentType 声明了 **12 个取值**，但**只有 `vocabulary`（10 包 / 9346 词）与它派生的
> `word` 有真实数据**。其余 10 个类型在 `PLANNED_TYPES` 里作为目录槽位存在
> （返回 `packages:0 / items:0`，不编造数字），
> 在 `RELATION_TARGET_TYPES` 与 `listContent` / `getContent` 里都有接口预留，
> 但**零数据、零实现**。落地率 2/12。
