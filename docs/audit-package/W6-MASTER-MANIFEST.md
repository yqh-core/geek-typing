# Wave 6 总交付包 · MASTER MANIFEST（Evidence / CLOSED）

> 机器生成。本文件是 P1.7 全量冻结基线的**收口汇总**：把 W0 → W5D 共 12 个 Wave 的证据链统一清点，
> 确认全链路 CLOSED，并登记 CI 三闸映射与部署目标。
> 各 Wave 的原始 artifact 见 `docs/audit-package/_generated/evidence/<wave>/`，
> 各 Wave 的审计索引见同目录 `W*-(VERIFICATION-MAP|HASH-MANIFEST).md`。

## 0. 总账（aggregate）

| 维度 | 数值 |
|------|------|
| Wave 数 | **12**（W0, W1A, W1B, W1C, W1D, W2A, W2B, W2C, W3, W4, W5C, W5D）|
| Evidence 任务合计 | **PASS 166 / FAIL 0 / total 166** |
| Evidence Chain 链路检查合计 | **CLOSED 1340 / 1340**（每 Wave = 任务数×8 + 1 orphan 检查）|
| 全链状态 | ✅ 全绿、零 FAIL、零 orphan 噪声（W0/W1* 的 orphan 早期曾有噪声，已在其 verify 报告中说明，不影响 CLOSED 判定）|

## 1. 逐 Wave 对照表

> `matrix.json SHA256` 为各 Wave 规范产物（机器唯一事实）；`HASH-MANIFEST SHA256` 仅 W2B 起引入（此前 Wave 用 VERIFICATION-MAP 或纯矩阵）。

| Wave | matrix commit | 任务 PASS/FAIL/total | verify CLOSED | matrix.json SHA256(前16) | HASH-MANIFEST SHA256(前16) |
|------|---------------|----------------------|---------------|---------------------------|----------------------------|
| W0 | `a8d10c0` | 14/0/14 | 113 | `e1ce5cc7ef353fa3` | — |
| W1A | `fa63d17` | 7/0/7 | 57 | `a19f0d6570a5ecea` | — |
| W1B | `6982aa3` | 8/0/8 | 65 | `4d9d72f4aee24c86` | — |
| W1C | `571fcb3` | 10/0/10 | 81 | `2f6343de136d4abf` | — |
| W1D | `4d8bcba` | 7/0/7 | 57 | `531276ee8352fdff` | — |
| W2A | `e32a03a` | 6/0/6 | 49 | `90d7c33ff640a452` | — |
| W2B | `8eed600` | 12/0/12 | 97 | `6398f0b38ecba39c` | `76c8165e5cb35f27` |
| W2C | `3d24ea1` | 19/0/19 | 153 | `bf9b320fb4b81746` | `842dbf665bbe2576` |
| W3 | `743240a` | 23/0/23 | 185 | `436f922e961394cf` | `60dc3f75a56ea99f` |
| W4 | `410f17b` | 30/0/30 | 241 | `4a0cc04b57b14380` | `d3d8c6f08d700002` |
| W5C | `7826fb4` | 4/0/4 | 33 | `b5babadf25592bfa` | `8cb62e24640c981b` |
| W5D | `eacd9a6` | 26/0/26 | 209 | `a0bd8388dea613b7` | `e4d1567a802818c9` |

## 2. CI 三闸映射（`.github/workflows/deploy.yml`）

每个 push 到 `main` 触发同一 workflow 的「同文件三闸 + deploy」，依赖真实生效：

| 闸 | job | 步骤（脚本）| 本地等价证据 |
|----|-----|-------------|--------------|
| ① 静态与内容 | `gate-static` | `content:validate`(20) · `test:content`(163) · `lint`(0 err) | W4/W5D 同款；本波前端已复跑：validate PASS 18 包、test:content 163/163、lint 0 error |
| ② 构建产物 | `gate-build` | `build`(tsc -b && vite build) · `check:bundle`(3) · `test:offline`(20) | 本波复跑：build PASS、check:bundle 3/3、test:offline ✅ 全部通过 |
| ③ 端到端 | `gate-e2e` | `build` · `test:e2e` | 本波 W5C：170/170（含新增 `home-catalog-summary` 断言）|
| 部署 | `deploy` | `needs:[gate-static,gate-build,gate-e2e]` 三闸全 success → `wrangler pages deploy dist --project-name=geek-typing` | 见 §3 |

`deploy` 仅在 `push && ref==main` 时执行，且显式判三闸 `result == 'success'`；Secret `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 由仓库 Settings 注入，`wrangler.toml` 声明 `pages_build_output_dir = "dist"`。

## 3. 部署目标

- 项目：`geek-typing`（Cloudflare Pages，生产域名 `https://geek-typing.pages.dev`）
- 触发：本仓库 `main` 分支 push（即本次 `git push origin main`，领先远程 11 个提交）
- 产物：`dist/`（vite build 输出）
- 验收：push 后 `gh run list` 观察三闸 + deploy 全绿；部署成功后在 `https://geek-typing.pages.dev` 实地确认首页渲染「词库 18 · 9388 词」。

## 4. 收口声明

P1.7 冻结基线（v2.3.2 FROZEN）全 12 Wave 证据链已 CLOSED：实现 commit 先于证据、matrix commit == 当时 HEAD、verify 链路无断点。
本文件与 `W5C-*` 交付包、`W4-*` 交付包一并构成最终交付物。后续动作：推送远程并确认 Cloudflare Pages 上线。
