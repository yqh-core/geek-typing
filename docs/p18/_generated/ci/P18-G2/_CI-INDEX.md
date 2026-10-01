# P18-G2 CI 留档 —— run 36807053274

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-G2/`（23 任务，CLOSED 185/185，matrix commit `99e6767`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36807053274` |
| headSha | `ab4387504d7dc7dd8660894fff737dbf3265602f`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 02:42:00Z → 02:45:50Z ≈ **230s** |
| 原始存档 | `run-36807053274-jobs.json`（API 原文） |

## 四 Job 明细（全 success）

| Job | 起止（UTC） | 用时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | 02:42:33 → 02:42:50 | 17s |
| 门禁② 构建产物（体积 + 离线） | 02:42:33 → 02:43:38 | 65s |
| 门禁③ 端到端（test:e2e） | 02:42:34 → 02:45:12 | 158s |
| 部署到 Cloudflare Pages | 02:45:15 → 02:45:49 | 34s |

## 本波改了什么（一行缺陷修复，但影响"跑门"的卫生）

`scripts/content/ingest.mjs` 的 EMIT 段原本**无条件写盘**，而产物 `generatedAt` 是
`new Date().toISOString()` ⇒ **每跑一次 ingest 就产生一次工作区漂移**（只有时间戳变、语义不变）。
本波照 `build.mjs` 既有口径（"仅在语义有差异时回写"）改成：`generatedAt` **排除在语义比较之外**，
语义相同则不写盘；字段保留、落盘结构与排版（键序/缩进/尾随换行）一律不动。

验收（lead 复跑）：跑一次 `ingest` 后 `git status --porcelain` **为空**；
手动改语义值后跑则**真的重写**（`generatedAt` 刷新）。

## 为什么值得单独一波 + 单独证据

门的产物落在**版本控制目录**里时，幂等不是加分项而是必答题：无条件写盘会让"跑一次门"
制造无意义 diff，真正的改动被淹没在里面 —— 这条缺陷正是在 P18-G1"改内容 → 跑门 → 看工作区"
这个动作里顺手抓到的（当时为了让 diff 里只有 relations.json，被迫 `git checkout --` 还原漂移）。

## 本 run 暴露的问题

无新问题（两条既有注解照旧：Node 20 deprecation / Ubuntu 26 迁移 2026-10-19）。

## 下一波方向

P18-G 的本地前置已全清（关系端点 + 真实数据 + 体积余量 2.9%），
剩下全部卡在外部凭据：R2（`AssetManifest` 落盘 + `/media/*` 同源代理）+ 音频素材
（**字幕按 ⑬-1 一并走远程**，判据 22 白名单不动）。
本地可做的下一个议题候选：P18-C′（注册表自动化 + `warmUpVocabulary` 按需限量）、
UI 侧消费 `reading`（须走 `./core/content` 门面 barrel）。
