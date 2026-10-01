# P18-H CI 留档 —— run 36812800054

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-H/`（23 任务，CLOSED 185/185，matrix commit `01aa1c5`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36812800054` |
| headSha | `dba50ba7b63a021a797211968c630b96430ba6de`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 03:56:26Z → 04:00:28Z ≈ **242s** |
| 原始存档 | `run-36812800054-jobs.json`（API 原文） |

## 四 Job 明细（全 success）

| Job | 起止（UTC） | 用时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | 03:56:57 → 03:57:16 | 19s |
| 门禁② 构建产物（体积 + 离线） | 03:56:56 → 03:57:44 | 48s |
| 门禁③ 端到端（test:e2e） | 03:56:57 → 03:59:54 | 177s |
| 部署到 Cloudflare Pages | 03:59:56 → 04:00:28 | 32s |

## 本波做了什么

UI 门面收敛：把棘轮桶 `bypassFacadeImports` 从 **2 清到 0** —— CONTENT_CONTRACT §12.1 的最后一处未清账。

| 位置 | 原写法 | 改为 |
|---|---|---|
| `src/main.tsx:7` | `from './core/content/registry'`（取 `warmUpVocabulary`） | `from './core/content'` |
| `src/lib/wordResolve.ts:29` | `from '../core/content/query/content-query'`（取 `queryWord`） | `from '../core/content'` |

配套：`src/core/content/index.ts` 补 `export { warmUpVocabulary } from './registry'`（门面少导出正是
深路径直引的成因）；**棘轮基线重新落盘**（`--record-baseline`），把 0 锁死 —— 单向棘轮"只许降不许升"，
不重新落盘的话将来有人加回一条直引门仍然是绿的。

## 关键数字（CI 现场可见）

- `ui-contract` 计数：`tableJsonImports=0 packageBranches=0 wordTableSources=13 handleReads=11 bannedArrayOps=11 **bypassFacadeImports=0**`
- 主 chunk：**426.67 KiB raw / 134.84 KiB gzip**（与改前逐字相同，gzip +0.01）⇒ 门面补导出
  **没有**把 registry 新拉进任何 chunk（它本来就在主 chunk 里），INV-3 预算未动
- `ui-contract --falsify` 20/20（证伪是证据任务，不进 CI 每次构建）
- `tsc -b --noEmit` EXIT=0；`gate-architecture` PASS；`content-query` 179/179

## 本 run 暴露的问题

无新问题（两条既有注解照旧：Node 20 deprecation / Ubuntu 26 迁移 2026-10-19）。

## 下一波方向

P18-G 的本地前置已全清，剩余卡点全在外部凭据（R2 + 音频/字幕素材）。
本地可做的下一个议题：**P18-C′**（Plan 原定 P18-C 未完成的两项 —— ① `src/core/content/registry.ts:41-112`
手写 import 改「按目录扫描/生成」② `warmUpVocabulary` 改按需+限量）。
侦察结论：① 不能靠 `import.meta.glob` 全量 eager（会把 496 KiB 词库拉进主包、破坏 inline/lazy 分流），
只能走**构建期 codegen + 同步判据**，且会牵动若干以文本扫描 registry.ts 为生的判据（validate 判据 20、
check-bundle 判据 4/5）⇒ 是一波要单独裁定的大改动；② 属产品/UX 决策（预热哪些库），需先定口径。
