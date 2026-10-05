# N3 裁定 · gate:perf / gate:content-type-contract 是否进入正式发布不变量

**状态**：DECIDED（2026-10-05）
**裁定人**：yqh（项目负责人）
**技术评估**：architect 独立评估 + team lead 逐条复核
**CI 证据基线**：`HEAD == origin/main == 67d0a86`（run `37291788632` SUCCESS）

---

## L0 裁定对象与边界

本裁定只回答一个问题：**INV-3（`gate:perf`）与 INV-6（`gate:content-type-contract`）
是否属于「正式发布不变量」、是否接入 CI。**

**OUT（明确不做）**：
- 不改 `gate-perf.mjs` / `gate-content-type-contract.mjs` / `check-bundle.mjs` 的判据逻辑本身
- 不动 14 份 `findChrome` 副本（已定性为技术债，A3.1-② 收口时明确不扩范围）
- 不刷 `perf-baseline.json` 的陈旧 hash（与本裁定无关，另记为观察项）
- 不动 `gate:architecture` 汇总门是否进 CI（另记为观察项）

---

## L1 复核过的事实（team lead 亲自取证，非转述评估报告）

评估报告给了 12 条结论，其中 4 条直接决定裁定，我逐条独立复核：

| # | 事实 | 复核方式 | 结果 |
|---|---|---|---|
| F1 | `gate-perf` **无任何预算上调守卫** | `grep -n "git\|diff\|raise\|上调\|拒绝" scripts/gate-perf.mjs` | ✅ **零命中**（空输出） |
| F2 | `--record-baseline` 无条件覆写，不比对历史 | 读 `gate-perf.mjs:190-198` | ✅ 直接 `writeFileSync`，中间无任何 `git diff` / 升高拒绝 |
| F3 | `check:bundle` **只覆盖 2 行**，缺第 3 行 | `grep -n "ABSOLUTE_BUDGET\[" scripts/check-bundle.mjs` → 仅 `:100` main-chunk-raw、`:101` main-chunk-gzip | ✅ 确认只 2 处 |
| F4 | 第 3 行 `words-chunk-raw-single` 是 gate-perf **独有**覆盖 | `grep -c "words-chunk-raw-single" scripts/check-bundle.mjs` → `0`；而 `ABSOLUTE_BUDGET` 表里该键= 550000，注释自陈「**新增判据：旧 check-bundle 无单 words chunk 上限**」 | ✅ 覆盖缺口成立 |

**结论修正一处**：评估报告称「gate-perf 只补一行」——成立，但**这一行不是可有可无的边角**。
`ABSOLUTE_BUDGET['words-chunk-raw-single'] = 550000` 是 `gate-perf.mjs` 里
**唯一一条在 CI 中完全无人看守的预算**，且是 18 个词库 lazy chunk 的单文件上限。
一旦某个词库膨胀到 550 KB，单文件解析成本上升，而**当前没有任何 CI job 会报红**。

---

## L2 两个门的定性（分清分量，不一刀切）

评估报告的关键定性我采纳，并**修正一处命名误解**：

- **`gate-perf` 不是「首屏性能门」**，它**只判 3 行字节数**。
  boot/content 耗时行标记 `enforceInCI: false`，只打印不判红
  （`gate-perf.mjs:17-20`、`:171`）。**名字容易被误读成性能门，实际是体积门。**
- **`gate:content-type-contract` 是功能类不变量**，守「加内容类型时禁分叉平行架构」。
  它的失效症状是**静默功能缺失**：新类型漏 i18n（英文界面显示原始 key）、
  漏查询层（内容搜不出来）、漏 Node 白名单（入库了但前台看不到），
  且**无任何报错**。这类漂移**历史上已真实发生过一次**
  （脚本注释自陈「P18-A 实测漂过一次：契约扩到 14 项时两处 Node 白名单都停在 12 项」）。

**标尺对照**（已在 CI 的 5 条 INV 各守什么）：

| INV | 失效症状 | 类别 | 在 CI |
|---|---|---|---|
| INV-1 冻结交付物 | 审计链断裂 | 治理（间接） | ✅ |
| INV-2 UI 契约 | UI 绕过 facade 直取数据 | 架构分叉 | ✅ |
| INV-4 媒体远程 | 首屏体积失控 / 仓库膨胀 | 性能 | ✅ |
| INV-5 许可硬门 | 无 SPDX 素材入库 | **法务** | ✅ |
| INV-7 provider 溯源 | 来源不可查，`unknown` 混入 | **合规** | ✅ |
| **INV-3 体积预算** | 首屏下载量渐进变大，用户只觉「变慢」，**不报错** | 性能（渐进） | ❌ |
| **INV-6 类型契约** | 新类型静默无功能，**不报错** | **功能（静默）** | ❌ |

**读法**：已在 CI 的 5 条里有 3 条（INV-2/5/7）都是「静默错数据 / 合规 / 架构分叉」类，
与 INV-6 **同型**。INV-3 是唯一的「性能渐进退化」类。

---

## L3 裁定结论：拆开处理

项目自身登记 INV-7 时定下的三条前提是「**可执行 + 可证伪 + 在 CI**」
（`docs/ARCHITECTURE-INVARIANTS.md:187-190`）。按此标尺量：

| | 可执行 | 可证伪 | 在 CI | 判定 |
|---|---|---|---|---|
| **INV-6** `gate:content-type-contract` | ✅ 实跑 PASS | ✅ 13 条 falsify 注入 | ❌ | **3 条中缺 1 ⇒ 补齐即可进** |
| **INV-3** `gate-perf` | ✅ 实跑 PASS | ❌ **无 falsify**（全文 0 处） | ❌ | **3 条中缺 2 ⇒ 先补守卫再进** |

###裁定一：INV-6 —— 准予进入 CI，挂在 `gate-static`

- **归属**：`gate-static`（无产物闸）第 11 步，排在 `test:content` 之后
  —— 两者都读 `content/`，同域。
- **成本**：实测 8.36s；`gate-static` 现 10 步、timeout 10min，余量充裕。
- **不加新 job、不改 `needs` 拓扑**。
- **无falsify 前置缺口**（已有 13 条注入），**无 flaky 源**
  （无浏览器/无 sleep/ 无端口；G 判据刻意用进程内 `ts.createProgram` 不 spawn，
  正是为了避开本机 EBUSY）。
- **无环境相关断言**：两个文件搜遍 `C:\` / `/c/` / `win32` 字面量 **0 命中**，
  路径全用 `join(ROOT, rel)` 相对化 ⇒ 不会重演 `verify-learning-unit` 的
  「断言绑死本机环境」首跑假红。

### 裁定二：INV-3 —— **暂不接入 CI**，先补三项守卫

**理由（不是「不重要」，而是「现在接进去等于放一条挡不住上调的门」）**：

1. **INV-3 声明的语义是「预算不得上调」，而这条语义当前没有任何机器判据在守。**
   `gate-perf` 守的是「当前 dist vs 当前预算表」，**不是**「预算表 vs 历史预算表」。
   守「不得上调」的是 `gate:lint` 的棘轮（`gate-lint.mjs:134-137` 拒绝 `--record-baseline` 升高），
   `gate-perf` 完全没有对应机制。
   ⇒ **把这样一条门放进 CI，会制造「INV-3 已受保护」的错觉，实际最关键的语义仍无人守。**
2. **违反项目自己定下的登记前提**：INV-7 登记时明确要求「可证伪」，
   `gate-perf` 全文 0 处 `falsify`，一旦判据写错无法自证。
3. **接入的边际覆盖只有 1 行**（`words-chunk-raw-single`）——
   这一行确实重要（F4 已证），但**重要性不等于「现在就进」**。

**解锁条件（三项全做完才准接入）**：
- ①给 `--record-baseline` 加**拒绝上调**守卫（照 `gate-lint.mjs:134-137` 抄，
  即检测到升高 ⇒ 拒绝写入 + exit 1）
- ② 补**至少一条 falsify**（证伪「预算表被改大时门会判红」）
- ③ 刷新陈旧基线（见 L4 观察项 O1）

**归属（解锁后）**：`gate-build`，紧跟 `check:bundle` —— 同 job 零额外 build
（`gate-perf` 需 `dist/`，而 `gate-static` 明确设计为「不依赖构建产物、最快报红」，
硬塞会摧毁 fast-fail 意图并可能因缺 `dist/` 而假红）。成本 0.53s。

---

## L4 观察项（不在本裁定范围，登记备查）

- **O1**：`docs/_generated/perf-baseline.json` 已陈旧——
  记 `mainChunkFile: index-CXA9m-G5.js` / `mainChunkRaw: 445931`，
  当前实测 `index-CVpiA2_r.js` / `426002`（漂移 −19929 B）。
  **现在还绿**是因为三行 `effective` 全部取自 `absolute`（更严者胜出），
  陈旧的 `derived` 分支根本没参与判定。**潜伏风险**：一旦有人为放行新内容而调
  `absolute`，陈旧 derived 也救不了。这正是 L3 裁定二第① 项要解决的。
- **O2**：`docs/p18/P1.8-DESIGN-RULINGS-v1.0.md:392` 记「main-chunk-raw 余量
  1.39 KiB = 0.3%」，与本轮实跑 **5.33%（23998 B）** 不符 ⇒ 该文档数字陈旧。
  ⚠️ 按项目纪律「调查数字必须自己重跑」，本条以team lead 实跑值为准，旧值作废。
- **O3**：`scripts/gate-architecture.mjs:58-59` 已把 `content-type-contract` / `perf`
  列为子门，但**汇总门 `gate:architecture` 本身也不在 CI**
  ⇒ 「汇总门」对这两个门目前只是文档性存在。
- **O4**：两个门最后执行证据均为 **2026-09-30**，至今约 5 天无执行；
  其间发生了 A2 Unit-04 / A3 Unit-05 两个内容包接入。
  **但实跑复核两个门当前都判绿、判据未腐坏**（与 `verify:prod-catalog` 的腐坏形态不同：
  这两个门的数字全是派生的/绝对上限，没有写死易变计数）。

---

## L5 门禁纪律（本次裁定新增一条）

**「预算/配额类不变量」的上调守卫，必须与该不变量同时交付。**
没有上调守卫的体积门 =「挡不住别人把预算调大」的门，
进 CI 只会制造已受保护的错觉。
⇒ 以后新增任何 `ABSOLUTE_BUDGET` / 配额类门，**必须同时证明 `--record` 类入口不能上调**。

---

## L6 状态

| 项 | 状态 | 依据 |
|---|---|---|
| A3.1-② verify-learning-unit | ✅ **CLOSED / PASS** | `67d0a86`；CI `37291788632` SUCCESS；Ubuntu 34/34；falsify 4 红可归因；e2e 171/171；F-8 51/51 |
| INV-6 进 CI | 🟡 **已批准，待实施** | L3 裁定一；无前置缺口 |
| INV-3 进 CI | ⛔ **暂缓，待补 3 项守卫** | L3 裁定二 |
| O1–O4 | 📋 登记备查 | L4 |
| 14 份 findChrome 副本 | 📋 技术债，**不阻塞** | A3.1-② 收口时已定性 |

**下一刀**：实施 INV-6 进 CI（`gate-static` 第 11 步），顺带刷新 O1 陈旧基线。
INV-3 解锁需另起一刀，且**必须先补守卫再进 CI**，不得跳步。
