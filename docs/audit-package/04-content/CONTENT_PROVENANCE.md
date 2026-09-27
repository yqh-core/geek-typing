# 内容来源溯源（CONTENT_PROVENANCE）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`sources[]` 结构（`origin` / `license` / `importedAt` / `commit` / `checksum`）
> 📐 **待建**：需求文档要求的 15 个 provenance 字段中，**仅 5 个已落地**，10 个缺口
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 关联：`13-acceptance/GAP_ANALYSIS.md#E-2`

---

## 1. 需求文档要求的字段 vs 现有字段（逐项对照）

需求文档（《最新要求.docx》第四节 Content Provenance）要求每个内容来源可追溯以下信息。
下表逐项核对**当前是否已有**：

| # | 需求字段 | 现状 | 落地位置 / 缺口 | 备注 |
|---|---|---|---|---|
| 1 | `contentId` | ✅ **已有** | `manifest.id`（4 段式 ContentId） | 在 manifest 顶层，不在 `sources[]` 内 |
| 2 | `source` | ✅ **已有**（对应 `origin`） | `manifest.sources[].origin` | 字段名不同：`origin` vs `source` |
| 3 | `sourceUrl` | ❌ **缺失** | — | 无从知道来源数据从哪个 URL 取得 |
| 4 | `author` | ❌ **缺失** | — | |
| 5 | `publisher` | ❌ **缺失** | — | |
| 6 | `license` | ✅ **已有**（结构化对象） | `manifest.sources[].license` | 见 `04-content/CONTENT_LICENSE.md` |
| 7 | `licenseUrl` | ⚠️ **部分** | `sources[].license.url` | 仅 5 个 MIT 包有；5 个自研包无 |
| 8 | `copyright` | ❌ **缺失** | — | 无版权声明文本字段 |
| 9 | `commercialUse` | ✅ **已有** | `sources[].license.commercialUse` | 实测 10 包全为 `true` |
| 10 | `redistribution` | ❌ **缺失** | — | 无「可否再分发」字段 |
| 11 | `modification` | ❌ **缺失** | — | 无「可否修改」字段 |
| 12 | `attribution` | ✅ **已有**（对应 `attributionRequired`） | `sources[].license.attributionRequired` | 布尔；实测 10 包全为 `false`（无署名文本） |
| 13 | `downloadDate` | ⚠️ **部分** | `sources[].importedAt` | 语义近似（导入日期 vs 下载日期），实测全为 `"2026-09-26"` |
| 14 | `checksum` | ✅ **已有** | `sources[].checksum` | 完整 SHA-256，不截断 |
| 15 | `researchOnly` / 使用限制 | ❌ **缺失** | — | 见 `04-content/CONTENT_LICENSE.md#rightsStatus` |

### 1.1 统计

| 状态 | 数量 | 字段 |
|---|---|---|
| ✅ 完全已有 | **5** | `contentId`、`source`（=origin）、`license`、`commercialUse`、`checksum` |
| ⚠️ 部分 / 需改名 | **2** | `licenseUrl`（仅 MIT 包有）、`downloadDate`（=importedAt）、`attribution`（=attributionRequired，仅布尔无文本） |
| ❌ 完全缺失 | **7** | `sourceUrl`、`author`、`publisher`、`copyright`、`redistribution`、`modification`、`researchOnly` |

> 严格计数：**5 项已有 / 3 项部分或需改名 / 7 项缺失**（合计 15 项）。
> `GAP_ANALYSIS.md#E-2` 的简写是「缺 `sourceUrl`/`author`/`publisher`/`copyright`/`downloadDate`」，
> 本表是逐项展开后的完整口径。

**字段覆盖率：5 / 15 ≈ 33%。**

---

## 2. ✅ 已有：`ContentSource` 结构

### 2.1 类型定义

`src/core/content/model/content.ts:97-106`：

```ts
/** 多来源溯源（V4.1 升级：单一内容可能由 ECDICT + GitHub 数据集 + 自整理共同构成） */
export interface ContentSource {
  origin: string
  /** 结构化许可证（V4.1 升级：SPDX + 归属要求，替代单字符串） */
  license: ContentLicense
  importedAt?: string
  commit?: string
  /** 完整 SHA-256（V4.1：不再截断，provenance 需要可复现） */
  checksum?: string
}
```

**5 个字段**，全部可选除 `origin` 与 `license`。

| 字段 | 必选 | 说明 | 实测填充率 |
|---|---|---|---|
| `origin` | ✅ | 来源标识（自由文本） | **10 / 10** |
| `license` | ✅ | 结构化许可对象 | **10 / 10** |
| `importedAt` | ➖ | 导入日期 | **10 / 10**（全为 `"2026-09-26"`） |
| `commit` | ➖ | 上游 commit | **0 / 10** |
| `checksum` | ➖ | 来源原始数据指纹 | **10 / 10**（由 build 自动写入） |

### 2.2 `ContentLicense` 结构

`model/content.ts:108-117`：

```ts
export interface ContentLicense {
  /** SPDX 标识（MIT / CC-BY-4.0 ...）；未知来源为空 */
  spdx?: string
  name: string
  url?: string
  /** 是否要求署名展示（CC BY 等） */
  attributionRequired: boolean
  /** 是否允许商业使用；未知为 undefined（不可假定允许） */
  commercialUse?: boolean
}
```

⚠️ `commercialUse` 的语义细节（`:115` 注释原文）：

> 是否允许商业使用；**未知为 `undefined`（不可假定允许）**

→ 「未知」与「允许」是两个不同状态，`undefined` 不等于 `true`。这是正确的合规默认值。

---

## 3. 真实数据：全部 10 个包的 `sources[]`

### 3.1 宽表（实测）

| 包 | `origin` | `license.name` | `license.spdx` | `license.url` | `attributionRequired` | `commercialUse` | `importedAt` |
|---|---|---|---|---|---|---|---|
| ai-core | `curated in-repo (2026 AI 核心词库)` | `Proprietary (self-curated)` | — | — | `false` | `true` | `2026-09-26` |
| cet4 | `ECDICT` | `MIT License` | `MIT` | `https://opensource.org/licenses/MIT` | `false` | `true` | `2026-09-26` |
| cet6 | `ECDICT` | `MIT License` | `MIT` | 同上 | `false` | `true` | `2026-09-26` |
| cloud-native | `curated in-repo (云原生词库)` | `Proprietary (self-curated)` | — | — | `false` | `true` | `2026-09-26` |
| frontend | `curated in-repo (前端词库)` | `Proprietary (self-curated)` | — | — | `false` | `true` | `2026-09-26` |
| go-code | `curated in-repo (Go 代码词库)` | `Proprietary (self-curated)` | — | — | `false` | `true` | `2026-09-26` |
| ielts | `ECDICT` | `MIT License` | `MIT` | 同上 | `false` | `true` | `2026-09-26` |
| kaoyan | `ECDICT` | `MIT License` | `MIT` | 同上 | `false` | `true` | `2026-09-26` |
| toefl | `ECDICT` | `MIT License` | `MIT` | 同上 | `false` | `true` | `2026-09-26` |
| ts-code | `curated in-repo (TS 代码词库)` | `Proprietary (self-curated)` | — | — | `false` | `true` | `2026-09-26` |

**来源族分布**：`ECDICT` 5 包 / `curated in-repo` 5 包。

### 3.2 完整样本（`cet4`，逐字照抄）

```json
"sources": [
  {
    "checksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
    "importedAt": "2026-09-26",
    "license": {
      "attributionRequired": false,
      "commercialUse": true,
      "name": "MIT License",
      "spdx": "MIT",
      "url": "https://opensource.org/licenses/MIT"
    },
    "origin": "ECDICT"
  }
]
```

### 3.3 完整样本（`ts-code`，自研许可）

```json
"sources": [
  {
    "checksum": "sha256:9f34b063a8523022cdb7f2756f7ea7d0cc83ca4e0e6c74c13a75007530d0ad59",
    "importedAt": "2026-09-26",
    "license": {
      "attributionRequired": false,
      "commercialUse": true,
      "name": "Proprietary (self-curated)"
    },
    "origin": "curated in-repo (TS 代码词库)"
  }
]
```

⚠️ 注意：`sources[0].importedAt` 是**手写**字段（不在 `VERSION_FIELDS` 里），
而 `checksum` 被 build 覆盖写入（`build.mjs:103`）：

```js
const sources = migrateSources(m, id).map((s) => ({ ...s, checksum }))
```

→ 即：**`sources[].checksum` 不允许手写**，build 会无条件覆盖为 `sha256Canonical(words)`。
契约 §7.1「禁止手改」列已包含 `sources[].checksum`（`:387-388`）。

---

## 4. 两个 checksum 的区分（关键）

| 字段 | 指纹对象 | 计算处 | 当前值 |
|---|---|---|---|
| `manifest.contentChecksum` | **规范化入库内容** | `build.mjs:102` `sha256Canonical(words)` | `sha256:5b6591b3…`（cet4） |
| `sources[].checksum` | **来源原始数据** | `build.mjs:103`（当前同一值） | 同上 |
| `build.sourceChecksum` | 本次构建读入源数据 | `build.mjs:176` | 同上 |

### 4.1 当前为什么同值

`build.mjs:18-20`（文件头注释原文）：

> 当前来源就是本仓 words.json ⇒ 二者同值；将来接入「导入原始 CSV / 上游文件」
> 时，`sources[].checksum` 应改算**原始字节**的 sha256，二者即刻分叉 —— 这正是
> provenance（溯源）存在的意义：能回答「源数据没变，但入库内容变了（规范化改过）」。

### 4.2 分叉的前提条件

⚠️ 一旦分叉，**门禁第 17 项会 FAIL**（`validate.mjs:271`）：

```js
if (b.sourceChecksum !== manifest.contentChecksum) {
  fail(`build.sourceChecksum(${b.sourceChecksum}) ≠ contentChecksum(${manifest.contentChecksum})`)
  buildOk = false
}
```

→ 接入原始数据源时**必须先改门禁**，把「必须相等」改为「分别校验」。
这是契约 §0 变更流程要求的一步（「先改契约，后改门禁，再回归」）。

---

## 5. 迁移兼容逻辑

`build.mjs:77-85` 的 `migrateSources()` 支持旧格式迁移：

```js
function migrateSources(raw, id) {
  if (Array.isArray(raw.sources)) return raw.sources.map((s) => ({
    ...s,
    license: typeof s.license === 'string' ? (s.license === 'MIT' ? MIT : SELF) : s.license,
  }))
  const src = raw.source ?? {}                    // ← 旧单来源字段
  const license = typeof src.license === 'string'
    ? (src.license === 'MIT' ? MIT : SELF)
    : (src.license ?? SELF)
  return [{ origin: src.origin ?? (SOURCE[id] === 'ecdict' ? 'ECDICT' : 'curated in-repo'),
            license, importedAt: src.importedAt }]
}
```

迁移规则（`build.mjs:7-8`）：

> V4.1 manifest 迁移：`source{}` → `sources[]`、license 字符串 → 结构化、
> `bank:x` → `content:vocabulary:<ns>:x`（4 段式 ContentId）。

旧字段最终被删除（`build.mjs:190`）：

```js
delete next.source    // 旧单来源字段，迁移后移除
```

预置许可常量（`build.mjs:58-59`）：

```js
const MIT  = { spdx: 'MIT', name: 'MIT License', url: 'https://opensource.org/licenses/MIT',
               attributionRequired: false, commercialUse: true }
const SELF = { name: 'Proprietary (self-curated)', attributionRequired: false, commercialUse: true }
```

→ 实测数据中自研包 `license` 恰好等于 `SELF`（无 `spdx`、无 `url`），可确认走的是这条迁移路径。

---

## 6. 门禁：第 6 / 7 项

### 6.1 第 6 项：checksum 一致性

`validate.mjs:182-186`：

```js
const sources = manifest.sources ?? []
if (sources.length === 0) fail('sources 为空（V4.1 起为数组，至少一条来源）')
else if (sources.every((s) => s.checksum === canonicalSum)) ok('checksum 一致（canonical SHA-256）')
else fail('checksum 漂移：sources[].checksum 与 words.json 不符 → 运行 npm run content:build')
```

### 6.2 第 7 项：License 门禁

`validate.mjs:188-201`：

```js
for (const s of sources) {
  const lic = s.license
  if (!lic || typeof lic !== 'object') { fail(`source(${s.origin}) license 非结构化对象`); licenseOk = false; continue }
  if (!lic.name) { fail(`source(${s.origin}) license.name 缺失`); licenseOk = false }
  if (typeof lic.attributionRequired !== 'boolean') { fail(`source(${s.origin}) license.attributionRequired 必须为布尔`); licenseOk = false }
  // 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX
  if (!lic.spdx && !String(s.origin).includes('curated')) {
    fail(`外部来源 ${s.origin} 缺 license.spdx（未知协议内容不得入库）`)
    licenseOk = false
  }
}
```

**门禁能做与不能做的**：

| 能校验 | 不能校验 |
|---|---|
| `license` 是结构化对象 | `license` 声明**是否真实**（即 MIT 是否真的适用） |
| `license.name` 非空 | `origin` 是否真实（自由文本，无格式约束） |
| `attributionRequired` 是布尔 | `sourceUrl` / `author` / `publisher` 是否提供（**字段不存在**） |
| 非 curated 来源必须有 `spdx` | 许可的实际法律效力 |

⚠️ **关键限制**（`validate.mjs:196` 注释）：

```js
// 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX
if (!lic.spdx && !String(s.origin).includes('curated')) { ... }
```

判定依据是 **`origin` 字符串里是否包含 `curated`** —— 这是一个**自由文本子串匹配**。
若有人把 `origin` 写成 `"Curated data"`（大写 C）或 `"self-curated"`，判定结果会不同。

**实测风险**：当前 10 包 `origin` 分别为 `ECDICT`（×5）与
`curated in-repo (…)`（×5），恰好都落在预期分支，无实际误判。
但这是一个**脆弱约定**（依赖命名前缀），不是结构化字段。

**建议**（标注为「建议」，非现状）：
若未来引入 `rightsStatus` 枚举（见 `04-content/CONTENT_LICENSE.md`），
应把「是否自维护」从 `origin` 子串匹配改为读该枚举，避免命名变体导致门禁失效。

### 6.3 第 12(d) 项：duplicate source

`validate.mjs:306-310`：

```js
const origins = sources.map((s) => s?.origin)
const dupOrigin = [...new Set(origins.filter((o, i) => origins.indexOf(o) !== i))]
if (dupOrigin.length === 0) ok(`无 duplicate source（${origins.length} 条来源）`)
else fail(`duplicate source origin：${dupOrigin.join(', ')}`)
```

语义：**同一 `origin` 在 `sources[]` 里不得出现两次**。
实测：10 包各 1 条来源，无重复。

---

## 7. 需求文档强调的一条要求

`GAP_ANALYSIS.md#E-1/E-2` 末段（`:169`）：

> **需求文档反复强调"绝对不能把 GitHub 素材直接塞进网站"。**
> 当前架构**兼容**这一要求（`sources` 已是结构化对象），但**字段不足以支撑合规判断**。

逐项拆解「为什么字段不足」：

| 要判断的问题 | 需要的字段 | 现状 |
|---|---|---|
| 这份内容的许可允许商用吗？ | `commercialUse` | ✅ 有 |
| 允许再分发吗？ | `redistribution` | ❌ **无** |
| 允许修改后分发吗？ | `modification` | ❌ **无** |
| 必须署名吗？署名给谁？ | `attributionRequired` + `attribution` 文本 | ⚠️ 有布尔，**无署名文本** |
| 版权归谁？ | `copyright` / `author` / `publisher` | ❌ **全无** |
| 原始数据从哪个 URL 来的？可复现吗？ | `sourceUrl` | ❌ **无** |
| 内容是「自有 / 已授权 / 公有领域 / 受限」？ | `rightsStatus` 枚举 | ❌ **无** |

→ **7 个合规判断点中，只有 1 个（商用）可以完全回答。**
这是 `04-content/CONTENT_LICENSE.md` 要解决的问题。

---

## 8. 建议方向（标注为「建议」）

> 以下为审计建议，**不是项目已承诺的路线**。任何字段新增都须走契约 §0 变更流程
> （先改契约 → 改门禁 → 全量回归 → commit message 含 `[CONTRACT CHANGE]`）。

### 8.1 建议扩展的 `ContentSource` 字段

```ts
interface ContentSource {
  // ── 已有 ──
  origin: string
  license: ContentLicense
  importedAt?: string
  commit?: string
  checksum?: string

  // ── 建议新增（对应需求文档）──
  sourceUrl?: string          // 原始数据 URL，可复现
  author?: string             // 作者
  publisher?: string          // 出版方 / 数据发布方
  copyright?: string          // 版权声明原文
  attribution?: string        // 署名文本（attributionRequired 为 true 时必填）
  redistribution?: boolean    // 是否允许再分发
  modification?: boolean      // 是否允许修改
  downloadDate?: string       // 与 importedAt 区分：前者是取数时间，后者是入库时间
}
```

### 8.2 建议的落地顺序

| 顺序 | 建议项 | 理由 |
|---|---|---|
| 1 | `rightsStatus` 枚举 | 见 `04-content/CONTENT_LICENSE.md#5`，它决定其他字段是否必填 |
| 2 | `sourceUrl` | 可复现性的最低要求；缺失则 provenance 无法验证 |
| 3 | `attribution`（文本）+ 门禁（`attributionRequired === true` 时必填） | 直接对应法律义务 |
| 4 | `redistribution` / `modification` | 对应「不能把 GitHub 素材直接塞进网站」的合规判断 |
| 5 | `author` / `publisher` / `copyright` | 展示与举证用 |
| 6 | `downloadDate` | 与 `importedAt` 的语义区分（当前 `importedAt` 可兼任） |

### 8.3 ⚠️ 迁移注意

若新增字段，**`contentHistory` 与 checksum 的处理需明确**：

`ContentSource` 在 `manifest` 内，**不参与 `sha256Canonical(words)`**（后者只算 words.json）。
但 `sources` 参与 `canonicalize(next)` 的幂等比较（`build.mjs:194`），
因此：

- 仅补 provenance 字段、不改 `words.json` ⇒ `contentChecksum` 不变 ⇒ `contentVersion` **不变** ✅
- 这正是期望行为：**溯源信息的变化不应被当作「内容变了」**
  （`contentChecksum` 的语义是「规范化入库内容的指纹」，不含元数据）

→ 这是一个**已被架构正确支持**的场景，无需改 gate。

---

## 9. 一句话结论

> `sources[]` 是一个 **V4.1 升级后结构正确的多来源溯源数组**（5 个字段，含结构化 license 对象 + 完整 SHA-256），
> 10 包全部填充，有 License 门禁（第 7 项）与 checksum 门禁（第 6 项）守护，
> 并有两个 checksum 语义区分的明确设计（入库内容 vs 来源原始数据）。
> 但需求文档要求的 **15 个 provenance 字段中只有 5 个落地（33%）**，
> 7 个完全缺失（`sourceUrl` / `author` / `publisher` / `copyright` / `redistribution` /
> `modification` / `researchOnly`）。
> 后果：**7 个合规判断点里只有「可否商用」1 个能完全回答** ——
> 这正是 `GAP_ANALYSIS.md#E-1/E-2` 所说的「架构兼容，但字段不足以支撑合规判断」。
