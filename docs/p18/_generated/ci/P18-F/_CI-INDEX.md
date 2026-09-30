# P18-F CI 留档 —— run 36747755644

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-F/`（21 任务，CLOSED 169/169，matrix commit `1e55421`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36747755644` |
| headSha | `1bc5d21ffe7c6550740a1e23a8b4f41eb3976791`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 16:55:40Z → 16:59:03Z ≈ **203s** |
| 原始存档 | `run-36747755644-jobs.json`（API 原文） |

## 四 Job 明细（全 success，无失败/重试步骤）

| Job | 起止（UTC） | 用时 | 备注 |
|---|---|---|---|
| 门禁① 静态与内容（无产物） | 16:55:42 → 16:56:10 | 28s | 含 `content:validate`（现 22 项判据）与 `test:content`（179 项） |
| 门禁② 构建产物（体积 + 离线） | 16:55:42 → 16:56:26 | 44s | `check:bundle` 5 项（INV-3 预算未动） |
| 门禁③ 端到端（test:e2e） | 16:55:43 → 16:58:22 | 159s | |
| 部署到 Cloudflare Pages | 16:58:25 → 16:59:02 | 37s | 部署成功 |

## 本波与 CI 的关系

P18-F(a) 是**纯 Node 侧判据**（`content:validate` 第 22 项 + `--falsify`），零主包影响
—— 本 run 没有触发体积议题（主 chunk 未变，INV-3 预算常量未动）。CI 中真正新增的
对账点是 `content:validate` 步骤：它现在会因任何二进制媒体进仓而变红（INV-4）；
`--falsify` 按裁定 ⑩-5 不进 CI（证伪是证据任务，已入 P18 证据表第 21 条）。

## 本 run 暴露/确认的问题

无新问题。两条既有注解（与 P18-E run 相同，仍为低优先移交项）：

1. `Node.js 20 is deprecated`：`actions/checkout@v4` / `actions/setup-node@v4` 被
   强制跑在 Node 24 上。action 升版本即可，与业务代码无关。
2. `ubuntu-latest 将于 2026-10-19 起迁移到 Ubuntu 26`（runner-images#14748）：
   到期前关注 e2e job 是否受影响。

## 工程门状态（本 run 之后）

`P1.8-RELEASE-GATE-CONTRACT.md` §0.1：**P18-G4 PENDING → PASS（`ebc885c`），
P18-G1..G6 六门全绿 ⇒ 工程门 🟢 INVARIANTS READY，§0.1 PENDING 清零**。
下一步按既定节奏 = P18-G（首个真实素材全链试点；前置 = R2 凭据 + 三处 Node 脚本
`type === 'word'` 扩展）。
