# Stage 1 结清签字（CLOSED SIGN-OFF，2026-10-02）

> 本文是 **C-12「Stage 1 结清」的落地签字**，对应评审第五轮的第 ⑦ 步。
> 结清定义见 `STAGE1-CLOSED-CRITERIA-2026-10-02.md`：
> **CLOSED = 7 条机器判全绿 ∧ 4 条人工核全部签字 ∧ 条件式闭合表无悬空分支。**
>
> 三条硬性边界（本轮全程没越）：
> 1. **预算常量 `450000 / 145000`（`scripts/gate-perf.mjs:63-64`）一行未动** —— INV-3 只许降不许升；
> 2. **INV-1 冻结区 `docs/audit-package/` 零改动**；
> 3. **四项遗留（`items` 分支未接 src 过滤 / `loadFailedFor` / e2e 第四态零覆盖 / `PLANNED_BASELINE` staleness）
>     一律不进结清动作** —— 它们是记录项，不是收口项。

---

## §0 结论

> **Stage 1 = 🟢 CLOSED。**
>
> 7 条机器判（M1–M7）本轮**独立复跑全绿**；4 条人工核（J1–J4）**已由评审人在第五轮全部落定，无一悬空**。
> 代码停在 `c36f54c`（Slice 3 的第二笔），后续只动文档，不动任何一行判定逻辑。

代码前后对照：`5db4227`（判据 5 三合一 + e2e 171 锁死）→ `c36f54c`（L5d 补锁调用点接线）→
`d1af911`（C-12 定义）→ **本轮文档笔**。`scripts/check-bundle.mjs` 最后一次改动仍是 `c36f54c`。

---

## §1 机器判 7 条（本轮独立复跑，非引用实现者报告）

| # | 条件 | 验证命令 | 实测 | |
|---|---|---|---|---|
| M1 | 六判据全绿 | `node scripts/check-bundle.mjs` | exit **0**，`PASS：6 项全部通过`（判据 6 预热清单 `[kaoyan, toefl]` 长度 2 ≤ 上限 2） | ✅ |
| M2 | 判据 5 三合一能自己判红 | `node scripts/check-bundle.mjs --falsify` | exit **0**，`✓ falsify: 11/11 恰好判红（含 1 条全 PASS 基线对照）`；`L5c`（真泄漏按产物形态 ⇒ FAIL）、`L5d`（调用点接线 ⇒ UNKNOWN）均在 | ✅ |
| M3 | 加载失败第四态仍在线 | `npm run test:ui-contract` / `node tests/ui-contract.mjs --falsify` | 正判 exit **0**、`共 21 项，通过 21，失败 0`；falsify **31/31 恰好判红** | ✅ |
| M4 | e2e 用例数未漂移 | `npm run test:e2e` | exit **0**，`共 171 项，通过 171，失败 0`；断言在 `tests/e2e.mjs:1812-1825`（`E2E_CASES_EXPECTED = 171`） | ✅ |
| M5 | INV-3 预算常量未上调 | `git diff f3fcd3b..HEAD -- scripts/gate-perf.mjs \| grep -cE "^\+.*450000\|^\+.*145000"` | **0**（该 diff 共 15 行，无一处命中） | ✅ |
| M6 | INV-1 冻结区零改动 | `git status --porcelain docs/audit-package/` | **空** | ✅ |
| M7 | 离线 + 行为侧 | `npm run test:offline` / `npm run test:storage` | offline exit **0**「✅ 全部通过」；storage `共 78 项，通过 78，失败 0` | ✅ |

**附加证据（不在 7 条之内，但同一次跑出来的）**：`node scripts/gate-perf.mjs` exit **0**，三行全 PASS ——
`main-chunk-raw` 当前 393432 ≤ 450000、gzip 121918 ≤ 145000、`words-*-raw` 单个最大 483087 ≤ 550000，
三行 effective 的 binding 源均为 **absolute**。

> M4 的实测耗时 **2m27s**，`npm run test:e2e` 在前台 2 分钟会被 SIGTERM 截断 ——
> 复跑请放后台，或直接读 `/tmp` 落盘的日志。这不是门的问题，是本机命令超时的问题。

---

## §2 人工核 4 条（评审第五轮全部落定）

| # | 议题 | 裁定 | 落定后的世界 |
|---|---|---|---|
| **J1** | 3b `ai-core` 是否 lazy | **不做** | `ai-core` 保持 inline，默认词库路径不变；**不为 Stage 1 CLOSED 引入改变默认首屏路径的产品行为变更** |
| **J2** | 3a `ts-code`+`go-code` 是否 lazy | **不做** | 两者保持 inline，**判据 5 盲区① 因此永久不激活**（兜底今天走 0 包，本来也走不到） |
| **J3** | `PLANNED_BASELINE` 棘轮是否重订 | **不重订** | 维持 `428324 / null / 483087` 现值；**它不参与 effective binding，实际约束以 `ABSOLUTE_BUDGET` binding 为准** |
| **J4** | N6 是否 Stage 2 前置 | **不阻塞 Stage 2** | 两个概念拆开：**N6 不阻塞整个 Stage 2 解冻**；但**面板 lazy 那 101.6 KiB 的大杠杆在 N6 UX 签字之前仍不做** |

**J4 拆成两句的理由**：不写后半句，"N6 不阻塞 Stage 2" 会被读成「Stage 2 里所有东西都解封」，
而面板 lazy 恰恰是 Stage 2 里最大的一笔工程（101.6 KiB）。「N6 是不是前置」和「面板 lazy 能不能先做」
是两件事，合成一句就会在解冻当天重新引发一轮争论。

**J3 不重订的依据**（本轮实测）：`PLANNED_BASELINE` 只是 `computeEffective` 的候选之一
（`scripts/gate-perf.mjs:82-90`，`min(absolute, planned×1.15, current×1.15)`）。三行 effective 的 binding 源
**全部是 `absolute`**：main-raw 450000（其余候选 492573 / 512821）、main-gzip 145000（其余 158987）、
words-raw 550000（其余 555551 各一）。⇒ 重订是行为惰性的，为一个确认不生效的参考值改基线纯属净亏损。

---

## §3 条件式闭合表：现在无悬空分支

| 裁定格 | 若「做」⇒ 需补 | 若「不做」（已裁定）⇒ |
|---|---|---|
| J1 · 3b | ~~① 新用户首屏 e2e 断言（改造既不增数）~~ ② ~~接受离线空词库回归~~ ③ ~~重跑 M1/M4~~ | **无**（已选此列） |
| J2 · 3a | ~~须先 M2 已绿基础，改完重跑 M1/M2/M4~~ | **无**（已选此列） |
| J3 · 棘轮 | ~~重订后仍须过 M5，新基线入提交说明与本文档~~ | **无**（已选此列） |
| J4 · N6 | ~~Stage 2 解冻前补 N6 三条机器判~~ | **N6 不阻塞解冻**，但面板 lazy 仍等 N6 签字（已写成上述 J4 行右格） |

⇒ 四格都有确定落点，**C-12 的第三个组成（闭合表无悬空分支）成立**。

---

## §4 明确不做的动作（写下来，防止下一轮"顺手修一下"污染收口）

结清之后若有人拿下面这些当"顺手修"的开始，都属于**越界**：

1. **`items` 分支接 `src/**` 过滤**（`check-bundle.mjs:461` 仍是三参，8 个活着的 `demo-*` 包裸奔）——
   会动到线上判据行为，留待 items 真的出现撞源码的内容包时再议。
2. **`loadFailedFor` 冗余 state** —— 删它要动 render-phase，跟别的事混着做不合适。
3. **e2e 第四态分布覆盖** —— 171 锁的是总数、不锁分布，这是 171 锁定的固有口子，不是漏判。
4. **`PLANNED_BASELINE` staleness**（428324 对当前 393432，陈旧 34.9 KiB）—— 基线已裁定不动，
   staleness 只在本文件记录，不做修正动作。
5. **3a / 3b / 面板 lazy** —— 前两个本轮裁定不做；面板 lazy 要等 N6 UX 签。

---

## §5 CLOSED → Stage 2 解冻（第 ⑧ 步）

见姊妹文档 `STAGE2-UNFREEZE-CONDITIONS-2026-10-02.md`。核心一句话：

> **解冻的是「内容扩充」这个方向，不是「Stage 2 里所有优化同时解封」**；
> 面板 lazy（101.6 KiB）单独维持冻结，等 N6 UX 签字。

R2 凭据（`BLOCKED / WAITING EXTERNAL CREDENTIAL`）是**独立阻塞项**，不因 Stage 1 CLOSED 而有任何变化，
也不许用 CLOSED 去掩盖它。

---

## §6 签字

| 角色 | 事项 | 结论 |
|---|---|---|
| 工程侧 | M1–M7 七条机器判 | ✅ 全绿（本轮独立复跑） |
| 工程侧 | 不变量 INV-1 / INV-3 | ✅ 冻结区空、预算常量零改动 |
| 人工核 | J1 / J2 / J3 / J4 | ✅ 四格全部落定 |
| **人工核汇总** | **Stage 1 结清** | **🟢 CLOSED** |

判据 5（含三合一补强 + `L5c`/`L5d` 双证伪）经验收为**已完成并经过独立 mutation 验收**：
MUT-1 拆 `:432` 接线 ⇒ L5d 判红；MUT-3 撤 `hitQuote` ⇒ L5c 判红；还原 ⇒ 11/11、exit 0、工作树干净。
