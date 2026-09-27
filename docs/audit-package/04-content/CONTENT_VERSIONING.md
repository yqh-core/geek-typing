# 内容版本管理（CONTENT_VERSIONING）

> 状态：✅ 已有 —— 版本三元组机制完整实现，有门禁、有真实数据样本。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 原文依据：`scripts/content/build.mjs`（214 行）、`src/core/content/model/snapshot.ts`（128 行）、契约 §4

---

## 1. 四个版本字段的完整分工

| 字段 | 语义 | 递增时机 | 可回滚 | 参与相等性判断 | 落盘位置 |
|---|---|---|---|---|---|
| `schemaVersion` | **结构**版本 | schema 破坏性变更 | 否 | 否 | `manifest.schemaVersion` |
| `contentRevision` | 单调递增**审计号** | 每次「内容确实变了」的构建 +1 | **否**（回滚继续 +1） | **否** | `manifest.contentRevision` |
| `contentVersion` | 对外**学习契约版本** | 全新内容 +1；回滚回到历史值 | 是 | 是 | `manifest.contentVersion` |
| `contentChecksum` | 内容的**确定性身份** | 内容变化 | 是 | 是 | `manifest.contentChecksum` |

配套还有 `contentPublishedAt`（当前快照发布时间）与 `contentHistory[]`（修订历史）。

### 1.1 为什么必须拆成三个（`snapshot.ts:8-18` 原文）

> 旧模型里 `contentVersion` 是「checksum 变化就 +1」的单调计数器，它是**状态**而不是
> 内容的确定性身份：把 words.json 回滚到上一版再 build，version 会白白 +1，
> 于是「回滚后的内容」和「从未发布过的新内容」在版本号上无法区分。
>
> - `revision` —— 单调递增审计号：每次内容构建都 +1，**回滚也不回头**。
>   只回答「这份包一共被构建过多少次」，不参与任何相等性判断。
> - `version` —— 对外学习契约版本：**同一 checksum 复用同一 version**。
>   回滚后 checksum 回到历史值，version 也随之回到历史值 —— 学习记录因此能认出
>   「这是我学过的那个版本」。
> - `checksum` —— 规范化内容的 canonical SHA-256：**内容的确定性身份**。

### 1.2 铁律一：version 不能承担 checksum 的职责

`snapshot.ts:20-25` 原文：

> version 是「对外契约号」，它的语义是「第几代」，天然可被两个不同内容共用
> （A 包第 3 代 与 B 包第 3 代 都是 3）。只有 checksum 能回答「这是不是同一份内容」。
> ……所以判断「同一个快照」必须 contentId + contentVersion + checksum **三者全等**。

### 1.3 铁律二：version 不保证连续

契约 §4.3（`:224-243`）给出序列（P0.6 期间 cet4 手工回归实测）：

```
内容 X → rev1/ver1
内容 Y → rev2/ver2
回滚 X → rev3/ver1   （version 回到历史值，history 不新增条目）
内容 Z → rev4/ver4   ← ver4，而不是 ver3
```

因此禁止：

- ❌ 假设 `version_n === version_{n-1} + 1`
- ❌ 把 version 当数组下标 / 当进度条 / 做差值
- ✅ 判断内容身份：**只看 checksum 是否命中 `contentHistory`**

⚠️ 契约自述（`:242-243`）：该行为**未固化为自动断言**，
因为断言它会污染 `contentHistory` 真值。需要复核请按契约列的步骤重跑。

---

## 2. 构建规则三条铁律

实现在 `scripts/content/build.mjs:105-160`。原文注释（`:105-120`）：

```
 1. 首次迁移（manifest 无 contentHistory）**不递增** —— 否则本轮迁移会让 ielts
    从 contentVersion 2 白涨到 3，凭空制造一次「内容变了」。
 2. 内容与上次记录一致（contentChecksum === C）⇒ revision/version/publishedAt/
    builtAt 全部原样复用，**一个字节都不改** —— 否则每次 build 都改 builtAt，
    幂等被直接破坏（永远「有变化」）。
 3. 内容确实变了 ⇒ 先查 history：
      · 命中历史 checksum（回滚场景）⇒ version = 该条 version，revision = max+1，
        不新增条目，publishedAt 复用该快照的发布时间；
      · 未命中（全新内容）⇒ revision = version = max+1，push 新条目。
```

### 2.1 对应的代码分支

| 分支 | 行 | 条件 | 行为 |
|---|---|---|---|
| ① 首次迁移 | `:126-133` | `prevHistory === null` | `revision = version = maxRev \|\| 1`，补一条 history，**不递增** |
| ② 无变化 | `:139-144` | `!contentChanged` | 全部原样复用（含 `builtAt`） |
| ③ 回滚 | `:145-151` | `contentChanged && hit` | `revision = maxRevision+1`，`version = hit.version`，**不新增条目** |
| ④ 新内容 | `:152-159` | `contentChanged && !hit` | `revision = version = maxRevision+1`，追加一条 history |

### 2.2 幂等的实现

`build.mjs:192-194`：

```js
const same = canonicalize(next) === canonicalize(m)
```

用 canonical 比较，**不用 `JSON.stringify` 直比**（`:192-193` 注释）：

> 不能用 JSON.stringify 直比 —— manifest 落盘会被 canonicalFile 重排键序。

### 2.3 `maxRevision` 的计算（含兼容逻辑）

`build.mjs:135`：

```js
const maxRevision = prevHistory.reduce(
  (acc, e) => (isPosInt(e?.revision) && e.revision > acc ? e.revision : acc),
  maxRev,
)
```

`maxRev` 的来源（`:122`）兼容旧 manifest：

```js
const maxRev = isPosInt(m.contentRevision) ? m.contentRevision
             : (isPosInt(m.contentVersion) ? m.contentVersion : 0)
```

→ 旧版 manifest 只有 `contentVersion` 时，用它作为 revision 基线。

---

## 3. `contentHistory` 与 `findRevision`

### 3.1 条目结构

`src/core/content/model/snapshot.ts:31-40`：

```ts
export interface ContentRevisionEntry {
  revision: number       // 单调递增审计号：每次构建 +1，回滚不回头
  version: number        // 该次构建对应的对外学习契约版本
  checksum: string       // 该次构建的规范化内容指纹
  publishedAt?: string   // 该次构建的发布时间（ISO date）
}
```

- 按 `revision` **升序**追加（末尾即最新一次构建）
- 落在 `manifest.contentHistory[]`

### 3.2 `findRevision` 口径

`snapshot.ts:117-128`：

```ts
export function findRevision(
  history: ContentRevisionEntry[],
  checksum: string,
): ContentRevisionEntry | null {
  if (!checksum) return null
  const list = Array.isArray(history) ? history : []
  for (let i = list.length - 1; i >= 0; i--) {     // ← 倒序扫描
    const e = list[i]
    if (e?.checksum === checksum) return e
  }
  return null
}
```

**必须倒序扫描**（`snapshot.ts:108-110`）：

> 口径必须与 `scripts/content/build.mjs` 的回滚逻辑**同源同口径**：
> 构建器用 `[...prevHistory].reverse().find(...)` 取「history 中 revision 最大的匹配条目」，
> 本函数因此也必须**倒序扫描**（从 history 末尾往前找），否则两边会给出不同的历史条目。

两条约定（`:112-115`）：

- `contentHistory` 按 revision **升序**追加
- **同一 checksum 可出现多次**（内容 X → 内容 Y → 回滚回 X，X 的条目会有两条），
  此时以**最近一次发布**（revision 最大的那条）为准

构建侧的对应实现（`build.mjs:137`）：

```js
const hit = [...prevHistory].reverse().find((e) => e?.checksum === checksum)
```

---

## 4. `ContentSnapshot` 与 `isSameSnapshot`

### 4.1 结构

`snapshot.ts:57-68`：

```ts
export interface ContentSnapshot {
  contentId: string          // 哪个实体
  contentVersion: number     // 该实体的哪个内容快照
  checksum: string           // 该快照的确定性身份
  schemaVersion: number      // 写入快照时刻的结构形状
  publishedAt?: string
}
```

三者分工（`snapshot.ts:3-6`）：

```
ContentId                 = **哪个**内容实体（4 段式，不随修订改变）
contentVersion + checksum = 该实体的**哪个内容快照**（内容变了才变）
Learning                  = 学到**什么程度**（Learning 层，不在这里）
```

### 4.2 构造

`snapshot.ts:74-86`：

```ts
export function snapshotOf(
  contentId: string,
  v: { version: number; checksum: string; publishedAt?: string },
  schemaVersion: number = SCHEMA_VERSION,
): ContentSnapshot
```

`schemaVersion` 省略时取当前常量 —— 语义是「按当前结构理解这份快照」（`:72`）。

### 4.3 相等性判断

`snapshot.ts:97-102`：

```ts
export function isSameSnapshot(a?: ContentSnapshot | null, b?: ContentSnapshot | null): boolean {
  if (!a || !b) return false
  return (
    a.contentId === b.contentId &&
    a.contentVersion === b.contentVersion &&
    a.checksum === b.checksum
  )
}
```

**必须三者全等**（`:88-95`）：

> - 只比 `contentVersion`：不同内容（不同实体）恰好同 version 时会误判为同一份；
> - 只比 `checksum`：checksum 只描述内容本身，无法区分「哪个实体」的这份内容，
>   跨包同词（IELTS/CET 各有 abandon）时两份不同实体的内容可能共用指纹语义。
> 任一侧缺失（null/undefined）即为不同 —— **宁可判"不同"触发重新学习，
> 也不要误判"相同"跳过复习**。

### 4.4 ⚠️ 实测：零调用

| API | 定义位置 | 在 `src/` 内被引用次数 |
|---|---|---|
| `snapshotOf()` | `snapshot.ts:74` | **0** |
| `isSameSnapshot()` | `snapshot.ts:97` | **0** |
| `findRevision()` | `snapshot.ts:117` | **0** |
| `ContentSnapshot`（类型） | `snapshot.ts:57` | **0** |

→ 整个 `snapshot.ts`（128 行）是**已实现但未接线**的模块。
原因是学习记录还在用裸 `word` 做键，没有 ContentId 可用于构造快照。
详见 `03-architecture/LEARNING_ARCHITECTURE.md#4`。

---

## 5. 两个 checksum 的语义区分

契约 §4.5（`:256-267`）：

| 字段 | 含义 |
|---|---|
| `contentChecksum` | **规范化入库内容**的指纹 |
| `sources[].checksum` | **来源原始数据**的指纹 |
| `build.sourceChecksum` | 本次构建读入源数据的指纹 |

当前来源就是本仓 `words.json` ⇒ **三者同值**。

⚠️ 门禁第 17 项要求 `build.sourceChecksum === contentChecksum`（`validate.mjs:271`）：

```js
if (b.sourceChecksum !== manifest.contentChecksum) { fail(...); buildOk = false }
```

→ **这意味着当前架构下三者必须同值**。将来接原始 CSV / 上游文件时会分叉，
但**那时必须先改门禁**，否则会直接 FAIL。

契约 §4.5 结尾（`:265-267`）：

> 分叉本身就是 **provenance 的价值**：能回答「源数据没变，但规范化后入库内容变了」。

---

## 6. 门禁（第 16 / 17 项）

### 6.1 第 16 项：版本三元组自洽

`validate.mjs:244-262`：

```js
const rev = manifest.contentRevision    // 必须为正整数
const ver = manifest.contentVersion     // 必须为正整数
const history = Array.isArray(manifest.contentHistory) ? manifest.contentHistory : []
if (history.length === 0) fail('contentHistory 缺失或为空')
else {
  const hitEntry = [...history].reverse().find((e) => e?.checksum === manifest.contentChecksum)
  if (!hitEntry) fail('contentHistory 中不存在 checksum === contentChecksum 的条目')
  else if (hitEntry.version !== ver) fail(`命中条目 version=${hitEntry.version} ≠ contentVersion=${ver}`)
  else if (!(Number.isInteger(hitEntry.revision) && hitEntry.revision > 0 && hitEntry.revision <= rev))
    fail(`命中条目 revision 应 ≤ contentRevision`)
  else ok(`版本三元组自洽（revision=${rev} version=${ver} history=${history.length} 条，命中 revision=${hitEntry.revision}）`)
}
```

三条断言：

| # | 断言 |
|---|---|
| 1 | `contentRevision` / `contentVersion` 均为正整数 |
| 2 | `contentHistory` 非空，且存在 `checksum === contentChecksum` 的条目（取最近一条） |
| 3 | 该条目 `version === contentVersion`，且 `1 ≤ revision ≤ contentRevision` |

⚠️ 注意第 3 条是 `≤` 而非 `===` —— 这是**为回滚场景留的**（`:245-246` 注释）：

> 回滚场景：version 回到历史值 ⇒ 允许 `revision > 命中条目的 revision`（审计号只增不减）。

### 6.2 第 17 项：build 溯源

`validate.mjs:264-273`：

```js
const b = manifest.build
if (!b || typeof b !== 'object') fail('build 字段缺失（应为 {toolVersion,builtAt,sourceChecksum}）')
else {
  if (typeof b.toolVersion !== 'string' || !b.toolVersion) fail('build.toolVersion 缺失或为空')
  if (typeof b.builtAt !== 'string' || !b.builtAt || Number.isNaN(Date.parse(b.builtAt)))
    fail(`build.builtAt 不是合法时间：${b.builtAt}`)
  if (b.sourceChecksum !== manifest.contentChecksum) fail(`build.sourceChecksum ≠ contentChecksum`)
  else ok(`build 溯源完整（${b.toolVersion} @ ${b.builtAt}）`)
}
```

实测 `build` 字段内容（10 包一致）：

```json
{ "builtAt": "2026-09-26T13:59:06.588Z",
  "sourceChecksum": "sha256:5b6591b3…",
  "toolVersion": "content-build/1.1" }
```

`TOOL_VERSION = 'content-build/1.1'` 定义在 `build.mjs:57`。

---

## 7. 真实数据样本

### 7.1 全部 10 包的版本字段（实测）

| 包 | contentRevision | contentVersion | schemaVersion | contentHistory 条数 |
|---|---|---|---|---|
| ai-core | 1 | 1 | 4 | 1 |
| cet4 | 1 | 1 | 4 | 1 |
| cet6 | 1 | 1 | 4 | 1 |
| cloud-native | 1 | 1 | 4 | 1 |
| frontend | 1 | 1 | 4 | 1 |
| go-code | 1 | 1 | 4 | 1 |
| **ielts** | **2** | **2** | 4 | 1 |
| **kaoyan** | **2** | **2** | 4 | 1 |
| **toefl** | **2** | **2** | 4 | 1 |
| ts-code | 1 | 1 | 4 | 1 |

（数据源：`content-samples/MANIFESTS.md` 宽表 + 逐包 manifest 实测。）

**观察**：

- 只有 3 个 ECDICT 大包（ielts / kaoyan / toefl）被构建过两次；
  **revision 与 version 同步为 2** ⇒ 属于「新内容」分支（④），不是回滚分支（③）。
- 其余 7 包均为 `rev1/ver1`。
- **10 包的 `contentHistory` 都只有 1 条** ⇒ 仓内**没有任何回滚记录**。
  这与契约 §4.3 的自述一致（回滚行为「未固化为自动断言」）。

### 7.2 cet4 完整版本数据（逐字照抄）

```json
{
  "contentChecksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
  "contentHistory": [
    {
      "checksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
      "publishedAt": "2026-09-26",
      "revision": 1,
      "version": 1
    }
  ],
  "contentPublishedAt": "2026-09-26",
  "contentRevision": 1,
  "contentVersion": 1,
  "build": {
    "builtAt": "2026-09-26T13:59:06.588Z",
    "sourceChecksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
    "toolVersion": "content-build/1.1"
  },
  "schemaVersion": 4
}
```

**自洽性核对**（对照 §6.1 三条断言）：

| 断言 | 实测值 | 结论 |
|---|---|---|
| revision / version 为正整数 | `1` / `1` | ✅ |
| history 存在 `checksum === contentChecksum` 条目 | 是（rev1） | ✅ |
| 命中条目 `version === contentVersion` | `1 === 1` | ✅ |
| 命中条目 `1 ≤ revision ≤ contentRevision` | `1 ≤ 1 ≤ 1` | ✅ |
| `build.sourceChecksum === contentChecksum` | 两者相同 | ✅ |

### 7.3 ielts 的版本数据（对照，rev2/ver2）

```json
{
  "contentRevision": 2,
  "contentVersion": 2,
  "contentChecksum": "sha256:0e4c8089648b261a95394c9a5b1bea6d8877f828e903da196a3397e3dfdea71f",
  "build": { "toolVersion": "content-build/1.1", "…": "…" }
}
```

---

## 8. 对下游的约束（契约 §4.3）

| # | 约束 | 理由 |
|---|---|---|
| V-1 | 禁止假设 version 连续 | 回滚后新内容会跳号（实测 `1 → 4`） |
| V-2 | 禁止把 version 当数组下标 / 进度条 | 它是契约号，不是序号 |
| V-3 | 禁止把 version 塞进 ContentId | 每次修订换主键，学习记录全部失联（契约 `:19`） |
| V-4 | 判断内容身份只看 checksum | version 可被两个不同内容共用 |
| V-5 | 「同一快照」必须 contentId + contentVersion + checksum 三者全等 | `isSameSnapshot()` |
| V-6 | Learning 记录记的是 version + checksum，不是 revision | revision 是审计号，不参与相等性判断 |

`content/README.md:169-178` 给出学习记录应有的形态（设计态，未实现）：

```jsonc
{
  "contentId": "content:word:ecdict-ielts:abandon",
  "contentVersion": 2,
  "checksum": "sha256:bc6c8ee5…",
  "state": {}
}
```

---

## 9. 一句话结论

> 版本管理是 Content 层**工程化程度最高的部分**：四个版本字段各司其职、
> 三条构建铁律有明确实现、`contentHistory` 有回滚反查口径、门禁第 16/17 项做自洽校验、
> canonical checksum 与文件排版完全解耦。
> **唯一的实测缺口是 `snapshot.ts` 零调用** —— `snapshotOf` / `isSameSnapshot` / `findRevision`
> 三个 API 已实现但无任何使用方，因为学习记录还在用裸 `word` 做键，
> 无从获得构造快照所需的 `contentId`。
