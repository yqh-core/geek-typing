# A2 收口 + 下一刀裁定

> 文档性质：**收口复核裁定 + 下一刀方向裁定**（产品 / 工程双线）。裁定人：PM（本项目负责人）。
> 复核日期：2026-10-05。A2 基线：`cb995e3`（A2 落档文档见 `docs/content/A2-UNIT-ENV-CUT.md`）。
> 复核时的工程状态：`d656d14` + `d136c27`（`HEAD == origin/main`，tree clean）。
>
> **一句话结论**：A2 **CLOSED**（产品 / 内容 / 接线 / 数字四项复核全过，数字为本轮重测）；
> 下一刀定为 **A2.1 · Content Integrity Hardening**，**不加新学习内容**。

* * *

## L0 · 复核范围与「本刀已完成」的事实基础

本轮（provider 门那刀，四笔提交 `f53666e` / `bae9205` / `4585d21` / `d656d14`）已关闭：

- `provider:'unknown'` 无硬门禁 → **已建门并进 CI**（`verify:provider`，判据 A/B/C + `--falsify` 4/4）。
- `PROVIDER` 表从 `build.mjs` 搬进 `provider-rules.mjs`，成为**全仓唯一实现**。
- F-8/F-9（脚本入口真解析 + 检测器元自检）已进 CI，并在 CI 里**首次真正执行**。
- `verify:prod-catalog` 的 stale 基线已修（期望值改为按 `content/` 派生）。
- CI 三轮终态：4/4 job success ×2（`37258706788`、`37259990804`）。

⇒ 因此「provider 尚无硬门禁」在本复核时点**已经是过期事实**，不再作为遗留项。

* * *

## L1 · A2 产品与内容裁定

**裁定：CLOSED。** A2 的原始硬规格全部满足，且**本轮重新实测复核**（不采信历史转述）：

| 判据 | A2 要求 | 本轮实测（2026-10-05） | 判定 |
|---|---|---|---|
| 词汇数 | 30 | **30** | ✅ |
| 阅读正文词数 | 700–900 | **814**（空白切分，主口径）/ 824（`[A-Za-z]+` 字母串） | ✅ 落在区间内 |
| 阅读段落 | 8 段 | **8** | ✅ |
| 题目数 | 15 | **15**（mcq 10 + tfng 5，其中 `Vocabulary in context` **5**） | ✅ |
| collocations | 18 | **18**（落盘 `questions.collocations`，**string[]**） | ✅ |
| 接线 | 5 处 | 全部到位，指针已随 provider 门迁移更新 | ✅ |
| 幂等 | 源可原样重现磁盘包 | `--check` 6/6 | ✅ |

> ⚠️ **A2 / A3 记法不同但事实相同**：A2 把 15 题记作「MCQ（主旨/细节）×5 + TFNG ×5 +
>   Vocabulary in Context ×5」；A3 记作「mcq 10 + tfng 5，其中 5 题 skill=Vocabulary in context」。
>   后者的 5 题 VC 含在前者的 10 道 MCQ 内，两种记法不冲突。引用时**别当成两套题**。
>
> ⚠️ **collocations 的落盘位置**：`content/exercise/<id>/items.json` 的
>   `questions.collocations`（**string[]**，不是对象数组），`manifest` 里没有这个键。
>   A2 文档写「18 条」没错，但没写位置 —— 下一刀若要做自动判据，别去找 manifest。

### L1.1 哪些数字**不是** A2 的产物指标（避免误判「失真」）

A2 文档里出现的 **包数 24 / 9408 / 9454** 是**当时的仓库快照**，不是 A2 自己的产物：

| 口径 | A2 时点 | 当前（经 A3） | 差异来源 |
|---|---|---|---|
| 包数 | 24（vocabulary 12 + 非 vocab 12） | **27**（13 + 14） | A3 三件套 |
| `BASELINE_ITEMS`（vocabulary-only） | 9408 | **9438** | A3 的 30 词 |
| all-types Σ items | 9454 | **9486** | A3 的 30 词 + reading 1 条 + exercise 1 条 |

⇒ **A2 产物本身一个字节没动**（30/814/8/15/18 全部原样），变的是仓库。
   这不是 A2 失真，把 24/9408 当「A2 应维持的数字」才是误判。

* * *

## L2 · 五项检查的逐条结论

| # | 检查项 | 结论 | 硬证据 |
|---|---|---|---|
| 1 | A2 文档与当前代码是否一致 | **发现 1 处漏改，已修** | §3.3 接线表上轮已迁指针，但 **§L2 摘要行（A2 line 39 / A3 line 49）仍写「`build.mjs` 的 `PROVIDER`」** —— 而那正是下一个人照着读的位置。已改为 `provider-rules.mjs（原 build.mjs）`。全仓再扫无第二处旧假设。 |
| 2 | 门禁是否真覆盖了本轮暴露的盲区 | **发现 1 处覆盖漏了 92%，已修** | F-8 原手写 4 个文件，而本仓共 **50 个** npm script 入口（实测），本刀改过 7 个入口。已改为**从 `package.json` 自动派生**（+ F-8a 清单非空 ≥20、F-8b 四个已知入口必须在清单）。`content:build` 本轮实跑 exit 0 且 **`content/` 零漂移**；provider 门在 CI 步骤里，不只本机。 |
| 3 | A2 验收数字是否仍可信 | **全部仍可信** | 本轮重测：30 / 814 / 8 段 / 15（10+5，VC 5）/ 18 —— 见 L1。仓库态 27 / 9438 / 9486 与 A3 文档一致。 |
| 4 | 「门绿 ≠ 入口被加载过」是否已固化为原则 | **原则已定，但机制自身漏了 92%，已修** | 原则见 §L3 条款 ①；机制即 F-8/F-9，而 F-8 的清单本身就是「手写清单漏了 92%」的实例 ⇒ 改成派生 + 加防退化断言（F-8a/F-8b），否则「全绿」可能是因为几乎没查。 |
| 5 | 现在该进哪一刀 | **A2 CLOSED；下一刀 = A2.1 工程硬化** | 见 §L4。 |

* * *

## L3 · 固化为固定条款的门禁纪律（后续每一刀必带）

以下是本轮 + 收口复核共同得出的条款，**不是一次性经验**，写进内容包的固定验收：

1. **「门禁自身是绿的」≠「被测入口真的被加载过」。**
   凡改动 npm script 入口，必须有该入口的**真解析/真加载**判据；只测被 import 的依赖模块不算。
   机器实现：F-8（全量入口 `node --check`）+ F-9（造坏文件证明检测器抓得住）。
2. **清单类断言一律派生，禁止手写。**
   手写清单的失效是**静默**的（新增项没人回来补）；本轮实测手写 4 / 实际 50 = 覆盖 8%。
   机器实现：F-8 从 `package.json` 派生 + F-8a（清单非空）/F-8b（已知项在内）防退化。
3. **数字型断言一律现算，禁止钉字面量。**
   本轮实例：`verify:prod-catalog` 钉着 P1.7 的 18 / 9388，烂了三个刀没人发现（它不在 CI）。
   机器实现：`tests/helpers/catalog-totals.mjs` 唯一实现，`e2e.mjs` 与 `prod-catalog-check.mjs` 共用。
4. **不在 CI 里的检查 = 迟早腐坏且无人发现。**
   新门要么进 CI，要么在文档里显式登记「本门不在 CI，何时由谁跑」。
5. **判据报错必须报「操作者要动的那一个名字」。**
   门让人改表 ⇒ 报目录名（表键），不报 ContentId（身份契约另存字段）。
6. **环境性失败判 UNKNOWN，不降级也不静默。**
   退出码语义保持 `0=PASS / 1=FAIL / 2=测量失败`（`gate-lint` 的 exit 2 是范例）。
   UNKNOWN 必须在收尾汇总打印 —— 静默跳过 = 门看起来在跑、其实没跑。
7. **JSDoc/注释声明的字段不算契约证据。**
   本轮实测：`scanContentPackages` 的返回类型注释写了 `dirName`，实现里根本没有，而它正是判据 B 的匹配键。

* * *

## L4 · 下一刀裁定：A2.1 · Content Integrity Hardening

**目标：不增加任何学习内容，只把已经暴露出来的内容工程缺口收成长期门禁。**

### N1 · 正式登记 INV-7（Provider Integrity）

- 门已存在（`verify:provider` + falsify 4/4 + 在 CI），**只差把「工程门」升格为「登记不变量」**。
- 判定：登记表 `docs/ARCHITECTURE-INVARIANTS.md` 现有 INV-1..INV-6。本刀**经 PM 裁定新增 INV-7**，
  这是「裁定后才增表」，不是擅自扩表。
- INV-7 定义（拟）：每一个落盘 content package 必须具有明确、合法、且与其来源一致的 provider；
  禁止 `undefined` / 空串 / `unknown`；外部 provider 必须能解析到登记仓库。
- 判据落点：直接引用 `gate:provider` 的 A/B/C，**不在新脚本里重写实现**（单一实现纪律）。
- 棘轮：登记后**不得下调**（与 INV-1..INV-6 同口径）。

### N2 · 接通 `verify-learning-unit`

- 现状：脚本存在且能跑，但**没有 package.json script、没有 CI、没有负向测试** ——
  与本轮修掉的「F-8 存在但从未被执行」是同一类问题。
- 四段推进（缺一不可，照 F-8/F-9 的教训）：
  1. 该文件进 F-8 派生清单（自动，无需手改）；
  2. `package.json` 加脚本并**实跑一次**确认能执行（不是「文件在」）；
  3. 接进 CI；
  4. **负向测试**：故意构造错误 LearningUnit ⇒ 必须 FAIL，否则又是一次「测试在跑但没证明自己会抓错」。

### A2.1 Acceptance

| ID | 验收项 | 判据来源 |
|---|---|---|
| A21-01 | INV-7 正式登记 | `ARCHITECTURE-INVARIANTS.md` §5 |
| A21-02 | provider 门判红能力不回归 | `verify:provider:falsify` 4/4 |
| A21-03 | provider 门进 CI 且**实跑** | CI 日志含判据 A/B/C 结果行 |
| A21-04 | `verify-learning-unit` 可执行 | 实跑 exit 0，不是「文件存在」 |
| A21-05 | learning-unit 负向测试判红 | 注入错误 ⇒ 必须 FAIL |
| A21-06 | 全量门禁绿 | 12+ 门逐条给数 |
| A21-07 | `content:build` 后 `content/` 零漂移 | `git status --porcelain -- content` 空 |
| A21-08 | e2e | 171/171 |
| A21-09 | 棘轮 | lint 0；UI 棘轮不上调 |
| A21-10 | CI | 全 job success |

* * *

## L5 · A2.1 明确 OUT（不然后面会「顺手」掉进来）

- ❌ **不做第四套内容包**（Unit-06 等）：内容生产速度已不是当前最大风险；当前风险是
  「内容增多而质量约束没同步变成自动门禁」。
- ❌ **不改首页词数口径**：首页把非词汇 items 也叫「词」（9486 里含 48 条非词汇条目）。继续冻结。
- ❌ **不改 Unit-01**（464 词）/ Unit-02 / Unit-03 任何内容：冻结。
- ❌ **不新增 UI**：作答面板沿用既有实现（本地作答、不落盘是既有契约）。
- ❌ **不重构 scaffold**：source → scaffold → content → registry → validate → build → tests 已能工作；
  不因为刚发现几个门禁问题就重做脚手架。
- ❌ **不为「显得严谨」给门加预算/阈值**：棘轮只许降不许升。

* * *

## L6 · 状态表

```
A2 · IELTS Academic Unit 02 — Environment / Climate
  Product        CLOSED（本轮重测 30/814/8/15/18 全过）
  Content        CLOSED（磁盘产物零改动）
  Wiring         CLOSED（指针已随 provider 门迁移）
  Provider       CLOSED（门 + falsify + CI）
  CI             CLOSED（4/4 job success）
  Regression     CLOSED（e2e 171/171，棘轮 0）
  Result         PASS

下一刀：A2.1 · Content Integrity Hardening
  N1  INV-7 Provider Integrity（登记）
  N2  verify-learning-unit → package.json → CI → 负向测试
  OUT 不加内容 / 不改词数口径 / 不返工旧单元 / 不重构 scaffold
```

**注意**：A2 的遗留里**不含** `provider:'unknown'`（已闭环），也不含
`verify-learning-unit`（归 A2.1 的 N2）。这两项都不应再作为「A2 的失败项」引用。
