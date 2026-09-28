# 内容架构（CONTENT_ARCHITECTURE）

> 状态：✅ 已有 —— Content 层治理链（Registry → Catalog → Index → Query）全部为当前真实实现。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 契约原文：仓库根目录 `CONTENT_CONTRACT.md`（45 215 B，FROZEN @ V4.1-P0.6）
> 操作手册：`content/README.md`

---

## 1. 治理链全景

```
content/vocabulary/<id>/{manifest.json, words.json}
        │
        │  scripts/content/{normalize,build,validate}.mjs   ← 构建期治理
        ▼
① Registry       src/core/content/registry.ts            141 行   「从哪加载」
        ▼
② Catalog        src/core/content/catalog/catalog.ts     104 行   「有什么」
        ▼
③ Index          src/core/content/index/content-index.ts 231 行   「检索加速」internal
        ▼
④ Query          src/core/content/query/content-query.ts 385 行   「怎么找」UI 唯一入口
        ▼
⑤ UI             src/components/*                     ⚠️ 当前未接线，走 wordBanks.ts
```

四层职责在 `catalog/catalog.ts:3-6` 有明文界定；完整依赖说明见 `SYSTEM_ARCHITECTURE.md`。

---

## 2. ContentId —— 4 段式

### 2.1 形态与实现

定义在 `src/core/content/model/content.ts`：

```
content:<type>:<namespace>:<localId>
```

构造与解析（`model/content.ts:58-67`）：

```ts
// :58
export function makeContentId(type: ContentType, namespace: string, localId: string): string {
  return `content:${type}:${namespace}:${localId}`
}

// :63
export function parseContentId(id: string): ParsedContentId | null {
  const m = /^content:([a-z]+):([a-z0-9-]+):(.+)$/.exec(id)
  if (!m) return null
  return { type: m[1] as ContentType, namespace: m[2], localId: m[3] }
}
```

### 2.2 冻结条款（契约 §2.2）

| # | 断言 | 实现位置 |
|---|---|---|
| C-1 | ContentId 大小写敏感、逐字符比较 | `wordId` 保留原词形（`model/content.ts:81`） |
| C-2 | `type` ∈ `ContentType`（12 个取值） | `model/content.ts:34-46` |
| C-3 | `namespace` 匹配 `[a-z0-9-]+` | 正则第 2 段 |
| C-4 | 版本信息绝不进 ContentId | 无 `.v2` / 无 checksum 拼接 |
| C-5 | 非法 id 时 `parseContentId` 返回 `null`，**不抛异常** | `:63-67` |
| C-6 | 词条 ContentId 的 lemma **保留原词形**（禁止 id 侧 lowercase） | `model/content.ts:69-81` |

### 2.3 `ContentType` 全集（`model/content.ts:34-46`）

```
'vocabulary' | 'word' | 'topic' | 'listening' | 'audio' | 'reading'
| 'writing' | 'speaking' | 'grammar' | 'document' | 'collection' | 'exercise'
```

**当前有数据落地的只有 `vocabulary`（包级）与 `word`（条目级）**。
其余 10 个是类型槽位，无数据。详见 `04-content/CONTENT_TYPES.md`。

### 2.4 真实 ContentId 样本（10 个包，全部实测）

| 包 | ContentId | namespace |
|---|---|---|
| ai-core | `content:vocabulary:curated-ai-core:ai-core` | `curated-ai-core` |
| cet4 | `content:vocabulary:ecdict-cet4:cet4` | `ecdict-cet4` |
| cet6 | `content:vocabulary:ecdict-cet6:cet6` | `ecdict-cet6` |
| cloud-native | `content:vocabulary:curated-cloud-native:cloud-native` | `curated-cloud-native` |
| frontend | `content:vocabulary:curated-frontend:frontend` | `curated-frontend` |
| go-code | `content:vocabulary:curated-go-code:go-code` | `curated-go-code` |
| ielts | `content:vocabulary:ecdict-ielts:ielts` | `ecdict-ielts` |
| kaoyan | `content:vocabulary:ecdict-kaoyan:kaoyan` | `ecdict-kaoyan` |
| toefl | `content:vocabulary:ecdict-toefl:toefl` | `ecdict-toefl` |
| ts-code | `content:vocabulary:curated-ts-code:ts-code` | `curated-ts-code` |

（来源：`content-samples/MANIFESTS.md` 宽表，由 `extract-samples.mjs` 从实际 JSON 读出。）

词级 ContentId 形如 `content:word:ecdict-ielts:abandon`。

---

## 3. namespace 唯一性

### 3.1 规则

定义（`model/content.ts:48-49`）：`${来源族}-${包 id}`（`ecdict-ielts` / `curated-ai-core`）。

构建侧实现（`scripts/content/build.mjs:45-49`）：

```js
const SOURCE = {
  ielts: 'ecdict', kaoyan: 'ecdict', toefl: 'ecdict', cet4: 'ecdict', cet6: 'ecdict',
  'ai-core': 'curated', 'cloud-native': 'curated', frontend: 'curated',
  'ts-code': 'curated', 'go-code': 'curated',
}
const namespaceOf = (id) => `${SOURCE[id] ?? 'curated'}-${id}`
```

namespace 是**从最终 ContentId 反解**写入的，不重算（`build.mjs:68-71`）：

```js
const namespaceOfId = (contentId, fallbackId) =>
  /^content:[a-z]+:([a-z0-9-]+):/.exec(contentId)?.[1] ?? namespaceOf(fallbackId)
```

→ 保证 `manifest.namespace` 与 `manifest.id` 永远同源。

### 3.2 为什么必须每包唯一（充要性）

`model/content.ts:16-23` 的原文：

> 词级 id 的 localId 只有词形、不含包 id，因此 **namespace 必须每包唯一**
> ……若两包共用 namespace（早期用来源族 `ecdict`，cet4/toefl/ielts 三包共用），
> 同名词会产生同一个 ContentId —— 学习记录主键撞车、跨包进度互相污染。

形式化（契约 §3.3）：

```
∀ 包 p ≠ q : namespace(p) ≠ namespace(q)  ⟺  词级 ContentId 全局唯一
```

### 3.3 门禁

`scripts/content/validate.mjs`：

- 第 9 项（`:212-215`）：`namespace` 两两不同，重复即 FAIL。
- 第 14 项（`:222-228`）：`manifest.namespace` 必须等于从 `id` 解析出的第 3 段。
- 第 12(c) 项（`:294-304` + `:354-358`）：跨包 duplicate ContentId 全库兜底扫描，
  key = `${namespace}|${normalized word}`。

### 3.4 跨包同词是合法数据关系

`model/content.ts:22-23` 与契约 §3.4 明确：

> 跨包同词是**合法数据关系**（IELTS/CET/TOEFL 各有 abandon），消歧手段是 namespace，
> 而不是禁止同词。

实测：全库 9346 词中 **2 323 个跨包同名词**（`GAP_ANALYSIS.md#A-4`）。
`validate.mjs:172-176` 只做**包内**去重，任何「跨包词唯一」约束都会被门禁拒绝。

---

## 4. checksum —— canonical SHA-256

### 4.1 唯一算法实现

文件：`scripts/content/canonical.mjs`（134 行）

```js
// :54
export function canonicalize(value) { ... }        // 规范序列化
// :81
export function sha256Canonical(value) {
  return 'sha256:' + createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')
}
// :89
export function canonicalFile(value) { return canonicalize(value) + '\n' }
```

存在目的（`canonical.mjs:4-8`）：

> build.mjs 原先拿 words.json **文件原文**算 sha256，validate.mjs 拿 `JSON.stringify(words)` 算。
> 两者现在恰好一致，但只要文件被格式化（加缩进 / 换行 / 键顺序变化），checksum 就会漂移
> ⇒ 「内容没变」被误判成「内容变了」。

### 4.2 七条规则（契约 §5.1 N-1~N-8）

| # | 规则 | 实现行 |
|---|---|---|
| N-1 | 白名单字段按固定顺序：`word → translation → phonetic → definition` | `:36`、`:42-47` |（**P1.6-E**：`partOfSpeech` 已从白名单移除 —— 全库 0 条数据、0 处读取；移除后 10 包 checksum 逐包不变）
| N-2 | 未知字段按 code-unit 字典序排在白名单之后 | `:45`、`:39` |
| N-3 | value 为 `undefined` 的键跳过 | `:43` |
| N-4 | **数组绝不重排**（硬规矩） | `:57-58` |
| N-5 | Unicode 原样输出，不转义为 `\uXXXX` | `:61` |
| N-6 | 紧凑输出，无空格无缩进 | `:66-68` |
| N-7 | `canonicalize()` 无尾随换行；`canonicalFile()` 补 `\n`，**checksum 不含该换行** | `:89-91` |
| N-8 | 指纹格式 `'sha256:' + hex`（完整值，不截断） | `:82` |

N-4 为什么是硬规矩（`canonical.mjs:11-13`）：

> 词表顺序 = 数据与产品语义（词频序 / 教材序 / 难度梯度），重排会破坏产品本身。

### 4.3 三个 checksum 字段的语义区分（易混点）

| 字段 | 指纹对象 | 计算处 |
|---|---|---|
| `manifest.contentChecksum` | **规范化入库内容** | `build.mjs:102` `sha256Canonical(words)` |
| `manifest.sources[].checksum` | **来源原始数据** | `build.mjs:103` |
| `manifest.build.sourceChecksum` | 本次构建读入源数据 | `build.mjs:176` |

当前来源就是本仓 `words.json` ⇒ **三者同值**。
门禁第 17 项要求 `build.sourceChecksum === contentChecksum`（`validate.mjs:271`）。
将来接入原始 CSV / 上游文件时三者会分叉 —— 分叉本身即 provenance 的价值。

### 4.4 自检

`canonical.mjs:95-120` 的 `selfCheck()`，可直接 `node scripts/content/canonical.mjs` 运行：

- 幂等：`canonicalize(JSON.parse(canonicalize(x))) === canonicalize(x)`
- 数组不重排：`canonicalize([{word:'z'},{word:'a'}]) === '[{"word":"z"},{"word":"a"}]'`（`:112`）
- 指纹与排版无关：同数据不同插入序 / 不同缩进必须同指纹（`:116-118`）

---

## 5. 版本三元组

### 5.1 四个数，各管一件事

| 字段 | 语义 | 递增时机 | 可回滚 | 参与相等性判断 | 落盘位置 |
|---|---|---|---|---|---|
| `schemaVersion` | **结构**版本（当前 4） | schema 破坏性变更 | 否 | 否 | `manifest.schemaVersion` |
| `contentRevision` | 单调递增**审计号** | 每次「内容确实变了」的构建 +1 | **否** | **否** | `manifest.contentRevision` |
| `contentVersion` | 对外**学习契约版本** | 全新内容 +1；回滚回到历史值 | 是 | 是 | `manifest.contentVersion` |
| `contentChecksum` | 内容的**确定性身份** | 内容变化 | 是 | 是 | `manifest.contentChecksum` |

常量定义：`SCHEMA_VERSION = 4` 在两处（`model/content.ts:127`、`build.mjs:55`、`validate.mjs:93`）。

### 5.2 构建规则三条铁律（`build.mjs:105-160`）

| # | 规则 | 实现行 |
|---|---|---|
| 1 | **首次迁移不递增** —— 无 `contentHistory` 时只补字段 | `:126-133` |
| 2 | **内容未变则全量复用** —— checksum 一致 ⇒ revision/version/publishedAt/builtAt 一字节不改 | `:139-144` |
| 3 | **内容变了** ⇒ 先查 history（取 revision 最大的匹配条目）：<br>· 命中（回滚）⇒ version 回到历史值，revision = max+1，不新增条目<br>· 未命中（全新）⇒ revision = version = max+1，追加一条 | `:137`、`:145-159` |

铁律 2 的目的（`build.mjs:113-115`）：「否则每次 build 都改 `builtAt`，幂等被直接破坏」。

### 5.3 version 不保证连续

契约 §4.3 给出序列：

```
内容 X → rev1/ver1
内容 Y → rev2/ver2
回滚 X → rev3/ver1   （version 回到历史值，history 不新增条目）
内容 Z → rev4/ver4   ← ver4，而不是 ver3
```

因此禁止：假设 `version_n = version_{n-1} + 1`、把 version 当数组下标 / 进度条 / 做差值。

⚠️ 契约 §4.3 自述：该行为由 P0.6 期间 cet4 回滚**手工回归**确认，
**未固化为自动断言**（仓内落盘的 cet4 仍是 rev1/ver1、history 只有 1 条），
因为断言它会污染 `contentHistory` 真值。

### 5.4 真实数据样本

| 包 | contentRevision | contentVersion | contentHistory 条数 |
|---|---|---|---|
| ai-core | 1 | 1 | 1 |
| cet4 | 1 | 1 | 1 |
| cet6 | 1 | 1 | 1 |
| cloud-native | 1 | 1 | 1 |
| frontend | 1 | 1 | 1 |
| go-code | 1 | 1 | 1 |
| **ielts** | **2** | **2** | — |
| **kaoyan** | **2** | **2** | — |
| **toefl** | **2** | **2** | — |
| ts-code | 1 | 1 | 1 |

（来源：`content-samples/MANIFESTS.md` 宽表。）→ 只有 3 个 ECDICT 大包被构建过两次。

### 5.5 Snapshot 与 findRevision

文件：`src/core/content/model/snapshot.ts`（128 行）

```ts
// :57  ContentSnapshot
interface ContentSnapshot {
  contentId: string          // 哪个实体
  contentVersion: number     // 该实体的哪个快照
  checksum: string           // 该快照的确定性身份
  schemaVersion: number      // 写入时的结构形状
  publishedAt?: string
}

// :74  snapshotOf(contentId, {version, checksum, publishedAt?}, schemaVersion = SCHEMA_VERSION)
// :97  isSameSnapshot(a, b) —— contentId + contentVersion + checksum 三者全等
// :117 findRevision(history, checksum) —— 倒序扫描，取 revision 最大的匹配条目
```

`findRevision` 的口径必须与 `build.mjs` 的回滚逻辑**同源**（`snapshot.ts:108-110`）：

> 构建器用 `[...prevHistory].reverse().find(...)` 取「history 中 revision 最大的匹配条目」，
> 本函数因此也必须**倒序扫描**（从 history 末尾往前找），否则两边会给出不同的历史条目。

---

## 6. Index 层

文件：`src/core/content/index/content-index.ts`（231 行，标注 **internal**）

四张 Map（`:24-33`）：

```ts
export interface ContentIndex {
  byId:      Map<string, WordHit>      // ContentId → 词条（全量正排表）
  byWord:    Map<string, string[]>     // 归一化词形 → ContentId[]
  byPackage: Map<string, string[]>     // packageLocalId → ContentId[]
  byTag:     Map<string, string[]>     // tag → ContentId[]
}
```

### 6.1 索引 key 归一化

`normalizeWord()`（`:45-47`）：

```ts
s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
```

三步的理由（`:38-44`）：NFC 防同一字符多编码、lowercase 让大小写无关、空白折叠让 `" abandon "` 命中。

### 6.2 懒构建与并发去重

- `built: Set<string>`（`:80`）记录已建索引的包
- `inflight: Map<string, Promise<void>>`（`:82`）同包并发只加载一次
- `ensureIndex(packageIds?)`（`:119-125`）：省略参数则覆盖全部已注册包
- `invalidateIndex(packageId?)`（`:133-167`）：支持整包失效与全清
- `getIndexStats()`（`:170-172`）：`{packages, entries}`

### 6.3 finder（业务访问索引的唯一入口）

| finder | 行 | 语义 |
|---|---|---|
| `findById(id)` | `:202` | 未命中 / 未建索引返回 `null` |
| `findByWord(normalizedWord)` | `:207` | 跨包同词各占一条；key 必须经 `normalizeWord` |
| `findByPackage(packageLocalId)` | `:212` | 包内全部词条 |
| `findByTag(tag)` | `:217` | tag 命中的词条 |
| `findByNamespace(namespace)` | `:222` | namespace 每包唯一 ⇒ 最多命中一个包 |
| `idsByPackage(packageLocalId)` | `:228` | 只要 id 不要实体 |

为什么必须有 finder 层（`:174-189`）：

> ContentIndex 现在是四张 Map，明天可能是 Trie / FST / SQLite / IndexedDB / 跑在 Worker
> 里的倒排表。如果调用点到处写 `idx.byWord.get(x)`，换实现时要改的地方就散落在每个
> 业务文件里，且**总有一处漏改 → 静默丢数据**。

**实测确认**：Query 层已零直访内部 Map —— `content-query.ts:23` 只 import 了
`buildHits, ensureIndex, findById, findByPackage, findByWord, idsByPackage, normalizeWord` 七个 finder，
无一处访问 `byId` / `byWord` / `byPackage` / `byTag`。

### 6.4 一个不变量：id 生成侧与寻址侧同源

`buildHits()`（`:51-70`）用**原词形**生成 word 级 ContentId：

```ts
const ns = parseContentId(packageId)?.namespace ?? localId
return words.map((w) => ({ id: makeContentId('word', ns, w.word), ... }))
```

若寻址侧用 lowercase 反查，`Oxford` / `Marxist` / `const [a, setA]` 这类大写词会
「search 查得到、get 取不回」。实测影响 **93 条含大写字母的词条**（go-code 41/50、ts-code 34/50），
见 `content-query.ts:355-360`。这就是不变式 **I-19** 的来源。

> 口径澄清：这里的「93」是**含大写字母的词条条数**，**不是**「大小写敏感碰撞组数」——实测「仅大小写不同、其余相同」的词形碰撞组 = **0 组**。

---

## 7. Query 层

文件：`src/core/content/query/content-query.ts`（385 行）

### 7.1 统一入口（写死的原则）

`content-query.ts:11-15`：

> 新增内容类型（topic / audio / listening ...）时，在 search/list/get/count 内部扩展分支，
> **禁止**再出现 `searchTopics()` / `searchAudios()` / `listListening()` 这类散装 API。

| API | 行 | 说明 |
|---|---|---|
| `search(opts)` | `:260` | 精确词形 > 前缀 > 释义/翻译（rank 0/1/2） |
| `list(opts)` | `:293` | 按包 / namespace / tag + hasPhonetic 浏览 |
| `get(contentId)` | `:302` | 单条寻址；未接入类型 / 非法 id 返回 `null` |
| `count(opts)` | `:310` | 计数；无 hasPhonetic 过滤时直接读 `manifest.stats.items` |

`SUPPORTED_TYPES = ['word']`（`:133`）—— `resolveTypes()`（`:143-146`）
对不支持的类型返回空数组 ⇒ 结果 `[]` / count `0`（诚实返回，不编造）。

兼容封装（`:331-385`）：`searchWords` / `listWords` / `getWord` / `countWords`，
是统一入口在 `type='word'` 下的薄封装。

### 7.2 Scope（作用域）

```ts
// :51  ContentScope
interface ContentScope { type?; packageId?; namespace?; tags? }

// :63  ResolvedScope —— type 已解析出默认值
```

合并规则 `resolveScope()`（`:156-165`）—— **显式平铺参数优先于 scope**（覆盖，不是取交集）：

```
type      = opts.type      ?? s?.type      ?? 'word'
packageId = opts.packageId ?? s?.packageId
namespace = opts.namespace ?? s?.namespace
tags      = opts.tags?.length ? opts.tags : s?.tags?.length ? s.tags : undefined
```

理由（`:46-49`）：平铺参数是「就近的、更具体的意图」，scope 是「页面级默认作用域」。
`tags: []` 不视为过滤条件（按 `length` 判空，`:162-163`）。

### 7.3 Sort 契约

```ts
// :80
type SortField = 'relevance' | 'word' | 'updated'
interface SortSpec { field?: SortField; order?: 'asc' | 'desc' }
```

| 取值 | 主序（`sortRows()` `:236-240`） | tie-break |
|---|---|---|
| `relevance`（默认） | `rank`（0 精确 / 1 前缀 / 2 释义翻译） | (词形, packageLocalId, 包内序号) 升序 |
| `word` | `cmpText(norm(word))` 字典序 | packageLocalId → 包内序号 |
| `updated` | **退化**：(packageLocalId, 包内序号) | 同上 |

两条硬契约（`:70-79`）：

1. **排序必须在分页之前完成** —— `paginate(sortRows(rows, sort), page, pageSize)`（`:289`、`:298`）。
   先切页再排序必然错页。
2. **tie-break 组合必须唯一**且**恒升序**；`order:'desc'` 只反转主序（`:233` `flip`）。

比较器 `cmpText`（`:140`）：

```ts
const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
```

**不用 `localeCompare`**（`:138-139`）：不同运行环境的 ICU 数据不同，排序结果会漂。

⚠️ **`updated` 是退化语义**：词表数据**没有**词级 `updatedAt` 字段（`:225-228`）。
GAP_ANALYSIS 将其列为 `A-2` 并指出「UI 一旦露出『最近更新』就是假功能」。
契约 §10 L-1 把它列为「冻结时必须一起接受」的已知限制。

### 7.4 `getWord` 的两级查找

`getWord(contentId)`（`:361-380`）：

```
① 精确：await ensureIndex(...) → findById(contentId)
        索引正排表的 key 就是生成侧写进去的 id，逐字符一致
② 兜底：norm(parsed.localId) 逐包 loadPackage + norm(w.word) === target
        兼容调用方传入的 lowercase / 未规范 id
```

`get(contentId)`（`:302-307`）在其上加了类型闸门：`parseContentId` 失败或类型不在
`SUPPORTED_TYPES` 时返回 `null`。

---

## 8. Catalog 层

文件：`src/core/content/catalog/catalog.ts`（104 行）

- `getCatalog()`（`:80-97`）：同步、只读 manifest、**不加载任何词条**，可放心首屏调用。
- `getPackageCatalog(localId)`（`:100-104`）。
- 返回结构 `ContentCatalog { schemaVersion, types[], packages[], totalItems }`（`:42-48`）。
- `PLANNED_TYPES`（`:52-64`）：11 个类型槽位初始化 `packages: 0 / items: 0`。

诚实原则（`:9-12`）：

> **未接入的内容类型一律返回 packages=0 / items=0，不许编造数字**。
> ……宁可让 UI 显示「暂未开放」，也不要拿假数字骗过验收。

`features` 只输出值为 `true` 的键（`:74`）：`Object.keys(m.features).filter((k) => m.features[k] === true)`。

---

## 9. 构建期治理链（5 个脚本）

| 脚本 | 行数 | 阶段 | 职责 |
|---|---|---|---|
| `scripts/content/canonical.mjs` | 134 | 基石 | 规范序列化 + 指纹 + 自检 |
| `scripts/content/normalize.mjs` | 186 | Raw → Normalize | NFC / HTML 剥离 / 实体解码 / 空白折叠 / 去控制字符 / trim |
| `scripts/content/build.mjs` | 214 | → Build | 派生 stats / checksum / 版本三元组 / history / build（幂等） |
| `scripts/content/validate.mjs` | 427 | → Validate | **20 项门禁** |
| `scripts/content/list.mjs` | 59 | 观测 | 包清单（`--json` 结构化） |

### 9.1 normalize 的代码词库特例

`normalize.mjs:14-18`：

> 代码词库（ts-code / go-code）必须关掉 HTML 剥离：泛型 `type Handler<T>`、JSX `<div className="app">`
> 会被 `<[^>]*>` 当成标签删掉，词表直接被破坏（实测 5 条命中）。

开关注入路径：`normalize.mjs:106-111` 读 `manifest.normalize.stripHtml === false`。

### 9.2 build 的幂等

`build.mjs:192-194`：

```js
const same = canonicalize(next) === canonicalize(m)
```

用 canonical 比较，**不用 `JSON.stringify` 直比** —— 后者对键顺序敏感，
而 manifest 落盘会被 `canonicalFile` 重排键序。

### 9.3 validate 的 20 项门禁

完整清单见 `content/README.md:477-504` 与门禁源码注释（`validate.mjs:2-42`）。
按类别归纳：

| 类别 | 项号 |
|---|---|
| 文件与 JSON 合法性 | 1 |
| manifest 必填字段 | 2 |
| ContentId 规范 | 3 |
| 重复检测 | 4、12(a)-(g) |
| stats 一致性 | 5 |
| checksum | 6、15 |
| License | 7 |
| 全局唯一性 | 8、9 |
| 版本字段 | 10、11、16 |
| 三位一体同源 | 13、14 |
| build 溯源 | 17 |
| 体积与预算 | 18（manifest 体积）、19（inline 预算）、20（策略一致性） |

第 18/19/20 项是 P0.6.1 新增（门禁 17 → 20 项）。阈值（`validate.mjs:54-64`）：

```
MANIFEST_MAX_BYTES       = 8 * 1024        // 单包 manifest，实测最大 1.40 KiB
MANIFEST_TOTAL_MAX_BYTES = 40 * 1024       // 全库，实测 13.08 KiB
INLINE_MAX_ITEMS         = 1000            // inline 包 Σ词，实测 346 词
INLINE_MAX_BYTES         = 64 * 1024       // inline 包 Σ words.json，实测 36.17 KiB
```

第 20 项的实现特殊：Node 跑不了 TS，只能**扫 registry.ts 文本**判断每个包的实际加载方式
（`registryLoadMode()`，`:75-88`）：先定位 `localId: '<id>'`，再在该块内找 `words:`（inline）
或 `load:`（lazy）。未知策略只提示跳过，**不伪造通过**（`:413-415`）。

---

## 10. 与已知缺口清单的交叉引用

| 本文件章节 | 相关缺口 | 位置 |
|---|---|---|
| §2.3 类型槽位 | 仅 vocabulary 落地 | `GAP_ANALYSIS.md#C-6`、`04-content/CONTENT_TYPES.md` |
| §6 Index 层未被 UI 使用 | UI 绕过 Query | `GAP_ANALYSIS.md#A-1`、`KNOWN_ISSUES.md#DEBT-001` |
| §7.3 `updated` 退化 | 假更新时间语义 | `GAP_ANALYSIS.md#A-2` |
| §9 门禁未接入 CI | 20 项门禁 + 3 项体积门禁未进 CI | `KNOWN_ISSUES.md#DEBT-002` |
| §9.3 门禁项数文档不一致 | README 一处写 17 项 | `KNOWN_ISSUES.md#DEBT-004` |

---

## 11. 一句话结论

> Content 层的治理链是**当前项目最完整、最可审计的部分**：4 段式 ContentId 有正则与门禁双重约束，
> namespace 唯一性有充要性论证与跨包扫描兜底，checksum 有唯一算法实现与幂等自检，
> 版本三元组有构建规则与自洽门禁，Index 有 internal 边界与 finder 封装。
> **缺口不在这一层内部，而在它上面**：UI 层从未接上线（§6.3 与 `SYSTEM_ARCHITECTURE.md#4`）。
