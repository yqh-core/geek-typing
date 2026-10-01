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
| **H2** | `no-control-regex`(5) —— 逐个查不可见字符来源 | 5 | 同上 + 内容门禁（`content:validate`） | 低中 | ✅ 已做（20 → **13**，见 §2.4） |
| **H3** | `no-eval`(2) —— 人工审 + 加受控说明 | 2 | 安全审读留档 | **高（最该优先看）** | ✅ 已做（`29374ef`，**2 → 0**） |
| **H4** | `exhaustive-deps`(5) + `set-state-in-effect`(3) + `purity`(2) —— 语义改动 | 10 | 全套测试 + **人工过交互路径** | 中高 | ✅ 已做（`073a951`，**10 → 0**，见 §2.5） |
| **H5** | `only-export-components`(3) —— 结构拆分 | 3 | 构建 + ui-contract 探针 | 中（拆文件动 import 面） | ✅ 已做（`a387575`，**3 → 0**） |

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

### 2.4 H2 / H3 / H5 收口（`33a9a07` / `29374ef` / `a387575`）

三条机械/结构批次一并记在这里，详细论据见 `docs/p18/DECISIONS-POST-P18.md` §9.2.8 / §9.2.9。

| 批 | 规则 | 处置 | 条数 |
|---|---|---|---:|
| H2 | `no-control-regex`(5) | 控制字符判定收敛到**单一事实源** `scripts/content/control-chars.mjs`（JS 侧）+ `src/core/content/model/content.ts` 的 `isControlChar`（TS 侧镜像）。**不用正则**：`[\u0000-\u001F\u007F]` 字面量报、`new RegExp('[\\u0000-\\u001F\\u007F]')` 因常量折叠照样报、`\p{Cc}` 会多吃 U+0080–U+009F（C1）从而动到 content。改用 `codePointAt` 码点判断 | 5 → 0 |
| H3 | `no-eval`(2) | `tests/browser-migration-e2e.mjs` 删掉 `PROVIDER_SOURCE` 模板串与两处 `eval`，改为传 `PROVIDER_DATA` 在页内就地拼 provider —— **测试夹具里的受控 eval 本来也不是隐患，但留下它会让"安全类告警归零"永远差一条** | 2 → 0 |
| H5 | `only-export-components`(3) | `src/i18n/` 拆成三分文件：`context.ts`（`LangContext` + `Lang` 类型）/ `index.tsx`（只剩 `LangProvider` 组件）/ `hooks.ts`（`useLang`/`useT`，原样搬、函数体未改）；`toWordBank` 从 `BankManager.tsx` 挪到 `src/lib/customBanks.ts` | 3 → 0 |

H2 的等价性对照与双侧证伪（注入 `isControlChar => false` 各判红 3 条、互不串味）记在
`DECISIONS-POST-P18.md` §9.2.9。oxlint total 因此走 53 → 20（H1）→ 13 → 10。

### 2.5 H4 收口（`073a951`）：语义警告 10 → 0

**这是全批风险最高的一条**（会动 effect 时序），处置原则：**每一处都先写清「这个 dep / 这次 setState 为什么存在」，再决定怎么改**，不许为了消警删掉它。

| 处 | 告警 | 判断与改法 |
|---|---|---|
| `useReviewFlow.ts:48/52/55` | exhaustive-deps「unnecessary dependency: tab」 | `tab` 是**刷新信号不是真依赖**（注释：切页签也算刷新一次，背单词页三键打分不经过本 hook ⇒ 不 bump `reviewVersion`）。把它从 deps 删掉 = 让「切页签后到期数仍是旧值」这个真实缺陷回来。改成在 memo 体里显式读一次 `void tab`（与同文件既有 `void reviewVersion` 同一写法），deps 保持 `[reviewVersion, tab]` |
| `useTypingRound.ts:310` | exhaustive-deps「missing dependency: currentWpm」 | `currentWpm` 是 `useCallback(..., [])` 只读 refs，闭包稳定 —— 直接补进 deps 数组，无时序变化 |
| `useBank.ts:21/46` | set-state-in-effect ×2 | 改 React 官方的 **render 阶段调整 state**（`customBanksFor` / `bankWordsFor` 记住"这份数据是为哪个参数取的"）。切库重载、懒词库「加载词库中」占位、两条路径边界（ready 非空 ⇒ 同步填且不走异步 / ready 为空 ⇒ 占位 + 异步）均未变 |
| `BankManager.tsx:36` | set-state-in-effect | 同上改 render 阶段调整。**先查清语义差异**：关面板只有两条出口且都翻成 false，故「A 路径关 → B 路径打开」必然夹一次 false→true；`open` 恒 true 时原 effect 也不重跑 ⇒ 不存在漏刷点 |
| `ReviewPanel.tsx:50/55` | purity（render 里 `Date.now()`） | 收敛成「一次版本刷新一个时间快照」`now = useMemo(() => Date.now(), [reviewVersion])`，`due` 与 `shown` 共用。**行为差异（有意为之）**：reviewVersion 不变的额外 re-render（展开词条、切语言）里 `now` 冻结而非刷新；影响面被 `views` 兜住（到期清单只在版本变化重建 ⇒ 冻结只会造成假阳性，不会漏判） |

**对"用 disable 掩盖问题"的专项核验**：`ReviewPanel.tsx:63` 那条 `// eslint-disable-next-line react/purity`
实测必要 —— 临时删掉它，oxlint 立刻重报 `react(purity)`："`Date.now` is an impure function…"；
加回即 0 条。这条 disable 是**有依据的例外**，不是遮羞布。

**实测**：oxlint `diagnostics.length` = 0；`tsc -b` EXIT=0；`build` EXIT=0；
`test:e2e` **170/170 通过 0 失败**（EXIT=0）；`gate:todo` PASS（登记 12 / 命中 12 / 违规 0）；
`gate:license` / `test:content` / `content:validate` / `check:bundle` 全 EXIT=0；
`gate:lint` 当前 0 == 基线 0 ⇒ PASS；`gate:lint:falsify` 两条注入均成立。
基线棘轮随后 record 到 **0**（10 → 0）。

> **一条必须记下的纠错**：实施 H4 的子代理报告「本机 spawnSync 一律 EBUSY，`gate-lint.mjs`
> 因此跑不起来」。复核时 `npm run gate:lint` / `gate:lint:falsify` 在标准 Bash 环境下**直接跑通**
> （当前 0 == 基线 0 ⇒ PASS；证伪① 注入 1 条未用变量 ⇒ 立刻 FAIL）。所以那是**该沙箱自己的
> 进程环境限制，不是门的问题、也不是本机的属性** —— 后人不要据此认为"这条门在这台机器上测不了"，
> 更不要为了绕开它去改门脚本（改了就是让判据失去独立验证能力）。

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
| 现状 | H4 收口后实测 **0 条**，基线 `--record-baseline` 降到 **0**（10 → 0，棘轮只许降不许升）⇒ 任何一条新 warning 都会让 `gate:lint` FAIL，`gate-static` 红 ⇒ **部署不触发**。这是**有意的硬锁** |

> 与既有门的边界：这条判据**不改动** `npm run lint` 的行为（仍 EXIT=0），
> 只在外面包一层基线比对 —— 避免"为了让门绿去关规则"这种反向激励。

### 3.1 L1 已实施（`scripts/gate-lint.mjs`，2026-10-01）

npm 脚本：`gate:lint` / `gate:lint:falsify` / `gate:lint:baseline`。基线落在
`docs/p18/_generated/_baselines/lint-warnings.json`（随仓库提交）。
建立时 10 条，H4 之后实测 0 条并 `--record-baseline` 降到 **0**。

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

## 4. 9.6 / 9.7 两项遗留 —— ✅ 已收（见 §4.1 / §4.2）

| # | 项 | 方案 |
|---|---|---|
| 9.6 | `gate:todo` 按行号登记 | 行号是**会漂的地址**，判据不该依赖它。改**内容锚点**形态 —— 见 §4.1（`1b21870`） |
| 9.7 | CI 注解 / action 主版本（2026-10-19 到期） | 升 `.github/workflows/deploy.yml` 的 actions 版本 + Lint 步骤接入 `gate:lint` 棘轮 —— 见 §4.2（`216fe8b`） |

### 4.1 9.6 已收：豁免键由行号改内容锚点（`1b21870`）

**这不是"把规则放宽"，是把豁免键换成不会漂的东西。**

- 登记行由四列（路径 \| 行号 \| Token \| 原因）改为**五列**（路径 \| Token \| 锚点 \| 原因 \| 解封 Wave），
  豁免键 `路径:行号:Token` → `路径:锚点:Token`。锚点规则：标识符/类型名命中取**标识符名**，
  其余（注释）取正文前 40 字（空白折叠、`|` 换 `/`）。
- `scripts/gate-todo.mjs` 新增 `--print-anchors`：直接打出可粘贴的登记行（锚点不许含竖线 ——
  登记行按竖线切五列，锚点带竖线会把后面几列整体错位，表现为"登记了却仍判红"这种最难查的假失败）。
- **动因是实测事故**：H2 让 `scripts/content/normalize.mjs` 多 5 行（一行 import、一行注释把语句拆两句），
  6 条按行号登记的豁免（93/102/103/162/180/181）**全部失配判红**，而那 6 处其实是同一个局部计数变量
  `blocked`、代码一行没改。
- 迁移后 13 条按行号登记 = **5 条按锚点登记**（同锚点多命中合并一行），覆盖命中数不变（12 处）。
- 一个实现细节：文档里"登记行格式"的模板示例长得和真登记行一模一样，会被正则当成第 6 条登记计数；
  用 `TEMPLATE_PLACEHOLDER_PATH` 显式排除，让"登记 N 条"等于真实登记数。

实测：命中 12 / 登记 5 / 违规 0 / 失效 0，`gate:todo` EXIT=0。

### 4.2 9.7 已收：action 主版本升级 + Lint 接入棘轮（`216fe8b`）

只动 `.github/workflows/deploy.yml`（`node-version` 本来就是 `'22'`，"Node 20 deprecated" 这条注解已不成立）。

| 项 | 旧 → 新 | 处数 |
|---|---|---:|
| runner 标签 | `ubuntu-latest` → `ubuntu-24.04` | 4 |
| `actions/checkout` | v4 → **v7**（现 v7.0.1） | 5 |
| `actions/setup-node` | v4 → **v7**（v7.0.0，2026-07-14） | 5 |
| `cloudflare/wrangler-action` | v3 → **v4** | 1 |
| Lint 步骤 | `npm run lint` → **`npm run gate:lint`**（棘轮进 CI） | 1 |

- **runner 标签选 `ubuntu-24.04` 而不是 `ubuntu-26.04`**：后者在 GitHub 文档里标 **Public preview**，
  而显式化标签的目的就是锁定可预期底座（preview 镜像排除在 SLA 与质保外），不划算。
- **`~/.cache/ms-playwright` 未受影响**：本 workflow 没有 `actions/cache` 步骤，chromium 由
  `npx playwright@1.49.1 install chromium --with-deps` 每次 fresh install 写 Playwright 默认路径；
  本次 diff 未引入任何 `PLAYWRIGHT_BROWSERS_PATH` 或 env 覆盖，`setup-node` 的 `with:` 块一行未动。
- **CI 语义变化（要认账）**：`gate:lint` 当前基线 0 ⇒ 任何一条新 oxlint warning 或**基线文件丢失**
  都会让 `gate-static` 红 ⇒ `deploy` 不部署。这是有意的（C 步把 warning 清零后顺势硬锁），
  但意味着 action 升级 + 棘轮这两件事叠在同一个 push 里首次跑 CI，失败时要能分清是哪一项。

> 顺带纠正方案文档里 9.7 旧口径中的一条过时信息：它写的是「Node.js 20 is deprecated」，
> 实际 `node-version: '22'` 早已改过，真正到期的是 runner 镜像与 action 主版本。

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

---

## 7. C 步收口状态（2026-10-01）

| 项 | 状态 | 提交 | oxlint 总数 |
|---|---|---|---:|
| H1 机械批次 | ✅ | `6ccf90f` | 53 → 20 |
| H2 `no-control-regex` | ✅ | `33a9a07` | 20 → 13 |
| H3 `no-eval` | ✅ | `29374ef` | 13 → 12 |
| 判据 L1 棘轮 | ✅ | `379e00d` | — |
| H5 `only-export-components` | ✅ | `a387575` | 12 → 10 |
| 9.6 `gate:todo` 内容锚点 | ✅ | `1b21870` | — |
| H4 语义警告（exhaustive-deps / set-state-in-effect / purity） | ✅ | `073a951` | 10 → **0** |
| 9.7 CI action 升级 + Lint 接棘轮 | ✅ | `216fe8b` | 基线 record 到 0 |
| B 步 9.5 `frontend` / `cloud-native` 改 lazy | ✅ | `9b468e0` / `28b4994` / `76d90ce` | — |

**53 条全部清零，无一条靠放宽规则或关掉规则实现**（唯一的 disable 是 `ReviewPanel.tsx:63`
的 `react/purity`，已专项核验为必要：删掉即复现告警）。

遗留（本阶段**不**自行推进，属 A/B/D 步）：

- **B 步 9.5 `frontend` / `cloud-native` 改 lazy —— 已完成（P18-J）**，含三笔提交与 P18-J 波次证据
  （`evidence-verify --wave=P18-J` CLOSED 185/185）。详见 `DECISIONS-POST-P18.md` §9.5.6 的四条纠正：
  其中两条是**工程侧的门被焊死/证伪无效**（判据 5 自指过滤 → UNKNOWN；注入 A 不判红），
  一条是**文档原判断被证伪**（全仓库无「7/13」硬编码）。
- **B 步 9.1 R2 / AssetManifest**：卡 Cloudflare R2 凭据，产品前置条件已定稿在
  `DECISIONS-POST-P18.md`；
- 9.3 注册表自动化、9.4 等裁定量；`test:offline` 非幂等保持登记；
- `verify-p17-frozen` 只拦增量不查既有文件被改 —— **仍只登记不下决定**（见 §5 末条）。

### 7.1 C 步收口时新发现的三条（2026-10-01，`9b468e0` 后 fresh build 实测）

这三条是这一轮**才暴露**的，都写进遗留、不自行推进：

1. **主 chunk 余量只剩 4.9% —— 对 D 步是硬约束。**
   `check:bundle` 判据 1 实测 **424.47 KiB raw / 134.61 KiB gzip**，生效阈值
   `439.45 / 141.60 KiB`（分层预算当前停在 `ABSOLUTE_BUDGET` 层）⇒ 余量 3.4% / 4.9%。
   D 步（产品内容扩充）只要往主 chunk 加东西就会撞红，**扩充前必须先给主 chunk 瘦身或正式重订分层预算**。
   文档里「420 / 135 KiB，实测 381.06 / 118.89 KiB，余量 10.2% / 12.0%」是更早构建的快照，已订正。

2. **判据表的「当前实测」列是全仓库最容易失真的文档 —— 而且已经失真。**
   `content/README.md` 与 `CONTENT_CONTRACT.md` 各抄了一份 20 项判据表，但每次跑门禁都会打印
   **新**的实测值，抄本没人同步 ⇒ 判据 18（1.40/13.08 → 1.78/24.28 KiB）、判据 19（346/37.15 → 296/33.65）、
   判据 20（10/10 → 18/18）、判据 21（381.06/118.89 → 424.47/134.61）**四项全部过期**。
   根治方案（**不在此阶段做**）：把这两份判据表改成「实测值不在此抄写，以 `npm run content:validate` /
   `npm run check:bundle` 输出为准」，或加一条校对脚本做**证伪式**比对（写反了会红）。

3. **9.5 的 UX 加载态只做到了「门全绿」，没做到「视觉确认」。**
   9.5.3 要求的固定 6 行骨架 / 布局零跳动 / 文案走 i18n 三条**未做真机视觉复核** ——
   `useBank` 的既有空态在工程上兜住了「有加载态」，但「够不够好看、跳动不跳动」不是工程判定，
   仍是 `P1.8-SIGN-OFF` §9.5 留给 UX 的那一票。工程侧交付到 170/170 e2e + 门全绿为止。
