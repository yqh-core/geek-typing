# P18-G1 CI 留档 —— run 36806199114

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-G1/`（23 任务，CLOSED 185/185，matrix commit `beeb9cc`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36806199114` |
| headSha | `a43ca32443ec10a94ba8e259d2cde07016021272`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 02:30:56Z → 02:34:27Z ≈ **211s** |
| 原始存档 | `run-36806199114-jobs.json`（API 原文） |

## 四 Job 明细（全 success）

| Job | 起止（UTC） | 用时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | 02:30:59 → 02:31:18 | 19s |
| 门禁② 构建产物（体积 + 离线） | 02:30:59 → 02:31:53 | 54s |
| 门禁③ 端到端（test:e2e） | 02:30:59 → 02:33:50 | 171s |
| 部署到 Cloudflare Pages | 02:33:52 → 02:34:26 | 34s |

## 本波的意义：relations 判据在 CI 里第一次**真的被执行**

P18-G0 把端点可达性扩展到了「条目级非 word」，但当时真实数据里没有这种端点 ⇒ 判据空转。
本波把三种端点形态落进真实数据后，**CI 的门禁①每次都会真的跑它**：

```
▸ collection/demo-study-set
  ✓ relations.json 7 条：端点合法且可达
▸ reading/demo-reading-01
  ✓ relations.json 4 条：端点合法且可达
```
（其余 16 个包仍打印「无 relations.json，跳过」，正常。）

- 端点真值全部抄自真实数据：包级 `content:vocabulary:curated-ai-core:ai-core`、
  词条级 `content:word:curated-ai-core:transformer`、
  **条目级非 word** `content:reading:demo-demo-reading-01:reading-item-01/02`
- `contentChecksum` **未变**（`47fcb01c…`），manifest 零改动，**没有跑 `content:build`**（裁定 ⑬-3.4）
- **反例实测判红**（lead 独立复跑，`--root` 系统临时副本）：把 `reading-item-01` 改成 `reading-item-99`
  ⇒ `validate` / `gate-content-contract` 双双 EXIT=1 报「孤儿端点」（ingest 同，工人已实测）

## 本 run 暴露的问题

无 CI 层面的新问题。但本波实施中发现一个**既有缺陷**（非本波引入，登记待修）：

> `scripts/content/ingest.mjs` 每次运行都会重写 `content/license-policy-1.json`，
> 只把 `generatedAt` 时间戳刷新（内容其余部分不变）⇒ **每次跑 ingest 都产生一次工作区漂移**。
> 本波为满足"diff 里只有那两个 relations.json"已用 `git checkout --` 还原。
> 它是"脚本幂等性"缺陷：产物语义未变就不该产生新字节。登记为待修项。

## 本波之后的状态

- P18-G 的本地前置**全部清完**：关系端点（P18-G0）+ 真实数据覆盖（本波）+ 体积余量（P18-E′ 2.9%）
- P18-G 剩下的卡点（均需外部凭据）：① R2 凭据（`AssetManifest` 落盘 + `/media/*` 同源代理）
  ② 音频素材；**字幕按 ⑬-1 裁定一并走远程**，判据 22 白名单不动
