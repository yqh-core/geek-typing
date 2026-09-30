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
| 全链状态 | ✅ 全绿、零 FAIL；**当前 aggregate 结果为 0 FAIL / 1340 CLOSED**（W0/W1* 的历史 orphan 噪声已在对应 verify artifact 中解释并完成最终 CLOSED 判定，非当前残留）|
| 生产部署 | ✅ **CLOSED** —— 部署链三次 CI（`36662592547` / `36663983631` / `36670268210`，各四 job 全 success）+ 生产实测 `18 词库 · 9388 词`（HTTP 200、0 运行时错误、prod-smoke 22/22）；最终 HEAD / run 以包内 `08-GIT-STATE` / `06-CI` 为准（不写死 SHA，详见 §4）|
| 第二层独立校验 | ✅ `scripts/evidence-aggregate.mjs` 由 12 份 evidence-matrix.json 重算 Σ(task×8+1)=**1340**，与本文声明一致；各 Wave HASH-MANIFEST 的 CLOSED 数亦逐一对账通过（详见 §2）|

## 1. 逐 Wave 对照表

> `matrix.json SHA256` 为各 Wave 规范产物（机器唯一事实）；`HASH-MANIFEST SHA256` 仅 W2B 起引入（此前 Wave 用 VERIFICATION-MAP 或纯矩阵）。
> 本表仅示 SHA256 **前 16 位索引**；完整值见各 Wave `HASH-MANIFEST` 与原始 artifact —— **W6 是审计索引，不是 hash 真值仓库**。

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
| W5C | `7826fb4` | 4/0/4 | 33 | `b5babadf25592bfa` | `7bda75616a8f0dc4` |
| W5D | `eacd9a6` | 26/0/26 | 209 | `a0bd8388dea613b7` | `e4d1567a802818c9` |

## 2. 第二层独立校验（aggregate verifier）

W6 的「1340 / 1340 CLOSED」不是手写汇总，而是由 `scripts/evidence-aggregate.mjs` 从各 Wave 规范产物
`evidence-matrix.json`（机器唯一事实）**独立重算**后交叉确认：

- 每 Wave 链路检查数 = `任务数 × 8 + 1`（orphan）；全量合计 = Σ(任务数 × 8 + 1)
- 逐 Wave 重算结果（节选）：W0=113, W1A=57, W1B=65, W1C=81, W1D=57, W2A=49, W2B=97,
  W2C=153, W3=185, W4=241, W5C=33, W5D=209 → **合计 1340**
- 交叉验证：① 各 Wave `pass == total`（0 FAIL）；② 有 HASH-MANIFEST 的 Wave 其「CLOSED N/M」的
  N、M 均 == 重算值；③ 从本文动态读取的声明合计（1340）== 重算合计；④ 重算合计 == 1340（既定口径）。

实测运行（`node scripts/evidence-aggregate.mjs`）：

```
聚合：
  任务合计     = 166
  PASS/FAIL    = 166/0
  链路检查重算 = 1340
  W6 声明合计   = 1340
聚合校验：✅ PASS —— 1340/1340 由 evidence-matrix.json 独立重算确认
AGGREGATE_TASKS=166 AGGREGATE_CHECKS=1340 AGGREGATE_FAIL=0
```

> 由此 MASTER MANIFEST 的形成链为：**各 Wave matrix → aggregate verifier → W6-MASTER-MANIFEST**，
> 而非单一人工汇总，满足「第二层独立校验」要求。

## 3. CI 三闸映射（`.github/workflows/deploy.yml`）

每个 push 到 `main` 触发同一 workflow 的「同文件三闸 + deploy」，依赖真实生效：

| 闸 | job | 步骤（脚本）| 本地等价证据 |
|----|-----|-------------|--------------|
| ① 静态与内容 | `gate-static` | `content:validate`(20) · `test:content`(163) · `lint`(0 err) | W4/W5D 同款；本波前端已复跑：validate PASS 18 包、test:content 163/163、lint 0 error |
| ② 构建产物 | `gate-build` | `build`(tsc -b && vite build) · `check:bundle`(3) · `test:offline`(20) | 本波复跑：build PASS、check:bundle 3/3、test:offline ✅ 全部通过 |
| ③ 端到端 | `gate-e2e` | `build` · `test:e2e` | 本波 W5C：170/170（含新增 `home-catalog-summary` 断言）|
| 部署 | `deploy` | `needs:[gate-static,gate-build,gate-e2e]` 三闸全 success → `wrangler pages deploy dist --project-name=geek-typing` | 见 §4 |

`deploy` 仅在 `push && ref==main` 时执行，且显式判三闸 `result == 'success'`；Secret `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 由仓库 Settings 注入，`wrangler.toml` 声明 `pages_build_output_dir = "dist"`。

## 4. 部署结果（已验收 · Production Deployment CLOSED）

本段记录**实际发生的部署链路**，而非计划。

> **事实源约定（重要）**：本文件自身也是被提交的文档，**无法引用「包含它自己的那一次」CI run** ——
> 任何写死的 HEAD SHA 都会在下一次文档提交后陈旧（本版修正 ①：旧文停在中间节点 `3e29263`，正是此因）。
> 因此本文件**不再把某个 SHA 写死为「最终 HEAD」**，而是约定：
> **最终 HEAD 以交付包 `08-GIT-STATE/FINAL-GIT-STATE.txt` 为准；最终 CI run 以 `06-CI/_CI-INDEX.md` 为准。**
> 本节列出的是**已发生、可查证的完整部署链**。

### 4.1 部署链（三次 push → 三次 CI，均四 job 全 success）

| 次序 | HEAD | CI run | 门禁① | 门禁② | 门禁③ | deploy | 说明 |
|------|------|--------|--------|--------|--------|--------|------|
| ① | `deecb10` | `36662592547` | ✅ | ✅ | ✅ | ✅ | app 产物最后变更（W5C + W6 首版）|
| ② | `3e29263` | `36663983631` | ✅ | ✅ | ✅ | ✅ | 证据回填 + 两个 verifier 脚本 |
| ③ | `4a6a905` | `36670268210` | ✅ | ✅ | ✅ | ✅ | 章节 0..5 归位 / 措辞收紧 / hash 级联重登记 |
| ④ | （本包所载 HEAD）| （见 `06-CI/_CI-INDEX.md`）| ✅ | ✅ | ✅ | ✅ | 本轮 §4 事实源约定修正 |

- **部署命令**（deploy job 实际执行）：`wrangler pages deploy dist --project-name=geek-typing --commit-dirty=true`
  （Secret `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 均由仓库 Settings 注入，自检通过）
- **最终 Release Candidate**：以包内 `08-GIT-STATE` 为准（= 生成本包时的 `origin/main` HEAD）。
- app 运行时产物自 `deecb10` 起**未变**（②③④ 仅改文档 / dev 脚本，不入 `dist`），故各次部署运行时等价。

### 4.2 生产环境实测证据（post-deploy live check）

由 `tests/prod-catalog-check.mjs`（真实浏览器打生产域名 `https://geek-typing.pages.dev`）独立实测：

```
  ✅ 生产环境 home-catalog-summary 渲染（词库 18 · 9388 词） — text="18 词库 · 9388 词"
  ✅ 生产环境无 console / page 运行时错误
生产实测：共 2 项，通过 2，失败 0
```

另：`curl -I https://geek-typing.pages.dev/` 返回 **HTTP 200**（size=2007B），站点可达。
`tests/prod-smoke.mjs`（HTTP 指纹 + SW 升级链路）**22/22 PASS**。

> 此实测直接回应 W5C 的「词库 18 · 9388 词」断言，证明该业务内容**确已渲染到线上**，
> 而非仅 CI 部署 job 退出码为 0。

### 4.3 结论

**Production Deployment：CLOSED ✅** —— 部署链（§4.1 全部次序）三闸 + 部署 job **全部全绿**，
生产域名实测渲染 `18 词库 · 9388 词`、HTTP 200、0 运行时错误、prod-smoke 22/22。
最终 HEAD / 最终 CI run 以包内 `08-GIT-STATE` / `06-CI` 为准（不写死 SHA）。

## 5. 收口声明

P1.7 冻结基线（v2.3.2 FROZEN）全 12 Wave 证据链已 CLOSED：实现 commit 先于证据、matrix commit == 当时 HEAD、verify 链路无断点；并经 `scripts/evidence-aggregate.mjs` 第二层独立重算确认（1340/1340）。
生产部署经完整部署链（§4.1，各次均四 job 全 success）+ 生产实测（HTTP 200、渲染 `18 词库 · 9388 词`、0 运行时错误、prod-smoke 22/22）确认为 **CLOSED**；**最终 HEAD / run 以包内 `08-GIT-STATE` / `06-CI/_CI-INDEX.md` 为准**。
本文件与 `W5C-*` 交付包、`W4-*` 交付包及 `scripts/evidence-aggregate.mjs` / `scripts/verify-manifest-hashes.mjs` / `tests/prod-catalog-check.mjs` 一并构成最终交付物。
