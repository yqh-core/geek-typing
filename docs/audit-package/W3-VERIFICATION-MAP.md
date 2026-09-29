# W3 验证内容对照图（Verification Content Map）

> 用途：把已 CLOSED 的 W3 证据链（matrix commit `743240a`，verify **185/185**）
> 与 **实际验证了什么业务行为** 一一对应，供逐条审计。本文是审计索引，不是新证据；
> 原始输出见 `docs/audit-package/_generated/evidence/W3/` 下 46 份 artifact（含失败轮留档，见 §3.4）。
>
> 本轮范围：**Wave 3 Architecture** —— A-3 AST 边界门禁三阶段 + A-4 汇总门 + A-5 不变量文档 + §14 待办标记门。

## 0. 统计口径（三个数字的关系，审计前先读）

| 数字 | 统计层级 | 含义 |
|------|----------|------|
| **185/185** | Evidence Chain 链路层 | 23 个 Evidence 任务 × 每任务 8 项链检查 + 1 项 orphan 检查 = **23 × 8 + 1 = 185** |
| **640** | 测试断言层 | 16 个「带计数」任务内部展开的断言总数：`640 = 633 + 7`（gate-architecture 的 7 个子项） |
| **16** | 待办标记命中 | `gate-todo` 扫 `src/ scripts/ tests/` 153 个文件的命中数，**已 100% 登记**（0 违规） |

**633 的构成（机器统计，非心算）**：

```
TEST-CONTENT-QUERY   163   TEST-E2E                    169   TEST-LEARNING-STORAGE     78
TEST-PERSISTENCE-BOUNDARY 53   TEST-MIGRATION-GUARDS    27   TEST-BOUNDARY-AST         20
TEST-LEARNING-BOUNDARY-WIRING 28  TEST-ANALYTICS-IDENTITY 17  DUAL-RUN-BOUNDARY        16
TEST-LEARNING-SERVICE 15   GATE-G4                      18   TEST-LEARNING-INSIGHTS    12
DRYRUN-REAL           10   GATE-LEARNING-BOUNDARY        4   GATE-LEGACY-WORDBANK       2
GATE-PRACTICE-ENGINE   1
------------------------------------------------------------------ 合计 633
+ GATE-ARCHITECTURE 7（5 已接入 + 2 未接入）= 640
```

`AUDIT-LEARNING-R5` 为报告式审计（无断言计数，EXIT=0），`GATE-PERSISTENCE` 1 项（格式不含「共 N 项」行，单列），`GATE-TODO` 为登记式（16 命中 / 0 违规）—— 三者均不计入 640。

## 1. 二十三项 Evidence 任务各自证明什么

| Task | 证明内容 | 证明力边界 |
|------|----------|-----------|
| TSC / LINT | ts-morph 28.0.0 引入后类型与静态检查仍绿 | 编译期 / 静态 |
| **GATE-ARCHITECTURE**（新） | **A-4 一键汇总门**：5 个已接入子门（B02/G4/A03/persistence/practice-engine）全 EXIT=0，并**显式打印 2 个未接入子项**（content-contract Wave 4 / perf Wave 5） | 未接入项不计 FAIL（§3.1 披露取舍） |
| **GATE-TODO**（新） | **§14**：153 个文件扫描，16 处命中**全部登记**进 `P1.7-DEFERRED.md`，0 未登记违规 | 登记式，登记项需含原因与解封 Wave |
| GATE-LEARNING-BOUNDARY | **A-3 Phase 2 后仍 4/4** —— AST 版输出格式与判据口径未变 | — |
| GATE-PERSISTENCE / G4 / A03 / PRACTICE-ENGINE | 既有四门未因 AST 重写受影响 | — |
| **TEST-BOUNDARY-AST**（新，20 项） | **本轮核心**：探针 6 例（5 红 1 放行）+ 真实 src 违规数快照 + 耗时 ≤3s | 探针是合成夹具，不是真实违规 |
| **DUAL-RUN-BOUNDARY**（16 项） | Phase 3 后语义为「探针 6 例 + 快照不变」的回归断言（正则 oracle 已删，见 §2.3） | 不再证明两实现等价 |
| 其余 13 项（BUILD / 8 套件 / R5 / DRYRUN / E2E） | 全站零回归：真实浏览器 E2E 169、内容查询 163、learning 四套件 | 回归证明 |

## 2. A-3 三阶段：做了什么、oracle 怎么变

### 2.1 AST 覆盖清单（`scripts/ast/boundary-ast.mjs`）

| 语法形态 | 处理 |
|---|---|
| 静态 import（含副作用导入） | ImportDeclaration 模块规格匹配；副作用导入也判红（有运行时耦合） |
| `export … from` / `export {x} from` / `export * from` | ExportDeclaration 同判；`export * from` 判红 |
| **再导出链** | 递归跟随，但**只在消费者域内跟随**（跟到 `core/` `lib/` 会假阳性），深度上限 5 + visited 防环 |
| 动态 `import()` / `require()` | CallExpression 判定 |
| **常量折叠拼接路径** | 折叠 `+` 二元表达式、模板串、括号、模块级 `const` 初值；含不可判定片段**返回 null 不猜测** |
| 键族字面量（8 个 `gt.*`） | 折叠后再比对（拼接成键也躲不掉） |
| 放行 | `import type` / `export type` / 全绑定带 inline `type`；`import D, {type A}` 与 `import * as ns` 因有运行时绑定**不放行** |

### 2.2 探针 6 例（`tests/fixtures/boundary-probe/`）—— 5 红 1 放行

| 探针 | 判定 |
|---|---|
| P1 静态值导入 | 红 `static-import(analytics)` |
| P2 动态 import() + require() | 红两条（要求 kind 齐备，防「换语法蒙对」） |
| P3 学习键族字面量 | 红 3 条 `key-literal` |
| P4 **常量折叠拼接路径**（新） | 红 2 条 —— `import('./lib/' + 'analytics')` 与模板串版本。**正则版根本检测不到**，这是 AST 转正的核心收益 |
| P5 **export-from 再导出 + 链**（新） | 红 `export-from` + `export-from-chain`（含中间文件） |
| P6 type-only | **放行**（零违规）—— 非恒真对照组的另一半 |

### 2.3 Phase 3 删掉正则后，oracle 是什么

旧 oracle 是「正则版与 AST 版结果一致」，它只证明**两实现等价**。正则删了，这个维度就失去意义。接替它的是钳住两个失效方向的对照：

1. **探针 6 例（非恒真）**：恒放行的坏实现 → P1~P5 判红失败；恒判红的坏实现 → P6 放行失败。
2. **src 违规数快照（0/0/0，扫 29 个消费者文件）**：盯真实仓，任何越界导入写回消费者文件都会让数字由 0 变正并立刻判红 —— 防倒退。
3. **常量单一来源**：8 个键族、6 个禁止片段、type-only 口径全部由 `boundary-ast.mjs` 导出，测试引用同一份，不存在两份名单各改一半的漂移。

**等价性证据没丢**：`c9a4d50` 的「src 双跑 diff = 0」连同正则实现一起留在 git 历史里。

实测：`gate-learning-boundary` 墙钟 **1.87–2.23s**（要求 ≤3s），AST 判定内部约 440ms。

## 3. 必须披露的五件事

### 3.1 `gate:architecture` 把「未接入子门」判 PENDING 而非 FAIL —— 这是本轮最脆的取舍

`content-contract`（Wave 4）与 `perf`（Wave 5）脚本尚不存在。做法是：文件存在则执行并计入 FAIL；不存在则显式打印 `⏳ PENDING（未接入：<Wave> 待落地）` 并在结尾固定输出「未接入子项」行，**不计 FAIL**。

理由：尚未到期的门不应阻断当前 Wave；但**绝不静默跳过** —— 缺失必须看得见。已用合成对照组验证失败路径（临时放一个会红的子门 → 自动从 PENDING 转已接入、打印 EXIT=1 与输出尾部、总门 FAIL）。

**已知弱点（worker 主动承认，我认同）**：若 Wave 4/5 一直不落地，PENDING 会一直绿，读输出的人会脱敏。真正该补的是「PENDING 到期转 FAIL」，但仓库里没有机器可读的 Wave 进度事实，本轮未做 —— **这是遗留缺口，不是已解决**。

### 3.2 TODO Gate 的 16 条登记**全是词法误伤**，不是真实待办

首次命中 24 → 就地解决 8（都是 `gate-todo.mjs` 自己的说明性注释，已迁到 `docs/`）+ 登记 16。16 条分类：注释占位符 `xxx` ×4、`scripts/content/normalize.mjs` 计数器 `blocked` ×6、`RELEASE=BLOCKED` 状态值 ×3、`ReviewPanel.tsx` 局部变量 `todo`（语义是「待解析词列表」）×3。

**结论：当前 `src/ scripts/ tests/` 里不存在真实遗留待办标记。** 选择登记而非改代码/放宽规则：改规则（比如要求全大写才判红）会把 `const Todo` 这类真标记放掉，代价更大；登记式把「规则的代价」显式暴露成带解封 Wave 的清单。

### 3.3 我自己造成的两次事故（都已修，留痕）

1. **`3d24ea1` 意外回滚了 gate-g4 修正**：为独立复核我执行了 `git checkout f44d963 -- scripts/gate-g4.mjs`，该命令**同时更新索引**，随后 `git commit` 把索引里的旧版一起提交（该提交实际含 2 个文件）。后果：W2C 的 GATE-G4 证据（18/18）是在工作区带修正的状态跑的，而提交树里没有它。已在 `d731910` 补回并写明复盘。
2. **W3 首轮 GATE-TODO FAIL 是我写的注释造成的**：`scripts/evidence-run.mjs` 注释里出现门禁名 `GATE-TODO` 字面量 —— §14 判「注释节点必判红、字符串字面量放行」，于是自指命中。已改措辞（`743240a`），门禁名本身仍保留在 task 字符串里。

### 3.4 W3 有 23 份 orphan artifact —— 刻意不删

首次运行（含 GATE-TODO FAIL）的 23 份产物与二次运行并存。按 §15 保留失败轮留档，**不删除**；verify 的 orphan 检查为信息项（列出但不判失败），故 185/185 仍 CLOSED。

### 3.5 上线阻断项仍未解除（继承自 W2C §3.3）

`check:bundle` 未列入本轮证据（刻意），且它当前 FAIL：主 chunk 424.20 KiB > 420 KiB，CI `门禁② 构建产物` exit 1，**部署被阻断**（已在 GitHub Actions run `36606251430` 实测确认）。处置在 Wave 5 D-2 预算门。

## 4. 后续

| Wave | 动作 |
|------|------|
| **Wave 5 D-1/D-2/D-3** | 落 `bench-content.mjs` / `bench-boot.mjs` / `perf-baseline.json` / `gate-perf.mjs`，用 D-2 预算表（derived ×1.15 vs absolute 取严 + reason）**解除 §3.5 的部署阻断**；把 `check:bundle` 与 `gate:perf` 并入固定证据清单；`gate-perf` 接入 `gate:architecture` 后，§3.1 的 perf PENDING 自动消失 |
| Wave 4 | Content B-1~B-5（7 类试金石包 + ingest + provenance + contract gate）—— 会增大主 chunk，须受 D-2 预算门约束 |
| Wave 5 C | Home 组合（不新增业务计算，e2e 新增 ≤6 条） |
| Wave 6 | Evidence/CLOSED：交付包 HASH-MANIFEST + CI 三门全绿 → 部署 |

## 5. Acceptance Conclusion（W3 收口结论）

1. **A-3 三阶段完成**：Phase 1 双跑 diff=0 → Phase 2 AST 转正（4/4 不变、1.87–2.23s）→ Phase 3 正则实现删除（git 留档），oracle 换成「探针 6 例 5 红 1 放行 + src 违规数快照 0/0/0」；
2. **A-4 汇总门落地**：5 子门全绿，2 个未接入子项显式 PENDING 不静默（取舍与弱点见 §3.1）；
3. **A-5 不变量文档落地**：§19 十条 + A-5 十行清单全部吸收，每条标注现行落点，无落点的显式写明；
4. **§14 待办标记门落地**：153 文件扫描，16 命中全登记、0 违规；**仓库内不存在真实遗留待办**；
5. **Evidence Chain**：23/23 全 PASS、185/185 链检查全绿，**matrix commit == HEAD == `743240a`**；
6. **640 项断言全绿**，含真实浏览器 E2E 169 项；
7. **§3 五项已显式披露**，其中 §3.5 的部署阻断**尚未解除**，不作为 W3 的隐含证明。

**因此：W3 = CLOSED（证据链口径）；「可上线」仍 BLOCKED，阻断项唯一 = 主 chunk 体积（§3.5）。**
