# P18-D · UI 内容契约棘轮门（INV-2）—— CI 证据索引

> 口径与 P1.7 / P18-0 / P18-A / P18-B / P18-C 一致：**CI run 记录的是「该 Wave 证据提交」那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（「文档不能引用包含自身的 CI run」约定）。
> 上一波索引：`../P18-C/_CI-INDEX.md`。

## 运行记录

| 项 | 值 |
|---|---|
| Wave | P18-D（UI 内容契约棘轮门 · INV-2） |
| 被验证的提交（headSha） | `f364573d9f1a2c0e6eff8b17a14d8577534913a6` |
| 说明 | `evidence(P18-D): UI 内容契约棘轮门证据 —— 20/20 PASS，链路 CLOSED 161/161` |
| RunId | `36734600260` |
| event | push（main） |
| conclusion | **success** |
| 前置实现提交 | `fd811b1af36846ec3464921c7dd33e437fc91cbe`（`chore(p18-d)` 接线；证据矩阵 `matrix.commit` 即此值） |
| 墙钟 | 208s（`15:09:43Z` → `15:13:11Z`） |

### 四个 job

| job | conclusion | 区间（UTC） | 耗时 |
|---|---|---|---|
| 门禁① 静态与内容（无产物） | success | `15:09:48` → `15:10:05` | 17s |
| 门禁② 构建产物（体积 + 离线） | success | `15:09:46` → `15:10:44` | 58s |
| 门禁③ 端到端（test:e2e） | success | `15:09:46` → `15:12:28` | 162s |
| 部署到 Cloudflare Pages | success | `15:12:30` → `15:13:10` | 40s |

产物：`run-36734600260-jobs.json`。

> **本 Wave 首次把 `test:ui-contract` 挂进 CI**（`.github/workflows/deploy.yml` 门禁① 第 8 步
> `UI 内容契约棘轮门（test:ui-contract · INV-2）`，`run: npm run test:ui-contract`，实测 success）。
> 因此 INV-2 从此**不是只在本地跑过**：任何人把「UI 直读词表 JSON」「内容包 id 分支」「绕过门面直引
> `core/content/**`」写回 `src/`，push 就会在门禁① 被拦下。
>
> ⚠️ **`test:ui-contract:falsify` 刻意不进 CI**。它做的是故障注入演练（证明门能判红），
> 属**证据任务**而非每次构建的门 —— 已登记在 P18 证据任务表（`FALSIFY-UI-CONTRACT`），
> 由 `npm run test:ui-contract:falsify` 本地/证据链复核。

## 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-DESIGN-RULINGS-v1.0.md §⑧（P18-D UI 内容契约门：作废旧基线 → 六桶判据 → 基线落点 → 灰区裁定）
        ↓
0b1b292  docs(p18-d)   裁定 §⑧：作废 §12.6 旧基线、定六桶 + 三条 AST 反例、灰区裁定（wordResolve.ts 纳入扫描）
8b71180  fix(p18-d)    收敛 App.tsx:35 深路径 import 到 './core/content' + 修 gate:legacy-wordbank 带 g 正则 lastIndex 假阴性
64fc10a  feat(p18-d)   UI 内容契约棘轮门：AST 判据核心 + 六桶棘轮 + 9 个对照组探针 + 三层自证伪
fd811b1  chore(p18-d)  接线：npm script / 证据任务表（18→20 条）/ CI 静态闸 / 架构汇总门（10/10）/ release-gate 合同 P18-G2 翻 PASS
        ↓
node scripts/evidence-run.mjs --wave=P18-D     → 20/20 PASS（matrix.commit == fd811b1）
node scripts/evidence-verify.mjs --wave=P18-D  → Evidence Chain: CLOSED（161/161 = 20×8+1）
        ↓
f364573  evidence(P18-D)  证据落盘（R01）
        ↓
CI run 36734600260        四 job 全 success（含部署）
        ↓
本索引                    CI 证据留档
```

新增的 2 个 P18 证据任务（其余 18 条为系列通用回归）：

| 任务 | 结果 |
|---|---|
| `P18-D-TEST-UI-CONTRACT` | **19/19 PASS** —— 硬零 2/2、棘轮 4/4、探针 9 个逐一对上 |
| `P18-D-FALSIFY-UI-CONTRACT` | **20/20 恰好判红**（决策层 + 输入 fail-closed + 探测器层三层；含 2 条对照组） |

## 本 Wave 的判据与实测数字

### 六桶（UI 内容契约）

| 桶 | 性质 | 基线 | 含义 |
|---|---|---|---|
| `tableJsonImports` | **硬零** | **0** | UI 不得直读 `words.json` / `items.json` |
| `packageBranches` | **硬零** | **0** | UI 不得按内容包 id 写分支 |
| `wordTableSources` | 棘轮（只许降） | **13** | UI 里「词表来源点」（`X.words` 形态） |
| `handleReads` | 棘轮 | **11** | 词表句柄的读操作数 |
| `bannedArrayOps` | 棘轮 | **11** | `WordItem[]` 上的禁用算子（`filter`/`sort`/`map` 链等） |
| `bypassFacadeImports` | 棘轮 | **2** | 绕过 `./core/content` 门面直引深路径（本轮由 **3 降为 2**） |

- 扫描域：`UI_SCOPE_RE` = `src/App.tsx` + `src/main.tsx` + `src/components/**` + `src/hooks/**`，
  另**显式追加** `src/lib/wordResolve.ts`（§⑧-4 灰区裁定：它是 UI 侧词表读取路径，纳入扫描）。
  实测 **26 个文件**。
- 基线落点：`docs/p18/_generated/ui-contract-baseline.json`（**单一事实源**，门只读它；更新需显式开关）。
- 内容包 id 清单（**18 个**）从 `content/` 目录名派生，不手写副本。
- 对照组探针 **9 个**：6 个期望非零 + **3 个期望全零**（`p7` 类型导入负例 / `p8` 假阳守卫 / `_support` 放行样本）
  —— **双向钳制**：缺任一侧都会让「恒放行」或「恒判红」的实现蒙过去。

### 三条 AST 反例驱动的「必须用 AST，不能用正则」

§⑧ 记录的实测反例（正则方案会产生假阳/假阴），本轮由 `scripts/ast/ui-contract-ast.mjs`（`ts-morph` + TypeChecker）兑现：

1. `import type { WordItem } from '.../wordBanks'` —— 纯类型导入**不产生运行时耦合**，正则会把 `import` 一律计入；
2. `const table = bank.words` 与 `const n = bankWords.length` —— 前者是「来源点」、后者是「读操作」，
   正则无法区分「取得句柄」与「读句柄」；
3. 同名局部变量遮蔽 `bank` —— 正则按名匹配会误伤，TypeChecker 解析到真实声明才能判定。

### 体积与既有门（确认**未受影响**）

| 项 | 实测 | 口径 |
|---|---|---|
| 主 chunk `index-VHayP_Hy.js` | **434433 B / 424.25 KiB / gzip 134.21 KiB** | **逐字节未变**（P18-D 只动 UI 取数路径与脚本，不动内容数据） |
| `check:bundle` | **5 项全 PASS** | 判据 5 覆盖 registry 全部 **11 个** lazy 包，探测串命中 0 次 |
| `gate:architecture` | **10 项：通过 10，失败 0，未接入 0** | ui-contract 由 `FUTURE_GATES` PENDING → **真实子门** |
| `gate:legacy-wordbank` | 2/2 PASS（**12 导入点**） | 修 `lastIndex` 假阴性后补 `useSettings.ts` 白名单（11→12） |
| `verify:p17-frozen` | EXIT=0 / **155 文件 0 不符** | INV-1 冻结区零改动 |
| `tests/content-query.mjs` | **163/163** | |
| `content:validate` | 18 包 PASS | |
| `release:gate` | **42 PASS / 0 FAIL / 1 PENDING** | 仅剩 `P18-G4`（→ P18-F）；`P18-G2` 已由 PENDING 翻 PASS |

## 本 Wave 暴露并修掉的真问题

1. **`gate:legacy-wordbank` 的假阴性：带 `g` 的正则复用 `lastIndex`**（本轮实测捕获）。
   `scripts/gate-legacy-wordbank.mjs:68-72` 对每个文件复用同一个带 `g` 的 `RegExp` 实例做 `.test()` ——
   `lastIndex` 在跨文件调用间**不复位**，导致真实导入点数 **12** 被报成 **11**（漏掉 `src/hooks/useSettings.ts`）。
   这类缺陷的特征是「**报少了**、且结果依赖文件遍历顺序」：同一棵树多跑一次可能给出另一个数。
   修法：`new RegExp` 每文件重建（不用 `g` 也能只判一次存在，但重建是更彻底的口径）。
2. **`'./core/content/catalog'` 这个目标的写法定不下来**（侦察阶段实测推翻）。
   §⑧-6 原打算把 `App.tsx:35` 收敛到比 barrel 更精确的子路径，但 `src/core/content/catalog/`
   下只有 `catalog.ts`、**没有 `index.ts`**，TS(`moduleResolution: bundler`) 与 Vite **双路 UNRESOLVED**。
   最终目标写法定为 `'./core/content'`（门面 barrel）—— 也是 `bypassFacadeImports` 由 3 降为 2 的原因。
3. **CI 步骤文案与脚本实际判据数**漂移（**本轮新发现，见下节**）。
4. **本索引自身的一处数字错误（已修正，留痕）**：初稿把主 chunk 的 gzip 写成 `136771 B`，
   与 `docs/p18/_generated/evidence/P18-D/P18-D-CHECK-BUNDLE-*.txt` 的原文
   `424.25 KiB raw / 134.21 KiB gzip` 不符（`134.21 KiB = 137431 B`）。raw 数（`434433 B`）是对的。
   已在本行改正（随 P18-E 的文档提交一并修正）。记录在此是因为**它本身就是本波教训的实例**：
   索引/文档里重述的数字会漂，**只有从证据原文抄、或干脆不重述**才安全（同 §「CI 步骤文案漂移」的处置理由）。

## CI 步骤文案漂移（本轮发现 → 下一提交修复）

P18-D 的 CI 步名口径复核时发现 `.github/workflows/deploy.yml` 里**三处**注释与步名
与被测脚本的实际值不一致，且**没有任何门禁守护这些文案**（全仓 grep：无脚本读 `deploy.yml`）：

| 位置 | 文案写的 | 实测真值 | 判定依据 |
|---|---|---|---|
| `deploy.yml:52-53` | `test:content · 149 项` | **163 项** | `node tests/content-query.mjs` → `共 163 项，通过 163，失败 0`（亦见本 Wave `TEST-CONTENT-QUERY` 证据） |
| `deploy.yml:84-86` | `check:bundle · 3 项` + 只列判据 1/2/3 | **5 项** | `node scripts/check-bundle.mjs` → `PASS：5 项全部通过`；判据 4/5 由 P18-C 新增，步名未跟上 |
| `deploy.yml:84-85` | `主 chunk raw ≤420KiB / gzip ≤135KiB` | 预算来自 `gate-perf.mjs` 预算表 effective（本 Wave 实测门限 raw 439.45 / gzip 141.60 KiB） | `check-bundle.mjs` 头部注释已明写「历史硬编码值 430,080 B / 138,240 B 已废弃」 |

同为步名的 `content:validate · 21 项`（脚本头部 1..21 ✓）与 `test:offline · 20 项`
（`tests/_evidence/offline-audit-result.json` → `results.len == 20` ✓）本轮实测**是对的**。

**处置取向（沿用裁定「凡是『必须同步』的地方都尽量不要靠注释」）**：
**不**只是把数字改对（下次还会漂），而是**把易漂的计数从步名里删掉**，
只在注释里留一句指向单一事实源（`# 判据清单与阈值 = scripts/check-bundle.mjs 头部`），
四个步名统一同样口径 —— 让「文案与实现一致」这件事**结构上不需要维持**。

## ⚠️ 遗留风险与移交

- **`bypassFacadeImports = 2` 仍未清零**。棘轮只保证「不再涨」，剩下的 2 个深路径直引
  （`src/lib/wordResolve.ts` 直引 `content-query.ts`、以及 1 处未收敛点）**在收口期刻意不动**——
  它们是被 `UI_EXTRA_FILES` 显式纳入扫描的已知项，收敛属于 UI 侧重构，不属本 Wave 变更面。
- **棘轮基线是「现状」而非「目标」**：4 个棘轮桶当前值本身偏高（`wordTableSources=13` /
  `handleReads=11` / `bannedArrayOps=11`）。门的作用是**冻结现状、防止恶化**，
  **不等于**这些数字已被接受。真要下降需要 UI 侧改走 Query 层，是独立议题。
- **`release:gate` 仍为 1 PENDING**：`P18-G4`（INV-4 资产实体化）→ P18-F。
  `RELEASE-GATE` 仍**不入** P18 证据表（触发条件：P18-F 后 PENDING 清零）。
- **CI 注解 `Node.js 20 is deprecated`** 仍在（`actions/checkout@v4` / `actions/setup-node@v4`
  / `cloudflare/wrangler-action@v3` 被强制跑在 Node 24）；另新增一条 runner 公告
  `ubuntu-latest will migrate to Ubuntu 26 beginning October 19, 2026`。两者均为低优先项，与 P18-C 移交时一致。
- **`evidence-run.mjs:302` 的 `gitCommit()` 死函数**仍未动（裁定：收口期控制变更面）。

## 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在整个 P18-D 期间**零改动**：`verify:p17-frozen` 在
  实现提交后与本波证据里均实测 EXIT=0 / 155 文件 0 不符 —— 且它本身就是 P18 证据表的第 4 条任务。
- P18-D 的证据根落 `docs/p18/_generated/evidence/P18-D/`，**不写冻结区**（INV-1 结构性地成立）。
- `scripts/gate-architecture.mjs` 的 `ui-contract` 由 `FUTURE_GATES`（P1.8-D）就地转真实子门 ——
  这是「**预先登记计划内门、脚本一落地就自动转为拦截门**」这一机制的第二次生效
  （第一次是 P18-B 的 `license`）。汇总门 10/10，未接入 0。
