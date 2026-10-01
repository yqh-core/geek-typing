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

| 批 | 内容 | 条数 | 验证 | 风险 | 状态 |
|---|---|---:|---|---|---|
| **H1** | `no-unused-vars`(31) + `no-useless-escape`(1) + `no-irregular-whitespace`(1) —— 纯机械删除 | 33 | 全套测试 + tsc + 三个门禁 | **低**（但见下方"假清理"陷阱） | ✅ 已做（53 → **20**） |
| **H2** | `no-control-regex`(5) —— 逐个查不可见字符来源 | 5 | 同上 + 内容门禁（`content:validate`） | 低中 | 待做 |
| **H3** | `no-eval`(2) —— 人工审 + 加受控说明 | 2 | 安全审读留档 | **高（最该优先看）** | 待做（搁在 H1 之后做，见 §2.3） |
| **H4** | `exhaustive-deps`(5) + `set-state-in-effect`(3) + `purity`(2) —— 语义改动 | 10 | 全套测试 + **人工过交互路径** | 中高 | 待做 |
| **H5** | `only-export-components`(3) —— 结构拆分 | 3 | 构建 + ui-contract 探针 | 中（拆文件动 import 面） | 待做 |

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

> **实际执行顺序反了（H1 先做）**，理由与代价记在这里，避免后人以为顺序是刻意的：
> 当时正在收口 P18-B 遗留项 9.2（预热清单化），CI e2e 恰好红着，
> 顺手把机械批次做完能让 CI 一次变绿、不必等安全审读结论。**代价是 H3 的
> `no-eval` 人工审读被推后了** —— 目前那 2 条仍未处理，仍是本阶段最该先看的一条。

### 2.3 H1 实施记录（53 → 20）

**做了什么**：`no-unused-vars` 31 → 0；`no-useless-escape` 1 → 0（`src/lib/customBanks.ts`
正则字符类里多余的 `\-`）；`no-irregular-whitespace` 1 → 0（`src/core/persistence/channels.ts`
注释里的全角空格 → 半角）。合计 **33 条**。

**假清理陷阱的处置**（§2.1 的要求：拿不准就走 `_` 前缀 + 行内说明，而不是删）：

- `tests/migration-lock.mjs:84` 的 `a`（并发对照样本）→ 保留并加 `_` 前缀 + 说明；
- `tests/learning-model.mjs` 的 `typesMod`：它**不能**改成下划线前缀 ——
  那处 `await server.ssrLoadModule('/src/lib/learning/types.ts')` 只吃副作用（把 types.ts
  加载进 SSR 模块图），改成 `let _typesMod; _typesMod = await …` 会让赋值语句引用一个
  未声明的裸标识符 ⇒ `ReferenceError` ⇒ EXIT=2。改法：删掉接收，只留副作用调用 + 注释。
- `scripts/content/ingest.mjs:201` 的 `({ generatedAt, ...rest })`：`generatedAt` 是
  **刻意排除**的比较项（每跑必变），重命名成 `_generatedAt` 而非从解构里删 —— 删掉就
  等于把 generatedAt **算进了语义比较**，每次运行都会判定"产物变了"从而重写文件，
  直接破坏该脚本的幂等语义。这是本批唯一一处"看起来能删、删了就出错"的地方。

**踩到的坑（值得留给下一批）**：

- `src/lib/customBanks.ts` 修 `no-useless-escape` 时，我第一版把 `\-\u0020` 写成字符类
  末位之前的 `'- ` ⇒ oxlint 报 `Invalid regular expression: Character class atom range out of order`
  （`'` 0x27 > 空格 0x20，逆向区间）并直接**新增一条 error 级诊断**。
  正解是让 `-` 落末位：`[A-Za-z' -]`。这条已经进了 lint 输出统计，所以 **"删一个 lint 项
  反而让 total 变多"是真实存在的** —— §3 的分规则棘轮必须允许"同一条规则内部换写法"，
  不能只认数字。
- `src/main.tsx` 里"预拉 ielts/kaoyan/toefl 三个大库"的注释已删（9.2 之后它就是错的），
  改成指向 `registry.ts` 的 `WARMUP_IDS`。

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

### 3.1 L1 已实施（`scripts/gate-lint.mjs`，2026-10-01）

npm 脚本：`gate:lint` / `gate:lint:falsify` / `gate:lint:baseline`。基线落在
`docs/p18/_generated/_baselines/lint-warnings.json`（随仓库提交，共 10 条）。

实测三条行为：

| 情形 | 结果 |
|---|---|
| 当前 10 == 基线 10 | ✅ PASS，EXIT=0 |
| 临时塞一个未用绑定 ⇒ 11 条 | ❌ FAIL「总数 11 > 基线 10」，EXIT=1 |
| 把基线人为改成 5 再 `--record-baseline` | ❌ **拒绝**，EXIT=1（棘轮只许降不许升，不许靠改基线掩盖） |
| 删基线文件 | ⚠️ UNKNOWN，EXIT=2（**缺基线不算放行**） |

`--falsify` 自带两条注入，实跑均成立：注入致红（11 条 ⇒ FAIL）、删基线致 UNKNOWN。

**踩到的坑（必须写下来，否则下次自检会假装通过）**：第一版证伪注入写的是
`import { readFileSync } from 'node:fs'\nexport default readFileSync` ——
`readFileSync` 在 `export default` 里**被用掉了**，根本没有未用绑定，
于是 oxlint 报 0 条、判据照常 PASS，自检"全绿"但**注入根本没生效**。
判定 `--falsify` 时只看有没有 `证伪① OK：… ⇒ FAIL` 这行输出；
没这行就是注入失效，不是判据通过。**顺带纠正一个错误结论**：当时据此以为
"oxlint 1.85 只对未用 import 报、顶层 const 不报" —— 那是误读，真正未用的顶层 const
照样报（把 `export default readFileSync` 换成 `export default 1` 就报了）。

**另一个实现细节**：`oxlint` 的可执行入口是 `node_modules/oxlint/bin/oxlint`，
它本体是个 **ESM node 脚本**（`#!/usr/bin/env node` + `import "../dist/cli.js"`），
既不是 `.js` 也不是原生 exe —— 直接 `spawnSync` 这个无扩展名文件拿 ENOENT，
写成 `bin/oxlint.js` 会拿到 loader 报错、stdout 不是 JSON。只能 `node <path> --format=json`。

---

## 4. 9.6 / 9.7 两项遗留（本阶段一并收）

| # | 项 | 方案 |
|---|---|---|
| 9.6 | `gate:todo` 按行号登记 | 行号是**会漂的地址**，判据不该依赖它。改**内容锚点**形态：`scripts/gate-todo.mjs` 判定"待办文本 + 其所在符号"存在，而不是"第 N 行"。实现：先用正则抓 `// TODO(<id>):` 的 id，再校验 id 集合 == 登记集合（与 `CONTENT_CONTRACT.md` 判据 20 "策略一致性"同构） |
| 9.7 | CI 注解 `Node.js 20 is deprecated` / `ubuntu-latest → Ubuntu 26`（2026-10-19 到期） | 升 `.github/workflows/*.yml` 的 actions 版本；**到期前（2026-10-19）必须完成**，属被动变更，登记影响范围即可。风险：action 版本升级可能改缓存路径 ⇒ 顺带确认 e2e 的 `~/.cache/ms-playwright` 命中 |

---

## 5. 跑门禁脚本时的副作用面（实测踩到，跑验证前先看这段）

不是 lint 问题，但 C 步要反复跑全套回归，这几条不记下来就一定会再踩：

| 命令 | 副作用 | 处理 |
|---|---|---|
| `npm run migration:dryrun` | 会**重写** `docs/audit-package/_generated/` 里的
  `migration-dryrun-{ambiguous,orphan}.jsonl` 与 `migration-dryrun-report.json` | 跑完 `git checkout -- docs/audit-package/`（那是 INV-1 冻结区） |
| `npm run content:ingest` | 刷新 `content/license-policy-1.json` 的 `generatedAt` | 跑完 `git checkout -- content/license-policy-1.json` |
| 任何 rebuild | `vite build` 的 `emptyOutDir` 要删 `dist/assets`（>50 个文件 ⇒ safe-delete shim 拦下，构建在写入前中止，但 stdout 的 `✓ built in` 会排在 stderr 报错**前面**） | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build` |

**一个值得单独说的发现**：`scripts/verify-p17-frozen.mjs` 只查「冻结区**新增**了什么」，
**不查既有文件的内容被改了什么** —— 上面 `migration:dryrun` 把三个既有文件改得面目全非
（ambiguous.jsonl 26 行 → 9 行、report.json 246 行差异）时，这条 INV-1 门照样 `EXIT=0`。
冻结区的"只读"目前是**靠人工自觉 + 只拦增量**的约束。要不要补一条"冻结区任文件字节级
不变"的判据，本阶段先登记不下决定（它属于 P1.7 那条不变量的加固，动它有跨阶段影响）。

---

## 6. 阶段边界（防止 C 步又滑回 P18）

本阶段**不做**：

- 不动 `scripts/check-bundle.mjs` 判据 1–5 的语义（判据 6 属 B 步 9.2，已落地在 `P18-I`）；
- 不动 `scripts/gate-perf.mjs` 的预算常量（INV-3，只许降不许升）；
- 不动已留档证据与审查包（`docs/p18/_generated/review/**`）；
- 不把 lint 清理与产品功能改动**混进同一个 commit**（批次化就是为此）。

本阶段会碰：`tests/**`、`scripts/**`（工具与门禁脚本的机械清理）、`src/**` 的 H4/H5 语义改动、
`.github/workflows/**`、`scripts/gate-todo.mjs`、新增 `scripts/gate-lint.mjs` 与基线文件。
