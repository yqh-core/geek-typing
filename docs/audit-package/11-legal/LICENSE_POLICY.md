# 许可政策（License Policy）

> 状态：🔄 混合
> **已有**：内容包的来源与许可**结构化元数据**真实存在且完整（10 个包实测）
> **待建**：`rightsStatus` 权利状态体系、来源字段的完整集、许可兼容性自动检查
> 实测环境：Windows 11 / Git Bash，仓库 `/d/work/geek-typing`

---

## 1. 实测事实总览

### 1.1 内容许可元数据：真实且完整 ✅

实测 10 个 vocabulary 包的 `manifest.json`，**每一个 `sources[]` 都有结构化 `license` 对象**（不是自由文本）：

| 包 | namespace | 来源 origin | 许可 | SPDX | 词数 | 策略 |
|---|---|---|---|---|---|---|
| `ielts` | `ecdict-ielts` | ECDICT | MIT License | ✅ `MIT` | 3000 | lazy |
| `kaoyan` | `ecdict-kaoyan` | ECDICT | MIT License | ✅ `MIT` | 3000 | lazy |
| `toefl` | `ecdict-toefl` | ECDICT | MIT License | ✅ `MIT` | 3000 | lazy |
| `cet4` | `ecdict-cet4` | ECDICT | MIT License | ✅ `MIT` | 84 | inline |
| `cet6` | `ecdict-cet6` | ECDICT | MIT License | ✅ `MIT` | 69 | inline |
| `ai-core` | `curated-ai-core` | curated in-repo | **Proprietary (self-curated)** | ❌ 无 | 43 | inline |
| `cloud-native` | `curated-cloud-native` | curated in-repo | **Proprietary (self-curated)** | ❌ 无 | 30 | inline |
| `frontend` | `curated-frontend` | curated in-repo | **Proprietary (self-curated)** | ❌ 无 | 20 | inline |
| `go-code` | `curated-go-code` | curated in-repo | **Proprietary (self-curated)** | ❌ 无 | 50 | inline |
| `ts-code` | `curated-ts-code` | curated in-repo | **Proprietary (self-curated)** | ❌ 无 | 50 | inline |

**合计 9346 词**（与 `BASELINE_ITEMS = 9346` 一致，见 `tests/content-query.mjs:48`）。

### 1.2 ECDICT 派生的 license 对象（实测原文，以 ielts 为例）

```json
"license": {
  "attributionRequired": false,
  "commercialUse": true,
  "name": "MIT License",
  "spdx": "MIT",
  "url": "https://opensource.org/licenses/MIT"
}
```

**这是一个规范的机器可读许可声明**：

| 字段 | 值 | 说明 |
|---|---|---|
| `spdx` | `MIT` | **SPDX 标准标识符** ✅ |
| `name` | `MIT License` | 人类可读名 |
| `url` | `https://opensource.org/licenses/MIT` | 许可全文地址 |
| `commercialUse` | `true` | 商业使用允许 |
| `attributionRequired` | `false` | **署名不强制** |

### 1.3 curated 包的 license 对象（实测原文）

```json
"license": {
  "attributionRequired": false,
  "commercialUse": true,
  "name": "Proprietary (self-curated)"
}
```

**注意：无 `spdx` 字段、无 `url` 字段。**

---

## 2. 门禁规则第 7 项（实测）

`scripts/content/validate.mjs:7` 原文：

> **License 门禁**：每条 `source` 必须有结构化 `license`；**外部来源须有 SPDX 标识**

**实测对照**：

| 包类型 | 有 license 对象 | 有 SPDX | 是否通过第 7 项 |
|---|---|---|---|
| 5 个 ECDICT 包 | ✅ | ✅ | ✅ |
| 5 个 curated 包 | ✅ | ❌（但**是内部来源，非外部**） | ✅ |

**这条规则的设计是合理的**：

- "必须有结构化 license" —— 强制所有来源声明权利状态，不留空白
- "**外部**来源须有 SPDX" —— 内部自研内容不需要 SPDX（它本来就不是开源许可）

⇒ **第 7 项本身是一个正确的、有区分度的规则。**

---

## 3. 已有 vs 待建（这是本节的核心区分）

### 3.1 ✅ 已有（实测确认）

| # | 项 | 证据 |
|---|---|---|
| 1 | 每个包有结构化 `license` 对象 | 10/10 包实测 |
| 2 | 外部来源（ECDICT）有 SPDX 标识 | 5/5 ECDICT 包 |
| 3 | 有 `attributionRequired` / `commercialUse` 布尔字段 | 10/10 包 |
| 4 | 有 `license.url` 指向许可全文 | 5/5 ECDICT 包 |
| 5 | 有门禁规则（第 7 项）守着上述要求 | `scripts/content/validate.mjs:7` |
| 6 | 有 `sources[].checksum` 与 `importedAt` | 10/10 包 |
| 7 | namespace 区分了来源族 | `ecdict-*` vs `curated-*` |

**这是一个真实存在的许可治理基础，不是空白。** 审计时应当认可这一点。

### 3.2 📐 待建

| # | 缺失项 | 对应编号 | 说明 |
|---|---|---|---|
| 1 | **`rightsStatus` 权利状态体系** | `E-1` | 无字段记录内容的权利状态（已授权/公有领域/待清理/不可用） |
| 2 | **来源字段不完整** | `E-2` | 缺 `sourceUrl` / `author` / `publisher` / `copyright` / `downloadDate` |
| 3 | **无许可兼容性检查** | — | ECDICT(MIT) 与 curated(Proprietary) 混在一个站里，无自动校验 |
| 4 | **无归属声明渲染** | — | 见 §5.2（当前不强制署名，故暂无违规） |
| 5 | **无 DMCA / 下架流程** | — | 见 `11-legal/CONTENT_RISK.md` |
| 6 | **无 `rightsStatus` 相关的门禁项** | — | 第 7 项只管"有没有声明"，不管"声明的对不对" |

---

## 4. 缺失字段详解

### 4.1 `rightsStatus`（E-1）

**问题**：当前的 `license` 描述的是"这个来源的许可条款"，**不是"这条内容在本项目中的权利状态"**。

两者不等价。举例：

| 情形 | `license` 能表达吗 | 需要 `rightsStatus` 吗 |
|---|---|---|
| ECDICT 的数据，MIT 许可 | ✅ MIT | ❌ 不需要 |
| 从某 GitHub 仓库抓的词表，仓库没写 license | ❌（无许可可填） | ✅ **需要**：状态 = "未知，不可用" |
| 某词表明确标注"仅限学习使用，禁止商用" | ⚠️（能填 name，但无标准化表达） | ✅ 需要：状态 = "受限" |
| 自己编的词表 | ✅ Proprietary | ❌ 不需要 |
| 待清理（来源可疑，暂时保留） | ❌ | ✅ **需要** |

**建议的 `rightsStatus` 取值**：

| 值 | 含义 | 允许上线 |
|---|---|---|
| `cleared` | 权利已确认，可发布 | ✅ |
| `cleared-attribution-required` | 已确认，但需展示署名 | ✅（需渲染署名） |
| `restricted` | 有使用限制（如非商用） | ⚠️ 需评估 |
| `pending` | 待清理 | ❌ |
| `unavailable` | 无法使用 | ❌ |

**然后门禁第 7 项应扩展为**：

```
7. License 门禁：
   (a) 每条 source 必须有结构化 license 或 rightsStatus（现有）
   (b) 外部来源须有 SPDX 标识（现有）
   (c) 【新增】rightsStatus === 'pending' | 'unavailable' 的包 ⇒ FAIL
   (d) 【新增】rightsStatus === 'cleared-attribution-required' ⇒ 必须存在对应的署名渲染配置
```

**注意 (a) 的措辞变化**：从"必须有 license"改为"必须有 license **或** rightsStatus"——因为对于"来源不明"的内容，正确的做法是标 `rightsStatus: 'pending'` 而不是硬编一个 license。

### 4.2 缺失的来源字段（E-2）

实测当前 `sources[]` 的字段集：

| 字段 | 是否存在 | 值示例 |
|---|---|---|
| `origin` | ✅ | `"ECDICT"` |
| `checksum` | ✅ | `sha256:0e4c8089...` |
| `importedAt` | ✅ | `"2026-09-26"` |
| `license` | ✅ | `{...}` |
| `sourceUrl` | ❌ **缺失** | — |
| `author` | ❌ **缺失** | — |
| `publisher` | ❌ **缺失** | — |
| `copyright` | ❌ **缺失** | — |
| `downloadDate` | ❌ **缺失**（`importedAt` 部分替代，但语义不同） | — |

**为什么这些字段重要**：

| 字段 | 用途 |
|---|---|
| `sourceUrl` | **MIT 许可要求"保留版权声明与许可声明"** —— 没有 URL 就无法定位原始声明 |
| `author` | 署名要求（若某来源要求署名） |
| `publisher` | 版权归属方 |
| `copyright` | 版权声明全文 |
| `downloadDate` | **证据链** —— 证明"我们抓取时的许可状态是 X"（许可条款可能变更） |

**`copyright` 与 `downloadDate` 是"合规证据"而非"元数据美观"**：

- 若某天某来源变更许可（从 MIT 改为限制性），`downloadDate` 能证明"我们抓取时它是 MIT"
- 这是唯一的自证清白的证据

**当前 `importedAt` 与 `downloadDate` 的差别**：`importedAt` 是"导入本仓库的时间"，可能晚于"下载时间"（数据先下载到本地、几周后才导入）。对证据链来说，**下载时间才是关键**。

### 4.3 许可兼容性

当前站内混有两类许可：

| 类型 | 包数 | 词数 | 许可 |
|---|---|---|---|
| ECDICT（MIT） | 5 | **9153** | MIT：允许商用、无署名要求 |
| curated（Proprietary self-curated） | 5 | **193** | 自有版权 |

**两个许可之间无冲突**（MIT 允许任意再分发与修改，自研内容归自己）。

**但"无冲突"这个结论目前是人工判断的，没有任何自动检查。** 若未来引入 GPL / CC-BY-NC / 未声明许可的内容，就需要自动化的兼容性检查。

**建议的检查逻辑**：

```
对每个 source.license：
  1. 若 spdx 在白名单（MIT / Apache-2.0 / BSD-* / CC0 / CC-BY）→ OK
  2. 若 spdx 在灰名单（GPL* / CC-BY-SA / CC-BY-NC）→ 告警，需人工评估
     - GPL 类：静态站分发可能触发 copyleft 义务（需法务判断）
     - NC 类：若有任何商业意图则不可用
  3. 若无 spdx 且是外部来源 → FAIL（现有第 7 项已覆盖）
  4. 若 rightsStatus 为 pending / unavailable → FAIL
```

**注**：这个判断**必须由法务确认**，不是工程能单独决定的。工程能做的是"把危险信号暴露出来"，不是"代替法务决策"。

---

## 5. 关键风险：MIT 的实际义务

### 5.1 MIT 的真实要求（实测核对）

当前 ECDICT 包的 license 声明是：

```json
"attributionRequired": false,
"commercialUse": true,
"name": "MIT License",
"spdx": "MIT"
```

**⚠️ `attributionRequired: false` 这个值需要核实。**

**MIT 许可的实际要求**（MIT License 标准文本）：

> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

即：**MIT 要求在任何副本或实质性部分中保留版权声明与许可声明。** 这不是"在网站上展示署名"那种 attribution，但**分发时必须随附许可全文与版权声明**。

**严格说，MIT 的义务是**：

| 义务 | MIT 要求 |
|---|---|
| 商业使用 | ✅ 允许 |
| 修改 | ✅ 允许 |
| 分发 | ✅ 允许 |
| **私用** | ✅ 允许 |
| **保留版权声明与许可全文** | ⚠️ **要求** |
| 提供担保 | ❌ 不提供（免责声明） |
| 署名作者 | ❌ 不强制（**但这与"保留版权声明"不同**） |

**所以 `attributionRequired: false` 的语义是"不要求在 UI 上展示署名作者"，这在 MIT 下可以成立。但"保留版权声明与许可全文"的义务仍然存在。**

**当前状态**：

| 项 | 现状 |
|---|---|
| 是否保留了许可全文 | ❌ **仓库内无 `LICENSE` 文件**（实测 `ls LICENSE*` 零命中） |
| 是否保留版权声明 | ❌ 无 `copyright` 字段（见 §4.2） |
| 是否在站内展示归属 | ❌ 无归属页 |
| 是否有 `third-party-licenses` 文件 | ❌ 无 |

**⇒ 这是一个真实的合规缺口。** MIT 要求随附版权声明与许可全文，而当前二者都不存在。

**注意要精确表述**：这不是"违反了 MIT"这么严重（很多项目在实践中如此），但**它是一个应当补齐的合规动作**，且**成本很低**（生成一个 `THIRD_PARTY_LICENSES` 文件即可）。

### 5.2 建议的处置（成本极低）

| # | 动作 | 说明 |
|---|---|---|
| 1 | 生成 `THIRD_PARTY_LICENSES.md`（或 `.txt`） | 列出 ECDICT 的版权声明 + MIT 全文 + 链接 |
| 2 | 在站内加一个"许可与致谢"页（或在设置里） | 可达即可，不必显眼 |
| 3 | 给 `sources[]` 补 `copyright` 与 `sourceUrl` 字段 | 为上方文件提供数据源 |
| 4 | 在构建产物里带上该文件（或作为静态页） | 保证"分发时随附" |

**第 4 条需要注意**：MIT 的义务是"**分发的副本**中包含"。本项目分发的是 `dist/` 产物（静态文件），所以许可文件需要**出现在部署产物里或站点上**，不能只躺在 git 仓库里。

### 5.3 仓库自身的许可：未声明

实测：

```bash
$ ls LICENSE*
(零命中)

$ python -c "import json; d=json.load(open('package.json')); print(d.get('license'))"
None
```

| 项 | 现状 |
|---|---|
| 仓库 `LICENSE` 文件 | ❌ **不存在** |
| `package.json` 的 `license` 字段 | ❌ **缺失** |
| `package.json` 的 `private` 字段 | ✅ `true` |
| `README.md` 中的许可说明 | ❌ 无 |

**`private: true` 说明这是私有项目**（不发布到 npm）。这解释了为什么没有 license 字段——**私有项目在 npm 语义下不需要**。

**但"代码仓库的许可"与"发布的站点的许可"是两件事**：

| 对象 | 当前状态 | 需要吗 |
|---|---|---|
| npm 包许可 | 不需要（`private: true`） | ❌ |
| **源代码仓库许可** | **未声明** | ⚠️ 取决于是否有协作者/是否开源 |
| **站点内容的许可** | 已声明（通过 manifest） | ✅ 已有 |
| **站点自身的许可**（用户对产出的权利，如导出的词库） | 未声明 | ⚠️ 见 §5.4 |

### 5.4 一个值得提出的边界问题：用户产出的权利

用户可以通过 `exportBanksAsJson`（`src/lib/customBanks.ts:86-92`）导出自建词库为 JSON。

| 问题 | 当前状态 |
|---|---|
| 用户建的自定义词库归谁？ | 未声明 |
| 用户导出的数据可以商用吗？ | 未声明 |
| 自定义词库会与站内内容混在一起吗？ | 不会（localStorage 独立） |

**当前这不是实际风险**（自定义词库只存在用户本机，站点不接触）。**但如果未来加入"分享词库"或"上传到云端"能力，这件事就必须先明确。**

---

## 6. 门禁与测试现状

| 项 | 现状 |
|---|---|
| 第 7 项门禁（license 结构化 + SPDX） | ✅ **已有**（`scripts/content/validate.mjs:7`） |
| `rightsStatus` 校验 | ❌ 无 |
| 许可兼容性检查 | ❌ 无 |
| 归属声明完整性检查 | ❌ 无 |
| 许可相关测试断言 | ❌ **零**（T11 在 `09-testing/TEST_MATRIX.md` 中是 📐 待建） |
| 门禁是否进 CI | ❌ 未进（`DEBT-002`） |

**⇒ 第 7 项门禁即使存在，也只在开发者本机跑。**

---

## 7. 优先级建议

| 优先级 | 事项 | 成本 | 理由 |
|---|---|---|---|
| 🔴 **P0** | **生成并部署 `THIRD_PARTY_LICENSES` 文件** | 低（脚本生成） | **MIT 要求随附版权声明与许可全文，当前二者都无**。这是最明确的合规缺口 |
| 🔴 **P0** | **第 7 项门禁接入 CI** | 少量 YAML | 门禁存在但形同虚设（`DEBT-002`） |
| 🔴 **P0** | **补 `sourceUrl` + `copyright` 字段** | 低 | 上一条的数据源；MIT 要求保留版权声明 |
| 🟠 P1 | 引入 `rightsStatus` 字段 + 门禁扩展（`E-1`） | 中 | 当前无"来源不明内容"的处置机制 |
| 🟠 P1 | 补 `downloadDate` / `author` / `publisher`（`E-2`） | 低 | 证据链 —— 证明抓取时的许可状态 |
| 🟠 P1 | 站内加"许可与致谢"页 | 低 | 保证分发副本中包含 |
| 🟡 P2 | 许可兼容性白名单/灰名单检查 | 中 | 当前两类许可无冲突，但机制缺失 |
| 🟡 P2 | 明确源代码仓库的许可 | 低 | 取决于是否开源/有协作者 |
| ⚪ P3 | 明确"用户导出的词库"的权利 | 低 | 当前无实际风险，为未来铺路 |

---

## 8. 一句话总结给审计方

**许可治理有真实基础、不是空白：10 个包的 `sources[].license` 都是结构化对象，5 个 ECDICT 包带 SPDX 标识（`MIT`，含 `url` 指向许可全文）、5 个自研包声明 `Proprietary (self-curated)`，且门禁第 7 项要求"外部来源须有 SPDX"——有区分度、设计合理。但有三个明确缺口：一、**MIT 要求分发时随附版权声明与许可全文，而仓库内无 `LICENSE` 文件、`sources[]` 无 `copyright` 字段、站内无归属页，三者皆无**（成本极低即可补齐，也是最明确的合规动作）；二、`rightsStatus` 权利状态体系未建（`E-1`），当前只有"这个来源的许可条款"，没有"这条内容在本项目的权利状态"，因此无法表达"来源不明/待清理"这类情形；三、来源字段不完整（`E-2`），缺 `sourceUrl`/`author`/`publisher`/`copyright`/`downloadDate`，其中 `downloadDate` 是证明"抓取时许可状态"的唯一证据。另外仓库自身无 `LICENSE` 文件与 `license` 字段（`private: true` 可解释 npm 侧，但源码仓库许可未声明）。**
