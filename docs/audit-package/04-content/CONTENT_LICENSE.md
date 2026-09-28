# 内容许可（Content License）现状与缺口

> 状态：🔄 混合（已有：SPDX 结构化许可 + 3 项门禁；待建：rightsStatus 权利状态枚举、权利判定矩阵、运行时可查询接口）
>
> 本文只写实测事实。所有结论以「文件路径:行号」为证据。凡标注「📐 待建」「建议」者均为**规划或建议**，当前无实现。

---

## 1. 结论速览

| 维度 | 状态 | 证据 |
|---|---|---|
| 许可结构化（spdx / name / url / attributionRequired / commercialUse） | ✅ 已有 | `src/core/content/model/content.ts:108-117` |
| 每个包携带许可声明 | ✅ 已有（10/10 包，每包 1 条来源） | 逐包 `content/vocabulary/*/manifest.json` → `sources[0].license` |
| 构建侧许可常量注入 | ✅ 已有 | `scripts/content/build.mjs:58-59` |
| 许可门禁（结构完整性 + 外部来源须有 SPDX） | ✅ 已有（validate 第 7 项） | `scripts/content/validate.mjs:188-201` |
| `rightsStatus` 权利状态枚举（8 取值） | 📐 待建 | 全库 grep 零命中 |
| 权利判定矩阵（可否再分发 / 可否修改 / 可否商用 的组合判定） | 📐 待建 | 无实现 |
| 运行时可查询的许可接口（`getLicense(packageId)`） | 📐 待建 | `src/core/content/` 下无 license finder |
| 许可变更审计（历史许可 → 现许可的差异记录） | 📐 待建 | `contentHistory[]` 不含许可字段 |

**一句话**：许可已从「单字符串」升级为「结构化对象」（V4.1），但结构只覆盖了**协议本身**（MIT 是什么），未覆盖**权利状态**（这份内容我们凭什么权利使用它、能用到什么程度）。二者不是一回事。

---

## 2. 已有实现（✅）

### 2.1 类型定义

`src/core/content/model/content.ts:108-117`：

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

字段语义要点：

| 字段 | 必填 | 语义 | 注释原文 |
|---|---|---|---|
| `name` | 是 | 人类可读协议名 | — |
| `spdx` | 否（条件必填） | SPDX 标识符；未知来源留空 | `:109`「未知来源为空」 |
| `url` | 否 | 协议原文地址 | — |
| `attributionRequired` | 是 | 是否要求署名展示 | `:113`「CC BY 等」 |
| `commercialUse` | 否 | 是否允许商业使用 | `:115`「未知为 undefined（不可假定允许）」 |

`commercialUse` 的注释体现了一条保守默认：**不假定允许**。这是当前实现里唯一一处显式的权利姿态。

### 2.2 承载位置

许可不挂在包上，而是挂在**来源**上。`src/core/content/model/content.ts:98-106`：

```ts
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

`manifest.sources` 是**数组**（`:104` 注释「V4.1 升级：单一内容可能由 ECDICT + GitHub 数据集 + 自整理共同构成」），因此一个包理论上可以有多个不同许可的来源。

实测现状（遍历 `content/vocabulary/*/manifest.json`）：

| 包 | sources 条数 | 许可 |
|---|---|---|
| cet4 | 1 | MIT |
| cet6 | 1 | MIT |
| ielts | 1 | MIT |
| kaoyan | 1 | MIT |
| toefl | 1 | MIT |
| ai-core | 1 | Proprietary (self-curated) |
| cloud-native | 1 | Proprietary (self-curated) |
| frontend | 1 | Proprietary (self-curated) |
| go-code | 1 | Proprietary (self-curated) |
| ts-code | 1 | Proprietary (self-curated) |

**10 个包全部为单来源**。「多来源混合许可」这条设计路径已被类型支持，但**没有任何一个包实际使用**。

### 2.3 真实许可值（逐字段实测）

MIT 类（5 包：cet4 / cet6 / ielts / kaoyan / toefl）—— 以 cet4 为例，`content/vocabulary/cet4/manifest.json` → `sources[0]`：

```json
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
```

5 包的 `license` 对象**逐字节相同**（同一预置常量注入）。

自研类（5 包：ai-core / cloud-native / frontend / go-code / ts-code）—— 以 ai-core 为例：

```json
{
  "license": {
    "attributionRequired": false,
    "commercialUse": true,
    "name": "Proprietary (self-curated)"
  }
}
```

差异对照：

| 字段 | MIT 类（5 包） | 自研类（5 包） |
|---|---|---|
| `name` | `"MIT License"` | `"Proprietary (self-curated)"` |
| `spdx` | `"MIT"` | **缺失** |
| `url` | `"https://opensource.org/licenses/MIT"` | **缺失** |
| `attributionRequired` | `false` | `false` |
| `commercialUse` | `true` | `true` |

两点值得注意：

1. 自研包 `name` 写的是 `"Proprietary (self-curated)"`（专有 / 自整理），但 `commercialUse: true`。「专有」与「允许商用」在通常语义下并不必然相容 —— 这里的含义实际是「自研内容，我们当然可以商用」。这是**所有者的自我声明**，不是外部协议推导出的结论。
2. 自研包 `attributionRequired: false`，即自研内容不要求署名。这与 §2.1 的保守默认（`commercialUse` 未知则不假定允许）形成对比：自研包的宽松值是**已知事实**下的声明，不是默认值。

### 2.4 构建侧注入

`scripts/content/build.mjs:58-59`：

```js
const MIT  = { spdx: 'MIT', name: 'MIT License', url: 'https://opensource.org/licenses/MIT', attributionRequired: false, commercialUse: true }
const SELF = { name: 'Proprietary (self-curated)', attributionRequired: false, commercialUse: true }
```

许可**不是**从源数据（如 `src/` 下的原始词表文件）读取的，而是由构建脚本按包 id 查表注入。`scripts/content/build.mjs:45-48` 的 `SOURCE` 映射决定每个包的来源族：

```js
const SOURCE = { ... }   // :45-48
const namespaceOf = ...  // :49
```

因此**新增一个包时，许可由代码里的常量决定，而不是由数据决定**。这意味着：

- 优点：许可格式不会因人工编辑而漂移（10 包值完全一致）。
- 代价：引入第三方数据集时，必须**改构建脚本**才能登记其真实协议，数据文件本身无法自证许可。

### 2.5 门禁（✅ validate 第 7 项）

`scripts/content/validate.mjs:188-201`：

```js
// 7. License 门禁（结构化 + 外部来源须有 SPDX）
let licenseOk = true
for (const s of sources) {
  const lic = s.license
  if (!lic || typeof lic !== 'object') { fail(`source(${s.origin}) license 非结构化对象（需 {spdx,name,attributionRequired}）`); licenseOk = false; continue }
  if (!lic.name) { fail(`source(${s.origin}) license.name 缺失`); licenseOk = false }
  if (typeof lic.attributionRequired !== 'boolean') { fail(`source(${s.origin}) license.attributionRequired 必须为布尔`); licenseOk = false }
  // 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX
  if (!lic.spdx && !String(s.origin).includes('curated')) {
    fail(`外部来源 ${s.origin} 缺 license.spdx（未知协议内容不得入库）`)
    licenseOk = false
  }
}
if (licenseOk && sources.length > 0) ok(`license 结构化（${sources.map((s) => s.license?.spdx ?? 'self').join(', ')}）`)
```

门禁实际检查 3 件事：

| # | 检查 | 失败信息 |
|---|---|---|
| 1 | `license` 是对象 | 「license 非结构化对象」 |
| 2 | `license.name` 非空 | 「license.name 缺失」 |
| 3 | `license.attributionRequired` 是布尔 | 「必须为布尔」 |
| 4 | 外部来源必须有 `spdx` | 「未知协议内容不得入库」 |

**第 4 条的判定方式存在脆弱点**（实测）：

判定「是否为外部来源」靠的是 **`origin` 字符串是否包含子串 `curated`**（`:196`）：

```js
if (!lic.spdx && !String(s.origin).includes('curated'))
```

当前 5 个自研包的 `origin` 值恰好都含 `curated`，5 个 MIT 包的 `origin` 为 `ECDICT`（不含），所以判定结果正确。但这是**字符串约定**，不是结构化字段：

- 如果新包的 `origin` 写成 `"self-made"`、`"internal"`、`"in-house"` 等不含 `curated` 的词，且未填 `spdx` → 门禁会**误报 FAIL**（把自研当外部）。
- 反过来，若某个真正的第三方来源 `origin` 里恰好含 `curated`（如 `"curated-by-community"`），则**漏放**（外部缺 SPDX 却通过）。
- `origin` 是自由文本，无任何格式约束（`ContentSource.origin: string`，`content.ts:99` 无注释、无正则限制）。

**建议方向（📐）**：把「来源族」显式化为枚举字段，例如在 `ContentSource` 增加 `originKind: 'self' | 'external'`，门禁改为读该字段；`origin` 保留为人类可读描述。这样判定不再依赖子串匹配。

### 2.6 门禁未覆盖的部分（实测）

第 7 项**不检查**下列内容：

- `commercialUse` 是否存在或为布尔（`ContentLicense:108-117` 中它是可选的，注释 `:115` 明确「未知为 undefined」）—— 允许留空，门禁不拦。
- `url` 是否可达 / 是否为合法 URL（仅类型上可选）。
- `spdx` 是否为**有效的 SPDX 标识符**（只判「非空」，`"MIT"` 与 `"foobar"` 同等通过）。
- 自研包的 `name: 'Proprietary (self-curated)'` 与 `commercialUse: true` 是否语义自洽（无一致性校验）。
- 同一包内**多条** `sources` 之间的许可是否相容（当前 10 包均单来源，该路径未被执行）。

---

## 3. 待建：`rightsStatus` 权利状态枚举（📐）

### 3.1 需求侧要求的取值

需求文档要求的权利状态枚举共 8 取值：

```
owned / licensed / public-domain / open-license / user-supplied / research-only / unknown / restricted
```

**当前无实现**。全库检索 `rightsStatus`、`rights`、`redistribute`、`modification` 等关键词：`src/core/content/**` 与 `content/vocabulary/*/manifest.json` 均零命中。`ContentLicense`（`content.ts:108-117`）只有 5 个字段，不含任何权利状态字段。

### 3.2 为什么现有 5 字段不够用

`ContentLicense` 描述的是**协议**，`rightsStatus` 描述的是**我们的权利处境**。二者不可互推：

| 问题 | 现有字段能回答吗 | 说明 |
|---|---|---|
| 这份内容从哪来？ | 部分 | `origin`（自由文本）；无结构化分类 |
| 协议叫什么？ | ✅ | `name` / `spdx` / `url` |
| 要署名吗？ | ✅ | `attributionRequired` |
| 能商用吗？ | ✅（但允许留空） | `commercialUse` |
| **能再分发吗？** | ❌ | 无字段 |
| **能修改吗？** | ❌ | 无字段 |
| **只能用于研究吗？** | ❌ | 无字段 |
| **是我们自己拥有的吗？** | ❌ | 无字段 |
| **是用户提交的内容吗？** | ❌ | 无字段 |

例如：`cc-by-nd-4.0`（署名-禁演绎）与 `cc-by-4.0` 在现有字段下**完全无法区分** —— 两者都是 `attributionRequired: true`、`commercialUse: true`，但前者禁止修改。若未来引入此类数据，管线无法表达「此内容可展示但不可衍生」。

### 3.3 建议设计（📐，非现有实现）

以下为**建议**，当前代码中不存在。

**方案 A：在 `ContentSource` 上增加权利状态字段**（推荐，改动最小，与现有 `license` 并列）

```ts
// 建议：新增枚举
export type RightsStatus =
  | 'owned'           // 自有内容，权利完整
  | 'licensed'        // 经授权使用（协议见 license.spdx）
  | 'public-domain'   // 公有领域，无限制
  | 'open-license'    // 开放许可（MIT/CC-BY 等），按其条款使用
  | 'user-supplied'   // 用户提交，权利归用户
  | 'research-only'   // 仅限研究/非商业用途
  | 'unknown'         // 权利状态未知（须按最保守方式处理）
  | 'restricted'      // 明确受限，不得分发

// 建议：扩展 ContentSource
export interface ContentSource {
  origin: string
  originKind: 'self' | 'external'   // 见 §2.5 建议
  rightsStatus: RightsStatus        // 建议：必填，无默认值
  license: ContentLicense
  importedAt?: string
  commit?: string
  checksum?: string
}
```

**关键设计点（建议）**：

1. **`rightsStatus` 必填、无默认值**。理由：任何默认值都会在「作者忘了填」时静默放行一批权利不明的内容。要求显式填写 `unknown` 比让字段留空更安全 —— 留空无法区分「确认为 unknown」与「忘了填」。
2. **与 `commercialUse` 的一致性约束**（建议加门禁）：当 `rightsStatus === 'research-only'` 时，`commercialUse` 必须为 `false` 或省略；当 `rightsStatus === 'restricted'` 时，`commercialUse` 必须为 `false`。二者矛盾时应 FAIL。
3. **`public-domain` / `owned` 可省略 `spdx`**（与现有 §2.5 第 4 条「外部来源须有 SPDX」等价，但判定依据从 `origin` 子串改为 `rightsStatus`）。
4. **`rightsStatus` 建议写进 `contentChecksum` 的规范化范围之外**（即不参与 `canonicalize()`）。理由见 §3.5。

**方案 B：在包级 manifest 上增加 `rights` 块**

把多个来源的权利状态**汇总**为一个包级视图（如「本包中权利最严的来源决定了本包的对外权利」）。改动更大，且会引入「汇总规则」这一额外复杂度。建议先做方案 A，等确实出现多来源包时再评估是否需要 B。

### 3.4 建议的权利判定矩阵（📐）

建议在 `src/core/content/` 下新增一个**纯函数**，把 `(rightsStatus, license)` 映射到 3 个布尔决策：`canDisplay` / canRedistribute / canModify。**供 UI 与导出功能调用，避免各处自行判断。**

| `rightsStatus` | `canDisplay`（可展示） | `canRedistribute`（可再分发） | `canModify`（可修改） |
|---|---|---|---|
| `owned` | ✅ | ✅ | ✅ |
| `public-domain` | ✅ | ✅ | ✅ |
| `open-license` | ✅ | ✅ | 取决于 `spdx`（如 `CC-BY-ND-*` ⇒ ❌） |
| `licensed` | ✅ | 取决于授权条款（默认 ❌，需显式声明） | 取决于授权条款（默认 ❌） |
| `user-supplied` | ✅（仅对提交者本人） | ❌ | ✅（本人） |
| `research-only` | ✅ | ❌ | ❌ |
| `unknown` | ⚠️ 保守：可展示但**禁止导出** | ❌ | ❌ |
| `restricted` | ❌ | ❌ | ❌ |

`unknown` 行的处置建议：**可展示但禁止导出**，理由是当前库内已有内容在既无 `spdx` 也无权利声明的情况下进了词库（自研包），若对 `unknown` 直接禁止展示会误伤。保守而可用的折中是「读可以，往外带不行」。

### 3.5 建议：`rightsStatus` 不进 `contentChecksum`（📐）

`contentChecksum` 由 `scripts/content/canonical.mjs:54-71` 的 `canonicalize()` 计算，其字段顺序白名单在 `:36`（`CANONICAL_FIELD_ORDER`），当前仅覆盖词条的 `[word, translation, phonetic, definition]`（`partOfSpeech` 已于 P1.6-E 移除）。

**建议**：权利字段（`rightsStatus` / `originKind`）保持在词条与 `contentChecksum` 之外，只写在 `manifest.sources[].license` 同级的元数据位置。理由：

- 权利声明是**关于数据的元数据**，不是数据本身。补齐权利声明不应被解读为「内容变了」。
- 若进入 `contentChecksum`，补一次权利声明就会触发 `contentVersion` 自增（`build.mjs:105-160` 的版本三元组三分支），导致对外契约版本无谓抖动。
- 已验证的相关事实：`sources[].checksum` 参与 `canonicalize(next)` 的幂等比较但不参与 `contentChecksum` 计算，因此**补 provenance/license 类元数据不会改变 `contentVersion`**（详见 `CONTENT_VERSIONING.md` §两个 checksum）。建议 `rightsStatus` 遵循同一模式。

---

## 4. 许可与来源的关系（现状说明）

许可（`license`）与来源（`origin` / `sources[]`）的耦合关系现状：

```
manifest.sources[]           ← 数组，允许多条
  └─ [i].origin              ← 来源名（自由文本）
  └─ [i].license             ← 该来源的许可（结构化）
  └─ [i].importedAt / commit / checksum
```

即：**许可是来源的属性，不是包的属性**。这一点在类型上明确（`ContentLicense` 挂在 `ContentSource` 内，`content.ts:100-101`），在实际数据上因 10 包均单来源而未体现出多来源差异。

一个包的对外许可口径因此需要「聚合多个来源的许可」才能得出 —— **当前无该聚合逻辑**（无 `getPackageLicense()` 之类的函数）。UI 若需要展示包的许可信息，只能直接读 `manifest.sources[0].license`。

**建议方向（📐）**：新增 `getPackageRights(packageId)` finder，返回聚合后的权利视图（含「最严格来源决定包级权利」的规则），与 `RightsStatus` 对齐。

---

## 5. 门禁与契约的对应关系

| 门禁项 | 位置 | 检查内容 | 与本文关系 |
|---|---|---|---|
| 第 6 项 | `validate.mjs:182-186` | `sources[]` 非空；`checksum` 一致 | 保证 `license` 一定有宿主（`sources` 不能为空） |
| 第 7 项 | `validate.mjs:188-201` | 许可结构化 + 外部来源须有 SPDX | 本文 §2.5 |
| 第 12(d) 项 | `validate.mjs:342-351` | assets 相关检查 | 与 `asset:` 前缀模型的许可无交叉 |
| 第 17 项 | `validate.mjs:264-273` | `build.sourceChecksum === contentChecksum` | 许可变更不影响该项（见 §3.5） |

契约侧对应条款见根目录 `CONTENT_CONTRACT.md`（本文不复制原文，只索引）。许可相关不变式在 `I-` 系列中的归属见 `CONTENT_CONTRACT.md` 的 I-1~I-20 清单。

---

## 6. 实测小结

| # | 事实 | 证据 |
|---|---|---|
| 1 | 许可为结构化对象，5 字段 | `src/core/content/model/content.ts:108-117` |
| 2 | 许可挂在 `sources[]`（来源）上，不是包上 | `content.ts:98-106` |
| 3 | 10 包全部单来源，其中 5 包 MIT、5 包自研 | 逐包 `manifest.json` → `sources` |
| 4 | 自研包只有 `name`，无 `spdx` / `url` | ai-core / cloud-native / frontend / go-code / ts-code |
| 5 | 许可由 `build.mjs` 常量注入，非从数据读取 | `scripts/content/build.mjs:58-59` |
| 6 | 门禁第 7 项靠 `origin` 子串 `curated` 判「是否外部来源」 | `validate.mjs:196` |
| 7 | 门禁不校验 `spdx` 有效性、不校验 `commercialUse` 存在性 | `validate.mjs:188-201`（无相关分支） |
| 8 | `rightsStatus` 8 取值枚举**无任何实现** | 全库零命中 |
| 9 | 无可再分发 / 可修改 / 仅研究 等权利字段 | `content.ts:108-117` 无对应字段 |
| 10 | 无包级许可聚合接口 | `src/core/content/` 下无此 finder |
| 11 | `unknown` 未定义处置方式；`commercialUse` 留空时注释说「不可假定允许」但无强制 | `content.ts:115` 注释 vs 门禁未拦 |

---

## 7. 建议清单（📐 全部为建议，当前无实现）

| # | 建议 | 理由 | 参考位置 |
|---|---|---|---|
| L-1 | 新增 `RightsStatus` 枚举（8 取值）并设为必填 | 现有 5 字段无法表达 7 个合规判断点中的 6 个 | `content.ts:108-117` |
| L-2 | 新增 `originKind: 'self' \| 'external'` 结构化字段 | 替代 `origin` 子串匹配的脆弱判定 | `validate.mjs:196` |
| L-3 | 新增 `getPackageRights(packageId)` 聚合 finder | 多来源包的对外权利口径需统一计算 | `src/core/content/` |
| L-4 | 门禁增加 `rightsStatus` ↔ `commercialUse` 一致性校验 | 防「仅研究」与「可商用」矛盾 | `validate.mjs:188-201` |
| L-5 | 门禁增加 `spdx` 值有效性校验（对照 SPDX 官方列表） | 现只判非空，`"foobar"` 亦通过 | `validate.mjs:196-199` |
| L-6 | 权利字段不进 `contentChecksum` 的规范化范围 | 补元数据不应触发 `contentVersion` 抖动 | `canonical.mjs:36` `CANONICAL_FIELD_ORDER` |
| L-7 | 定义 `unknown` 的运行时处置（建议：可展示、禁止导出） | 避免权利不明内容被静默外流 | 新增 |
| L-8 | 自研包 `name: 'Proprietary (self-curated)'` 与 `commercialUse: true` 的语义在注释中明确 | 现仅靠字段值传达，无文字说明 | `build.mjs:59` |
