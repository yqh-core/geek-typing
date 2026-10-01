# Engineering Hygiene 阶段方案 · 消化 53 条 lint warnings（C 步）

> 承接 `docs/p18/P1.8-SIGN-OFF-v1.0.md` §4 遗留项 9.6（`gate:todo` 内容锚点化）与 9.7（CI 注解）。
> 评审要求：**C 步另开阶段，不与 P18 release 混在一起**。本文件是方案，不是实施记录。

---

## 0. 一个必须先纠正的事实：`npm run lint` 跑的不是 eslint

```bash
node -e "console.log(require('./package.json').scripts.lint)"   # → oxlint
```

实测：

| 命令 | 结果 |
|---|---|
| `npm run lint` | ✅ 正常工作，`Found 53 warnings and 0 errors.`，EXIT=0 |
| `npx eslint .` | ❌ **EXIT=2** —— `ESLint couldn't find an eslint.config.* file` |

也就是说：`npx eslint` 会拉到**没有配置的独立 eslint 实例**（ESLint 10.11.0，v9+ 默认改扁平配置），
它扫出来的 warning 数与 `npm run lint` **完全对不上**（eslint 那次直接报错退出）。

> 这条已记入本阶段 —— 任何"统计 lint 明细"的工作**必须以 `npm run lint` / `oxlint` 为准**，
> 用 `npx eslint` 拿到的数字是错的。这正是评审要求"C 步独立"的价值：
> 卫生类工作最容易在错误的度量上做优化。

---

## 1. 53 条的实际构成（用 oxlint 结构化输出实测）

采集命令（可用于复核）：

```bash
npx oxlint --format=json > <临时文件>    # 解析 r.diagnostics[].code / .filename
```

### 1.1 按规则（9 类 / 53 条）

| 规则 | 条数 | 风险 | 处置 |
|---|---:|---|---|
| `eslint(no-unused-vars)` | **31** | 低 | 机械清理（删未用导入/变量） |
| `eslint(no-control-regex)` | **5** | 中 | 逐条看：多为字符串里的不可见控制字符被正则吞到 |
| `react-hooks(exhaustive-deps)` | **5** | 中高 | **会改行为**，需交互确认 |
| `react(only-export-components)` | **3** | 中 | 拆分文件/改名，纯结构 |
| `react(set-state-in-effect)` | **3** | 中高 | React 19 新规，**动它等于改时序** |
| `eslint(no-eval)` | **2** | **高（安全）** | 必须人工审：是测试夹具的受控 eval 还是真隐患 |
| `react(purity)` | **2** | 中 | 副作用位置，需审 |
| `eslint(no-useless-escape)` | 1 | 低 | 机械清理 |
| `eslint(no-irregular-whitespace)` | 1 | 低 | 机械清理（不可见空格） |
| **合计** | **53** | | 0 errors / 204 files |

### 1.2 按文件（30 个文件，堆度不高）

| 文件 | 条数 | 主要规则 |
|---|---:|---|
| `tests/ui-contract.mjs` | 4 | unused-vars |
| `src/hooks/useReviewFlow.ts` | 4 | exhaustive-deps / set-state-in-effect |
| `scripts/learning-stress.mjs` | 3 | unused-vars |
| `scripts/content/ingest.mjs` | 3 | unused-vars |
| `scripts/audit-capture-full.mjs` | 3 | unused-vars |
| `scripts/migration-dryrun.mjs` | 3 | unused-vars |
| `tests/fenced-write-browser.mjs` | 3 | unused-vars / no-eval |
| `src/hooks/useBank.ts` | 2 | exhaustive-deps |
| `src/components/ReviewPanel.tsx` | 2 | exhaustive-deps / set-state-in-effect |
| `scripts/content/asset-rules.mjs` | 2 | no-control-regex |
| `src/i18n/index.tsx` | 2 | only-export-components |
| `src/components/BankManager.tsx` | 2 | only-export-components |
| `scripts/ast/ui-contract-ast.mjs` | 2 | unused-vars |
| `src/core/content/model/content.ts` | 2 | unused-vars |
| 其余 16 个文件 | 各 1 | 分散 |

> 观察：**`tests/` 与 `scripts/` 合计占大头**（约 60%），`src/` 只占约 18 条。
> 意味着这批卫生债**主要是工具/测试代码的历史欠账**，对产品运行时行为影响小 ——
> 这也支持"C 步与产品阶段解耦、独立推进"的判断。

---

## 2. 批次划分（每批一个 commit，批间跑全套回归）

| 批 | 内容 | 条数 | 验证 | 风险 |
|---|---|---:|---|---|
| **H1** | `no-unused-vars`(31) + `no-useless-escape`(1) + `no-irregular-whitespace`(1) —— 纯机械删除 | 33 | 全套测试 + tsc + 三个门禁 | **低**（但见下方"假清理"陷阱） |
| **H2** | `no-control-regex`(5) —— 逐个查不可见字符来源 | 5 | 同上 + 内容门禁（`content:validate`） | 低中 |
| **H3** | `no-eval`(2) —— 人工审 + 加受控说明 | 2 | 安全审读留档 | **高（最该优先看）** |
| **H4** | `exhaustive-deps`(5) + `set-state-in-effect`(3) + `purity`(2) —— 语义改动 | 10 | 全套测试 + **人工过交互路径** | 中高 |
| **H5** | `only-export-components`(3) —— 结构拆分 | 3 | 构建 + ui-contract 探针 | 中（拆文件动 import 面） |

### 2.1 H1 的"假清理"陷阱（必须写进实施要求）

`no-unused-vars` 里有**故意的未用变量**，删掉会**破坏测试语义**：

- `tests/migration-lock.mjs:84` 的 `const a = await lock.acquire('A', { leaseMs: lease, now: NOW })`
  —— 变量名是 `a`，是**并发对照样本**（判定"谁能拿到锁"靠 `exp` 与后续断言），不是笔误。
- `tests/fenced-write-browser.mjs` / `tests/browser-migration-e2e.mjs` 里的未用导入，可能是**故意留的探针**（证明某些路径不抛错）。

**实施要求**：删除前对每条问"这个绑定有没有被后面的断言间接依赖？"
能回答"确定无依赖"才删；**拿不准的走下划线前缀（`const _a`）+ 行内说明，而不是删**。
oxlint 默认对 `_` 前缀放行（`argsIgnorePattern` 类配置）—— 实测 `npm run lint` 未把这些计入 53，
说明前缀法是可用出口，**不是新增告警**。

### 2.2 顺序建议

**H3 优先于 H1** —— `no-eval` 是唯一带安全语义的一类，
即便它只有 2 条，也该在"批量删未用变量"之前看清楚。

---

## 3. 棘轮判据：让 warnings 只许降不许升

卫生工作没有棘轮就会**边清边长**。建议加一条判据，形态对齐既有先例
（`gate-perf.mjs --record-baseline` 落盘 `perf-baseline.json` / 新增 `check-bundle` 的第 6 项棘轮）：

**判据 L1 · lint warnings 只许降不许升**

| 项 | 设计 |
|---|---|
| 实现 | 新增 `scripts/gate-lint.mjs`：调 oxlint 的 JSON 输出，解析 `diagnostics[]` 总数 |
| 基线 | `docs/p18/_generated/_baselines/lint-warnings.json`（`{ total: N, byRule: {...} }`），由 `--record-baseline` 写入并随仓库提交 |
| 判定 | `total ≤ baseline.total` ⇒ PASS；`total > baseline.total` ⇒ **FAIL**；基线缺失 ⇒ **UNKNOWN** |
| 分规则棘轮 | 逐规则同样只许降（比总数棘轮更严 —— 总数可能因规则迁移而假性持平） |
| 证伪 | 本波**不实施**，但实施时必须自带两条注入：① 往某文件塞一个未用变量 ⇒ 判据必须 FAIL；② 删掉基线文件 ⇒ 必须 UNKNOWN（不是悄悄放行） |
| 挂哪 | 加进 `verify-release-gate.mjs` 之前先独立跑；**不进 P18 闭合的 43 项**（它是 C 步新门） |

> 与既有门的边界：这条判据**不改动** `npm run lint` 的行为（仍 EXIT=0），
> 只在外面包一层基线比对 —— 避免"为了让门绿去关规则"这种反向激励。

---

## 4. 9.6 / 9.7 两项遗留（本阶段一并收）

| # | 项 | 方案 |
|---|---|---|
| 9.6 | `gate:todo` 按行号登记 | 行号是**会漂的地址**，判据不该依赖它。改**内容锚点**形态：`scripts/gate-todo.mjs` 判定"待办文本 + 其所在符号"存在，而不是"第 N 行"。实现：先用正则抓 `// TODO(<id>):` 的 id，再校验 id 集合 == 登记集合（与 `CONTENT_CONTRACT.md` 判据 20 "策略一致性"同构） |
| 9.7 | CI 注解 `Node.js 20 is deprecated` / `ubuntu-latest → Ubuntu 26`（2026-10-19 到期） | 升 `.github/workflows/*.yml` 的 actions 版本；**到期前（2026-10-19）必须完成**，属被动变更，登记影响范围即可。风险：action 版本升级可能改缓存路径 ⇒ 顺带确认 e2e 的 `~/.cache/ms-playwright` 命中 |

---

## 5. 阶段边界（防止 C 步又滑回 P18）

本阶段**不做**：

- 不动 `scripts/check-bundle.mjs` 判据 1–5 的语义（判据 6 属 B 步 9.2，已落地在 `P18-I`）；
- 不动 `scripts/gate-perf.mjs` 的预算常量（INV-3，只许降不许升）；
- 不动已留档证据与审查包（`docs/p18/_generated/review/**`）；
- 不把 lint 清理与产品功能改动**混进同一个 commit**（批次化就是为此）。

本阶段会碰：`tests/**`、`scripts/**`（工具与门禁脚本的机械清理）、`src/**` 的 H4/H5 语义改动、
`.github/workflows/**`、`scripts/gate-todo.mjs`、新增 `scripts/gate-lint.mjs` 与基线文件。
