# Content Layer —— 内容层契约（V4.1-P0.6.1）

本目录是 **Content 层**的唯一数据根目录。它只描述「内容是什么」，
**不随任何用户改变**：导入新词库、新增内容类型，都不得污染用户学习记录。

> **本文件是操作手册**（怎么用 / 踩坑史 / CLI）。
> 「什么不可变」写在根目录的 `CONTENT_CONTRACT.md`，**两者冲突以契约为准**并立即修本文件。
> V4.1-P0.6.1 是 P0.6 冻结后的**追加收口**（只增补与订正，未改变 P0.6 任何已冻结语义）。

## 本轮（V4.1-P0.6 · Foundation / Contract Hardening）做了什么

P0.6 不新增功能，只把地基钉死 —— 7 件事，全部已落地并通过实测
（`content:validate` 17 项门禁全绿、`test:content` **148** 项通过、`tsc` 0 错、全库 Σ items = 9346）：

| # | 事项 | 落点 |
|---|---|---|
| 1 | `contentChecksum` —— 内容的确定性身份（canonical SHA-256） | `scripts/content/canonical.mjs`、`validate` 第 15 项 |
| 2 | `ContentSnapshot` —— 「学到的是哪个实体的哪个快照」有了类型承载 | `src/core/content/model/snapshot.ts` |
| 3 | Manifest 完整化 —— `packageId` / `namespace` / 版本三元组 / `contentHistory` / `build` | `src/core/content/schema.ts` |
| 4 | Query Scope —— 页面级作用域统一描述，不再各页各拼一套过滤条件 | `resolveScope()` |
| 5 | Search Sort 契约 —— 排序在分页之前、tie-break 唯一 ⇒ 翻页不重不漏 | `sortRows()` / `paginate()` |
| 6 | Canonical JSON —— 序列化与指纹收敛到唯一实现，与文件排版无关 | `scripts/content/canonical.mjs` |
| 7 | `CONTENT_CONTRACT.md` —— 契约外置成独立文档 | 见第 17 节 |

> **⚠️ P0.6 之后 Content 契约冻结。** 从 P1 起，Content 层不再因为「UI 方便」而改形状；
> 确需变更走第 17 节的流程。

### 追加：V4.1-P0.6.1（只收口，不新增架构）

| # | 事项 | 落点 |
|---|---|---|
| 1 | **C-6**：词条 ContentId 的 lemma **保留原词形**（id 侧禁止 lowercase，`wordId` 与 `buildHits` 同源） | 契约 §2.3 / I-19 |
| 2 | **L-6 事实订正**：Learning 运行时键是**裸 `word`**（不是 `bankId + word`），四层口径还各不相同 | 契约 §10.1 |
| 3 | **L-7 事实订正**：`?raw` 全站只在 registry 一处；UI 17 处直读词数组；Query/Catalog/`hasFeature` UI 调用数均为 0 | 契约 §10 / §12.6 |
| 4 | **§12 P1 UI Contract（防腐层）**：UI 只用 Catalog / Query / 现有 Learning 三类 API | 契约 §12 |
| 5 | **§13 Content Loading Strategy**：Package = 轻 manifest（常驻）+ 按需 words.json ⇒ 首屏体积不随词库增长 | 契约 §13、本文件第 15 节 |

---

## 0. Architecture Principles（先读这 10 条，代码会过时，这些不会）

1. Content is immutable from the user's perspective.（内容不随用户改变）
2. Learning never owns content.（学习状态永不倒灌进 content/）
3. User data never enters `content/`.
4. ContentId is globally unique **and stable**.（唯一 + 稳定，两个要求）
5. Package is a **delivery** boundary, not a learning boundary.
6. Asset is separate from Content.（Content ≠ File）
7. Query Layer is the only UI access path.（UI 禁止直接持有词表做 filter）
8. Content version must not silently change learning history.（版本变化必须可解释）
9. Every imported content must be reproducible.（完整 checksum + 来源溯源）
10. Every Content schema change must be migration-safe.（schemaVersion 与 contentVersion 分离）

---

## 1. 三层边界

| 层 | 存放 | 键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**`（本目录） | ContentId（+ contentVersion + checksum） | 随版本发布 |
| **Learning** | `src/core/learning/model/`（LocalStorage / 未来 IndexedDB） | contentId + contentVersion + checksum | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

## 2. 目录结构

```
content/                     内容（是什么）
└── vocabulary/<包 id>/{manifest.json, words.json, relations.json?}
assets/                      资产（文件在哪）—— Content ≠ File（**规划中，尚未建目录**）
└── audio|image|document|subtitle/...
```

新增内容类型时平级加目录：`content/audio/`、`content/reading/`、`content/topic/`。

> ⚠️ `content/assets/` 目前**并不存在**（本目录下只有 `README.md` 与 `vocabulary/`）。
> 上面那棵是规划形态。资产相关门禁因此恒打印「跳过」（当前 10 个包无 `manifest.assets` 字段）。

## 3. ContentId —— 4 段式

```
content:<type>:<namespace>:<localId>
content:vocabulary:ecdict-ielts:ielts        词汇包（Package Content Entity）
content:word:ecdict-ielts:abandon            包内词条（Word Content Entity）
content:topic:curated-ielts:environment      主题（未来）
content:audio:curated-ielts:listening-test-01  音频（未来）
```

> ⚠️ 未来类型也要守 namespace 规则 `${来源族}-${包 id}`。旧写法 `content:topic:ielts:environment`
> 拿包 id 当 namespace，会撞 namespace —— 不要照抄。

**① namespace 必须每包唯一**，规则 = `${来源族}-${包 id}`（`ecdict-ielts`、`curated-ai-core`）。
词级 localId 只有词形、不含包 id，所以「各包 namespace 互不相同」是**词级 ContentId 全局唯一的充要条件**。
（踩坑史：早期用来源族 `ecdict` 当 namespace，cet4/toefl/ielts 共用 → `content:word:ecdict:abandon` 三包撞车，
学习记录主键污染。由 `tests/content-query.mjs` 实测捕获，现为 validate 第 9 项门禁。）

**② localId 稳定性契约**：由 `normalizeLocalId()` 生成（NFC → trim → 空白折叠 → 去控制字符 → `:` `/` 换 `-`；
lowercase 由 vocabulary 侧决定，code 词库大小写敏感）。
- localId **一旦发布，不因展示文本变化而修改**；
- 同词多义用后缀区分：`run` / `run-2`，或 `run-v1` / `run-n1`（规范先写死，实现待需）；
- 是否已是规范形态由 `isStableLocalId()` 判定（非空 + 幂等 + 无 `:` `/` + 无控制字符）。

**③ 跨包同词是合法数据关系**（IELTS/CET/TOEFL 各有 abandon），消歧靠 namespace，
*不是*靠禁止同词。任何「跨包词唯一」的约束都是错的。

**④ ContentId 与 PackageId 是两个实体**：

| | Package | Word |
|---|---|---|
| 身份 | `{packageId: ielts, namespace: ecdict-ielts, type: vocabulary}` | `{namespace: ecdict-ielts, localId: abandon}` |
| ContentId | `content:vocabulary:ecdict-ielts:ielts` | `content:word:ecdict-ielts:abandon` |

不要因为 namespace 长得像就把两个概念绑在一起 —— Topic/Audio/Reading 接入后会越来越容易混。

## 4. Content Version —— 三元组（revision / version / checksum）

旧口径只讲「schemaVersion + contentVersion」两个字段，P0.6 起不成立。现在是**三元组 + 结构版本**：

| 字段 | 语义 | 怎么变 | 参与相等性判断 | 落盘 |
|---|---|---|---|---|
| `schemaVersion` | **结构**版本（当前 4）。schema 破坏性变更才递增 | 常量，由 build 写入 | 否（只说明快照的形状） | `manifest.schemaVersion` |
| `contentRevision` | **单调递增审计号**：这个包一共被构建过多少次 | 每次构建 +1，**回滚也不回头** | **否**（只回答次数） | `manifest.contentRevision` |
| `contentVersion` | **对外学习契约版本**：第几代内容 | 新内容 +1；**同一 checksum 复用同一 version**（回滚即回到历史值） | 是 | `manifest.contentVersion` |
| `contentChecksum` | 规范化内容的 canonical SHA-256：**内容的确定性身份** | 内容变则变 | 是 | `manifest.contentChecksum` |

为什么要拆成三个数：旧模型里 `contentVersion` 是「checksum 变化就 +1」的单调计数器，它是**状态**而不是
内容的确定性身份 —— 把 words.json 回滚到上一版再 build，version 会白白 +1，于是「回滚后的内容」和
「从未发布过的新内容」在版本号上无法区分。

### 铁律 ①：version 不保证连续

新内容出现时 revision 与 version 同步 +1；但**回滚后再来新内容会跳号**（实测出现过 `version 1 → 4`）。
因此下游：

- 禁止假设 `version_n = version_{n-1} + 1`；
- 禁止拿 version 当数组下标、当进度条、当「差几个版本」的算术量；
- 想知道「构建过多少次」用 `contentRevision`，想知道「是不是同一份内容」用 `contentChecksum`。

### 铁律 ②：version 不能承担 checksum 的职责

`version` 是**对外契约号**，语义是「第几代」，天然可被两个不同内容共用（A 包第 3 代与 B 包第 3 代都是 3）。
只有 checksum 能回答「这是不是同一份内容」。

> 判断「同一个快照」必须 **contentId + contentVersion + checksum 三者全等**
> （`isSameSnapshot()`，缺任一即为「不同」—— 宁可判"不同"触发重新学习，也不要误判"相同"跳过复习）。

### 「学到的是哪个快照」由 ContentSnapshot 承载

定义见 `src/core/content/model/snapshot.ts`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `contentId` | `string` | 哪个实体（4 段式 ContentId） |
| `contentVersion` | `number` | 该实体的哪个内容快照（对外契约版本） |
| `checksum` | `string` | 该快照的确定性身份（canonical SHA-256） |
| `schemaVersion` | `number` | 写入快照时刻的结构形状，便于跨 schema 迁移判断 |
| `publishedAt?` | `string` | 该快照的发布时间（ISO date） |

配套：

| API | 作用 |
|---|---|
| `snapshotOf(contentId, { version, checksum, publishedAt? }, schemaVersion = 4)` | 构造快照 |
| `isSameSnapshot(a, b)` | 三者全等才算同一份；任一侧 `null`/`undefined` 即 false |
| `findRevision(history, checksum)` | 在修订历史里按 checksum 反查 `(revision, version)`；查不到 = 全新内容 |

修订历史条目 `ContentRevisionEntry { revision, version, checksum, publishedAt? }` 按 revision 升序落在
`manifest.contentHistory[]`，是回滚时把 checksum 还原成 `(revision, version)` 的唯一依据。
聚合形态 `ContentVersionInfo { revision, version, checksum, publishedAt?, history[] }`。

**绝不把版本塞进 ContentId**（否则每次修订都换主键，学习记录全部失联）。学习记录记的是：

```jsonc
{
  "contentId": "content:word:ecdict-ielts:abandon",
  "contentVersion": 2,
  "checksum": "sha256:bc6c8ee5…",
  "state": {}
}
```

职责划分：ContentId = 是哪个实体；`contentVersion` + `checksum` = 学的是该实体的哪个快照；Learning = 学到什么程度。

## 5. Canonical JSON —— checksum 的唯一算法

`scripts/content/canonical.mjs`。**它存在的目的**：让 checksum 只取决于**数据语义**，与文件排版无关 ——
同一份数据，缩进 / 键序 / 换行不同，指纹必须相同。否则「格式化了一下 words.json」会被误判成
「内容变了」，进而污染 `contentVersion`、触发缓存全量失效。

规则（照抄实现，别凭记忆写）：

| # | 规则 |
|---|---|
| 1 | 对象键按**白名单序**：`word → translation → phonetic → definition → partOfSpeech`；白名单外的未知键按 **UTF-16 字典序**（与 locale 无关）排在白名单键之后 —— 既不丢字段，也不因 JS 插入序漂移 |
| 2 | 值为 `undefined` 的键**省略**；`null` **保留**（`"exam": null` 是有语义的取值） |
| 3 | **数组绝不重排**（铁律 1）：只做「逐元素 canonicalize + 逗号拼接」，禁止排序 / 去重 / 过滤 |
| 4 | 字符串用 `JSON.stringify` 标准转义，**Unicode 原样输出**（不转成 `\uXXXX`）；仅孤立代理项（lone surrogate）按 ES2019 well-formed 转义 |
| 5 | 数字原样输出（不补零、不转科学计数）；`NaN` / `Infinity` 按 JSON 语义退化为 `null` |
| 6 | 紧凑输出：无缩进、无空格；`canonicalize()` 结果**不含尾随换行**；落盘用 `canonicalFile()` 补一个 `\n`（POSIX 惯例，避免 diff 出现 `\ No newline`），**checksum 不含这个换行** |

指纹：`sha256Canonical(value) = 'sha256:' + hex(sha256(canonicalize(value)))`。

**为什么「数组不重排」是硬规矩**：词表顺序 = 产品语义（词频序 / 教材序 / 难度梯度），
重排等于改数据。谁为了「规范化」把词表排序了，就是在悄悄改产品。

幂等性（可复现的前提）：`canonicalize(JSON.parse(canonicalize(x))) === canonicalize(x)`。
自检可直接跑 `node scripts/content/canonical.mjs`，输出：

```
canonicalize  : {"word":"abandon","translation":"放弃","phonetic":"ə'bændən","definition":"放弃；抛弃"}
canonicalFile : {"word":"abandon","translation":"放弃","phonetic":"ə'bændən","definition":"放弃；抛弃"}
sha256Canonical: sha256:32121aa542d14e37bd3da1d4eca6c89fbeed4ac861a6cec41ce4332fbf17b7dc
[canonical] selfCheck PASS（幂等 + 数组不重排 + 指纹与排版无关）
```

（`canonicalFile` 那一行比 `canonicalize` 多一个尾随 `\n` —— 落盘用，不进指纹。）

数组不重排的自检断言长这样，别改：

```js
canonicalize([{ word: 'z' }, { word: 'a' }]) === '[{"word":"z"},{"word":"a"}]'
```

## 6. 内容类型：统一「身份与元数据」，不统一业务字段

真正必须统一的是 **Identity / Metadata / Source / License / Version / Relation / Query**，
不是 payload。各类型有自己的字段：

| 类型 | 特有字段 |
|---|---|
| Vocabulary | word / phonetic / definition / examples / partOfSpeech |
| Audio | audioUrl / duration / transcript / segments / speaker / difficulty |
| Reading | title / body / paragraphs / questions / answers |
| Topic | title / description / children |
| Exercise | prompts / options / answer / explanation |

不要为了「统一」让所有类型共享同一套 payload。

## 7. Asset —— Content ≠ File

`AssetRef { assetId, kind, url, mime?, bytes?, checksum?, license? }`，`assetId` 形态
`asset:<kind>:<namespace>:<localId>`（**不用 `content:` 前缀**，避免被 `parseContentId` 误解析）。
`AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'`，由 `makeAssetId(kind, namespace, localId)` 生成。

Content 回答「这个东西是什么」，Asset 回答「文件在哪」。
将来 本地 → Cloudflare R2 → CDN → GitHub Releases 切换时，Content 模型一行都不用改。

## 8. Registry / Catalog / Index / Query —— 四个职责，不要混

```
Content Registry  → 从哪加载（registry.ts）
Content Catalog   → 有什么（catalog/catalog.ts，同步只读 manifest，不加载词条）
Content Index     → 检索加速（index/content-index.ts，倒排表懒构建）
Content Query     → 怎么找（query/content-query.ts，UI 唯一入口）
```

统一 Query API（**禁止**再出现 `searchTopics()` / `searchAudios()` 这类散装 API）：

```ts
contentQuery.search(opts) / contentQuery.list(opts) / contentQuery.get(contentId) / contentQuery.count(opts)
```

新类型接入时在 `SUPPORTED_TYPES` 里扩展，未接入类型返回空结果（诚实返回 0，不编造）。

### 8.1 Scope（P0.6 新增）—— 页面级作用域

```ts
interface ContentScope { type?: ContentType; packageId?: string; namespace?: string; tags?: string[] }

interface QueryOptions {
  type?: ContentType | 'all'      // 默认 'word'
  query?: string
  packageId?: string               // 裸 id 或 4 段式 ContentId
  namespace?: string               // 如 ecdict-ielts
  tags?: string[]                  // 命中任一即入选
  page?: number                    // 从 1 起
  pageSize?: number                // 省略则不分页
  exact?: boolean
  hasPhonetic?: boolean
  scope?: ContentScope             // 页面级作用域；被上面同义的平铺参数覆盖
  sort?: SortField | SortSpec      // 默认 relevance / asc
}
```

首页 / 搜索页 / 词库页 / Word Detail / 收藏页共用这一套描述，避免每个页面各写一份
`packageId + tags` 拼装逻辑（拼装逻辑一分散，过滤条件就会漂移）。

裁定规则（`resolveScope()` 的实际行为，已核对代码）：

| 情形 | 结果 |
|---|---|
| 平铺参数有值 | **平铺优先，覆盖 scope 同名字段**（不是取交集） |
| 平铺参数无值 | 取 `scope` 的同名字段 |
| `scope` 缺省 | 空作用域 = 全库 |
| `tags: []` | **不算过滤条件**（与老实现一致，按 `length` 判空） |
| `type` | `opts.type ?? scope.type ?? 'word'` |

理由：平铺参数是「就近的、更具体的意图」，scope 是「页面级默认作用域」。

### 8.2 Sort 契约（P0.6 定死）

```ts
type SortField = 'relevance' | 'word' | 'updated'
interface SortSpec { field?: SortField; order?: 'asc' | 'desc' }
```

| 取值 | 主序 | tie-break |
|---|---|---|
| `relevance`（默认） | 精确词形 > 前缀 > 释义/翻译（`rank`） | （词形, packageLocalId, 包内序号）升序 |
| `word` | `normalizeWord` 字典序 | packageLocalId → 包内序号 |
| `updated` | **退化语义**：（packageLocalId, 包内序号） | 同上 |

两条硬契约：

1. **排序必须在分页之前完成**（`sortRows()` → `paginate()`）。先切页再排序必然错页 ——
   这类缺陷不报错、只丢数据，是分页类缺陷里最难查的一类。
2. **tie-break 组合必须唯一**（词形 → packageLocalId → 包内序号），且**恒升序**；
   `order: 'desc'` 只反转主序。否则同 key 的行顺序由 sort 的算法稳定性决定，
   换引擎 / 换数据量就可能翻页重复。同一 query 多次执行顺序完全一致 ⇒ 翻页不重不漏。
   排序比较用 `cmpText()`（code-unit 比较），**不用 `localeCompare`** —— 各运行环境 ICU 数据不同会让排序结果漂移。

> ⚠️ **已知限制：`sort: 'updated'` 目前不是"按更新时间排序"。**
> 词表数据没有词级 `updatedAt` 字段，所以它退化为「按包内原始词序」。
> 它现在唯一的用途是给翻页一个确定顺序。**词级 `updatedAt` 接入后改为按时间戳**，
> 届时必须同步修改 `sortRows()` 注释与 `tests/content-query.mjs`【12】。不要在此基础上编造语义。

### 8.3 索引只走 finder（P0.6 固化）

`ContentIndex` 是 **internal**：现在有 `byId` / `byWord` / `byPackage` / `byTag` 四张 Map，
明天可能是 Trie / FST / SQLite / IndexedDB / Worker 里的倒排表 / 远端搜索 API。
一旦调用点到处写 `idx.byWord.get(x)`，换实现时要改的地方就散落在每个业务文件里，
**总有一处漏改 → 静默丢数据**。

业务层（含 Query 层）访问索引的唯一入口：

```ts
findById(id) / findByWord(normalizedWord) / findByPackage(localId) / findByTag(tag) / findByNamespace(namespace) / idsByPackage(localId)
```

finder 语义：命中顺序 = 索引顺序 = 包内词条数据顺序（分页/排序契约依赖这个稳定性）；
未命中返回 `[]`（`findById` 返回 `null`）；返回新数组（改它不污染索引）；**同步**，
调用方需先 `await ensureIndex()` 覆盖目标包，未建索引的包表现为「查不到」。

> ✅ **已确认**：`grep -n "idx\.\|by[A-Z]" src/core/content/query/content-query.ts`
> 仅命中 3 处注释，零处对 `byId/byWord/byPackage/byTag` 的直接访问 —— Query 层已零直访。

## 9. Relation 分两类，永不合并进同一张图

- **Content Relation**（`relation/relation.ts`）：word→topic、audio→transcript、reading→vocabulary …
- **Learning Relation**：user→content、user→collection、user→goal …

学习关系属于 Learning 层，**不落 `content/` 数据**。

## 10. Import Pipeline

```
Raw → Normalize → Validate → Build → Index → Manifest → Content Registry → Query
```

- **Normalize**（`content:normalize`）：NFC / HTML 剥离 / 实体解码 / 空白折叠 / 去控制字符 / trim。
  ⚠️ 代码词库须在 manifest 声明 `"normalize": { "stripHtml": false }`，
  否则 `type Handler<T>`、`<div />` 会被当标签删掉，词表被破坏（ts-code 实测 5 条命中）。
  只检测不代改：重复词 / 空字段 / 非法字段由人工决策。
- **Validate**（`content:validate`）：**17 项门禁**，红了不许合。
- **Build**（`content:build`）：派生 stats / checksum / schemaVersion / 版本三元组 / contentHistory / build，幂等。
  checksum 一律走 `sha256Canonical`，**不得用文件原文或 `JSON.stringify` 直算**。

## 11. manifest.json 字段契约

| 字段 | 说明 |
|---|---|
| `id` / `type` / `version` | 4 段式 ContentId、类型、semver |
| `title(En)` / `description(En)` / `language` / `exam` / `tags` / `icon` | 展示与筛选 |
| `features` | 能力开关（`phonetic`/`definition`…），业务用 `hasFeature()` 查询，禁止 `if (bank === 'xxx')` |
| `stats` | `{items, phonetic, definition}` —— **全部自动派生** |
| `sources[]` | 多来源溯源（结构化 license；外部来源必须有 SPDX） |
| `offline` | `{supported, policy}`，policy: inline / lazy / runtime / on-demand |
| `packageId` | **包裸 id，必须等于 `content/vocabulary/<目录名>`**（门禁第 13 项） |
| `namespace` | ContentId 第 3 段，**必须与 `id` 解析出的 namespace 同源**（门禁第 14 项） |
| `schemaVersion` | 结构版本（当前 4），自动派生 |
| `contentRevision` | 单调递增审计号，每次构建 +1，回滚不回头 |
| `contentVersion` | 对外学习契约版本，同一 checksum 复用同一 version |
| `contentChecksum` | 规范化入库内容的 canonical SHA-256 |
| `contentPublishedAt` | 当前快照发布时间（ISO date） |
| `contentHistory[]` | `{revision, version, checksum, publishedAt?}`，按 revision 升序，回滚反查用 |
| `build` | `{toolVersion, builtAt, sourceChecksum}` —— 构建溯源 |
| `normalize?` | 规范化开关（代码词库 `stripHtml: false`） |

**禁止手改**：`id` / `namespace` / `packageId` / `stats` / `sources[].checksum` / `schemaVersion`
/ `contentRevision` / `contentVersion` / `contentChecksum` / `contentHistory` / `build`
—— 漂移时跑 `npm run content:build`。

### ⚠️ 两个最容易混的点

1. **`contentChecksum` ≠ `sources[].checksum`**

   | 字段 | 指纹对象 |
   |---|---|
   | `contentChecksum` | **规范化后入库内容**的指纹（`sha256Canonical(words)`） |
   | `sources[].checksum` | **来源原始数据**的指纹（下载到的原始文件） |

   当前来源就是本仓 `words.json` ⇒ **二者同值**（门禁第 17 项要求 `build.sourceChecksum === contentChecksum`）。
   将来接原始 CSV / 上游文件后，`sources[].checksum` 应改为原始字节的 sha256，**二者会分叉** ——
   这正是 provenance 的用途：能回答「源数据没变但内容怎么变了」。混用会导致该场景被漏判。

2. **`packageId` = 目录名，`namespace` = `id` 的第 3 段**（一词三表：目录 / manifest.packageId / ContentId 第 4 段；
   namespace 与 id 同源由第 14 项守）。

### 真实落盘示例（`content/vocabulary/frontend/manifest.json`，字段值照抄）

```json
{
  "id": "content:vocabulary:curated-frontend:frontend",
  "type": "vocabulary",
  "version": "1.0.0",
  "title": "前端工程化词库",
  "titleEn": "前端工程化词库",
  "description": "React / 构建工具高频词",
  "descriptionEn": "React / 构建工具高频词",
  "language": "en",
  "exam": null,
  "tags": ["frontend", "vocabulary"],
  "icon": "Code2",
  "features": { "phonetic": false, "definition": false },
  "stats": { "phonetic": 0, "definition": 0, "items": 20 },
  "sources": [
    {
      "checksum": "sha256:ae689a16584359525729262318b13a8120b5973cf1d8104a24fe8e03eacce126",
      "importedAt": "2026-09-26",
      "license": {
        "attributionRequired": false,
        "commercialUse": true,
        "name": "Proprietary (self-curated)"
      },
      "origin": "curated in-repo (前端词库)"
    }
  ],
  "offline": { "policy": "inline", "supported": true },
  "packageId": "frontend",
  "namespace": "curated-frontend",
  "schemaVersion": 4,
  "contentRevision": 1,
  "contentVersion": 1,
  "contentChecksum": "sha256:ae689a16584359525729262318b13a8120b5973cf1d8104a24fe8e03eacce126",
  "contentPublishedAt": "2026-09-26",
  "contentHistory": [
    {
      "checksum": "sha256:ae689a16584359525729262318b13a8120b5973cf1d8104a24fe8e03eacce126",
      "publishedAt": "2026-09-26",
      "revision": 1,
      "version": 1
    }
  ],
  "build": {
    "toolVersion": "content-build/1.1",
    "builtAt": "2026-09-26T13:59:06.663Z",
    "sourceChecksum": "sha256:ae689a16584359525729262318b13a8120b5973cf1d8104a24fe8e03eacce126"
  }
}
```

（落盘文件是紧凑单行 + 尾随换行，此处为可读性展开。）

## 12. 导入新内容包的固定流程

```
1) 落数据     content/vocabulary/<id>/words.json（最小形状 word + translation）
2) 写骨架     manifest.json 只写展示字段
3) 规范化     npm run content:normalize -- <id> --write
4) 派生       npm run content:build      # id / packageId / namespace / stats / checksum / 版本三元组 / history / build
5) 门禁       npm run content:validate   # 20 项（含第 18/19/20 项：manifest 体积 / inline 预算 / 策略一致性）
6) 登记       src/core/content/registry.ts 的 packages 数组
              ⚠️ 词数 > 1000 或 words.json > 64 KiB ⇒ **必须 lazy**，见第 15 节「新增大包固定流程」
7) 验证       npm run test:content（契约）/ npm run check:bundle（体积）/ npm run test:e2e（UI 回归）
```

新包不得复用既有 namespace（门禁第 9 项直接 FAIL）。

## 13. 门禁清单（content:validate，20 项）

1. `manifest.json` / `words.json` 存在且 JSON 合法（不可解析直接 FAIL 并跳过该包）
2. manifest 必填字段完整：`id type version title description language tags icon features stats sources offline`
3. ContentId 4 段式：`^content:vocabulary:[a-z0-9-]+:.+$` 且以 `:${目录名}` 结尾
4. 包内 duplicate word（精确词形）为 0（**跨包同词合法**，不做跨包唯一性约束）
5. `stats.items` === `words.length`（漂移 → `content:build` 同步）
6. `sources` 非空，且每条 `sources[].checksum` === `sha256Canonical(words)`
7. License 门禁：每条 source 的 license 为结构化对象且 `name` 非空、`attributionRequired` 为布尔；**外部来源（origin 不含 `curated`）必须有 `spdx`**
8. 包 ContentId 全局唯一（同一 ContentId 不得被两个包占用）
9. **namespace 每包唯一**（词级 ContentId 全局唯一的充要条件）
10. `schemaVersion` 存在且 === 4
11. `contentVersion` 存在且为正整数
12. **Duplicate Detection**（分级，见下）
13. `packageId` 存在且 === 目录名（目录 / manifest.packageId / ContentId 第 4 段三处同源）
14. `namespace` 存在，且与从 `manifest.id` 解析出的第 3 段**严格相等**（「每包唯一」由第 9 项兜底）
15. `contentChecksum` === `sha256Canonical(words)`（**必须走 canonical**，不得用文件原文或 `JSON.stringify` 直算）
16. 版本三元组自洽：`contentRevision` / `contentVersion` 均为正整数；`contentHistory` 非空且存在
    `checksum === contentChecksum` 的条目（取最近一条），其 `version === contentVersion`、
    `1 ≤ revision ≤ contentRevision`（回滚场景：version 回到历史值，revision 只增不减）
17. `build` 存在且 `toolVersion` 非空字符串、`builtAt` 可被 `Date.parse`、`sourceChecksum === contentChecksum`
18. **manifest 体积**：单包 < **8 KiB**、全库 < **40 KiB**（当前实测：最大 1.40 KiB、总计 13.08 KiB）
19. **inline 预算**：`offline.policy === 'inline'` 的包 **Σ词 ≤ 1000** 且 **Σ words.json ≤ 64 KiB**（当前实测：346 词 / 37.15 KiB）
20. **策略一致性**：manifest 的 `offline.policy` 必须与 `registry.ts` 实际加载方式一致 —— `words:` ↔ inline，`load:` ↔ lazy（当前 10/10）

> ⚠️ 第 18 / 19 / 20 项是 P0.6.1 新增的（门禁 17 → **20** 项）。
> 另有**两条构建后检查不属于 `content:validate`**：主 chunk 体积（≤ 420 KiB raw / 135 KiB gzip）
> 与预热预算（`warmUpVocabulary` 列入的包 gzip ≤ 600 KiB），由 `npm run check:bundle` 守护。

Duplicate Detection 分级（按「可判定性」分级：能判的判死，判不了的如实说跳过，**绝不用"假装通过"凑绿**）：

| 级 | 判据 |
|---|---|
| (a) 包内 duplicate localId（精确词形） | 第 4 项已覆盖并报错，此处只回显，避免重复计数 |
| (b) 包内 duplicate **normalized** word | key = NFC + lowercase + 空白折叠（含 `\u00A0`）+ trim；大小写 / 空格差异在这里撞车 |
| (c) 跨包 duplicate ContentId | key = `${namespace}|${normalized word}`，**同一个 key 出现在 ≥2 个包**才 FAIL；全库扫描后统一判定，作兜底回归 |
| (d) duplicate source | 同一 `origin` 在 `sources[]` 出现两次 |
| (e) invalid / orphan relation | **仅当 `relations.json` 存在时**校验：端点须匹配 4 段式且在全库可达；无文件则打印「跳过」 |
| (f) broken asset | **仅当 `manifest.assets` 存在时**校验：`url` 须为 `http(s)://` 或 `/` 开头；无字段则打印「跳过」。⚠️ 当前 10 个包**全部无该字段** ⇒ 该项恒跳过，别当成「已校验通过」 |
| (g) orphan learning record | **运行时检查，由 Learning 层（`src/core/review/*`）负责，脚本不校验、不进 CI** |

## 14. CLI

| 命令 | 作用 |
|---|---|
| `npm run content:normalize` | Raw→Normalize（默认干跑，`--write` 落盘，`[包id...]` 限定） |
| `npm run content:build` | 派生 stats / checksum / schemaVersion / 版本三元组 / history / build（幂等） |
| `npm run content:validate`（= `content:check`） | **20 项**门禁；全绿 exit 0，任一 FAIL exit 1 |
| `npm run content:list` | 包清单（`--json` 结构化） |
| `npm run test:content` | 查询层 / Catalog / Index / ContentId / Scope / Sort 契约测试（含 I-19：id 侧禁止 lowercase） |
| `npm run check:bundle` | **构建产物体积门禁**：主 chunk raw ≤ 420 KiB / gzip ≤ 135 KiB；`warmUpVocabulary` 预热 gzip ≤ 600 KiB（对应契约第 21 / 22 项，属于构建后检查） |
| `npm run test:ui` | **P1 UI Contract 棘轮检查**（P1 落地时随 `tests/ui-contract.mjs` 接入，当前未实现）：UI 直读词数组（白名单 `types.Clear`）计数**只许降不许升**，基线在该文件锁定 |
| `node scripts/content/canonical.mjs` | Canonical JSON 自检（幂等 + 数组不重排 + 指纹与排版无关），无 npm script 包装 |

## 15. Content Loading Strategy（打包策略 —— 产品级约束）

> 这是**产品约束，不是性能建议**：「用户加了 5 个大词库之后首屏变慢」属于**违约**。

### 15.1 一句话模型

```
Package = manifest.json（永远轻、常驻、O(包数)）  +  words.json（按需加载）
⇒ 首屏体积不随词库增长
```

manifest 只装元数据、**与词数无关**（实测单包 1.25–1.40 KiB，3000 词包与 20 词包一样大）。
所以：**包变多 ⇒ 主 chunk 按包数线性增长；词变多 ⇒ 只要走 lazy，主 chunk 不动。**

### 15.2 当前实测（node zlib gzip level 9，与 vite 构建日志交叉核对）

| 项 | 实测值 |
|---|---|
| 首屏必须下载（index.html + 主 chunk + CSS，**不含 words chunk**） | **406.09 KiB raw / 125.21 KiB gzip** |
| 主 chunk `index-Cawl4_-q.js` | **381.06 KiB raw / 118.89 KiB gzip** |
| 3 个 lazy chunk | 464.04 / 471.22 / 471.76 KiB raw；163.12 / 166.96 / 166.95 KiB gzip |
| 10 个 manifest 总计 | **13.08 KiB raw / 2.21 KiB gzip**（单包 **1.25–1.40 KiB**） |

包分布：**7 个 inline**（`ai-core` / `cloud-native` / `frontend` / `cet4` / `cet6` / `ts-code` / `go-code`，
共 **346 词 / 37.15 KiB**）+ **3 个 lazy**（`ielts` / `kaoyan` / `toefl`，各 **3000 词 / 约 471 KiB**）。

### 15.3 为什么 inline 是禁区（对照实验硬证据）

把 lazy 的 **kaoyan 临时改成 inline** 再 build（已还原）：

| 项 | 前 | 后 | 增量 |
|---|---|---|---|
| 主 chunk raw | 381.06 KiB | 852.97 KiB | **+471.92 KiB（+123.8%）** |
| 主 chunk gzip | 118.89 KiB | 285.30 KiB | **+166.41 KiB（+140.0%）** |
| words chunk 数 | 3 | 2 | −1 |

增量与 kaoyan `words.json` 的 **471.70 KiB** 呈**字节级 1:1.0005 全额传导** —— 词表一字节不落地进主 chunk。

反向实验（清空 7 个 inline 包词表再 build）：主 chunk 390.20 → 353.10 kB、gzip 123.07 → 107.90 kB
⇒ **7 个 inline 词表占主 chunk 37.10 kB raw / 15.17 kB gzip**。

外推：任一大包做成 inline（系数 **157.3 KiB/千词 raw、55.5 KiB/千词 gzip**）——
自建 5000 词 → gzip **397 KiB（×3.3）**；GRE 12000 词 → **785 KiB（×5.9）**；
Oxford 30000 词 → **1854 KiB（×13.4）**。

反之**全部 lazy** 地加 5 个大包（GRE 12000 / Oxford 30000 / Cambridge 20000 / 自建 5000 / TOEFL 10000 = 77000 词）：
词数 **×9.2**，主 chunk raw 只 **+6.55 KiB（+1.7%）**、gzip 只 **+1.11 KiB（+0.9%）** ⇒ 约束成立。

### 15.4 五条阈值（写进门禁，红了不许合）

| # | 断言 | 阈值 | 当前实测 | 余量 | 守护者 |
|---|---|---|---|---|---|
| 18 | manifest 体积：单包 < **8 KiB**，全库 < **40 KiB** | 8 / 40 KiB | 最大 1.40 / 总 13.08 KiB | 不红（5.7× / 3.1×） | `content:validate` |
| 19 | inline 预算：inline 包 **Σ词 ≤ 1000** 且 **Σ words.json ≤ 64 KiB** | 1000 词 / 64 KiB | 346 词 / 37.15 KiB | 不红 | `content:validate` |
| 20 | 策略一致性：`offline.policy` 与 `registry.ts` 实际加载方式一致（`words:` ↔ inline，`load:` ↔ lazy） | 10/10 | 10/10 | 不红 | `content:validate` |
| 21 | 主 chunk 体积：raw ≤ **420 KiB**、gzip ≤ **135 KiB** | 420 / 135 KiB | 381.06 / 118.89 KiB | 不红（10.2% / 12.0%） | `check:bundle` |
| 22 | 预热预算：`warmUpVocabulary` 列入的包 gzip 总量 ≤ **600 KiB** | 600 KiB | 497.03 KiB | 不红（余量仅 **17%**） | `check:bundle` |

> **第 21 条是抓 inline 误用的，不是抓 lazy 增长的**：
> 加 5 个 lazy 包只到 **387.6 KiB**（阈值内，不该红）；inline 一个 **500 词小包 +78 KiB**（立刻撞线，必须红）。
> 所以第 21 条红了，先问「谁把词表做成 inline 了」，而不是「词是不是太多了」。

### 15.5 新增大包时的固定流程

```
1) 决定 policy：词数 > 1000 或 words.json > 64 KiB ⇒ 必须 lazy
2) registry.ts 用 load: () => import('...?raw')，不要用 words:
3) 若走 lazy，评估是否加入 warmUpVocabulary（注意 600 KiB 预热预算）
4) 跑 npm run check:bundle 确认主 chunk 未越界
5) 跑 npm run content:validate（第 18 / 19 / 20 项）
```

### 15.6 踩坑与已知限制

- **免费检测信号**：构建器自带的 `INEFFECTIVE_DYNAMIC_IMPORT` 警告 = 有人把本该 lazy 的包写成了
  static import。本轮对照实验中它**当场触发**。**看到必须当缺陷处理，不许忽略。**
- 🔴 **预热预算是最薄弱的一环（本轮未解决，属待办）**：
  `warmUpVocabulary()`（`src/core/content/registry.ts:139-141`）当前硬编码全量预热 3 个 lazy 包
  = **497.03 KiB gzip**，已吃掉 600 KiB 预算的 83%。加包时它**不会自动加入**（漏预热 ⇒ 首次离线切库失败），
  手动加入又**没有上限**（流量随包数线性膨胀）。
  在新增 GRE / Oxford 之前，必须先把它从「全量 `allSettled`」改成「按需 + 限量」。
- **UI 不得破坏懒加载边界**（见契约 §12.5）：页面初始化时同步 `import` 任何 `words.json`、
  或把 lazy 包强制拉进主 chunk，都会被 `check:bundle` 判红。

## 16. 路线图

| 阶段 | 一句话 |
|---|---|
| **P0.6.1**（本轮收口） | 只钉边界不新增架构：C-6（id 保留原词形）/ L-6·L-7 事实订正 / §12 P1 UI Contract / §13 Content Loading Strategy + 五条阈值 |
| **P1 词汇产品化** | Catalog → Package Explorer → Search → Word List → Word Detail → Start Learning，把已有的 Query Layer 接到 UI 上（守 §12 防腐层，不破坏 §13 懒加载边界） |
| **P1.5 Learning ContentId 迁移** | 运行时键从**裸 `word`** 迁到 `contentId`（+ version/checksum）；**存在不可逆信息损失**（2323 个跨包同名词无法定归属），按契约 §10.1 三档规则执行 |
| **P2 内容规模化 / 导入体系** | 大词库批量接入（GRE / Oxford / Cambridge…），全部走 lazy；先解决 `warmUpVocabulary` 预热预算 |
| **P3 Audio / Reading / Asset** | Topic / Audio / Reading 接入 + AssetManifest |

**P1 的硬原则：不再造新的抽象 / 目录 / Framework / Repository / Service。**
Catalog、Index、Query、Scope、Sort 都已经就位，P1 的工作是**接线** ——
直接把 Query Layer 接到页面上。每多一层"为 UI 方便"的封装，就多一处与 Content 契约漂移的地方。

后置项（不在 P1 范围）：

- **近似重复（possible duplicate，如 `car` vs `automobile`）**：语义相近 ≠ 数据重复，
  门禁不判，也**禁止自动删**；只允许人工 review 后决定。
- **AssetManifest**（`assets/manifest.json`：checksum / mime / bytes / duration / language / source / license / storage）：推到 **P3**，随内容类型扩展一起做。
- `relations.json` 与 `assets/` 目前尚无数据 → 门禁 (e) / (f) 打印「跳过」，不伪造通过。

## 16. 契约冻结

**Content Contract 已冻结在 `CONTENT_CONTRACT.md`**（本仓根目录，独立文档，不在本文件内重复维护）。
本 README 描述「怎么用」，`CONTENT_CONTRACT.md` 描述「什么不可变」。

- **P1 阶段不得为了 UI 方便而修改 Content 契约。**
  UI 缺字段、缺筛选、缺排序，先在 UI 侧或 Query 侧解决；只有当 Content 层自身的语义确实不完整时才动契约。
- 确需变更时，固定流程：

  ```
  提 issue（说明动机 + 影响面） → 改 CONTENT_CONTRACT.md → 改 validate 门禁（scripts/content/validate.mjs）
  → 全量回归（content:build + content:validate + test:content + tsc + test:e2e）
  ```

  顺序不能倒：**先契约，后门禁，再回归**。门禁没跟着改的契约变更等于没有契约。
