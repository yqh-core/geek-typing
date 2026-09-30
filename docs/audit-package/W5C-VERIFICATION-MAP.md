# W5C 验证内容对照图（Verification Content Map）

> 用途：把已 CLOSED 的 W5C 证据链（matrix commit `7826fb4`，verify **33/33**）
> 与 **实际验证了什么业务行为** 一一对应，供逐条审计。本文是审计索引，不是新证据；
> 原始输出见 `docs/audit-package/_generated/evidence/W5C/` 下 6 份 artifact（4 个任务 + matrix.json + matrix.md）。
>
> 本轮范围：**Wave 5 · C · Home composition only**（计划 §12：仅组合、e2e ≤6 条、零新键）。
> 变更面：`src/App.tsx`（模块级 `getCatalog()` 计算一次并注入 `catalogSummary` prop）
> + `src/components/HomePanel.tsx`（新增 `catalogSummary` prop，复用 `nav.banks`/`bank.wordsUnit` 渲染）
> + `tests/e2e.mjs`（新增 1 条断言，覆盖 `home-catalog-summary`）。
> 不触碰 content / learning / persistence 子系统，故证据清单聚焦四项，其余门禁由 W5D 全量覆盖。

## 0. 统计口径

| 数字 | 统计层级 | 含义 |
|------|----------|------|
| **33/33** | Evidence Chain 链路层 | 4 个 Evidence 任务 × 8 项链检查 + 1 项 orphan 检查 = **4 × 8 + 1 = 33** |
| **4/4** | Evidence 任务层 | `node scripts/evidence-run.mjs --wave=W5C` 实测：PASS 4 / FAIL 0 / total 4 |
| **18 / 9388** | 内容目录层 | `getCatalog()` 同步 manifest 真值：注册包数 18、全类型 manifest 条目合计 9388（vocabulary 9346 + listening/reading 各 6 + audio/topic/exercise/writing/speaking/collection 各 5；grammar/document 诚实报 0）|

各 artifact 内部断言数见各 artifact 自身（机器产生），本文不重计。

## 1. 四项 Evidence 任务各自证明什么

| Task | 证明内容 | 证明力边界 |
|------|----------|-----------|
| TSC | `tsc -b --noEmit` 全仓类型检查绿（含 App.tsx 新增 `getCatalog` 注入、HomePanel 新增 `catalogSummary` 可选 prop 与 `CatalogSummary` 接口）| 编译期 |
| LINT | `oxlint src/` 静态检查 0 error（新增 import / prop 未引入 lint 违规）| 静态期 |
| BUILD | `npm run build`（tsc -b && vite build）产物成功，dist 合法（任务序内 BUILD 排在 LINT 之后、TEST-E2E 之前，保证 e2e 自举 preview 前有 dist）| 构建可发布 |
| **TEST-E2E** | 真实浏览器 E2E 全绿：**170/170**（较 W4 基线 +1 条，即本波新增的 `home-catalog-summary` 断言）；断言原文「Home 组合：内容目录汇总渲染（18 词库 · 9388 词，复用 nav.banks / bank.wordsUnit，零新键）— text=18 词库 · 9388 词」| 端到端 |

## 2. 零新键 / 仅组合 纪律核对（§12）

- **零新键**：HomePanel 仅复用既有 i18n 键 `nav.banks`（zh「词库」/ en「Banks」）与 `bank.wordsUnit`（zh「词」/ en「words」），未新增任何 i18n 条目；`CatalogSummary` 接口与 `catalogSummary` prop 为纯类型/组合层，无新业务计算。
- **仅组合**：`App.tsx` 仅调用已存在的 `getCatalog()`（catalog.ts，W4 落地）取其 `packages.length` 与 `totalItems` 透传给 HomePanel；未引入新的内容计算或状态。
- **e2e ≤6 条**：本波 `tests/e2e.mjs` 仅新增 **1 条**断言（位于「默认进入 Home」检查之后），远低于 ≤6 上限。
- **诚实展示**：目录数字来自 catalog 真实 manifest，未接入类型（grammar/document）已在其余页面诚实报 0，Home 汇总只聚合真实 registered 包，无编造。

## 3. 披露

- W5C 不重复运行 content / learning / persistence 门禁，理由见 §0/§1：变更面仅为 Home 组合层，其余子系统零改动。**W5D 是后续一个独立的全量 Wave**（26 任务、自有 evidence matrix + HASH-MANIFEST），其覆盖 content/learning/persistence 全量门禁是「对那一波变更面的完整证据」，而非本波 W5C 四项 Evidence 的替代品或子集**——两者是并列的全量证据，不是相互替代关系。W5C 四项聚焦任务的目的仅是证明「组合层改动本身不破坏编译/构建/首页 e2e」，不试图为未改动的子系统背书。
- 若后续需在 Home 展示未接入类型提示，应扩展 `getCatalog()` 或新增独立组件，不在本波范围内。
