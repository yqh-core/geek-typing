# Architecture Invariants（P1.7 Wave 3 · A-5）

> **永久文档**：不是「这次改完就删」的过程稿，P1.8 / P1.9 / P2.0 直接复用。
>
> - 冻结依据：`_deliverable/P1.7-PLAN-v2.3.2-FROZEN.md` §19（Freeze Invariants 十条）+ §14（待办标记门）
> - A-5 依据：`_deliverable/P1.7-PLAN.md` 行 116~132
> - 机器入口：`npm run gate:architecture`（`scripts/gate-architecture.mjs`）—— 汇总门
> - 待办标记门：`npm run gate:todo`（`scripts/gate-todo.mjs`）—— 豁免源 `P1.7-DEFERRED.md`

## 0. 这份文档怎么用

每条不变量后面都标注了**现行落点**，落点分三种形态，含义各不相同：

| 落点形态 | 含义 | 可信度 |
|----------|------|--------|
| **闸门**（`scripts/xxx.mjs` + npm 名） | 有机器门禁，`gate:architecture` 会跑，红了 EXIT≠0 | 高：不进 CI 也会在本地被拦 |
| **测试**（`tests/xxx.mjs`） | 有机器断言，但**不在** `gate:architecture` 汇总里，得单独跑 | 中高：断言在，但没人跑就等于没有 |
| **无自动落点** | 只有代码评审 / 人工流程 / 尚未建设的 Wave 门禁 | 低：靠人，必须写明「待建」的 Wave |

**改这份文档的规则**：

1. §19 十条是**冻结**的——不得自行解释、不得弱化、不得删条目；只能**增加**机器落点。
2. 新增不变量必须同时写明「违反时谁会拦住它」。写不出落点的不变量，等于没有不变量。
3. 「无自动落点」不是免责声明，是**待办**：对应 Wave 落地后必须回来把这一栏改成闸门名。

---

## 1. Freeze Invariants（§19 十条，逐字吸收）

| # | 不变量（§19 原文） | 现行落点 | 断言方式 |
|---|-------------------|----------|----------|
| 1 | Recovery decision 必须 total（穷举枚举驱动测试，禁止 undefined） | **测试**：`tests/recovery.mjs`（由 `MIGRATION_PHASES` 枚举驱动组合，断言 `!== undefined`）；闸门落点：**无** | 枚举驱动穷举 + 非 undefined 断言 |
| 2 | Lock acquire/renew/release 必须在**单一 IDB readwrite transaction** 内完成 CAS | **测试**：`tests/migration-lock.mjs`、`tests/migration-lock-browser.mjs`（20 并发）；闸门落点：**无** | 并发 CAS + 单事务断言 |
| 3 | Migration 对目标数据的写入必须受 WriteGuard（ownerId + fencingToken）保护 | **测试**：`tests/fenced-write.mjs`、`tests/fenced-write-browser.mjs`；闸门落点：**无** | 越权写入必须被拒 |
| 4 | 旧 fencing token 永远不得覆盖新 owner 数据；staging 与 commit 同受 guard | **测试**：`tests/fenced-write.mjs`、`tests/migration-guards.mjs`；闸门落点：**无** | 旧 token 写入断言失败；staging/commit 双向覆盖 |
| 5 | REMOVE OLD 必须发生在 COMMIT 之后；失败路径旧数据永存 | **测试**：`tests/migration-orchestrator.mjs`（journal 顺序断言）+ `tests/migration-guards.mjs`；闸门落点：**无（代码评审兜底）** | journal 事件序断言 + 评审 |
| 6 | Canonical hash 必须基于 RFC 8785 JCS + 项目 NFC 附加规范化（NFC ≠ JCS） | **测试**：`tests/canonical.mjs`（含 é 组合字符等值）；实现：`src/core/persistence/canonical.ts`；闸门落点：**无** | 双算 + 组合字符等值断言 |
| 7 | 未登记 FieldCompatibilityRule 的字段变化默认 FAIL | **测试**：`tests/field-policy.mjs`；实现：`src/core/persistence/field-policy.ts`；闸门落点：**无** | 未登记字段断言 FAIL |
| 8 | Content ingest 必须通过 license/provenance（License Policy Matrix 程序决策） | **闸门（半）**：`npm run content:validate`（`scripts/content/validate.mjs` 第 7 项：每条 source 必须有结构化 license，外部来源须有 SPDX）；**未并入** `gate:architecture`；**无自动落点（License Policy Matrix 本体 Wave 4 待建）** | SPDX 结构校验；Matrix 版本化决策仍靠评审 |
| 9 | Evidence PASS 必须由机器命令产生（RunId 秒级+attempt 唯一），禁止人工填写 | **闸门**：`scripts/evidence-run.mjs`（产生，RunId 形如 `W1-TASK-20260929-141037-R02`）+ `scripts/evidence-verify.mjs`（校验链：RunId → 文件 → SHA256 → Commit → ExitCode → Status 一致） | 机器链路校验；人工填 PASS = 违规 |
| 10 | Wave 只有在 Evidence Matrix 全 PASS 后才能进入下一 Wave | **半自动**：`scripts/evidence-verify.mjs` 判 CLOSED/BROKEN（机器侧）；**「用户审代码+测试+输出+Evidence → 放行」这一步无自动落点（人工）** | 机器判链 + 人工放行 |

> §19 十条的共性结论：**1~7 条有测试落点但没有闸门落点，8 条只有半截，9/10 条是半自动**。
> 这是 Wave 3 的真实状态，不是疏漏声明——`gate:architecture` 目前汇总的是**架构边界类**门
> （B02/G4/A03/persistence/practice-engine），迁移内核的断言住在 `tests/` 里、靠 `npm test:*` 跑。
> 若要让 §19 全部进汇总门，需要新增 `gate:migration` 把 `tests/recovery.mjs` 等收进去——**尚未排期**。

---

## 2. 分层不变量清单（A-5）

### Persistence

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| P-1 | UI 不得直连 `localStorage` | UI ❌→ localStorage | **闸门**：`scripts/gate-persistence.mjs`（npm: `gate:persistence`），唯一豁免前缀 `src/core/persistence/` | 标识符出现即判（注释里提到也算，逼注释与实现一致） |
| P-2 | UI 不得直连 `learning/storage` | UI ❌→ learning/storage | **闸门**：`scripts/gate-learning-boundary.mjs`（npm: `gate:learning-boundary`） | AST 级 import/require/再导出链判定 |
| P-3 | `core/learning` 不得直触 browser storage API，只准经 Repository | core/learning ❌→ browser storage 直触 | **闸门（部分覆盖）**：`scripts/gate-persistence.mjs`（npm: `gate:persistence`）。⚠️ 现行实现只判「`localStorage` 标识符出现在 `src/core/persistence/` 之外」，**并未单独断言 `core/learning` 目录**，也未覆盖 `sessionStorage` / `indexedDB` / `IDBFactory` 等其它 browser storage API | 标识符扫描；**覆盖缺口已知，待补** |

### Learning

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| L-1 | UI 只能经 `core/learning` 触达学习域（唯一入口） | UI → core/learning ✅ 唯一入口 | **闸门**：`scripts/gate-learning-boundary.mjs`（npm: `gate:learning-boundary`） | AST 级：UI 层对学习域的引用必须落到 `core/learning` |
| L-2 | UI 不得直连 `lib/learning` | UI ❌→ lib/learning | **闸门**：`scripts/gate-learning-boundary.mjs`（npm: `gate:learning-boundary`） | 同上（`lib/learning` 是 S3/S4 冻结后的实际落点，仅允许被 `core/learning` 引用） |

### Content

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| C-1 | ContentId 不可变（生成规则只改不改旧值） | 只增不改 | **无自动落点（Wave 4 待建）**：`scripts/gate-content-contract.mjs` 未落地。当前只有 `npm run content:validate`（`scripts/content/validate.mjs` 第 3/8/9 项）校验 ContentId **格式规范与全局唯一**，**不校验历史值不变** | 计划要求「双算校验」——待 Wave 4 |
| C-2 | Content 必须经 registry 注册 | 注册即生效 | **无自动落点（Wave 4 待建）**：`scripts/gate-content-contract.mjs`。registry 实现见 `src/core/content/registry.ts`（`hasFeature` 等 capability 查询已按注册表走） | 计划要求进 `gate:architecture`——待 Wave 4 |

### Migration

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| M-1 | migration 不得触达业务 UI | migration ❌→ 业务 UI | **无自动落点（代码评审）**：无闸门、无专项测试 | 代码评审 |
| M-2 | REMOVE OLD 仅发生在 COMMIT 之后 | 顺序约束 | **测试**：`tests/migration-orchestrator.mjs` + `tests/migration-guards.mjs`；**代码评审**兜底 | journal 事件序断言（与 §19-5 同一条） |

### Performance

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| D-1 | 新依赖必须过 bundle budget | 依赖准入 | **`gate-perf`（Wave 5 已落地）+ `check:bundle`**：`scripts/gate-perf.mjs` 预算表（effective = min-strict(baseline×1.15, absolute)，双基线取更严，每行带 reason）是主 chunk raw/gzip 阈值的单一事实来源，`scripts/check-bundle.mjs` 改为从该表读取（历史硬编码 430,080/138,240 已废弃）；`gate:perf` 已接入 `gate:architecture` 汇总门。boot/content 行为 baseline-only（CI 测不了，供本机 `bench:boot` / `bench:content` 对照） | 超预算打印五元组（指标/基线/当前/effective/来源）EXIT=1；基线存 `docs/audit-package/_generated/perf-baseline.json`（随仓库提交） |

### 交付

| # | 不变量 | 方向 | 现行落点 | 断言方式 |
|---|--------|------|----------|----------|
| R-1 | 交付包必须含 HASH-MANIFEST 且全 MATCH | 打包完整性 | **无自动落点（打包流程 / 代码评审）**：无闸门脚本 | 打包流程人工核对（待流程脚本化） |

---

## 3. Wave 归属与现状

| 子项 | 归属 Wave | 脚本 | 当前状态 |
|------|-----------|------|----------|
| B02 learning-boundary | Wave 3 | `scripts/gate-learning-boundary.mjs` | ✅ 已接入 |
| G4 | Wave 1 | `scripts/gate-g4.mjs` | ✅ 已接入 |
| A03 legacy-wordbank | Wave 2 | `scripts/gate-legacy-wordbank.mjs` | ✅ 已接入 |
| persistence | Wave 2-C | `scripts/gate-persistence.mjs` | ✅ 已接入 |
| practice-engine | Wave 2 | `scripts/gate-practice-engine.mjs` | ✅ 已接入 |
| **content-contract** | **Wave 4** | `scripts/gate-content-contract.mjs` | ⏳ **PENDING（未接入）** |
| **perf** | **Wave 5** | `scripts/gate-perf.mjs` | ✅ 已接入（D-2/D-3 预算门） |

`gate:architecture` 对仍未落地的门（现仅剩 content-contract）**显式打印 PENDING 行且
不计入 FAIL**，并在结尾固定输出一行「未接入子项：content-contract(Wave 4)」。
perf 门已于 Wave 5 落地（`scripts/gate-perf.mjs`），按「脚本文件出现即自动转正」的
机制转入真实执行并计入 FAIL。

取舍理由（同一取舍也写在 `scripts/gate-architecture.mjs` 文件头）：

- **不静默跳过**——缺门必须在输出里看得见，否则读汇总的人会以为覆盖已完备；
- **不判 FAIL**——尚未到期的门不该阻断当前 Wave 出口，否则 Wave 3 永远不可能绿，
  门禁就退化成「假装严格」；
- **自动转正**——一旦对应 Wave 落地、脚本文件出现，汇总门会自动把它从 PENDING 转为
  真实执行并计入 FAIL，无需改汇总门逻辑。

因此 PENDING 的语义是「**已知缺口、尚未到期**」，不是「已通过」。

---

## 4. §14 待办标记门（本文件也是它的文档落点）

扫描 `src/ scripts/ tests/`，exclude `node_modules/ dist/ coverage/ _generated/ fixtures/ vendor/ docs/`
（按**路径段**匹配，所以 `tests/fixtures/` 也在排除内）。
标记词：`TODO | FIXME | XXX | HACK | BLOCKED | UNIMPLEMENTED | TEMP`（大小写不敏感，完整词匹配）。

带字面量的 FAIL / ALLOW 对照（之所以写在这份 `docs/` 下的文档里而不是门禁脚本注释里：
门禁扫描 `scripts/` 且**包含自身**，脚本注释里写字面量会被自己判红）：

| 写法 | 判定 | 理由 |
|------|------|------|
| `const BLOCKED = true` | **FAIL** | 标识符 = 真的「没做完」的开关 |
| `type BLOCKED = ...` | **FAIL** | 类型名 |
| `class C { TEMP() {} }` | **FAIL** | 成员名 |
| `// TODO: x` | **FAIL** | 注释节点 |
| `const s = "BLOCKED"` | ALLOW | 字符串内容，只是提到了这个词 |
| `` const s = `HACK` `` | ALLOW | 模板串内容 |
| `const re = /FIXME/` | ALLOW | 正则字面量内容 |
| `const TEMPORARY = 1` | ALLOW | 完整词匹配，前缀单词不误伤 |
| `XXX` 作为注释里的占位示例 | **FAIL** | 规则只认词形不认语义——这类命中走登记豁免 |

两条实现通道：

- `.ts` / `.tsx` —— **ts-morph AST 通道**：Identifier（含变量声明名）、Type/Interface/Class/Enum
  及其成员名、注释节点 → FAIL；字符串/模板/正则不是 Identifier 节点，天然不会命中。
- `.mjs` / `.cjs` / `.js` / `.jsx` —— **降级通道**：正则 + 词法状态机（注释 → FAIL；
  字符串/模板/正则内容 → ALLOW）。**最终形态并入 A-3 AST 基建**，届时正则实现按计划 Phase 3 删除。

豁免是**登记式**的：写在仓库根 `P1.7-DEFERRED.md`，按「文件 + 行号 + Token」精确匹配，
每条必须带原因与解封 Wave，解封后必须从该文件移除。行号漂移会让豁免失效（刻意为之：
豁免必须跟着代码走，不能跟着文件走）。

**Wave 3 首次全量清点结果**：命中 24 处 → 8 处是门禁脚本自身的说明性注释（已改写注释消除），
剩余 **16 处逐条人工核对，全部是词法误伤**（占位符 `xxx`、计数器 `blocked`、
发布门状态值 `RELEASE=BLOCKED`、局部变量 `todo`），**无一处真实遗留待办**。16 条已全部登记。
