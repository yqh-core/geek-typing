# INV-3 CI 接入裁定（Gate Adjudication）

**状态**：DECIDED（2026-10-05）
**裁定人**：yqh（项目负责人）
**执行**：team lead 取证 → 工程师接线 → team lead 复核 → CI 权威证据
**前置基线**：`HEAD == origin/main == 9cebca7`（SW 专项 CLOSED，CI `37327033262` success）

---

## L0 裁定对象

**只回答一个问题**：`gate:perf`（INV-3）是否接入 CI、怎么接。

**不回答**：是否重开 `gate:architecture` 汇总门（观察项 O3，不在本刀）。

---

## L1 接入前取证（team lead 实测，三条）

### ① 满足「稳定、快速、明确失败」三个条件

| 条件 | 实测 | 判定 |
|---|---|---|
| **稳定** | 连跑 3 次结果全绿，无 flaky；纯静态计算（`readdirSync` + `statSync` + `gzipSync`），无时序/并发/浏览器 | ✅ |
| **快速** | **6.2– 6.6s**（含 npm 启动，3 次实测：6559 / 6303 / 6160 ms）。`gate-build` job 的 `timeout-minutes` 为 20，余量充裕 | ✅ |
| **明确失败** | 超预算 ⇒ `exit 1` + 打印「指标/基线/当前/effective/来源/reason」五元组；缺 `dist/` 或基线不全 ⇒ 也 `exit 1`（fail-closed） | ✅ |

### ② `gate-build` job 已有 build，`gate:perf` 零额外成本

`gate-build`（门禁②）现状：`npm ci` → `npm run build` → `check:bundle` → 装 Chromium → `test:offline`。
`gate:perf` **只读 `dist/`**（不需 build、不读 `content/`）⇒ 紧跟 `check:bundle` 即可，
**不需要新开 job、不需要改 `needs` 拓扑、不产生第二次 build**。

### ③ 增量覆盖确认：确实只有一行，但那一行是真的

- `check:bundle` 通过 `import { computeEffective, loadBundleBaselines, PLANNED_BASELINE, ABSOLUTE_BUDGET }`
  **复用 gate-perf 的同一张预算表**（`check-bundle.mjs:45`），
  `mainChunkBudgets()` 只取**两行**：`main-chunk-raw` / `main-chunk-gzip`。
- `grep -E "words-chunk-raw-single|550000" scripts/check-bundle.mjs` ⇒ **0 命中**。
  ⇒ `check:bundle` **确实不判**「单个 words chunk 上限」。
- 而 `dist/assets/` 实测有 **10 个 `words-*.js`**，最大者 483087 B，
  预算 `words-chunk-raw-single = 550000 B` ⇒ **余量 12.2%**。
  单个词库 chunk 膨胀是最隐蔽的劣化（总量可能不动，但单文件解析成本上升），
  这一行**确实是 CI 中的无人看守区**。

---

## L2 裁定：并入现有 gate，**不新开独立 step**

采纳 yqh 倾向（「不要为一行额外覆盖制造重量级独立 step」），
理由由 L1 支撑：`gate:perf` 已满足稳定/快速/明确失败，**没有独立失败归因、
不同权限/环境或独立审计证据的特殊需求** ⇒ 独立 step 只增加 YAML 维护面与「多一个
可能腐坏的 step」，不增加任何信号。

**接入方案**：`gate-build` job，紧跟 `check:bundle` 之后，
`run: npm run gate:perf`（与已有 `gate:content-type-contract` 一样**不写 `--falsify`**）。

**为什么需要它**（step 注释里必须写清，防止后人误以为与 `check:bundle` 重复）：
`check:bundle` 与 `gate:perf` 判的是**同一个预算表的不同子集**——
前者判主 chunk raw/gzip 两行，后者额外判「单个 words chunk ≤ 550000 B」一行。
**去掉 `gate:perf`，那一行在 CI 上就完全无人看守。**

---

## L3 验收标准（yqh 指定，逐条对应）

- [ ] **① 固定同一 HEAD SHA** 并记录
- [ ] **② 核对该 SHA 的全部相关 CI runs**（不只看一个 success）
- [ ] **③ 确认新增 step 实际执行**（从 step 列表 + step 日志里的命令回显双证据），
      而非「workflow 文件里存在」
- [ ] **④ 确认 `check:bundle` 已覆盖主 chunk raw / gzip**
- [ ] **⑤ 单独确认 `gate:perf` 的唯一增量约束 = 单个 words chunk ≤ 550000 B**
- [ ] **⑥ 故意失败的 falsify**：推送一个必然失败的 commit ⇒确认
      **门禁② 变红且 `gate-e2e`/部署被 `needs` 挡住** ⇒证明「门真的接上了」，
      而不是「命令跑了但没人看它的退出码」
- [ ] **⑦恢复后再取同一 HEAD 的最新完整成功 run**
- [ ] **⑧ 证据闭环成立 ⇒ INV-3 从 HOLD 转PASS/放行**

**⑥ 的执行方式与代价（已提前告知并获授权）**：
需要一个必然失败的 commit + 一个恢复 commit，**共 2 个临时提交**，
推送后 CI 门禁② 变红、部署被 `needs` 挡住，验证完立即 revert。
这两个提交标记为**可丢弃**（用 `test(inv3-falsify):` 前缀），
不得混入正式历史。**部署在门禁② 红时不会发生** —— 这本身即验证 `needs` 拓扑有效。

---

## L4 门禁纪律（本刀新增一条）

**「某命令在 CI 里出现」不等于「门接上了」。**
必须同时具备两条证据：
1. 该 step 在 run 的 step 列表里 `conclusion: success`；
2. **它的失败能让整个 job变红**（第 ⑥ 条的故意失败 falsify）。
只有第 1 条时，step 恒绿或被误写成 `|| true` 都不会被发现。

---

## L5 实施与验收结果（2026-10-05）

**最终 HEAD = `a3a8f73` == `origin/main`，tree clean。**

### 接线 diff（`5800462`，纯新增 9 行，零删除）

`.github/workflows/deploy.yml` 的 `gate-build` job，`check:bundle` 之后 / `安装 Chromium` 之前：

```yaml
- name: 体积/配额预算门禁（gate:perf · INV-3）
  run: npm run gate:perf
```

`needs: [gate-static, gate-build, gate-e2e]` 与 `timeout-minutes: 20` **零改动**（diff 层面核实）。

### 验收 8 条逐条结果

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| ① | 固定同一 HEAD SHA | ✅ | 实施 `5800462`；恢复 `a3a8f73` |
| ② | 核对全部相关 CI runs | ✅ | 每个 commit 各 1 个 run，均逐一核对（见文末台账） |
| ③ | step 实际执行（双证据） | ✅ | step 列表 `7. 体积/配额预算门禁（gate:perf · INV-3） -> success` + 日志 `##[group]Run npm run gate:perf` / `> node scripts/gate-perf.mjs`，并含 Ubuntu 上的实际判定输出（`当前 483087 B ≤ effective 550000 B`） |
| ④ | `check:bundle` 覆盖主 chunk raw/gzip | ✅ | `scripts/check-bundle.mjs:100-101` 复用 `computeEffective` 取 `main-chunk-raw` / `main-chunk-gzip`；run `37335107854` step 6 `success` |
| ⑤ | 唯一增量约束 = words chunk ≤ 550000 B | ✅ | `grep -E "words-chunk-raw-single\|wordsChunkMax\|550000" scripts/check-bundle.mjs` → **0 命中**（已复核）；falsify run 里 `check:bundle` 绿而 `gate:perf` 红，构成运行时反证 |
| ⑥ | 故意失败 falsify | ✅ | commit `4462015`（`test(inv3-falsify):` 前缀，可丢弃）→ run **`37336122139` failure** |
| ⑦ | 恢复后同一 HEAD 最新成功 run | ✅ | revert commit `a3a8f73` → run `37336880236` success |
| ⑧ | 证据闭环 ⇒ 放行 | ⏸ | 待 yqh 最终裁定 |

### ⑥ falsify 的完整证据（本刀核心）

注入：`ABSOLUTE_BUDGET['words-chunk-raw-single']` 550000 → **1000**（`scripts/gate-perf.mjs:77`，单行）。

**本机预验（先证明归因精确，再推 CI）**：
- `npm run gate:perf` → **exit 1**，且**只有** `words-*.js 单个最大 raw` 一行 FAIL；
- `npm run check:bundle` → **exit 0** ⇒ 二者判的确实不是同一子集。

**CI 实测（run `37336122139`，conclusion = `failure`）**：

| job | 结论 |
|---|---|
| 门禁① 静态与内容 | success |
| 门禁③ 端到端 | success |
| **门禁② 构建产物** | **failure** |
| **部署到 Cloudflare Pages** | **skipped** |

门禁② 内唯一失败 step = `7. 体积/配额预算门禁（gate:perf · INV-3）`，
日志含 `##[error]Process completed with exit code 1`。
**部署 job `skipped` 即证明 `needs` 拓扑真实有效** —— 这不是顺手得到的，是故意失败换来的。

### 还原

`a3a8f73` 为 `4462015` 的 revert。`git diff 5800462..a3a8f73 -- scripts/gate-perf.mjs` **为空**（逐字节还原，含注释）。
本机复验：`gate:perf` exit 0（3 行 PASS）；`gate:perf -- --falsify` exit 0（自证自检仍成立）。

### CI run 台账（本刀全部相关 run）

| run | HEAD | 结论 | 说明 |
|---|---|---|---|
| `37335107854` | `5800462` | success | 接线后首跑，gate:perf step success |
| `37336122139` | `4462015` | **failure** | **故意失败 falsify**，部署被挡 |
| `37336880236` | `a3a8f73` | success | 恢复后权威成功 run |

---

## L6 状态

| 项 | 状态 |
|---|---|
| SW 预热稳定性专项 | ✅ CLOSED / PASS（`9cebca7`；CI `37327033262`） |
| INV-3 三条件 | ✅ 已兑现（`1fa9947`） |
| **INV-3 CI 接入** | ✅ **证据闭环成立**（①–⑦ 全部 PASS）⇒ **待 yqh 最终裁定放行** |
| O2–O4 | 📋 观察项，不扩范围 |
| 14 份 `findChrome` | 📋 技术债，不阻塞 |

## L7 本刀遗留（不阻塞）

- **`gate:lint` 本机 exit 2（UNKNOWN）**：根因实测为本机 `node` → `node` 的 `spawnSync` 被环境挡住
  （`EBUSY`，已独立复现），非本刀改动（本刀零 `.ts` 改动）。lint 棘轮基线 `total: 0`，
  oxlint 直跑 `diagnostics` 为空。该门在 CI 的 `gate-static` 真跑且绿
  （run `37335107854` step 15）⇒ **该 UNKNOWN 已被 CI 证据消解**，无需处理。
