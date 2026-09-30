# P18-G0 CI 留档 —— run 36792809578

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-G0/`（23 任务，CLOSED 185/185，matrix commit `7312f9e`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36792809578` |
| headSha | `7fb84995a12b850815ae0bf65335e1b12f77c7e5`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 23:46:26Z → 23:49:42Z ≈ **196s** |
| 原始存档 | `run-36792809578-jobs.json`（API 原文） |

## 四 Job 明细（全 success）

| Job | 起止（UTC） | 用时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | 23:46:28 → 23:46:43 | 15s |
| 门禁② 构建产物（体积 + 离线） | 23:46:29 → 23:47:26 | 57s |
| 门禁③ 端到端（test:e2e） | 23:46:28 → 23:49:02 | 154s |
| 部署到 Cloudflare Pages | 23:49:05 → 23:49:41 | 36s |

## 本波与 CI 的关系

P18-G0 改的是 **Node 侧门禁脚本**（无前端代码改动）⇒ 对主包零影响，CI 里没有体积议题
（INV-3 预算常量未动）。新增的机器对账点：

- 证据表新增 **`TEST-RELATIONS`**（relations 端点可达性 5 断言 + 3 条静态引用断言）
- 证据表新增 **`RELEASE-GATE`**（P18-G4 翻 PASS 后 **43 PASS / 0 FAIL / 0 PENDING**，
  PENDING 清零 ⇒ 入表触发条件达成）。注意：CI 的门禁①/②/③ 跑的是各自命令，
  `RELEASE-GATE` 作为**证据任务**在 P18 证据链里跑（本机与 CI 环境一致，脚本纯本地）。

## 本 run 暴露/确认的问题

无新问题。两条既有注解（与 P18-E / P18-F run 相同，仍为低优先移交项）：

1. `Node.js 20 is deprecated`：`actions/checkout@v4` / `actions/setup-node@v4` 被强制跑在 Node 24 上。
2. `ubuntu-latest 将于 2026-10-19 起迁移到 Ubuntu 26`（runner-images#14748）。

## 本波之后的状态

- 三处 `type === 'word'` 已统一到 `scripts/content/relations.mjs`；三个脚本支持 `--root`，
  端到端可注入验证（本次实施时已实测：合法端点 EXIT=0 / 不存在 local EXIT=1 / 跨族 EXIT=1）。
- **P18-G 的本地前置已清**：只剩「R2 凭据」（`AssetManifest` 落盘 + `/media/*` 同源代理，
  裁定 ⑩-5 登记的不可实测半波）与「真实素材加工」。
