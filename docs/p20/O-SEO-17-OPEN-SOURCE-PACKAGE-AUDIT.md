# 外链方案 · 可开源词库清单（O-SEO-17 · 待决）

> 状态：**仅清单与方案，零执行**。未建远程仓库、未 push、未改 `content/`、未改 `src/`。
> 取证日期：2026-10-06。取证手段：`gh api`（GitHub REST）+ 本机门禁实跑 + 仓库文件直读。

---

## 0. 一句话结论（先看这个）

**13 个包全部可以再分发，但技术含量最高的 5 个包需要你先做一个决定**：
它们的 manifest 里 license 字段写的是 `Proprietary (self-curated)`（专有），
`gate:license` 判它们 `allowed` 是**因为「自有内容 license 自主」这条豁免**，
**不是**因为有人声明了「允许再分发」。

`allowed` 在本项目语境里 = 「本站可以用」，**不等于**「可以发给全世界」。
这两件事在门禁里没有被区分 —— 这是本轮唯一的硬门槛，也是我要你确认的那件事。

---

## 1. 许可依据（manifest 原文逐包摘录）

13 个词库包的 `manifest.json` → `sources[0].license` 字段原文：

### 1.1 技术细分词库（5 个 · 我们的差异化资产）

| 包 | manifest 原文 | SPDX | 判定 |
|---|---|---|---|
| `ai-core` | `"license":{"attributionRequired":false,"commercialUse":true,"name":"Proprietary (self-curated)"}` | 无 | allowed（豁免） |
| `cloud-native` | 同上（`"name":"Proprietary (self-curated)"`） | 无 | allowed（豁免） |
| `frontend` | 同上（`name":"Proprietary (self-curated)"`） | 无 | allowed（豁免） |
| `go-code` | 同上（`name":"Proprietary (self-curated)"`） | 无 | allowed（豁免） |
| `ts-code` | 同上（`name":"Proprietary (self-curated)"`） | 无 | allowed（豁免） |

`provider` 均为 `"geek-typing original"`，`origin` 分别为
`"curated in-repo (2026 AI 核心词库)"` / `"(云原生词库)"` / `"(前端词库)"` / `"(Go 代码词库)"` / `"(TS 代码词库)"`。

### 1.2 IELTS 单元包（3 个 · 自有原创内容）

| 包 | manifest 原文 | 判定 |
|---|---|---|
| `ielts-edu-01-vocab` | `"name":"Proprietary (self-curated)"`，`origin:"original authored content (A1-P/04 Unit 01 — Education)"` | allowed（豁免） |
| `ielts-env-02-vocab` | 同上，`origin:"... (A2 · IELTS Academic Unit 02 — Environment/Climate)"` | allowed（豁免） |
| `ielts-tech-03-vocab` | 同上，`origin:"... (A3 · IELTS Academic Unit 03 — Technology & Innovation)"` | allowed（豁免） |

### 1.3 ECDICT 考试包（5 个 · 唯一有明确开源协议的）

| 包 | manifest 原文 | SPDX | 判定 |
|---|---|---|---|
| `cet4` | `"license":{"attributionRequired":false,"commercialUse":true,"name":"MIT License","spdx":"MIT","url":"https://opensource.org/licenses/MIT"}`，`repository:"https://github.com/skywind3000/ECDICT"` | MIT | allowed |
| `cet6` | 同上 | MIT | allowed |
| `ielts` | 同上 | MIT | allowed |
| `kaoyan` | 同上 | MIT | allowed |
| `toefl` | 同上 | MIT | allowed |

**这 5 个包的协议是「继承来的」** —— MIT 属于 ECDICT 原仓库，
开源它们时**必须保留 `skywind3000/ECDICT` 署名**，且我们无权单独再许可。

### 1.4 策略文件与门禁口径

`content/license-policy-1.json` 判定矩阵原文：

```json
"matrix": {
  "MIT / Apache*": "allowed",
  "CC-BY-* (non-SA/NC)": "allowed+attribution",
  "CC-BY-SA* / GPL*": "review_required",
  "CC-BY-NC*": "rejected",
  "NOASSERTION": "review_required",
  "external w/o SPDX (unknown)": "rejected",
  "original (provider sentinel)": "allowed"
}
```

`scripts/content/license-policy.mjs:130` `decideLicense()` 的实际语义（源码注释原文）：

> `[0] 公开分发声明（冻结 Plan §4.1 门禁规则 :157 / :158）—— **对自有内容同样适用**：
> 　`license.commercialUse !== true`（**字段缺失也算「不 true」**） → rejected
> 　`license.attributionRequired === true` 且 `license.attribution` 为空 → rejected
> 　为什么排在自有哨兵**之前**：自有内容的「license 自主」只意味着**不强制要求 SPDX**；
> 　而这两条是「公开分发声明」（能不能再分发 / 必须署名），属**分发**层面的事实」

> `[1] 自有内容（provider 哨兵 PROVIDER_ORIGINAL） → allowed（license 自主：不强制要求 SPDX）`

**读出来的关键事实**：门禁只校验了 `commercialUse: true`（能否商用），
**没有校验「是否允许再分发」这一位**。8 个 `Proprietary` 包能过门，
是因为豁免分支短路，不是因为有人声明了可再分发。

而 `Proprietary`（专有）这个词，字面含义恰恰是**保留所有权利、不得再分发**。
把标记为专有词库的东西发到公开仓库，是声明与事实冲突。

⛔ **这 8 个包在清单里被标为「待你裁定」，不进入可开源清单。**
⛔ **仓库根目录目前没有 LICENSE 文件**，`package.json` 的 `license` 字段是 `undefined`，
`"private": true` —— 现在整个仓库在法律意义上是「保留所有权利」，
这也是「直接建仓库发词库」不成立的原因之一。

---

## 2. 真实体积（`words.json` 实测字节数 + 条目数）

| 包 | words.json 字节 | 条目 | 内容类型 | 许可状态 |
|---|---|---|---|---|
| `frontend` | 992 B | 20 | 技术 · 前端 | ⛔ 待裁定 |
| `cloud-native` | 1,591 B | 30 | 技术 · 云原生 | ⛔ 待裁定 |
| `ai-core` | 2,324 B | 43 | 技术 · AI | ⛔ 待裁定 |
| `go-code` | 4,644 B | 50 | 技术 · Go 骨架代码 | ⛔ 待裁定 |
| `ts-code` | 5,299 B | 50 | 技术 · TS 骨架代码 | ⛔ 待裁定 |
| `ielts-edu-01-vocab` | 3,772 B | 32 | IELTS 原创 | ⛔ 待裁定 |
| `ielts-env-02-vocab` | 3,858 B | 30 | IELTS 原创 | ⛔ 待裁定 |
| `ielts-tech-03-vocab` | 4,077 B | 30 | IELTS 原创 | ⛔ 待裁定 |
| `cet6` | 9,840 B | 69 | 考试 · MIT | ✅ 可再分发（须署名 ECDICT） |
| `cet4` | 12,353 B | 84 | 考试 · MIT | ✅ 可再分发（须署名 ECDICT） |
| `ielts` | 482,539 B | 3,000 | 考试 · MIT | ✅ 可再分发（须署名 ECDICT） |
| `toefl` | 475,674 B | 3,000 | 考试 · MIT | ✅ 可再分发（须署名 ECDICT） |
| `kaoyan` | 483,016 B | 3,000 | 考试 · MIT | ✅ 可再分发（须署名 ECDICT） |

**合计**：9438 条 / 约 1,488,980 B（约 1.42 MiB）

⚠️ **体积结构值得注意**：技术词库 5 个包合计仅 **14,850 B / 193 条**，
占总体积的 **1.0%**；三个 3000 词的 ECDICT 大包占了 **96.6%**。

**这个结构对「开源换外链」是致命的**：如果只发大包，那是 ECDICT 的数据，
别人自己能从 ECDICT 拿到，没有理由给我们外链；如果只发技术包（真正的差异化），
那才是别人拿不到的东西 —— 但恰好这 5 个是许可待裁定的。

⛔ **因此本轮「开源词库换外链」在许可裁定前不可执行。**
这不是我保守，是清单摆出来的硬事实。

---

## 3. 可开源包清单（按当前许可状态）

### 3.1 ✅ 现在就可再分发（5 个 · 全部为 MIT 继承包）

| 包 | 体积 | 署名义务 |
|---|---|---|
| `cet4` | 12,353 B | 必须署名 ECDICT / skywind3000 |
| `cet6` | 9,840 B | 同上 |
| `ielts` | 482,539 B | 同上 |
| `kaoyan` | 483,016 B | 同上 |
| `toefl` | 475,674 B | 同上 |

**但**：这批数据的独特价值为零（ECDICT 本体公开可下载），
按它们做外链叙事 = 替 ECDICT 做推广，没有差异化故事。
**我不建议把它们当作外链资产。**

### 3.2 ⛔ 因许可待裁定而排除（8 个）

`ai-core` / `cloud-native` / `frontend` / `go-code` / `ts-code` /
`ielts-edu-01-vocab` / `ielts-env-02-vocab` / `ielts-tech-03-vocab`

**排除原因（原文）**：`license.name = "Proprietary (self-curated)"`，
`decideLicense` 走 `provider === PROVIDER_ORIGINAL` 豁免分支返回 `allowed`，
该分支语义为「不强制要求 SPDX」，**未对「是否允许再分发」表态**。
在「专有」字面含义下，公开发布 = 违反自己的声明。

### 3.3 你需要做的裁定（二选一，我推荐 A）

**方案 A（推荐）**：把要开源的包在 manifest 里显式改标为 `MIT`，
并补 `license.url` + `attribution` 文本，然后重跑 `npm run gate:license`。
依据：这些包 `provider = geek-typing original`，是我们自己整理的，
「自有内容 license 自主」在法律上成立 —— 自主的意思**可以包括**改成 MIT。
**代价**：这是一次 `content/` 改动（本轮禁止，需你单独批准）。

**方案 B**：不发词库数据，只发**内容清单 + 词条样例 + 词库设计说明**（metadata-only）。
不碰任何 `words.json`，许可零风险，但外链说服力显著下降。
**优点**：本轮就能执行，不需要改 `content/`。

---

## 4. 门禁状态（本轮实测）

| 命令 | 结果 |
|---|---|
| `npm run gate:license` | **PASS** — packages 27, violations 0 |
| `git status --short` | 仅 ` M docs/p18/P18-NEXT-STEP-PLAN.md`（你原有的未提交改动，本轮未碰） |
| `src/` 改动 | **零** |
| `content/` 改动 | **零** |
| `docs/audit-package/**` 改动 | **零** |
| 新增 npm 依赖 | **零** |

INV-5 口径核对（`docs/ARCHITECTURE-INVARIANTS.md:172`）：

> | INV-5 | 真实素材必须过来源/版权**硬门** | **闸门**：`gate:license`（**已建 · 在 CI**） | 缺必填/未知 SPDX/非商用 → 拒 | P18-B |

✅ 本轮未触碰 `content/`，INV-5 状态不变，门禁保持绿。
