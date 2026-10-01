# P18-E2 CI 留档 —— run 36804767876

> 留档时间：2026-10-01（本地）。本文件是**人工留档**，不是机器证据；机器证据在
> `docs/p18/_generated/evidence/P18-E2/`（23 任务，CLOSED 185/185，matrix commit `4b6ef62`）。

## Run 概要

| 项 | 值 |
|---|---|
| Run ID | `36804767876` |
| headSha | `32b126f188271b8e89835e91233dc4462607548a`（= 证据提交 = 当时 HEAD） |
| Workflow | Build & Deploy to Cloudflare Pages |
| 结论 | **success**（4/4 job） |
| 墙钟 | 02:12:55Z → 02:16:30Z ≈ **215s** |
| 原始存档 | `run-36804767876-jobs.json`（API 原文） |

## 四 Job 明细（全 success）

| Job | 起止（UTC） | 用时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | 02:13:14 → 02:13:31 | 17s |
| 门禁② 构建产物（体积 + 离线） | 02:13:14 → 02:14:08 | 54s |
| 门禁③ 端到端（test:e2e） | 02:13:14 → 02:15:50 | 156s |
| 部署到 Cloudflare Pages | 02:15:52 → 02:16:29 | 37s |

## 本波与 CI 的关系（本波是**主包体积**波，CI 里能直接看见）

P18-E′ 动的是 `src/core/content/types/registry*`（前端代码）⇒ **CI 的门禁②就是它的验收现场**：

| 阶段 | 主 chunk（raw / gzip） | 余量 |
|---|---|---|
| 裁前基线（P18-E 后） | `index-DXQgLpDB.js` 432.15 KiB / 136.13 | 1.7% / 3.9% |
| 投影（富元数据出包） | `index-W41GX8ra.js` 427.56 / 134.86 | 2.7% / 4.8% |
| + query 常量去重（本波提交态） | **`index-A_sVbfcM.js` 426.67 / 134.83** | **2.9% / 4.8%** |

合计 **−5.48 KiB raw / −1.30 KiB gzip**，`check:bundle` 5 项（含 J1/J2/J3）全 PASS，
预算常量（`gate-perf.mjs`）**零改动**（INV-3）。证据文件里的原文见
`docs/p18/_generated/evidence/P18-E2/P18-E2-CHECK-BUNDLE-*.txt`。

## 本波在 CI 之外的对账点

- 判据 **J**（键集合三者相等 / 逐值相等 / 非空反向守卫）在 `gate-content-type-contract` 常规输出里 PASS
- `--falsify` **13/13**（J 精确命中 `{J}`）：证伪是**证据任务**（`FALSIFY-CONTENT-TYPE-CONTRACT`），
  按既有纪律不进 CI 每次构建
- 语义保全：`listening`（match 含 `transcript`）/ `reading`（match 含 `body`）未被并入共享 `ITEM_QUERY`

## 本 run 暴露/确认的问题

无新问题。两条既有注解照旧（Node 20 deprecation / Ubuntu 26 迁移 2026-10-19）。

## 本波之后的状态

- 体积余量 **1.7% → 2.9%**（raw），为 P18-G 的 UI 消费腾出空间
- P18-G 剩下的卡点：① R2 凭据（AssetManifest + `/media/*` 代理）② 音频素材必走远程
  ②**字幕归属待裁定** —— 字幕是文本，但 `.srt/.vtt` 会被 P18-F 的判据 22（扩展名白名单
  `.json/.md/.txt`）判 FAIL，需先定"字幕走远程还是进仓、进仓用什么扩展名"
